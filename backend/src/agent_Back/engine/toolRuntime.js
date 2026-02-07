"use strict";

const {
  createExecutionTrace,
  generateTraceId,
} = require("../contracts/toolInterface.contract");

/**
 * Execute a registry tool with full V2 validation and tracing.
 *
 * Sequence: validateInput -> permissions -> execute -> validateOutput -> trace -> log
 *
 * @param {string} toolName - Name of tool to execute
 * @param {Object} params - Tool parameters
 * @param {Object} policy - Agent policy
 * @param {Object} context - Execution context { confirmed, planId, stepIndex }
 * @returns {Promise<Object>} { result, trace }
 */
async function executeToolV2(toolName, params, policy, context = {}) {
  const startedAt = new Date().toISOString();

  const tool = this.toolRegistry.get(toolName);
  if (!tool) {
    const error = new Error(`Tool ${toolName} not found in registry`);
    error.status = 404;
    throw error;
  }

  // 1. Validate input against tool.inputSchema (soft — logged, not thrown)
  const inputValidation = this.toolRegistry.validateInput(toolName, params, this.ajv);

  if (!inputValidation.valid) {
    this.ledger.record({
      type: "tool_input_validation_failed",
      toolName,
      errors: inputValidation.errors,
      params,
      policyVersion: policy.version,
      timestamp: new Date().toISOString(),
    });
  }

  // 2. Check permissions via firewall
  const permission = this.toolFirewall.checkPermission({
    toolName,
    policy,
    context,
  });

  if (!permission.permitted) {
    const completedAt = new Date().toISOString();
    const durationMs = new Date(completedAt) - new Date(startedAt);

    const trace = createExecutionTrace({
      traceId: generateTraceId(toolName, context.planId),
      planId: context.planId || null,
      stepIndex: context.stepIndex ?? null,
      toolName,
      toolCategory: tool.category,
      input: params,
      output: null,
      permitted: false,
      validationResult: {
        inputValid: inputValidation.valid,
        outputValid: false,
        inputErrors: inputValidation.errors,
        outputErrors: null,
      },
      timing: { startedAt, completedAt, durationMs },
      error: { message: permission.message, code: permission.reason },
    });

    this.ledger.record({
      type: "tool_execution_v2",
      traceId: trace.traceId,
      toolName,
      planId: trace.planId,
      stepIndex: trace.stepIndex,
      success: false,
      permitted: false,
      reason: permission.reason,
      policyVersion: policy.version,
      timestamp: completedAt,
    });

    const err = new Error(permission.message);
    err.status = 403;
    err.reason = permission.reason;
    err.toolName = toolName;
    err.trace = trace;
    throw err;
  }

  // 3. Execute handler
  let result;
  let executionError = null;
  try {
    result = await tool.handler(params);
  } catch (err) {
    executionError = err;
  }

  const completedAt = new Date().toISOString();
  const durationMs = new Date(completedAt) - new Date(startedAt);

  if (executionError) {
    const trace = createExecutionTrace({
      traceId: generateTraceId(toolName, context.planId),
      planId: context.planId || null,
      stepIndex: context.stepIndex ?? null,
      toolName,
      toolCategory: tool.category,
      input: params,
      output: null,
      permitted: true,
      validationResult: {
        inputValid: inputValidation.valid,
        outputValid: false,
        inputErrors: inputValidation.errors,
        outputErrors: null,
      },
      timing: { startedAt, completedAt, durationMs },
      error: { message: executionError.message, code: executionError.status || 500 },
    });

    this.ledger.record({
      type: "tool_execution_v2",
      traceId: trace.traceId,
      toolName,
      planId: trace.planId,
      stepIndex: trace.stepIndex,
      success: false,
      permitted: true,
      error: executionError.message,
      policyVersion: policy.version,
      durationMs,
      timestamp: completedAt,
    });

    executionError.trace = trace;
    throw executionError;
  }

  // 4. Validate output against tool.outputSchema (soft — logged, not thrown)
  const outputValidation = this.toolRegistry.validateOutput(toolName, result, this.ajv);

  if (!outputValidation.valid) {
    this.ledger.record({
      type: "tool_output_validation_failed",
      toolName,
      errors: outputValidation.errors,
      policyVersion: policy.version,
      timestamp: new Date().toISOString(),
    });
  }

  // 5. Build execution trace
  const trace = createExecutionTrace({
    traceId: generateTraceId(toolName, context.planId),
    planId: context.planId || null,
    stepIndex: context.stepIndex ?? null,
    toolName,
    toolCategory: tool.category,
    input: params,
    output: result,
    permitted: true,
    validationResult: {
      inputValid: inputValidation.valid,
      outputValid: outputValidation.valid,
      inputErrors: inputValidation.errors,
      outputErrors: outputValidation.errors,
    },
    timing: { startedAt, completedAt, durationMs },
    error: null,
  });

  // 6. Log to ledger
  this.ledger.record({
    type: "tool_execution_v2",
    traceId: trace.traceId,
    toolName,
    planId: trace.planId,
    stepIndex: trace.stepIndex,
    success: true,
    permitted: true,
    inputValid: inputValidation.valid,
    outputValid: outputValidation.valid,
    durationMs,
    policyVersion: policy.version,
    timestamp: completedAt,
  });

  if (
    this.contextStore &&
    typeof this.contextStore.markWorkSnapshotsStaleByDossierId === "function" &&
    (tool.sideEffects === true || String(tool.category || "").toLowerCase() === "execute")
  ) {
    const mutationDossierId =
      params?.dossierId ??
      params?.scope?.dossierId ??
      (String(params?.entityType || "").toLowerCase() === "dossier"
        ? params?.entityId
        : null) ??
      null;
    this.contextStore.markWorkSnapshotsStaleByDossierId(
      mutationDossierId,
      `mutation:${toolName}`,
    );
    this.ledger.record({
      type: "work_snapshot_marked_stale",
      reason: `mutation:${toolName}`,
      dossierId: mutationDossierId ?? null,
      timestamp: completedAt,
    });
  }

  return { result, trace };
}

module.exports = {
  executeToolV2,
};
