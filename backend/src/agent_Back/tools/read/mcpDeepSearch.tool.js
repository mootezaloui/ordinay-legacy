'use strict';

const { TOOL_CATEGORIES } = require('../tool.registry');

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 500 },
    triggeredBy: { type: 'string' },
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
    triggeredBy: { type: ['string', 'null'] },
    queries: {
      type: 'array',
      items: { type: 'string' },
    },
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
    'triggeredBy',
    'queries',
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
  const maxQueries = parseInt(process.env.LANGSEARCH_DEEP_SEARCH_MAX_QUERIES || '3', 10);
  const deepEnabledRaw = String(process.env.LANGSEARCH_DEEP_SEARCH_ENABLED || 'true').trim().toLowerCase();
  const deepEnabled = deepEnabledRaw !== 'false' && deepEnabledRaw !== '0' && deepEnabledRaw !== 'no';
  return {
    apiKey: String(process.env.LANGSEARCH_API_KEY || '').trim(),
    baseUrl: String(process.env.LANGSEARCH_BASE_URL || 'https://api.langsearch.com').trim(),
    timeout: Number.isFinite(timeout) && timeout > 0 ? timeout : 15000,
    maxQueries: Number.isFinite(maxQueries) && maxQueries > 0 ? Math.min(maxQueries, 6) : 3,
    deepEnabled,
  };
}

function buildUnavailableResult(query, reason, triggeredBy = null) {
  console.debug('[LangSearch][Deep] Results: 0');
  return {
    query,
    provider: 'langsearch',
    status: 'unavailable',
    reason,
    triggeredBy,
    queries: [query],
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

function expandQueries(query, maxQueries) {
  const base = String(query || '').trim();
  if (!base) return [];
  const candidates = [
    base,
    `${base} case law`,
    `${base} legal analysis`,
    `${base} recent precedent`,
    `${base} statutory interpretation`,
  ];
  const unique = [];
  for (const candidate of candidates) {
    const normalized = candidate.trim().toLowerCase();
    if (!normalized) continue;
    if (unique.some((existing) => existing.toLowerCase() === normalized)) continue;
    unique.push(candidate.trim());
    if (unique.length >= maxQueries) break;
  }
  return unique;
}

function normalizeResultItem(item, fallbackId) {
  return {
    id: String(item?.id || fallbackId),
    title: String(item?.name || item?.title || 'Untitled result'),
    url: String(item?.url || '').trim(),
    displayUrl: item?.displayUrl ? String(item.displayUrl) : null,
    snippet: String(item?.snippet || item?.description || ''),
    summary: item?.summary ? String(item.summary) : null,
    datePublished: item?.datePublished ? String(item.datePublished) : null,
    dateLastCrawled: item?.dateLastCrawled ? String(item.dateLastCrawled) : null,
    source: item?.siteName ? String(item.siteName) : null,
    publishedDate: item?.datePublished ? String(item.datePublished) : null,
  };
}

async function fetchLangSearchQuery({ endpoint, apiKey, timeout, query }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
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
    return { response, payload };
  } finally {
    clearTimeout(timeoutId);
  }
}

function aggregateDeepResults(queries, calls) {
  const byUrl = new Map();
  let totalEstimatedMatches = 0;
  let someResultsRemoved = false;

  for (let i = 0; i < calls.length; i += 1) {
    const call = calls[i];
    if (!call || !call.response || !call.response.ok) continue;

    const payload = call.payload;
    const list = Array.isArray(payload?.data?.webPages?.value) ? payload.data.webPages.value : [];
    const totalRaw = payload?.data?.webPages?.totalEstimatedMatches;
    const totalParsed = Number.isFinite(totalRaw)
      ? totalRaw
      : Number.parseInt(totalRaw || '0', 10) || 0;
    totalEstimatedMatches += totalParsed;
    someResultsRemoved = someResultsRemoved || Boolean(payload?.data?.webPages?.someResultsRemoved);

    for (let idx = 0; idx < list.length; idx += 1) {
      const normalized = normalizeResultItem(list[idx], `${i + 1}-${idx + 1}`);
      if (!normalized.url) continue;
      if (!byUrl.has(normalized.url)) {
        byUrl.set(normalized.url, normalized);
      }
    }
  }

  const results = Array.from(byUrl.values()).map((row, idx) => ({
    ...row,
    id: String(idx + 1),
  }));

  return {
    queries,
    results,
    resultCount: results.length,
    totalEstimatedMatches,
    someResultsRemoved,
  };
}

async function handler({ query, triggeredBy = null }) {
  const config = readLangSearchConfig();
  const normalizedQuery = String(query || '').trim();
  console.debug(`[LangSearch][Deep] Query: ${normalizedQuery}`);

  if (!config.deepEnabled) {
    return buildUnavailableResult(normalizedQuery, 'deep_search_disabled', triggeredBy);
  }
  if (!config.apiKey) {
    return buildUnavailableResult(normalizedQuery, 'langsearch_not_configured', triggeredBy);
  }

  const endpoint = `${config.baseUrl.replace(/\/+$/, '')}/v1/web-search`;
  const queries = expandQueries(normalizedQuery, config.maxQueries);
  if (queries.length === 0) {
    return buildUnavailableResult(normalizedQuery, 'invalid_query', triggeredBy);
  }

  try {
    const settled = await Promise.allSettled(
      queries.map((expanded) =>
        fetchLangSearchQuery({
          endpoint,
          apiKey: config.apiKey,
          timeout: config.timeout,
          query: expanded,
        }),
      ),
    );

    const calls = settled
      .filter((entry) => entry.status === 'fulfilled')
      .map((entry) => entry.value);

    const hasInvalidKey = calls.some(
      (call) => call.response?.status === 401 || call.response?.status === 403,
    );
    if (hasInvalidKey) {
      console.debug('[LangSearch][Deep] Results: 0');
      return {
        query: normalizedQuery,
        provider: 'langsearch',
        status: 'error',
        reason: 'invalid_api_key',
        triggeredBy,
        queries,
        resultCount: 0,
        totalEstimatedMatches: 0,
        someResultsRemoved: false,
        results: [],
        citation: {
          source: 'langsearch',
          endpoint: '/v1/web-search',
        },
      };
    }

    const successCalls = calls.filter((call) => call.response?.ok);
    if (successCalls.length === 0) {
      const onlyRateLimited =
        calls.length > 0 && calls.every((call) => call.response?.status === 429);
      if (onlyRateLimited) {
        console.debug('[LangSearch][Deep] Results: 0');
        return {
          query: normalizedQuery,
          provider: 'langsearch',
          status: 'rate_limited',
          reason: null,
          triggeredBy,
          queries,
          resultCount: 0,
          totalEstimatedMatches: 0,
          someResultsRemoved: false,
          results: [],
          citation: {
            source: 'langsearch',
            endpoint: '/v1/web-search',
          },
        };
      }
      return buildUnavailableResult(normalizedQuery, 'external_provider_unreachable', triggeredBy);
    }

    const aggregate = aggregateDeepResults(queries, calls);
    console.debug(`[LangSearch][Deep] Results: ${aggregate.resultCount}`);
    return {
      query: normalizedQuery,
      provider: 'langsearch',
      status: 'complete',
      reason: null,
      triggeredBy,
      queries: aggregate.queries,
      resultCount: aggregate.resultCount,
      totalEstimatedMatches: aggregate.totalEstimatedMatches,
      someResultsRemoved: aggregate.someResultsRemoved,
      results: aggregate.results,
      citation: {
        source: 'langsearch',
        endpoint: '/v1/web-search',
      },
    };
  } catch (_error) {
    return buildUnavailableResult(normalizedQuery, 'external_provider_unreachable', triggeredBy);
  }
}

module.exports = {
  name: 'mcpDeepSearch',
  category: TOOL_CATEGORIES.READ,
  description: 'Execute deep external web/legal search via LangSearch (explicit activation required).',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
