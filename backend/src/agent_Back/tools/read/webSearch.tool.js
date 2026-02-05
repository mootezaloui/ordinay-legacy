'use strict';

/**
 * READ TOOL: webSearch
 *
 * Light web search for factual, non-sensitive information.
 * Read-only, no side effects, safe for all agent versions.
 *
 * USE CASES:
 * - Public deadlines (court filings, tax, etc.)
 * - Public procedures (legal processes, administrative steps)
 * - Definitions (legal terms, regulations)
 * - Public announcements (holidays, court closures)
 *
 * RULES:
 * - Read-only (no writes)
 * - All results include source citations
 * - No private/authenticated content
 * - Conservative summarization (no hallucination)
 * - Results normalized to consistent format
 */

const { TOOL_CATEGORIES } = require('../tool.registry');
const { normalizeSearchResults, buildCitations } = require('./webSearch.normalizer');
const { executeWebSearch } = require('./webSearch.service');

const inputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      minLength: 2,
      maxLength: 500,
      description: 'The search query for factual information',
    },
    category: {
      type: 'string',
      enum: ['general', 'legal', 'deadline', 'procedure', 'definition'],
      default: 'general',
      description: 'Category of information being searched',
    },
    language: {
      type: 'string',
      enum: ['de', 'en', 'fr'],
      default: 'de',
      description: 'Language for search results',
    },
    limit: {
      type: 'integer',
      minimum: 1,
      maximum: 10,
      default: 5,
      description: 'Maximum number of results to return',
    },
    requireCitation: {
      type: 'boolean',
      default: true,
      description: 'Whether to require source citations (always true for compliance)',
    },
  },
  required: ['query'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    query: {
      type: 'string',
      description: 'The original search query',
    },
    category: {
      type: 'string',
      description: 'Search category used',
    },
    resultCount: {
      type: 'integer',
      description: 'Number of results returned',
    },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          snippet: { type: 'string' },
          url: { type: 'string', format: 'uri' },
          source: { type: 'string' },
          publishedDate: { type: ['string', 'null'] },
          relevanceScore: { type: 'number' },
        },
        required: ['title', 'snippet', 'url', 'source'],
      },
      description: 'Normalized search results',
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          index: { type: 'integer' },
          source: { type: 'string' },
          url: { type: 'string' },
          accessedAt: { type: 'string', format: 'date-time' },
        },
        required: ['index', 'source', 'url', 'accessedAt'],
      },
      description: 'Citation references for all results',
    },
    searchMeta: {
      type: 'object',
      properties: {
        provider: { type: 'string' },
        searchTime: { type: 'number' },
        timestamp: { type: 'string', format: 'date-time' },
      },
      description: 'Search metadata',
    },
  },
  required: ['query', 'category', 'resultCount', 'results', 'citations', 'searchMeta'],
  additionalProperties: false,
};

/**
 * Web search handler
 * @param {Object} params - Search parameters
 * @returns {Promise<Object>} Normalized search results with citations
 */
async function handler({ query, category = 'general', language = 'de', limit = 5, requireCitation = true }) {
  // Execute search via service layer
  const rawResults = await executeWebSearch({
    query,
    category,
    language,
    limit,
  });

  // Normalize results to consistent format
  const normalizedResults = normalizeSearchResults(rawResults, { category, language });

  // Build citations (always required for compliance)
  const citations = buildCitations(normalizedResults);

  return {
    query,
    category,
    resultCount: normalizedResults.length,
    results: normalizedResults,
    citations,
    searchMeta: {
      provider: rawResults.provider || 'web',
      searchTime: rawResults.searchTime || 0,
      timestamp: new Date().toISOString(),
    },
  };
}

module.exports = {
  name: 'webSearch',
  category: TOOL_CATEGORIES.READ,
  description: 'Search the web for factual, public information (deadlines, procedures, definitions). Results include source citations.',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
