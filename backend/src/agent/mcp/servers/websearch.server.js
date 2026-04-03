'use strict';

/**
 * Mock MCP Server: Web Search
 *
 * Local utility server used by `npm run mcp:websearch` for development.
 * This is intentionally lightweight and independent from legacy agent code.
 */

const WEBSEARCH_SERVER_CONFIG = {
  name: 'websearch',
  transport: 'http',
  endpoint: process.env.MCP_WEBSEARCH_ENDPOINT || 'http://localhost:3100',
  capabilities: ['tools'],
  env: {
    SEARCH_API_KEY: process.env.SEARCH_API_KEY,
  },
};

const WEBSEARCH_TOOLS = [
  {
    name: 'search_web',
    description:
      'Search the web for information. Returns relevant search results with titles, URLs, and snippets.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The search query',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results (default: 10, max: 20)',
          default: 10,
          minimum: 1,
          maximum: 20,
        },
        language: {
          type: 'string',
          description: 'Language code for results (e.g., "en", "de", "fr")',
          default: 'en',
        },
      },
      required: ['query'],
    },
    sideEffects: false,
  },
  {
    name: 'search_legal',
    description: 'Search legal databases and resources. Specialized for legal research.',
    inputSchema: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'The legal search query',
        },
        jurisdiction: {
          type: 'string',
          description: 'Legal jurisdiction (e.g., "DE", "EU", "US")',
          default: 'DE',
        },
        documentType: {
          type: 'string',
          enum: ['case', 'statute', 'regulation', 'commentary', 'all'],
          description: 'Type of legal document to search',
          default: 'all',
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of results',
          default: 10,
          minimum: 1,
          maximum: 50,
        },
      },
      required: ['query'],
    },
    sideEffects: false,
  },
  {
    name: 'fetch_url',
    description:
      'Fetch and extract content from a URL. Returns cleaned text content.',
    inputSchema: {
      type: 'object',
      properties: {
        url: {
          type: 'string',
          format: 'uri',
          description: 'The URL to fetch',
        },
        extractMode: {
          type: 'string',
          enum: ['text', 'markdown', 'html'],
          description: 'How to extract content',
          default: 'text',
        },
        maxLength: {
          type: 'integer',
          description: 'Maximum content length to return',
          default: 10000,
        },
      },
      required: ['url'],
    },
    sideEffects: false,
  },
];

const WEBSEARCH_HANDLERS = {
  search_web: async ({ query, limit = 10, language = 'en' }) => {
    return {
      query,
      language,
      totalResults: 1250000,
      results: [
        {
          title: `Search result for: ${query}`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `Sample search result for "${query}" from local mock server.`,
          publishedDate: new Date().toISOString(),
        },
      ].slice(0, limit),
      searchTime: 0.234,
    };
  },

  search_legal: async ({ query, jurisdiction = 'DE', documentType = 'all', limit = 10 }) => {
    return {
      query,
      jurisdiction,
      documentType,
      totalResults: 42,
      results: [
        {
          title: `Legal document: ${query}`,
          citation: 'BGH, 12.03.2024 - I ZR 123/23',
          type: documentType === 'all' ? 'case' : documentType,
          jurisdiction,
          summary: `Legal document summary related to "${query}".`,
          url: 'https://example-legal-db.de/doc/123',
        },
      ].slice(0, limit),
    };
  },

  fetch_url: async ({ url, extractMode = 'text', maxLength = 10000 }) => {
    return {
      url,
      extractMode,
      content: `Content extracted from ${url}.`.slice(0, maxLength),
      contentLength: 1234,
      truncated: false,
      fetchedAt: new Date().toISOString(),
    };
  },
};

function createWebSearchMCPServer() {
  return {
    config: WEBSEARCH_SERVER_CONFIG,
    tools: WEBSEARCH_TOOLS,
    handlers: WEBSEARCH_HANDLERS,

    handleToolsList() {
      return {
        tools: WEBSEARCH_TOOLS.map((tool) => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          sideEffects: tool.sideEffects,
        })),
      };
    },

    async handleToolsCall({ name, arguments: args }) {
      const handler = WEBSEARCH_HANDLERS[name];
      if (!handler) {
        throw new Error(`Unknown tool: ${name}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(await handler(args)),
          },
        ],
      };
    },
  };
}

module.exports = {
  WEBSEARCH_SERVER_CONFIG,
  WEBSEARCH_TOOLS,
  WEBSEARCH_HANDLERS,
  createWebSearchMCPServer,
};
