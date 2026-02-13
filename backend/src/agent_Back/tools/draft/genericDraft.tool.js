"use strict";

/**
 * DRAFT TOOL: genericDraft (Universal Draft Engine)
 *
 * Generic draft generation from entity context.
 * Replaces draftClientEmail, draftInvitation, draftHearingSummary.
 * Fetches structured data, builds safe prompt, calls LLM, returns artifact.
 * Output only, never persists automatically.
 */

const db = require("../../../db/connection");
const operatorsService = require("../../../services/operators.service");
const { TOOL_CATEGORIES } = require("../tool.registry");
const {
  DRAFT_TYPE,
  DRAFT_TONE,
  DRAFT_SOURCE,
  createDraft,
} = require("../../contracts/draft.contract");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || "45000", 10);
const LLM_DRAFT_TIMEOUT = parseInt(
  process.env.LLM_DRAFT_TIMEOUT || String(LLM_TIMEOUT),
  10,
);
const LLM_DRAFT_NUM_PREDICT = parseInt(
  process.env.LLM_DRAFT_NUM_PREDICT || "500",
  10,
);

const inputSchema = {
  type: "object",
  properties: {
    entityType: {
      type: "string",
      enum: ["dossier", "client", "session", "task"],
      description: "Type of entity to draft for",
    },
    entityId: {
      type: "integer",
      minimum: 1,
      description: "ID of the entity",
    },
    draftType: {
      type: "string",
      enum: ["CLIENT_EMAIL", "INVITATION", "HEARING_SUMMARY", "INTERNAL_NOTE"],
      description: "Type of draft to generate",
    },
    purpose: {
      type: "string",
      description:
        'Purpose of the draft (e.g., "update", "request_info", "confirm_appointment")',
    },
    audience: {
      type: "string",
      enum: ["client", "internal", "court", "general"],
      default: "client",
      description: "Target audience for the draft",
    },
    tone: {
      type: "string",
      enum: ["formal", "neutral", "friendly"],
      default: "formal",
      description: "Tone of the draft",
    },
    language: {
      type: "string",
      enum: ["en", "fr"],
      default: "fr",
      description: "Language for the draft",
    },
  },
  required: ["entityType", "entityId", "draftType", "purpose"],
  additionalProperties: false,
};

const outputSchema = {
  oneOf: [
    {
      type: "object",
      properties: {
        type: { type: "string" },
        language: { type: "string" },
        tone: { type: "string" },
        sections: { type: "object" },
        metadata: { type: "object" },
        recipient: { type: ["object", "null"] },
        context: { type: ["object", "null"] },
      },
      required: ["type", "language", "tone", "sections", "metadata"],
      additionalProperties: false,
    },
    {
      type: "object",
      properties: {
        type: { type: "string", enum: ["information"] },
        message: { type: "string" },
      },
      required: ["type", "message"],
      additionalProperties: false,
    },
  ],
};

async function fetchEntityData(entityType, entityId) {
  if (entityType === "dossier") {
    return db
      .prepare(
        `
      SELECT
        d.id, d.reference, d.title, d.description, d.status, d.next_deadline,
        c.id as client_id, c.name as client_name, c.email as client_email
      FROM dossiers d
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE d.id = ? AND d.deleted_at IS NULL
    `,
      )
      .get(entityId);
  } else if (entityType === "client") {
    return db
      .prepare(
        `
      SELECT id, name, email, phone, status
      FROM clients
      WHERE id = ? AND deleted_at IS NULL
    `,
      )
      .get(entityId);
  } else if (entityType === "session") {
    return db
      .prepare(
        `
      SELECT
        s.id, s.title, s.session_type, s.scheduled_at, s.location,
        s.court_room, s.judge, s.outcome, s.description, s.notes,
        s.participants, s.dossier_id, s.lawsuit_id,
        d.reference as dossier_reference, d.title as dossier_title,
        c.reference as lawsuit_reference, c.title as lawsuit_title,
        cl.id as client_id, cl.name as client_name, cl.email as client_email
      FROM sessions s
      LEFT JOIN dossiers d ON d.id = s.dossier_id
      LEFT JOIN lawsuits c ON c.id = s.lawsuit_id
      LEFT JOIN clients cl ON cl.id = d.client_id OR cl.id = (SELECT client_id FROM dossiers WHERE id = c.dossier_id)
      WHERE s.id = ? AND s.deleted_at IS NULL
    `,
      )
      .get(entityId);
  } else if (entityType === "task") {
    return db
      .prepare(
        `
      SELECT
        t.id, t.title, t.description, t.status, t.priority, t.due_date,
        d.reference as dossier_reference, d.title as dossier_title,
        c.id as client_id, c.name as client_name, c.email as client_email
      FROM tasks t
      LEFT JOIN dossiers d ON d.id = t.dossier_id
      LEFT JOIN clients c ON c.id = d.client_id
      WHERE t.id = ? AND t.deleted_at IS NULL
    `,
      )
      .get(entityId);
  }
  return null;
}

function fetchClientById(clientId) {
  if (!clientId) return null;
  return db
    .prepare(
      `
    SELECT id, name, email, phone, status
    FROM clients
    WHERE id = ? AND deleted_at IS NULL
  `,
    )
    .get(clientId);
}

function fetchUnpaidInvoicesByClientId(clientId) {
  if (!clientId) return [];
  return db
    .prepare(
      `
    SELECT
      reference as number,
      amount,
      currency,
      due_date as dueDate
    FROM financial_entries
    WHERE client_id = ?
      AND scope = 'client'
      AND deleted_at IS NULL
      AND paid_at IS NULL
      AND status NOT IN ('cancelled', 'void')
      AND (direction = 'receivable' OR direction IS NULL)
    ORDER BY COALESCE(due_date, created_at) ASC
  `,
    )
    .all(clientId);
}

function buildOverduePaymentPrompt({
  purpose,
  audience,
  tone,
  language,
  structuredContext,
}) {
  const languageInstruction =
    language === "fr" ? "Write in French." : "Write in English.";
  const toneInstruction =
    tone === "formal"
      ? "Use formal language."
      : tone === "friendly"
        ? "Use friendly, warm language."
        : "Use neutral, professional language.";

  const contextJson = JSON.stringify(structuredContext, null, 2);

  return `You are a legal assistant drafting a client email about overdue payment.

Purpose: ${purpose}
Audience: ${audience}
${toneInstruction}
${languageInstruction}

Use ONLY the provided data. Do NOT invent invoice numbers, due dates, amounts, phone numbers, or email addresses.
If a field is null or empty, omit it from the draft. Do NOT fabricate missing data.
The recipient is the client. The author is the operator.
Never sign the document with the recipient’s name.
Never use recipient contact details as sender details.
If author phone or email is missing, keep the placeholder exactly as provided.
If multiple unpaid invoices are provided, either:
- Summarize the total amount owed, OR
- List each invoice in bullet format (number, amount, currency, due date).

Structured context (use only these values):
${contextJson}

Generate the draft content. Include:
- A subject line
- A greeting
- Main body
- Closing and signature

Output only the draft content, no meta-commentary.`;
}

function buildDraftPrompt({
  entityType,
  entityData,
  draftType,
  purpose,
  audience,
  tone,
  language,
  recipient,
  author,
}) {
  const languageInstruction =
    language === "fr" ? "Write in French." : "Write in English.";
  const toneInstruction =
    tone === "formal"
      ? "Use formal language."
      : tone === "friendly"
        ? "Use friendly, warm language."
        : "Use neutral, professional language.";

  let contextDescription = "";
  if (entityType === "dossier") {
    contextDescription = `Dossier Reference: ${entityData.reference}
Title: ${entityData.title}
Status: ${entityData.status}
${entityData.next_deadline ? `Next Deadline: ${entityData.next_deadline}` : ""}
${entityData.client_name ? `Client: ${entityData.client_name}` : ""}`;
  } else if (entityType === "session") {
    contextDescription = `Session Type: ${entityData.session_type}
${entityData.dossier_reference ? `Dossier: ${entityData.dossier_reference}` : ""}
Scheduled At: ${entityData.scheduled_at}
${entityData.location ? `Location: ${entityData.location}` : ""}
${entityData.judge ? `Judge: ${entityData.judge}` : ""}
${entityData.client_name ? `Client: ${entityData.client_name}` : ""}`;
  } else if (entityType === "client") {
    contextDescription = `Client Name: ${entityData.name}
${entityData.email ? `Email: ${entityData.email}` : ""}
Status: ${entityData.status}`;
  } else if (entityType === "task") {
    contextDescription = `Task: ${entityData.title}
${entityData.dossier_reference ? `Dossier: ${entityData.dossier_reference}` : ""}
Status: ${entityData.status}
Priority: ${entityData.priority}`;
  }

  const draftTypeInstruction =
    draftType === "CLIENT_EMAIL"
      ? "Generate a client email."
      : draftType === "INVITATION"
        ? "Generate an invitation or meeting request."
        : draftType === "HEARING_SUMMARY"
          ? "Generate a hearing/session summary."
          : "Generate an internal note.";

  const identityRules =
    draftType === "CLIENT_EMAIL"
      ? `
The recipient is the client. The author is the operator.
The author identity is provided separately.
Never sign the document with the recipient’s name.
Never use recipient contact details as sender details.
`
      : "";

  const identityContext =
    draftType === "CLIENT_EMAIL"
      ? `\nRecipient:\n${recipient ? JSON.stringify(recipient, null, 2) : "null"}\n\nAuthor:\n${author ? JSON.stringify(author, null, 2) : "null"}\n`
      : "";

  const prompt = `You are a legal assistant drafting documents.

${draftTypeInstruction}
Purpose: ${purpose}
Audience: ${audience}
${toneInstruction}
${languageInstruction}
${identityRules}

Context:
${contextDescription}
${identityContext}

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
  const timeoutId = setTimeout(() => controller.abort(), LLM_DRAFT_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.5,
          num_predict: LLM_DRAFT_NUM_PREDICT,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`LLM request failed: ${response.status}`);
    }

    const data = await response.json();
    return (data.response || "").trim();
  } catch (err) {
    clearTimeout(timeoutId);
    if (err?.name === "AbortError") {
      throw new Error(
        `Draft generation timed out after ${LLM_DRAFT_TIMEOUT}ms`,
      );
    }
    throw new Error(`Failed to generate draft content: ${err.message}`);
  }
}

function parseGeneratedContent(content, draftType, language) {
  // Simple parsing - split by common sections
  const lines = content.split("\n").filter((line) => line.trim());

  let subject = "";
  let greeting = "";
  let body = "";
  let closing = "";

  // Try to extract subject
  const subjectLine = lines.find((line) =>
    /^(subject|objet|sujet):/i.test(line.trim()),
  );
  if (subjectLine) {
    subject = subjectLine.replace(/^(subject|objet|sujet):\s*/i, "").trim();
  }

  // For emails and invitations, try to identify greeting and closing
  if (draftType === "CLIENT_EMAIL" || draftType === "INVITATION") {
    const greetingPatterns =
      language === "fr"
        ? /^(madame,?\s*monsieur|bonjour|cher|chère)/i
        : /^(dear|hello|hi|greetings)/i;

    const closingPatterns =
      language === "fr"
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
        closing = lines.slice(i).join("\n");
        break;
      }
    }
  }

  // Body is everything not identified as subject, greeting, or closing
  body = content;

  return { subject, greeting, body, closing };
}

function resolveAuthorIdentity() {
  const placeholders = {
    name: "[Votre Nom]",
    position: "[Votre Poste]",
    firmName: "[Nom de l'Entreprise]",
    phone: "[Téléphone]",
    email: "[Email]",
  };

  try {
    const operator = operatorsService.getCurrentOperator();
    return {
      name: operator?.name || placeholders.name,
      position: operator?.title || operator?.role || placeholders.position,
      firmName:
        operator?.office_name || operator?.office || placeholders.firmName,
      phone: operator?.phone || operator?.mobile || placeholders.phone,
      email: operator?.email || placeholders.email,
    };
  } catch (err) {
    return { ...placeholders };
  }
}

function buildRecipientIdentity(entityType, entityData) {
  if (!entityData) return null;
  if (entityType === "client") {
    return {
      type: "client",
      id: entityData.id,
      name: entityData.name || null,
      email: entityData.email || null,
      phone: entityData.phone || null,
      address: entityData.address || null,
    };
  }

  if (
    entityData.client_id ||
    entityData.client_name ||
    entityData.client_email
  ) {
    return {
      type: "client",
      id: entityData.client_id || null,
      name: entityData.client_name || null,
      email: entityData.client_email || null,
      phone: entityData.client_phone || null,
      address: entityData.client_address || null,
    };
  }

  return null;
}

function validateRecipientNotAuthor(content, recipient) {
  if (!recipient || !content) return;
  const haystack = String(content).toLowerCase();
  const name = String(recipient.name || "")
    .trim()
    .toLowerCase();
  const email = String(recipient.email || "")
    .trim()
    .toLowerCase();

  const lines = String(content)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const signatureBlock = lines.slice(-8).join("\n").toLowerCase();

  if (
    (name && signatureBlock.includes(name)) ||
    (email && signatureBlock.includes(email))
  ) {
    throw new Error(
      "Draft validation failed: recipient identity used as author.",
    );
  }
  if (
    (name && haystack.includes(name) && signatureBlock.includes(name)) ||
    (email && haystack.includes(email) && signatureBlock.includes(email))
  ) {
    throw new Error(
      "Draft validation failed: recipient identity used as author.",
    );
  }
}

async function handler({
  entityType,
  entityId,
  draftType,
  purpose,
  audience = "client",
  tone = "formal",
  language = "fr",
}) {
  // Fetch entity data
  const entityData = await fetchEntityData(entityType, entityId);
  if (!entityData) {
    throw new Error(`${entityType} ${entityId} not found`);
  }

  const isOverduePaymentEmail =
    draftType === "CLIENT_EMAIL" &&
    /overdue payment/i.test(String(purpose || ""));

  if (isOverduePaymentEmail) {
    const clientId =
      entityType === "client" ? entityData.id : entityData.client_id;

    if (!clientId) {
      throw new Error("Unable to resolve client for overdue payment draft");
    }

    const client = fetchClientById(clientId);
    if (!client) {
      throw new Error(`Client ${clientId} not found`);
    }

    const unpaidInvoices = fetchUnpaidInvoicesByClientId(clientId);
    if (!unpaidInvoices || unpaidInvoices.length === 0) {
      return {
        type: "information",
        message: "No unpaid invoices found for this client.",
      };
    }

    const author = resolveAuthorIdentity();

    const structuredContext = {
      recipient: {
        type: "client",
        id: client.id,
        name: client.name || null,
        email: client.email || null,
        phone: client.phone || null,
        address: client.address || null,
      },
      unpaidInvoices: unpaidInvoices.map((entry) => ({
        number: entry.number || null,
        amount: entry.amount || null,
        currency: entry.currency || null,
        dueDate: entry.dueDate || null,
      })),
      author,
    };

    const prompt = buildOverduePaymentPrompt({
      purpose,
      audience,
      tone,
      language,
      structuredContext,
    });

    const generatedContent = await generateDraftContent(prompt);
    if (!generatedContent) {
      throw new Error("LLM failed to generate draft content");
    }

    validateRecipientNotAuthor(generatedContent, structuredContext.recipient);

    const { subject, greeting, body, closing } = parseGeneratedContent(
      generatedContent,
      draftType,
      language,
    );

    const contractTone =
      tone === "formal" ? DRAFT_TONE.FORMAL : DRAFT_TONE.NEUTRAL;

    const headerParts = [];
    if (subject) headerParts.push(subject);
    if (greeting) headerParts.push(greeting);
    const header =
      headerParts.length > 0
        ? headerParts.join("\n")
        : language === "fr"
          ? "Madame, Monsieur,"
          : "Dear Sir or Madam,";

    const footerText =
      language === "fr"
        ? "---\nDocument généré automatiquement - Nécessite validation"
        : "---\nAutomatically generated document - Requires validation";
    const footerParts = [];
    if (closing) footerParts.push(closing);
    footerParts.push(footerText);

    const sections = {
      header,
      body,
      footer: footerParts.join("\n"),
    };

    const recipient = client.email
      ? { clientId: client.id, name: client.name, email: client.email }
      : null;

    const context = {
      entityType,
      entityId,
      purpose,
      audience,
      groundedContext: structuredContext,
      recipient: structuredContext.recipient,
      author: structuredContext.author,
    };

    return createDraft({
      type: DRAFT_TYPE[draftType] || draftType,
      language,
      tone: contractTone,
      sections,
      metadata: {
        source: DRAFT_SOURCE.LLM,
        status: "draft",
        requiresValidation: true,
        createdAt: new Date().toISOString(),
      },
      recipient,
      context,
    });
  }

  const recipientIdentity = buildRecipientIdentity(entityType, entityData);
  const authorIdentity = resolveAuthorIdentity();

  // Build prompt
  const prompt = buildDraftPrompt({
    entityType,
    entityData,
    draftType,
    purpose,
    audience,
    tone,
    language,
    recipient: recipientIdentity,
    author: authorIdentity,
  });

  // Generate content via LLM
  const generatedContent = await generateDraftContent(prompt);
  if (!generatedContent) {
    throw new Error("LLM failed to generate draft content");
  }

  if (draftType === "CLIENT_EMAIL") {
    validateRecipientNotAuthor(generatedContent, recipientIdentity);
  }

  // Parse generated content
  const { subject, greeting, body, closing } = parseGeneratedContent(
    generatedContent,
    draftType,
    language,
  );

  // Map tone to contract enum (contract only allows FORMAL and NEUTRAL)
  const contractTone =
    tone === "formal" ? DRAFT_TONE.FORMAL : DRAFT_TONE.NEUTRAL;

  // Build sections (contract requires header, body, footer)
  const headerParts = [];
  if (subject) headerParts.push(subject);
  if (greeting) headerParts.push(greeting);
  const header =
    headerParts.length > 0
      ? headerParts.join("\n")
      : language === "fr"
        ? "Madame, Monsieur,"
        : "Dear Sir or Madam,";

  const footerText =
    language === "fr"
      ? "---\nDocument généré automatiquement - Nécessite validation"
      : "---\nAutomatically generated document - Requires validation";
  const footerParts = [];
  if (closing) footerParts.push(closing);
  footerParts.push(footerText);

  const sections = {
    header,
    body,
    footer: footerParts.join("\n"),
  };

  // Build recipient (for CLIENT_EMAIL)
  let recipient = null;
  if (draftType === "CLIENT_EMAIL" && recipientIdentity?.email) {
    recipient = {
      clientId: recipientIdentity.id,
      name: recipientIdentity.name,
      email: recipientIdentity.email,
    };
  }

  // Build context
  const context = {
    entityType,
    entityId,
    purpose,
    audience,
    recipient: recipientIdentity,
    author: authorIdentity,
  };

  // Create draft using contract
  return createDraft({
    type: DRAFT_TYPE[draftType] || draftType,
    language,
    tone: contractTone,
    sections,
    metadata: {
      source: DRAFT_SOURCE.LLM,
      status: "draft",
      requiresValidation: true,
      createdAt: new Date().toISOString(),
    },
    recipient,
    context,
  });
}

module.exports = {
  name: "genericDraft",
  category: TOOL_CATEGORIES.DRAFT,
  description: "Universal draft generation from entity context (LLM-powered)",
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ["v1", "v2", "v3"],
  handler,
  plannerHint: {
    requiredContext: ["entityType", "entityId", "draftType", "purpose"],
    outputSummaryFields: ["sections", "metadata"],
  },
};
