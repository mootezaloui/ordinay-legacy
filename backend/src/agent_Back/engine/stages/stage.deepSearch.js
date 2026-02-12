"use strict";

const { READ_INTENTS } = require("../../intent.classifier");

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
  const execution = await this.executeToolV2(
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

  const toolResult = execution?.result || {};
  const rows = normalizeRows(toolResult.results);
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
    status: rows.length === 0 ? "no_results" : "search_done_summary_pending",
    reason,
    aiSummary: null,
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
