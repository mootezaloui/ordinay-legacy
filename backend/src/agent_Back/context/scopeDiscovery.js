"use strict";

const ENTITY_PRIORITY = Object.freeze([
  "task",
  "session",
  "mission",
  "financial_entry",
  "lawsuit",
  "dossier",
]);

const ENTITY_DEPTH_RANK = Object.freeze(
  ENTITY_PRIORITY.reduce((acc, entityType, index) => {
    acc[entityType] = ENTITY_PRIORITY.length - index;
    return acc;
  }, {}),
);

const DEFAULT_LIMITS = Object.freeze({
  dossiers: 64,
  parentDossiers: 24,
  lawsuitsPerDossier: 12,
  sessionsPerDossier: 10,
  sessionsPerLawsuit: 8,
  tasksPerDossier: 12,
  tasksPerLawsuit: 10,
  missionsPerDossier: 8,
  missionsPerLawsuit: 8,
  financialEntries: 20,
  maxClarifyCandidates: 7,
  minResolvedScore: 0.24,
  ambiguousMargin: 0.06,
});

const ALLOWED_SCOPE_LEVELS = new Set([
  "client",
  "dossier",
  "lawsuit",
  "session",
  "task",
  "mission",
  "financial_entry",
]);

const STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "generate",
  "generated",
  "creating",
  "create",
  "document",
  "draft",
  "file",
  "in",
  "into",
  "is",
  "it",
  "my",
  "of",
  "on",
  "or",
  "please",
  "the",
  "to",
  "under",
  "with",
  "his",
  "her",
  "their",
  "this",
  "that",
  "client",
  "case",
  "record",
]);

function toPositiveInteger(value, fallback) {
  const normalized = Number(value);
  if (!Number.isInteger(normalized) || normalized <= 0) return fallback;
  return normalized;
}

function normalizeLimits(limits = {}) {
  const source = limits && typeof limits === "object" && !Array.isArray(limits) ? limits : {};
  return {
    dossiers: toPositiveInteger(source.dossiers, DEFAULT_LIMITS.dossiers),
    parentDossiers: toPositiveInteger(source.parentDossiers, DEFAULT_LIMITS.parentDossiers),
    lawsuitsPerDossier: toPositiveInteger(source.lawsuitsPerDossier, DEFAULT_LIMITS.lawsuitsPerDossier),
    sessionsPerDossier: toPositiveInteger(source.sessionsPerDossier, DEFAULT_LIMITS.sessionsPerDossier),
    sessionsPerLawsuit: toPositiveInteger(source.sessionsPerLawsuit, DEFAULT_LIMITS.sessionsPerLawsuit),
    tasksPerDossier: toPositiveInteger(source.tasksPerDossier, DEFAULT_LIMITS.tasksPerDossier),
    tasksPerLawsuit: toPositiveInteger(source.tasksPerLawsuit, DEFAULT_LIMITS.tasksPerLawsuit),
    missionsPerDossier: toPositiveInteger(source.missionsPerDossier, DEFAULT_LIMITS.missionsPerDossier),
    missionsPerLawsuit: toPositiveInteger(source.missionsPerLawsuit, DEFAULT_LIMITS.missionsPerLawsuit),
    financialEntries: toPositiveInteger(source.financialEntries, DEFAULT_LIMITS.financialEntries),
    maxClarifyCandidates: toPositiveInteger(source.maxClarifyCandidates, DEFAULT_LIMITS.maxClarifyCandidates),
    minResolvedScore:
      Number.isFinite(Number(source.minResolvedScore)) && Number(source.minResolvedScore) > 0
        ? Number(source.minResolvedScore)
        : DEFAULT_LIMITS.minResolvedScore,
    ambiguousMargin:
      Number.isFinite(Number(source.ambiguousMargin)) && Number(source.ambiguousMargin) > 0
        ? Number(source.ambiguousMargin)
        : DEFAULT_LIMITS.ambiguousMargin,
  };
}

function normalizeScopeHint(input = {}) {
  const source = input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const queryText = String(
    source.queryText || source.query || source.text || "",
  ).trim();
  const preferredScopeLevels = Array.isArray(source.preferredScopeLevels)
    ? source.preferredScopeLevels
        .map((value) => String(value || "").trim().toLowerCase())
        .filter((value) => ALLOWED_SCOPE_LEVELS.has(value))
    : [];
  return {
    queryText: queryText || null,
    preferredScopeLevels: Array.from(new Set(preferredScopeLevels)),
  };
}

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s:/#.-]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token && !STOP_WORDS.has(token) && token.length >= 2);
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

function toIsoDate(value) {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const slash = text.match(/^(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$/);
  if (slash) {
    const day = Number(slash[1]);
    const month = Number(slash[2]);
    const rawYear = Number(slash[3]);
    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      const year = rawYear < 100 ? 2000 + rawYear : rawYear;
      return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    }
  }
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function extractMessageDates(message) {
  const text = String(message || "");
  const matches = [
    ...text.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g),
    ...text.matchAll(/\b\d{1,2}[/.]\d{1,2}[/.]\d{2,4}\b/g),
  ];
  const out = new Set();
  for (const match of matches) {
    const iso = toIsoDate(match[0]);
    if (iso) out.add(iso);
  }
  return out;
}

function extractCandidateDates(row = {}) {
  const fields = [
    "scheduled_at",
    "due_date",
    "occurred_at",
    "opened_at",
    "created_at",
    "updated_at",
    "date",
    "start_date",
    "end_date",
  ];
  const out = new Set();
  for (const field of fields) {
    const iso = toIsoDate(row?.[field]);
    if (iso) out.add(iso);
  }
  return out;
}

function resolveTimestamp(row = {}) {
  const fields = [
    "updated_at",
    "scheduled_at",
    "due_date",
    "occurred_at",
    "created_at",
    "opened_at",
  ];
  for (const field of fields) {
    const value = row?.[field];
    if (!value) continue;
    const parsed = new Date(value).getTime();
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return 0;
}

function buildLabel(entityType, row = {}) {
  const preferred = [
    row.title,
    row.name,
    row.reference,
    row.lawsuit_number,
    row.session_type,
    row.entry_type,
    row.code,
  ]
    .map((value) => String(value || "").trim())
    .find(Boolean);
  return preferred || `${entityType} #${String(row.id || "?")}`;
}

function buildReference(row = {}) {
  const value = row.reference || row.code || row.lawsuit_number || null;
  const normalized = String(value || "").trim();
  return normalized || null;
}

function buildCandidateText(row = {}) {
  const fields = [
    "title",
    "name",
    "reference",
    "code",
    "lawsuit_number",
    "session_type",
    "entry_type",
    "category",
    "court",
    "opponent",
    "status",
    "phase",
    "priority",
    "description",
    "notes",
    "client_name",
    "clientName",
  ];
  const parts = [];
  for (const field of fields) {
    if (row?.[field] == null) continue;
    parts.push(String(row[field]));
  }
  if (Array.isArray(row?.tags)) {
    parts.push(
      row.tags
        .map((tag) => String(tag || "").trim())
        .filter(Boolean)
        .join(" "),
    );
  }
  return parts.join(" ");
}

function buildCandidate(entityType, row = {}) {
  const entityId = Number(row?.id || 0);
  if (!Number.isInteger(entityId) || entityId <= 0) return null;
  const label = buildLabel(entityType, row);
  const reference = buildReference(row);
  return {
    entityType,
    entityId,
    label,
    reference,
    text: buildCandidateText(row),
    dates: extractCandidateDates(row),
    updatedAt: resolveTimestamp(row),
    raw: row,
  };
}

function dedupeCandidates(candidates = []) {
  const map = new Map();
  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (!candidate || !candidate.entityType || !candidate.entityId) continue;
    const key = `${candidate.entityType}:${candidate.entityId}`;
    const existing = map.get(key);
    if (!existing || Number(candidate.updatedAt || 0) > Number(existing.updatedAt || 0)) {
      map.set(key, candidate);
    }
  }
  return Array.from(map.values());
}

function listFromPayload(payload, key) {
  return Array.isArray(payload?.[key]) ? payload[key] : [];
}

async function callReadTool(engine, toolName, params = {}, policy = null) {
  if (!engine) return null;
  if (typeof engine._callReadTool === "function") {
    return engine._callReadTool(toolName, params, policy);
  }
  if (typeof engine.executeToolV2 === "function") {
    const v2 = await engine.executeToolV2(toolName, params, policy, {
      confirmed: true,
      sourceRoute: "/agent/chat",
    });
    return v2?.result || null;
  }
  return null;
}

async function collectCandidates({ engine, clientId, limits, policy }) {
  const dossiersPayload = await callReadTool(
    engine,
    "listDossiersForClient",
    { clientId, limit: limits.dossiers },
    policy,
  );
  const dossiers = listFromPayload(dossiersPayload, "dossiers");
  const dossierIds = dossiers
    .map((row) => Number(row?.id || 0))
    .filter((id) => Number.isInteger(id) && id > 0)
    .slice(0, limits.parentDossiers);

  const lawsuitsPayloads = await Promise.all(
    dossierIds.map((dossierId) =>
      callReadTool(
        engine,
        "listLawsuits",
        { dossierId, limit: limits.lawsuitsPerDossier },
        policy,
      ),
    ),
  );
  const lawsuits = lawsuitsPayloads.flatMap((payload) => listFromPayload(payload, "lawsuits"));
  const lawsuitIds = lawsuits
    .map((row) => Number(row?.id || 0))
    .filter((id) => Number.isInteger(id) && id > 0);

  const [
    sessionsByDossier,
    sessionsByLawsuit,
    tasksByDossier,
    tasksByLawsuit,
    missionsByDossier,
    missionsByLawsuit,
    financialEntriesPayload,
  ] = await Promise.all([
    Promise.all(
      dossierIds.map((dossierId) =>
        callReadTool(
          engine,
          "listSessions",
          { dossierId, limit: limits.sessionsPerDossier },
          policy,
        ),
      ),
    ),
    Promise.all(
      lawsuitIds.map((lawsuitId) =>
        callReadTool(
          engine,
          "listSessions",
          { lawsuitId, limit: limits.sessionsPerLawsuit },
          policy,
        ),
      ),
    ),
    Promise.all(
      dossierIds.map((dossierId) =>
        callReadTool(
          engine,
          "listTasks",
          { dossierId, limit: limits.tasksPerDossier },
          policy,
        ),
      ),
    ),
    Promise.all(
      lawsuitIds.map((lawsuitId) =>
        callReadTool(
          engine,
          "listTasks",
          { lawsuitId, limit: limits.tasksPerLawsuit },
          policy,
        ),
      ),
    ),
    Promise.all(
      dossierIds.map((dossierId) =>
        callReadTool(
          engine,
          "listMissions",
          { dossierId, limit: limits.missionsPerDossier },
          policy,
        ),
      ),
    ),
    Promise.all(
      lawsuitIds.map((lawsuitId) =>
        callReadTool(
          engine,
          "listMissions",
          { lawsuitId, limit: limits.missionsPerLawsuit },
          policy,
        ),
      ),
    ),
    callReadTool(
      engine,
      "listFinancialEntries",
      { clientId, limit: limits.financialEntries },
      policy,
    ),
  ]);

  const sessions = [
    ...sessionsByDossier.flatMap((payload) => listFromPayload(payload, "sessions")),
    ...sessionsByLawsuit.flatMap((payload) => listFromPayload(payload, "sessions")),
  ];
  const tasks = [
    ...tasksByDossier.flatMap((payload) => listFromPayload(payload, "tasks")),
    ...tasksByLawsuit.flatMap((payload) => listFromPayload(payload, "tasks")),
  ];
  const missions = [
    ...missionsByDossier.flatMap((payload) => listFromPayload(payload, "missions")),
    ...missionsByLawsuit.flatMap((payload) => listFromPayload(payload, "missions")),
  ];
  const financialEntries = listFromPayload(financialEntriesPayload, "financialEntries");

  const candidates = dedupeCandidates([
    ...dossiers.map((row) => buildCandidate("dossier", row)),
    ...lawsuits.map((row) => buildCandidate("lawsuit", row)),
    ...sessions.map((row) => buildCandidate("session", row)),
    ...tasks.map((row) => buildCandidate("task", row)),
    ...missions.map((row) => buildCandidate("mission", row)),
    ...financialEntries.map((row) => buildCandidate("financial_entry", row)),
  ]);

  return candidates.filter(Boolean);
}

function scoreCandidate({
  candidate,
  messageNormalized,
  messageTokens,
  messageDates,
  preferredScopeLevels,
}) {
  const candidateText = normalizeText([candidate.label, candidate.reference, candidate.text].join(" "));
  const candidateTokens = tokenize(candidateText);
  const candidateTokenSet = new Set(candidateTokens);

  let overlap = 0;
  for (const token of messageTokens) {
    if (candidateTokenSet.has(token)) overlap += 1;
  }

  const overlapRatio = overlap / Math.max(1, messageTokens.length);
  const candidateCoverage = overlap / Math.max(1, candidateTokens.length);
  const unionCount = new Set([...messageTokens, ...candidateTokens]).size;
  const jaccard = overlap / Math.max(1, unionCount);
  const editSimilarity = normalizedEditSimilarity(
    messageNormalized.slice(0, 180),
    candidateText.slice(0, 180),
  );

  const candidateReference = normalizeText(candidate.reference || "");
  const referenceBoost =
    candidateReference && messageNormalized.includes(candidateReference) ? 0.33 : 0;
  const dateBoost =
    [...messageDates].some((dateToken) => candidate.dates.has(dateToken)) ? 0.24 : 0;
  const depthBoost = (ENTITY_DEPTH_RANK[candidate.entityType] || 0) * 0.005;
  const preferredLevelBoost = Array.isArray(preferredScopeLevels) &&
    preferredScopeLevels.includes(candidate.entityType)
    ? 0.1
    : 0;
  const overlapCountBoost = overlap >= 2 ? 0.22 : overlap >= 1 ? 0.12 : 0;

  const rawScore =
    overlapRatio * 0.44 +
    candidateCoverage * 0.16 +
    jaccard * 0.18 +
    editSimilarity * 0.14 +
    referenceBoost +
    dateBoost +
    depthBoost +
    preferredLevelBoost +
    overlapCountBoost;

  return {
    ...candidate,
    score: Number(Math.min(0.999, rawScore).toFixed(4)),
  };
}

function orderCandidates(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (Number(b.updatedAt || 0) !== Number(a.updatedAt || 0)) {
    return Number(b.updatedAt || 0) - Number(a.updatedAt || 0);
  }
  const aDepth = ENTITY_DEPTH_RANK[a.entityType] || 0;
  const bDepth = ENTITY_DEPTH_RANK[b.entityType] || 0;
  if (bDepth !== aDepth) return bDepth - aDepth;
  return Number(b.entityId || 0) - Number(a.entityId || 0);
}

function toCandidatePreview(candidate) {
  return {
    entityType: candidate.entityType,
    entityId: candidate.entityId,
    label: candidate.label,
    reference: candidate.reference || null,
    score: candidate.score,
  };
}

async function discoverScopedTarget({
  engine,
  clientId,
  message,
  hint = null,
  limits,
  policy = null,
} = {}) {
  const normalizedClientId = Number(clientId || 0);
  if (!Number.isInteger(normalizedClientId) || normalizedClientId <= 0) {
    return { status: "none" };
  }

  const normalizedHint = normalizeScopeHint(hint);
  const queryText = normalizedHint.queryText || String(message || "");
  const normalizedMessage = normalizeText(queryText);
  if (!normalizedMessage) {
    return { status: "none" };
  }

  const effectiveLimits = normalizeLimits(limits);
  const candidates = await collectCandidates({
    engine,
    clientId: normalizedClientId,
    limits: effectiveLimits,
    policy,
  });

  if (!candidates.length) {
    return { status: "none" };
  }

  const messageTokens = tokenize(normalizedMessage);
  const messageDates = extractMessageDates(queryText);
  const ranked = candidates
    .map((candidate) =>
      scoreCandidate({
        candidate,
        messageNormalized: normalizedMessage,
        messageTokens,
        messageDates,
        preferredScopeLevels: normalizedHint.preferredScopeLevels,
      }),
    )
    .filter((candidate) => candidate.score > 0)
    .sort(orderCandidates);

  if (!ranked.length) {
    return { status: "none" };
  }

  const top = ranked[0];
  const second = ranked[1] || null;
  const candidatesPreview = ranked.slice(0, effectiveLimits.maxClarifyCandidates).map(toCandidatePreview);
  const topScore = Number(top?.score || 0);
  const runnerUpScore = Number(second?.score || 0);

  if (top.score < effectiveLimits.minResolvedScore) {
    return {
      status: "none",
      target: null,
      candidates: candidatesPreview.slice(0, 5),
      topScore,
      runnerUpScore,
    };
  }

  if (
    second &&
    second.score >= effectiveLimits.minResolvedScore * 0.9 &&
    top.score - second.score < effectiveLimits.ambiguousMargin
  ) {
    return {
      status: "clarify",
      target: null,
      candidates: candidatesPreview,
      topScore,
      runnerUpScore,
    };
  }

  const target = {
    entityType: top.entityType,
    entityId: top.entityId,
    confidence: top.score,
  };
  return {
    status: "resolved",
    target,
    entityType: top.entityType,
    entityId: top.entityId,
    confidence: top.score,
    candidatesPreview: candidatesPreview.slice(0, 5),
    candidates: candidatesPreview,
    topScore,
    runnerUpScore,
  };
}

module.exports = {
  discoverScopedTarget,
  normalizeScopeHint,
};
