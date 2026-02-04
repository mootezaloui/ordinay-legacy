"use strict";

function proposeAction(toolName, params, policy, context = {}) {
  // Check permission through firewall
  const permission = this.toolFirewall.checkPermission({
    toolName,
    policy,
    context,
  });

  if (!permission.permitted) {
    return {
      proposed: true,
      permitted: false,
      toolName,
      params,
      reason: permission.reason,
      message: permission.message,
      suggestedAlternative: permission.suggestedAlternative,
    };
  }

  return {
    proposed: true,
    permitted: true,
    toolName,
    params,
    tool: permission.tool,
  };
}

/**
 * Execute a tool action (BLOCKED in v1/v2)
 * @param {string} toolName - Name of the tool to execute
 * @param {Object} params - Tool parameters
 * @param {Object} policy - Agent policy
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Execution result
 */

async function executeAction(toolName, params, policy, context = {}) {
  // CRITICAL: Check permission first
  const permission = this.toolFirewall.checkPermission({
    toolName,
    policy,
    context,
  });

  if (!permission.permitted) {
    const error = new Error(permission.message);
    error.status = 403;
    error.reason = permission.reason;
    error.toolName = toolName;
    error.suggestedAlternative = permission.suggestedAlternative;
    throw error;
  }

  // Get tool from registry
  const tool = this.toolRegistry.get(toolName);
  if (!tool) {
    const error = new Error(`Tool ${toolName} not found in registry`);
    error.status = 404;
    throw error;
  }

  // Execute tool handler
  try {
    const result = await tool.handler(params);

    // Log successful execution
    this.ledger.record({
      type: "tool_execution",
      toolName,
      params,
      result,
      success: true,
      policyVersion: policy.version,
      timestamp: new Date().toISOString(),
    });

    return {
      executed: true,
      toolName,
      result,
    };
  } catch (executionError) {
    // Log failed execution
    this.ledger.record({
      type: "tool_execution",
      toolName,
      params,
      error: executionError.message,
      success: false,
      policyVersion: policy.version,
      timestamp: new Date().toISOString(),
    });

    throw executionError;
  }
}

/**
 * Call a tool (checks permission, then executes if allowed)
 * @param {string} toolName - Name of the tool
 * @param {Object} params - Tool parameters
 * @param {Object} policy - Agent policy
 * @param {Object} context - Execution context
 * @returns {Promise<Object>} Tool result
 */

async function callTool(toolName, params, policy, context = {}) {
  const proposal = this.proposeAction(toolName, params, policy, context);

  if (!proposal.permitted) {
    const error = new Error(proposal.message);
    error.status = 403;
    error.reason = proposal.reason;
    error.toolName = toolName;
    error.suggestedAlternative = proposal.suggestedAlternative;
    throw error;
  }

  return this.executeAction(toolName, params, policy, context);
}

module.exports = {
  proposeAction,
  executeAction,
  callTool,
};
