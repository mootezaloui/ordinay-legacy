"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createOperationsRuntime } = require("../../operations");
const { createAuditExplorer } = require("../../operations/audit.explorer");
const { runScenario } = require("../scenario.runner");

test("operations: safe mode force-read-only clamps stream mode before loop", async () => {
  const fixture = {
    id: "ops_force_read_only",
    target: "sse_handler",
    input: {
      sessionId: "ops_force_read_only_session",
      turnId: "ops_force_read_only_turn",
      message: "Please execute this action.",
      mode: "EXECUTE",
      metadata: {},
    },
    requestUser: { id: "admin_1", scope: "execute" },
    setup(runtime) {
      runtime.operations.safeMode.setSafeModeState({ forceReadOnly: true });
      const restoreUxPreflight =
        runtime.ux && typeof runtime.ux.evaluatePreLoop === "function"
          ? patchMethod(runtime.ux, "evaluatePreLoop", () => ({ handled: false }))
          : null;
      const originalRun = runtime.loop.run.bind(runtime.loop);
      runtime.loop.run = async (input, session) => ({
        sessionId: session.id,
        turnId: input.turnId,
        turnType: "NEW",
        responseText: "Safe mode read-only clamp applied.",
        pendingAction: session.state.pendingAction,
        toolCalls: [],
        audit: [],
        metadata: {},
      });
      return () => {
        runtime.loop.run = originalRun;
        restoreUxPreflight?.();
        runtime.operations.safeMode.setSafeModeState({ forceReadOnly: false });
      };
    },
  };

  const result = await runScenario(fixture, { skipAssertions: true });
  assert.equal(result.capturedLoopInput.mode, "READ_ONLY");
  assert.equal(result.capturedLoopInput.metadata.safeMode.modeClampedToReadOnly, true);
});

test("operations: v2 disable blocks stream and keeps loop untouched", async () => {
  let loopCalled = false;
  const fixture = {
    id: "ops_v2_disabled",
    target: "sse_handler",
    input: {
      sessionId: "ops_v2_disabled_session",
      turnId: "ops_v2_disabled_turn",
      message: "Status?",
      mode: "READ_ONLY",
      metadata: {},
    },
    setup(runtime) {
      runtime.operations.safeMode.setSafeModeState({ v2Disabled: true });
      const originalRun = runtime.loop.run.bind(runtime.loop);
      runtime.loop.run = async (...args) => {
        loopCalled = true;
        return originalRun(...args);
      };
      return () => {
        runtime.loop.run = originalRun;
        runtime.operations.safeMode.setSafeModeState({ v2Disabled: false });
      };
    },
  };

  const result = await runScenario(fixture, { skipAssertions: true });
  const errorEvent = result.events.find((event) => event.event === "error");
  assert.ok(errorEvent, "Expected error event when v2 safe-mode kill switch is enabled.");
  assert.match(String(errorEvent.data?.message || ""), /disabled by operator safe mode/i);
  assert.equal(loopCalled, false);
});

test("operations: writes-disabled blocks confirmed execution (fail-closed)", async () => {
  const fixture = {
    id: "ops_writes_disabled_confirm",
    target: "loop_core",
    input: {
      sessionId: "ops_writes_disabled_confirm_session",
      turnId: "ops_writes_disabled_confirm_turn",
      message: "yes confirm",
      mode: "EXECUTE",
      metadata: { security: { authScope: "execute" } },
    },
    preSession(session) {
      session.state.pendingAction = {
        id: "pending_ops_1",
        toolName: "__ops_confirm_tool",
        summary: "__ops_confirm_tool({\"x\":1})",
        args: { x: 1 },
        createdAt: new Date().toISOString(),
        requestedByTurnId: "turn_prev",
        risk: "high",
      };
    },
    setup(runtime) {
      runtime.operations.safeMode.setSafeModeState({ writesDisabled: true });
      const registry = runtime.loop.registry;
      const originalTool = registry.tools.get("__ops_confirm_tool");
      registry.tools.set("__ops_confirm_tool", {
        name: "__ops_confirm_tool",
        category: "EXECUTE",
        description: "ops confirm test tool",
        sideEffects: true,
        handler: async () => ({ ok: true, data: { executed: true } }),
      });
      return () => {
        if (originalTool) {
          registry.tools.set("__ops_confirm_tool", originalTool);
        } else {
          registry.tools.delete("__ops_confirm_tool");
        }
        runtime.operations.safeMode.setSafeModeState({ writesDisabled: false });
      };
    },
  };

  const result = await runScenario(fixture, { skipAssertions: true });
  assert.equal(result.output.turnType, "CONFIRMATION");
  assert.equal(result.output.pendingAction, null);
  assert.equal(
    result.output.metadata?.confirmedExecutionResult?.errorCode,
    "SAFE_MODE_WRITES_DISABLED",
  );
});

test("operations: legacy mode field is accepted but authScope controls permissions", async () => {
  const fixture = {
    id: "ops_legacy_mode_accepted",
    target: "sse_handler",
    input: {
      sessionId: "ops_legacy_mode_accepted_session",
      turnId: "ops_legacy_mode_accepted_turn",
      message: "Create a new client named Legacy Payload Corp",
      mode: "READ_ONLY",
      metadata: { security: { authScope: "execute" } },
    },
    requestUser: { id: "operator_legacy", scope: "execute" },
    setup(runtime) {
      const restoreUxPreflight =
        runtime.ux && typeof runtime.ux.evaluatePreLoop === "function"
          ? patchMethod(runtime.ux, "evaluatePreLoop", () => ({ handled: false }))
          : null;
      const llm = runtime?.loop?.llm;
      const restoreGenerate =
        llm && typeof llm.generate === "function"
          ? patchMethod(llm, "generate", async () => ({
              text: "",
              toolCalls: [
                {
                  id: "tc_ops_legacy_mode_1",
                  name: "proposeCreate",
                  arguments: {
                    entityType: "client",
                    payload: { name: "Legacy Payload Corp" },
                    reason: "Compatibility regression test.",
                  },
                },
              ],
              finishReason: "tool_calls",
              raw: { mocked: true },
            }))
          : null;
      const restoreStream =
        llm && typeof llm.stream === "function"
          ? patchMethod(llm, "stream", async function* () {
              yield {
                toolCall: {
                  id: "tc_ops_legacy_mode_1",
                  name: "proposeCreate",
                  arguments: {
                    entityType: "client",
                    payload: { name: "Legacy Payload Corp" },
                    reason: "Compatibility regression test.",
                  },
                },
              };
              yield { finishReason: "tool_calls", done: true };
            })
          : null;
      return () => {
        restoreUxPreflight?.();
        restoreGenerate?.();
        restoreStream?.();
      };
    },
  };

  const result = await runScenario(fixture, { skipAssertions: true });
  const hasError = result.events.some((event) => event.event === "error");
  const hasPlanArtifact = result.events.some((event) => event.event === "plan_artifact");
  assert.equal(hasError, false, "Did not expect SSE error for legacy mode payload.");
  assert.equal(hasPlanArtifact, true, "Expected PLAN artifact even when legacy mode is provided.");
  assert.equal(result.capturedLoopInput?.metadata?.security?.authScope, "execute");
});

test("operations: admin guard defaults to deny and allows trusted admin scope", () => {
  const operations = createOperationsRuntime({
    config: { policy: { operations: {} } },
    flags: { values: {} },
    repository: null,
  });

  const denied = operations.authorizeAdminRequest({});
  assert.equal(denied.allowed, false);
  assert.equal(denied.scope, "unknown");

  const allowed = operations.authorizeAdminRequest({
    user: { scope: "admin", id: "operator_1" },
  });
  assert.equal(allowed.allowed, true);
  assert.equal(allowed.scope, "admin");
});

test("operations: audit explorer enforces bounded query limits", async () => {
  const calls = [];
  const repository = {
    async getRecentAuditEvents(params) {
      calls.push(params);
      return [];
    },
  };
  const explorer = createAuditExplorer(repository, { maxLimit: 10 });
  await explorer.getRecentAuditEvents({
    limit: 500,
    eventTypes: ["turn_trace", "health_snapshot", "turn_trace"],
    sessionId: "session_1",
  });

  assert.equal(calls.length, 1);
  assert.equal(calls[0].limit, 10);
  assert.deepEqual(calls[0].eventTypes, ["turn_trace", "health_snapshot"]);
  assert.equal(calls[0].sessionId, "session_1");
});

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
