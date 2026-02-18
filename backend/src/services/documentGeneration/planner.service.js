"use strict";

const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const db = require("../../db/connection");
const { streamLLM } = require("../../agent_Back/llm/stream.provider");
const { getSchema } = require("./schemaRegistry.service");
const { renderTemplateToHtml } = require("./templateRegistry.service");
const { scanForPlaceholders } = require("./placeholderGuard");
const {
  DOCUMENT_TYPES,
  DOCUMENT_FORMATS,
  SUPPORTED_LANGUAGES,
  SCHEMA_VERSION,
  TARGET_TYPES,
} = require("./constants");

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

const REQUIRED_PATHS = Object.freeze({
  COURT_REQUEST_LETTER: [],
  LEGAL_OPINION: [],
  TASK_MEMO: [],
  SESSION_SUMMARY: [],
});

const ajv = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true });
addFormats(ajv);

function assert(value, message) {
  if (!value) {
    const err = new Error(message);
    err.status = 400;
    throw err;
  }
}

function deepGet(obj, dottedPath) {
  return String(dottedPath || "")
    .split(".")
    .filter(Boolean)
    .reduce((acc, key) => (acc && acc[key] !== undefined ? acc[key] : undefined), obj);
}

function hasValue(value) {
  if (Array.isArray(value)) return value.length > 0;
  if (value === null || value === undefined) return false;
  if (typeof value === "string") return value.trim().length > 0;
  return true;
}

function loadTargetEntity(target) {
  const table = ENTITY_TABLE_MAP[target.type];
  if (!table) return null;
  return db
    .prepare(`SELECT * FROM ${table} WHERE id = @id AND deleted_at IS NULL`)
    .get({ id: target.id });
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

function buildContentByType(documentType, target, entity, language, instructions) {
  const rawInstructions = normalizeText(instructions);
  const signatory = defaultSignatory();
  const today = new Date().toISOString().slice(0, 10);

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
        reference: caseReference,
        dossierReference: entity?.dossier_id ? `D-${entity.dossier_id}` : null,
      },
      request: {
        type: requestType,
        reason: requestReason,
      },
      legalReferences: [],
      dates: {
        issueDate: today,
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

async function generateEnvelopeWithLlm({ normalized, entity, schema }) {
  const seedEnvelope = {
    documentType: normalized.documentType,
    schemaVersion: SCHEMA_VERSION,
    language: normalized.language,
    targetEntity: normalized.target,
    content: buildContentByType(
      normalized.documentType,
      normalized.target,
      entity,
      normalized.language,
      normalized.instructions,
    ),
  };

  const systemPrompt =
    "You generate legal document content JSON only. " +
    "Return valid JSON matching the provided schema exactly. " +
    "No markdown, no explanations, no placeholders, no fabricated fields.";
  const userPrompt = [
    "Generate a structured document payload.",
    "Use user instructions and entity context.",
    "If data is unavailable, omit optional fields.",
    "",
    `request=${JSON.stringify({
      target: normalized.target,
      documentType: normalized.documentType,
      language: normalized.language,
      format: normalized.format,
      instructions: normalized.instructions,
    })}`,
    `entityContext=${JSON.stringify(entity || {})}`,
    `seed=${JSON.stringify(seedEnvelope)}`,
  ].join("\n");

  const text = await collectFinalTextFromLlm({
    mode: "json",
    schema,
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
  return parsed;
}

async function generateNarrativeBodyWithLlm({ documentType, language, instructions, content }) {
  const systemPrompt =
    "You write formal legal document text only. Return plain text only, no JSON, no markdown.";
  const userPrompt = [
    `documentType=${documentType}`,
    `language=${language}`,
    `instructions=${instructions || ""}`,
    `contentContext=${JSON.stringify(content || {})}`,
    "",
    "Write the final official document body text in the requested language.",
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

  if (docType === DOCUMENT_TYPES.COURT_REQUEST_LETTER) {
    const existingBody = content?.request?.body;
    if (!existingBody || !String(existingBody).trim()) {
      const body = await generateNarrativeBodyWithLlm({
        documentType: docType,
        language: normalized.language,
        instructions: normalized.instructions,
        content,
      });
      if (body) {
        envelope.content = envelope.content || {};
        envelope.content.request = envelope.content.request || {};
        envelope.content.request.body = body;
      }
    }
  }

  if (docType === DOCUMENT_TYPES.LEGAL_OPINION) {
    if (!content?.analysis || !String(content.analysis).trim()) {
      const analysis = await generateNarrativeBodyWithLlm({
        documentType: docType,
        language: normalized.language,
        instructions: normalized.instructions,
        content,
      });
      if (analysis) {
        envelope.content = envelope.content || {};
        envelope.content.analysis = analysis;
      }
    }
  }

  return envelope;
}

function normalizePlanInput(input = {}) {
  const target = input.target || {};
  const documentType = String(input.documentType || "").trim();
  const language = String(input.language || "").trim().toLowerCase() || "en";
  const format = String(input.format || "").trim().toLowerCase() || DOCUMENT_FORMATS.HTML;

  assert(TARGET_TYPES.includes(target.type), "Invalid target.type");
  assert(Number.isInteger(Number(target.id)) && Number(target.id) > 0, "Invalid target.id");
  assert(Object.values(DOCUMENT_TYPES).includes(documentType), "Unsupported documentType");
  assert(SUPPORTED_LANGUAGES.includes(language), "Unsupported language");
  assert(Object.values(DOCUMENT_FORMATS).includes(format), "Unsupported format");

  return {
    target: { type: target.type, id: Number(target.id) },
    documentType,
    language,
    format,
    instructions: typeof input.instructions === "string" ? input.instructions.trim() : "",
  };
}

async function planDocument(input = {}) {
  const normalized = normalizePlanInput(input);
  const entity = loadTargetEntity(normalized.target);
  assert(entity, `Target entity not found: ${normalized.target.type}#${normalized.target.id}`);

  const schema = getSchema(normalized.documentType, SCHEMA_VERSION);
  const rawEnvelope = await generateEnvelopeWithLlm({
    normalized,
    entity,
    schema,
  });
  await enrichEnvelopeNarrative({ envelope: rawEnvelope, normalized });
  const envelope = pruneUnset(rawEnvelope) || {};

  const missingFields = (REQUIRED_PATHS[normalized.documentType] || [])
    .map((path) => ({ path, value: deepGet(envelope, path) }))
    .filter((row) => !hasValue(row.value))
    .map((row) => ({
      path: row.path,
      label: row.path.replace(/^content\./, ""),
      reason: "required_field_missing",
      example: "Please provide this field explicitly.",
    }));

  const placeholderFindings = scanForPlaceholders(envelope.content, "content");
  const validate = ajv.compile(schema);
  const schemaValid = validate(envelope);

  const hasBlockingIssues =
    missingFields.length > 0 ||
    placeholderFindings.length > 0 ||
    !schemaValid;

  const template = renderTemplateToHtml({
    documentType: normalized.documentType,
    language: normalized.language,
    schemaVersion: envelope.schemaVersion,
    viewModel: envelope,
  });

  return {
    status: hasBlockingIssues ? "missing_fields" : "ready",
    target: normalized.target,
    documentType: normalized.documentType,
    language: normalized.language,
    format: normalized.format,
    schemaVersion: envelope.schemaVersion,
    templateKey: template.templateKey,
    contentJson: envelope,
    previewHtml: template.html,
    missingFields,
    placeholderFindings,
    validationErrors: schemaValid ? [] : (validate.errors || []),
  };
}

module.exports = {
  planDocument,
};
