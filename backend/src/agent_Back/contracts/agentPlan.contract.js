'use strict';

/**
 * Agent Plan Contract
 *
 * Defines the structure of execution plans built by the planning layer.
 * Plans are inspectable data — they describe WHAT will happen before execution.
 *
 * v1: All intents produce single-step plans (data already enriched upstream).
 * v2/v3: Multi-step plans with explicit tool chaining.
 */

/**
 * Execution Mode (ENUM)
 */
const EXECUTION_MODE = Object.freeze({
  /** read — data retrieval only */
  read: 'read',
  /** research — analysis/explanation using fetched data */
  research: 'research',
  /** execute — side-effect-producing actions */
  execute: 'execute',
});

/**
 * Step Status (ENUM)
 */
const STEP_STATUS = Object.freeze({
  pending: 'pending',
  in_progress: 'in_progress',
  completed: 'completed',
  failed: 'failed',
  skipped: 'skipped',
});

/**
 * Plan Status (ENUM)
 */
const PLAN_STATUS = Object.freeze({
  planned: 'planned',
  executing: 'executing',
  completed: 'completed',
  failed: 'failed',
  partial: 'partial',
});

/**
 * Create a validated plan step
 * @param {Object} step - Step data
 * @param {number} step.stepIndex - Step index in plan
 * @param {string} step.toolName - Tool or internal method name
 * @param {string} step.toolCategory - Tool category (read/analysis/draft/execute/internal)
 * @param {Object} step.params - Step parameters
 * @param {string} [step.expectedOutputType] - Expected output type
 * @param {string} step.description - Human-readable step description
 * @param {number[]} [step.dependsOn] - Indices of steps this depends on
 * @param {boolean} [step.optional] - Whether step failure is non-fatal
 * @returns {Object} Validated plan step
 * @throws {Error} If validation fails
 */
function createPlanStep({
  stepIndex,
  toolName,
  toolCategory,
  params,
  expectedOutputType = null,
  description,
  dependsOn = [],
  optional = false,
}) {
  if (typeof stepIndex !== 'number' || stepIndex < 0) {
    throw new Error('stepIndex is required and must be a non-negative number');
  }

  if (!toolName || typeof toolName !== 'string') {
    throw new Error('toolName is required and must be a string');
  }

  if (!toolCategory || typeof toolCategory !== 'string') {
    throw new Error('toolCategory is required and must be a string');
  }

  if (!description || typeof description !== 'string') {
    throw new Error('description is required and must be a string');
  }

  if (!Array.isArray(dependsOn)) {
    throw new Error('dependsOn must be an array');
  }

  return {
    stepIndex,
    toolName,
    toolCategory,
    params: params || {},
    expectedOutputType,
    description,
    dependsOn: [...dependsOn],
    optional,
    status: STEP_STATUS.pending,
    result: null,
    error: null,
    startedAt: null,
    completedAt: null,
  };
}

/**
 * Create a validated agent plan
 * @param {Object} plan - Plan data
 * @param {string} plan.intent - Classified intent
 * @param {string} plan.executionMode - Execution mode (read/research/execute)
 * @param {Object[]} plan.steps - Plan steps
 * @param {string[]} [plan.permissionsRequired] - Required permission categories
 * @param {string} plan.agentVersion - Agent version
 * @param {Object} [plan.context] - Planning context metadata
 * @returns {Object} Validated agent plan
 * @throws {Error} If validation fails
 */
function createAgentPlan({
  intent,
  executionMode,
  steps,
  permissionsRequired = [],
  agentVersion,
  context = {},
}) {
  if (!intent || typeof intent !== 'string') {
    throw new Error('intent is required and must be a string');
  }

  const validModes = Object.values(EXECUTION_MODE);
  if (!validModes.includes(executionMode)) {
    throw new Error(
      `executionMode must be one of: ${validModes.join(', ')}`
    );
  }

  if (!Array.isArray(steps) || steps.length === 0) {
    throw new Error('steps must be a non-empty array');
  }

  if (!agentVersion || typeof agentVersion !== 'string') {
    throw new Error('agentVersion is required and must be a string');
  }

  const requiredTools = [...new Set(steps.map((s) => s.toolName))];

  return {
    planId: generatePlanId(intent, agentVersion),
    intent,
    executionMode,
    steps,
    requiredTools,
    permissionsRequired: [...permissionsRequired],
    agentVersion,
    context,
    status: PLAN_STATUS.planned,
    createdAt: new Date().toISOString(),
    startedAt: null,
    completedAt: null,
    executionSummary: null,
  };
}

/**
 * Generate a unique plan ID
 * @param {string} intent - Intent name
 * @param {string} agentVersion - Agent version
 * @returns {string} Unique plan ID
 */
function generatePlanId(intent, agentVersion) {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `plan-${agentVersion}-${timestamp}-${random}`;
}

module.exports = {
  EXECUTION_MODE,
  STEP_STATUS,
  PLAN_STATUS,
  createPlanStep,
  createAgentPlan,
  generatePlanId,
};
