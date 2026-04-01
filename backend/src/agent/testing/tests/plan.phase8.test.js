"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase8: stale state between proposal and confirm fails safely with step-level diagnostics", async () => {
  const runtime = createLiveRuntime();
  const entityExecutor = runtime?.loop?.entityExecutor;
  if (!entityExecutor || !entityExecutor.rules || typeof entityExecutor.rules.validateOperation !== "function") {
    throw new Error("Expected runtime.loop.entityExecutor.rules.validateOperation to be available.");
  }

  const originalValidateOperation = entityExecutor.rules.validateOperation.bind(entityExecutor.rules);
  let validateCallCount = 0;
  entityExecutor.rules.validateOperation = async (operation) => {
    validateCallCount += 1;
    if (
      String(operation?.operation || "").toLowerCase() === "update" &&
      String(operation?.entityType || "").toLowerCase() === "client"
    ) {
      return {
        allowed: false,
        blockerCounts: { open_dossiers: 1 },
        notes: ["Client gained a new open dossier after proposal generation."],
      };
    }
    return originalValidateOperation(operation);
  };

  try {
    const result = await runScenario(
      {
        id: "phase8_stale_confirm_failure",
        target: "sse_handler",
        input: {
          sessionId: "phase8_stale_confirm_failure_session",
          turnId: "phase8_stale_confirm_failure_turn",
          message: "yes, confirm",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase8_user_execute", scope: "execute" },
        preSession(session) {
          session.state.pendingAction = {
            id: "pending_phase8_stale_1",
            toolName: "proposeUpdate",
            summary: "Set client inactive",
            args: { entityType: "client", entityId: 7, changes: { status: "inactive" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 7,
                changes: { status: "inactive" },
              },
              rootOperation: {
                operation: "update",
                entityType: "client",
                entityId: 7,
                changes: { status: "inactive" },
              },
              workflowSteps: [
                {
                  id: "step_root",
                  actionType: "UPDATE_ENTITY",
                  operation: "update",
                  entityType: "client",
                  entityId: 7,
                  changes: { status: "inactive" },
                  reason: "Original user request",
                },
              ],
              diagnostics: {
                plannerVersion: "domain_workflow_v1",
                analyzedAt: new Date().toISOString(),
                blockerCounts: {},
                notes: [],
                requiresUserDecision: false,
              },
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase8_prev_turn",
            risk: "high",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.capturedLoopOutput;
    assert.ok(output, "Expected loop output to be captured.");
    assert.equal(output.turnType, "CONFIRMATION");
    assert.equal(output.pendingAction, null);
    assert.ok(validateCallCount > 0, "Expected operation re-validation on confirmation.");

    assert.equal(output.metadata?.confirmedExecutionResult?.ok, false);
    assert.equal(output.metadata?.confirmedExecutionResult?.errorCode, "DOMAIN_RULE_BLOCKED");
    assert.equal(output.metadata?.confirmedExecutionResult?.data?.failedStepId, "step_root");

    const stepResults = output.metadata?.confirmedExecutionResult?.data?.stepResults || [];
    assert.equal(stepResults.length, 1);
    assert.equal(stepResults[0]?.stepId, "step_root");
    assert.equal(stepResults[0]?.ok, false);
    assert.equal(stepResults[0]?.errorCode, "DOMAIN_RULE_BLOCKED");

    assert.equal(output.metadata?.planExecutedArtifact?.ok, false);
    assert.equal(output.metadata?.planExecutedArtifact?.failedStepId, "step_root");
    assert.match(
      String(output.responseText || ""),
      /Plan execution failed/i,
    );
  } finally {
    entityExecutor.rules.validateOperation = originalValidateOperation;
  }
});
