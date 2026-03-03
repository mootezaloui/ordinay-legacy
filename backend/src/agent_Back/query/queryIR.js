"use strict";

const { detectReadIntent, detectDraftIntent } = require("../intent.classifier");
const {
  getIntentExecutionPolicy,
  requiresScope,
} = require("../read/intentExecution.contract");

const ENTITY_ALIASES = Object.freeze({
  clients: "client",
  client: "client",
  dossiers: "dossier",
  dossier: "dossier",
  lawsuits: "lawsuit",
  lawsuit: "lawsuit",
  cases: "lawsuit",
  case: "lawsuit",
  tasks: "task",
  task: "task",
  sessions: "session",
  session: "session",
  hearings: "session",
  hearing: "session",
  missions: "mission",
  mission: "mission",
  documents: "document",
  document: "document",
  notifications: "notification",
  notification: "notification",
  alerts: "notification",
  alert: "notification",
  history: "history_event",
  events: "history_event",
  entries: "financial_entry",
  invoices: "financial_entry",
  payments: "financial_entry",
  balances: "financial_entry",
  officers: "officer",
  officer: "officer",
  bailiffs: "officer",
  bailiff: "officer",
});

const POSSESSIVE_PRONOUNS = new Set(["my", "our", "their", "his", "her"]);
const ENTITY_NOUNS = new Set(Object.keys(ENTITY_ALIASES));
const HINT_STOP_WORDS = new Set([
  "about",
  "around",
  "regarding",
  "for",
  "on",
  "the",
  "a",
  "an",
  "of",
  "to",
  "me",
  "please",
  "idea",
  "give",
  "show",
  "list",
  "tell",
  "all",
  "any",
  "some",
  "overview",
  "summary",
]);

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value).split(/\s+/).filter(Boolean);
}

function inferEntityTypeFromIntent(intentName = "") {
  const value = String(intentName || "").toUpperCase();
  if (!value) return null;
  if (value.includes("PERSONAL_TASK")) return "personal_task";
  if (value.includes("CLIENT")) return "client";
  if (value.includes("DOSSIER")) return "dossier";
  if (value.includes("LAWSUIT")) return "lawsuit";
  if (value.includes("TASK")) return "task";
  if (value.includes("SESSION")) return "session";
  if (value.includes("MISSION")) return "mission";
  if (value.includes("DOCUMENT")) return "document";
  if (value.includes("NOTIFICATION")) return "notification";
  if (value.includes("HISTORY")) return "history_event";
  if (value.includes("FINANCIAL_ENTRY")) return "financial_entry";
  if (value.includes("OFFICER")) return "officer";
  return null;
}

function inferIntentFamily(intentName = "") {
  const value = String(intentName || "").toUpperCase();
  if (!value) return "UNKNOWN";
  if (value.startsWith("LIST_")) return "LIST";
  if (value.startsWith("READ_")) return "READ";
  if (value.startsWith("SUMMARIZE_")) return "SUMMARIZE";
  if (value.startsWith("EXPLAIN_")) return "EXPLAIN";
  if (value.startsWith("WEB_SEARCH") || value.startsWith("DEEP_SEARCH")) return "SEARCH";
  return "UNKNOWN";
}

function isCollectionIntent(intentName = "", readIntent = null) {
  const value = String(intentName || "").toUpperCase();
  if (value.startsWith("LIST_")) return true;
  if (value.startsWith("SUMMARIZE_") && readIntent?.aggregateSummary) return true;
  return false;
}

function extractScopeCandidates(context = {}) {
  const rows = [];
  const resolvedType = String(context?.resolvedEntity?.type || "").toLowerCase();
  const resolvedId = Number(context?.resolvedEntity?.id || 0);
  if (resolvedType && Number.isInteger(resolvedId) && resolvedId > 0) {
    rows.push({
      source: "resolved_entity",
      entityType: resolvedType,
      entityId: resolvedId,
      confidence: 0.98,
    });
  }
  const map = [
    ["taskId", "task"],
    ["sessionId", "session"],
    ["missionId", "mission"],
    ["financialEntryId", "financial_entry"],
    ["lawsuitId", "lawsuit"],
    ["dossierId", "dossier"],
    ["clientId", "client"],
  ];
  for (const [key, entityType] of map) {
    const id = Number(context?.[key] || 0);
    if (!Number.isInteger(id) || id <= 0) continue;
    rows.push({
      source: `context.${key}`,
      entityType,
      entityId: id,
      confidence: 0.95,
    });
  }
  return rows;
}

function isPossessivePluralCollectionPhrase(value = "") {
  const tokens = tokenize(value);
  if (tokens.length === 0) return false;
  for (let i = 0; i < tokens.length - 1; i += 1) {
    if (!POSSESSIVE_PRONOUNS.has(tokens[i])) continue;
    const noun = tokens[i + 1];
    if (!noun) continue;
    const mapped = ENTITY_ALIASES[noun];
    if (!mapped) continue;
    const isPluralSurface = noun.endsWith("s");
    if (isPluralSurface) return true;
  }
  return false;
}

function getHintValue(hint = {}) {
  if (hint?.type === "id") return hint?.id ?? hint?.entityId ?? hint?.value ?? null;
  if (hint?.type === "reference") return hint?.reference ?? hint?.value ?? "";
  return hint?.nameHint ?? hint?.value ?? "";
}

function looksLikeReference(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (/^[A-Z]{2,}[-_ ]?\d{2,}$/i.test(raw)) return true;
  if (/^[A-Z]{1,5}\d{2,}$/i.test(raw)) return true;
  if (/^#?\d{3,}$/.test(raw)) return true;
  return false;
}

function looksLikeNaturalName(value = "") {
  const raw = String(value || "").trim();
  if (!raw) return false;
  if (!/^[\p{L}\d][\p{L}\d'\- ]{1,80}$/u.test(raw)) return false;
  const tokens = tokenize(raw);
  if (!tokens.length || tokens.length > 5) return false;
  if (tokens.every((token) => HINT_STOP_WORDS.has(token) || ENTITY_NOUNS.has(token))) {
    return false;
  }
  return true;
}

function isGenericCollectionPhrase(value = "") {
  const tokens = tokenize(value);
  if (!tokens.length) return false;
  let meaningful = 0;
  for (const token of tokens) {
    if (POSSESSIVE_PRONOUNS.has(token)) continue;
    if (ENTITY_NOUNS.has(token)) continue;
    if (HINT_STOP_WORDS.has(token)) continue;
    meaningful += 1;
  }
  return meaningful === 0;
}

function toLegacyHint(hint = {}) {
  const value = hint?.value;
  if (hint?.type === "id") {
    return {
      type: "id",
      value: Number(value),
      entityType: hint?.entityType || undefined,
    };
  }
  if (hint?.type === "reference") {
    return {
      type: "reference",
      value: String(value || ""),
      entityType: hint?.entityType || undefined,
    };
  }
  return {
    type: "name",
    value: String(value || ""),
    entityType: hint?.entityType || undefined,
  };
}

function annotateEntityHints({
  hints = [],
  target = "single",
  intentFamily = "UNKNOWN",
  intentEntityType = null,
} = {}) {
  const rows = Array.isArray(hints) ? hints : [];
  const annotated = [];
  for (const rawHint of rows) {
    const hintType = String(rawHint?.type || "").toLowerCase();
    const hintedEntityType = String(rawHint?.entityType || intentEntityType || "")
      .trim()
      .toLowerCase() || null;
    const rawValue = getHintValue(rawHint);
    const value = hintType === "id" ? Number(rawValue) : String(rawValue || "").trim();
    if ((hintType === "id" && !(Number.isInteger(value) && value > 0)) || (hintType !== "id" && !value)) {
      continue;
    }

    const textValue = String(value || "");
    const hasPronounPlural = isPossessivePluralCollectionPhrase(textValue);
    const genericCollectionPhrase = isGenericCollectionPhrase(textValue);
    const collectionIntent = intentFamily === "LIST" && target === "collection";

    let confidence = 0.35;
    let binding = false;
    let classification = "weak_name";
    let reasonCode = "weak_name_hint";

    if (hintType === "id") {
      confidence = 0.99;
      binding = true;
      classification = "id";
      reasonCode = "explicit_id";
    } else if (hintType === "reference") {
      confidence = looksLikeReference(textValue) ? 0.96 : 0.76;
      binding = confidence >= 0.9;
      classification = "reference";
      reasonCode = binding ? "explicit_reference" : "weak_reference";
    } else {
      const nameLike = looksLikeNaturalName(textValue);
      if (hasPronounPlural || genericCollectionPhrase) {
        confidence = 0.18;
        binding = false;
        classification = "scope_operator";
        reasonCode = "pronoun_plural_collection_scope";
      } else if (looksLikeReference(textValue)) {
        confidence = 0.9;
        binding = true;
        classification = "reference_like_name";
        reasonCode = "name_looks_like_reference";
      } else if (nameLike) {
        confidence = 0.8;
        binding = true;
        classification = "name_candidate";
        reasonCode = "name_like_hint";
      } else {
        confidence = 0.42;
        binding = false;
        classification = "weak_name";
        reasonCode = "weak_name_hint";
      }
      if (collectionIntent && confidence < 0.9) {
        binding = false;
        if (classification !== "scope_operator") {
          classification = "non_binding_name";
          reasonCode = "list_intent_dominates_weak_name";
        }
      }
    }

    annotated.push({
      type: hintType === "id" ? "id" : hintType === "reference" ? "reference" : "name",
      value,
      entityType: hintedEntityType,
      confidence: Number(confidence.toFixed(2)),
      binding,
      classification,
      reasonCode,
      source: "intent_classifier",
    });
  }

  const dedupe = new Map();
  for (const hint of annotated) {
    const key = `${hint.type}:${hint.entityType || "any"}:${String(hint.value).toLowerCase()}`;
    if (!dedupe.has(key) || (dedupe.get(key)?.confidence || 0) < hint.confidence) {
      dedupe.set(key, hint);
    }
  }
  return Array.from(dedupe.values());
}

function deriveMutationSignal(message = "") {
  const text = String(message || "").toLowerCase();
  if (!text) return null;
  if (/\b(create|add|open|new)\b/.test(text)) return "CREATE";
  if (/\b(update|change|set|edit|mark|assign|reschedule|rename)\b/.test(text)) {
    return "UPDATE";
  }
  if (/\b(delete|remove|cancel|close)\b/.test(text)) return "DELETE";
  return null;
}

function buildQueryIR({ message = "", requestContext = {} } = {}) {
  const rawMessage = String(message || "");
  const readIntent = detectReadIntent(rawMessage, requestContext || {});
  const draftIntent = detectDraftIntent(rawMessage, requestContext || {});
  const mutationIntent = deriveMutationSignal(rawMessage);

  let intentName = null;
  let intentFamily = "UNKNOWN";
  let entityType = null;
  let target = "single";
  let filters = {};
  let annotatedHints = [];

  if (readIntent?.intent) {
    intentName = String(readIntent.intent || "").toUpperCase();
    intentFamily = inferIntentFamily(intentName);
    entityType = inferEntityTypeFromIntent(intentName);
    target = isCollectionIntent(intentName, readIntent) ? "collection" : "single";
    filters = readIntent?.filters && typeof readIntent.filters === "object" ? readIntent.filters : {};
    annotatedHints = annotateEntityHints({
      hints: readIntent.entityHints,
      target,
      intentFamily,
      intentEntityType: entityType,
    });
  } else if (draftIntent?.intent) {
    intentName = String(draftIntent.intent || "").toUpperCase();
    intentFamily = "DRAFT";
    target = "single";
    filters = {};
    annotatedHints = annotateEntityHints({
      hints: draftIntent.entityHints,
      target: "single",
      intentFamily: "DRAFT",
      intentEntityType: entityType,
    });
  } else if (mutationIntent) {
    intentName = mutationIntent;
    intentFamily = mutationIntent;
  }

  const policy = getIntentExecutionPolicy(intentName || "");
  const scopeRequired =
    intentFamily === "LIST" || intentFamily === "READ" || intentFamily === "SUMMARIZE" || intentFamily === "EXPLAIN"
      ? requiresScope(intentName || "", { aggregateSummary: Boolean(readIntent?.aggregateSummary) })
      : false;
  const scopeCandidates = extractScopeCandidates(requestContext);
  const bindingHints = annotatedHints.filter((hint) => hint.binding).map(toLegacyHint);
  const nonBindingHints = annotatedHints.filter((hint) => !hint.binding);

  const confidence = {
    intent: intentName ? 0.9 : 0.2,
    entity: entityType ? 0.85 : 0.2,
    target: target === "collection" ? 0.9 : 0.75,
    overall: intentName ? 0.86 : 0.25,
  };

  return {
    rawMessage,
    intent: {
      name: intentName,
      family: intentFamily,
    },
    entityType: entityType || null,
    target,
    scope: {
      required: Boolean(scopeRequired),
      candidates: scopeCandidates,
    },
    filters,
    hints: {
      extracted: annotatedHints,
      binding: bindingHints,
      nonBinding: nonBindingHints,
    },
    entityHints: bindingHints,
    policy: {
      scopeRequired: Boolean(policy.scopeRequired),
      globalSafe: Boolean(policy.globalSafe),
      preferredExecutionPath: policy.preferredExecutionPath || "llm",
    },
    confidence,
    reasonCodes: [
      intentName ? "intent_detected" : "intent_unknown",
      target === "collection" ? "collection_semantics" : "single_semantics",
      scopeRequired ? "scope_required" : "scope_optional",
    ],
  };
}

module.exports = {
  buildQueryIR,
  annotateEntityHints,
  isPossessivePluralCollectionPhrase,
};
