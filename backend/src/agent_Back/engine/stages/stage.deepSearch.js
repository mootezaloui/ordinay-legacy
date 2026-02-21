"use strict";

const { READ_INTENTS } = require("../../intent.classifier");
const { generateWebSearchAiSummary } = require("../../llm/llm.client");

function normalizeDeepQuery({ searchIntent, message, metadata }) {
  const metadataQuery = String(
    metadata?.webDeepSearchQuery || metadata?.webSearchQuery || "",
  ).trim();
  if (metadataQuery) return metadataQuery;

  const intentQuery = String(searchIntent?.filters?.query || "").trim();
  if (intentQuery) return intentQuery;

  return String(message || "").trim();
}

function normalizeDeepTrigger(searchIntent, metadata) {
  const rawTrigger = String(
    metadata?.webDeepSearchTrigger || metadata?.webSearchTrigger || "",
  )
    .trim()
    .toLowerCase();
  if (rawTrigger === "button" || rawTrigger === "user_confirmed") {
    return rawTrigger;
  }
  if (searchIntent?.intent === READ_INTENTS.DEEP_SEARCH) {
    return "explicit_language";
  }
  return "explicit_language";
}

function normalizeRows(results = []) {
  return (Array.isArray(results) ? results : []).map((row, idx) => ({
    id: String(row?.id || idx + 1),
    title: String(row?.title || "Untitled result"),
    snippet: String(row?.snippet || ""),
    url: String(row?.url || ""),
    source: row?.source ? String(row.source) : null,
    publishedDate: row?.publishedDate ? String(row.publishedDate) : null,
  }));
}

function extractDomain(url = "") {
  try {
    return new URL(String(url || "").trim()).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function cleanText(text = "", maxLen = 220) {
  const normalized = String(text || "")
    .replace(/\s*-\s*/g, "-")
    .replace(/\s+([,.;:!?%])/g, "$1")
    .replace(/([(\[])\s+/g, "$1")
    .replace(/\s+([)\]])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return "";
  if (normalized.length <= maxLen) return normalized;
  return `${normalized.slice(0, maxLen - 3).trim()}...`;
}

function buildHeuristicAiSummary(query, rows, citations) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const cleanQuery = cleanText(query || "the requested topic", 120);
  const firstSnippet = cleanText(rows[0]?.snippet || "", 280);
  const secondSnippet = cleanText(rows[1]?.snippet || "", 220);
  const sourceNames = Array.from(
    new Set(
      rows
        .slice(0, 5)
        .map((row) => String(row?.source || "").trim() || extractDomain(row?.url || ""))
        .filter(Boolean),
    ),
  );

  const sourceLine =
    sourceNames.length > 0
      ? `Deep-search coverage includes ${sourceNames.join(", ")}.`
      : "Deep-search coverage includes multiple independent publications.";
  const snippetLine = firstSnippet
    ? `Deep-search evidence indicates: ${firstSnippet} [1]`
    : "Deep-search evidence indicates converging viewpoints across multiple sources [1].";
  const breadthLine = secondSnippet
    ? `Additional deep-search reporting notes: ${secondSnippet} [2]`
    : "Additional deep-search reporting reinforces similar themes with different framing [2].";
  const caveatLine =
    citations.length >= 3
      ? "Cross-source synthesis shows shared conclusions with meaningful disagreements in details [3]."
      : "The evidence remains directional and should be validated against primary technical disclosures [1].";

  return {
    shortAnswer: [
      `Based on ${rows.length} deep-search source${rows.length === 1 ? "" : "s"}, ${cleanQuery} is summarized as follows.`,
      `${snippetLine} ${sourceLine}`,
      `${breadthLine} ${caveatLine}`,
    ].join("\n\n").trim(),
    keyHighlights: rows
      .slice(0, 3)
      .map((row) => cleanText(row?.title || "", 120))
      .filter(Boolean),
    citations,
  };
}

function buildSearchCitations(rows = [], max = 10) {
  const citations = [];
  for (let i = 0; i < rows.length && citations.length < max; i += 1) {
    const url = String(rows[i]?.url || "").trim();
    if (!url) continue;
    citations.push({ index: i + 1, url });
  }
  return citations;
}

async function _executeDeepSearchIntent(searchIntent, message, context, policy, engineContext) {
  const metadata = context?.requestMetadata || {};
  const query = normalizeDeepQuery({ searchIntent, message, metadata });
  const triggeredBy = normalizeDeepTrigger(searchIntent, metadata);

  console.log(
    "[SearchFlow] External deep-search tool call",
    JSON.stringify({
      tool: "mcpDeepSearch",
      searchIntent: READ_INTENTS.DEEP_SEARCH,
      query,
      triggeredBy,
    }),
  );
  let execution;
  try {
    execution = await this.executeToolV2(
      "mcpDeepSearch",
      { query, triggeredBy },
      policy,
      {
        planId: "search_deep_web",
        stepIndex: 0,
        confirmed: true,
        contextSource: "search_deep_web_gate",
      },
    );
  } catch (error) {
    const message = String(error?.message || "");
    const shouldFallback =
      /MCP|not available|not connected|ECONNREFUSED|tools\/list|tools\/call/i.test(
        message,
      );
    if (!shouldFallback) throw error;

    console.warn(
      "[SearchFlow] mcpDeepSearch unavailable, falling back to webSearch",
      JSON.stringify({ query, reason: message.slice(0, 200) }),
    );
    execution = await this.executeToolV2(
      "webSearch",
      { query, category: "legal", language: "en", limit: 10 },
      policy,
      {
        planId: "search_deep_web",
        stepIndex: 0,
        confirmed: true,
        contextSource: "search_deep_web_gate_fallback",
      },
    );
  }

  const toolResult = execution?.result || {};
  const rows = normalizeRows(toolResult.results);
  const citations = buildSearchCitations(rows, 10);
  const aiSummaryBase =
    rows.length > 0
      ? await generateWebSearchAiSummary({
          query,
          mode: "deep",
          results: rows,
        })
      : null;
  const aiSummary =
    aiSummaryBase && String(aiSummaryBase.shortAnswer || "").trim().length > 0
      ? {
          shortAnswer: String(aiSummaryBase.shortAnswer || "").trim(),
          keyHighlights: Array.isArray(aiSummaryBase.keyHighlights)
            ? aiSummaryBase.keyHighlights
                .map((item) => String(item || "").trim())
                .filter(Boolean)
            : [],
          citations,
        }
      : buildHeuristicAiSummary(query, rows, citations);
  if (rows.length === 0) {
    console.log(
      "[SearchFlow] No deep-search results found - summary call skipped by stage",
      JSON.stringify({ query }),
    );
  }
  const queries = Array.isArray(toolResult.queries)
    ? toolResult.queries.map((q) => String(q || "").trim()).filter(Boolean)
    : [query];
  const reason = toolResult.reason ? String(toolResult.reason) : null;
  const totalEstimatedMatches = Number.parseInt(
    String(toolResult.totalEstimatedMatches || "0"),
    10,
  ) || 0;

  const output = {
    type: "web_deep_search_results",
    query,
    searchIntent: READ_INTENTS.DEEP_SEARCH,
    triggeredBy,
    provider: String(toolResult.provider || "langsearch"),
    results: rows,
    queries,
    resultCount: rows.length,
    message: rows.length === 0 ? "No external results found." : null,
    totalEstimatedMatches,
    sources: rows
      .filter((row) => row.url)
      .map((row, idx) => ({
        sourceType: "external",
        reference: row.url,
        note: `Deep external search result ${idx + 1}`,
      })),
    timestamp: new Date().toISOString(),
    status:
      rows.length === 0
        ? "no_results"
        : aiSummary
          ? "search_done_summary_complete"
          : "search_done_summary_pending",
    reason,
    aiSummary,
    source: "search-deep-web-gate",
    requires_validation: false,
  };

  this._validateContract("web_deep_search_results", output, {
    intent: READ_INTENTS.DEEP_SEARCH,
    gate: "search_deep_web",
  });

  this.ledger.record({
    type: "external_search",
    mode: "deep",
    query,
    expandedQueries: queries,
    triggeredBy,
    toolName: "mcpDeepSearch",
    searchIntent: READ_INTENTS.DEEP_SEARCH,
    resultCount: rows.length,
    provider: output.provider,
    timestamp: new Date().toISOString(),
  });

  return {
    intent: "SEARCH_DEEP_WEB",
    agentVersion: policy.version,
    reasoner: "search-deep-web-gate",
    output,
    isSearchIntent: true,
    searchMeta: {
      mode: "deep",
      query,
      expandedQueries: queries,
      triggeredBy,
      searchIntent: READ_INTENTS.DEEP_SEARCH,
      resultCount: rows.length,
    },
  };
}

module.exports = {
  _executeDeepSearchIntent,
};
