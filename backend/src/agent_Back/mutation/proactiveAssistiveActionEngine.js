"use strict";

const {
  ACTION_TYPES,
  ENTITY_NORMS,
  SCORING_WEIGHTS,
  ACTION_TYPE_RANKS,
  SPAM_GUARDS,
} = require("./proactiveActionNorms");
const { parseJsonResponse } = require("../llm/llm.validation");

// ─── Feature flags ────────────────────────────────────────────────────────────

function _isTruthyEnv(val) {
  return ["1", "true", "yes", "on"].includes(String(val || "").toLowerCase());
}

const PAAE_ENABLED = _isTruthyEnv(process.env.AGENT_PAAE_ENABLED ?? "1");
const PAAE_MIN_SCORE = parseFloat(process.env.AGENT_PAAE_MIN_RELEVANCE_SCORE || "0.50");
const PAAE_MIN_CONFIDENCE = parseFloat(process.env.AGENT_PAAE_MIN_CONFIDENCE || "0.45");
const PAAE_MAX_PER_TURN = Math.max(
  1,
  parseInt(process.env.AGENT_PAAE_MAX_SUGGESTIONS_PER_TURN || "2", 10),
);

// ─── In-memory session dedup store ───────────────────────────────────────────

// conversationId → Map<dedupKey, lastEmittedAt>
const _sessionDedup = new Map();

function _buildDedupKey(suggestion) {
  return `${suggestion.actionType}:${suggestion.targetEntityType || ""}:${suggestion.field || ""}`;
}

function _isRecentlyEmitted(conversationId, suggestion) {
  if (!conversationId) return false;
  const sessionMap = _sessionDedup.get(conversationId);
  if (!sessionMap) return false;
  const key = _buildDedupKey(suggestion);
  const lastAt = sessionMap.get(key);
  if (!lastAt) return false;
  return Date.now() - lastAt < SPAM_GUARDS.sessionDedupWindowMs;
}

function _markEmitted(conversationId, suggestions) {
  if (!conversationId || !Array.isArray(suggestions)) return;
  if (!_sessionDedup.has(conversationId)) {
    _sessionDedup.set(conversationId, new Map());
  }
  const sessionMap = _sessionDedup.get(conversationId);
  const now = Date.now();
  for (const s of suggestions) {
    sessionMap.set(_buildDedupKey(s), now);
  }
  // Prune stale entries
  if (sessionMap.size > 100) {
    for (const [k, t] of sessionMap) {
      if (now - t > SPAM_GUARDS.sessionDedupWindowMs) sessionMap.delete(k);
    }
  }
}

// ─── L1: Entity Completeness Profiler ────────────────────────────────────────

const KNOWN_ENTITY_TYPES = [
  "dossier", "client", "lawsuit", "session", "task",
  "financial_entry", "mission", "officer", "personal_task",
];

const ENTITY_PLURAL_KEYS = Object.freeze({
  financial_entry: "financial_entries",
  personal_task: "personal_tasks",
});

function _pluralKey(entityType) {
  return ENTITY_PLURAL_KEYS[entityType] || `${entityType}s`;
}

function _extractEntityData(toolExecutions) {
  if (!Array.isArray(toolExecutions) || toolExecutions.length === 0) return [];
  const entities = [];
  for (const exec of toolExecutions) {
    if (!exec?.ok) continue;
    const result = exec.result;
    if (!result || typeof result !== "object") continue;
    console.log("[PAAE][L1] toolExec", JSON.stringify({
      toolName: exec.toolName,
      resultKeys: Object.keys(result).slice(0, 10),
    }));

    // ── Case 1: getEntityGraph result ──────────────────────────────────────
    if (result.root && typeof result.root === "object" && result.root.type) {
      const entityType = String(result.root.type).toLowerCase();
      if (KNOWN_ENTITY_TYPES.includes(entityType)) {
        const syntheticData = {
          id: result.root.id,
          ...result.root,
          // Attach children arrays for _checkCondition
          lawsuits: Array.isArray(result.children?.lawsuits) ? result.children.lawsuits : undefined,
          sessions: Array.isArray(result.children?.sessions) ? result.children.sessions : undefined,
          tasks: Array.isArray(result.children?.tasks) ? result.children.tasks : undefined,
          dossiers: Array.isArray(result.children?.dossiers) ? result.children.dossiers : undefined,
          // Parent linkage
          dossierId: result.parents?.dossier?.id || null,
          lawsuitId: result.parents?.lawsuit?.id || null,
          clientId: result.parents?.client?.id || null,
        };
        console.log("[PAAE][L1] entity from getEntityGraph", entityType, "id:", syntheticData.id);
        entities.push({ entityType, data: syntheticData });
      }
      continue;
    }

    // ── Case 2: direct single-entity result (e.g. { client: {...} }) ───────
    let foundSingle = false;
    for (const entityType of KNOWN_ENTITY_TYPES) {
      if (result[entityType] && typeof result[entityType] === "object" && !Array.isArray(result[entityType])) {
        console.log("[PAAE][L1] entity found (single)", entityType, "id:", result[entityType]?.id || null);
        entities.push({ entityType, data: result[entityType] });
        foundSingle = true;
      }
    }
    if (foundSingle) continue;

    // ── Case 3: list result with exactly 1 item — treat as focused entity read
    for (const entityType of KNOWN_ENTITY_TYPES) {
      const pk = _pluralKey(entityType);
      if (Array.isArray(result[pk]) && result[pk].length === 1) {
        console.log("[PAAE][L1] entity from single-item list", entityType, "id:", result[pk][0]?.id || null);
        entities.push({ entityType, data: result[pk][0] });
        break;
      }
    }

    // ── Case 4: list with multiple items — suppress (user is browsing)
    for (const entityType of KNOWN_ENTITY_TYPES) {
      const pk = _pluralKey(entityType);
      if (Array.isArray(result[pk]) && result[pk].length > 1) {
        console.log("[PAAE][L1] list-read suppression (multi)", exec.toolName, "key:", pk, "count:", result[pk].length);
        break;
      }
    }
  }
  // Deduplicate by (entityType, id) — same entity from multiple tool calls in one turn
  const _seenKeys = new Set();
  return entities.filter((e) => {
    const key = `${e.entityType}:${e.data?.id || e.data?._id || "noId"}`;
    if (_seenKeys.has(key)) { console.log("[PAAE][L1] dedup skip", key); return false; }
    _seenKeys.add(key);
    return true;
  });
}

function _checkCondition(condition, data) {
  switch (condition) {
    case "no_active_lawsuit":
      return !data.lawsuits?.length && !data.lawsuit_id && !data.lawsuitId &&
             !data.active_lawsuit && !data.activeLawsuit;
    case "no_upcoming_session":
      return !data.sessions?.length && !data.next_session && !data.nextSession &&
             !data.upcoming_session && !data.upcomingSession;
    case "no_open_tasks":
      return !data.tasks?.some((t) => t.status !== "done" && t.status !== "closed" && t.status !== "completed") &&
             !data.open_tasks && !data.openTasks && !data.task_count && !data.taskCount;
    case "no_active_dossier":
      // Only fire when dossiers array was explicitly populated (e.g. getEntityGraph children).
      // Raw DB rows have data.dossiers === undefined — absence of array means unknown, not absent.
      if (Array.isArray(data.dossiers)) {
        return data.dossiers.length === 0 && !data.active_dossier && !data.activeDossier;
      }
      return false;
    case "no_upcoming_hearing":
      return !data.next_hearing_date && !data.nextHearingDate &&
             !data.next_session && !data.sessions?.length;
    default:
      return false;
  }
}

function _toCamel(str) {
  return str.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
}

function _isFieldMissing(data, field) {
  const v1 = data[field];
  const v2 = data[_toCamel(field)];
  const val = v1 !== undefined ? v1 : v2;
  return val === null || val === undefined || val === "" || val === 0;
}

function _profileEntityCompleteness(entities) {
  const candidates = [];
  for (const { entityType, data } of entities) {
    const norms = ENTITY_NORMS[entityType];
    if (!norms) continue;

    // Expected relations (deterministic gate)
    for (const rel of (norms.expectedRelations || [])) {
      if (_checkCondition(rel.condition, data)) {
        candidates.push({
          actionType: rel.actionType,
          targetEntityType: rel.targetEntityType,
          sourceEntityType: entityType,
          sourceEntityId: data.id || data._id || null,
          contextSignals: rel.contextSignals,
          urgency: rel.urgency,
          label: rel.label,
          reasonTemplate: rel.reasonTemplate,
          conditionMet: true,
        });
      }
    }

    // Missing fields
    for (const fieldSpec of (norms.criticalMissingFields || [])) {
      if (_isFieldMissing(data, fieldSpec.field)) {
        candidates.push({
          actionType: fieldSpec.actionType,
          targetEntityType: entityType,
          sourceEntityType: entityType,
          sourceEntityId: data.id || data._id || null,
          field: fieldSpec.field,
          contextSignals: [],
          urgency: fieldSpec.urgency,
          label: fieldSpec.label,
          reasonTemplate: fieldSpec.reasonTemplate,
          conditionMet: true,
        });
      }
    }

    // Document opportunities (need conversation signal — conditionMet=false)
    for (const docOpp of (norms.documentOpportunities || [])) {
      candidates.push({
        actionType: docOpp.actionType,
        targetEntityType: entityType,
        sourceEntityType: entityType,
        sourceEntityId: data.id || data._id || null,
        documentType: docOpp.documentType || null,
        contextSignals: docOpp.contextSignals,
        urgency: docOpp.urgency,
        label: docOpp.label,
        reasonTemplate: docOpp.reasonTemplate,
        conditionMet: false,
      });
    }

    // Note opportunities (need conversation signal — conditionMet=false)
    for (const noteOpp of (norms.noteOpportunities || [])) {
      candidates.push({
        actionType: noteOpp.actionType,
        targetEntityType: entityType,
        sourceEntityType: entityType,
        sourceEntityId: data.id || data._id || null,
        contextSignals: noteOpp.contextSignals,
        urgency: noteOpp.urgency,
        label: noteOpp.label,
        reasonTemplate: noteOpp.reasonTemplate,
        conditionMet: false,
      });
    }
  }
  return candidates;
}

// ─── L1b: Conversation Signal Analysis ───────────────────────────────────────
// Detects entity-creation intent directly from the user message text.
// Produces conditionMet=false candidates that the LLM judge must confirm.
// Activated even when tool executions returned no entities.

const CONVERSATION_SIGNALS = [
  {
    pattern: /\b(lawsuit|litigation|court|sue\b|legal.{0,6}action|file.{0,6}case|go.{0,10}(to|for).{0,10}(court|lawsuit|case)|custody|guardianship|inheritance|divorce\b|proceeding)\b/i,
    actionType: ACTION_TYPES.CREATE_ENTITY,
    targetEntityType: "lawsuit",
    urgency: 0.80,
    label: "Open a lawsuit for this case",
    reasonTemplate: "User mentioned initiating a lawsuit in this conversation.",
    contextSignals: ["lawsuit", "legal_action", "custody"],
  },
  {
    pattern: /\b(schedule|set.{0,10}(meeting|appointment|hearing)|book.{0,10}(meeting|session)|next.{0,10}(hearing|meeting)|plan.{0,10}session)\b/i,
    actionType: ACTION_TYPES.CREATE_ENTITY,
    targetEntityType: "session",
    urgency: 0.65,
    label: "Schedule a session",
    reasonTemplate: "User mentioned scheduling a meeting or hearing.",
    contextSignals: ["session", "meeting", "hearing"],
  },
];

function _extractSignalsFromMessage(userMessage) {
  if (!userMessage || typeof userMessage !== "string") return [];
  const candidates = [];
  for (const sig of CONVERSATION_SIGNALS) {
    if (sig.pattern.test(userMessage)) {
      console.log("[PAAE][L1b] signal matched:", sig.targetEntityType, "from message");
      candidates.push({
        actionType: sig.actionType,
        targetEntityType: sig.targetEntityType,
        sourceEntityType: null,
        sourceEntityId: null,
        contextSignals: sig.contextSignals,
        urgency: sig.urgency,
        label: sig.label,
        reasonTemplate: sig.reasonTemplate,
        conditionMet: false,
      });
    }
  }
  return candidates;
}

// ─── L2: LLM Proactive Action Judge ──────────────────────────────────────────

function _buildConversationSnippet(userMessage) {
  return String(userMessage || "").slice(0, 400);
}

function _buildJudgePrompt(candidates, userMessage, entityContext) {
  const conversationSnippet = _buildConversationSnippet(userMessage);
  const candidateSummary = candidates.map((c, i) => ({
    index: i,
    actionType: c.actionType,
    label: c.label,
    reason: c.reasonTemplate,
    contextSignals: c.contextSignals,
    conditionMet: c.conditionMet,
  }));
  return [
    "You are a legal office assistant evaluating which proactive suggestions are relevant to the current conversation.",
    "For each candidate action, return a relevanceScore from 0.0 to 1.0.",
    "A score >= 0.6 means the action is clearly relevant and should be shown.",
    "A score < 0.4 means it would be intrusive or unrelated.",
    "Base your scores on: conversation topic, what the user just said, entity state, and natural next steps.",
    "If conditionMet=true, the system has already verified the precondition — score based on conversation relevance only.",
    "Return JSON only. No markdown. No explanation outside the JSON.",
    "Schema: [{\"index\": 0, \"relevanceScore\": 0.8, \"reason\": \"...\"}]",
    "",
    `User message: "${conversationSnippet}"`,
    `Entity context: ${JSON.stringify(entityContext || {})}`,
    `Candidates: ${JSON.stringify(candidateSummary)}`,
    "JSON:",
  ].join("\n");
}

async function _llmJudge(candidates, userMessage, entityContext, llmClient) {
  const prompt = _buildJudgePrompt(candidates, userMessage, entityContext);
  try {
    const raw = await llmClient(prompt, null, null);
    if (!raw) return candidates.map((_, i) => ({ index: i, relevanceScore: 0.3, reason: "llm_null" }));
    const parsed = parseJsonResponse(raw);
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    return candidates.map((_, i) => ({ index: i, relevanceScore: 0.3, reason: "parse_failed" }));
  } catch (_) {
    return candidates.map((_, i) => ({ index: i, relevanceScore: 0.3, reason: "llm_error" }));
  }
}

// ─── L3: Prioritization & Arbitration ────────────────────────────────────────

function _computeScore(candidate, llmScore) {
  const confidence = Math.max(0, Math.min(1, llmScore || 0));
  const urgency = Math.max(0, Math.min(1, candidate.urgency || 0));
  const rank = ACTION_TYPE_RANKS[candidate.actionType] || 0.5;
  return (
    confidence * SCORING_WEIGHTS.confidence +
    urgency * SCORING_WEIGHTS.urgency +
    rank * SCORING_WEIGHTS.actionTypeRank
  );
}

function _arbitrate(candidates, llmScores, conversationId) {
  const scored = candidates.map((candidate, i) => {
    const llmEntry = llmScores.find((s) => s.index === i);
    const relevanceScore = llmEntry?.relevanceScore ?? 0.3;
    const finalScore = _computeScore(candidate, relevanceScore);
    return { ...candidate, relevanceScore, finalScore, llmReason: llmEntry?.reason || "" };
  });

  // Filter by minimum thresholds
  const passing = scored.filter((s) => {
    if (s.relevanceScore < PAAE_MIN_CONFIDENCE) return false;
    if (s.finalScore < PAAE_MIN_SCORE) return false;
    // conditionMet=false candidates need higher conversation signal
    if (!s.conditionMet && s.relevanceScore < 0.60) return false;
    return true;
  });

  // Dedup by session
  const deduplicated = passing.filter((s) => !_isRecentlyEmitted(conversationId, s));

  // Sort by finalScore descending
  deduplicated.sort((a, b) => b.finalScore - a.finalScore);

  // Cap at max per turn
  return deduplicated.slice(0, PAAE_MAX_PER_TURN);
}

// ─── L4: Output Builder ───────────────────────────────────────────────────────

function _buildOutput(suggestions) {
  return {
    type: "assist_suggestions",
    suggestions: suggestions.map((s) => ({
      actionType: s.actionType,
      targetEntityType: s.targetEntityType || null,
      sourceEntityType: s.sourceEntityType,
      sourceEntityId: s.sourceEntityId || null,
      label: s.label,
      reason: s.reasonTemplate,
      field: s.field || null,
      documentType: s.documentType || null,
      relevanceScore: Math.round(s.relevanceScore * 100) / 100,
      finalScore: Math.round(s.finalScore * 100) / 100,
    })),
    generatedAt: new Date().toISOString(),
  };
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Run the Proactive Assistive Action Engine.
 *
 * @param {object} params
 * @param {Array}  params.toolExecutions  — tool execution results from the current turn
 * @param {string} params.userMessage     — the user's message text
 * @param {string} params.conversationId  — for session dedup
 * @param {number} params.turnCount       — current turn count (anti-spam gate)
 * @param {boolean} params.isClarification — suppress during clarification turns
 * @param {Function} params.llmClient     — generateChatResponse function
 * @returns {Promise<object|null>} assistSuggestions artifact or null
 */
async function runPAAE({
  toolExecutions = [],
  userMessage = "",
  conversationId = null,
  turnCount = 0,
  isClarification = false,
  llmClient,
} = {}) {
  console.log("[PAAE] runPAAE called", JSON.stringify({
    enabled: PAAE_ENABLED,
    toolExecutionCount: Array.isArray(toolExecutions) ? toolExecutions.length : 0,
    turnCount,
    isClarification,
    conversationId: conversationId ? String(conversationId).slice(0, 12) : null,
  }));

  // Feature gate
  if (!PAAE_ENABLED) { console.log("[PAAE] disabled by flag"); return null; }

  // Anti-spam: minimum turn count
  if (turnCount < SPAM_GUARDS.minTurnCount) { console.log("[PAAE] suppressed: turnCount", turnCount, "< minTurnCount", SPAM_GUARDS.minTurnCount); return null; }

  // Anti-spam: suppress during clarification turns
  if (isClarification) { console.log("[PAAE] suppressed: clarification turn"); return null; }

  // L1: Extract entity data from tool executions
  const entities = _extractEntityData(toolExecutions);
  console.log("[PAAE][L1] entities extracted:", entities.map((e) => `${e.entityType}#${e.data?.id || "?"}`));

  // L1: Profile entity completeness — produce entity-state candidates
  const entityCandidates = _profileEntityCompleteness(entities);

  // L1b: Conversation signal analysis — message-level creation-intent candidates
  const signalCandidates = _extractSignalsFromMessage(userMessage);

  const candidates = [...entityCandidates, ...signalCandidates];
  console.log("[PAAE][L1] candidates:", candidates.length, candidates.map((c) => `${c.actionType}:${c.targetEntityType}:conditionMet=${c.conditionMet}`));
  if (candidates.length === 0) { console.log("[PAAE] no candidates — returning null"); return null; }

  // Build entity context summary for LLM judge
  const entityContext = entities.map((e) => ({
    entityType: e.entityType,
    id: e.data.id || e.data._id || null,
    name: e.data.name || e.data.title || e.data.reference || null,
  }));

  // Cap candidates before LLM to prevent parse failures on large sets.
  // Prioritise conditionMet=true first, then by urgency descending.
  const MAX_LLM_CANDIDATES = 5;
  const cappedCandidates = candidates
    .slice()
    .sort((a, b) => (b.conditionMet ? 1 : 0) - (a.conditionMet ? 1 : 0) || b.urgency - a.urgency)
    .slice(0, MAX_LLM_CANDIDATES);
  console.log("[PAAE][L2] candidates capped", candidates.length, "->", cappedCandidates.length);

  // L2: LLM judge — score all candidates
  const llmScores = llmClient
    ? await _llmJudge(cappedCandidates, userMessage, entityContext, llmClient)
    : cappedCandidates.map((_, i) => ({ index: i, relevanceScore: 0.4, reason: "no_llm" }));
  console.log("[PAAE][L2] llmScores:", JSON.stringify(llmScores));

  // L3: Arbitration — filter, score, dedup, cap
  const selected = _arbitrate(cappedCandidates, llmScores, conversationId);
  console.log("[PAAE][L3] selected after arbitration:", selected.length, selected.map((s) => `${s.actionType}:${s.targetEntityType}:score=${s.finalScore}`));
  if (selected.length === 0) { console.log("[PAAE] nothing passed arbitration — returning null"); return null; }

  // L4: Build output artifact
  const output = _buildOutput(selected);
  console.log("[PAAE][L4] output built:", output.suggestions.length, "suggestions");

  // Mark as emitted for session dedup
  _markEmitted(conversationId, selected);

  return output;
}

module.exports = {
  runPAAE,
  ACTION_TYPES,
};
