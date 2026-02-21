"use strict";

const { READ_INTENTS } = require("../../intent.classifier");
const { generateWebSearchAiSummary } = require("../../llm/llm.client");

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
  const preferMcp = String(process.env.SEARCH_WEB_USE_MCP || "").trim() === "1";
  return {
    intent:
      normalizedIntent === READ_INTENTS.WEB_SEARCH
        ? READ_INTENTS.WEB_SEARCH
        : READ_INTENTS.WEB_SEARCH,
    toolName: preferMcp ? "mcpWebSearch" : "webSearch",
    paramsBuilder: ({ query }) =>
      preferMcp
        ? { query }
        : { query, category: "general", language: "en", limit: 8 },
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

function _extractDomain(url = "") {
  try {
    return new URL(String(url || "").trim()).hostname.replace(/^www\./i, "");
  } catch {
    return "";
  }
}

function _cleanText(text = "", maxLen = 220) {
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

function _buildHeuristicAiSummary(query, rows, citations) {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const cleanQuery = _cleanText(query || "the requested topic", 120);
  const firstSnippet = _cleanText(rows[0]?.snippet || "", 280);
  const secondSnippet = _cleanText(rows[1]?.snippet || "", 220);
  const sourceNames = Array.from(
    new Set(
      rows
        .slice(0, 5)
        .map((row) => String(row?.source || "").trim() || _extractDomain(row?.url || ""))
        .filter(Boolean),
    ),
  );

  const sourceLine =
    sourceNames.length > 0
      ? `Coverage includes ${sourceNames.join(", ")}.`
      : "Coverage includes multiple independent publications.";
  const snippetLine = firstSnippet
    ? `Current coverage suggests: ${firstSnippet} [1]`
    : "Current coverage suggests converging viewpoints across multiple sources [1].";
  const breadthLine = secondSnippet
    ? `Additional reporting notes: ${secondSnippet} [2]`
    : "Additional reporting reinforces similar themes with differences in framing [2].";
  const caveatLine =
    citations.length >= 3
      ? "Cross-source comparison shows recurring claims with meaningful differences in emphasis [3]."
      : "The evidence remains directional and should be cross-checked against primary technical disclosures [1].";

  return {
    shortAnswer: [
      `Based on ${rows.length} web source${rows.length === 1 ? "" : "s"}, ${cleanQuery} is currently documented as follows.`,
      `${snippetLine} ${sourceLine}`,
      `${breadthLine} ${caveatLine}`,
    ].join("\n\n").trim(),
    keyHighlights: rows
      .slice(0, 3)
      .map((row) => _cleanText(row?.title || "", 120))
      .filter(Boolean),
    citations,
  };
}

function _buildSearchCitations(rows = [], max = 10) {
  const citations = [];
  for (let i = 0; i < rows.length && citations.length < max; i += 1) {
    const url = String(rows[i]?.url || "").trim();
    if (!url) continue;
    citations.push({ index: i + 1, url });
  }
  return citations;
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
  let execution;
  try {
    execution = await this.executeToolV2(selected.toolName, toolParams, policy, {
      planId: "search_web",
      stepIndex: 0,
      confirmed: true,
      contextSource: "search_web_gate",
    });
  } catch (error) {
    const message = String(error?.message || "");
    const shouldFallback =
      selected.toolName === "mcpWebSearch" &&
      /MCP|not available|not connected|ECONNREFUSED|tools\/list|tools\/call/i.test(
        message,
      );
    if (!shouldFallback) throw error;

    console.warn(
      "[SearchFlow] mcpWebSearch unavailable, falling back to webSearch",
      JSON.stringify({ query, reason: message.slice(0, 200) }),
    );
    execution = await this.executeToolV2(
      "webSearch",
      { query, category: "general", language: "en", limit: 8 },
      policy,
      {
        planId: "search_web",
        stepIndex: 0,
        confirmed: true,
        contextSource: "search_web_gate_fallback",
      },
    );
  }

  try {
    const toolResult = execution?.result || {};
    const rows = _normalizeSearchRows(toolResult.results);
    const citations = _buildSearchCitations(rows, 10);
    const aiSummaryBase =
      rows.length > 0
        ? await generateWebSearchAiSummary({
            query,
            mode: "basic",
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
        : _buildHeuristicAiSummary(query, rows, citations);
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
      provider: String(toolResult.provider || "web"),
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
      status:
        rows.length === 0
          ? "no_results"
          : aiSummary
            ? "search_done_summary_complete"
            : "search_done_summary_pending",
      aiSummary,
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
  } catch (error) {
    console.warn(
      "[SearchFlow] Search stage degraded fallback",
      JSON.stringify({ query, error: String(error?.message || error).slice(0, 240) }),
    );
    return {
      intent: "SEARCH_WEB",
      agentVersion: policy.version,
      reasoner: "search-web-gate-fallback",
      output: {
        type: "web_search_results",
        query,
        searchIntent: selected.intent,
        triggeredBy,
        provider: "web",
        results: [],
        resultCount: 0,
        message: "No external results found.",
        sources: [],
        timestamp: new Date().toISOString(),
        status: "no_results",
        aiSummary: null,
        source: "search-web-gate-fallback",
        requires_validation: false,
      },
      isSearchIntent: true,
      searchMeta: {
        query,
        triggeredBy,
        searchIntent: selected.intent,
        resultCount: 0,
      },
    };
  }
}

module.exports = {
  SEARCH_INTENTS,
  _executeSearchWebIntent,
};
