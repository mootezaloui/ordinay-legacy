"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runScenario } = require("../scenario.runner");
const { createLiveRuntime } = require("../runtime.resolver");

const SCENARIOS = [
  "simple_read_only_query",
  "write_proposal_pending",
  "confirmation_execution",
  "rejection_path",
  "amendment_replaces_pending",
  "plan_stream_pending_artifact",
  "plan_stream_confirmation_events",
  "plan_stream_rejection_events",
  "ambiguity_clarification",
  "guided_workflow_suggestion",
  "retrieval_assisted_answer",
  "grounded_citation_aware_response",
  "rate_limit_denial",
  "draft_stream_artifact",
  "unknown_scope_read_only_allowed",
];

for (const scenarioId of SCENARIOS) {
  test(`scenario fixture: ${scenarioId}`, async () => {
    const result = await runScenario(scenarioId);
    assert.equal(result.fixture.id, scenarioId);
    assert.ok(result.target === "loop_core" || result.target === "sse_handler");
    if (result.target === "sse_handler") {
      const hasDone = result.events.some((event) => event.event === "done");
      assert.equal(hasDone, true, "Expected SSE done event");
    }
  });
}

test("scenario regression: mixed read -> draft -> plan -> confirm works without mode switching", async () => {
  const runtime = createLiveRuntime();
  const sessionId = `mixed_mode_less_${Date.now()}`;
  const llm = runtime?.loop?.llm;
  assert.ok(llm, "Expected runtime.loop.llm to be available.");
  const entityExecutor = runtime?.loop?.entityExecutor;
  const restoreEntityExecute =
    entityExecutor && typeof entityExecutor.execute === "function"
      ? patchMethod(entityExecutor, "execute", async () => ({
          ok: true,
          result: {
            operation: "update",
            entityType: "client",
            entityId: 42,
            changes: { status: { from: "active", to: "inactive" } },
          },
        }))
      : null;

  const scriptedTurns = [
    [{ text: "Here is the current client status summary.", toolCalls: [] }],
    [
      {
        text: "",
        toolCalls: [
          {
            id: "tc_mixed_draft_1",
            name: "generateDraft",
            arguments: {
              draftType: "client_letter",
              title: "Client Update",
              sections: [
                { role: "salutation", text: "Dear Client," },
                { role: "body", text: "We are writing to share the latest case update." },
                { role: "closing", text: "Best regards," },
                { role: "signature_name", text: "Your Counsel Team" },
              ],
            },
          },
        ],
      },
      { text: "Draft prepared.", toolCalls: [] },
    ],
    [
      {
        text: "",
        toolCalls: [
          {
            id: "tc_mixed_plan_1",
            name: "proposeUpdate",
            arguments: {
              entityType: "client",
              entityId: 42,
              changes: { status: { from: "active", to: "inactive" } },
              reason: "User requested status update.",
            },
          },
        ],
      },
    ],
  ];
  let turnIndex = 0;
  let turnCalls = null;

  const shiftResponse = () => {
    if (!Array.isArray(turnCalls) || turnCalls.length === 0) {
      const scripted = scriptedTurns[Math.min(turnIndex, scriptedTurns.length - 1)] || [
        { text: "Done.", toolCalls: [] },
      ];
      turnCalls = scripted.map((row) => ({ ...row }));
      turnIndex += 1;
    }
    return turnCalls.shift() || { text: "Done.", toolCalls: [] };
  };

  const restoreStream = patchMethod(llm, "stream", async function* () {
    const next = shiftResponse();
    if (next.text) {
      yield { deltaText: next.text };
    }
    if (Array.isArray(next.toolCalls)) {
      for (const toolCall of next.toolCalls) {
        yield { toolCall };
      }
    }
    const finishReason = Array.isArray(next.toolCalls) && next.toolCalls.length > 0 ? "tool_calls" : "stop";
    yield { finishReason, done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => {
    const next = shiftResponse();
    return {
      text: String(next.text || ""),
      toolCalls: Array.isArray(next.toolCalls) ? next.toolCalls : [],
      finishReason:
        Array.isArray(next.toolCalls) && next.toolCalls.length > 0 ? "tool_calls" : "stop",
      raw: { mocked: true },
    };
  });

  try {
    const readTurn = await runScenario(
      {
        id: "mixed_read_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "mixed_read_turn_1",
          message: "Show me current client status.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );
    assert.equal(readTurn.output.turnType, "NEW");
    assert.equal(readTurn.output.pendingAction, null);

    const draftTurn = await runScenario(
      {
        id: "mixed_draft_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "mixed_draft_turn_2",
          message: "Draft an update email for this client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );
    assert.equal(draftTurn.output.turnType, "NEW");
    assert.ok(draftTurn.output.metadata?.draftArtifact, "Expected draftArtifact metadata.");

    const planTurn = await runScenario(
      {
        id: "mixed_plan_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "mixed_plan_turn_3",
          message: "Set this client status to inactive.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );
    assert.equal(planTurn.output.turnType, "NEW");
    assert.ok(planTurn.output.pendingAction, "Expected pendingAction after PLAN proposal.");
    assert.ok(planTurn.output.metadata?.planArtifact, "Expected planArtifact metadata.");

    const confirmTurn = await runScenario(
      {
        id: "mixed_confirm_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "mixed_confirm_turn_4",
          message: "yes confirm",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );
    assert.equal(confirmTurn.output.turnType, "CONFIRMATION");
    assert.equal(confirmTurn.output.pendingAction, null);
    assert.equal(confirmTurn.output.metadata?.planExecutedArtifact?.ok, true);
  } finally {
    restoreStream?.();
    restoreGenerate?.();
    restoreEntityExecute?.();
  }
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

