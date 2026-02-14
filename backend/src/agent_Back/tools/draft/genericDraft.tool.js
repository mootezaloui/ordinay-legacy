"use strict";

/**
 * DRAFT TOOL: genericDraft (Universal Draft Engine)
 *
 * Generic draft generation from entity context.
 * Replaces draftClientEmail, draftInvitation, draftHearingSummary.
 * Fetches structured data, builds safe prompt, calls LLM, returns artifact.
 * Output only, never persists automatically.
 */

const { TOOL_CATEGORIES } = require("../tool.registry");
const {
  DRAFT_TYPE,
  DRAFT_TONE,
  DRAFT_SOURCE,
  createDraft,
} = require("../../contracts/draft.contract");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
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
    draftType: {
      type: "string",
      enum: [
        "CLIENT_EMAIL",
        "INVITATION",
        "HEARING_SUMMARY",
        "INTERNAL_NOTE",
        "HEARING_REQUEST",
        "COURT_MOTION",
        "CLIENT_NOTIFICATION",
      ],
      description: "Type of draft to generate",
    },
    context: {
      type: "object",
      description: "Normalized draft context",
    },
  },
  required: ["draftType", "context"],
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

Use ONLY the provided data. Do NOT invent invoice titles, due dates, amounts, phone numbers, email addresses, or contract numbers.
If an invoice title or due date is missing, keep the placeholder exactly as provided.
If other fields are null or empty, omit them. Do NOT fabricate missing data.
The recipient is the client. The author is the operator.
Never sign the document with the recipient’s name.
Never use recipient contact details as sender details.
If author phone or email is missing, keep the placeholder exactly as provided.
If selection.mode is "single", reference ONLY that invoice.
If selection.mode is "all", list ALL invoice titles and due dates, and mention the total amount owed.

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
  draftType,
  purpose,
  audience,
  tone,
  language,
  context,
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

  const contextJson = JSON.stringify(context || {}, null, 2);

  const draftTypeInstruction =
    draftType === "CLIENT_EMAIL"
      ? "Generate a client email."
      : draftType === "INVITATION"
        ? "Generate an invitation or meeting request."
        : draftType === "HEARING_REQUEST"
          ? "Generate a hearing request."
          : draftType === "HEARING_SUMMARY"
            ? "Generate a hearing/session summary."
            : draftType === "COURT_MOTION"
              ? "Generate a formal court motion."
              : draftType === "CLIENT_NOTIFICATION"
                ? "Generate a client notification."
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
${contextJson}
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
          temperature: 0.2,
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

async function handler({ draftType, context }) {
  if (!context) {
    throw new Error("Draft context missing");
  }

  const purpose = context.purpose || "general correspondence";
  const audience = context.audience || "client";
  const tone = context.tone || "formal";
  const language = context.language || "fr";
  const recipientIdentity = context.recipient || null;
  const authorIdentity = context.author || context.operator || null;

  const overdueContext = context.overdue || null;
  const isOverduePaymentEmail =
    draftType === "CLIENT_EMAIL" &&
    Array.isArray(overdueContext?.overdueInvoices) &&
    overdueContext.overdueInvoices.length > 0;

  if (isOverduePaymentEmail) {
    const selection = overdueContext.selection || {
      mode: "all",
      invoiceIds: overdueContext.overdueInvoices.map((entry) => entry.id),
    };

    const structuredContext = {
      recipient: recipientIdentity,
      selection,
      overdueInvoices: overdueContext.overdueInvoices,
      totalOverdueAmount: overdueContext.totalOverdueAmount ?? null,
      totalOverdueCurrency: overdueContext.totalOverdueCurrency ?? null,
      oldestDueDate: overdueContext.oldestDueDate ?? null,
      daysLate: overdueContext.daysLate ?? null,
      author: authorIdentity,
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

    const recipient = recipientIdentity?.email
      ? {
          clientId: recipientIdentity.id,
          name: recipientIdentity.name,
          email: recipientIdentity.email,
        }
      : null;

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
      context: {
        ...context,
        groundedContext: structuredContext,
      },
    });
  }

  const prompt = buildDraftPrompt({
    draftType,
    purpose,
    audience,
    tone,
    language,
    context,
    recipient: recipientIdentity,
    author: authorIdentity,
  });

  const generatedContent = await generateDraftContent(prompt);
  if (!generatedContent) {
    throw new Error("LLM failed to generate draft content");
  }

  if (draftType === "CLIENT_EMAIL") {
    validateRecipientNotAuthor(generatedContent, recipientIdentity);
  }

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

  let recipient = null;
  if (draftType === "CLIENT_EMAIL" && recipientIdentity?.email) {
    recipient = {
      clientId: recipientIdentity.id,
      name: recipientIdentity.name,
      email: recipientIdentity.email,
    };
  }

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
    requiredContext: ["draftType", "context"],
    outputSummaryFields: ["sections", "metadata"],
  },
};
