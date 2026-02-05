'use strict';

/**
 * MCP Tool Adapter
 *
 * Wraps MCP tools so they appear as native agent tools.
 * Ensures:
 * - Same schema format as native tools
 * - Same permission model (firewall compatible)
 * - Same logging via ledger
 * - Citation of MCP source
 *
 * DESIGN PRINCIPLE:
 * MCP is a bridge, not a replacement. All MCP tools:
 * - Are registered as READ category by default (safe)
 * - Require explicit plan step for EXECUTE operations
 * - Always include source citation in results
 */

const { TOOL_CATEGORIES } = require('../tools/tool.registry');
const { MCP_CALL_MODE } = require('./mcp.client');

/**
 * MCP Tool Adapter
 *
 * Bridges MCP tools to the native tool system.
 */
class MCPToolAdapter {
  /**
   * @param {Object} options
   * @param {MCPClient} options.mcpClient - MCP client instance
   * @param {ToolRegistry} options.toolRegistry - Native tool registry
   * @param {AgentLedgerService} options.ledger - Ledger for logging
   */
  constructor({ mcpClient, toolRegistry, ledger }) {
    if (!mcpClient) {
      throw new Error('MCPToolAdapter requires an MCPClient instance');
    }
    if (!toolRegistry) {
      throw new Error('MCPToolAdapter requires a ToolRegistry instance');
    }
    if (!ledger) {
      throw new Error('MCPToolAdapter requires an AgentLedgerService instance');
    }

    this.mcpClient = mcpClient;
    this.toolRegistry = toolRegistry;
    this.ledger = ledger;

    this._adaptedTools = new Map();
  }

  /**
   * Adapt an MCP tool to native tool format
   * @param {Object} mcpTool - MCP tool definition
   * @param {Object} options - Adaptation options
   * @param {string} options.category - Override category (default: 'read')
   * @param {boolean} options.sideEffects - Override side effects flag
   * @param {string[]} options.allowedAgentVersions - Override allowed versions
   * @returns {Object} Native tool definition
   */
  adaptTool(mcpTool, options = {}) {
    const adaptedName = `mcp_${mcpTool.serverName}_${mcpTool.name}`;

    // Determine category (default to READ for safety)
    const category = options.category || TOOL_CATEGORIES.READ;

    // Side effects: MCP tools are read-only by default
    const sideEffects = options.sideEffects !== undefined
      ? options.sideEffects
      : (mcpTool.sideEffects || false);

    // Allowed versions: default to all for READ, v3 only for EXECUTE
    const allowedAgentVersions = options.allowedAgentVersions
      || (category === TOOL_CATEGORIES.EXECUTE ? ['v3'] : ['v1', 'v2', 'v3']);

    const nativeTool = {
      name: adaptedName,
      category,
      description: `[MCP:${mcpTool.serverName}] ${mcpTool.description || mcpTool.name}`,
      inputSchema: this._normalizeInputSchema(mcpTool.inputSchema),
      outputSchema: this._buildOutputSchema(mcpTool),
      reversibility: !sideEffects,
      sideEffects,
      allowedAgentVersions,
      confirmationRequired: category === TOOL_CATEGORIES.EXECUTE,

      // MCP metadata
      _mcpSource: {
        serverName: mcpTool.serverName,
        toolName: mcpTool.name,
        mcpToolId: mcpTool.mcpToolId,
      },

      // Handler wraps MCP client call
      handler: this._createHandler(mcpTool, { category, sideEffects }),
    };

    this._adaptedTools.set(adaptedName, {
      native: nativeTool,
      mcp: mcpTool,
    });

    return nativeTool;
  }

  /**
   * Adapt all tools from a connected MCP server
   * @param {string} serverName - Server to adapt tools from
   * @param {Object} options - Adaptation options for all tools
   * @returns {Object[]} Array of adapted native tools
   */
  adaptServerTools(serverName, options = {}) {
    const mcpTools = this.mcpClient.listTools({ serverName });
    const adapted = [];

    for (const mcpTool of mcpTools) {
      const fullMcpTool = this.mcpClient.getTool(mcpTool.mcpToolId);
      if (fullMcpTool) {
        const native = this.adaptTool(fullMcpTool, options);
        adapted.push(native);
      }
    }

    return adapted;
  }

  /**
   * Register adapted MCP tools with the native registry
   * @param {string} serverName - Server to register tools from
   * @param {Object} options - Registration options
   * @returns {Object[]} Registered tools
   */
  registerServerTools(serverName, options = {}) {
    const adaptedTools = this.adaptServerTools(serverName, options);
    const registered = [];

    for (const tool of adaptedTools) {
      try {
        this.toolRegistry.register(tool);
        registered.push(tool);

        this.ledger.record({
          type: 'mcp_tool_registered',
          toolName: tool.name,
          mcpSource: tool._mcpSource,
          category: tool.category,
          timestamp: new Date().toISOString(),
        });
      } catch (error) {
        // Tool might already be registered
        this.ledger.record({
          type: 'mcp_tool_registration_failed',
          toolName: tool.name,
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }
    }

    return registered;
  }

  /**
   * Get adapted tool info
   * @param {string} adaptedName - Adapted tool name
   * @returns {Object|null} Tool info or null
   */
  getAdaptedToolInfo(adaptedName) {
    return this._adaptedTools.get(adaptedName) || null;
  }

  /**
   * List all adapted tools
   * @returns {Object[]} Adapted tool list
   */
  listAdaptedTools() {
    return Array.from(this._adaptedTools.values()).map(({ native, mcp }) => ({
      name: native.name,
      category: native.category,
      mcpServer: mcp.serverName,
      mcpTool: mcp.name,
    }));
  }

  // ─────────────────────────────────────────────────────────────────
  // Private Methods
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a handler function for the adapted tool
   * @private
   */
  _createHandler(mcpTool, { category, sideEffects }) {
    const adapter = this;

    return async function mcpToolHandler(params) {
      const mode = sideEffects ? MCP_CALL_MODE.EXECUTE : MCP_CALL_MODE.READ_ONLY;

      // Log the call
      adapter.ledger.record({
        type: 'mcp_tool_call_start',
        mcpToolId: mcpTool.mcpToolId,
        params,
        mode,
        timestamp: new Date().toISOString(),
      });

      try {
        const result = await adapter.mcpClient.callTool({
          mcpToolId: mcpTool.mcpToolId,
          params,
          mode,
          context: {},
        });

        // Log success
        adapter.ledger.record({
          type: 'mcp_tool_call_complete',
          mcpToolId: mcpTool.mcpToolId,
          success: result.success,
          citation: result.citation,
          timestamp: new Date().toISOString(),
        });

        if (!result.success) {
          throw new Error(result.error || 'MCP tool call failed');
        }

        // Return result with citation
        return {
          data: result.result,
          citation: result.citation,
        };
      } catch (error) {
        // Log failure
        adapter.ledger.record({
          type: 'mcp_tool_call_error',
          mcpToolId: mcpTool.mcpToolId,
          error: error.message,
          timestamp: new Date().toISOString(),
        });

        throw error;
      }
    };
  }

  /**
   * Normalize MCP input schema to native format
   * @private
   */
  _normalizeInputSchema(mcpSchema) {
    if (!mcpSchema) {
      return {
        type: 'object',
        properties: {},
        additionalProperties: true,
      };
    }

    // MCP schemas are JSON Schema compatible
    return {
      type: mcpSchema.type || 'object',
      properties: mcpSchema.properties || {},
      required: mcpSchema.required || [],
      additionalProperties: mcpSchema.additionalProperties !== false,
    };
  }

  /**
   * Build output schema for adapted tool
   * @private
   */
  _buildOutputSchema(mcpTool) {
    return {
      type: 'object',
      properties: {
        data: {
          description: 'Result data from MCP tool',
        },
        citation: {
          type: 'object',
          properties: {
            source: { type: 'string', description: 'MCP source identifier' },
            tool: { type: 'string', description: 'MCP tool name' },
            timestamp: { type: 'string', format: 'date-time' },
            callDuration: { type: 'number', description: 'Call duration in ms' },
          },
          required: ['source', 'tool', 'timestamp'],
        },
      },
      required: ['data', 'citation'],
    };
  }
}

module.exports = {
  MCPToolAdapter,
};
