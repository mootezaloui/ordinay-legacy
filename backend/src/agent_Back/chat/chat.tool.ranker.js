"use strict";

const DEFAULT_TOOL_CAP = Math.max(
  8,
  parseInt(process.env.AGENT_CHAT_TOOL_EXPOSURE_CAP || "24", 10),
);

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s_-]/gu, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(value) {
  return normalizeText(value)
    .split(/\s+/)
    .filter(Boolean);
}

function unique(arr = []) {
  return Array.from(new Set(arr.filter(Boolean)));
}

function buildToolDocument(tool = {}) {
  const profile = tool.profile || {};
  const fields = [
    tool.name,
    profile.group,
    profile.description,
    ...(Array.isArray(profile.examples) ? profile.examples : []),
    ...(Array.isArray(profile.entityTypes) ? profile.entityTypes : []),
  ]
    .map((v) => String(v || "").trim())
    .filter(Boolean);
  return fields.join(" | ");
}

function scoreTool(queryTokens, toolDocTokens, tool = {}) {
  if (!queryTokens.length) return 0;
  const tf = new Map();
  for (const token of toolDocTokens) tf.set(token, (tf.get(token) || 0) + 1);
  let overlap = 0;
  let weighted = 0;
  for (const token of queryTokens) {
    const count = tf.get(token) || 0;
    if (count > 0) {
      overlap += 1;
      weighted += 1 + Math.log(1 + count);
    }
  }
  const overlapRatio = overlap / queryTokens.length;
  const lengthPenalty = toolDocTokens.length > 0 ? Math.log(2 + toolDocTokens.length) : 1;
  const base = overlapRatio * 2.5 + weighted / lengthPenalty;

  // Stable, generic priors (not message-keyword heuristics): prefer read tools very slightly.
  const category = String(tool.category || "").toLowerCase();
  const categoryPrior =
    category === "read" ? 0.08 :
    category === "analysis" ? 0.05 :
    category === "draft" ? 0.03 :
    category === "plan" ? 0.02 : 0;
  return base + categoryPrior;
}

function buildCoreSet(tools = [], { executionContext = {}, llmHistory = {} } = {}) {
  const core = new Set();
  const byName = new Map(tools.map((tool) => [tool.name, tool]));
  ["getEntityGraph", "getTimeline"].forEach((name) => {
    if (byName.has(name)) core.add(name);
  });

  const scopedEntityType = (() => {
    const keyMap = [
      ["dossierId", "dossier"],
      ["lawsuitId", "lawsuit"],
      ["taskId", "task"],
      ["sessionId", "session"],
      ["clientId", "client"],
      ["missionId", "mission"],
    ];
    for (const [key, entityType] of keyMap) {
      if (Number(executionContext?.[key] || 0) > 0) return entityType;
    }
    const activeType = llmHistory?.conversationScope?.activeScope?.entityType;
    return activeType ? String(activeType).toLowerCase() : null;
  })();

  if (scopedEntityType) {
    for (const tool of tools) {
      const entityTypes = Array.isArray(tool?.profile?.entityTypes)
        ? tool.profile.entityTypes
        : [];
      if (!entityTypes.includes(scopedEntityType)) continue;
      if (String(tool.category || "").toLowerCase() !== "read") continue;
      // Stable capability hints based on tool family naming, not query keywords.
      if (/^(get|list)/i.test(String(tool.name || ""))) {
        core.add(tool.name);
      }
    }
  }
  return core;
}

function rankExposedToolsForMessage({
  userMessage,
  tools = [],
  cap = DEFAULT_TOOL_CAP,
  executionContext = {},
  llmHistory = {},
} = {}) {
  const list = Array.isArray(tools) ? tools.slice() : [];
  const queryTokens = unique(tokenize(userMessage));

  const scored = list.map((tool) => {
    const doc = buildToolDocument(tool);
    const docTokens = unique(tokenize(doc));
    return {
      tool,
      score: scoreTool(queryTokens, docTokens, tool),
      doc,
    };
  });

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.tool?.name || "").localeCompare(String(b.tool?.name || ""));
  });

  const coreSet = buildCoreSet(list, { executionContext, llmHistory });
  const ranked = [];
  const seen = new Set();

  for (const entry of scored) {
    if (coreSet.has(entry.tool.name) && !seen.has(entry.tool.name)) {
      ranked.push({ ...entry, reason: "core" });
      seen.add(entry.tool.name);
    }
  }
  for (const entry of scored) {
    if (seen.has(entry.tool.name)) continue;
    ranked.push({ ...entry, reason: "ranked" });
    seen.add(entry.tool.name);
    if (ranked.length >= cap) break;
  }

  const final = ranked.slice(0, cap).map((entry, idx) => ({
    ...entry.tool,
    rank: idx + 1,
    rankScore: Number(entry.score.toFixed(6)),
    rankReason: entry.reason,
  }));

  const rankingMeta = ranked.slice(0, cap).map((entry, idx) => ({
    rank: idx + 1,
    toolName: entry.tool.name,
    score: Number(entry.score.toFixed(6)),
    reason: entry.reason,
    group: entry.tool?.profile?.group || entry.tool.category || null,
  }));

  return { tools: final, rankingMeta, cap };
}

module.exports = {
  rankExposedToolsForMessage,
  DEFAULT_TOOL_CAP,
};

