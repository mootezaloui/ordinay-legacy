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

test('phase4 regression: "i should send ... welcome letter" reaches loop and suggests first', async () => {
  const runtime = createLiveRuntime();
  const restoreSuggestionFlow = mockWelcomeLetterSuggestionFlow(runtime);

  try {
    const result = await runScenario(
      {
        id: "phase4_welcome_phrase_should_send",
        target: "sse_handler",
        input: {
          sessionId: "phase4_welcome_phrase_should_send_session",
          turnId: "phase4_welcome_phrase_should_send_turn",
          message: "i should send Plan UI Smoke Client a letter of welcome since its a new client.",
          metadata: { security: { requestedAction: "draft" } },
        },
        requestUser: { id: "phase4_draft_user", scope: "draft" },
      },
      { runtime, skipAssertions: true },
    );

    assert.ok(result?.capturedLoopInput, "Expected SSE request to reach AgenticLoop.");
    assert.ok(
      result.events.some((event) => event.event === "suggestion_artifact"),
      "Expected suggestion_artifact SSE event.",
    );
    assert.equal(
      result.events.some((event) => event.event === "draft_artifact"),
      false,
      "Implicit phrasing should suggest first, not emit a draft artifact.",
    );
    assert.equal(
      result.events.some((event) => event.event === "error"),
      false,
      "Did not expect SSE error for welcome-letter suggestion phrasing.",
    );
    assert.ok(
      String(result?.derived?.responseText || "").toLowerCase().includes("suggestion"),
      "Expected completion text indicating suggestion flow.",
    );
  } finally {
    restoreSuggestionFlow?.();
  }
});

test('phase4 regression: "create ... welcome letter" still drafts', async () => {
  const runtime = createLiveRuntime();
  const restoreDraftFlow = mockWelcomeLetterDraftFlow(runtime);

  try {
    const result = await runScenario(
      {
        id: "phase4_welcome_phrase_create",
        target: "sse_handler",
        input: {
          sessionId: "phase4_welcome_phrase_create_session",
          turnId: "phase4_welcome_phrase_create_turn",
          message: "create for Plan UI Smoke Client a letter of welcome since its a new client.",
          metadata: { security: { requestedAction: "draft" } },
        },
        requestUser: { id: "phase4_draft_user", scope: "draft" },
      },
      { runtime, skipAssertions: true },
    );

    assert.ok(result?.capturedLoopInput, "Expected SSE request to reach AgenticLoop.");
    assert.ok(
      result.events.some((event) => event.event === "draft_artifact"),
      "Expected draft_artifact SSE event.",
    );
    assert.equal(
      result.events.some((event) => event.event === "error"),
      false,
      "Did not expect SSE error for explicit create welcome-letter phrasing.",
    );
    assert.ok(
      String(result?.derived?.responseText || "").toLowerCase().includes("welcome letter draft"),
      "Expected completion text for welcome letter draft.",
    );
  } finally {
    restoreDraftFlow?.();
  }
});

test("phase4 regression: confirmation/rejection shortcuts still work with pending actions", async () => {
  const confirmed = await runScenario("confirmation_execution", { skipAssertions: true });
  assert.equal(confirmed?.output?.turnType, "CONFIRMATION");
  assert.equal(confirmed?.output?.pendingAction, null);

  const rejected = await runScenario("rejection_path", { skipAssertions: true });
  assert.equal(rejected?.output?.turnType, "REJECTION");
  assert.equal(rejected?.output?.pendingAction, null);
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

function mockWelcomeLetterDraftFlow(runtime) {
  const llm = runtime?.loop?.llm;
  assert.ok(llm, "Expected runtime.loop.llm to be available.");

  let step = 0;
  const nextResponse = () => {
    step += 1;
    if (step === 1) {
      return {
        text: "",
        toolCalls: [
          {
            id: "tc_phase4_welcome_draft_1",
            name: "generateDraft",
            arguments: {
              draftType: "client_letter",
              title: "Welcome Letter",
              metadata: {
                client: "Plan UI Smoke Client",
                language: "English",
                tone: "Friendly",
              },
              sections: [
                { role: "date", text: "April 1, 2026" },
                { role: "salutation", text: "Dear Plan UI Smoke Client," },
                {
                  role: "body",
                  text: "We are delighted to welcome you as a new client of our firm.",
                },
                {
                  role: "body",
                  text: "Our team is committed to providing dedicated, professional, and personalized legal services tailored to your needs.",
                },
                {
                  role: "closing",
                  text: "Sincerely, Your Law Firm",
                },
              ],
              layout: {
                direction: "ltr",
                language: "en",
                formality: "formal",
                documentClass: "letter",
              },
              linkedEntityType: "client",
              linkedEntityId: 1,
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    return {
      text: "Your welcome letter draft is ready. Let me know if you want any edits.",
      toolCalls: [],
      finishReason: "stop",
    };
  };

  const restoreStream = patchMethod(llm, "stream", async function* () {
    const next = nextResponse();
    if (next.text) {
      yield { deltaText: next.text };
    }
    for (const toolCall of next.toolCalls || []) {
      yield { toolCall };
    }
    yield { finishReason: next.finishReason || "stop", done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => {
    const next = nextResponse();
    return {
      text: String(next.text || ""),
      toolCalls: Array.isArray(next.toolCalls) ? next.toolCalls : [],
      finishReason: next.finishReason || "stop",
      raw: { mocked: true },
    };
  });

  return () => {
    restoreStream?.();
    restoreGenerate?.();
  };
}

function mockWelcomeLetterSuggestionFlow(runtime) {
  const llm = runtime?.loop?.llm;
  assert.ok(llm, "Expected runtime.loop.llm to be available.");

  let step = 0;
  const nextResponse = () => {
    step += 1;
    if (step === 1) {
      return {
        text: "",
        toolCalls: [
          {
            id: "tc_phase4_welcome_suggestion_1",
            name: "suggestAction",
            arguments: {
              domain: "draft",
              actionType: "draft",
              trigger: "implicit_intent",
              targetType: "client_letter",
              title: "Suggested Welcome Letter Draft",
              reason: "The user implies drafting intent for onboarding communication.",
              linkedEntityType: "client",
              linkedEntityId: 1,
              prefillData: {
                draftType: "client_letter",
                purpose: "welcome_new_client",
                tone: "friendly",
                language: "en",
                clientName: "Plan UI Smoke Client",
              },
            },
          },
        ],
        finishReason: "tool_calls",
      };
    }

    return {
      text: "Your suggestion is ready. Review it before generating a draft.",
      toolCalls: [],
      finishReason: "stop",
    };
  };

  const restoreStream = patchMethod(llm, "stream", async function* () {
    const next = nextResponse();
    if (next.text) {
      yield { deltaText: next.text };
    }
    for (const toolCall of next.toolCalls || []) {
      yield { toolCall };
    }
    yield { finishReason: next.finishReason || "stop", done: true };
  });

  const restoreGenerate = patchMethod(llm, "generate", async () => {
    const next = nextResponse();
    return {
      text: String(next.text || ""),
      toolCalls: Array.isArray(next.toolCalls) ? next.toolCalls : [],
      finishReason: next.finishReason || "stop",
      raw: { mocked: true },
    };
  });

  return () => {
    restoreStream?.();
    restoreGenerate?.();
  };
}

