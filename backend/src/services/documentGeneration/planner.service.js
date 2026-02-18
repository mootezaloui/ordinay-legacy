"use strict";

const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const db = require("../../db/connection");
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
  COURT_REQUEST_LETTER: [
    "content.court.name",
    "content.court.city",
    "content.recipient.role",
    "content.case.reference",
    "content.request.type",
    "content.request.reason",
    "content.dates.issueDate",
    "content.signatory.name",
    "content.signatory.title",
  ],
  LEGAL_OPINION: [
    "content.title",
    "content.issue",
    "content.analysis",
    "content.conclusion",
    "content.signatory.name",
    "content.signatory.title",
  ],
  TASK_MEMO: [
    "content.title",
    "content.summary",
    "content.nextActions",
    "content.owner",
  ],
  SESSION_SUMMARY: [
    "content.title",
    "content.sessionDate",
    "content.participants",
    "content.summary",
    "content.outcome",
  ],
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
    title: op?.title || "Lawyer",
    barNumber: op?.bar_number || null,
  };
}

function buildContentByType(documentType, target, entity, language, instructions) {
  const signatory = defaultSignatory();
  const today = new Date().toISOString().slice(0, 10);

  if (documentType === DOCUMENT_TYPES.COURT_REQUEST_LETTER) {
    return {
      title: language === "ar" ? "طلب رسمي" : "Official Court Request",
      court: {
        name: entity?.court || entity?.court_reference || null,
        city: null,
        chamber: null,
      },
      recipient: {
        role: language === "ar" ? "رئيس الدائرة" : "Presiding Judge",
        name: null,
      },
      case: {
        reference: entity?.reference || entity?.lawsuit_number || null,
        dossierReference: entity?.dossier_id ? `D-${entity.dossier_id}` : null,
      },
      request: {
        type: "postponement",
        reason: instructions || null,
      },
      legalReferences: [],
      dates: {
        issueDate: today,
        hearingDate: isoDate(entity?.next_hearing),
      },
      signatory,
    };
  }

  if (documentType === DOCUMENT_TYPES.LEGAL_OPINION) {
    return {
      title: language === "ar" ? "رأي قانوني" : "Legal Opinion",
      issue: instructions || entity?.title || null,
      facts: entity?.description || null,
      analysis: null,
      conclusion: null,
      references: [],
      signatory,
    };
  }

  if (documentType === DOCUMENT_TYPES.TASK_MEMO) {
    return {
      title: language === "ar" ? "مذكرة مهمة" : "Task Memo",
      summary: entity?.description || entity?.title || null,
      nextActions: [],
      deadline: isoDate(entity?.due_date),
      owner: entity?.assigned_to || signatory.name || null,
    };
  }

  return {
    title: language === "ar" ? "ملخص جلسة" : "Session Summary",
    sessionDate: isoDate(entity?.session_date || entity?.scheduled_at),
    participants: entity?.participants ? [String(entity.participants)] : [],
    summary: entity?.description || null,
    outcome: entity?.outcome || null,
    nextSessionDate: null,
  };
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

function planDocument(input = {}) {
  const normalized = normalizePlanInput(input);
  const entity = loadTargetEntity(normalized.target);
  assert(entity, `Target entity not found: ${normalized.target.type}#${normalized.target.id}`);

  const envelope = {
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
  const schema = getSchema(envelope.documentType, envelope.schemaVersion);
  const validate = ajv.compile(schema);
  const schemaValid = validate(envelope);

  const hasBlockingIssues = missingFields.length > 0 || placeholderFindings.length > 0;

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
