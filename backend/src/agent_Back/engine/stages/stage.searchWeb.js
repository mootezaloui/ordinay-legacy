"use strict";

const { READ_INTENTS } = require("../../intent.classifier");

const SEARCH_INTENTS = new Set([READ_INTENTS.WEB_SEARCH]);
const DEFAULT_TRIGGER = "explicit_language";

function _normalizeQuery({ searchIntent, message, metadata }) {
  const metadataQuery = String(metadata?.webSearchQuery || "").trim();
  if (metadataQuery) return metadataQuery;

  const intentQuery = String(searchIntent?.filters?.query || "").trim();
  if (intentQuery) return intentQuery;

  return String(message || "").trim();
}

function _normalizeTrigger(searchIntent, metadata) {
  const explicitTrigger = String(metadata?.webSearchTrigger || "").trim().toLowerCase();
  if (explicitTrigger === "button" || explicitTrigger === "user_confirmed") {
    return explicitTrigger;
  }
  if (searchIntent?.intent && SEARCH_INTENTS.has(searchIntent.intent)) {
    return DEFAULT_TRIGGER;
  }
  return DEFAULT_TRIGGER;
}

function _selectSearchTool(searchIntent, metadata) {
  const explicitIntent = String(searchIntent?.intent || "").toUpperCase();
  const metadataIntent = String(metadata?.webSearchIntent || "").toUpperCase();
  const normalizedIntent =
    metadataIntent === READ_INTENTS.WEB_SEARCH ? READ_INTENTS.WEB_SEARCH : explicitIntent;
  return {
    intent:
      normalizedIntent === READ_INTENTS.WEB_SEARCH
        ? READ_INTENTS.WEB_SEARCH
        : READ_INTENTS.WEB_SEARCH,
    toolName: "mcpWebSearch",
    paramsBuilder: ({ query }) => ({ query }),
  };
}

function _normalizeSearchRows(results = []) {
  return (Array.isArray(results) ? results : []).map((row, idx) => ({
    id: String(row?.id || idx + 1),
    title: String(row?.title || "Untitled result"),
    snippet: String(row?.snippet || ""),
    url: String(row?.url || ""),
    source: row?.source ? String(row.source) : null,
    publishedDate: row?.publishedDate ? String(row.publishedDate) : null,
  }));
}

async function _executeSearchWebIntent(searchIntent, message, context, policy, engineContext) {
  if (String(searchIntent?.intent || "").toUpperCase() === READ_INTENTS.DEEP_SEARCH) {
    // Backward-compatible delegation path for callers that still dispatch deep intent here.
    return this._executeDeepSearchIntent(searchIntent, message, context, policy, engineContext);
  }
  const metadata = context?.requestMetadata || {};
  const query = _normalizeQuery({ searchIntent, message, metadata });
  const triggeredBy = _normalizeTrigger(searchIntent, metadata);
  const selected = _selectSearchTool(searchIntent, metadata);

  const toolParams = selected.paramsBuilder({ query });
  console.log(
    "[SearchFlow] External search tool call",
    JSON.stringify({
      tool: selected.toolName,
      searchIntent: selected.intent,
      query,
      triggeredBy,
    }),
  );
  const execution = await this.executeToolV2(selected.toolName, toolParams, policy, {
    planId: "search_web",
    stepIndex: 0,
    confirmed: true,
    contextSource: "search_web_gate",
  });

  const toolResult = execution?.result || {};
  const rows = _normalizeSearchRows(toolResult.results);
  if (rows.length === 0) {
    console.log(
      "[SearchFlow] No results found - summary call skipped by stage",
      JSON.stringify({ intent: selected.intent, query }),
    );
  }
  const output = {
    type: "web_search_results",
    query,
    searchIntent: selected.intent,
    triggeredBy,
    provider: String(toolResult.provider || "mcp:websearch"),
    results: rows,
    resultCount: rows.length,
    message: rows.length === 0 ? "No external results found." : null,
    sources: rows
      .filter((row) => row.url)
      .map((row, idx) => ({
        sourceType: "external",
        reference: row.url,
        note: `External search result ${idx + 1}`,
      })),
    timestamp: new Date().toISOString(),
    status: rows.length === 0 ? "no_results" : "search_done_summary_pending",
    aiSummary: null,
    source: "search-web-gate",
    requires_validation: false,
  };

  this._validateContract("web_search_results", output, {
    intent: selected.intent,
    gate: "search_web",
  });

  this.ledger.record({
    type: "external_search",
    query,
    triggeredBy,
    toolName: selected.toolName,
    searchIntent: selected.intent,
    resultCount: rows.length,
    provider: output.provider,
    timestamp: new Date().toISOString(),
  });

  return {
    intent: "SEARCH_WEB",
    agentVersion: policy.version,
    reasoner: "search-web-gate",
    output,
    isSearchIntent: true,
    searchMeta: {
      query,
      triggeredBy,
      searchIntent: selected.intent,
      resultCount: rows.length,
    },
  };
}

module.exports = {
  SEARCH_INTENTS,
  _executeSearchWebIntent,
};
