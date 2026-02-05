"use strict";

const { INTENTS } = require("../intents");
const {
  STEP_STATUS,
  PLAN_STATUS,
} = require("../contracts/agentPlan.contract");

/**
 * Execute a single plan step.
 * Internal tools (_chat, _executeIntent) call the reasoner.
 * Registry tools use this.callTool().
 *
 * @param {Object} step - Plan step
 * @param {Object} policy - Agent policy
 * @param {Object} engineContext - Engine context
 * @param {*} previousOutput - Output from previous step (if any)
 * @returns {Promise<*>} Step output
 * @private
 */
async function _executeStep(step, policy, engineContext, previousOutput) {
  const preferredReasoner = engineContext.request?.reasoner || policy.defaultReasoner;
  const reasoner = this._resolveReasoner(policy, preferredReasoner);

  if (step.toolName === "_chat") {
    return reasoner.chat({
      message: engineContext.request.message,
      context: engineContext._enrichedContext || {},
    });
  }

  if (step.toolName === "_executeIntent") {
    const intent = step.params.intent;
    return this._executeIntent(intent, reasoner, {
      message: engineContext.request.message,
      context: engineContext._enrichedContext || {},
    });
  }

  // Registry tool execution (V2 runtime with validation + tracing)
  const v2Result = await this.executeToolV2(step.toolName, step.params, policy, {
    confirmed: true,
    planId: engineContext._currentPlanId || null,
    stepIndex: step.stepIndex,
  });
  if (!engineContext._toolTraces) engineContext._toolTraces = [];
  engineContext._toolTraces.push(v2Result.trace);
  return v2Result.result;
}

/**
 * Execute a full plan sequentially.
 * Per step: checks permissions, calls tool/internal, logs to ledger, handles errors.
 *
 * @param {Object} plan - AgentPlan to execute
 * @param {Object} policy - Agent policy
 * @param {Object} engineContext - Engine context
 * @returns {Promise<Object>} { plan, stepResults, lastOutput, hasFailed }
 * @private
 */
async function _executePlan(plan, policy, engineContext) {
  plan.status = PLAN_STATUS.executing;
  plan.startedAt = new Date().toISOString();
  engineContext._currentPlanId = plan.planId;

  this.ledger.record({
    type: "plan_execution_started",
    planId: plan.planId,
    timestamp: plan.startedAt,
  });

  const stepResults = [];
  let lastOutput = null;
  let hasFailed = false;
  let completedCount = 0;
  let failedCount = 0;
  let skippedCount = 0;

  for (const step of plan.steps) {
    // Skip if a required dependency failed
    const depFailed = step.dependsOn.some((depIdx) => {
      const depStep = plan.steps[depIdx];
      return depStep && depStep.status === STEP_STATUS.failed;
    });

    if (depFailed) {
      step.status = STEP_STATUS.skipped;
      step.completedAt = new Date().toISOString();
      skippedCount++;
      stepResults.push({ stepIndex: step.stepIndex, status: STEP_STATUS.skipped });
      continue;
    }

    step.status = STEP_STATUS.in_progress;
    step.startedAt = new Date().toISOString();

    try {
      const output = await this._executeStep(step, policy, engineContext, lastOutput);
      step.status = STEP_STATUS.completed;
      step.result = output;
      step.completedAt = new Date().toISOString();
      lastOutput = output;
      completedCount++;

      this.ledger.record({
        type: "plan_step_completed",
        planId: plan.planId,
        stepIndex: step.stepIndex,
        toolName: step.toolName,
        status: STEP_STATUS.completed,
        timestamp: step.completedAt,
      });

      stepResults.push({ stepIndex: step.stepIndex, status: STEP_STATUS.completed });
    } catch (err) {
      step.status = step.optional ? STEP_STATUS.skipped : STEP_STATUS.failed;
      step.error = err.message;
      step.completedAt = new Date().toISOString();

      this.ledger.record({
        type: "plan_step_completed",
        planId: plan.planId,
        stepIndex: step.stepIndex,
        toolName: step.toolName,
        status: step.status,
        error: err.message,
        timestamp: step.completedAt,
      });

      if (step.optional) {
        skippedCount++;
        stepResults.push({ stepIndex: step.stepIndex, status: STEP_STATUS.skipped, error: err.message });
      } else {
        failedCount++;
        hasFailed = true;
        stepResults.push({ stepIndex: step.stepIndex, status: STEP_STATUS.failed, error: err.message });
        // Required step failed — skip remaining steps
        for (let i = step.stepIndex + 1; i < plan.steps.length; i++) {
          plan.steps[i].status = STEP_STATUS.skipped;
          plan.steps[i].completedAt = new Date().toISOString();
          skippedCount++;
          stepResults.push({ stepIndex: i, status: STEP_STATUS.skipped });
        }
        break;
      }
    }
  }

  // Determine final plan status
  if (failedCount > 0 && completedCount > 0) {
    plan.status = PLAN_STATUS.partial;
  } else if (failedCount > 0) {
    plan.status = PLAN_STATUS.failed;
  } else {
    plan.status = PLAN_STATUS.completed;
  }

  plan.completedAt = new Date().toISOString();
  plan.executionSummary = {
    totalSteps: plan.steps.length,
    completed: completedCount,
    failed: failedCount,
    skipped: skippedCount,
  };

  this.ledger.record({
    type: "plan_execution_completed",
    planId: plan.planId,
    status: plan.status,
    summary: plan.executionSummary,
    timestamp: plan.completedAt,
  });

  return { plan, stepResults, lastOutput, hasFailed };
}

/**
 * Build a human-readable execution explanation from a completed plan.
 *
 * @param {Object} plan - Completed AgentPlan
 * @returns {Object} Execution explanation
 * @private
 */
function _buildExecutionExplanation(plan) {
  const toolsUsed = plan.steps
    .filter((s) => s.status === STEP_STATUS.completed)
    .map((s) => s.toolName);

  const stepsDescription = plan.steps.map(
    (s) => `[${s.status}] ${s.description}`,
  );

  const failedSteps = plan.steps
    .filter((s) => s.status === STEP_STATUS.failed)
    .map((s) => ({ stepIndex: s.stepIndex, error: s.error }));

  const startTime = plan.startedAt ? new Date(plan.startedAt).getTime() : 0;
  const endTime = plan.completedAt ? new Date(plan.completedAt).getTime() : 0;
  const duration = startTime && endTime ? endTime - startTime : 0;

  return {
    planId: plan.planId,
    intent: plan.intent,
    executionMode: plan.executionMode,
    status: plan.status,
    toolsUsed,
    stepsDescription,
    failedSteps,
    duration,
  };
}

module.exports = {
  _executePlan,
  _executeStep,
  _buildExecutionExplanation,
};
