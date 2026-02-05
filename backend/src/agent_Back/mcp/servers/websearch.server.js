'use strict';

/**
 * Example MCP Server: Web Search
 *
 * This is a reference implementation of an MCP server for web search.
 * It demonstrates how external tools can be exposed via MCP.
 *
 * USAGE:
 * 1. Register this server with the MCP client
 * 2. Connect to discover available tools
 * 3. Call tools through the adapter
 *
 * NOTE: This is a mock implementation for demonstration.
 * In production, connect to actual search APIs (Brave, Tavily, etc.)
 */

/**
 * Web Search MCP Server Configuration
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

/**
 * Tool definitions for the web search server
 * These follow the MCP tool schema format
 */
const WEBSEARCH_TOOLS = [
  {
    name: 'search_web',
    description: 'Search the web for information. Returns relevant search results with titles, URLs, and snippets.',
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
    description: 'Fetch and extract content from a URL. Returns cleaned text content.',
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

/**
 * Mock handler implementations for demonstration
 * In production, these would call actual APIs
 */
const WEBSEARCH_HANDLERS = {
  /**
   * Mock web search handler
   */
  search_web: async ({ query, limit = 10, language = 'en' }) => {
    // Mock response - in production, call Brave/Tavily/etc.
    return {
      query,
      language,
      totalResults: 1250000,
      results: [
        {
          title: `Search result for: ${query}`,
          url: `https://example.com/search?q=${encodeURIComponent(query)}`,
          snippet: `This is a sample search result for "${query}". In production, this would contain actual search results from a web search API.`,
          publishedDate: new Date().toISOString(),
        },
      ].slice(0, limit),
      searchTime: 0.234,
    };
  },

  /**
   * Mock legal search handler
   */
  search_legal: async ({ query, jurisdiction = 'DE', documentType = 'all', limit = 10 }) => {
    // Mock response - in production, call legal database APIs
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
          summary: `Legal document summary related to "${query}". Contains relevant legal precedent.`,
          url: `https://example-legal-db.de/doc/123`,
        },
      ].slice(0, limit),
    };
  },

  /**
   * Mock URL fetch handler
   */
  fetch_url: async ({ url, extractMode = 'text', maxLength = 10000 }) => {
    // Mock response - in production, fetch and parse actual URL
    return {
      url,
      extractMode,
      content: `Content extracted from ${url}. In production, this would contain the actual page content extracted in ${extractMode} format.`.slice(0, maxLength),
      contentLength: 1234,
      truncated: false,
      fetchedAt: new Date().toISOString(),
    };
  },
};

/**
 * Create a mock MCP server for web search
 * This simulates the MCP protocol for local testing
 */
function createWebSearchMCPServer() {
  return {
    config: WEBSEARCH_SERVER_CONFIG,
    tools: WEBSEARCH_TOOLS,
    handlers: WEBSEARCH_HANDLERS,

    /**
     * Handle tools/list request
     */
    handleToolsList() {
      return {
        tools: WEBSEARCH_TOOLS.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema,
          sideEffects: tool.sideEffects,
        })),
      };
    },

    /**
     * Handle tools/call request
     */
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
