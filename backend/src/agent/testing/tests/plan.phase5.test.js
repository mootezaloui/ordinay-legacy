"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase5: confirmation executes pending PLAN action and emits plan_executed", async () => {
  const runtime = createLiveRuntime();
  const pendingActionId = "pending_phase5_confirm_1";
  const uniqueName = `Phase5 Confirm ${Date.now()}`;

  const result = await runScenario(
    {
      id: "phase5_plan_confirm_executes",
      target: "sse_handler",
      input: {
        sessionId: "phase5_plan_confirm_executes_session",
        turnId: "phase5_plan_confirm_executes_turn",
        message: "yes, confirm it",
        metadata: { security: { authScope: "execute" } },
      },
      requestUser: { id: "phase5_user_execute", scope: "execute" },
      preSession(session) {
        session.state.pendingAction = {
          id: pendingActionId,
          toolName: "proposeCreate",
          summary: `Create client: ${uniqueName}`,
          args: { entityType: "client", payload: { name: uniqueName } },
          plan: {
            operation: {
              operation: "create",
              entityType: "client",
              payload: { name: uniqueName },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase5_prev_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.capturedLoopOutput;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "CONFIRMATION");
  assert.equal(output.pendingAction, null);
  assert.equal(output.metadata?.confirmedExecutionResult?.ok, true);
  assert.equal(output.metadata?.planExecutedArtifact?.pendingActionId, pendingActionId);
  assert.equal(output.metadata?.planExecutedArtifact?.ok, true);

  const executedEvent = result.events.find((event) => event.event === "plan_executed");
  assert.ok(executedEvent, "Expected plan_executed SSE event.");
  const executedArtifact = toRecord(executedEvent.data)?.artifact;
  assert.ok(executedArtifact, "Expected plan_executed artifact payload.");
  assert.equal(executedArtifact.pendingActionId, pendingActionId);
  assert.equal(executedArtifact.ok, true);

  const rejectedEvent = result.events.find((event) => event.event === "plan_rejected");
  assert.equal(Boolean(rejectedEvent), false, "Did not expect plan_rejected on confirmation.");
});

test("phase5: rejection clears pending PLAN action and emits plan_rejected", async () => {
  const runtime = createLiveRuntime();
  const pendingActionId = "pending_phase5_reject_1";

  const result = await runScenario(
    {
      id: "phase5_plan_reject_emits_event",
      target: "sse_handler",
      input: {
        sessionId: "phase5_plan_reject_emits_event_session",
        turnId: "phase5_plan_reject_emits_event_turn",
        message: "no cancel it",
        metadata: { security: { authScope: "execute" } },
      },
      requestUser: { id: "phase5_user_execute", scope: "execute" },
      preSession(session) {
        session.state.pendingAction = {
          id: pendingActionId,
          toolName: "proposeUpdate",
          summary: "Update client 42 (status)",
          args: { entityType: "client", entityId: 42, changes: { status: "inactive" } },
          plan: {
            operation: {
              operation: "update",
              entityType: "client",
              entityId: 42,
              changes: { status: "inactive" },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase5_prev_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.capturedLoopOutput;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "REJECTION");
  assert.equal(output.pendingAction, null);
  assert.equal(output.metadata?.rejectedActionId, pendingActionId);
  assert.equal(output.metadata?.planRejectedArtifact?.pendingActionId, pendingActionId);

  const rejectedEvent = result.events.find((event) => event.event === "plan_rejected");
  assert.ok(rejectedEvent, "Expected plan_rejected SSE event.");
  const rejectedArtifact = toRecord(rejectedEvent.data)?.artifact;
  assert.ok(rejectedArtifact, "Expected plan_rejected artifact payload.");
  assert.equal(rejectedArtifact.pendingActionId, pendingActionId);

  const executedEvent = result.events.find((event) => event.event === "plan_executed");
  assert.equal(Boolean(executedEvent), false, "Did not expect plan_executed on rejection.");
});

test("phase5: pending action remains set while executor runs and clears after decision", async () => {
  const runtime = createLiveRuntime();
  const sessionId = "phase5_pending_clear_order_session";
  const pendingActionId = "pending_phase5_order_1";
  let pendingVisibleDuringExecution = false;

  const loop = runtime.loop;
  const entityExecutor = loop?.entityExecutor;
  if (!entityExecutor || typeof entityExecutor.execute !== "function") {
    throw new Error("Expected runtime.loop.entityExecutor.execute to be available.");
  }
  const originalExecute = entityExecutor.execute.bind(entityExecutor);
  entityExecutor.execute = async () => {
    const liveSession = await runtime.sessionStore.getOrLoadSession(sessionId);
    pendingVisibleDuringExecution = Boolean(liveSession?.state?.pendingAction);
    return {
      ok: true,
      result: {
        operation: "update",
        entityType: "client",
        entityId: 501,
        entity: { id: 501, name: "Phase5 Timing Client" },
      },
    };
  };

  try {
    const result = await runScenario(
      {
        id: "phase5_pending_clear_order",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase5_pending_clear_order_turn",
          message: "confirm",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.state.pendingAction = {
            id: pendingActionId,
            toolName: "proposeUpdate",
            summary: "Update client 501 (name)",
            args: { entityType: "client", entityId: 501, changes: { name: "Phase5 Timing Client" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 501,
                changes: { name: "Phase5 Timing Client" },
              },
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase5_prev_turn",
            risk: "medium",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(pendingVisibleDuringExecution, true);
    assert.equal(result.output.turnType, "CONFIRMATION");
    assert.equal(result.output.pendingAction, null);
    assert.equal(result.output.metadata?.planExecutedArtifact?.pendingActionId, pendingActionId);
    assert.equal(result.output.metadata?.planExecutedArtifact?.ok, true);
  } finally {
    entityExecutor.execute = originalExecute;
  }
});

test("phase5: decision-required plan stays pending and surfaces decision metadata", async () => {
  const runtime = createLiveRuntime();
  const pendingActionId = "pending_phase5_decision_required_1";

  const result = await runScenario(
    {
      id: "phase5_decision_required_keeps_pending",
      target: "sse_handler",
      input: {
        sessionId: "phase5_decision_required_session",
        turnId: "phase5_decision_required_turn",
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      requestUser: { id: "phase5_user_execute", scope: "execute" },
      preSession(session) {
        session.state.pendingAction = {
          id: pendingActionId,
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
            diagnostics: {
              requiresUserDecision: true,
              decisionPrompt: "Choose invoice settlement behavior.",
              blockerCounts: { unpaid_receivables: 2 },
              decisionOptions: [
                {
                  key: "settle_receivables",
                  title: "Settle receivables first",
                  description: "Mark unpaid receivables paid before inactivation.",
                },
              ],
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase5_prev_turn",
          risk: "high",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.capturedLoopOutput;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "CONFIRMATION");
  assert.ok(output.pendingAction, "Expected pending action to remain set.");
  assert.equal(output.pendingAction.id, pendingActionId);
  assert.equal(output.metadata?.confirmedExecutionResult?.ok, false);
  assert.equal(output.metadata?.confirmedExecutionResult?.errorCode, "DOMAIN_DECISION_REQUIRED");
  assert.equal(output.metadata?.planExecutedArtifact?.ok, false);
  assert.equal(output.metadata?.planExecutedArtifact?.errorCode, "DOMAIN_DECISION_REQUIRED");
  assert.deepEqual(
    output.metadata?.confirmedExecutionResult?.data?.decisionOptions,
    [
      {
        key: "settle_receivables",
        title: "Settle receivables first",
        description: "Mark unpaid receivables paid before inactivation.",
      },
    ],
  );
});

test("phase5: workflow failure reports failed step and stops execution", async () => {
  const runtime = createLiveRuntime();
  const pendingActionId = "pending_phase5_workflow_failure_1";

  const result = await runScenario(
    {
      id: "phase5_workflow_failure_reporting",
      target: "sse_handler",
      input: {
        sessionId: "phase5_workflow_failure_session",
        turnId: "phase5_workflow_failure_turn",
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      requestUser: { id: "phase5_user_execute", scope: "execute" },
      preSession(session) {
        session.state.pendingAction = {
          id: pendingActionId,
          toolName: "proposeUpdate",
          summary: "Run workflow with unsupported first step",
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
                id: "wf_invalid_step",
                actionType: "UPDATE_ENTITY",
                operation: "update",
                entityType: "unknown_entity_type",
                entityId: 123,
                changes: { status: "inactive" },
                reason: "Intentional test failure",
              },
              {
                id: "wf_root_step",
                actionType: "UPDATE_ENTITY",
                operation: "update",
                entityType: "client",
                entityId: 7,
                changes: { status: "inactive" },
                reason: "Should not run after failure",
                dependsOn: ["wf_invalid_step"],
              },
            ],
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase5_prev_turn",
          risk: "high",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.capturedLoopOutput;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "CONFIRMATION");
  assert.equal(output.pendingAction, null, "Pending action should clear on non-decision failure.");
  assert.equal(output.metadata?.confirmedExecutionResult?.ok, false);
  assert.equal(
    output.metadata?.confirmedExecutionResult?.data?.failedStepId,
    "wf_invalid_step",
  );
  const stepResults = output.metadata?.planExecutedArtifact?.stepResults || [];
  assert.equal(stepResults.length, 1, "Execution should stop at first failed step.");
  assert.equal(stepResults[0]?.stepId, "wf_invalid_step");
  assert.equal(stepResults[0]?.ok, false);
  assert.equal(output.metadata?.planExecutedArtifact?.failedStepId, "wf_invalid_step");
});

test("phase5: repeated confirmation does not re-execute cleared pending action", async () => {
  const runtime = createLiveRuntime();
  const sessionId = "phase5_double_confirm_session";
  const pendingActionId = "pending_phase5_double_confirm_1";

  const loop = runtime.loop;
  const entityExecutor = loop?.entityExecutor;
  if (!entityExecutor || typeof entityExecutor.execute !== "function") {
    throw new Error("Expected runtime.loop.entityExecutor.execute to be available.");
  }
  const originalExecute = entityExecutor.execute.bind(entityExecutor);
  let executeCallCount = 0;
  entityExecutor.execute = async () => {
    executeCallCount += 1;
    return {
      ok: true,
      result: {
        operation: "update",
        entityType: "client",
        entityId: 501,
        entity: { id: 501, name: "Phase5 Once" },
      },
    };
  };

  try {
    const first = await runScenario(
      {
        id: "phase5_double_confirm_first",
        target: "sse_handler",
        input: {
          sessionId,
          turnId: "phase5_double_confirm_first_turn",
          message: "yes, confirm it",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase5_user_execute", scope: "execute" },
        preSession(session) {
          session.state.pendingAction = {
            id: pendingActionId,
            toolName: "proposeUpdate",
            summary: "Update client 501 name",
            args: { entityType: "client", entityId: 501, changes: { name: "Phase5 Once" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 501,
                changes: { name: "Phase5 Once" },
              },
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase5_prev_turn",
            risk: "medium",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(first.capturedLoopOutput?.metadata?.planExecutedArtifact?.ok, true);
    assert.equal(executeCallCount, 1, "Expected first confirmation to execute once.");

    const second = await runScenario(
      {
        id: "phase5_double_confirm_second",
        target: "sse_handler",
        input: {
          sessionId,
          turnId: "phase5_double_confirm_second_turn",
          message: "yes, confirm it",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase5_user_execute", scope: "execute" },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(
      executeCallCount,
      1,
      "Expected second confirmation to avoid re-executing cleared pending action.",
    );
    const secondExecuted = second.events.find((event) => event.event === "plan_executed");
    assert.equal(Boolean(secondExecuted), false);
  } finally {
    entityExecutor.execute = originalExecute;
  }
});

function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
