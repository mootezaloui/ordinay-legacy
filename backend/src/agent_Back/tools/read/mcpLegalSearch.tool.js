'use strict';

const { TOOL_CATEGORIES } = require('../tool.registry');
const { callMcpSearchTool } = require('./mcpSearch.runtime');

const inputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string', minLength: 2, maxLength: 500 },
    jurisdiction: { type: 'string', default: 'US' },
    limit: { type: 'integer', minimum: 1, maximum: 50, default: 12 },
  },
  required: ['query'],
  additionalProperties: false,
};

const outputSchema = {
  type: 'object',
  properties: {
    query: { type: 'string' },
    provider: { type: 'string' },
    resultCount: { type: 'integer' },
    results: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          snippet: { type: 'string' },
          url: { type: 'string' },
          source: { type: ['string', 'null'] },
          publishedDate: { type: ['string', 'null'] },
        },
        required: ['title', 'snippet', 'url'],
      },
    },
    citation: { type: 'object' },
  },
  required: ['query', 'provider', 'resultCount', 'results', 'citation'],
  additionalProperties: false,
};

function normalizeLegalResults(raw) {
  const list = Array.isArray(raw?.results) ? raw.results : [];
  return list.map((item) => ({
    title: String(item?.title || item?.citation || 'Untitled legal result'),
    snippet: String(item?.summary || item?.snippet || ''),
    url: String(item?.url || ''),
    source: item?.source ? String(item.source) : null,
    publishedDate: item?.publishedDate ? String(item.publishedDate) : null,
  }));
}

async function handler({ query, jurisdiction = 'US', limit = 12 }) {
  const call = await callMcpSearchTool({
    toolName: 'search_legal',
    params: { query, jurisdiction, limit },
  });
  const raw = call.result || {};
  const results = normalizeLegalResults(raw);
  return {
    query,
    provider: call.citation?.source || 'mcp:websearch',
    resultCount: results.length,
    results,
    citation: call.citation,
  };
}

module.exports = {
  name: 'mcpLegalSearch',
  category: TOOL_CATEGORIES.READ,
  description: 'Execute deep legal search through MCP server (explicit activation required).',
  inputSchema,
  outputSchema,
  reversibility: true,
  sideEffects: false,
  allowedAgentVersions: ['v1', 'v2', 'v3'],
  handler,
};
