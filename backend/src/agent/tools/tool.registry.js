'use strict';

/**
 * Tool Registry
 *
 * Central registry for all agent tools.
 * Enforces type safety, categorization, and execution control.
 *
 * CRITICAL RULES:
 * - Tools are owned by the Agent Engine, NOT the LLM
 * - LLMs never execute tools directly
 * - LLMs never select tools directly
 * - All tools must be declared here
 * - Undeclared tools are BLOCKED
 */

const TOOL_CATEGORIES = Object.freeze({
  READ: 'read',
  ANALYSIS: 'analysis',
  DRAFT: 'draft',
  EXECUTE: 'execute',
});

class ToolRegistry {
  constructor() {
    this._tools = new Map();
    this._initialized = false;
  }

  /**
   * Register a tool with the registry
   * @param {Object} toolDefinition - Tool definition
   * @param {string} toolDefinition.name - Unique tool name
   * @param {string} toolDefinition.category - Tool category (read/analysis/draft/execute)
   * @param {Object} toolDefinition.inputSchema - JSON Schema for input validation
   * @param {Object} toolDefinition.outputSchema - JSON Schema for output validation
   * @param {boolean} toolDefinition.reversibility - Whether operation can be reversed
   * @param {boolean} toolDefinition.sideEffects - Whether tool has side effects
   * @param {string[]} toolDefinition.allowedAgentVersions - Allowed agent versions (v1/v2/v3)
   * @param {Function} toolDefinition.handler - Tool implementation function
   */
  register(toolDefinition) {
    this._validateToolDefinition(toolDefinition);

    if (this._tools.has(toolDefinition.name)) {
      throw new Error(`Tool ${toolDefinition.name} is already registered`);
    }

    const tool = Object.freeze({
      ...toolDefinition,
      registeredAt: new Date().toISOString(),
    });

    this._tools.set(toolDefinition.name, tool);
    return tool;
  }

  /**
   * Get a tool by name
   * @param {string} name - Tool name
   * @returns {Object|null} Tool definition or null if not found
   */
  get(name) {
    return this._tools.get(name) || null;
  }

  /**
   * Check if a tool exists
   * @param {string} name - Tool name
   * @returns {boolean}
   */
  has(name) {
    return this._tools.has(name);
  }

  /**
   * List all tools
   * @param {Object} filters - Optional filters
   * @param {string} filters.category - Filter by category
   * @param {string} filters.agentVersion - Filter by allowed agent version
   * @returns {Object[]} Array of tool definitions
   */
  list(filters = {}) {
    let tools = Array.from(this._tools.values());

    if (filters.category) {
      tools = tools.filter(tool => tool.category === filters.category);
    }

    if (filters.agentVersion) {
      tools = tools.filter(tool =>
        tool.allowedAgentVersions.includes(filters.agentVersion)
      );
    }

    return tools;
  }

  /**
   * Validate tool definition structure
   * @private
   */
  _validateToolDefinition(def) {
    const required = [
      'name',
      'category',
      'inputSchema',
      'outputSchema',
      'reversibility',
      'sideEffects',
      'allowedAgentVersions',
      'handler',
    ];

    for (const field of required) {
      if (!(field in def)) {
        throw new Error(`Tool definition missing required field: ${field}`);
      }
    }

    if (typeof def.name !== 'string' || !def.name.trim()) {
      throw new Error('Tool name must be a non-empty string');
    }

    if (!Object.values(TOOL_CATEGORIES).includes(def.category)) {
      throw new Error(
        `Invalid tool category: ${def.category}. Must be one of: ${Object.values(TOOL_CATEGORIES).join(', ')}`
      );
    }

    if (typeof def.reversibility !== 'boolean') {
      throw new Error('Tool reversibility must be a boolean');
    }

    if (typeof def.sideEffects !== 'boolean') {
      throw new Error('Tool sideEffects must be a boolean');
    }

    if (!Array.isArray(def.allowedAgentVersions) || def.allowedAgentVersions.length === 0) {
      throw new Error('Tool allowedAgentVersions must be a non-empty array');
    }

    const validVersions = ['v1', 'v2', 'v3'];
    for (const version of def.allowedAgentVersions) {
      if (!validVersions.includes(version)) {
        throw new Error(`Invalid agent version: ${version}. Must be one of: ${validVersions.join(', ')}`);
      }
    }

    if (typeof def.handler !== 'function') {
      throw new Error('Tool handler must be a function');
    }

    // Category-specific validation
    if (def.category === TOOL_CATEGORIES.READ && def.sideEffects === true) {
      throw new Error('READ tools must not have side effects');
    }

    if (def.category === TOOL_CATEGORIES.ANALYSIS && def.sideEffects === true) {
      throw new Error('ANALYSIS tools must not have side effects');
    }

    if (def.category === TOOL_CATEGORIES.DRAFT && def.sideEffects === true) {
      throw new Error('DRAFT tools must not have side effects');
    }

    if (def.category === TOOL_CATEGORIES.EXECUTE && def.sideEffects === false) {
      throw new Error('EXECUTE tools must have side effects');
    }
  }

  /**
   * Clear all registered tools (for testing only)
   * @private
   */
  _clear() {
    this._tools.clear();
  }
}

module.exports = {
  ToolRegistry,
  TOOL_CATEGORIES,
};
