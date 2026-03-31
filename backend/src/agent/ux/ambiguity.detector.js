"use strict";

const MAX_CHOICE_CANDIDATES = 5;

const MUTATION_KEYWORDS = [
  "update",
  "change",
  "modify",
  "edit",
  "set",
  "send",
  "submit",
  "delete",
  "remove",
  "create",
  "generate",
  "prepare",
  "assign",
  "archive",
  "modifier",
  "mettre a jour",
  "supprimer",
  "envoyer",
  "creer",
  "generer",
  "prepare",
  "عدل",
  "غير",
  "حدث",
  "أرسل",
  "ارسل",
  "احذف",
  "أنشئ",
  "انشئ",
  "جهز",
];

const EXECUTE_INTENT_KEYWORDS = [
  "execute",
  "run",
  "apply",
  "commit",
  "finalize",
  "proceed",
  "نفذ",
  "طبق",
  "أكمل",
  "اكمل",
];

const REFERENCE_PRONOUNS = [
  "it",
  "that",
  "this",
  "him",
  "her",
  "them",
  "same",
  "same one",
  "ce",
  "cela",
  "lui",
  "elle",
  "meme",
  "pareil",
  "نفسه",
  "نفسها",
  "هذا",
  "هذه",
  "ذلك",
];

const TARGET_NOUNS = [
  "dossier",
  "client",
  "lawsuit",
  "mission",
  "officer",
  "task",
  "personal task",
  "personal-task",
  "invoice",
  "financial entry",
  "financial entries",
  "payment",
  "payments",
  "bailiff",
  "hearing",
  "notice",
  "document",
  "file",
  "affaire",
  "mission",
  "huissier",
  "facture",
  "paiement",
  "paiements",
  "audience",
  "notification",
  "مأمورية",
  "مهمة",
  "إشعار",
  "اشعار",
  "دفعة",
  "دفعات",
  "وثيقة",
  "ملف",
  "قضية",
  "فاتورة",
  "جلسة",
];

const ACTION_DETAIL_HINTS = [
  "email",
  "phone",
  "address",
  "status",
  "date",
  "amount",
  "title",
  "description",
  "deadline",
  "priority",
  "court",
  "reference",
  "field",
  "value",
  "telephone",
  "adresse",
  "statut",
  "montant",
  "champ",
  "valeur",
  "الهاتف",
  "البريد",
  "العنوان",
  "الحالة",
  "المبلغ",
  "التاريخ",
  "القيمة",
];

function detectAmbiguity({ input, session, retrievalContext, activeEntities } = {}) {
  const message = normalizeText(input && input.message);
  const entities = normalizeEntities(
    Array.isArray(activeEntities) ? activeEntities : session && session.activeEntities,
  );
  const candidates = resolveCandidates(message, entities, retrievalContext);

  if (!message) {
    return buildResult({
      ambiguous: false,
      reason: null,
      kind: "none",
      confidence: "low",
      candidates: [],
      highRiskIntent: false,
      fingerprint: buildFingerprint("none", [], false, false),
    });
  }

  const hasPronounReference = containsAny(message, REFERENCE_PRONOUNS);
  const mutationIntent = containsAny(message, MUTATION_KEYWORDS);
  const executeIntent = containsAny(message, EXECUTE_INTENT_KEYWORDS);
  const hasTargetNoun = containsAny(message, TARGET_NOUNS);
  const hasActionDetail = containsAny(message, ACTION_DETAIL_HINTS) || hasStructuredDetail(message);
  const hasSpecificEntity = candidates.length === 1;
  const highRiskIntent = Boolean(mutationIntent || executeIntent);

  if (hasPronounReference && candidates.length === 0) {
    return buildResult({
      ambiguous: true,
      reason: 'The reference is unclear ("it/that/same") and no target is active.',
      kind: "unclear_reference",
      confidence: highRiskIntent ? "high" : "medium",
      candidates,
      highRiskIntent,
      fingerprint: buildFingerprint("unclear_reference", candidates, mutationIntent, executeIntent),
    });
  }

  if (candidates.length > 1) {
    return buildResult({
      ambiguous: true,
      reason: `Multiple target candidates are available (${candidates.length}).`,
      kind: "multiple_candidates",
      confidence: candidates.length <= MAX_CHOICE_CANDIDATES ? "high" : "medium",
      candidates,
      highRiskIntent,
      fingerprint: buildFingerprint("multiple_candidates", candidates, mutationIntent, executeIntent),
    });
  }

  if ((mutationIntent || executeIntent) && !hasTargetNoun && !hasSpecificEntity) {
    return buildResult({
      ambiguous: true,
      reason: "The requested action does not identify a clear target.",
      kind: "missing_target",
      confidence: highRiskIntent ? "high" : "medium",
      candidates,
      highRiskIntent,
      fingerprint: buildFingerprint("missing_target", candidates, mutationIntent, executeIntent),
    });
  }

  if ((mutationIntent || executeIntent) && (hasTargetNoun || hasSpecificEntity) && !hasActionDetail) {
    return buildResult({
      ambiguous: true,
      reason: "The requested action target is clear, but required update details are missing.",
      kind: "missing_action_detail",
      confidence: highRiskIntent ? "high" : "medium",
      candidates,
      highRiskIntent,
      fingerprint: buildFingerprint("missing_action_detail", candidates, mutationIntent, executeIntent),
    });
  }

  return buildResult({
    ambiguous: false,
    reason: null,
    kind: "none",
    confidence: "low",
    candidates: [],
    highRiskIntent,
    fingerprint: buildFingerprint("none", candidates, mutationIntent, executeIntent),
  });
}

function resolveCandidates(message, entities, retrievalContext) {
  if (!Array.isArray(entities) || entities.length === 0) {
    return [];
  }

  const likelyType = detectLikelyType(message);
  const scoped = likelyType
    ? entities.filter((entity) => matchesEntityType(entity.type, likelyType))
    : entities;
  const direct = scoped.filter((entity) => entityMentioned(entity, message));
  if (direct.length > 0) {
    return direct.slice(0, 12);
  }

  if (containsAny(message, REFERENCE_PRONOUNS)) {
    return scoped.slice(0, 12);
  }

  const retrievalScoped = deriveCandidatesFromRetrieval(scoped, retrievalContext, message);
  if (retrievalScoped.length > 0) {
    return retrievalScoped.slice(0, 12);
  }

  if (likelyType && scoped.length > 1 && containsAny(message, TARGET_NOUNS)) {
    return scoped.slice(0, 12);
  }

  return [];
}

function deriveCandidatesFromRetrieval(entities, retrievalContext, message) {
  const context = toRecord(retrievalContext);
  const matches = Array.isArray(context && context.matches) ? context.matches : [];
  if (matches.length === 0) {
    return [];
  }

  const matchText = normalizeText(
    matches
      .map((row) => String(row && row.text ? row.text : ""))
      .join(" "),
  );
  if (!matchText) {
    return [];
  }

  const mergedSignal = `${message} ${matchText}`.trim();
  return entities.filter((entity) => entityMentioned(entity, mergedSignal));
}

function detectLikelyType(message) {
  if (!message) {
    return "";
  }

  if (containsAny(message, ["dossier", "file", "document", "وثيقة", "ملف"])) {
    return "dossier";
  }
  if (containsAny(message, ["client", "person", "customer", "عميل"])) {
    return "client";
  }
  if (containsAny(message, ["lawsuit", "affaire", "قضية"])) {
    return "lawsuit";
  }
  if (
    containsAny(message, [
      "invoice",
      "invoices",
      "facture",
      "factures",
      "فاتورة",
      "فواتير",
      "payment",
      "payments",
      "unpaid",
      "overdue",
      "مالية",
      "مالي",
    ])
  ) {
    return "financial_entry";
  }
  if (containsAny(message, ["task", "tache", "to-do", "todo", "مهمة"])) {
    return "task";
  }
  if (containsAny(message, ["personal task", "personal-task", "tache personnelle", "مهمة شخصية"])) {
    return "personal_task";
  }
  if (containsAny(message, ["mission", "bailiff", "huissier", "مأمورية"])) {
    return "mission";
  }
  if (containsAny(message, ["officer", "bailiff officer", "huissier", "عون"])) {
    return "officer";
  }
  if (containsAny(message, ["notification", "notifications", "alert", "alerts", "اشعار", "إشعار"])) {
    return "notification";
  }
  if (containsAny(message, ["session", "sessions", "hearing", "audience", "جلسة"])) {
    return "session";
  }
  if (containsAny(message, ["document", "documents", "attachment", "attachments", "وثيقة", "مرفق"])) {
    return "document";
  }
  return "";
}

function matchesEntityType(entityType, requestedType) {
  const left = normalizeEntityType(entityType);
  const right = normalizeEntityType(requestedType);
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  const aliases = ENTITY_TYPE_ALIASES[right] || [];
  return aliases.includes(left);
}

function normalizeEntityType(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) {
    return "";
  }
  return raw.replace(/\s+/g, "_");
}

const ENTITY_TYPE_ALIASES = {
  client: ["clients"],
  dossier: ["dossiers", "file", "files", "case", "cases"],
  lawsuit: ["lawsuits", "affaire", "affaires"],
  task: ["tasks", "todo"],
  personal_task: ["personal_tasks", "personal-task", "personaltask"],
  mission: ["missions", "bailiff"],
  officer: ["officers"],
  notification: ["notifications"],
  document: ["documents"],
  session: ["sessions", "hearing", "hearings"],
  financial_entry: ["financial_entries", "financial", "invoice", "invoices", "facture", "factures"],
};

function entityMentioned(entity, message) {
  const id = normalizeText(entity && entity.id);
  const label = normalizeText(entity && entity.label);
  if (id && includesToken(message, id)) {
    return true;
  }
  if (label && message.includes(label)) {
    return true;
  }
  return false;
}

function normalizeEntities(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => toRecord(row))
    .filter(Boolean)
    .map((entity) => ({
      type: normalizeText(entity.type),
      id: entity.id,
      label: normalizeOptionalString(entity.label),
      sourceTool: normalizeOptionalString(entity.sourceTool),
    }))
    .filter((entity) => entity.type && entity.id !== undefined && entity.id !== null);
}

function buildResult({
  ambiguous,
  reason,
  kind,
  confidence,
  candidates,
  highRiskIntent,
  fingerprint,
}) {
  return {
    ambiguous: Boolean(ambiguous),
    reason: reason || null,
    kind: kind || "none",
    confidence: confidence || "low",
    candidates: normalizeEntities(candidates),
    highRiskIntent: Boolean(highRiskIntent),
    fingerprint: fingerprint || "",
  };
}

function buildFingerprint(kind, candidates, mutationIntent, executeIntent) {
  const candidatePart = normalizeEntities(candidates)
    .map((candidate) => `${candidate.type}:${String(candidate.id)}`)
    .sort()
    .join("|");
  return [
    kind || "none",
    candidatePart || "-",
    mutationIntent ? "mutation" : "nomutation",
    executeIntent ? "execute" : "noexecute",
  ].join("#");
}

function hasStructuredDetail(message) {
  if (!message) {
    return false;
  }
  return (
    message.includes(":") ||
    /\bto\b\s+\S+/.test(message) ||
    /\bfor\b\s+\S+/.test(message) ||
    /\bavec\b\s+\S+/.test(message) ||
    /\bwith\b\s+\S+/.test(message)
  );
}

function containsAny(message, keywords) {
  if (!message) {
    return false;
  }
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      continue;
    }
    if (includesToken(message, normalizedKeyword)) {
      return true;
    }
    if (normalizedKeyword.includes(" ") && message.includes(normalizedKeyword)) {
      return true;
    }
  }
  return false;
}

function includesToken(message, token) {
  if (!message || !token) {
    return false;
  }
  const tokens = message.split(" ");
  return tokens.includes(token);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || undefined;
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  MAX_CHOICE_CANDIDATES,
  detectAmbiguity,
};
