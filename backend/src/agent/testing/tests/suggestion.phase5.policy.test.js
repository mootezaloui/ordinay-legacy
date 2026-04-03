"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase5 policy: explicit complete draft request proceeds without suggestion injection", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase5_explicit_draft_1",
          name: "generateDraft",
          arguments: {
            draftType: "client_letter",
            title: "Welcome Letter",
            sections: [
              { role: "date", text: "April 3, 2026" },
              { role: "salutation", text: "Dear Client," },
              {
                role: "body",
                text: "Welcome to our firm. We look forward to supporting your legal matters.",
              },
              { role: "closing", text: "Sincerely," },
              { role: "signature_name", text: "Your Law Firm" },
            ],
            layout: {
              direction: "ltr",
              language: "en",
              formality: "formal",
              documentClass: "client_letter",
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      text: "Your draft is ready for review.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_policy_explicit_draft_no_suggestion",
        target: "loop_core",
        input: {
          sessionId: "phase5_policy_explicit_draft_no_suggestion_session",
          turnId: "phase5_policy_explicit_draft_no_suggestion_turn",
          message:
            "create a formal english welcome letter with a friendly tone for a new client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    assert.ok(
      toolCalls.some((call) => call.toolName === "generateDraft"),
      "Expected generateDraft to proceed on explicit draft request.",
    );
    assert.equal(
      toolCalls.some((call) => call.toolName === "suggestAction"),
      false,
      "Did not expect suggestAction to be injected for explicit complete draft request.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      false,
      "Did not expect suggestion artifact for explicit complete draft request.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase5 policy: explicit execute mutation request proceeds with PLAN without suggestion injection", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase5_explicit_execute_1",
          name: "proposeUpdate",
          arguments: {
            entityType: "task",
            entityId: 77,
            changes: { status: { from: "pending", to: "in_progress" } },
            reason: "User explicitly requested a task status update.",
          },
        },
      ],
      finishReason: "tool_calls",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_policy_explicit_execute_no_suggestion",
        target: "loop_core",
        input: {
          sessionId: "phase5_policy_explicit_execute_no_suggestion_session",
          turnId: "phase5_policy_explicit_execute_no_suggestion_turn",
          message: "update task 77 status to in progress.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.ok(output.pendingAction, "Expected pending action for explicit PLAN mutation path.");
    assert.ok(output.metadata?.planArtifact, "Expected plan artifact for explicit PLAN mutation path.");

    const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    assert.ok(
      toolCalls.some((call) => call.toolName === "proposeUpdate"),
      "Expected proposeUpdate call.",
    );
    assert.equal(
      toolCalls.some((call) => call.toolName === "suggestAction"),
      false,
      "Did not expect suggestAction to be injected for explicit execute request.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      false,
      "Did not expect suggestion artifact for explicit execute request.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase5 policy: clarification/disambiguation text is allowed before suggestions", async () => {
  const runtime = createLiveRuntime();
  const clarificationText =
    "I need more information before continuing. Could you let me know which Leila this is for?";
  const restoreLlm = queueLlmResponses(runtime, [
    {
      text: clarificationText,
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_policy_clarification_before_suggestion",
        target: "loop_core",
        input: {
          sessionId: "phase5_policy_clarification_before_suggestion_session",
          turnId: "phase5_policy_clarification_before_suggestion_turn",
          message: "i should send leila a welcome letter.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.match(
      String(output.responseText || "").toLowerCase(),
      /could you let me know|which leila/,
      "Expected clarification response to pass through before suggestion.",
    );
    assert.equal(
      (output.toolCalls || []).length,
      0,
      "Expected no tool calls when clarification response is returned directly.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      false,
      "Did not expect suggestion artifact when clarification/disambiguation is still required.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase5 policy: implicit suggestion fallback emits suggestion artifact with button-oriented copy", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    { text: "I can prepare that for you.", toolCalls: [], finishReason: "stop" },
    { text: "I can help with this request.", toolCalls: [], finishReason: "stop" },
    { text: "Ready when you are.", toolCalls: [], finishReason: "stop" },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_policy_binary_yes_no_fallback",
        target: "loop_core",
        input: {
          sessionId: "phase5_policy_binary_yes_no_fallback_session",
          turnId: "phase5_policy_binary_yes_no_fallback_turn",
          message: "i should send Plan UI Smoke Client a letter of welcome since its a new client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.ok(output.metadata?.suggestionArtifact, "Expected fallback suggestion artifact.");
    assert.match(
      String(output.responseText || "").toLowerCase(),
      /continue\?/,
      "Expected fallback response to ask for explicit confirmation.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase5 policy: assist_suggestion_decline triggers single clarification without new suggestion", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase5_decline_show_suggestion",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "implicit_intent",
            targetType: "task",
            title: "Suggested Task Status Update",
            reason: "The user implied an update but did not request immediate planning.",
            prefillData: {
              operation: "update",
              entityType: "task",
              changes: { status: { from: "pending", to: "in_progress" } },
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      text: "I prepared a targeted next-step suggestion for this update. Should I continue with it now? Reply Yes or No.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const sessionId = "phase5_policy_decline_clarification_session";
    await runScenario(
      {
        id: "phase5_policy_decline_show_turn",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase5_policy_decline_show_turn_id",
          message: "i should update task 77 status.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const declinedTurn = await runScenario(
      {
        id: "phase5_policy_decline_followup_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "phase5_policy_decline_followup_turn_id",
          message:
            "No. Skip this suggestion and ask me one concise clarification question so we can continue with the exact plan.",
          metadata: {
            requestSource: "assist_suggestion_decline",
            requestTriggerId: "execute:update:task:assistant:decline",
            security: { authScope: "execute" },
          },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );

    const output = declinedTurn.output;
    assert.ok(output, "Expected loop output.");
    assert.equal(
      (output.toolCalls || []).length,
      0,
      "Expected no tool calls in suggestion decline clarification path.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      false,
      "Expected no suggestion artifact after explicit decline.",
    );
    assert.match(
      String(output.responseText || "").toLowerCase(),
      /\?$/,
      "Expected a single clarification question response.",
    );
    const dismissedAudit = Array.isArray(output.audit)
      ? output.audit.some((entry) => entry.eventType === "suggestion_dismissed")
      : false;
    assert.equal(dismissedAudit, true, "Expected suggestion_dismissed audit event.");
  } finally {
    restoreLlm();
  }
});

function queueLlmResponses(runtime, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function" || typeof llm.stream !== "function") {
    throw new Error("Expected runtime.loop.llm with generate and stream.");
  }

  const queue = Array.isArray(responses) ? [...responses] : [];
  const originalGenerate = llm.generate.bind(llm);
  const originalStream = llm.stream.bind(llm);

  llm.generate = async () => {
    const next = shiftQueuedResponse(queue);
    return {
      text: String(next.text || ""),
      toolCalls: Array.isArray(next.toolCalls) ? next.toolCalls : [],
      finishReason:
        typeof next.finishReason === "string"
          ? next.finishReason
          : Array.isArray(next.toolCalls) && next.toolCalls.length > 0
          ? "tool_calls"
          : "stop",
      raw: { mocked: true },
    };
  };

  llm.stream = async function* () {
    const next = shiftQueuedResponse(queue);
    if (Array.isArray(next.toolCalls)) {
      for (const toolCall of next.toolCalls) {
        yield { toolCall };
      }
    }
    if (typeof next.text === "string" && next.text.length > 0) {
      yield { deltaText: next.text };
    }
    yield {
      finishReason:
        typeof next.finishReason === "string"
          ? next.finishReason
          : Array.isArray(next.toolCalls) && next.toolCalls.length > 0
          ? "tool_calls"
          : "stop",
      done: true,
    };
  };

  return () => {
    llm.generate = originalGenerate;
    llm.stream = originalStream;
  };
}

function shiftQueuedResponse(queue) {
  if (!Array.isArray(queue) || queue.length === 0) {
    return { text: "", toolCalls: [], finishReason: "stop" };
  }
  const next = queue.shift();
  if (!next || typeof next !== "object") {
    return { text: "", toolCalls: [], finishReason: "stop" };
  }
  return next;
}
