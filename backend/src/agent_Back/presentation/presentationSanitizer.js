"use strict";

const ID_KEY_PATTERN = /(^id$|_id$|Id$|ID$)/;
const FOREIGN_KEY_PATTERN = /_id$/i;
const REFERENCE_CODE_PATTERN = /\b[A-Z]{2,}-\d{4}-\d+\b/g;
const PHONE_NUMBER_PATTERN = /\+?\d[\d\s().-]{7,}\d/g;

const FK_ENTITY_LABELS = Object.freeze({
  client: "client",
  dossier: "dossier",
  lawsuit: "lawsuit",
  task: "task",
  session: "session",
  mission: "mission",
  officer: "officer",
  note: "note",
  document: "document",
  personal_task: "personal task",
  financial_entry: "financial entry",
});

const FIELD_PROMPT_TEMPLATES = Object.freeze({
  dossier_id: "Please select the dossier where this task should be created.",
  lawsuit_id: "Please select the lawsuit where this task should be created.",
  client_id: "Please select the client for this change.",
  task_id: "Please select the related task.",
  session_id: "Please select the related session.",
  mission_id: "Please select the related mission.",
  officer_id: "Please select the related officer.",
  personal_task_id: "Please select the related personal task.",
  financial_entry_id: "Please select the related financial entry.",
  document_id: "Please select the related document.",
});

const PRESERVE_ID_LIKE_KEYS = new Set([
  "proposalId",
  "sessionId",
  "conversationId",
  "eventId",
  "turnId",
  "requestId",
]);

const ENTITY_SERVICE_BY_TOKEN = Object.freeze({
  client: "../../services/clients.service",
  dossier: "../../services/dossiers.service",
  lawsuit: "../../services/lawsuits.service",
  task: "../../services/tasks.service",
  session: "../../services/sessions.service",
  mission: "../../services/missions.service",
  officer: "../../services/officers.service",
  document: "../../services/documents.service",
  personal_task: "../../services/personalTasks.service",
  financial_entry: "../../services/financial.service",
});

const ENTITY_LABEL_FIELDS = Object.freeze({
  client: ["name", "reference", "title"],
  dossier: ["title", "reference", "lawsuit_number", "lawsuitNumber"],
  lawsuit: ["title", "reference", "lawsuit_number", "lawsuitNumber"],
  task: ["title", "reference"],
  session: ["title", "session_type", "type", "reference"],
  mission: ["title", "mission_number", "missionNumber", "reference"],
  officer: ["name", "reference", "agency"],
  document: ["title", "reference", "original_filename"],
  personal_task: ["title", "reference"],
  financial_entry: ["title", "description", "reference"],
});

const SERVICE_CACHE = new Map();

function toTitleCase(value) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function normalizeEntityTokenFromField(field) {
  const raw = String(field || "").trim().toLowerCase();
  if (!raw) return "";
  return raw.endsWith("_id") ? raw.slice(0, -3) : raw;
}

function buildFieldPrompt(field) {
  const normalized = String(field || "").trim();
  if (!normalized) return "Please provide the missing information so I can continue.";
  if (FIELD_PROMPT_TEMPLATES[normalized]) return FIELD_PROMPT_TEMPLATES[normalized];
  if (!/_id$/i.test(normalized)) {
    const fieldLabel = toTitleCase(normalized).toLowerCase() || "value";
    return `Please provide the ${fieldLabel} for this change.`;
  }
  const entity = normalizeEntityTokenFromField(normalized);
  const entityLabel = FK_ENTITY_LABELS[entity] || toTitleCase(entity).toLowerCase() || "record";
  return `Please select the ${entityLabel} for this change.`;
}

function buildMissingFieldPrompt(fields = []) {
  const filtered = Array.isArray(fields)
    ? fields.map((f) => String(f || "").trim()).filter(Boolean)
    : [];
  if (filtered.length === 0) return "Please provide the missing information so I can continue.";
  if (filtered.length === 1) return buildFieldPrompt(filtered[0]);

  const readable = filtered.map((field) => {
    const entity = normalizeEntityTokenFromField(field);
    return FK_ENTITY_LABELS[entity] || toTitleCase(entity).toLowerCase() || "record";
  });
  return `Please select one of the required linked records (${readable.join(" or ")}).`;
}

function sanitizeValidationMessage(message) {
  const text = String(message || "").trim();
  if (!text) return text;

  const provideValuesMatch = text.match(/Provide values for:\s*(.+)\.?$/i);
  if (provideValuesMatch) {
    const fields = provideValuesMatch[1]
      .split(",")
      .map((f) => String(f || "").replace(/[.]+$/g, "").trim())
      .filter(Boolean);
    return buildMissingFieldPrompt(fields);
  }

  const exclusiveMatch = text.match(/Provide either\s+([a-z_]+)\s+or\s+([a-z_]+)\s+\(exclusive\)/i);
  if (exclusiveMatch) return buildMissingFieldPrompt([exclusiveMatch[1], exclusiveMatch[2]]);

  const eitherRequiredMatch = text.match(/Either\s+([a-z_]+)\s+or\s+([a-z_]+)\s+is required/i);
  if (eitherRequiredMatch) return buildMissingFieldPrompt([eitherRequiredMatch[1], eitherRequiredMatch[2]]);

  const singleRequiredMatch = text.match(/^([a-z_]+)\s+is required$/i);
  if (singleRequiredMatch) return buildMissingFieldPrompt([singleRequiredMatch[1]]);

  return text;
}

function getServiceForEntity(entityToken = "") {
  const key = String(entityToken || "").trim().toLowerCase();
  if (!key || !ENTITY_SERVICE_BY_TOKEN[key]) return null;
  if (SERVICE_CACHE.has(key)) return SERVICE_CACHE.get(key);
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    const service = require(ENTITY_SERVICE_BY_TOKEN[key]);
    SERVICE_CACHE.set(key, service || null);
    return service || null;
  } catch (_) {
    SERVICE_CACHE.set(key, null);
    return null;
  }
}

function resolveEntityLabelFromId(entityToken, idValue) {
  const id = Number(idValue);
  if (!entityToken || !Number.isInteger(id) || id <= 0) return null;
  const service = getServiceForEntity(entityToken);
  if (!service || typeof service.get !== "function") return null;
  try {
    const row = service.get(id);
    if (!row || typeof row !== "object") return null;
    const fields = ENTITY_LABEL_FIELDS[entityToken] || ["title", "name", "reference"];
    for (const field of fields) {
      const value = row[field];
      if (typeof value === "string" && value.trim()) return value.trim();
    }
    return null;
  } catch (_) {
    return null;
  }
}

function looksLikeJsonDump(text) {
  return /[{[]\s*"[^"]+"\s*:/.test(String(text || ""));
}

function cleanupStandaloneNumericTokens(text) {
  const source = String(text || "");
  if (!source) return source;

  const refMatches = Array.from(source.matchAll(REFERENCE_CODE_PATTERN)).map((m) => ({
    start: m.index || 0,
    end: (m.index || 0) + m[0].length,
  }));
  const phoneMatches = Array.from(source.matchAll(PHONE_NUMBER_PATTERN)).map((m) => ({
    start: m.index || 0,
    end: (m.index || 0) + m[0].length,
  }));

  return source.replace(/\b\d+\b/g, (num, offset) => {
    const inProtectedSpan =
      refMatches.some((r) => offset >= r.start && offset < r.end) ||
      phoneMatches.some((r) => offset >= r.start && offset < r.end);
    if (inProtectedSpan) return num;

    const left = source.slice(Math.max(0, offset - 12), offset).toLowerCase();
    const right = source.slice(offset + num.length, offset + num.length + 8).toLowerCase();
    if (/(id|#)\s*$/.test(left) || /^\s*(?:\)|,|\.|$)/.test(right)) return "";
    return num;
  });
}

function sanitizeDisplayText(text) {
  let out = sanitizeValidationMessage(String(text || ""));
  if (!out) return "";
  if (looksLikeJsonDump(out)) {
    out = "I prepared the change details for confirmation.";
  }
  out = out.replace(/\b([a-z]+)_id\b/gi, (_, token) => `${token} reference`);
  out = out.replace(/\b([A-Za-z][A-Za-z ]{1,40})\s+#\d+\b/g, "$1");
  out = out.replace(/\bid\s*[:#]?\s*\d+\b/gi, "");
  return out.replace(/\s+/g, " ").trim();
}

function findDisplayAlias(obj = {}, rawKey = "") {
  const key = String(rawKey || "");
  const token = normalizeEntityTokenFromField(key);
  if (!token) return null;

  const candidates = [
    `${token}_label`,
    `${token}Label`,
    `${token}_reference`,
    `${token}Reference`,
    `${token}_name`,
    `${token}Name`,
    `${token}_title`,
    `${token}Title`,
  ];
  for (const candidate of candidates) {
    const value = obj[candidate];
    if (typeof value === "string" && value.trim()) return value.trim();
  }

  const plainEntity = obj[token];
  if (plainEntity && typeof plainEntity === "object") {
    for (const k of ["label", "reference", "title", "name"]) {
      const v = plainEntity[k];
      if (typeof v === "string" && v.trim()) return v.trim();
    }
  }

  return null;
}

function sanitizeObject(obj) {
  const out = {};
  const rawFieldValue = typeof obj?.field === "string" ? String(obj.field) : "";
  const relationField = Boolean(rawFieldValue && ID_KEY_PATTERN.test(rawFieldValue));
  const relationFieldLabel = relationField
    ? `${normalizeEntityTokenFromField(rawFieldValue) || "linked"} reference`
    : null;

  for (const [key, value] of Object.entries(obj || {})) {
    if (key === "field" && relationField) {
      out.field = relationFieldLabel;
      continue;
    }
    if (
      relationField &&
      (key === "from" || key === "to") &&
      (typeof value === "number" || /^\d+$/.test(String(value || "").trim()))
    ) {
      out[key] = null;
      continue;
    }

    if (FOREIGN_KEY_PATTERN.test(key)) {
      const entityToken = normalizeEntityTokenFromField(key);
      const aliasValue = findDisplayAlias(obj, key) || resolveEntityLabelFromId(entityToken, value);
      const aliasKey = entityToken && !ID_KEY_PATTERN.test(entityToken) ? `${entityToken}_ref` : "linked_ref";
      if (typeof aliasValue === "string" && aliasValue.trim()) {
        out[aliasKey] = sanitizeDisplayText(aliasValue);
      }
      continue;
    }
    if (ID_KEY_PATTERN.test(key) && !PRESERVE_ID_LIKE_KEYS.has(key)) continue;

    const sanitizedValue = sanitizeForDisplay(value);
    if (sanitizedValue === undefined) continue;
    out[key] = sanitizedValue;
  }
  return out;
}

function sanitizeForDisplay(payload) {
  if (payload === null || payload === undefined) return payload ?? null;
  if (typeof payload === "string") return sanitizeDisplayText(payload);
  if (typeof payload === "number") return payload;
  if (typeof payload === "boolean") return payload;
  if (Array.isArray(payload)) {
    return payload
      .map((item) => sanitizeForDisplay(item))
      .filter((item) => item !== undefined && item !== "");
  }
  if (typeof payload === "object") {
    return sanitizeObject(payload);
  }
  return sanitizeDisplayText(String(payload));
}

function buildProposalDisplaySummary(proposal = {}) {
  const actionType = String(proposal?.actionType || "").toUpperCase();
  const params = proposal?.params && typeof proposal.params === "object" ? proposal.params : {};
  const previewRoot =
    proposal?.confirmation?.preview &&
    typeof proposal.confirmation.preview === "object" &&
    proposal.confirmation.preview.root &&
    typeof proposal.confirmation.preview.root === "object"
      ? proposal.confirmation.preview.root
      : {};
  const rawEntityType =
    params.entityType ||
    previewRoot.type ||
    proposal?.affectedEntities?.[0]?.type ||
    params?.workflow?.rootEntity?.type ||
    "record";
  const entityTypeLabel = toTitleCase(String(rawEntityType || "record")).toLowerCase() || "record";
  const subjectLabelRaw =
    params.entityLabel ||
    previewRoot.label ||
    params.title ||
    params?.payload?.title ||
    params?.payload?.name ||
    params?.payload?.reference ||
    params.reference ||
    params?.target?.label ||
    null;
  const subjectLabel = subjectLabelRaw ? sanitizeDisplayText(String(subjectLabelRaw)) : null;
  const subject = subjectLabel || `selected ${entityTypeLabel}`;

  const workflow =
    params?.workflow && typeof params.workflow === "object" && !Array.isArray(params.workflow)
      ? params.workflow
      : null;

  if (actionType === "CREATE_ENTITY") return `Create ${subject}`;
  if (actionType === "UPDATE_ENTITY") return `Update ${subject}`;
  if (actionType === "DELETE_ENTITY") return `Delete ${subject}`;
  if (actionType === "LINK_ENTITIES") return `Update links for ${subject}`;
  if (actionType === "ATTACH_TO_ENTITY") return `Attach content to ${subject}`;
  if (actionType === "EXECUTE_MUTATION_WORKFLOW") {
    const steps = Array.isArray(workflow?.steps) ? workflow.steps : [];
    const createTaskCount = steps.filter((step) => {
      const action = String(step?.actionType || "").toUpperCase();
      const type = String(step?.params?.entityType || "").toLowerCase();
      return action === "CREATE_ENTITY" && type === "task";
    }).length;
    if (createTaskCount > 0) {
      const affectedEntities = Array.isArray(proposal?.affectedEntities) ? proposal.affectedEntities : [];
      const dossier = affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "dossier");
      const lawsuit = affectedEntities.find((entry) => String(entry?.type || "").toLowerCase() === "lawsuit");
      const scopeBits = [];
      if (dossier?.reference) scopeBits.push(`linked to ${sanitizeDisplayText(String(dossier.reference))}`);
      if (lawsuit?.reference) scopeBits.push(`under ${sanitizeDisplayText(String(lawsuit.reference))}`);
      return `Create ${createTaskCount} tasks${scopeBits.length ? ` ${scopeBits.join(" ")}` : ""}`;
    }
    return sanitizeDisplayText(
      String(proposal?.humanReadableSummary || `Apply workflow changes for ${subject}`),
    );
  }
  return sanitizeDisplayText(String(proposal?.humanReadableSummary || `Apply changes for ${subject}`));
}

module.exports = {
  sanitizeForDisplay,
  sanitizeValidationMessage,
  sanitizeDisplayText,
  buildMissingFieldPrompt,
  buildProposalDisplaySummary,
  _internal: {
    cleanupStandaloneNumericTokens,
    buildFieldPrompt,
  },
};
