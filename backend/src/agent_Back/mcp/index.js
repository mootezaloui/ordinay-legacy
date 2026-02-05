'use strict';

/**
 * MCP Integration Module
 *
 * Provides standardized bridge to external tools via Model Context Protocol.
 *
 * ARCHITECTURE:
 * - MCPClient: Connects to MCP servers, discovers tools, executes calls
 * - MCPToolAdapter: Wraps MCP tools as native agent tools
 * - Example servers: Reference implementations (websearch, etc.)
 *
 * SAFETY GUARANTEES:
 * - MCP tools are read-only by default
 * - Execution requires explicit plan step
 * - Results always include source citation
 * - All operations logged via ledger
 */

const { MCPClient, MCP_SERVER_STATE, MCP_CALL_MODE } = require('./mcp.client');
const { MCPToolAdapter } = require('./mcp.adapter');

/**
 * Initialize MCP integration
 * @param {Object} options
 * @param {ToolRegistry} options.toolRegistry - Native tool registry
 * @param {AgentLedgerService} options.ledger - Ledger for logging
 * @param {Object} options.clientOptions - MCPClient options
 * @returns {Object} MCP integration instance
 */
function initializeMCPIntegration({ toolRegistry, ledger, clientOptions = {} }) {
  const mcpClient = new MCPClient(clientOptions);
  const mcpAdapter = new MCPToolAdapter({
    mcpClient,
    toolRegistry,
    ledger,
  });

  return {
    client: mcpClient,
    adapter: mcpAdapter,

    /**
     * Register and connect to an MCP server
     * @param {Object} serverConfig - Server configuration
     * @returns {Promise<Object>} Connection result
     */
    async connectServer(serverConfig) {
      mcpClient.registerServer(serverConfig);
      return mcpClient.connect(serverConfig.name);
    },

    /**
     * Register all tools from a connected server as native tools
     * @param {string} serverName - Server name
     * @param {Object} options - Registration options
     * @returns {Object[]} Registered tools
     */
    registerServerTools(serverName, options = {}) {
      return mcpAdapter.registerServerTools(serverName, options);
    },

    /**
     * Disconnect from a server
     * @param {string} serverName - Server name
     */
    async disconnectServer(serverName) {
      return mcpClient.disconnect(serverName);
    },

    /**
     * Get integration status
     * @returns {Object} Status summary
     */
    getStatus() {
      const servers = mcpClient.listServers();
      const adaptedTools = mcpAdapter.listAdaptedTools();

      return {
        serverCount: servers.length,
        connectedServers: servers.filter(s => s.state === MCP_SERVER_STATE.CONNECTED).length,
        adaptedToolCount: adaptedTools.length,
        servers,
        adaptedTools,
      };
    },
  };
}

module.exports = {
  MCPClient,
  MCPToolAdapter,
  MCP_SERVER_STATE,
  MCP_CALL_MODE,
  initializeMCPIntegration,
};
