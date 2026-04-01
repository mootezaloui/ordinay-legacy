"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase6 link traceability: pending action audit records explicit link source", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase6_trace_explicit_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: {
              title: "Phase6 explicit trace task",
              dossier_id: 333,
            },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase6_trace_explicit_source",
        target: "loop_core",
        input: {
          sessionId: "phase6_trace_explicit_source_session",
          turnId: "phase6_trace_explicit_source_turn",
          message: "Create a task in dossier 333",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const audits = Array.isArray(result.output?.audit) ? result.output.audit : [];
    const pendingAudit = audits.find((row) => row?.eventType === "pending_action_created");
    assert.ok(pendingAudit, "Expected pending_action_created audit.");
    assert.equal(pendingAudit?.data?.linkResolutionSourceTrace, "explicit");
    assert.equal(pendingAudit?.data?.linkResolutionStatus, "unchanged");
  } finally {
    restore();
  }
});

test("phase6 link traceability: pending action audit records fallback source for auto-resolved link", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase6_trace_fallback_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: {
              title: "Phase6 fallback trace task",
            },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase6_trace_fallback_source",
        target: "loop_core",
        input: {
          sessionId: "phase6_trace_fallback_source_session",
          turnId: "phase6_trace_fallback_source_turn",
          message: "Create a task for this case",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.activeEntities = [
            {
              type: "dossier",
              id: 444,
              label: "D-444",
              sourceTool: "getEntityGraph",
              lastMentionedAt: new Date().toISOString(),
            },
          ];
        },
      },
      { runtime, skipAssertions: true },
    );

    const pending = result.output?.pendingAction;
    assert.ok(pending, "Expected pending action to be created.");
    assert.equal(pending?.plan?.operation?.payload?.dossier_id, 444);

    const audits = Array.isArray(result.output?.audit) ? result.output.audit : [];
    const pendingAudit = audits.find((row) => row?.eventType === "pending_action_created");
    assert.ok(pendingAudit, "Expected pending_action_created audit.");
    assert.equal(pendingAudit?.data?.linkResolutionSourceTrace, "fallback");
    assert.equal(pendingAudit?.data?.linkResolutionStatus, "resolved");
  } finally {
    restore();
  }
});

test("phase6 link traceability: confirmation audit includes link source trace", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime?.loop;
  const entityExecutor = loop?.entityExecutor;
  const restoreExecute = patchMethod(entityExecutor, "execute", async () => ({
    ok: true,
    result: {
      operation: "update",
      entityType: "client",
      entityId: 9201,
      after: { id: 9201, status: "inactive" },
    },
    stepResults: [],
  }));

  try {
    const result = await runScenario(
      {
        id: "phase6_trace_confirmation_audit",
        target: "loop_core",
        input: {
          sessionId: "phase6_trace_confirmation_audit_session",
          turnId: "phase6_trace_confirmation_audit_turn",
          message: "yes, confirm",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.state.pendingAction = {
            id: "pending_phase6_trace_confirm_1",
            toolName: "proposeUpdate",
            summary: "Set client inactive",
            args: { entityType: "client", entityId: 9201, changes: { status: "inactive" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 9201,
                changes: { status: "inactive" },
              },
              rootOperation: {
                operation: "update",
                entityType: "client",
                entityId: 9201,
                changes: { status: "inactive" },
              },
              diagnostics: {
                linkResolution: {
                  status: "resolved",
                  source: "active_entities",
                },
              },
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase6_prev_turn",
            risk: "medium",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const audits = Array.isArray(result.output?.audit) ? result.output.audit : [];
    const confirmationAudit = audits.find(
      (row) => row?.eventType === "pending_confirmed_plan_executed",
    );
    assert.ok(confirmationAudit, "Expected pending_confirmed_plan_executed audit.");
    assert.equal(confirmationAudit?.data?.linkResolutionSourceTrace, "fallback");
    assert.equal(confirmationAudit?.data?.linkResolutionStatus, "resolved");
  } finally {
    restoreExecute?.();
  }
});

test("phase6 link traceability: observability summary tracks link-resolution failures", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase6_trace_observability_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Ambiguous parent task for observability" },
          },
        },
      ],
    },
  ]);

  try {
    const { records } = await withCapturedConsole(async () =>
      runScenario(
        {
          id: "phase6_trace_observability_summary",
          target: "loop_core",
          input: {
            sessionId: "phase6_trace_observability_summary_session",
            turnId: "phase6_trace_observability_summary_turn",
            message: "Create task Ambiguous parent task",
            metadata: { security: { authScope: "execute" } },
          },
          preSession(session) {
            session.activeEntities = [
              {
                type: "dossier",
                id: 101,
                label: "D-101",
                sourceTool: "getEntityGraph",
                lastMentionedAt: new Date().toISOString(),
              },
              {
                type: "lawsuit",
                id: 202,
                label: "L-202",
                sourceTool: "getEntityGraph",
                lastMentionedAt: new Date().toISOString(),
              },
            ];
          },
        },
        { runtime, skipAssertions: true },
      ),
    );

    const summaries = records.info.filter(
      (args) => args[0] === "[LINK_RESOLUTION_OBSERVABILITY_SUMMARY]",
    );
    assert.equal(summaries.length, 1, "Expected one link-resolution summary log.");
    assert.equal(summaries[0][1]?.LINK_RESOLUTION_TOTAL, 1);
    assert.equal(summaries[0][1]?.LINK_RESOLUTION_AMBIGUOUS, 1);
    assert.equal(summaries[0][1]?.LINK_RESOLUTION_FAILURES, 1);
  } finally {
    restore();
  }
});

function scriptModel(runtime, scriptedCalls) {
  const llm = runtime?.loop?.llm;
  if (!llm) {
    throw new Error("Expected runtime.loop.llm to be available.");
  }

  const queue = Array.isArray(scriptedCalls) ? [...scriptedCalls] : [];
  const pull = () => {
    if (queue.length === 0) {
      return { text: "Done.", toolCalls: [] };
    }
    const next = queue.shift() || {};
    return {
      text: String(next.text || ""),
      toolCalls: Array.isArray(next.toolCalls) ? next.toolCalls : [],
    };
  };

  const restoreStream = patchMethod(llm, "stream", async function* () {
    const next = pull();
    if (next.text) {
      yield { deltaText: next.text };
    }
    for (const toolCall of next.toolCalls) {
      yield { toolCall };
    }
    const finishReason = next.toolCalls.length > 0 ? "tool_calls" : "stop";
    yield { finishReason, done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => {
    const next = pull();
    return {
      text: next.text,
      toolCalls: next.toolCalls,
      finishReason: next.toolCalls.length > 0 ? "tool_calls" : "stop",
      raw: { mocked: true },
    };
  });

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

async function withCapturedConsole(task) {
  const records = { info: [], warn: [], error: [] };
  const originalInfo = console.info;
  const originalWarn = console.warn;
  const originalError = console.error;

  console.info = (...args) => {
    records.info.push(args);
    return originalInfo.apply(console, args);
  };
  console.warn = (...args) => {
    records.warn.push(args);
    return originalWarn.apply(console, args);
  };
  console.error = (...args) => {
    records.error.push(args);
    return originalError.apply(console, args);
  };

  try {
    const value = await task();
    return { value, records };
  } finally {
    console.info = originalInfo;
    console.warn = originalWarn;
    console.error = originalError;
  }
}
