'use strict';

/**
 * MCP Client
 *
 * Standardized client for connecting to MCP (Model Context Protocol) servers.
 * This is a BRIDGE to external tools, not a replacement for the agent.
 *
 * CRITICAL RULES:
 * - MCP tools are read-only by default
 * - Execution requires explicit plan step
 * - Results are always cited with source
 * - The agent engine remains the intelligence owner
 */

const EventEmitter = require('events');

/**
 * MCP Server connection states
 */
const MCP_SERVER_STATE = Object.freeze({
  DISCONNECTED: 'disconnected',
  CONNECTING: 'connecting',
  CONNECTED: 'connected',
  ERROR: 'error',
});

/**
 * MCP tool call modes
 */
const MCP_CALL_MODE = Object.freeze({
  READ_ONLY: 'read_only',
  EXECUTE: 'execute',
});

class MCPClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this._servers = new Map();
    this._tools = new Map();
    this._timeout = options.timeout || 30000;
    this._logger = options.logger || console;
    this._initialized = false;
  }

  /**
   * Register an MCP server
   * @param {Object} serverConfig - Server configuration
   * @param {string} serverConfig.name - Unique server name
   * @param {string} serverConfig.transport - Transport type (stdio, http, websocket)
   * @param {string} serverConfig.endpoint - Server endpoint (command path or URL)
   * @param {Object} serverConfig.env - Environment variables for the server
   * @param {string[]} serverConfig.capabilities - Server capabilities
   * @returns {Object} Registered server info
   */
  registerServer(serverConfig) {
    this._validateServerConfig(serverConfig);

    if (this._servers.has(serverConfig.name)) {
      throw new Error(`MCP server '${serverConfig.name}' is already registered`);
    }

    const server = {
      name: serverConfig.name,
      transport: serverConfig.transport,
      endpoint: serverConfig.endpoint,
      env: serverConfig.env || {},
      capabilities: serverConfig.capabilities || [],
      state: MCP_SERVER_STATE.DISCONNECTED,
      tools: [],
      registeredAt: new Date().toISOString(),
    };

    this._servers.set(serverConfig.name, server);
    this.emit('server:registered', { serverName: server.name });

    return { ...server };
  }

  /**
   * Connect to an MCP server and discover its tools
   * @param {string} serverName - Name of the registered server
   * @returns {Promise<Object>} Connection result with discovered tools
   */
  async connect(serverName) {
    const server = this._servers.get(serverName);
    if (!server) {
      throw new Error(`MCP server '${serverName}' is not registered`);
    }

    if (server.state === MCP_SERVER_STATE.CONNECTED) {
      return { server: serverName, status: 'already_connected', tools: server.tools };
    }

    server.state = MCP_SERVER_STATE.CONNECTING;
    this.emit('server:connecting', { serverName });

    try {
      // Discover tools from the server
      const tools = await this._discoverTools(server);

      // Register discovered tools
      for (const tool of tools) {
        const mcpToolId = `${serverName}:${tool.name}`;
        this._tools.set(mcpToolId, {
          ...tool,
          serverName,
          mcpToolId,
        });
        server.tools.push(mcpToolId);
      }

      server.state = MCP_SERVER_STATE.CONNECTED;
      server.connectedAt = new Date().toISOString();

      this.emit('server:connected', { serverName, toolCount: tools.length });

      return {
        server: serverName,
        status: 'connected',
        tools: tools.map(t => t.name),
      };
    } catch (error) {
      server.state = MCP_SERVER_STATE.ERROR;
      server.error = error.message;
      this.emit('server:error', { serverName, error: error.message });
      throw error;
    }
  }

  /**
   * Disconnect from an MCP server
   * @param {string} serverName - Name of the server
   */
  async disconnect(serverName) {
    const server = this._servers.get(serverName);
    if (!server) {
      return;
    }

    // Remove tools from this server
    for (const toolId of server.tools) {
      this._tools.delete(toolId);
    }
    server.tools = [];
    server.state = MCP_SERVER_STATE.DISCONNECTED;

    this.emit('server:disconnected', { serverName });
  }

  /**
   * List all available MCP tools
   * @param {Object} filters - Optional filters
   * @param {string} filters.serverName - Filter by server
   * @returns {Object[]} Array of tool definitions
   */
  listTools(filters = {}) {
    let tools = Array.from(this._tools.values());

    if (filters.serverName) {
      tools = tools.filter(t => t.serverName === filters.serverName);
    }

    return tools.map(tool => ({
      mcpToolId: tool.mcpToolId,
      name: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema,
      serverName: tool.serverName,
    }));
  }

  /**
   * Get a specific MCP tool
   * @param {string} mcpToolId - Full tool ID (serverName:toolName)
   * @returns {Object|null} Tool definition or null
   */
  getTool(mcpToolId) {
    return this._tools.get(mcpToolId) || null;
  }

  /**
   * Call an MCP tool safely
   * @param {Object} options - Call options
   * @param {string} options.mcpToolId - Full tool ID (serverName:toolName)
   * @param {Object} options.params - Tool parameters
   * @param {string} options.mode - Call mode (read_only or execute)
   * @param {Object} options.context - Execution context
   * @returns {Promise<Object>} Tool result with citation
   */
  async callTool({ mcpToolId, params, mode = MCP_CALL_MODE.READ_ONLY, context = {} }) {
    const tool = this._tools.get(mcpToolId);
    if (!tool) {
      throw new Error(`MCP tool '${mcpToolId}' not found`);
    }

    const server = this._servers.get(tool.serverName);
    if (!server || server.state !== MCP_SERVER_STATE.CONNECTED) {
      throw new Error(`MCP server '${tool.serverName}' is not connected`);
    }

    // Safety check: read-only mode blocks write operations
    if (mode === MCP_CALL_MODE.READ_ONLY && tool.sideEffects) {
      throw new Error(
        `Tool '${mcpToolId}' has side effects and cannot be called in read-only mode. ` +
        `Use mode='execute' with explicit plan step.`
      );
    }

    const callId = this._generateCallId();
    const callStart = Date.now();

    this.emit('tool:calling', { mcpToolId, callId, params, mode });

    try {
      // Execute the tool via the server's transport
      const result = await this._executeToolCall(server, tool, params);

      const callDuration = Date.now() - callStart;

      // Build cited result
      const citedResult = {
        success: true,
        mcpToolId,
        callId,
        result: result.data,
        citation: {
          source: `mcp:${tool.serverName}`,
          tool: tool.name,
          timestamp: new Date().toISOString(),
          callDuration,
        },
      };

      this.emit('tool:success', { mcpToolId, callId, duration: callDuration });

      return citedResult;
    } catch (error) {
      this.emit('tool:error', { mcpToolId, callId, error: error.message });

      return {
        success: false,
        mcpToolId,
        callId,
        error: error.message,
        citation: {
          source: `mcp:${tool.serverName}`,
          tool: tool.name,
          timestamp: new Date().toISOString(),
          failed: true,
        },
      };
    }
  }

  /**
   * Get server status
   * @param {string} serverName - Server name
   * @returns {Object|null} Server status
   */
  getServerStatus(serverName) {
    const server = this._servers.get(serverName);
    if (!server) return null;

    return {
      name: server.name,
      state: server.state,
      toolCount: server.tools.length,
      connectedAt: server.connectedAt,
      error: server.error,
    };
  }

  /**
   * List all registered servers
   * @returns {Object[]} Server list
   */
  listServers() {
    return Array.from(this._servers.values()).map(s => ({
      name: s.name,
      transport: s.transport,
      state: s.state,
      toolCount: s.tools.length,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────

  _validateServerConfig(config) {
    if (!config.name || typeof config.name !== 'string') {
      throw new Error('MCP server config requires a name');
    }
    if (!config.transport || !['stdio', 'http', 'websocket'].includes(config.transport)) {
      throw new Error('MCP server config requires valid transport (stdio, http, websocket)');
    }
    if (!config.endpoint) {
      throw new Error('MCP server config requires an endpoint');
    }
  }

  /**
   * Discover tools from an MCP server
   * @private
   */
  async _discoverTools(server) {
    // This would use the actual MCP protocol to list tools
    // For now, we implement the protocol interface

    if (server.transport === 'http') {
      return this._discoverToolsHTTP(server);
    } else if (server.transport === 'stdio') {
      return this._discoverToolsStdio(server);
    } else if (server.transport === 'websocket') {
      return this._discoverToolsWebSocket(server);
    }

    throw new Error(`Unsupported transport: ${server.transport}`);
  }

  /**
   * Discover tools via HTTP transport
   * @private
   */
  async _discoverToolsHTTP(server) {
    const response = await this._httpRequest({
      method: 'POST',
      url: `${server.endpoint}/mcp/tools/list`,
      body: { jsonrpc: '2.0', method: 'tools/list', params: {}, id: 1 },
      timeout: this._timeout,
    });

    if (response.error) {
      throw new Error(`MCP tools/list failed: ${response.error.message}`);
    }

    return response.result.tools || [];
  }

  /**
   * Discover tools via stdio transport
   * @private
   */
  async _discoverToolsStdio(server) {
    // Stdio transport implementation would spawn process and communicate via JSON-RPC
    // This is a placeholder for the actual implementation
    return [];
  }

  /**
   * Discover tools via WebSocket transport
   * @private
   */
  async _discoverToolsWebSocket(server) {
    // WebSocket transport implementation
    // This is a placeholder for the actual implementation
    return [];
  }

  /**
   * Execute a tool call via the server's transport
   * @private
   */
  async _executeToolCall(server, tool, params) {
    if (server.transport === 'http') {
      return this._executeToolCallHTTP(server, tool, params);
    } else if (server.transport === 'stdio') {
      return this._executeToolCallStdio(server, tool, params);
    } else if (server.transport === 'websocket') {
      return this._executeToolCallWebSocket(server, tool, params);
    }

    throw new Error(`Unsupported transport: ${server.transport}`);
  }

  /**
   * Execute tool call via HTTP
   * @private
   */
  async _executeToolCallHTTP(server, tool, params) {
    const response = await this._httpRequest({
      method: 'POST',
      url: `${server.endpoint}/mcp/tools/call`,
      body: {
        jsonrpc: '2.0',
        method: 'tools/call',
        params: {
          name: tool.name,
          arguments: params,
        },
        id: this._generateCallId(),
      },
      timeout: this._timeout,
    });

    if (response.error) {
      throw new Error(`MCP tool call failed: ${response.error.message}`);
    }

    return { data: response.result };
  }

  /**
   * Execute tool call via stdio
   * @private
   */
  async _executeToolCallStdio(server, tool, params) {
    // Placeholder for stdio implementation
    throw new Error('Stdio transport not yet implemented');
  }

  /**
   * Execute tool call via WebSocket
   * @private
   */
  async _executeToolCallWebSocket(server, tool, params) {
    // Placeholder for WebSocket implementation
    throw new Error('WebSocket transport not yet implemented');
  }

  /**
   * Make an HTTP request
   * @private
   */
  async _httpRequest({ method, url, body, timeout }) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      return response.json();
    } catch (error) {
      clearTimeout(timeoutId);
      if (error.name === 'AbortError') {
        throw new Error(`Request timeout after ${timeout}ms`);
      }
      throw error;
    }
  }

  /**
   * Generate a unique call ID
   * @private
   */
  _generateCallId() {
    return `mcp_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

module.exports = {
  MCPClient,
  MCP_SERVER_STATE,
  MCP_CALL_MODE,
};
