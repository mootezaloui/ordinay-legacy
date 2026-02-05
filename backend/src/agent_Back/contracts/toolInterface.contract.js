'use strict';

/**
 * Tool Interface Contract (V2)
 *
 * Formal contract for V2 tool shape and execution traces.
 * All tools MUST conform to this interface.
 *
 * Extends existing TOOL_CATEGORIES with research and external.
 * Defines the execution trace shape for structured tool logging.
 */

const { TOOL_CATEGORIES } = require('../tools/tool.registry');

/**
 * V2 Tool Categories (extends TOOL_CATEGORIES)
 */
const TOOL_CATEGORIES_V2 = Object.freeze({
  ...TOOL_CATEGORIES,
  RESEARCH: 'research',
  EXTERNAL: 'external',
});

/**
 * Create a validated execution trace
 * @param {Object} trace - Trace data
 * @param {string} trace.traceId - Unique trace identifier
 * @param {string|null} trace.planId - Plan ID (null if outside plan)
 * @param {number|null} trace.stepIndex - Step index in plan
 * @param {string} trace.toolName - Tool name
 * @param {string} trace.toolCategory - Tool category
 * @param {Object} trace.input - Tool input params
 * @param {*} trace.output - Tool output (null on error)
 * @param {boolean} trace.permitted - Whether firewall permitted execution
 * @param {Object} trace.validationResult - { inputValid, outputValid, inputErrors, outputErrors }
 * @param {Object} trace.timing - { startedAt, completedAt, durationMs }
 * @param {Object|null} trace.error - { message, code } or null
 * @returns {Object} Frozen execution trace
 * @throws {Error} If validation fails
 */
function createExecutionTrace({
  traceId,
  planId,
  stepIndex,
  toolName,
  toolCategory,
  input,
  output,
  permitted,
  validationResult,
  timing,
  error,
}) {
  if (!traceId || typeof traceId !== 'string') {
    throw new Error('traceId is required and must be a string');
  }

  if (!toolName || typeof toolName !== 'string') {
    throw new Error('toolName is required and must be a string');
  }

  if (!toolCategory || typeof toolCategory !== 'string') {
    throw new Error('toolCategory is required and must be a string');
  }

  if (typeof permitted !== 'boolean') {
    throw new Error('permitted must be a boolean');
  }

  if (!validationResult || typeof validationResult !== 'object') {
    throw new Error('validationResult is required and must be an object');
  }

  if (!timing || typeof timing !== 'object') {
    throw new Error('timing is required and must be an object');
  }

  return Object.freeze({
    traceId,
    planId: planId || null,
    stepIndex: stepIndex ?? null,
    toolName,
    toolCategory,
    input: input || {},
    output: output ?? null,
    permitted,
    validationResult: Object.freeze({
      inputValid: Boolean(validationResult.inputValid),
      outputValid: Boolean(validationResult.outputValid),
      inputErrors: validationResult.inputErrors || null,
      outputErrors: validationResult.outputErrors || null,
    }),
    timing: Object.freeze({
      startedAt: timing.startedAt || null,
      completedAt: timing.completedAt || null,
      durationMs: timing.durationMs || 0,
    }),
    error: error ? Object.freeze({ message: error.message, code: error.code || null }) : null,
    createdAt: new Date().toISOString(),
  });
}

/**
 * Generate a unique trace ID
 * @param {string} toolName - Tool name
 * @param {string} planId - Plan ID
 * @returns {string} Unique trace ID
 */
function generateTraceId(toolName, planId) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `trace-${toolName}-${planId || 'no-plan'}-${timestamp}-${random}`;
}

/**
 * Validate that a tool definition conforms to the V2 interface.
 * Checks existing required fields plus optional plannerHint.
 * @param {Object} def - Tool definition
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateV2ToolShape(def) {
  const errors = [];
  const required = [
    'name', 'category', 'description', 'inputSchema',
    'outputSchema', 'reversibility', 'sideEffects',
    'allowedAgentVersions', 'handler',
  ];

  for (const field of required) {
    if (!(field in def)) {
      errors.push(`Missing required field: ${field}`);
    }
  }

  if (typeof def.name !== 'string' || !def.name.trim()) {
    errors.push('name must be a non-empty string');
  }

  if (typeof def.description !== 'string' || !def.description.trim()) {
    errors.push('description must be a non-empty string');
  }

  const validCategories = Object.values(TOOL_CATEGORIES_V2);
  if (!validCategories.includes(def.category)) {
    errors.push(`Invalid category: ${def.category}. Must be one of: ${validCategories.join(', ')}`);
  }

  if (typeof def.handler !== 'function') {
    errors.push('handler must be a function');
  }

  // Optional plannerHint validation
  if (def.plannerHint !== undefined && def.plannerHint !== null) {
    if (typeof def.plannerHint !== 'object') {
      errors.push('plannerHint must be an object if provided');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = {
  TOOL_CATEGORIES_V2,
  createExecutionTrace,
  generateTraceId,
  validateV2ToolShape,
};
