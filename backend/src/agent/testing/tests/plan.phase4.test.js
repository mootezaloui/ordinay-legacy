"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase4: PLAN tool call creates pending action and emits plan_artifact", async () => {
  const runtime = createLiveRuntime();
  const restoreUx = patchMethod(runtime?.ux, "evaluatePreLoop", () => ({ handled: false }));
  const restoreLlm = mockSingleToolCall(runtime, {
    id: "tc_plan_create_1",
    name: "proposeCreate",
    arguments: {
      entityType: "client",
      payload: { name: "Acme Corp", status: "active" },
      reason: "User asked to create a new client profile.",
    },
  });

  try {
    const result = await runScenario(
      {
        id: "phase4_plan_create_artifact",
        target: "sse_handler",
        input: {
          sessionId: "phase4_plan_create_session",
          turnId: "phase4_plan_create_turn",
          message: "create a new client Acme Corp",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase4_user_execute", scope: "execute" },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.capturedLoopOutput;
    assert.ok(output, "Expected loop output to be captured.");
    assert.equal(output.turnType, "NEW");
    assert.ok(output.pendingAction, "Expected pendingAction to be set.");
    assert.ok(output.pendingAction.plan, "Expected pendingAction.plan to be set.");
    assert.equal(output.pendingAction.plan.operation.operation, "create");
    assert.equal(output.pendingAction.plan.operation.entityType, "client");
    assert.equal(output.metadata?.confirmedExecutionResult, undefined);

    const planEvent = result.events.find((event) => event.event === "plan_artifact");
    assert.ok(planEvent, "Expected plan_artifact SSE event.");
    const planArtifact = toRecord(planEvent.data)?.artifact;
    assert.ok(planArtifact, "Expected plan_artifact payload.");
    assert.equal(planArtifact.operation.operation, "create");
    assert.equal(planArtifact.operation.entityType, "client");
    assert.equal(planArtifact.pendingActionId, output.pendingAction.id);

    const confirmedEvent = result.events.find((event) => event.event === "confirmed");
    assert.equal(Boolean(confirmedEvent), false, "PLAN proposal should not execute immediately.");
  } finally {
    restoreUx?.();
    restoreLlm();
  }
});

test("phase4: AMENDMENT replaces pending action deterministically for PLAN proposals", async () => {
  const runtime = createLiveRuntime();
  const previousPendingId = "pending_phase4_old_1";
  const restoreUx = patchMethod(runtime?.ux, "evaluatePreLoop", () => ({ handled: false }));
  const restoreLlm = mockSingleToolCall(runtime, {
    id: "tc_plan_update_1",
    name: "proposeUpdate",
    arguments: {
      entityType: "client",
      entityId: 77,
      changes: { status: { from: "active", to: "inactive" } },
      reason: "User asked to change status.",
    },
  });

  try {
    const result = await runScenario(
      {
        id: "phase4_plan_amendment_replace",
        target: "sse_handler",
        input: {
          sessionId: "phase4_plan_amendment_session",
          turnId: "phase4_plan_amendment_turn",
          message: "change it: set client status to inactive",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase4_user_execute", scope: "execute" },
        preSession(session) {
          session.state.pendingAction = {
            id: previousPendingId,
            toolName: "proposeCreate",
            summary: "Create client: Legacy Pending",
            args: { entityType: "client", payload: { name: "Legacy Pending" } },
            plan: {
              operation: {
                operation: "create",
                entityType: "client",
                payload: { name: "Legacy Pending" },
              },
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "prev_turn",
            risk: "medium",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.capturedLoopOutput;
    assert.ok(output, "Expected loop output to be captured.");
    assert.equal(output.turnType, "AMENDMENT");
    assert.ok(output.pendingAction, "Expected a replacement pendingAction.");
    assert.notEqual(output.pendingAction.id, previousPendingId);
    assert.equal(output.pendingAction.plan?.operation.operation, "update");
    assert.equal(output.metadata?.replacedPendingActionId, previousPendingId);

    const planEvent = result.events.find((event) => event.event === "plan_artifact");
    assert.ok(planEvent, "Expected plan_artifact SSE event.");
    const planArtifact = toRecord(planEvent.data)?.artifact;
    assert.ok(planArtifact, "Expected plan_artifact payload.");
    assert.equal(planArtifact.pendingActionId, output.pendingAction.id);
    assert.equal(planArtifact.operation.operation, "update");
    assert.equal(planArtifact.operation.entityType, "client");
  } finally {
    restoreUx?.();
    restoreLlm();
  }
});

test("phase4: confirmation preflight blocks stale parent links with actionable error details", async () => {
  const runtime = createLiveRuntime();

  const result = await runScenario(
    {
      id: "phase4_preflight_parent_not_found",
      target: "loop_core",
      input: {
        sessionId: "phase4_preflight_parent_not_found_session",
        turnId: "phase4_preflight_parent_not_found_turn",
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      preSession(session) {
        session.state.pendingAction = {
          id: "pending_phase4_preflight_parent_not_found",
          toolName: "proposeCreate",
          summary: "Create task with stale dossier link",
          args: {
            entityType: "task",
            payload: { title: "Prepare evidence index", dossier_id: 999999999 },
          },
          plan: {
            operation: {
              operation: "create",
              entityType: "task",
              payload: { title: "Prepare evidence index", dossier_id: 999999999 },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase4_prev_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.output;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "CONFIRMATION");
  assert.equal(output.pendingAction, null);

  assert.equal(output.metadata?.confirmedExecutionResult?.ok, false);
  assert.equal(
    output.metadata?.confirmedExecutionResult?.errorCode,
    "EXEC_PRECONDITION_LINK_NOT_FOUND",
  );
  assert.equal(output.metadata?.planExecutedArtifact?.ok, false);
  assert.equal(
    output.metadata?.planExecutedArtifact?.errorCode,
    "EXEC_PRECONDITION_LINK_NOT_FOUND",
  );
  assert.equal(
    output.metadata?.planExecutedArtifact?.errorDetails?.category,
    "link",
  );
  assert.match(
    String(output.metadata?.planExecutedArtifact?.errorDetails?.hint || ""),
    /choose an existing dossier/i,
  );
});

test("phase4: confirmation preflight blocks document create without storage source", async () => {
  const runtime = createLiveRuntime();
  const clientsService = require("../../../services/clients.service");
  const client = clientsService.create({
    name: `Phase4 Storage Source Client ${Date.now()}`,
  });
  const clientId = Number(client?.id);
  assert.ok(Number.isInteger(clientId) && clientId > 0);

  const result = await runScenario(
    {
      id: "phase4_preflight_document_storage_missing",
      target: "loop_core",
      input: {
        sessionId: "phase4_preflight_document_storage_missing_session",
        turnId: "phase4_preflight_document_storage_missing_turn",
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      preSession(session) {
        session.state.pendingAction = {
          id: "pending_phase4_preflight_document_storage_missing",
          toolName: "proposeCreate",
          summary: "Create document without storage source",
          args: {
            entityType: "document",
            payload: {
              title: "Phase4 Missing Storage Source",
              client_id: clientId,
            },
          },
          plan: {
            operation: {
              operation: "create",
              entityType: "document",
              payload: {
                title: "Phase4 Missing Storage Source",
                client_id: clientId,
              },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase4_prev_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  const output = result.output;
  assert.ok(output, "Expected loop output to be captured.");
  assert.equal(output.turnType, "CONFIRMATION");
  assert.equal(output.pendingAction, null);
  assert.equal(output.metadata?.confirmedExecutionResult?.ok, false);
  assert.equal(
    output.metadata?.confirmedExecutionResult?.errorCode,
    "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
  );
  assert.equal(output.metadata?.planExecutedArtifact?.ok, false);
  assert.equal(
    output.metadata?.planExecutedArtifact?.errorCode,
    "EXEC_PRECONDITION_STORAGE_SOURCE_MISSING",
  );
  assert.equal(
    output.metadata?.planExecutedArtifact?.errorDetails?.category,
    "storage",
  );
  assert.match(
    String(output.metadata?.planExecutedArtifact?.errorDetails?.hint || ""),
    /regenerate the draft|attach a file/i,
  );
});

function mockSingleToolCall(runtime, toolCall) {
  const llm = runtime?.loop?.llm;
  if (!llm) {
    throw new Error("Expected runtime.loop.llm to be available.");
  }

  const restoreStream = patchMethod(llm, "stream", async function* () {
    yield { toolCall };
    yield { finishReason: "tool_calls", done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => ({
    text: "",
    toolCalls: [toolCall],
    finishReason: "tool_calls",
    raw: { mocked: true },
  }));

  return () => {
    restoreStream?.();
    restoreGenerate?.();
  };
}

function patchMethod(target, methodName, replacement) {
  if (!target || typeof target[methodName] !== "function") {
    return null;
  }
  const original = target[methodName];
  target[methodName] = replacement;
  return () => {
    target[methodName] = original;
  };
}

function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
