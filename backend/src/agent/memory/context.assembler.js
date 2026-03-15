"use strict";

const {
  MAX_ENTITY_DIGEST_CHARS,
  MAX_ENTITY_DIGEST_ITEMS,
  MAX_RECENT_TURNS,
} = require("./memory.policy");
const {
  buildDeterministicKey,
  stableStringify,
} = require("../performance/hotpath.optimizer");

const ALLOWED_ROLES = new Set(["system", "user", "assistant", "tool"]);
const READ_POLICY_INSTRUCTIONS = [
  "DATA ACCESS POLICY",
  "",
  "The system manages structured legal practice data stored in the database.",
  "",
  "When a user question references any of the following:",
  "",
  "- client",
  "- dossier",
  "- lawsuit",
  "- task",
  "- document",
  "- financial entry",
  "- notification",
  "- history event",
  "- workload",
  "- cases",
  "- deadlines",
  "- sessions",
  "",
  "the information must be retrieved using READ tools.",
  "",
  "Never infer database state without retrieving it.",
  "",
  "If a question refers to database records, the agent must use READ tools before producing the final answer.",
  "",
  "Questions about general legal knowledge, concepts, or explanations do not require tools.",
  "",
  "This rule guides tool usage but does not enforce it programmatically.",
  "",
  "GRAPH TRAVERSAL GUIDELINES",
  "",
  "Entity relationships in the system:",
  "",
  "Client -> Dossiers -> Lawsuits -> Tasks/Sessions",
  "Dossier -> Tasks / Sessions / Documents",
  "Lawsuit -> Sessions",
  "Document -> History",
  "",
  "Recommended traversal depths:",
  "",
  "- Client workload queries: depth 2-3",
  "- Dossier context queries: depth 1-2",
  "- Document history queries: depth 1",
  "",
  "Avoid shallow traversal when the user asks about workload, cases, or related activity.",
  "",
  "PRESENTATION QUALITY GUIDELINES",
  "",
  "Use the format (table, bullets, or concise prose) that is most readable for the current answer.",
  "Keep one consistent date/time style in a response and prefer explicit UTC labels for database-derived timestamps.",
  "Do not output raw JSON, tool payload wrappers, or stream-event fragments in user-facing text.",
  "Keep sections compact and non-redundant; avoid repeating the same fact in multiple sections.",
  "If data is partial or uncertain, state that clearly instead of filling gaps with assumptions.",
].join("\n");

function createContextAssembler(options = {}) {
  const maxRecentTurns = normalizePositiveInt(options.maxRecentTurns, MAX_RECENT_TURNS);
  const maxEntityItems = normalizePositiveInt(options.maxEntityItems, MAX_ENTITY_DIGEST_ITEMS);
  const maxEntityChars = normalizePositiveInt(options.maxEntityChars, MAX_ENTITY_DIGEST_CHARS);
  const retrievalRuntime = options.retrievalRuntime;
  const groundingRuntime = options.groundingRuntime;
  const operationsRuntime = options.operationsRuntime;
  const summaryBlockCache = normalizeCache(options.summaryBlockCache);
  const entityDigestCache = normalizeCache(options.entityDigestCache);
  const pendingBlockCache = normalizeCache(options.pendingBlockCache);
  const cacheStats = {
    summary: { hits: 0, misses: 0 },
    entities: { hits: 0, misses: 0 },
    pending: { hits: 0, misses: 0 },
  };

  return {
    build(session, input) {
      const messages = [];
      messages.push({
        role: "system",
        content: READ_POLICY_INSTRUCTIONS,
      });
      const turnId = normalizeTurnId(input?.turnId);
      const sessionId = String(session?.id || "").trim();
      if (groundingRuntime && turnId && typeof groundingRuntime.beginTurn === "function") {
        groundingRuntime.beginTurn(turnId);
      }

      const summary = String(session?.summary || "").trim();
      if (summary) {
        if (
          groundingRuntime &&
          turnId &&
          typeof groundingRuntime.registerSummary === "function"
        ) {
          groundingRuntime.registerSummary({
            turnId,
            sessionId,
            summary,
          });
        }

        const summaryBlock = getCachedPureValue({
          cache: summaryBlockCache,
          cacheKey: buildDeterministicKey(["summary_block", summary]),
          statsBucket: cacheStats.summary,
          compute: () => `Conversation summary:\n${summary}`,
        });
        messages.push({
          role: "system",
          content: summaryBlock,
        });
      }

      const entityDigest = getCachedPureValue({
        cache: entityDigestCache,
        cacheKey: buildDeterministicKey([
          "entity_digest",
          maxEntityItems,
          maxEntityChars,
          stableStringify(buildEntityDigestCacheInput(session?.activeEntities)),
        ]),
        statsBucket: cacheStats.entities,
        compute: () => buildEntityDigest(session?.activeEntities, maxEntityItems, maxEntityChars),
      });
      if (entityDigest) {
        messages.push({
          role: "system",
          content: `Active entities:\n${entityDigest}`,
        });
      }

      const pending = session?.state?.pendingAction;
      if (pending && typeof pending === "object") {
        const pendingBlock = getCachedPureValue({
          cache: pendingBlockCache,
          cacheKey: buildDeterministicKey([
            "pending_block",
            stableStringify({
              toolName: pending.toolName,
              summary: pending.summary,
            }),
          ]),
          statsBucket: cacheStats.pending,
          compute: () =>
            [
              "Pending action awaiting confirmation:",
              `- Tool: ${String(pending.toolName || "unknown")}`,
              `- Summary: ${String(pending.summary || "")}`,
            ].join("\n"),
        });
        messages.push({
          role: "system",
          content: pendingBlock,
        });
      }

      const retrievalPayload = buildRetrievalContextPayload(
        retrievalRuntime,
        operationsRuntime,
        session,
        input,
      );
      if (retrievalPayload.text) {
        const grounded = wrapGroundedContext({
          groundingRuntime,
          turnId,
          session,
          retrievalText: retrievalPayload.text,
          retrievalMatches: retrievalPayload.matches,
        });
        if (grounded.text) {
          messages.push({
            role: "system",
            content: grounded.text,
          });
        } else {
          messages.push({
            role: "system",
            content: `Retrieved context:\n${retrievalPayload.text}`,
          });
        }
      }

      const turns = Array.isArray(session?.turns) ? session.turns.slice(-maxRecentTurns) : [];
      for (const turn of turns) {
        const role = normalizeRole(turn?.role);
        const content = String(turn?.message || "").trim();
        if (!content) {
          continue;
        }
        messages.push({ role, content });
      }

      messages.push({
        role: "user",
        content: String(input?.message || "").trim(),
      });

      return messages;
    },
    getCacheStats() {
      return {
        summaryBlock: buildStatsRow("summaryBlock", summaryBlockCache, cacheStats.summary),
        entityDigest: buildStatsRow("entityDigest", entityDigestCache, cacheStats.entities),
        pendingBlock: buildStatsRow("pendingBlock", pendingBlockCache, cacheStats.pending),
      };
    },
  };
}

function buildRetrievalContextPayload(retrievalRuntime, operationsRuntime, session, input) {
  if (isRetrievalDisabledBySafeMode(operationsRuntime)) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval context skipped by safe mode");
    return { text: "", matches: [] };
  }

  if (
    !retrievalRuntime ||
    typeof retrievalRuntime.isEnabled !== "function" ||
    typeof retrievalRuntime.buildRetrievalContext !== "function"
  ) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval runtime unavailable");
    return { text: "", matches: [] };
  }

  if (!retrievalRuntime.isEnabled()) {
    maybeLogRetrievalDecision(operationsRuntime, "retrieval runtime disabled");
    return { text: "", matches: [] };
  }

  try {
    const context = retrievalRuntime.buildRetrievalContext({ session, input });
    if (typeof context === "string") {
      return { text: context.trim(), matches: [] };
    }
    if (typeof context?.text === "string") {
      return {
        text: context.text.trim(),
        matches: Array.isArray(context.matches) ? context.matches : [],
      };
    }
    maybeLogRetrievalDecision(operationsRuntime, "retrieval context produced no text");
    return { text: "", matches: [] };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error || "unknown retrieval context error");
    console.warn(`[agent.retrieval] context block skipped: ${message}`);
    maybeLogRetrievalDecision(operationsRuntime, `retrieval context failed: ${message}`);
    return { text: "", matches: [] };
  }
}

function wrapGroundedContext({
  groundingRuntime,
  turnId,
  session,
  retrievalText,
  retrievalMatches,
}) {
  if (!groundingRuntime || !turnId) {
    return { text: retrievalText, sectionSourceIds: {} };
  }

  const retrievalSourceIds =
    typeof groundingRuntime.registerRetrievalMatches === "function"
      ? groundingRuntime.registerRetrievalMatches({
          turnId,
          matches: retrievalMatches,
        })
      : [];

  const toolData = buildToolVerifiedData(session);
  const wrapped =
    typeof groundingRuntime.wrapContext === "function"
      ? groundingRuntime.wrapContext({
          retrievalText,
          retrievalSourceIds,
          toolDataText: toolData.text,
          toolSourceIds: toolData.sourceIds,
          inferenceText:
            "Use the evidence above for factual claims. State uncertainty when support is limited.",
        })
      : { text: retrievalText, sectionSourceIds: {} };

  if (
    wrapped &&
    typeof groundingRuntime.attachSectionSourceIds === "function" &&
    wrapped.sectionSourceIds
  ) {
    groundingRuntime.attachSectionSourceIds(turnId, wrapped.sectionSourceIds);
  }

  return wrapped && typeof wrapped.text === "string"
    ? wrapped
    : { text: retrievalText, sectionSourceIds: {} };
}

function buildToolVerifiedData(session) {
  const turns = Array.isArray(session?.turns) ? session.turns : [];
  const latestToolTurns = turns.filter((row) => row?.role === "tool").slice(-2);
  if (latestToolTurns.length === 0) {
    return { text: "", sourceIds: [] };
  }

  const lines = [];
  for (const turn of latestToolTurns) {
    const parsed = parseJsonRecord(turn?.message);
    const toolName =
      normalizeOptionalString(parsed?.tool) ||
      normalizeOptionalString(turn?.toolCalls?.[0]?.toolName) ||
      "tool";
    const ok = parsed?.result?.ok === true;
    lines.push(`- ${toolName}: ${ok ? "ok" : "reported result"}`);
  }

  return {
    text: lines.join("\n"),
    sourceIds: [],
  };
}

function buildEntityDigest(activeEntities, maxItems, maxChars) {
  if (!Array.isArray(activeEntities) || activeEntities.length === 0) {
    return "";
  }

  const sorted = activeEntities
    .slice()
    .sort((left, right) => {
      const leftTime = Date.parse(String(left?.lastMentionedAt || ""));
      const rightTime = Date.parse(String(right?.lastMentionedAt || ""));
      if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) {
        return rightTime - leftTime;
      }
      return 0;
    });

  const visible = sorted.slice(0, maxItems);
  const hiddenCount = Math.max(sorted.length - visible.length, 0);

  const lines = visible.map((entity) => {
    const type = String(entity?.type || "entity");
    const id = String(entity?.id ?? "unknown");
    const label = String(entity?.label || "").trim();
    const source = String(entity?.sourceTool || "").trim();
    const labelPart = label ? ` (${label})` : "";
    const sourcePart = source ? ` [${source}]` : "";
    return `- ${type}:${id}${labelPart}${sourcePart}`;
  });

  if (hiddenCount > 0) {
    lines.push(`- +${hiddenCount} more entities`);
  }

  const digest = lines.join("\n");
  if (digest.length <= maxChars) {
    return digest;
  }
  return digest.slice(0, Math.max(maxChars - 3, 1)).trimEnd() + "...";
}

function normalizeRole(role) {
  const normalized = String(role || "assistant").trim().toLowerCase();
  return ALLOWED_ROLES.has(normalized) ? normalized : "assistant";
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseJsonRecord(value) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeTurnId(value) {
  return normalizeOptionalString(value);
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function buildEntityDigestCacheInput(activeEntities) {
  if (!Array.isArray(activeEntities)) {
    return [];
  }
  return activeEntities.map((entity) => ({
    type: String(entity?.type || ""),
    id: String(entity?.id ?? ""),
    label: String(entity?.label || ""),
    sourceTool: String(entity?.sourceTool || ""),
    lastMentionedAt: String(entity?.lastMentionedAt || ""),
    lastReferencedTurnId: String(entity?.lastReferencedTurnId || ""),
  }));
}

function normalizeCache(value) {
  if (
    value &&
    typeof value === "object" &&
    typeof value.get === "function" &&
    typeof value.set === "function"
  ) {
    return value;
  }
  return null;
}

function isRetrievalDisabledBySafeMode(operationsRuntime) {
  return (
    operationsRuntime &&
    operationsRuntime.safeMode &&
    typeof operationsRuntime.safeMode.isRetrievalDisabled === "function" &&
    operationsRuntime.safeMode.isRetrievalDisabled() === true
  );
}

function maybeLogRetrievalDecision(operationsRuntime, message) {
  const shouldLog =
    operationsRuntime &&
    operationsRuntime.debugFlags &&
    typeof operationsRuntime.debugFlags.shouldLogRetrievalDecisions === "function" &&
    operationsRuntime.debugFlags.shouldLogRetrievalDecisions() === true;
  if (shouldLog) {
    console.info(`[agent.operations] ${message}`);
  }
}

function getCachedPureValue({ cache, cacheKey, statsBucket, compute }) {
  if (!cache || !cacheKey) {
    statsBucket.misses += 1;
    return compute();
  }
  const cached = cache.get(cacheKey);
  if (typeof cached === "string") {
    statsBucket.hits += 1;
    return cached;
  }
  statsBucket.misses += 1;
  const value = compute();
  cache.set(cacheKey, value);
  return value;
}

function buildStatsRow(name, cache, statsBucket) {
  const base = {
    name,
    hits: Number(statsBucket?.hits || 0),
    misses: Number(statsBucket?.misses || 0),
  };
  if (!cache || typeof cache.stats !== "function") {
    return base;
  }
  try {
    return {
      ...base,
      ...cache.stats(),
    };
  } catch {
    return base;
  }
}

module.exports = {
  createContextAssembler,
};
