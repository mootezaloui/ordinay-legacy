'use strict';

/**
 * DRAFT TOOL: genericDraft (Universal Draft Engine)
 *
 * Generic draft generation from entity context.
 * Replaces draftClientEmail, draftInvitation, draftHearingSummary.
 * Fetches structured data, builds safe prompt, calls LLM, returns artifact.
 * Output only, never persists automatically.
 */

const db = require('../../../db/connection');
const { TOOL_CATEGORIES } = require('../tool.registry');
const {
  DRAFT_TYPE,
  DRAFT_TONE,
  DRAFT_SOURCE,
  createDraft,
} = require('../../contracts/draft.contract');

const LLM_BASE_URL = process.env.LLM_BASE_URL || 'http://127.0.0.1:11434';
const LLM_MODEL = process.env.LLM_MODEL || 'qwen2.5:7b-instruct';
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || '45000', 10);

const inputSchema = {
  type: 'object',
  properties: {
    entityType: {
      type: 'string',
      enum: ['dossier', 'client', 'session', 'task'],
      description: 'Type of entity to draft for',
    },
    entityId: {
      type: 'integer',
      minimum: 1,
      description: 'ID of the entity',
    },
    draftType: {
      type: 'string',
      enum: ['CLIENT_EMAIL', 'INVITATION', 'HEARING_SUMMARY', 'INTERNAL_NOTE'],
      description: 'Type of draft to generate',
    },
    purpose: {
      type: 'string',
      description: 'Purpose of the draft (e.g., "update", "request_info", "confirm_appointment")',
    },
    audience: {
      type: 'string',
      enum: ['client', 'internal', 'court', 'general'],
      default: 'client',
      description: 'Target audience for the draft',
    },
    tone: {
      type: 'string',
      enum: ['formal', 'neutral', 'friendly'],
      default: 'formal',
      description: 'Tone of the draft',
    },
    language: {
      type: 'string',
      enum: ['en', 'fr'],
      default: 'fr',
      description: 'Language for the draft',
    },
  },
  required: ['entityType', 'entityId', 'draftType', 'purpose'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    type: { type: 'string' },
    language: { type: 'string' },
    tone: { type: 'string' },
    sections: { type: 'object' },
    metadata: { type: 'object' },
    recipient: { type: ['object', 'null'] },
    context: { type: ['object', 'null'] },
  },
  required: ['type', 'language', 'tone', 'sections', 'metadata'],
  additionalProperties: false,
};

async function fetchEntityData(entityType, entityId) {
  if (entityType === 'dossier') {
    return db.prepare(`
      SELECT
        d.id, d.reference, d.title, d.description, d.status, d.next_deadline,
        c.id as client_id, c.name as client_name, c.email as client_email
      FROM dossiers d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.id = ? AND d.deleted_at IS NULL
    `).get(entityId);
  } else if (entityType === 'client') {
    return db.prepare(`
      SELECT id, name, email, phone, status
      FROM clients
      WHERE id = ? AND deleted_at IS NULL
    `).get(entityId);
  } else if (entityType === 'session') {
    return db.prepare(`
      SELECT
        s.id, s.title, s.session_type, s.scheduled_at, s.location,
        s.court_room, s.judge, s.outcome, s.description, s.notes,
        s.participants, s.dossier_id, s.lawsuit_id,
        d.reference as dossier_reference, d.title as dossier_title,
        c.reference as lawsuit_reference, c.title as lawsuit_title,
        cl.name as client_name
      FROM sessions s
      LEFT JOIN dossiers d ON d.id = s.dossier_id
      LEFT JOIN lawsuits c ON c.id = s.lawsuit_id
      LEFT JOIN clients cl ON cl.id = d.client_id OR cl.id = (SELECT client_id FROM dossiers WHERE id = c.dossier_id)
      WHERE s.id = ? AND s.deleted_at IS NULL
    `).get(entityId);
  } else if (entityType === 'task') {
    return db.prepare(`
      SELECT
        t.id, t.title, t.description, t.status, t.priority, t.due_date,
        d.reference as dossier_reference, d.title as dossier_title
      FROM tasks t
      LEFT JOIN dossiers d ON d.id = t.dossier_id
      WHERE t.id = ? AND t.deleted_at IS NULL
    `).get(entityId);
  }
  return null;
}

function buildDraftPrompt({ entityType, entityData, draftType, purpose, audience, tone, language }) {
  const languageInstruction = language === 'fr' ? 'Write in French.' : 'Write in English.';
  const toneInstruction = tone === 'formal' ? 'Use formal language.'
    : tone === 'friendly' ? 'Use friendly, warm language.'
    : 'Use neutral, professional language.';

  let contextDescription = '';
  if (entityType === 'dossier') {
    contextDescription = `Dossier Reference: ${entityData.reference}
Title: ${entityData.title}
Status: ${entityData.status}
${entityData.next_deadline ? `Next Deadline: ${entityData.next_deadline}` : ''}
${entityData.client_name ? `Client: ${entityData.client_name}` : ''}`;
  } else if (entityType === 'session') {
    contextDescription = `Session Type: ${entityData.session_type}
${entityData.dossier_reference ? `Dossier: ${entityData.dossier_reference}` : ''}
Scheduled At: ${entityData.scheduled_at}
${entityData.location ? `Location: ${entityData.location}` : ''}
${entityData.judge ? `Judge: ${entityData.judge}` : ''}
${entityData.client_name ? `Client: ${entityData.client_name}` : ''}`;
  } else if (entityType === 'client') {
    contextDescription = `Client Name: ${entityData.name}
${entityData.email ? `Email: ${entityData.email}` : ''}
Status: ${entityData.status}`;
  } else if (entityType === 'task') {
    contextDescription = `Task: ${entityData.title}
${entityData.dossier_reference ? `Dossier: ${entityData.dossier_reference}` : ''}
Status: ${entityData.status}
Priority: ${entityData.priority}`;
  }

  const draftTypeInstruction = draftType === 'CLIENT_EMAIL' ? 'Generate a client email.'
    : draftType === 'INVITATION' ? 'Generate an invitation or meeting request.'
    : draftType === 'HEARING_SUMMARY' ? 'Generate a hearing/session summary.'
    : 'Generate an internal note.';

  const prompt = `You are a legal assistant drafting documents.

${draftTypeInstruction}
Purpose: ${purpose}
Audience: ${audience}
${toneInstruction}
${languageInstruction}

Context:
${contextDescription}

Generate the draft content. Include:
- A subject line (if applicable)
- A greeting (if applicable)
- Main body
- Closing (if applicable)

Output only the draft content, no meta-commentary.`;

  return prompt;
}

async function generateDraftContent(prompt) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: 800,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = await response.json();
    return (data.response || '').trim();
  } catch (err) {
    clearTimeout(timeoutId);
    throw new Error(`Failed to generate draft content: ${err.message}`);
  }
}

function parseGeneratedContent(content, draftType, language) {
  // Simple parsing - split by common sections
  const lines = content.split('\n').filter(line => line.trim());

  let subject = '';
  let greeting = '';
  let body = '';
  let closing = '';

  // Try to extract subject
  const subjectLine = lines.find(line =>
    /^(subject|objet|sujet):/i.test(line.trim())
  );
  if (subjectLine) {
    subject = subjectLine.replace(/^(subject|objet|sujet):\s*/i, '').trim();
  }

  // For emails and invitations, try to identify greeting and closing
  if (draftType === 'CLIENT_EMAIL' || draftType === 'INVITATION') {
    const greetingPatterns = language === 'fr'
      ? /^(madame,?\s*monsieur|bonjour|cher|chère)/i
      : /^(dear|hello|hi|greetings)/i;

    const closingPatterns = language === 'fr'
      ? /^(cordialement|bien à vous|sincèrement|avec nos salutations)/i
      : /^(best regards|sincerely|kind regards|yours)/i;

    for (const line of lines) {
      if (greetingPatterns.test(line.trim())) {
        greeting = line.trim();
        break;
      }
    }

    for (let i = lines.length - 1; i >= 0; i--) {
      if (closingPatterns.test(lines[i].trim())) {
        closing = lines.slice(i).join('\n');
        break;
      }
    }
  }

  // Body is everything not identified as subject, greeting, or closing
  body = content;

  return { subject, greeting, body, closing };
}

async function handler({
  entityType,
  entityId,
  draftType,
  purpose,
  audience = 'client',
  tone = 'formal',
  language = 'fr',
}) {
  // Fetch entity data
  const entityData = await fetchEntityData(entityType, entityId);
  if (!entityData) {
    throw new Error(`${entityType} ${entityId} not found`);
  }

  // Build prompt
  const prompt = buildDraftPrompt({
    entityType,
    entityData,
    draftType,
    purpose,
    audience,
    tone,
    language,
  });

  // Generate content via LLM
  const generatedContent = await generateDraftContent(prompt);
  if (!generatedContent) {
    throw new Error('LLM failed to generate draft content');
  }

  // Parse generated content
  const { subject, greeting, body, closing } = parseGeneratedContent(
    generatedContent,
    draftType,
    language
  );

  // Map tone to contract enum
  const contractTone = tone === 'formal' ? DRAFT_TONE.FORMAL
    : tone === 'friendly' ? DRAFT_TONE.FRIENDLY
    : DRAFT_TONE.NEUTRAL;

  // Build sections
  const sections = {};
  if (subject) sections.subject = subject;
  if (greeting) sections.greeting = greeting;
  sections.body = body;
  if (closing) sections.closing = closing;

  // Add footer
  const footer = language === 'fr'
    ? '---\nDocument généré automatiquement - Nécessite validation'
    : '---\nAutomatically generated document - Requires validation';
  sections.footer = footer;

  // Build recipient (for CLIENT_EMAIL)
  let recipient = null;
  if (draftType === 'CLIENT_EMAIL' && entityData.client_email) {
    recipient = {
      clientId: entityData.client_id,
      name: entityData.client_name,
      email: entityData.client_email,
    };
  }

  // Build context
  const context = {
    entityType,
    entityId,
    purpose,
    audience,
  };

  // Create draft using contract
  return createDraft({
    type: DRAFT_TYPE[draftType] || draftType,
    language,
    tone: contractTone,
    sections,
    metadata: {
      source: DRAFT_SOURCE.LLM_GENERATED,
      status: 'draft',
      requiresValidation: true,
      createdAt: new Date().toISOString(),
    },
    recipient,
    context,
  });
}

module.exports = {
  name: 'genericDraft',
  category: TOOL_CATEGORIES.DRAFT,
  description: 'Universal draft generation from entity context (LLM-powered)',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
  plannerHint: {
    requiredContext: ['entityType', 'entityId', 'draftType', 'purpose'],
    outputSummaryFields: ['sections', 'metadata'],
  },
};
