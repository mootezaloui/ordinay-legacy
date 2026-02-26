"use strict";

const {
  detectReadIntent,
  detectDraftIntent,
} = require("../intent.classifier");
const { ENTITY_TYPE_DOMAIN_MAP } = require("../tools/tool.firewall");

const AUTOPICK_ENABLED =
  process.env.AGENT_CHAT_AMBIGUITY_AUTOPICK !== "false";
const AUTOPICK_MIN_SCORE = Math.max(
  0,
  Math.min(
    1,
    parseFloat(process.env.AGENT_CHAT_AMBIGUITY_MIN_SCORE || "0.75"),
  ),
);
const AUTOPICK_MIN_MARGIN = Math.max(
  0,
  Math.min(
    1,
    parseFloat(process.env.AGENT_CHAT_AMBIGUITY_MIN_MARGIN || "0.08"),
  ),
);

const ENTITY_CONFIG = Object.freeze({
  client: {
    label: "client",
    scopeKey: "clientId",
    listTool: "listClients",
    listKey: "clients",
  },
  dossier: {
    label: "dossier",
    scopeKey: "dossierId",
    listTool: "listDossiers",
    listKey: "dossiers",
  },
  lawsuit: {
    label: "lawsuit",
    scopeKey: "lawsuitId",
    listTool: "listLawsuits",
    listKey: "lawsuits",
  },
  task: {
    label: "task",
    scopeKey: "taskId",
    listTool: "listTasks",
    listKey: "tasks",
  },
  personal_task: {
    label: "personal task",
    scopeKey: "personalTaskId",
    listTool: "listPersonalTasks",
    listKey: "personalTasks",
  },
  session: {
    label: "session",
    scopeKey: "sessionId",
    listTool: "listSessions",
    listKey: "sessions",
  },
  mission: {
    label: "mission",
    scopeKey: "missionId",
    listTool: "listMissions",
    listKey: "missions",
  },
  officer: {
    label: "officer",
    scopeKey: "officerId",
    listTool: "listOfficers",
    listKey: "officers",
  },
  financial_entry: {
    label: "financial entry",
    scopeKey: "financialEntryId",
    listTool: "listFinancialEntries",
    listKey: "financialEntries",
  },
  notification: {
    label: "notification",
    scopeKey: "notificationId",
    listTool: "listNotifications",
    listKey: "notifications",
  },
  history_event: {
    label: "history event",
    scopeKey: "historyEventId",
    listTool: "listHistoryEvents",
    listKey: "historyEvents",
  },
});

const ENTITY_KEYWORDS = Object.freeze({
  client: /\bclient(s)?\b/i,
  dossier: /\b(dossier|dossiers|matter|matters|case\s*file|قضية|ملف)\b/i,
  lawsuit: /\b(lawsuit|lawsuits|case|cases|litigation|trial)\b/i,
  task: /\btask(s)?\b/i,
  personal_task: /\bpersonal\s+task(s)?\b/i,
  session: /\b(session|sessions|hearing|hearings|meeting|meetings)\b/i,
  mission: /\bmission(s)?\b/i,
  officer: /\b(officer|officers|bailiff|bailiffs|huissier|huissiers)\b/i,
  financial_entry:
    /\b(financial|invoice|invoices|payment|payments|billing|entry|entries)\b/i,
  notification: /\bnotification(s)?|alert(s)?\b/i,
  history_event: /\b(history|audit\s*trail|activity\s*log|audit)\b/i,
});

function normalizeUnicodeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .replace(/[\u0622\u0623\u0625\u0671]/g, "\u0627")
    .replace(/\u0649/g, "\u064A")
    .replace(/\u0624/g, "\u0648")
    .replace(/\u0626/g, "\u064A")
    .replace(/\u06C0/g, "\u0647")
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, "")
    .replace(/\u0640/g, "")
    .replace(/[\u200E\u200F\u202A-\u202E]/g, "")
    .toLowerCase()
    .replace(/['’`´]/g, "")
    .replace(/[^\p{L}\p{N}\s@.-]/gu, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenizeUnicode(value) {
  return normalizeUnicodeText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function scoreTextSimilarity(query, candidateText) {
  const q = normalizeUnicodeText(query);
  const c = normalizeUnicodeText(candidateText);
  if (!q || !c) return 0;
  if (q === c) return 1;
  if (c.includes(q)) return 0.92;
  if (q.includes(c)) return 0.86;
  const editScore = normalizedEditSimilarity(q, c);
  if (editScore >= 0.88) return 0.88;
  const qTokens = tokenizeUnicode(q);
  const cTokens = new Set(tokenizeUnicode(c));
  if (!qTokens.length || !cTokens.size) return 0;
  let overlap = 0;
  for (const token of qTokens) {
    if (cTokens.has(token)) overlap += 1;
  }
  return Math.max(overlap / qTokens.length, editScore * 0.82);
}

function normalizedEditSimilarity(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) dp[i][0] = i;
  for (let j = 0; j <= m; j += 1) dp[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost,
      );
    }
  }
  const distance = dp[n][m];
  return 1 - distance / Math.max(n, m);
}

function pickStrongMatch(query, rows = [], labelBuilder) {
  const ranked = (Array.isArray(rows) ? rows : [])
    .map((row) => {
      const label = String(
        typeof labelBuilder === "function" ? labelBuilder(row) : "",
      ).trim();
      const score = scoreTextSimilarity(query, label);
      return { row, score, label };
    })
    .filter((entry) => entry.score >= 0.75)
    .sort((a, b) => b.score - a.score);

  if (!ranked.length) {
    return { status: "not_found", candidates: [] };
  }
  if (
    ranked.length > 1 &&
    (ranked[0].score - ranked[1].score < AUTOPICK_MIN_MARGIN)
  ) {
    return { status: "ambiguous", candidates: ranked };
  }
  return { status: "resolved", winner: ranked[0], candidates: ranked };
}

const ENTITY_PLURAL_HINTS = Object.freeze({
  client: /\bclients\b/i,
  dossier: /\b(dossiers|matters)\b/i,
  lawsuit: /\b(lawsuits|cases)\b/i,
  task: /\btasks\b/i,
  personal_task: /\bpersonal\s+tasks\b/i,
  session: /\b(sessions|hearings|meetings)\b/i,
  mission: /\bmissions\b/i,
  officer: /\b(officers|bailiffs|huissiers)\b/i,
  financial_entry: /\b(entries|invoices|payments)\b/i,
  notification: /\bnotifications|alerts\b/i,
  history_event: /\bhistory\s+events\b/i,
});

function normalizeEntityType(value) {
  const v = String(value || "").trim().toLowerCase();
  if (!v) return "";
  if (v === "case") return "lawsuit";
  if (v === "hearing") return "session";
  if (v === "personal task") return "personal_task";
  if (v === "financial entry") return "financial_entry";
  if (v === "history event") return "history_event";
  return v;
}

function isListIntent(intentName) {
  return String(intentName || "").toUpperCase().startsWith("LIST_");
}

function isReadIntent(intentName) {
  const value = String(intentName || "").toUpperCase();
  return (
    value.startsWith("READ_") ||
    value.startsWith("LIST_") ||
    value.startsWith("EXPLAIN_") ||
    value.startsWith("SUMMARIZE_")
  );
}

function isStrongEntityHintForTarget(hint, entityType) {
  const kind = String(hint?.type || "").toLowerCase();
  if (!["id", "name", "reference"].includes(kind)) return false;
  const hintedType = normalizeEntityType(hint?.entityType);
  // Untyped hints can still target the current entity ("show dossier X").
  if (!hintedType) return true;
  return hintedType === entityType;
}

function shouldDeferReadAmbiguityUntilAfterTools(readIntent) {
  const value = String(readIntent?.intent || "").toUpperCase();
  if (!value) return false;
  const entityType = deriveEntityTypeFromReadIntent(readIntent);
  const hints = Array.isArray(readIntent?.entityHints) ? readIntent.entityHints : [];
  const hasStrongTargetHint = hints.some((hint) =>
    isStrongEntityHintForTarget(hint, entityType),
  );
  // Collection / aggregate / status-style reads should execute tools first.
  if (value.startsWith("LIST_")) return !hasStrongTargetHint;
  if (value.startsWith("COUNT_")) return true;
  if (value.startsWith("EXISTS_")) return true;
  if (value.startsWith("STATUS_")) return true;
  // In this codebase, status and summary flows are represented as EXPLAIN_* / SUMMARIZE_*.
  if (value.startsWith("EXPLAIN_")) return true;
  if (value.startsWith("SUMMARIZE_")) return true;
  return false;
}

function deriveEntityTypeFromReadIntent(readIntent) {
  const name = String(readIntent?.intent || "").toUpperCase();
  if (!name) return "";
  if (name.includes("CLIENT")) return "client";
  if (name.includes("DOSSIER")) return "dossier";
  if (name.includes("LAWSUIT")) return "lawsuit";
  if (name.includes("PERSONAL_TASK")) return "personal_task";
  if (name.includes("TASK")) return "task";
  if (name.includes("SESSION")) return "session";
  if (name.includes("MISSION")) return "mission";
  if (name.includes("OFFICER")) return "officer";
  if (name.includes("FINANCIAL_ENTRY")) return "financial_entry";
  if (name.includes("NOTIFICATION")) return "notification";
  if (name.includes("HISTORY")) return "history_event";
  return "";
}

function deriveDraftEntityType(draftIntent, message) {
  const draftType = String(draftIntent?.draftType || "").toUpperCase();
  if (draftType === "CLIENT_EMAIL") return "client";
  if (draftType === "HEARING_SUMMARY") return "session";
  if (draftType === "INVITATION") {
    if (ENTITY_KEYWORDS.session.test(message)) return "session";
    if (ENTITY_KEYWORDS.lawsuit.test(message)) return "lawsuit";
    if (ENTITY_KEYWORDS.dossier.test(message)) return "dossier";
    return "session";
  }
  if (draftType === "INTERNAL_NOTE") {
    if (ENTITY_KEYWORDS.lawsuit.test(message)) return "lawsuit";
    if (ENTITY_KEYWORDS.dossier.test(message)) return "dossier";
    if (ENTITY_KEYWORDS.client.test(message)) return "client";
    return "dossier";
  }
  return "";
}

function deriveExecuteEntityType(message) {
  const normalized = String(message || "").toLowerCase();
  const executeVerb =
    /\b(create|update|edit|delete|remove|mark|assign|schedule|add|attach|link|set)\b/i.test(
      normalized,
    );
  if (!executeVerb) return "";
  for (const [entityType, pattern] of Object.entries(ENTITY_KEYWORDS)) {
    if (pattern.test(normalized)) return entityType;
  }
  return "";
}

function deriveTarget(message, readIntent, draftIntent) {
  if (readIntent?.intent && isReadIntent(readIntent.intent)) {
    const entityType = deriveEntityTypeFromReadIntent(readIntent);
    const hints = Array.isArray(readIntent?.entityHints)
      ? readIntent.entityHints
      : [];
    const hasStrongHint = hints.some((hint) =>
      isStrongEntityHintForTarget(hint, entityType),
    );
    if (
      isListIntent(readIntent.intent) &&
      !hasStrongHint &&
      !isLikelySingularMessage(message, entityType)
    ) {
      return null;
    }
    const listToRead = {
      LIST_CLIENTS: "READ_CLIENT",
      LIST_DOSSIERS: "READ_DOSSIER",
      LIST_LAWSUITS: "READ_LAWSUIT",
      LIST_TASKS: "READ_TASK",
      LIST_OVERDUE_TASKS: "READ_TASK",
      LIST_PERSONAL_TASKS: "READ_PERSONAL_TASK",
      LIST_SESSIONS: "READ_SESSION",
      LIST_UPCOMING_SESSIONS: "READ_SESSION",
      LIST_MISSIONS: "READ_MISSION",
      LIST_OFFICERS: "READ_OFFICER",
      LIST_FINANCIAL_ENTRIES: "READ_FINANCIAL_ENTRY",
      LIST_NOTIFICATIONS: "READ_NOTIFICATION",
      LIST_HISTORY_EVENTS: "READ_HISTORY_EVENT",
    };
    const originalIntent = (() => {
      const rawIntent = String(readIntent.intent || "CHATBOT_AGENT_MODE");
      if (!isListIntent(rawIntent)) return rawIntent;
      // Only coerce LIST_* → READ_* when we have a concrete identifier-ish hint.
      // Singular wording alone ("open dossier?", "client status?") is often a
      // scoped list/existence question and should stay on the READ pipeline.
      if (hasStrongHint) {
        return listToRead[rawIntent] || rawIntent;
      }
      return rawIntent;
    })();
    if (entityType) {
      return {
        capability: "read",
        entityType,
        originalIntent,
      };
    }
  }

  if (draftIntent?.intent) {
    const entityType = deriveDraftEntityType(draftIntent, message);
    if (entityType) {
      return {
        capability: "draft",
        entityType,
        originalIntent: String(draftIntent.intent || "CHATBOT_AGENT_MODE"),
        originalDraftType: String(draftIntent.draftType || ""),
      };
    }
  }

  const executeType = deriveExecuteEntityType(message);
  if (executeType) {
    return {
      capability: "execute",
      entityType: executeType,
      originalIntent: "EXECUTE_GENERIC",
    };
  }

  return null;
}

function inferReason(status) {
  if (status === "ambiguous") return "multiple_matches";
  if (status === "missing") return "missing_context";
  return "ambiguous_query";
}

function toNumber(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.floor(n);
}

function mapEntityToScope(entityType, entityId) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg || !cfg.scopeKey || !entityId) return {};
  return { [cfg.scopeKey]: Number(entityId) };
}

function hasConflictingTypedHint(hints, entityType) {
  const rows = Array.isArray(hints) ? hints : [];
  return rows.some((hint) => {
    const hintType = normalizeEntityType(hint?.entityType);
    return hintType && hintType !== entityType;
  });
}

function shouldRequireEntityForRead({
  message,
  readIntent,
  selectedHint,
  entityType,
}) {
  if (!readIntent?.intent) return false;
  if (selectedHint) return true;
  const value = String(readIntent.intent || "").toUpperCase();
  if (value.startsWith("LIST_")) {
    return false;
  }
  const normalized = String(message || "").toLowerCase();
  if (/\b(my|all)\b/.test(normalized)) return false;
  return true;
}

function isLikelySingularMessage(message, entityType) {
  const text = String(message || "").toLowerCase();
  if (!text) return false;
  if (/\b(all|list)\b/.test(text)) return false;
  if (/\bmy\b/.test(text)) return false;
  const pluralPattern = ENTITY_PLURAL_HINTS[entityType];
  if (pluralPattern && pluralPattern.test(text)) return false;
  return ENTITY_KEYWORDS[entityType]?.test(text) === true;
}

function isLikelyQuestionTail(value) {
  const text = String(value || "").trim().toLowerCase();
  if (!text) return true;
  if (
    /^(is|are|was|were|do|does|did|can|could|would|will|should|has|have|had)\b/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /^(right|correct|true|ok|okay|yes|no|status|state|summary|overview)$/.test(
      text,
    )
  ) {
    return true;
  }
  if (
    /^(is\s+that\s+(right|correct|true)|am\s+i\s+right|isn'?t\s+it|does\s+it\s+exist)$/.test(
      text,
    )
  ) {
    return true;
  }
  return false;
}

function extractHintFromMessage(entityType, message) {
  const text = String(message || "");
  if (!text) return null;
  const keywordPattern = ENTITY_KEYWORDS[entityType];
  if (!keywordPattern || !keywordPattern.test(text)) return null;
  const idByType = text.match(
    new RegExp(`\\b${entityType.replace("_", "\\s+")}\\s*#?\\s*(\\d+)\\b`, "i"),
  );
  if (idByType && toNumber(idByType[1])) {
    return { mode: "id", identifier: String(idByType[1]) };
  }
  const anyId = text.match(/\b(\d+)\b/);
  if (anyId && toNumber(anyId[1])) {
    return { mode: "id", identifier: String(anyId[1]) };
  }
  const byName = text.match(
    new RegExp(`\\b${entityType.replace("_", "\\s+")}\\s+([^?.,!\\n]+)`, "i"),
  );
  if (byName && String(byName[1] || "").trim()) {
    const raw = String(byName[1] || "").trim();
    const low = raw.toLowerCase();
    if (
      [
        "status",
        "state",
        "summary",
        "overview",
        "all",
        "my",
        "today",
        "upcoming",
        "overdue",
        "week",
      ].includes(low)
    ) {
      return null;
    }
    if (isLikelyQuestionTail(raw)) {
      return null;
    }
    return { mode: "name", identifier: raw };
  }
  return null;
}

function cleanEntityPhrase(value) {
  return String(value || "")
    .replace(/^[\"'“”‘’\s]+|[\"'“”‘’\s]+$/g, "")
    .replace(/^(which\s+is|is|the|for|about|named|called|titled)\s+/i, "")
    .replace(
      /\b(for|with|on)\s+[A-Za-z\u00C0-\u024F\u0600-\u06FF][^,.\n]{1,80}$/iu,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function trimAfterIntentShift(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const stopPatterns = [
    /\b(i need to|i need|can you|could you|please|help me|write|draft|compose|prepare)\b/i,
    /\b(اريد|أريد|عايز|محتاج)\b/u,
  ];
  let cut = text.length;
  for (const pattern of stopPatterns) {
    const match = text.match(pattern);
    if (match && typeof match.index === "number") {
      cut = Math.min(cut, match.index);
    }
  }
  return text.slice(0, cut).trim();
}

function extractClientAndDossierHints(message, entityHints = []) {
  const text = String(message || "");
  const hints = Array.isArray(entityHints) ? entityHints : [];
  const clientHint = hints.find(
    (hint) =>
      normalizeEntityType(hint?.entityType) === "client" &&
      ["name", "reference", "id"].includes(String(hint?.type || "")),
  );
  const dossierHint = hints.find(
    (hint) =>
      normalizeEntityType(hint?.entityType) === "dossier" &&
      ["name", "reference", "id"].includes(String(hint?.type || "")),
  );

  let clientQuery = cleanEntityPhrase(clientHint?.value || "");
  let dossierQuery = cleanEntityPhrase(dossierHint?.value || "");
  const isWeak = (value) =>
    !value ||
    /^(which|is|the|which\s+is|which\s+is\s+the)$/i.test(value) ||
    tokenizeUnicode(value).length < 2;
  if (isWeak(clientQuery)) clientQuery = "";
  if (isWeak(dossierQuery)) dossierQuery = "";

  if (!dossierQuery) {
    const dossierTitlePatterns = [
      /\b(?:which\s+is|titled|title\s+is|named|called)\s+(.+)$/i,
      /\b(?:قضية|ملف)\s+(.+)$/u,
      /\bdossier\s+(?:which\s+is|titled|named|called)\s+(.+)$/i,
    ];
    for (const pattern of dossierTitlePatterns) {
      const match = text.match(pattern);
      if (match && cleanEntityPhrase(match[1])) {
        dossierQuery = trimAfterIntentShift(cleanEntityPhrase(match[1]));
        break;
      }
    }
  }

  if (!clientQuery) {
    const clientPatterns = [
      /\b(?:on|for|with)\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF][^,.\n]{1,80}?)\s+(?:dossier|case\s*file|matter|قضية|ملف)\b/iu,
      /\b(?:dossier|case\s*file|matter|قضية|ملف)\b[^,.\n]{0,120}?\b(?:for|on|with)\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF][^,.\n]{1,80})/iu,
      /\bclient\s+([A-Za-z\u00C0-\u024F\u0600-\u06FF][^,.\n]{1,80})/iu,
    ];
    for (const pattern of clientPatterns) {
      const match = text.match(pattern);
      if (match && cleanEntityPhrase(match[1])) {
        clientQuery = cleanEntityPhrase(match[1]);
        break;
      }
    }
  }

  if (!dossierQuery) {
    const explicitAfterKeyword = text.match(
      /\b(?:dossier|case\s*file|matter|قضية|ملف)\b\s*[:#-]?\s*(.+)$/iu,
    );
    if (explicitAfterKeyword && cleanEntityPhrase(explicitAfterKeyword[1])) {
      dossierQuery = trimAfterIntentShift(cleanEntityPhrase(explicitAfterKeyword[1]));
    }
  }

  dossierQuery = trimAfterIntentShift(dossierQuery);
  if (isWeak(dossierQuery)) dossierQuery = "";

  return {
    clientQuery: clientQuery || null,
    dossierQuery: dossierQuery || null,
  };
}

function selectHint(hints, entityType) {
  const rows = Array.isArray(hints) ? hints : [];
  const typed = rows.filter(
    (hint) => normalizeEntityType(hint?.entityType) === entityType,
  );
  const pool = typed.length > 0 ? typed : rows;
  const byId = pool.find((hint) => String(hint?.type || "") === "id");
  if (byId && toNumber(byId.value)) {
    return { mode: "id", identifier: String(byId.value).trim() };
  }
  const byReference = pool.find(
    (hint) => String(hint?.type || "") === "reference",
  );
  if (byReference && String(byReference.value || "").trim()) {
    return { mode: "name", identifier: String(byReference.value).trim() };
  }
  const byName = pool.find((hint) => String(hint?.type || "") === "name");
  if (byName && String(byName.value || "").trim()) {
    const rawName = String(byName.value || "").trim().toLowerCase();
    if (
      [
        "status",
        "state",
        "summary",
        "overview",
        "all",
        "my",
        "today",
        "upcoming",
        "overdue",
        "week",
      ].includes(rawName)
    ) {
      return null;
    }
    return { mode: "name", identifier: String(byName.value).trim() };
  }
  return null;
}

function formatCandidateLabel(entityType, candidate) {
  if (!candidate) return `${entityType} option`;
  const preferred = [
    candidate.label,
    candidate.title,
    candidate.name,
    candidate.reference,
    candidate.clientName,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  return preferred || `${entityType} option`;
}

function deriveCandidateSubtitle(candidate) {
  const parts = [];
  if (candidate.reference) parts.push(String(candidate.reference));
  if (candidate.clientName) parts.push(`Client: ${candidate.clientName}`);
  if (candidate.category) parts.push(String(candidate.category));
  if (candidate.phase) parts.push(String(candidate.phase));
  if (candidate.status) parts.push(String(candidate.status));
  if (candidate.openedAt) parts.push(`Opened: ${String(candidate.openedAt).slice(0, 10)}`);
  return parts.length > 0 ? parts.join(" | ") : null;
}

function extractCandidatesFromList(entityType, listResult = []) {
  const rows = Array.isArray(listResult) ? listResult : [];
  return rows.slice(0, 8).map((row) => ({
    id: row.id,
    name: formatCandidateLabel(entityType, row),
    score: typeof row.score === "number" ? row.score : 0.75,
    reference: row.reference || row.code || null,
    clientName: row.client_name || row.clientName || null,
    category: row.category || null,
    phase: row.phase || null,
    status: row.status || null,
    openedAt: row.opened_at || row.created_at || null,
  }));
}

function enrichCandidatesFromRows(candidates = [], rows = []) {
  const byId = new Map(
    (Array.isArray(rows) ? rows : [])
      .filter((row) => row && row.id)
      .map((row) => [Number(row.id), row]),
  );
  return (Array.isArray(candidates) ? candidates : []).map((candidate) => {
    const id = Number(candidate?.id || 0);
    const row = byId.get(id);
    if (!row) return candidate;
    return {
      ...candidate,
      title: row.title || candidate.title || candidate.name,
      reference:
        row.reference || row.code || candidate.reference || null,
      clientName:
        row.client_name || row.clientName || candidate.clientName || null,
      category: row.category || candidate.category || null,
      phase: row.phase || candidate.phase || null,
      status: row.status || candidate.status || null,
      openedAt:
        row.opened_at || row.created_at || candidate.openedAt || null,
    };
  });
}

function canAccessEntityDomain(entityType, dataAccess = {}) {
  const domain = ENTITY_TYPE_DOMAIN_MAP[entityType];
  if (!domain) return true;
  return dataAccess?.[domain] !== false;
}

function shouldAutoPick(candidates, { hasExplicitTypeConflict = false } = {}) {
  if (!AUTOPICK_ENABLED) return false;
  if (!Array.isArray(candidates) || candidates.length === 0) return false;
  if (hasExplicitTypeConflict) return false;
  const ordered = candidates
    .slice()
    .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0));
  const top = Number(ordered[0]?.score || 0);
  if (ordered.length === 1) {
    return top >= AUTOPICK_MIN_SCORE;
  }
  const second = Number(ordered[1]?.score || 0);
  const margin = top - second;
  return top >= AUTOPICK_MIN_SCORE && margin >= AUTOPICK_MIN_MARGIN;
}

function buildSuggestionArtifact({
  entityType,
  status,
  candidates,
  message,
  originalIntent,
  originalDraftType,
  originalMessage,
}) {
  const cfg = ENTITY_CONFIG[entityType] || { label: entityType };
  const suggestions = (Array.isArray(candidates) ? candidates : [])
    .slice(0, 8)
    .map((candidate, idx) => {
      const entityId = Number(candidate?.id || 0);
      if (!entityId) return null;
      const scope = mapEntityToScope(entityType, entityId);
      const score = Number(candidate?.score || 0);
      return {
        id: `${entityType}-${entityId}-${idx}`,
        entityType,
        entityId,
        label: formatCandidateLabel(entityType, candidate),
        subtitle: deriveCandidateSubtitle(candidate),
        metadata: {
          score: Number.isFinite(score) ? Number(score.toFixed(3)) : 0,
          signal:
            Number.isFinite(score) && score > 0
              ? `match ${Math.round(score * 100)}%`
              : "candidate",
        },
        intent: "RESOLVE_CONTEXT_AND_CONTINUE",
        scope,
        resolveContext: {
          originalIntent: String(originalIntent || "CHATBOT_AGENT_MODE"),
          originalDraftType: originalDraftType || undefined,
        },
      };
    })
    .filter(Boolean);

  return {
    type: "context_suggestion",
    message:
      message ||
      `I found multiple ${cfg.label} matches. Please choose the exact one.`,
    entityType,
    reason: inferReason(status),
    originalIntent: originalIntent || "CHATBOT_AGENT_MODE",
    originalDraftType: originalDraftType || undefined,
    originalMessage: String(originalMessage || "").trim() || undefined,
    suggestions,
    timestamp: new Date().toISOString(),
    confidence: 0.82,
    source: "rule-based",
    allowManualInput: true,
    manualInputHint: `You can also provide the ${cfg.label} reference or title.`,
  };
}

async function listCandidates({
  engine,
  entityType,
  policy,
  executionContext,
  query = "",
}) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg || !cfg.listTool || typeof engine?._callReadTool !== "function") {
    return [];
  }
  try {
    const params = {
      limit: 8,
    };
    if (query) params.query = query;
    const payload = await engine._callReadTool(cfg.listTool, params, policy);
    return extractCandidatesFromList(entityType, payload?.[cfg.listKey] || []);
  } catch {
    return [];
  }
}

async function listRows({
  engine,
  entityType,
  policy,
  query = "",
}) {
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg || !cfg.listTool || typeof engine?._callReadTool !== "function") {
    return [];
  }
  try {
    const params = { limit: 200 };
    if (query) params.query = query;
    const payload = await engine._callReadTool(cfg.listTool, params, policy);
    return Array.isArray(payload?.[cfg.listKey]) ? payload[cfg.listKey] : [];
  } catch {
    return [];
  }
}

async function resolveClientThenDossierScoped({
  engine,
  policy,
  clientQuery,
  dossierQuery,
}) {
  if (!clientQuery || !dossierQuery) {
    return { status: "skipped" };
  }
  if (typeof engine?._callReadTool !== "function") {
    return { status: "skipped" };
  }

  const clientPayload = await engine._callReadTool(
    "listClients",
    { query: clientQuery, limit: 200 },
    policy,
  );
  const clients = Array.isArray(clientPayload?.clients)
    ? clientPayload.clients
    : [];
  const clientPick = pickStrongMatch(clientQuery, clients, (client) =>
    [client?.name, client?.company]
      .filter(Boolean)
      .join(" "),
  );
  if (clientPick.status !== "resolved") {
    return {
      status: clientPick.status === "ambiguous" ? "ambiguous" : "not_found",
      missingEntity: "client",
      clientCandidates: clientPick.candidates || [],
    };
  }

  const clientId = Number(clientPick.winner?.row?.id || 0);
  if (!clientId) {
    return { status: "not_found", missingEntity: "client" };
  }

  let dossierPayload = null;
  try {
    dossierPayload = await engine._callReadTool(
      "listDossiersForClient",
      { clientId, limit: 200 },
      policy,
    );
  } catch {
    dossierPayload = await engine._callReadTool(
      "listDossiers",
      { clientId, limit: 200 },
      policy,
    );
  }
  const dossiers = Array.isArray(dossierPayload?.dossiers)
    ? dossierPayload.dossiers
    : [];
  const dossierPick = pickStrongMatch(dossierQuery, dossiers, (dossier) =>
    [dossier?.title, dossier?.reference, dossier?.code]
      .filter(Boolean)
      .join(" "),
  );
  if (dossierPick.status !== "resolved") {
    return {
      status: dossierPick.status === "ambiguous" ? "ambiguous" : "not_found",
      missingEntity: "dossier",
      clientId,
      dossierCandidates: dossierPick.candidates || [],
    };
  }

  const dossierId = Number(dossierPick.winner?.row?.id || 0);
  if (!dossierId) {
    return { status: "not_found", missingEntity: "dossier", clientId };
  }

  return {
    status: "resolved",
    clientId,
    dossierId,
  };
}

async function resolveEntityByHint({
  engine,
  policy,
  entityType,
  hint,
}) {
  if (!hint || !hint.identifier || typeof engine?.resolveEntity !== "function") {
    return { status: "missing" };
  }
  const result = await engine.resolveEntity(
    {
      entityType,
      identifier: hint.identifier,
      mode: hint.mode || "name",
      scopeClientId: toNumber(hint.scopeClientId),
    },
    policy,
  );

  if (result?.found && result?.entityId) {
    return {
      status: "resolved",
      entityId: Number(result.entityId),
      entity: result.entity || null,
    };
  }
  if (result?.reason === "ambiguous") {
    return {
      status: "ambiguous",
      candidates: Array.isArray(result?.candidates) ? result.candidates : [],
      reason: result.reason,
    };
  }
  if (result?.reason === "not_found") {
    return { status: "not_found", reason: result.reason };
  }
  return { status: "missing", reason: result?.reason || "missing" };
}

async function resolveChatAmbiguity({
  engine,
  message,
  policy,
  executionContext = {},
  exposedTools = [],
}) {
  const featureEnabled = process.env.AGENT_CHAT_AMBIGUITY_RESOLVER !== "false";
  if (!featureEnabled) {
    return { status: "skipped" };
  }

  const userMessage = String(message || "").trim();
  if (!userMessage) return { status: "skipped" };

  const readIntent = detectReadIntent(userMessage, executionContext);
  const draftIntent = detectDraftIntent(userMessage, executionContext);
  if (readIntent && shouldDeferReadAmbiguityUntilAfterTools(readIntent)) {
    return { status: "skipped" };
  }
  const target = deriveTarget(userMessage, readIntent, draftIntent);
  if (!target?.entityType) {
    return { status: "skipped" };
  }

  const entityType = normalizeEntityType(target.entityType);
  const cfg = ENTITY_CONFIG[entityType];
  if (!cfg) return { status: "skipped" };

  const dataAccess = executionContext?.dataAccess || {};
  if (!canAccessEntityDomain(entityType, dataAccess)) {
    return { status: "skipped" };
  }

  const scopeId = toNumber(executionContext?.[cfg.scopeKey]);
  if (scopeId) {
    return {
      status: "resolved",
      resolvedScope: { [cfg.scopeKey]: scopeId },
      resolutionMeta: {
        status: "resolved",
        entityType,
        candidatesCount: 1,
        autoPicked: false,
        chosenId: scopeId,
      },
    };
  }

  const entityHints = Array.isArray(readIntent?.entityHints)
    ? readIntent.entityHints
    : Array.isArray(draftIntent?.entityHints)
      ? draftIntent.entityHints
      : [];

  if (entityType === "dossier") {
    const scopedHints = extractClientAndDossierHints(userMessage, entityHints);
    if (scopedHints.clientQuery && scopedHints.dossierQuery) {
      const scoped = await resolveClientThenDossierScoped({
        engine,
        policy,
        clientQuery: scopedHints.clientQuery,
        dossierQuery: scopedHints.dossierQuery,
      });
      if (scoped.status === "resolved") {
        return {
          status: "resolved",
          resolvedScope: {
            clientId: scoped.clientId,
            dossierId: scoped.dossierId,
          },
          resolutionMeta: {
            status: "resolved",
            entityType: "dossier",
            candidatesCount: 1,
            autoPicked: true,
            chosenId: scoped.dossierId,
          },
        };
      }

      if (scoped.status === "ambiguous") {
        const missingLabel =
          scoped.missingEntity === "client" ? "client" : "dossier";
        const rawCandidates =
          scoped.missingEntity === "client"
            ? scoped.clientCandidates
            : scoped.dossierCandidates;
        const candidates = (rawCandidates || [])
          .slice(0, 8)
          .map((entry) => entry?.row)
          .filter(Boolean);
        const suggestionArtifact = buildSuggestionArtifact({
          entityType: scoped.missingEntity === "client" ? "client" : "dossier",
          status: "ambiguous",
          candidates: extractCandidatesFromList(
            scoped.missingEntity === "client" ? "client" : "dossier",
            candidates,
          ),
          message: `I found multiple ${missingLabel} matches. Please confirm the exact ${missingLabel}.`,
          originalIntent: target.originalIntent,
          originalDraftType: target.originalDraftType,
          originalMessage: userMessage,
        });
        return {
          status: "ambiguous",
          suggestionArtifact,
          resolutionMeta: {
            status: "ambiguous",
            entityType: missingLabel,
            candidatesCount: suggestionArtifact.suggestions.length,
            autoPicked: false,
            chosenId: null,
          },
        };
      }

      if (scoped.status === "not_found") {
        const missingLabel =
          scoped.missingEntity === "client" ? "client" : "dossier";
        const detail =
          scoped.missingEntity === "client"
            ? `Client "${scopedHints.clientQuery}" was not found.`
            : `Dossier "${scopedHints.dossierQuery}" was not found under client "${scopedHints.clientQuery}".`;
        const suggestionArtifact = buildSuggestionArtifact({
          entityType: scoped.missingEntity === "client" ? "client" : "dossier",
          status: "not_found",
          candidates: [],
          message: detail,
          originalIntent: target.originalIntent,
          originalDraftType: target.originalDraftType,
          originalMessage: userMessage,
        });
        return {
          status: "not_found",
          suggestionArtifact,
          resolutionMeta: {
            status: "not_found",
            entityType: missingLabel,
            candidatesCount: 0,
            autoPicked: false,
            chosenId: null,
          },
        };
      }
    }
  }

  const selectedHint =
    selectHint(entityHints, entityType) ||
    extractHintFromMessage(entityType, userMessage);

  if (
    target.capability === "read" &&
    !shouldRequireEntityForRead({
      message: userMessage,
      readIntent,
      selectedHint,
      entityType,
    })
  ) {
    return { status: "skipped" };
  }

  if (!selectedHint) {
    const candidates = await listCandidates({
      engine,
      entityType,
      policy,
      executionContext,
      query: "",
    });
    const suggestionArtifact = buildSuggestionArtifact({
      entityType,
      status: "missing",
      candidates,
      message: `I need the exact ${cfg.label} to continue. Here are likely options.`,
      originalIntent: target.originalIntent,
      originalDraftType: target.originalDraftType,
      originalMessage: userMessage,
    });
    return {
      status: "missing",
      suggestionArtifact,
      resolutionMeta: {
        status: "missing",
        entityType,
        candidatesCount: suggestionArtifact.suggestions.length,
        autoPicked: false,
        chosenId: null,
      },
    };
  }

  const resolution = await resolveEntityByHint({
    engine,
    policy,
    entityType,
    hint: {
      ...selectedHint,
      scopeClientId:
        entityType === "dossier" ? toNumber(executionContext?.clientId) : null,
    },
  });

  if (resolution.status === "resolved" && resolution.entityId) {
    return {
      status: "resolved",
      resolvedScope: mapEntityToScope(entityType, resolution.entityId),
      resolutionMeta: {
        status: "resolved",
        entityType,
        candidatesCount: 1,
        autoPicked: false,
        chosenId: resolution.entityId,
      },
    };
  }

  let candidates = Array.isArray(resolution?.candidates)
    ? resolution.candidates
    : [];
  if (!candidates.length) {
    candidates = await listCandidates({
      engine,
      entityType,
      policy,
      executionContext,
      query: selectedHint.identifier,
    });
  }
  if (candidates.length > 0) {
    const rows = await listRows({
      engine,
      entityType,
      policy,
      query: selectedHint.identifier,
    });
    candidates = enrichCandidatesFromRows(candidates, rows);
  }

  if (selectedHint?.identifier && candidates.length > 0) {
    const queryRank = pickStrongMatch(
      selectedHint.identifier,
      candidates,
      (candidate) =>
        [
          candidate?.name,
          candidate?.title,
          candidate?.reference,
          candidate?.clientName,
          candidate?.category,
          candidate?.phase,
        ]
          .filter(Boolean)
          .join(" "),
    );
    if (queryRank.status === "resolved") {
      const pickedId = toNumber(queryRank.winner?.row?.id);
      if (pickedId) {
        return {
          status: "resolved",
          resolvedScope: mapEntityToScope(entityType, pickedId),
          resolutionMeta: {
            status: "resolved",
            entityType,
            candidatesCount: candidates.length,
            autoPicked: true,
            chosenId: pickedId,
          },
        };
      }
    }
    if (queryRank.status === "ambiguous") {
      resolution.status = "ambiguous";
    }
  }

  if (resolution.status === "ambiguous" && shouldAutoPick(candidates, {
    hasExplicitTypeConflict: hasConflictingTypedHint(entityHints, entityType),
  })) {
    const best = candidates
      .slice()
      .sort((a, b) => Number(b?.score || 0) - Number(a?.score || 0))[0];
    const pickedId = toNumber(best?.id);
    if (pickedId) {
      return {
        status: "resolved",
        resolvedScope: mapEntityToScope(entityType, pickedId),
        resolutionMeta: {
          status: "resolved",
          entityType,
          candidatesCount: candidates.length,
          autoPicked: true,
          chosenId: pickedId,
        },
      };
    }
  }

  const finalStatus =
    resolution.status === "not_found" ? "not_found" : "ambiguous";
  const suggestionArtifact = buildSuggestionArtifact({
    entityType,
    status: finalStatus,
    candidates,
    message:
      finalStatus === "not_found"
        ? `I could not find an exact ${cfg.label} match.`
        : `I found multiple ${cfg.label} matches.`,
    originalIntent: target.originalIntent,
    originalDraftType: target.originalDraftType,
    originalMessage: userMessage,
  });

  return {
    status: finalStatus,
    suggestionArtifact,
    resolutionMeta: {
      status: finalStatus,
      entityType,
      candidatesCount: suggestionArtifact.suggestions.length,
      autoPicked: false,
      chosenId: null,
    },
  };
}

module.exports = {
  resolveChatAmbiguity,
  shouldAutoPick,
};
