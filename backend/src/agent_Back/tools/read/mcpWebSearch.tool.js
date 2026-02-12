'use strict';

const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 500 },
    language: { type: 'string', default: 'en' },
    limit: { type: 'integer', minimum: 1, maximum: 20, default: 8 },
  },
  required: ['query'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    provider: { type: 'string' },
    status: { type: 'string' },
    reason: { type: ['string', 'null'] },
    resultCount: { type: 'integer' },
    totalEstimatedMatches: { type: 'integer' },
    someResultsRemoved: { type: 'boolean' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          title: { type: 'string' },
          displayUrl: { type: ['string', 'null'] },
          snippet: { type: 'string' },
          summary: { type: ['string', 'null'] },
          url: { type: 'string' },
          datePublished: { type: ['string', 'null'] },
          dateLastCrawled: { type: ['string', 'null'] },
          source: { type: ['string', 'null'] },
          publishedDate: { type: ['string', 'null'] },
        },
        required: ['id', 'title', 'snippet', 'url', 'source', 'publishedDate'],
      },
    },
    citation: { type: 'object' },
  },
  required: [
    'query',
    'provider',
    'status',
    'reason',
    'resultCount',
    'totalEstimatedMatches',
    'someResultsRemoved',
    'results',
    'citation',
  ],
  additionalProperties: false,
};

function readLangSearchConfig() {
  const timeout = parseInt(process.env.LANGSEARCH_TIMEOUT || '15000', 10);
  return {
    apiKey: String(process.env.LANGSEARCH_API_KEY || '').trim(),
    baseUrl: String(process.env.LANGSEARCH_BASE_URL || 'https://api.langsearch.com').trim(),
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
  };
}

function _buildUnavailableResult(query, reason) {
  console.debug('[LangSearch] Results: 0');
  return {
    query,
    provider: 'langsearch',
    status: 'unavailable',
    reason,
    resultCount: 0,
    totalEstimatedMatches: 0,
    someResultsRemoved: false,
    results: [],
    citation: {
      source: 'langsearch',
      reason,
    },
  };
}

function normalizeResults(payload) {
  const list = Array.isArray(payload?.data?.webPages?.value)
    ? payload.data.webPages.value
    : [];

  return list
    .map((item, idx) => ({
      id: String(item?.id || idx + 1),
      title: String(item?.name || item?.title || 'Untitled result'),
      url: String(item?.url || '').trim(),
      displayUrl: item?.displayUrl ? String(item.displayUrl) : null,
      snippet: String(item?.snippet || item?.description || ''),
      summary: item?.summary ? String(item.summary) : null,
      datePublished: item?.datePublished ? String(item.datePublished) : null,
      dateLastCrawled: item?.dateLastCrawled ? String(item.dateLastCrawled) : null,
      source: item?.siteName ? String(item.siteName) : null,
      publishedDate: item?.datePublished ? String(item.datePublished) : null,
    }))
    .filter((item) => item.url);
}

function toToolResult({ query, status, reason = null, payload = null }) {
  const results = normalizeResults(payload);
  const totalEstimatedMatchesRaw = payload?.data?.webPages?.totalEstimatedMatches;
  const totalEstimatedMatches = Number.isFinite(totalEstimatedMatchesRaw)
    ? totalEstimatedMatchesRaw
    : Number.parseInt(totalEstimatedMatchesRaw || '0', 10) || 0;

  const someResultsRemoved = Boolean(payload?.data?.webPages?.someResultsRemoved);
  console.debug(`[LangSearch] Results: ${results.length}`);
  return {
    query,
    provider: 'langsearch',
    status,
    reason,
    resultCount: results.length,
    totalEstimatedMatches,
    someResultsRemoved,
    results,
    citation: {
      source: 'langsearch',
      endpoint: '/v1/web-search',
    },
  };
}

async function handler({ query }) {
  const config = readLangSearchConfig();
  console.debug(`[LangSearch] Query: ${query}`);

  if (!config.apiKey) {
    return _buildUnavailableResult(query, 'langsearch_not_configured');
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/web-search`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeout);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        freshness: 'noLimit',
        summary: true,
        count: 10,
      }),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch (_parseError) {
      payload = null;
    }

    if (response.status === 401 || response.status === 403) {
      return toToolResult({ query, status: 'error', reason: 'invalid_api_key' });
    }
    if (response.status === 429) {
      return toToolResult({ query, status: 'rate_limited' });
    }
    if (!response.ok) {
      return _buildUnavailableResult(query, 'external_provider_unreachable');
    }

    return toToolResult({ query, status: 'complete', payload });
  } catch (error) {
    return _buildUnavailableResult(query, 'external_provider_unreachable');
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  name: 'mcpWebSearch',
  category: TOOL_CATEGORIES.READ,
  description: 'Execute external web search through MCP server (explicit activation required).',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
