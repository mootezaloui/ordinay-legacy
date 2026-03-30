"use strict";

const db = require("../../db/connection");
const { streamLLM } = require("./stream.provider");
const { scanForPlaceholders } = require("./placeholderGuard");
const { renderMarkdownToHtml } = require("./markdownRender.service");
const {
  DOCUMENT_TYPES,
  SUPPORTED_LANGUAGES,
  SCHEMA_VERSION,
  TARGET_TYPES,
} = require("./constants");
const {
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  DEFAULT_CANONICAL_FORMAT,
  DEFAULT_PREVIEW_FORMAT,
  chooseOutputFormats,
  normalizeFormat,
  isCanonicalFormat,
  isPreviewFormat,
} = require("../../domain/documentFormatGovernance");

const ENTITY_TABLE_MAP = Object.freeze({
  client: "clients",
  dossier: "dossiers",
  lawsuit: "lawsuits",
  mission: "missions",
  task: "tasks",
  session: "sessions",
  personal_task: "personal_tasks",
  financial_entry: "financial_entries",
  officer: "officers",
});

function assert(value, message) {
  if (!value) {
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
}

function loadTargetEntity(target) {
  const table = ENTITY_TABLE_MAP[target.type];
  if (!table) return null;
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id: target.id });
}

function loadEntityByTypeAndId(entityType, entityId) {
  const table = ENTITY_TABLE_MAP[String(entityType || "").toLowerCase()];
  const id = Number(entityId);
  if (!table || !Number.isInteger(id) || id <= 0) return null;
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id });
}

function isoDate(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

function defaultSignatory() {
  const op = db
    .prepare("SELECT name, title, bar_number FROM operators WHERE is_active = 1 ORDER BY id ASC LIMIT 1")
    .get();
  return {
    name: op?.name || null,
    title: op?.title || null,
    barNumber: op?.bar_number || null,
    officeName: op?.office_name || op?.office || null,
    officeAddress: op?.office_address || null,
    email: op?.email || null,
    phone: op?.phone || op?.mobile || null,
  };
}

function normalizeText(value) {
  return String(value || "")
    .replace(/[\u00a0\u202f]/g, " ")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();
}

function extractLabeledValue(text, labels = []) {
  const source = normalizeText(text);
  for (const label of labels) {
    const pattern = new RegExp(`(?:^|[\\n\\r\\.;،])\\s*(?:${label})\\s*[:：]\\s*([^\\n\\r\\.;،]+)`, "i");
    const match = source.match(pattern);
    if (match?.[1]) {
      const value = String(match[1]).trim();
      if (value) return value;
    }

    // Fallback for compact one-line prompts:
    // "Title: ... Court name: ... Court city: ..."
    const inlinePattern = new RegExp(`(?:${label})\\s*[:：]\\s*`, "i");
    const inlineMatch = inlinePattern.exec(source);
    if (!inlineMatch) continue;
    const start = inlineMatch.index + inlineMatch[0].length;
    const remainder = source.slice(start);
    const nextLabelPattern = /\s+[A-Za-z\u0600-\u06FF][A-Za-z\u0600-\u06FF\s]{1,40}\s*[:：]/g;
    const next = nextLabelPattern.exec(remainder);
    const raw = next ? remainder.slice(0, next.index) : remainder;
    const value = String(raw || "").trim();
    if (value) return value;
  }
  return null;
}

function splitListValue(value) {
  if (!value) return [];
  return String(value)
    .split(/[,\n;،]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractReason(text) {
  const labeled = extractLabeledValue(text, ["reason", "cause", "because", "السبب"]);
  if (labeled) return labeled;
  const source = normalizeText(text);
  const becauseMatch = source.match(/\bbecause\s+([^.\n\r]+)/i);
  if (becauseMatch?.[1]) return String(becauseMatch[1]).trim();
  const arabicBecause = source.match(/(?:بسبب|لأن)\s+([^.\n\r]+)/);
  if (arabicBecause?.[1]) return String(arabicBecause[1]).trim();
  return null;
}

function pruneUnset(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => pruneUnset(item))
      .filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value)
      .map(([key, child]) => [key, pruneUnset(child)])
      .filter(([, child]) => child !== undefined);
    if (entries.length === 0) return undefined;
    return Object.fromEntries(entries);
  }
  if (value === null || value === undefined) return undefined;
  if (typeof value === "string" && value.trim().length === 0) return undefined;
  return value;
}

function mergeObjects(base, override) {
  const safeBase = base && typeof base === "object" && !Array.isArray(base) ? base : {};
  const safeOverride =
    override && typeof override === "object" && !Array.isArray(override) ? override : {};
  return { ...safeBase, ...safeOverride };
}

function toClientContext(client) {
  if (!client || typeof client !== "object") return null;
  return {
    id: Number(client.id) || null,
    fullName: client.name || null,
    name: client.name || null,
    email: client.email || null,
    phone: client.phone || client.alternate_phone || null,
    company: client.company || null,
  };
}

function toDossierContext(dossier) {
  if (!dossier || typeof dossier !== "object") return null;
  return {
    id: Number(dossier.id) || null,
    reference: dossier.reference || dossier.code || null,
    title: dossier.title || null,
    status: dossier.status || null,
    clientId: Number(dossier.client_id) || null,
  };
}

function buildDeterministicStructuredContext({ normalized, entity, provided }) {
  const seed = provided && typeof provided === "object" && !Array.isArray(provided) ? provided : {};
  let client = null;
  let dossier = null;

  const targetType = String(normalized?.target?.type || "").toLowerCase();
  if (targetType === "client") {
    client = entity;
  } else if (targetType === "dossier") {
    dossier = entity;
    if (Number(entity?.client_id) > 0) {
      client = loadEntityByTypeAndId("client", entity.client_id);
    }
  } else {
    const entityDossierId = Number(entity?.dossier_id || 0);
    const entityClientId = Number(entity?.client_id || 0);
    if (entityDossierId > 0) {
      dossier = loadEntityByTypeAndId("dossier", entityDossierId);
      if (Number(dossier?.client_id) > 0) {
        client = loadEntityByTypeAndId("client", dossier.client_id);
      }
    }
    if (!client && entityClientId > 0) {
      client = loadEntityByTypeAndId("client", entityClientId);
    }
  }

  const deterministic = {
    client: toClientContext(client),
    dossier: toDossierContext(dossier),
    systemDate: new Date().toISOString().slice(0, 10),
    office: defaultSignatory(),
  };

  return {
    client: mergeObjects(deterministic.client, seed.client),
    dossier: mergeObjects(deterministic.dossier, seed.dossier),
    systemDate: seed.systemDate || deterministic.systemDate,
    office: mergeObjects(deterministic.office, seed.office),
  };
}

function buildFallbackMarkdown(envelope, normalized) {
  const content = envelope?.content || {};
  const lines = [];
  const title = String(content.title || "").trim();
  if (title) {
    lines.push(`# ${title}`);
    lines.push("");
  } else {
    lines.push(`# ${normalized.documentType}`);
    lines.push("");
  }

  const addValue = (label, value) => {
    const clean = String(value || "").trim();
    if (!clean) return;
    lines.push(`- ${label}: ${clean}`);
  };

  if (content.court) {
    addValue("Court", content.court.name);
    addValue("Court city", content.court.city);
  }
  if (content.case) {
    addValue("Reference", content.case.reference);
    addValue("Dossier", content.case.dossierReference);
  }
  if (content.request) {
    addValue("Request type", content.request.type);
    addValue("Reason", content.request.reason);
  }
  if (content.summary) addValue("Summary", content.summary);
  if (content.analysis) addValue("Analysis", content.analysis);
  if (content.conclusion) addValue("Conclusion", content.conclusion);
  if (content.outcome) addValue("Outcome", content.outcome);

  if (lines.length <= 2) {
    lines.push("Generated document content.");
  }
  return lines.join("\n");
}

function buildContentByType(documentType, target, entity, language, instructions, structuredContext = {}) {
  const rawInstructions = normalizeText(instructions);
  const signatory = defaultSignatory();
  const today = new Date().toISOString().slice(0, 10);
  const scopedClientName =
    String(structuredContext?.client?.fullName || structuredContext?.client?.name || "").trim() || null;
  const scopedDossierReference =
    String(structuredContext?.dossier?.reference || "").trim() || null;

  const baseTitle = extractLabeledValue(rawInstructions, ["title", "subject", "العنوان", "الموضوع"]);

  if (documentType === DOCUMENT_TYPES.COURT_REQUEST_LETTER) {
    const requestType =
      extractLabeledValue(rawInstructions, ["request\\s*type", "type", "نوع\\s*الطلب"]) ||
      (/\b(postpone|postponement|adjourn|delay)\b/i.test(rawInstructions) || /(تأجيل|ارجاء)/.test(rawInstructions)
        ? "postponement"
        : null);
    const requestReason = extractReason(rawInstructions);
    const hearingDate =
      isoDate(entity?.next_hearing) ||
      isoDate(extractLabeledValue(rawInstructions, ["hearing\\s*date", "session\\s*date", "تاريخ\\s*الجلسة"]));
    const caseReference = entity?.reference || null;
    const recipientRole = extractLabeledValue(rawInstructions, ["recipient\\s*role", "judge", "recipient", "صفة\\s*المرسل\\s*إليه", "القاضي", "القاضية"]);

    const courtName =
      extractLabeledValue(rawInstructions, ["court\\s*name", "court", "المحكمة"]) ||
      entity?.court ||
      entity?.court_reference ||
      null;
    const courtCity = extractLabeledValue(rawInstructions, ["court\\s*city", "city", "مدينة\\s*المحكمة", "المدينة"]);

    return {
      title: baseTitle,
      court: {
        name: courtName,
        city: courtCity,
        chamber: extractLabeledValue(rawInstructions, ["chamber", "الدائرة"]),
      },
      recipient: {
        role: recipientRole,
        name: extractLabeledValue(rawInstructions, ["recipient\\s*name", "judge\\s*name", "اسم\\s*القاضي"]),
      },
      case: {
        reference: caseReference || scopedDossierReference,
        dossierReference: scopedDossierReference || (entity?.dossier_id ? `D-${entity.dossier_id}` : null),
        clientName: scopedClientName,
      },
      request: {
        type: requestType,
        reason: requestReason,
      },
      legalReferences: [],
      dates: {
        issueDate: structuredContext?.systemDate || today,
        hearingDate,
      },
      signatory,
    };
  }

  if (documentType === DOCUMENT_TYPES.LEGAL_OPINION) {
    return {
      title: baseTitle,
      issue: extractLabeledValue(rawInstructions, ["issue", "topic", "subject", "الموضوع", "المسألة"]),
      facts: extractLabeledValue(rawInstructions, ["facts", "الوقائع"]) || entity?.description || null,
      analysis: extractLabeledValue(rawInstructions, ["analysis", "التحليل"]),
      conclusion: extractLabeledValue(rawInstructions, ["conclusion", "الخلاصة", "النتيجة"]),
      references: splitListValue(extractLabeledValue(rawInstructions, ["references", "المراجع"])),
      signatory,
    };
  }

  if (documentType === DOCUMENT_TYPES.TASK_MEMO) {
    return {
      title: baseTitle,
      summary: extractLabeledValue(rawInstructions, ["summary", "memo", "ملخص", "مذكرة"]) || entity?.description || null,
      nextActions: splitListValue(extractLabeledValue(rawInstructions, ["next\\s*actions", "actions", "الاجراءات\\s*القادمة", "الإجراءات\\s*القادمة"])),
      deadline: isoDate(entity?.due_date) || isoDate(extractLabeledValue(rawInstructions, ["deadline", "due\\s*date", "الموعد\\s*النهائي"])),
      owner: extractLabeledValue(rawInstructions, ["owner", "assignee", "المسؤول"]) || entity?.assigned_to || null,
    };
  }

  return {
    title: baseTitle,
    sessionDate: isoDate(entity?.session_date || entity?.scheduled_at) || isoDate(extractLabeledValue(rawInstructions, ["session\\s*date", "date", "تاريخ\\s*الجلسة"])),
    participants: splitListValue(extractLabeledValue(rawInstructions, ["participants", "الحضور", "المشاركون"])),
    summary: extractLabeledValue(rawInstructions, ["summary", "ملخص"]) || entity?.description || null,
    outcome: extractLabeledValue(rawInstructions, ["outcome", "result", "النتيجة"]) || entity?.outcome || null,
    nextSessionDate: isoDate(extractLabeledValue(rawInstructions, ["next\\s*session\\s*date", "تاريخ\\s*الجلسة\\s*القادمة"])),
  };
}

async function collectFinalTextFromLlm(options) {
  let finalText = "";
  for await (const part of streamLLM(options)) {
    if (part?.kind === "final_text") {
      finalText = String(part.text || "");
    } else if (!finalText && part?.kind === "delta") {
      finalText += String(part.text || "");
    }
  }
  return finalText.trim();
}

function parseJsonCandidate(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}$/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function generateEnvelopeWithLlm({ normalized, entity }) {
  const structuredContext = buildDeterministicStructuredContext({
    normalized,
    entity,
    provided: normalized.structuredContext,
  });
  const seedEnvelope = {
    documentType: normalized.documentType,
    schemaVersion: SCHEMA_VERSION,
    language: normalized.language,
    targetEntity: normalized.target,
    structuredContext,
    content: buildContentByType(
      normalized.documentType,
      normalized.target,
      entity,
      normalized.language,
      normalized.instructions,
      structuredContext,
    ),
  };

  const systemPrompt =
    "You generate legal document content JSON only. " +
    "Return valid JSON only. " +
    "Use ONLY fields from structuredContext. " +
    "If structuredContext.client.fullName exists, do not output placeholders for client name. " +
    "If structuredContext.dossier.reference exists, include it. " +
    "If structuredContext.lawyer fields are empty, do not fabricate them. " +
    "Never invent license numbers or identity numbers. " +
    "Never output internal DB IDs. " +
    "If data is missing, leave blank values or omit optional fields without placeholder markers. " +
    "No markdown and no explanations.";
  const userPrompt = [
    "Generate a structured document payload.",
    "Use user instructions, entity context, and structuredContext.",
    "Copy known structuredContext values exactly.",
    "Do not output internal identifiers.",
    "If data is unavailable, omit optional fields or leave empty values without placeholder markers.",
    "",
    `request=${JSON.stringify({
      target: normalized.target,
      documentType: normalized.documentType,
      language: normalized.language,
      canonicalFormat: normalized.canonicalFormat,
      previewFormat: normalized.previewFormat,
      instructions: normalized.instructions,
    })}`,
    `entityContext=${JSON.stringify(entity || {})}`,
    `structuredContext=${JSON.stringify(structuredContext)}`,
    `seed=${JSON.stringify(seedEnvelope)}`,
  ].join("\n");

  const text = await collectFinalTextFromLlm({
    mode: "json",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    maxTokens: 1800,
  });

  const parsed = parseJsonCandidate(text);
  if (!parsed || typeof parsed !== "object") {
    const err = new Error("LLM did not return valid JSON for document generation");
    err.code = "DOCUMENT_PLANNING_LLM_FAILED";
    throw err;
  }
  if (!parsed.structuredContext || typeof parsed.structuredContext !== "object") {
    parsed.structuredContext = structuredContext;
  }
  return parsed;
}

async function generateNarrativeBodyWithLlm({
  documentType,
  language,
  instructions,
  content,
  structuredContext = {},
}) {
  const systemPrompt =
    "You write formal legal document text in markdown only. " +
    "Use ONLY fields from structuredContext. " +
    "If structuredContext.client.fullName exists, do not output placeholders for client name. " +
    "If structuredContext.dossier.reference exists, include it. " +
    "If structuredContext.lawyer fields are empty, do not fabricate them. " +
    "Never invent license numbers or identity numbers. " +
    "Never output internal DB IDs. " +
    "If a value is missing, leave it blank without placeholder syntax. " +
    "Return markdown only, no JSON.";
  const userPrompt = [
    `documentType=${documentType}`,
    `language=${language}`,
    `instructions=${instructions || ""}`,
    `contentContext=${JSON.stringify(content || {})}`,
    `structuredContext=${JSON.stringify(structuredContext || {})}`,
    "",
    "Write the final official document body text in the requested language as markdown.",
  ].join("\n");

  const text = await collectFinalTextFromLlm({
    mode: "text",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    maxTokens: 1200,
  });
  return String(text || "").trim();
}

async function enrichEnvelopeNarrative({ envelope, normalized }) {
  const docType = normalized.documentType;
  const content = envelope?.content || {};
  const structuredContext =
    envelope?.structuredContext && typeof envelope.structuredContext === "object"
      ? envelope.structuredContext
      : {};

  const existingMarkdown = content?.markdown;
  if (!existingMarkdown || !String(existingMarkdown).trim()) {
    const markdown = await generateNarrativeBodyWithLlm({
      documentType: docType,
      language: normalized.language,
      instructions: normalized.instructions,
      content,
      structuredContext,
    });
    if (markdown) {
      envelope.content = envelope.content || {};
      envelope.content.markdown = markdown;
    }
  }

  return envelope;
}

function normalizePlanInput(input = {}) {
  const target = input.target || {};
  const documentType = String(input.documentType || "").trim();
  const language = String(input.language || "").trim().toLowerCase() || "en";
  const requestedCanonicalFormat = normalizeFormat(input.canonicalFormat || input.format);
  const requestedPreviewFormat = normalizeFormat(input.previewFormat);
  if (requestedCanonicalFormat && !isCanonicalFormat(requestedCanonicalFormat)) {
    assert(false, "Unsupported canonical format");
  }
  const selectedFormats = chooseOutputFormats({
    preference: requestedCanonicalFormat || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
    artifactKind: "document",
    structureHints: {
      hasTabularData: false,
      requiresEditing: false,
      intendedForFiling: false,
    },
  });
  const canonicalFormat = requestedCanonicalFormat || selectedFormats.canonicalFormat || DEFAULT_CANONICAL_FORMAT;
  const previewFormat = requestedPreviewFormat || selectedFormats.previewFormat || DEFAULT_PREVIEW_FORMAT;

  assert(TARGET_TYPES.includes(target.type), "Invalid target.type");
  assert(Number.isInteger(Number(target.id)) && Number(target.id) > 0, "Invalid target.id");
  assert(Object.values(DOCUMENT_TYPES).includes(documentType), "Unsupported documentType");
  assert(SUPPORTED_LANGUAGES.includes(language), "Unsupported language");
  assert(isCanonicalFormat(canonicalFormat), "Unsupported canonical format");
  assert(isPreviewFormat(previewFormat), "Unsupported preview format");

  return {
    target: { type: target.type, id: Number(target.id) },
    documentType,
    language,
    canonicalFormat,
    previewFormat,
    formatSelection: {
      ...selectedFormats,
      ...(requestedCanonicalFormat ? { selectionMode: "explicit", selectionSource: "explicit_request" } : {}),
    },
    // Backward compatibility for callers still reading `format`.
    format: canonicalFormat,
    instructions: typeof input.instructions === "string" ? input.instructions.trim() : "",
    structuredContext:
      input.structuredContext && typeof input.structuredContext === "object" && !Array.isArray(input.structuredContext)
        ? input.structuredContext
        : {},
  };
}

function normalizeInlineListMarkdown(value = "") {
  let text = String(value || "")
    .replace(/\r\n?/g, "\n")
    .replace(/\u00a0/g, " ")
    .trim();
  if (!text) return "";

  // Normalize common inline list emission patterns from LLM output.
  text = text.replace(/[–—]/g, " - ");
  text = text.replace(/:\s+-\s+/g, ":\n- ");
  text = text.replace(/([.!?])\s+-\s+/g, "$1\n- ");
  text = text.replace(/([^\n])\s+-\s+(?=\*\*[^*\n]{1,120}\*\*\s*:)/g, "$1\n- ");

  const inlineDashCount = (text.match(/[ \t]-[ \t]/g) || []).length;
  if (inlineDashCount >= 2) {
    text = text.replace(/[ \t]+-[ \t]+/g, "\n- ");
  }

  // Split inline numbered items like "1. A 2. B 3. C".
  text = text.replace(/([^\n])\s+(?=\d{1,2}\.\s+[A-Za-z])/g, "$1\n");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text;
}

async function planDocument(input = {}) {
  const normalized = normalizePlanInput(input);
  const entity = loadTargetEntity(normalized.target);
  if (!entity) {
    const err = new Error(
      `Target entity not found: ${normalized.target.type}#${normalized.target.id}`,
    );
    err.status = 404;
    err.code = "TARGET_NOT_FOUND";
    throw err;
  }

  const rawEnvelope = await generateEnvelopeWithLlm({
    normalized,
    entity,
  });
  await enrichEnvelopeNarrative({ envelope: rawEnvelope, normalized });
  const envelope = pruneUnset(rawEnvelope) || {};

  let markdown = String(envelope?.content?.markdown || "").trim();
  if (!markdown) {
    markdown = buildFallbackMarkdown(envelope, normalized);
    envelope.content = envelope.content || {};
    envelope.content.markdown = markdown;
  }
  markdown = normalizeInlineListMarkdown(markdown);
  envelope.content = envelope.content || {};
  envelope.content.markdown = markdown;

  const missingFields = [];
  const placeholderFindings = scanForPlaceholders(envelope.content, "content");
  const previewHtml = renderMarkdownToHtml(markdown, { language: normalized.language });

  return {
    status: "ready",
    target: normalized.target,
    documentType: normalized.documentType,
    language: normalized.language,
    canonicalFormat: normalized.canonicalFormat,
    previewFormat: normalized.previewFormat,
    formatSelection: normalized.formatSelection,
    // Backward compatibility for legacy payloads.
    format: normalized.canonicalFormat,
    schemaVersion: envelope.schemaVersion || SCHEMA_VERSION,
    templateKey: "MARKDOWN_DIRECT",
    contentJson: envelope,
    previewHtml,
    missingFields,
    placeholderFindings,
    validationErrors: [],
  };
}

async function groundDraftContent(input = {}) {
  const title = String(input.title || "").trim();
  const content = String(input.content || "").trim();
  const language = String(input.language || "en").trim().toLowerCase() || "en";
  const structuredContext =
    input.structuredContext && typeof input.structuredContext === "object" && !Array.isArray(input.structuredContext)
      ? input.structuredContext
      : {};
  if (!content) return { title, content };

  const systemPrompt =
    "You rewrite legal draft markdown with strict data grounding. " +
    "Use ONLY fields from structuredContext. " +
    "If structuredContext.client.fullName exists, do not output placeholders for client name. " +
    "If structuredContext.dossier.reference exists, include it. " +
    "If structuredContext.lawyer fields are empty, do not fabricate them. " +
    "Never invent license numbers or identity numbers. " +
    "Never output internal DB IDs. " +
    "If a value is missing, leave it blank without placeholder markers. " +
    "Return markdown only.";
  const userPrompt = [
    `language=${language}`,
    `title=${title || ""}`,
    `structuredContext=${JSON.stringify(structuredContext)}`,
    `draft=${content}`,
    "",
    "Rewrite the draft as an official legal document in markdown.",
  ].join("\n");

  const rewritten = await collectFinalTextFromLlm({
    mode: "text",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.1,
    maxTokens: 1400,
  });

  return {
    title,
    content: String(rewritten || content).trim() || content,
  };
}

module.exports = {
  planDocument,
  groundDraftContent,
};
