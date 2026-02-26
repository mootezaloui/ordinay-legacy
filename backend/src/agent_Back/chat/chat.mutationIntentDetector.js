"use strict";

const { parseJsonResponse } = require("../llm/llm.validation");
const {
  buildMutationIntentExtractionPrompt,
} = require("./chat.mutationIntentPrompt");
const {
  buildScoreBreakdown,
  DEFAULT_THRESHOLD,
  DEFAULT_ENTITY_THRESHOLD,
} = require("./chat.mutationIntentConfidence");
const {
  logMutationIntentDetection,
  logMutationIntentClarification,
} = require("./chat.mutationIntentLogging");
const {
  getAllowedFields,
  getFieldAliases,
  getFieldTypes,
  getValueParsers,
  validatePayload,
} = require("../engine/entityAdapters");
const {
  normalizeEntityType: normalizeProposalEntityType,
} = require("../engine/agentMutationProposal.service");

const ALLOWED_ENTITY_TYPES = new Set([
  "client",
  "dossier",
  "lawsuit",
  "task",
  "personal_task",
  "mission",
  "officer",
  "session",
  "financial_entry",
  "document",
  "note",
]);

const BLOCKED_CONVERSATIONAL_ENTITY_TYPES = new Set(["note"]);
const CREATE_PARENT_REQUIRED_ENTITY_TYPES = new Set([
  "dossier",
  "lawsuit",
  "task",
  "mission",
  "session",
  "financial_entry",
  "document",
  "note",
]);

const ENTITY_ALIASES = Object.freeze({
  hearing: "session",
  hearings: "session",
  session: "session",
  sessions: "session",
  client: "client",
  clients: "client",
  dossier: "dossier",
  dossiers: "dossier",
  case: "dossier",
  cases: "dossier",
  lawsuit: "lawsuit",
  lawsuits: "lawsuit",
  task: "task",
  tasks: "task",
  "personal task": "personal_task",
  "personal tasks": "personal_task",
  personaltask: "personal_task",
  mission: "mission",
  missions: "mission",
  bailiff: "officer",
  bailiffs: "officer",
  officer: "officer",
  officers: "officer",
  "financial entry": "financial_entry",
  "financial entries": "financial_entry",
  accounting: "financial_entry",
  document: "document",
  documents: "document",
  note: "note",
  notes: "note",
});

const COMMON_FIELD_ALIASES = Object.freeze({
  status: ["status", "state", "mark as", "mark"],
  priority: ["priority"],
  phone: ["phone", "phone number", "number", "mobile"],
  alternate_phone: ["alternate phone", "secondary phone"],
  email: ["email", "e-mail"],
  address: ["address"],
  location: ["location", "place", "venue"],
  outcome: ["outcome", "result"],
  due_date: ["due date", "deadline", "due"],
  scheduled_at: [
    "scheduled at",
    "schedule",
    "hearing date",
    "session date",
    "hearing time",
    "date",
    "time",
  ],
  session_date: ["session date", "hearing date", "date"],
  assigned_to: ["assigned to", "assignee", "assigned"],
  title: ["title", "name"],
  description: ["description", "details"],
  reference: ["reference", "ref"],
  amount: ["amount", "value", "sum", "total"],
});

const ENTITY_FIELD_ALIASES = Object.freeze({
  task: {
    status: ["status", "mark", "mark as"],
    priority: ["priority"],
    due_date: ["due", "due date", "deadline"],
    assigned_to: ["assignee", "assigned to"],
  },
  personal_task: {
    status: ["status", "mark", "mark as"],
    priority: ["priority"],
    due_date: ["due", "due date", "deadline"],
  },
  session: {
    scheduled_at: [
      "date",
      "hearing date",
      "hearing time",
      "schedule",
      "scheduled at",
      "move",
      "reschedule",
    ],
    status: ["status"],
    outcome: ["outcome", "result"],
    location: ["location", "place", "court room", "room"],
  },
  client: {
    phone: ["phone", "number", "phone number"],
    email: ["email", "e-mail"],
    status: ["status"],
    address: ["address"],
  },
});

const HIGH_RISK_FIELDS = new Set([
  "client_id",
  "dossier_id",
  "lawsuit_id",
  "mission_id",
  "task_id",
  "session_id",
  "personal_task_id",
  "financial_entry_id",
  "officer_id",
  "file_path",
  "deleted_at",
  "active",
  "amount",
  "balance",
]);

const TERMINAL_STATUS_VALUES = new Set([
  "closed",
  "cancelled",
  "canceled",
  "archived",
  "deleted",
  "void",
]);

function flagEnabled(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw === undefined) return defaultValue;
  return ["1", "true", "yes", "on"].includes(String(raw).toLowerCase());
}

function numericEnv(name, fallback) {
  const n = Number.parseFloat(process.env[name] || "");
  return Number.isFinite(n) ? n : fallback;
}

function getConfig() {
  return {
    enabled: flagEnabled("AGENT_MUTATION_INTENT_DETECTION", true),
    shadowMode: flagEnabled("AGENT_MUTATION_INTENT_SHADOW_MODE", false),
    chatOnly: flagEnabled("AGENT_MUTATION_INTENT_CHAT_ONLY", true),
    threshold: numericEnv("AGENT_MUTATION_INTENT_THRESHOLD", DEFAULT_THRESHOLD),
    entityThreshold: numericEnv(
      "AGENT_MUTATION_INTENT_ENTITY_THRESHOLD",
      DEFAULT_ENTITY_THRESHOLD,
    ),
    allowCreate: flagEnabled("AGENT_MUTATION_INTENT_ALLOW_CREATE", true),
    allowHighRisk: flagEnabled("AGENT_MUTATION_INTENT_ALLOW_HIGH_RISK", false),
    requireRiskAck: flagEnabled("AGENT_MUTATION_INTENT_REQUIRE_RISK_ACK", true),
    logComponentScores: flagEnabled(
      "AGENT_MUTATION_INTENT_LOG_COMPONENT_SCORES",
      true,
    ),
    llmExtractionEnabled: flagEnabled(
      "AGENT_MUTATION_INTENT_LLM_EXTRACTOR",
      true,
    ),
    maxProposalsPerTurn: Math.max(
      1,
      Number.parseInt(
        process.env.AGENT_MUTATION_INTENT_MAX_PROPOSALS_PER_TURN || "1",
        10,
      ) || 1,
    ),
  };
}

function normalizeText(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalizeText(value).toLowerCase();
}

function isSlashInput(message) {
  return /^\s*\//.test(String(message || ""));
}

function isConfirmationLike(message) {
  return /^(yes|yeah|yep|ok|okay|confirm|do it|go ahead|proceed|sure)\b/i.test(
    normalizeText(message),
  );
}

function isCancelLike(message) {
  return /^(cancel|stop|never ?mind|nevermind|ignore (that|it))\b/i.test(
    normalizeText(message),
  );
}

function detectBatchPattern(message) {
  return /\b(all|every|each|bulk|multiple|tasks and sessions|cases and tasks)\b/i.test(
    String(message || ""),
  );
}

function detectDeleteOrCloseIntentPhrase(message) {
  const text = normalizeText(message);
  if (!text) return false;
  return (
    /\b(delete|remove)\b/i.test(text) ||
    /\bclose\s+(this|it|that)\b/i.test(text) ||
    /\bclose\s+(?:the\s+)?(?:client|dossier|lawsuit|case|task|personal\s+task|mission|officer|bailiff|session|hearing|financial\s+entry|document)\b/i.test(
      text,
    ) ||
    /\breopen\s+(?:the\s+)?(?:client|dossier|lawsuit|case|task|personal\s+task|mission|officer|bailiff|session|hearing|financial\s+entry|document)\b/i.test(
      text,
    )
  );
}

function detectQuestionOrHypothetical(message) {
  const text = normalizeText(message);
  if (!text) return false;
  if (/[?]$/.test(text)) return true;
  return /\b(what if|if i|can i|could i|should i|would it|maybe we should)\b/i.test(
    text,
  );
}

function detectClientInactiveIntentPhrase(message) {
  const text = lower(message);
  if (!text) return false;
  return (
    /\b(not\s+my\s+client\s+anymore)\b/.test(text) ||
    /\b(is\s+not\s+my\s+client\s+anymore)\b/.test(text) ||
    /\b(isn['’]t\s+my\s+client\s+anymore)\b/.test(text) ||
    /\b(no\s+longer\s+my\s+client)\b/.test(text) ||
    (/\bclient\b/.test(text) &&
      (/\b(is\s+not\s+mine\s+anymore)\b/.test(text) ||
        /\b(isn['’]t\s+mine\s+anymore)\b/.test(text) ||
        /\b(no\s+longer\s+mine)\b/.test(text)))
  );
}

function detectNarrativeLawsuitCreateSignal(message) {
  const text = lower(message);
  if (!text || !/\bdivorce\b/.test(text)) return false;
  return (
    /\bmy\s+client\b/.test(text) ||
    /\bclient\b/.test(text) ||
    /\bfor\s+[a-z]/.test(text) ||
    /\b(is\s+(?:going\s+to\s+have|having)|will\s+have|has)\b/.test(text)
  );
}

function extractEntityMention(message) {
  const text = String(message || "");
  const entityRegex =
    /\b(personal\s+tasks?|personal_task|financial\s+entries?|financial_entry|hearings?|sessions?|clients?|dossiers?|lawsuits?|cases?|tasks?|missions?|bailiffs?|officers?|documents?|notes?)\b(?:\s*#?\s*(\d+))?/iu;
  const match = text.match(entityRegex);
  if (!match) return null;
  const rawLabel = String(match[1] || "")
    .toLowerCase()
    .replace(/\s+/g, " ");
  const entityType =
    ENTITY_ALIASES[rawLabel] ||
    ENTITY_ALIASES[rawLabel.replace(/s$/, "")] ||
    null;
  const entityId = match[2] ? Number(match[2]) : null;
  return entityType ? { entityType, entityId, rawLabel } : null;
}

function escapeRegex(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function cleanEntityNameQuery(value) {
  if (value === null || value === undefined) return null;
  let cleaned = String(value).trim();
  cleaned = cleaned.replace(/^[\s"'“”‘’`]+|[\s"'“”‘’`]+$/g, "");
  cleaned = cleaned.replace(/^[#:\-]+/, "");
  cleaned = cleaned.replace(/[?!.;,:\s]+$/g, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned || null;
}

function buildEntityAliasPattern(entityType) {
  if (!entityType) return null;
  const aliases = Object.entries(ENTITY_ALIASES)
    .filter(([, normalized]) => normalized === entityType)
    .map(([alias]) => alias)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  if (!aliases.length) return null;
  return aliases
    .map((alias) => escapeRegex(alias).replace(/\s+/g, "\\s+"))
    .join("|");
}

function trimMutationTailFromQuery(value) {
  let text = cleanEntityNameQuery(value);
  if (!text) return null;
  text = text.replace(
    /\b(is\s+(?:going\s+to\s+have|having|about\s+to\s+have)|will\s+have|has)\b[\s\S]*$/i,
    "",
  );
  text = text.replace(
    /\b(status|state|priority|due date|deadline|scheduled at|session date|hearing date|date|time|location|place|outcome|result|assigned to|assignee|phone|email|address|reference|amount)\b[\s\S]*$/i,
    "",
  );
  text = text.replace(/\s+/g, " ").trim();
  return cleanEntityNameQuery(text);
}

function extractEntityNameQuery({ message, entityType }) {
  const source = String(message || "");
  if (!source || !entityType) return null;

  if (entityType === "client" && detectClientInactiveIntentPhrase(source)) {
    const match = source.match(
      /^(.+?)\s+(?:is\s+not\s+my\s+client\s+anymore|isn['’]t\s+my\s+client\s+anymore|not\s+my\s+client\s+anymore|no\s+longer\s+my\s+client)\b/i,
    );
    const extracted = cleanEntityNameQuery(match?.[1] || "");
    if (extracted) return extracted;
    const altMatch = source.match(
      /^(?:client\s+)?(.+?)\s+(?:is\s+not\s+mine\s+anymore|isn['’]t\s+mine\s+anymore|no\s+longer\s+mine)\b/i,
    );
    const altExtracted = cleanEntityNameQuery(altMatch?.[1] || "");
    if (altExtracted) return altExtracted;
  }

  const aliasPattern = buildEntityAliasPattern(entityType);
  if (aliasPattern) {
    const typeFirst = new RegExp(
      `\\b(?:${aliasPattern})\\b\\s*[:#-]?\\s*(.+)$`,
      "iu",
    );
    const typeFirstMatch = source.match(typeFirst);
    if (typeFirstMatch) {
      const query = trimMutationTailFromQuery(typeFirstMatch[1]);
      if (query) return query;
    }

    const destructive = new RegExp(
      `\\b(?:close|delete|remove|open|reopen|archive|cancel)\\b\\s+(?:the\\s+)?(?:${aliasPattern})\\b\\s*[:#-]?\\s*(.+)$`,
      "iu",
    );
    const destructiveMatch = source.match(destructive);
    const destructiveQuery = cleanEntityNameQuery(destructiveMatch?.[1] || "");
    if (destructiveQuery) return destructiveQuery;
  }

  const quoted = source.match(/["“”'‘’]([^"“”'‘’]{2,})["“”'‘’]/u);
  return cleanEntityNameQuery(quoted?.[1] || "");
}

function prefilterMutationIntent(message) {
  const text = normalizeText(message);
  if (!text) {
    return {
      pass: false,
      reason: "empty",
      intentVerbClarity: 0,
      operationConfidence: 0,
    };
  }
  if (detectQuestionOrHypothetical(text)) {
    return {
      pass: false,
      reason: "question_or_hypothetical",
      intentVerbClarity: 0.35,
      operationConfidence: 0.35,
    };
  }
  if (detectDeleteOrCloseIntentPhrase(text)) {
    return {
      pass: true,
      reason: "delete_or_close_phrase",
      intentVerbClarity: 0.9,
      operationConfidence: 0.9,
    };
  }
  if (detectClientInactiveIntentPhrase(text)) {
    return {
      pass: true,
      reason: "client_inactive_phrase",
      intentVerbClarity: 0.9,
      operationConfidence: 0.9,
    };
  }
  if (detectNarrativeLawsuitCreateSignal(text)) {
    return {
      pass: true,
      reason: "narrative_lawsuit_create_signal",
      intentVerbClarity: 0.62,
      operationConfidence: 0.68,
    };
  }
  const hasCreateVerb =
    /\b(create|add)\b/i.test(text) ||
    /\bopen\s+(?:a\s+)?new\b/i.test(text) ||
    /\bnew\s+(case|lawsuit|task|session|mission|dossier)\b/i.test(text);
  const hasVerb = /\b(update|change|set|move|reschedule|mark)\b/i.test(text);
  const hasToPattern = /\b(to|as)\b/i.test(text);
  if (!hasVerb && !hasToPattern && !hasCreateVerb) {
    return {
      pass: false,
      reason: "no_mutation_verb",
      intentVerbClarity: 0.2,
      operationConfidence: 0.2,
    };
  }
  return {
    pass: true,
    reason: "candidate",
    intentVerbClarity: hasVerb ? 0.96 : hasCreateVerb ? 0.9 : 0.75,
    operationConfidence: hasVerb ? 0.95 : hasCreateVerb ? 0.9 : 0.7,
  };
}

function getActiveEntity(executionContext = {}, llmHistory = {}) {
  const active =
    executionContext.activeEntity || llmHistory.activeEntity || null;
  if (
    active &&
    typeof active === "object" &&
    Number.isInteger(Number(active.id)) &&
    Number(active.id) > 0
  ) {
    return {
      type: normalizeProposalEntityType(active.type),
      id: Number(active.id),
    };
  }

  const scopeMap = [
    ["clientId", "client"],
    ["dossierId", "dossier"],
    ["lawsuitId", "lawsuit"],
    ["taskId", "task"],
    ["missionId", "mission"],
    ["personalTaskId", "personal_task"],
    ["financialEntryId", "financial_entry"],
    ["officerId", "officer"],
    ["documentId", "document"],
    ["noteId", "note"],
  ];
  for (const [key, type] of scopeMap) {
    const id = Number(executionContext?.[key]);
    if (Number.isInteger(id) && id > 0) return { type, id };
  }
  return null;
}

function normalizeEntityType(value) {
  const normalized = normalizeProposalEntityType(value);
  if (!normalized) return "";
  return String(normalized).toLowerCase();
}

function parseOperation(message, extractedOperation = null) {
  const op = lower(extractedOperation);
  if (op === "update" || op === "create" || op === "delete") return op;
  const text = lower(message);
  if (detectClientInactiveIntentPhrase(text)) return "update";
  if (detectNarrativeLawsuitCreateSignal(text)) return "create";
  if (/\b(delete|remove)\b/.test(text)) return "delete";
  if (/\b(close|reopen)\b/.test(text)) return "update";
  if (/\bopen\s+(?:a\s+)?new\b/.test(text)) return "create";
  if (/\b(update|change|set|move|reschedule|mark)\b/.test(text))
    return "update";
  if (/\b(create|add|new)\b/.test(text)) return "create";
  return "unknown";
}

function extractReferenceToken(text) {
  const m = String(text || "").match(/\b(?:PRO|DOS|MIS)-\d{4}-\d+\b/i);
  return m ? String(m[0]).toUpperCase() : null;
}

function extractCreateParentHint({ message, entityType }) {
  const text = String(message || "");
  const ref = extractReferenceToken(text);
  if (ref) {
    if (/^PRO-/i.test(ref))
      return { entityType: "lawsuit", reference: ref, source: "reference" };
    if (/^DOS-/i.test(ref))
      return { entityType: "dossier", reference: ref, source: "reference" };
    if (/^MIS-/i.test(ref))
      return { entityType: "mission", reference: ref, source: "reference" };
  }
  const clientNarrative = text.match(
    /\bmy\s+client\s+(.+?)(?:\s+is\b|\s+has\b|\s+will\b|\s+going\b|\s+he(?:['’]s|\s+is)\b|\s+she(?:['’]s|\s+is)\b|\s+they(?:['’]ve|\s+have|['’]re|\s+are)\b|\s*[—–-]\s*|[,:;.]|$)/iu,
  );
  if (clientNarrative?.[1]) {
    const clientName = trimMutationTailFromQuery(clientNarrative[1]);
    if (clientName) {
      return {
        entityType: "client",
        name: clientName,
        source: "name",
      };
    }
  }
  const forName = text.match(
    /\bfor\s+([A-Za-z][\p{L}\p{N}' -]{1,80})(?:\s+(?:can|please|so|who|with|on|its|it's)\b|[,.?!]|$)/iu,
  );
  if (forName?.[1] && entityType !== "client") {
    return {
      entityType: "client",
      name: cleanEntityNameQuery(forName[1]),
      source: "name",
    };
  }
  return null;
}

function buildCreatePayloadFromMessage({ message, entityType }) {
  void message;
  void entityType;
  // Semantic create fields are authored by the creation planner (LLM + adapter validation).
  // The detector only provides structural intent/entity/parent signals.
  return {};
}

function inferCreateTargetEntityType(message, fallback = "") {
  const text = String(message || "");
  if (detectNarrativeLawsuitCreateSignal(text)) return "dossier";
  const patterns = [
    { regex: /\b(?:create|open)\s+(?:a\s+)?new\s+lawsuit\b/i, type: "lawsuit" },
    { regex: /\bnew\s+lawsuit\b/i, type: "lawsuit" },
    { regex: /\b(?:create|open)\s+(?:a\s+)?new\s+case\b/i, type: "dossier" },
    { regex: /\bnew\s+case\b/i, type: "dossier" },
    { regex: /\badd\s+(?:a\s+)?task\b/i, type: "task" },
    { regex: /\bcreate\s+(?:a\s+)?task\b/i, type: "task" },
    { regex: /\bcreate\s+(?:a\s+)?dossier\b/i, type: "dossier" },
    { regex: /\bopen\s+(?:a\s+)?new\s+dossier\b/i, type: "dossier" },
  ];
  for (const p of patterns) {
    if (p.regex.test(text)) return p.type;
  }
  return normalizeEntityType(fallback || "");
}

function inferFieldFromText({
  entityType,
  text,
  allowedFields,
  adapterFieldAliases = {},
}) {
  const normalizedText = lower(text);
  if (!normalizedText) return { field: null, confidence: 0.2, inferred: false };

  if (
    entityType === "client" &&
    detectClientInactiveIntentPhrase(normalizedText) &&
    allowedFields.includes("status")
  ) {
    return { field: "status", confidence: 0.95, inferred: true };
  }

  if (
    entityType === "session" &&
    /\b(move|reschedule)\b/.test(normalizedText) &&
    /\bto\b/.test(normalizedText) &&
    allowedFields.includes("scheduled_at")
  ) {
    return { field: "scheduled_at", confidence: 0.95, inferred: true };
  }

  if (
    /\b(close|reopen)\b/.test(normalizedText) &&
    allowedFields.includes("status")
  ) {
    return { field: "status", confidence: 0.9, inferred: true };
  }

  if (
    /\bmark\b/.test(normalizedText) &&
    /\b(as\s+)?(done|completed|complete|open|closed|cancelled|canceled|inactive|active)\b/.test(
      normalizedText,
    ) &&
    allowedFields.includes("status")
  ) {
    return { field: "status", confidence: 0.94, inferred: true };
  }

  let best = null;
  for (const field of allowedFields) {
    const aliases = new Set([
      field,
      field.replace(/_/g, " "),
      ...((adapterFieldAliases || {})[field] || []),
      ...(COMMON_FIELD_ALIASES[field] || []),
      ...((ENTITY_FIELD_ALIASES[entityType] || {})[field] || []),
    ]);
    for (const alias of aliases) {
      const token = lower(alias);
      if (!token) continue;
      if (normalizedText.includes(token)) {
        const confidence =
          token === lower(field) || token === field.replace(/_/g, " ")
            ? 0.96
            : 0.88;
        if (!best || confidence > best.confidence) {
          best = { field, confidence, inferred: token !== lower(field) };
        }
      }
    }
  }

  return best || { field: null, confidence: 0.25, inferred: false };
}

function extractRawValueFromText({ text, field }) {
  const source = normalizeText(text);
  if (!source) return "";

  if (field === "status" && detectClientInactiveIntentPhrase(source)) {
    return "inactive";
  }
  if (field === "status" && /\bclose\b/i.test(source)) {
    return "closed";
  }
  if (field === "status" && /\breopen\b/i.test(source)) {
    return "open";
  }

  let match = source.match(/\b(?:to|as)\s+(.+?)\s*$/i);
  if (match) return match[1].trim().replace(/[.?!]\s*$/, "");

  match = source.match(
    /\bmark\b.+?\b(done|completed|complete|open|closed|cancelled|canceled)\b/i,
  );
  if (match) return match[1].trim();

  if (field && /\b(move|reschedule)\b/i.test(source)) {
    match = source.match(/\bto\s+(.+?)\s*$/i);
    if (match) return match[1].trim().replace(/[.?!]\s*$/, "");
  }

  return "";
}

function isTemporalField(field) {
  return /(_at|_date)$/.test(String(field || ""));
}

function toIsoDate(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function parseTemporalValue(rawValue) {
  const raw = normalizeText(rawValue);
  if (!raw) return { ok: false, error: "missing_value", confidence: 0.1 };
  if (/^\d{1,2}\/\d{1,2}(?:\/\d{2,4})?$/.test(raw)) {
    return { ok: false, error: "ambiguous_date", confidence: 0.1 };
  }

  const today = new Date();
  const lowered = raw.toLowerCase();
  if (lowered === "today") {
    return {
      ok: true,
      value: toIsoDate(today),
      displayValue: toIsoDate(today),
      confidence: 0.9,
    };
  }
  if (lowered === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return {
      ok: true,
      value: toIsoDate(d),
      displayValue: toIsoDate(d),
      confidence: 0.88,
    };
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return { ok: true, value: raw, displayValue: raw, confidence: 0.98 };
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    const isoDate = toIsoDate(parsed);
    return {
      ok: true,
      value: isoDate,
      displayValue: isoDate,
      confidence: /[A-Za-z]/.test(raw) ? 0.93 : 0.8,
    };
  }
  return { ok: false, error: "invalid_date", confidence: 0.2 };
}

function parseValueWithParserHint(parserHint, raw) {
  const hint = lower(parserHint);
  if (!hint) return null;
  if (hint === "date" || hint === "datetime_or_date" || hint === "temporal") {
    return parseTemporalValue(raw);
  }
  if (hint === "number" || hint === "float" || hint === "decimal") {
    const num = Number(String(raw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(num))
      return { ok: false, error: "invalid_number", confidence: 0.2 };
    return {
      ok: true,
      value: num,
      displayValue: String(num),
      confidence: 0.95,
    };
  }
  if (hint === "integer" || hint === "id") {
    const num = Number(raw);
    if (!Number.isInteger(num) || num <= 0) {
      return { ok: false, error: "invalid_id_value", confidence: 0.15 };
    }
    return {
      ok: true,
      value: num,
      displayValue: String(num),
      confidence: 0.95,
    };
  }
  if (hint === "enum_token") {
    const value = String(raw).toLowerCase().replace(/\s+/g, "_");
    return { ok: true, value, displayValue: value, confidence: 0.95 };
  }
  if (hint === "string") {
    return {
      ok: true,
      value: String(raw),
      displayValue: String(raw),
      confidence: 0.88,
    };
  }
  return null;
}

function parseValueForField(
  field,
  rawValue,
  { fieldType = null, parserHint = null } = {},
) {
  const raw = normalizeText(rawValue);
  if (!raw) return { ok: false, error: "missing_value", confidence: 0.1 };
  const hinted =
    parseValueWithParserHint(parserHint, raw) ||
    parseValueWithParserHint(fieldType, raw);
  if (hinted) return hinted;
  if (isTemporalField(field)) return parseTemporalValue(raw);
  if (/(^|_)(amount|duration|estimated_time)$/.test(field)) {
    const num = Number(String(raw).replace(/[,\s]/g, ""));
    if (!Number.isFinite(num))
      return { ok: false, error: "invalid_number", confidence: 0.2 };
    return {
      ok: true,
      value: num,
      displayValue: String(num),
      confidence: 0.95,
    };
  }
  if (field === "status" || field === "priority") {
    const value = raw.toLowerCase().replace(/\s+/g, "_");
    return { ok: true, value, displayValue: value, confidence: 0.95 };
  }
  if (/_id$/.test(field)) {
    const num = Number(raw);
    if (!Number.isInteger(num) || num <= 0) {
      return { ok: false, error: "invalid_id_value", confidence: 0.15 };
    }
    return {
      ok: true,
      value: num,
      displayValue: String(num),
      confidence: 0.95,
    };
  }
  return { ok: true, value: raw, displayValue: raw, confidence: 0.85 };
}

function normalizeEntityFieldParsedValue({ entityType, field, parsed }) {
  if (!parsed || parsed.ok !== true) return parsed;
  const normalizedEntityType = String(entityType || "").toLowerCase();
  const normalizedField = String(field || "").toLowerCase();
  if (normalizedEntityType === "client" && normalizedField === "status") {
    const token = String(parsed.value || "")
      .toLowerCase()
      .replace(/\s+/g, "_");
    if (
      ["inactive", "in_active", "not_active", "former_client"].includes(token)
    ) {
      return {
        ...parsed,
        value: "inActive",
        displayValue: "inactive",
        confidence: Math.max(0.92, Number(parsed.confidence || 0.9)),
      };
    }
    if (token === "active") {
      return {
        ...parsed,
        value: "active",
        displayValue: "active",
      };
    }
  }
  return parsed;
}

function sanitizeCandidateForLog(candidate = null) {
  if (!candidate || typeof candidate !== "object") return null;
  return {
    entityType: candidate.entityType || null,
    entityId: candidate.entityId || null,
    operation: candidate.operation || null,
    field: candidate.field || null,
    hasNewValue:
      candidate.newValue !== undefined && candidate.newValue !== null,
    valuePreview:
      candidate.newValue === undefined || candidate.newValue === null
        ? null
        : String(candidate.newValue).slice(0, 60),
  };
}

function assessRisk({ field, parsedValue }) {
  const normalizedField = String(field || "").toLowerCase();
  if (HIGH_RISK_FIELDS.has(normalizedField))
    return { risk: "high", reason: "sensitive_field" };
  if (
    normalizedField === "status" &&
    TERMINAL_STATUS_VALUES.has(String(parsedValue || "").toLowerCase())
  ) {
    return { risk: "high", reason: "terminal_status" };
  }
  return { risk: "low", reason: null };
}

function buildClarification(
  question,
  reason,
  scores,
  candidate = null,
  extra = {},
) {
  return { decision: "clarify", reason, question, candidate, scores, ...extra };
}

function buildNoIntent(reason, scores = null) {
  return { decision: "no_intent", reason, ...(scores ? { scores } : {}) };
}

function buildIntentSentence({ entityType, entityId, field, displayValue }) {
  const label =
    entityType === "session" ? "hearing" : entityType.replace(/_/g, " ");
  return `I detected a strong update request: set ${label} ${entityId} ${field.replace(/_/g, " ")} to ${displayValue}.`;
}

async function tryLlmExtract({
  message,
  llmHistory,
  activeEntity,
  extractionFn,
  enabled,
}) {
  if (!enabled || typeof extractionFn !== "function") return null;
  try {
    const prompt = buildMutationIntentExtractionPrompt({
      message,
      activeEntity,
      allowedEntityTypes: Array.from(ALLOWED_ENTITY_TYPES),
    });
    const raw = await extractionFn(prompt, llmHistory || null);
    const parsed = parseJsonResponse(raw);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch (_) {
    return null;
  }
}

function buildHeuristicCandidate({ message, activeEntity }) {
  const entityMention = extractEntityMention(message);
  const entityType = normalizeEntityType(
    entityMention?.entityType || activeEntity?.type || "",
  );
  const entityId =
    Number.isInteger(entityMention?.entityId) && entityMention.entityId > 0
      ? entityMention.entityId
      : activeEntity?.type === entityType && Number.isInteger(activeEntity?.id)
        ? Number(activeEntity.id)
        : null;

  return {
    hasMutationIntent: true,
    intentStrength: "strong",
    operation: parseOperation(message),
    entityType,
    entityReference:
      entityId && entityMention?.entityId
        ? { kind: "id", value: String(entityId) }
        : entityId
          ? { kind: "active_entity", value: String(entityId) }
          : { kind: "unknown", value: null },
    field: null,
    newValueRaw: null,
    reasoningSummary: "User requested a mutation in conversation.",
    intentSentence: null,
    ambiguityFlags: [],
    modelConfidence: entityMention ? 0.78 : 0.6,
  };
}

function normalizeLlmCandidate(llmCandidate, activeEntity) {
  if (!llmCandidate || typeof llmCandidate !== "object") return null;
  return {
    hasMutationIntent: Boolean(llmCandidate.hasMutationIntent),
    intentStrength: String(llmCandidate.intentStrength || "weak").toLowerCase(),
    operation: parseOperation("", llmCandidate.operation),
    entityType: normalizeEntityType(
      llmCandidate.entityType || activeEntity?.type || "",
    ),
    entityReference:
      llmCandidate.entityReference &&
      typeof llmCandidate.entityReference === "object"
        ? {
            kind: String(
              llmCandidate.entityReference.kind || "unknown",
            ).toLowerCase(),
            value:
              llmCandidate.entityReference.value === undefined
                ? null
                : String(llmCandidate.entityReference.value),
          }
        : { kind: "unknown", value: null },
    field:
      normalizeText(llmCandidate.field).replace(/\s+/g, "_").toLowerCase() ||
      null,
    newValueRaw:
      llmCandidate.newValueRaw === undefined ||
      llmCandidate.newValueRaw === null
        ? null
        : String(llmCandidate.newValueRaw),
    reasoningSummary:
      normalizeText(llmCandidate.reasoningSummary) ||
      "User requested a mutation in conversation.",
    intentSentence: normalizeText(llmCandidate.intentSentence) || null,
    ambiguityFlags: Array.isArray(llmCandidate.ambiguityFlags)
      ? llmCandidate.ambiguityFlags.map((v) => String(v))
      : [],
    modelConfidence: Number.isFinite(Number(llmCandidate.modelConfidence))
      ? Number(llmCandidate.modelConfidence)
      : null,
  };
}

function mergePendingClarification({ pending, message, activeEntity }) {
  if (!pending || typeof pending !== "object") return null;
  const candidate = { ...(pending.candidate || {}) };
  const missing = new Set(
    Array.isArray(pending.missing) ? pending.missing : [],
  );
  const text = normalizeText(message);
  const kind = String(pending.kind || "");

  if (kind === "create_parent") {
    if (missing.has("parent") && text) {
      candidate.parentReplyText = text;
      missing.delete("parent");
    }
    return { candidate, missing: Array.from(missing) };
  }

  if (missing.has("entityId")) {
    const idMatch = text.match(/\b(\d+)\b/);
    if (idMatch) {
      candidate.entityId = Number(idMatch[1]);
      missing.delete("entityId");
    } else if (activeEntity && activeEntity.type === candidate.entityType) {
      candidate.entityId = activeEntity.id;
      missing.delete("entityId");
    }
  }
  if (missing.has("field")) {
    candidate.resumeFieldText = text;
  }
  if (missing.has("newValue")) {
    candidate.newValueRaw = text;
    missing.delete("newValue");
  }
  return { candidate, missing: Array.from(missing) };
}

async function validateAndBuildCandidate({
  message,
  extracted,
  activeEntity,
  config,
  entityNameResolver = null,
}) {
  const hardGateFailures = [];
  const scores = {
    intentVerbClarity: 0.95,
    operationConfidence: 0.95,
    entityTypeConfidence: 0.9,
    entityResolutionConfidence: 0.9,
    fieldParseConfidence: 0.9,
    valueParseConfidence: 0.9,
    contextCoherenceConfidence: 0.8,
  };

  const operation = parseOperation(message, extracted.operation);
  scores.operationConfidence =
    operation === "update"
      ? 0.98
      : operation === "create"
        ? 0.95
        : operation === "delete"
          ? 0.9
          : 0.3;

  let entityType = normalizeEntityType(
    extracted.entityType || activeEntity?.type || "",
  );
  if (!entityType || !ALLOWED_ENTITY_TYPES.has(entityType)) {
    scores.entityTypeConfidence = 0.2;
    hardGateFailures.push("entity_type_missing_or_unsupported");
  }
  if (BLOCKED_CONVERSATIONAL_ENTITY_TYPES.has(entityType)) {
    hardGateFailures.push("entity_type_blocked_conversationally");
  }

  let entityId = null;
  let entityResolutionConfidence = 0.1;
  let entityResolutionSource = null;
  let entityResolutionLookup = null;
  const ref = extracted.entityReference || {};
  if (
    ref.kind === "id" &&
    Number.isInteger(Number(ref.value)) &&
    Number(ref.value) > 0
  ) {
    entityId = Number(ref.value);
    entityResolutionConfidence = 1;
    entityResolutionSource = "explicit_id";
  } else if (
    Number.isInteger(Number(extracted.entityId)) &&
    Number(extracted.entityId) > 0
  ) {
    entityId = Number(extracted.entityId);
    entityResolutionConfidence = 1;
    entityResolutionSource = "explicit_id";
  } else if (
    activeEntity &&
    activeEntity.type === entityType &&
    Number.isInteger(Number(activeEntity.id)) &&
    Number(activeEntity.id) > 0
  ) {
    entityId = Number(activeEntity.id);
    entityResolutionConfidence = 0.95;
    entityResolutionSource = "active_entity";
  } else if (
    operation !== "create" &&
    entityType &&
    typeof entityNameResolver === "function"
  ) {
    const query = extractEntityNameQuery({ message, entityType });
    if (query) {
      try {
        const lookup = await entityNameResolver({ entityType, query, message });
        if (lookup && typeof lookup === "object") {
          entityResolutionLookup = {
            kind: String(lookup.kind || "none"),
            query,
            candidates: Array.isArray(lookup.candidates)
              ? lookup.candidates
              : [],
            total: Number.isFinite(Number(lookup.total))
              ? Number(lookup.total)
              : undefined,
            overflow: lookup.overflow === true,
            matchKind: lookup.matchKind || null,
          };
          if (
            lookup.kind === "one" &&
            Number.isInteger(Number(lookup.id)) &&
            Number(lookup.id) > 0
          ) {
            entityId = Number(lookup.id);
            entityResolutionConfidence =
              lookup.matchKind === "exact" ? 0.99 : 0.9;
            entityResolutionSource =
              lookup.matchKind === "exact" ? "name_exact" : "name_fuzzy";
          }
        }
      } catch (_) {
        entityResolutionLookup = { kind: "error", query, candidates: [] };
      }
    }
  }
  scores.entityResolutionConfidence = entityResolutionConfidence;
  if (operation !== "create" && entityResolutionLookup?.kind === "many") {
    hardGateFailures.push("entity_resolution_multiple_matches");
  } else if (
    operation !== "create" &&
    entityResolutionLookup?.kind === "none"
  ) {
    hardGateFailures.push("entity_resolution_name_not_found");
  }
  if (
    operation !== "create" &&
    (!entityId || entityResolutionConfidence < config.entityThreshold)
  ) {
    hardGateFailures.push("entity_resolution_uncertain");
  }

  if (operation === "create") {
    if (!config.allowCreate) {
      hardGateFailures.push("create_blocked_by_flag");
    }

    let createEntityType = inferCreateTargetEntityType(message, entityType);
    if (!createEntityType || !ALLOWED_ENTITY_TYPES.has(createEntityType)) {
      const mention = extractEntityMention(message);
      createEntityType = normalizeEntityType(mention?.entityType || "");
    }
    if (!createEntityType || !ALLOWED_ENTITY_TYPES.has(createEntityType)) {
      hardGateFailures.push("entity_type_missing_or_unsupported");
    }

    const parentHint =
      extracted.parent && typeof extracted.parent === "object"
        ? extracted.parent
        : extracted.parentReplyText
          ? extractCreateParentHint({
              message: extracted.parentReplyText,
              entityType: createEntityType,
            }) || {
              entityType:
                createEntityType === "dossier"
                  ? "client"
                  : createEntityType === "lawsuit"
                    ? "client"
                    : "dossier",
              name: cleanEntityNameQuery(extracted.parentReplyText),
              source: "name",
            }
          : extractCreateParentHint({ message, entityType: createEntityType });
    let parent = null;
    if (parentHint) {
      if (
        parentHint.entityId &&
        Number.isInteger(Number(parentHint.entityId)) &&
        Number(parentHint.entityId) > 0
      ) {
        parent = {
          entityType: parentHint.entityType,
          entityId: Number(parentHint.entityId),
          source: "id",
        };
      } else if (
        (parentHint.reference || parentHint.name) &&
        typeof entityNameResolver === "function"
      ) {
        try {
          const lookup = await entityNameResolver({
            entityType: parentHint.entityType,
            query: parentHint.reference || parentHint.name,
            message,
          });
          if (
            lookup?.kind === "one" &&
            Number.isInteger(Number(lookup.id)) &&
            Number(lookup.id) > 0
          ) {
            parent = {
              entityType: parentHint.entityType,
              entityId: Number(lookup.id),
              source: parentHint.reference ? "reference" : "name",
            };
          } else if (lookup?.kind === "many") {
            hardGateFailures.push("parent_resolution_multiple_matches");
          } else if (lookup?.kind === "none") {
            hardGateFailures.push("parent_resolution_not_found");
          }
        } catch (_) {
          hardGateFailures.push("parent_resolution_failed");
        }
      } else {
        parent = { ...parentHint };
      }
    }
    if (CREATE_PARENT_REQUIRED_ENTITY_TYPES.has(createEntityType) && !parent) {
      hardGateFailures.push("create_parent_required_missing");
    }

    const createPayload = buildCreatePayloadFromMessage({
      message,
      entityType: createEntityType,
    });
    let createAllowedFields = [];
    try {
      createAllowedFields = getAllowedFields(createEntityType, "create") || [];
    } catch (_) {
      createAllowedFields = [];
    }
    const sanitizedPayload = Object.fromEntries(
      Object.entries(createPayload || {}).filter(([field, value]) => {
        if (value === undefined) return false;
        if (
          Array.isArray(createAllowedFields) &&
          createAllowedFields.length > 0
        ) {
          return createAllowedFields.includes(field);
        }
        return true;
      }),
    );
    const extractedReasoning = normalizeText(extracted.reasoningSummary);
    const genericReasoning =
      !extractedReasoning ||
      /^User requested (?:an update|a mutation) in conversation\.?$/i.test(
        extractedReasoning,
      );

    scores.entityResolutionConfidence = parent ? 0.95 : 0.75;
    scores.fieldParseConfidence = 0.8;
    scores.valueParseConfidence = 0.8;
    scores.contextCoherenceConfidence = parent ? 0.9 : 0.7;
    const scoreBreakdown = buildScoreBreakdown({
      scores,
      hardGateFailures,
      threshold: config.threshold,
      entityThreshold: config.entityThreshold,
    });

    return {
      candidate: {
        entityType: createEntityType,
        entityId: "new",
        operation: "create",
        field: null,
        newValue: null,
        newValueRaw: null,
        displayValue: null,
        payload: sanitizedPayload,
        parent: parent || null,
        entityResolutionSource: null,
        entityResolutionLookup: null,
        reasoningSummary: genericReasoning
          ? `User requested creating a ${String(createEntityType).replace(/_/g, " ")} based on the chat context.`
          : extractedReasoning,
        intentSentence: normalizeText(extracted.intentSentence) || null,
        risk: "low",
        riskReason: null,
        requiresExtraConfirmation: false,
      },
      scores: scoreBreakdown,
    };
  }

  if (operation === "delete") {
    if (detectBatchPattern(message))
      hardGateFailures.push("batch_update_blocked");
    if (detectQuestionOrHypothetical(message))
      hardGateFailures.push("question_or_hypothetical");
    const scoreBreakdown = buildScoreBreakdown({
      scores,
      hardGateFailures,
      threshold: config.threshold,
      entityThreshold: config.entityThreshold,
    });
    return {
      candidate: {
        entityType,
        entityId,
        operation: "delete",
        field: null,
        newValue: null,
        newValueRaw: null,
        displayValue: null,
        payload: null,
        entityResolutionSource,
        entityResolutionLookup,
        reasoningSummary:
          normalizeText(extracted.reasoningSummary) ||
          `User requested deleting ${entityType} ${entityId}.`,
        intentSentence: normalizeText(extracted.intentSentence) || null,
        risk: "high",
        riskReason: "destructive_delete",
        requiresExtraConfirmation: config.requireRiskAck,
      },
      scores: scoreBreakdown,
    };
  }

  let allowedFields = [];
  let adapterFieldAliases = {};
  let adapterFieldTypes = {};
  let adapterValueParsers = {};
  if (entityType && ALLOWED_ENTITY_TYPES.has(entityType)) {
    try {
      allowedFields = getAllowedFields(entityType, "update") || [];
      adapterFieldAliases = getFieldAliases(entityType, "update") || {};
      adapterFieldTypes = getFieldTypes(entityType, "update") || {};
      adapterValueParsers = getValueParsers(entityType, "update") || {};
    } catch (_) {
      allowedFields = [];
      adapterFieldAliases = {};
      adapterFieldTypes = {};
      adapterValueParsers = {};
    }
  }
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) {
    hardGateFailures.push("allowed_fields_unavailable");
  }

  let field =
    normalizeText(extracted.field).replace(/\s+/g, "_").toLowerCase() || null;
  let fieldConfidence = extracted.field ? 0.9 : 0.2;
  if (!field || !allowedFields.includes(field)) {
    const inferred = inferFieldFromText({
      entityType,
      text: extracted.resumeFieldText || message,
      allowedFields,
      adapterFieldAliases,
    });
    field = inferred.field;
    fieldConfidence = inferred.confidence;
  }
  scores.fieldParseConfidence = fieldConfidence;
  if (!field || !allowedFields.includes(field)) {
    hardGateFailures.push("field_unresolved_or_disallowed");
  }

  const rawValue =
    extracted.newValueRaw || extractRawValueFromText({ text: message, field });
  const parsedValueRaw = field
    ? parseValueForField(field, rawValue, {
        fieldType: adapterFieldTypes[field] || null,
        parserHint: adapterValueParsers[field] || null,
      })
    : { ok: false, confidence: 0.1 };
  const parsedValue = normalizeEntityFieldParsedValue({
    entityType,
    field,
    parsed: parsedValueRaw,
  });
  scores.valueParseConfidence = parsedValue.confidence || 0.1;
  if (!parsedValue.ok) {
    hardGateFailures.push(
      parsedValue.error === "ambiguous_date"
        ? "temporal_value_ambiguous"
        : "value_parse_failed",
    );
  }

  if (detectBatchPattern(message))
    hardGateFailures.push("batch_update_blocked");
  if (detectQuestionOrHypothetical(message))
    hardGateFailures.push("question_or_hypothetical");
  if (entityResolutionConfidence < 1) scores.contextCoherenceConfidence = 0.9;

  let payload = null;
  if (field && parsedValue.ok) {
    payload = { [field]: parsedValue.value };
    try {
      validatePayload(entityType, "update", payload);
    } catch (_) {
      hardGateFailures.push("adapter_validation_failed");
      scores.fieldParseConfidence = Math.min(scores.fieldParseConfidence, 0.7);
      scores.valueParseConfidence = Math.min(scores.valueParseConfidence, 0.7);
    }
  }

  const riskAssessment = assessRisk({ field, parsedValue: parsedValue.value });
  if (riskAssessment.risk === "high" && !config.allowHighRisk) {
    hardGateFailures.push("high_risk_blocked");
  }

  const scoreBreakdown = buildScoreBreakdown({
    scores,
    hardGateFailures,
    threshold: config.threshold,
    entityThreshold: config.entityThreshold,
  });

  return {
    candidate: {
      entityType,
      entityId,
      operation: "update",
      field,
      newValue: parsedValue.ok ? parsedValue.value : null,
      newValueRaw: rawValue || null,
      displayValue: parsedValue.ok ? parsedValue.displayValue : null,
      payload,
      entityResolutionSource,
      entityResolutionLookup,
      reasoningSummary:
        normalizeText(extracted.reasoningSummary) ||
        `User requested updating ${entityType} ${entityId}.`,
      intentSentence:
        normalizeText(extracted.intentSentence) ||
        (parsedValue.ok && field
          ? buildIntentSentence({
              entityType,
              entityId,
              field,
              displayValue: parsedValue.displayValue,
            })
          : null),
      risk: riskAssessment.risk,
      riskReason: riskAssessment.reason,
      requiresExtraConfirmation:
        riskAssessment.risk === "high" &&
        config.allowHighRisk &&
        config.requireRiskAck,
    },
    scores: scoreBreakdown,
  };
}

function buildClarificationFromFailures({
  failures,
  candidate,
  scores,
  config,
}) {
  const failureSet = new Set(failures);
  if (failureSet.has("entity_type_blocked_conversationally")) {
    return buildClarification(
      "I can’t make note changes automatically in chat. I can help you do it another way if you want.",
      "blocked_note_auto_creation",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("batch_update_blocked")) {
    return buildClarification(
      "I can only propose one single-entity update at a time. Which one specific entity and field should I update first?",
      "batch_update_blocked",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("high_risk_blocked")) {
    return buildClarification(
      "That looks like a high-risk update. I can’t prepare it automatically in chat, but I can help you prepare it for confirmation.",
      "high_risk_blocked",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("parent_resolution_multiple_matches")) {
    return buildClarification(
      "I found multiple matching parent records. Which one should I use for the new record?",
      "parent_resolution_multiple_matches",
      scores,
      candidate,
      {
        pendingClarification: {
          kind: "create_parent",
          candidate,
          missing: ["parent"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("parent_resolution_not_found")) {
    return buildClarification(
      "I couldn’t find the parent record in the app. Please confirm the client/dossier reference before I prepare the new case.",
      "parent_resolution_not_found",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("create_blocked_by_flag")) {
    return buildClarification(
      "Create requests are currently disabled in this chat path. I can still help prepare the required details.",
      "create_not_enabled",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("create_parent_required_missing")) {
    const prettyEntity = String(candidate?.entityType || "record").replace(
      /_/g,
      " ",
    );
    const parentPrompt =
      candidate?.entityType === "dossier"
        ? "Please provide the client name or reference."
        : candidate?.entityType === "lawsuit"
          ? "Please provide the client or dossier reference."
          : "Please provide the parent record reference.";
    return buildClarification(
      `I can prepare a new ${prettyEntity}, but I need the parent context first. ${parentPrompt}`,
      "create_parent_required_missing",
      scores,
      candidate,
      {
        pendingClarification: {
          kind: "create_parent",
          candidate,
          missing: ["parent"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("operation_not_update")) {
    return buildClarification(
      "I can only prepare single-field updates automatically in chat right now. For this request, I can help you prepare a confirmation-ready change.",
      "operation_not_supported",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("entity_resolution_multiple_matches")) {
    const lookup = candidate?.entityResolutionLookup || null;
    const candidates = Array.isArray(lookup?.candidates)
      ? lookup.candidates
      : [];
    const labels = candidates
      .map((item) => cleanEntityNameQuery(item?.label || item?.name || ""))
      .filter(Boolean)
      .slice(0, 3);
    const prompt =
      labels.length >= 2
        ? `Did you mean ${labels.slice(0, 2).join(" or ")}${labels.length > 2 ? " (or another match)?" : "?"}`
        : "I found multiple matching records. Which one did you mean?";
    return buildClarification(
      prompt,
      "entity_resolution_multiple_matches",
      scores,
      candidate,
      {
        pendingClarification: {
          candidate,
          missing: ["entityId"],
          createdAt: new Date().toISOString(),
          candidates: candidates.slice(0, 10),
        },
      },
    );
  }
  if (failureSet.has("entity_resolution_name_not_found")) {
    const query = cleanEntityNameQuery(
      candidate?.entityResolutionLookup?.query || "",
    );
    const entityLabel = String(candidate?.entityType || "record").replace(
      /_/g,
      " ",
    );
    return buildClarification(
      query
        ? `I couldn't find a ${entityLabel} matching "${query}". Please confirm the name or provide a more specific reference.`
        : "I couldn't find the record you referenced. Please confirm the name or provide a more specific reference.",
      "entity_resolution_name_not_found",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  if (failureSet.has("entity_resolution_uncertain")) {
    if (String(candidate?.operation || "") === "create") {
      return buildClarification(
        "I need the parent context to prepare the new record safely. Please provide the client or parent reference.",
        "create_entity_resolution_ambiguous",
        scores,
        candidate,
        {
          pendingClarification: {
            kind: "create_parent",
            candidate,
            missing: ["parent"],
            createdAt: new Date().toISOString(),
          },
        },
      );
    }
    return buildClarification(
      "Which specific entity do you want to update? Please provide the entity type and ID (for example: hearing 42).",
      "entity_resolution_ambiguous",
      scores,
      candidate,
      {
        pendingClarification: {
          candidate,
          missing: ["entityId"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("field_unresolved_or_disallowed")) {
    return buildClarification(
      "Which field should I update on that record?",
      "field_ambiguous_or_disallowed",
      scores,
      candidate,
      {
        pendingClarification: {
          candidate,
          missing: ["field"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("temporal_value_ambiguous")) {
    return buildClarification(
      "The date/time value is ambiguous. Please provide an absolute date like 2026-03-12.",
      "temporal_value_ambiguous",
      scores,
      candidate,
      {
        pendingClarification: {
          candidate,
          missing: ["newValue"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("value_parse_failed")) {
    return buildClarification(
      "I could not parse the new value safely. Please restate the update in the form: set <field> to <value>.",
      "value_parse_failed",
      scores,
      candidate,
      {
        pendingClarification: {
          candidate,
          missing: ["newValue"],
          createdAt: new Date().toISOString(),
        },
      },
    );
  }
  if (failureSet.has("question_or_hypothetical")) {
    return buildNoIntent("question_or_hypothetical", scores);
  }
  if (scores.finalConfidence < config.threshold) {
    if (String(candidate?.operation || "") === "create") {
      return buildClarification(
        "I need one more detail before I can prepare the new record safely. Please confirm the parent context (for example the client or dossier).",
        "create_confidence_below_threshold",
        scores,
        candidate,
        {
          pendingClarification: {
            kind: "create_parent",
            candidate,
            missing: ["parent"],
            createdAt: new Date().toISOString(),
          },
        },
      );
    }
    return buildClarification(
      "I am not confident enough to prepare a mutation proposal yet. Please specify the exact entity, field, and new value.",
      "confidence_below_threshold",
      scores,
      candidate,
      { pendingClarification: null },
    );
  }
  return buildClarification(
    "I need one more detail before I can prepare a safe mutation proposal.",
    "clarification_required",
    scores,
    candidate,
    { pendingClarification: null },
  );
}

async function detectStrongMutationIntent({
  message,
  llmHistory = null,
  executionContext = {},
  pendingClarification = null,
  llmExtractor = null,
  entityNameResolver = null,
  logger = null,
  sourceRoute = "/agent/chat",
} = {}) {
  const config = getConfig();
  const text = normalizeText(message);

  if (!config.enabled) return buildNoIntent("feature_disabled");
  if (!text) return buildNoIntent("empty");
  if (isSlashInput(text)) {
    logMutationIntentDetection(logger, {
      decision: "no_intent",
      reason: "explicit_command_bypass",
      flags: { explicit_command_bypass: true },
      sourceRoute,
    });
    return buildNoIntent("explicit_command_bypass");
  }
  if (isConfirmationLike(text)) return buildNoIntent("confirmation_like_reply");

  const activeEntity = getActiveEntity(executionContext, llmHistory || {});

  if (pendingClarification && isCancelLike(text)) {
    return {
      decision: "clarify",
      reason: "clarification_cancelled",
      question:
        "Okay, I cancelled the pending mutation clarification. What would you like to do instead?",
      scores: buildScoreBreakdown({
        scores: {},
        hardGateFailures: ["clarification_cancelled"],
        threshold: config.threshold,
        entityThreshold: config.entityThreshold,
      }),
      pendingClarification: null,
      clearPendingClarification: true,
    };
  }

  const pre = prefilterMutationIntent(text);
  if (!pre.pass && !pendingClarification) {
    const scores = buildScoreBreakdown({
      scores: {
        intentVerbClarity: pre.intentVerbClarity || 0.2,
        operationConfidence: pre.operationConfidence || 0.2,
        entityTypeConfidence: 0.2,
        entityResolutionConfidence: 0.2,
        fieldParseConfidence: 0.2,
        valueParseConfidence: 0.2,
        contextCoherenceConfidence: 0.3,
      },
      hardGateFailures: [pre.reason || "prefilter_failed"],
      threshold: config.threshold,
      entityThreshold: config.entityThreshold,
    });
    logMutationIntentDetection(logger, {
      decision: "no_intent",
      reason: pre.reason || "prefilter_failed",
      finalConfidence: scores.finalConfidence,
      threshold: scores.threshold,
      scores: config.logComponentScores ? scores.components : undefined,
      sourceRoute,
    });
    return buildNoIntent(pre.reason || "prefilter_failed", scores);
  }

  let extracted;
  if (pendingClarification && pendingClarification.candidate) {
    const resumed = mergePendingClarification({
      pending: pendingClarification,
      message: text,
      activeEntity,
    });
    const resumedOperation = String(
      resumed?.candidate?.operation || "update",
    ).toLowerCase();
    extracted = {
      hasMutationIntent: true,
      intentStrength: "strong",
      operation: resumedOperation,
      entityType: resumed?.candidate?.entityType,
      entityReference: resumed?.candidate?.entityId
        ? { kind: "id", value: String(resumed.candidate.entityId) }
        : { kind: "unknown", value: null },
      field: resumed?.candidate?.field || null,
      resumeFieldText: resumed?.candidate?.resumeFieldText || null,
      newValueRaw: resumed?.candidate?.newValueRaw || null,
      parent:
        resumedOperation === "create" && resumed?.candidate?.parent
          ? resumed.candidate.parent
          : null,
      parentReplyText:
        resumedOperation === "create"
          ? resumed?.candidate?.parentReplyText || text
          : null,
      reasoningSummary: "User replied to mutation clarification.",
      intentSentence: null,
      ambiguityFlags: [],
      modelConfidence: 0.92,
    };
  } else {
    const heuristic = buildHeuristicCandidate({ message: text, activeEntity });
    const llm = normalizeLlmCandidate(
      await tryLlmExtract({
        message: text,
        llmHistory,
        activeEntity,
        extractionFn: llmExtractor,
        enabled: config.llmExtractionEnabled,
      }),
      activeEntity,
    );
    extracted =
      llm && llm.hasMutationIntent !== false && llm.intentStrength !== "weak"
        ? llm
        : heuristic;
  }

  const { candidate, scores } = await validateAndBuildCandidate({
    message: text,
    extracted,
    activeEntity,
    config,
    entityNameResolver,
  });

  const failures = scores.hardGateFailures || [];
  let decision;
  if (failures.length > 0 || scores.finalConfidence < config.threshold) {
    decision = buildClarificationFromFailures({
      failures,
      candidate,
      scores,
      config,
    });
  } else {
    decision = {
      decision: "propose",
      proposalInput: {
        entityType: candidate.entityType,
        entityId: String(candidate.entityId),
        operation: candidate.operation || "update",
        payload: candidate.payload,
        ...(candidate.parent ? { parent: candidate.parent } : {}),
        reasoningSummary: candidate.reasoningSummary,
      },
      intentSentence: candidate.intentSentence,
      scores,
      risk: candidate.risk,
      requiresExtraConfirmation: candidate.requiresExtraConfirmation,
      metadata: {
        field: candidate.field,
        displayValue: candidate.displayValue,
        riskReason: candidate.riskReason,
      },
      shadowMode: config.shadowMode,
    };
  }

  logMutationIntentDetection(logger, {
    decision: decision.decision,
    reason: decision.reason || null,
    finalConfidence: scores.finalConfidence,
    threshold: scores.threshold,
    scores: config.logComponentScores ? scores.components : undefined,
    hardGateFailures: scores.hardGateFailures,
    candidate: sanitizeCandidateForLog(candidate),
    entityResolution:
      candidate.entityId &&
      scores.components.entityResolutionConfidence >= config.entityThreshold
        ? "resolved"
        : candidate.entityId
          ? "uncertain"
          : "missing",
    flags: {
      batch_detected: detectBatchPattern(text),
      destructive: candidate.risk === "high",
      explicit_command_bypass: false,
      shadowMode: config.shadowMode,
    },
    sourceRoute,
    featureFlags: {
      enabled: config.enabled,
      shadowMode: config.shadowMode,
      threshold: config.threshold,
      entityThreshold: config.entityThreshold,
    },
  });

  if (decision.decision === "clarify") {
    logMutationIntentClarification(logger, {
      reason: decision.reason,
      finalConfidence: scores.finalConfidence,
      candidate: sanitizeCandidateForLog(candidate),
      sourceRoute,
    });
  }

  return decision;
}

async function detectMutationIntent(message, resolvedContext = {}) {
  const {
    llmHistory = null,
    executionContext = {},
    pendingClarification = null,
    llmExtractor = null,
    entityNameResolver = null,
    logger = null,
    sourceRoute = "/agent/chat",
  } = resolvedContext && typeof resolvedContext === "object"
    ? resolvedContext
    : {};

  const text = normalizeText(message);
  if (!text) return null;

  if (detectDeleteOrCloseIntentPhrase(text)) {
    const activeEntity = getActiveEntity(executionContext, llmHistory || {});
    const operation = /\b(delete|remove)\b/i.test(text) ? "delete" : "update";
    const field = operation === "update" ? "status" : null;
    const value = operation === "update" ? "closed" : null;
    return {
      intentType: "mutation",
      entityType: activeEntity?.type || null,
      entityId: activeEntity?.id || null,
      operation,
      field,
      value,
      payload: field ? { [field]: value } : null,
      confidence: activeEntity?.id ? 0.9 : 0.75,
      requiresConfirmation: true,
      risk: "high",
      source: "heuristic",
      reasonCode: activeEntity?.id
        ? "destructive_phrase_detected"
        : "destructive_phrase_missing_entity",
      missing: activeEntity?.id ? [] : ["entityId"],
      routeDecision: activeEntity?.id ? "blocked" : "clarify",
      question: activeEntity?.id
        ? null
        : "Which record do you want me to change?",
      safeMessage: activeEntity?.id
        ? "I can’t apply that change automatically in chat. I can prepare it for confirmation."
        : null,
    };
  }

  const stage3 = await detectStrongMutationIntent({
    message: text,
    llmHistory,
    executionContext,
    pendingClarification,
    llmExtractor,
    entityNameResolver,
    logger,
    sourceRoute,
  });

  if (!stage3 || stage3.decision === "no_intent") return null;
  if (stage3.decision === "clarify") {
    return {
      intentType: "mutation",
      entityType: stage3?.candidate?.entityType || null,
      entityId: stage3?.candidate?.entityId || null,
      operation: stage3?.candidate?.operation || "unknown",
      field: stage3?.candidate?.field || null,
      value: stage3?.candidate?.newValue ?? null,
      payload: stage3?.candidate?.payload || null,
      confidence: stage3?.scores?.finalConfidence ?? 0,
      requiresConfirmation: true,
      risk: stage3?.candidate?.risk || "low",
      source: "hybrid",
      reasonCode: stage3.reason || "clarify",
      missing: Array.isArray(stage3?.pendingClarification?.missing)
        ? stage3.pendingClarification.missing
        : [],
      routeDecision: "clarify",
      question: stage3.question,
      stage3Decision: stage3,
    };
  }

  if (stage3.decision === "propose") {
    return {
      intentType: "mutation",
      entityType: stage3?.proposalInput?.entityType || null,
      entityId: Number(stage3?.proposalInput?.entityId) || null,
      operation: stage3?.proposalInput?.operation || "unknown",
      field: stage3?.metadata?.field || null,
      value:
        stage3?.metadata?.field && stage3?.proposalInput?.payload
          ? stage3.proposalInput.payload[stage3.metadata.field]
          : null,
      payload: stage3?.proposalInput?.payload || null,
      confidence: stage3?.scores?.finalConfidence ?? 0,
      requiresConfirmation: stage3?.requiresExtraConfirmation === true,
      risk: stage3?.risk || "low",
      source: "hybrid",
      reasonCode: "stage3_propose",
      missing: [],
      routeDecision: "orchestrate",
      stage3Decision: stage3,
    };
  }

  return null;
}

module.exports = {
  detectMutationIntent,
  detectStrongMutationIntent,
  getMutationIntentDetectorConfig: getConfig,
  _internal: {
    prefilterMutationIntent,
    extractEntityMention,
    extractEntityNameQuery,
    cleanEntityNameQuery,
    inferFieldFromText,
    parseValueForField,
    parseTemporalValue,
    detectBatchPattern,
    detectQuestionOrHypothetical,
    assessRisk,
  },
};
