'use strict';

/**
 * READ TOOL: mcpWebSearch
 *
 * Simple LangSearch-backed external web search for Agent v2.
 * Deep-search fan-out is intentionally not supported.
 */

const TOOL_CATEGORIES = { READ: 'READ' };

const DEFAULT_TIMEOUT_MS = 15000;
const DEFAULT_RESULT_LIMIT = 8;
const MAX_RESULT_LIMIT = 20;
const DEFAULT_BASE_URL = 'https://api.langsearch.com';

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 500 },
    language: { type: 'string', default: 'en' },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: MAX_RESULT_LIMIT,
      default: DEFAULT_RESULT_LIMIT,
    },
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
  const timeoutRaw = Number.parseInt(String(process.env.LANGSEARCH_TIMEOUT || ''), 10);
  return {
    apiKey: String(process.env.LANGSEARCH_API_KEY || '').trim(),
    baseUrl: String(process.env.LANGSEARCH_BASE_URL || DEFAULT_BASE_URL).trim(),
    timeoutMs: Number.isFinite(timeoutRaw) && timeoutRaw > 0 ? timeoutRaw : DEFAULT_TIMEOUT_MS,
  };
}

function normalizeResults(payload) {
  const list = Array.isArray(payload?.data?.webPages?.value) ? payload.data.webPages.value : [];
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
  const totalEstimatedRaw = payload?.data?.webPages?.totalEstimatedMatches;
  const totalEstimatedMatches = Number.isFinite(totalEstimatedRaw)
    ? totalEstimatedRaw
    : Number.parseInt(String(totalEstimatedRaw || '0'), 10) || 0;

  const someResultsRemoved = Boolean(payload?.data?.webPages?.someResultsRemoved);

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

function buildUnavailableResult(query, reason) {
  return toToolResult({
    query,
    status: 'unavailable',
    reason,
    payload: null,
  });
}

function asNonEmptyString(value) {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

async function handler({ query, language = 'en', limit = DEFAULT_RESULT_LIMIT }) {
  const config = readLangSearchConfig();
  const normalizedQuery = asNonEmptyString(query);
  if (!normalizedQuery) {
    const invalid = buildUnavailableResult('', 'invalid_query');
    return {
      ok: true,
      data: invalid,
      metadata: { webSearchResult: invalid },
    };
  }

  if (!config.apiKey) {
    const unavailable = buildUnavailableResult(normalizedQuery, 'langsearch_not_configured');
    return {
      ok: true,
      data: unavailable,
      metadata: { webSearchResult: unavailable },
    };
  }

  const safeLimit = Math.max(1, Math.min(Number(limit) || DEFAULT_RESULT_LIMIT, MAX_RESULT_LIMIT));
  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/web-search`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query: normalizedQuery,
        freshness: 'noLimit',
        summary: true,
        count: safeLimit,
        language: asNonEmptyString(language) || 'en',
      }),
      signal: controller.signal,
    });

    let payload = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    let result;
    if (response.status === 401 || response.status === 403) {
      result = toToolResult({ query: normalizedQuery, status: 'error', reason: 'invalid_api_key' });
    } else if (response.status === 429) {
      result = toToolResult({ query: normalizedQuery, status: 'rate_limited' });
    } else if (!response.ok) {
      result = buildUnavailableResult(normalizedQuery, 'external_provider_unreachable');
    } else {
      result = toToolResult({
        query: normalizedQuery,
        status: 'complete',
        payload,
      });
    }

    return {
      ok: true,
      data: result,
      metadata: { webSearchResult: result },
    };
  } catch {
    const unavailable = buildUnavailableResult(normalizedQuery, 'external_provider_unreachable');
    return {
      ok: true,
      data: unavailable,
      metadata: { webSearchResult: unavailable },
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

module.exports = {
  name: 'mcpWebSearch',
  category: TOOL_CATEGORIES.READ,
  description:
    'Execute external web search through LangSearch (explicit activation only, simple search mode).',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
