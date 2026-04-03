"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase7 generation: suggestAction produces normalized draft suggestion artifact", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase7_generate_draft_suggestion",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "proactive_context",
            targetType: "client_letter",
            title: "Suggested Welcome Letter Draft",
            reason: "A welcome letter is appropriate for this new client onboarding request.",
            linkedEntityType: "client",
            linkedEntityId: 901,
            prefillData: {
              draftType: "client_letter",
              purpose: "welcome_new_client",
              tone: "friendly",
              language: "en",
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      text: "Suggestion generated.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase7_generation_draft_suggestion",
        target: "loop_core",
        input: {
          sessionId: "phase7_generation_draft_suggestion_session",
          turnId: "phase7_generation_draft_suggestion_turn",
          message: "create a welcome letter for the new client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    const suggestion = output.metadata?.suggestionArtifact;
    assert.ok(suggestion, "Expected suggestion artifact in metadata.");
    assert.equal(suggestion.domain, "draft");
    assert.equal(suggestion.actionType, "draft");
    assert.equal(suggestion.trigger, "proactive_context");
    assert.equal(suggestion.targetType, "client_letter");
  } finally {
    restoreLlm();
  }
});

test("phase7 generation: suggestAction produces normalized execute suggestion artifact", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase7_generate_execute_suggestion",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "proactive_context",
            targetType: "task",
            title: "Suggested Task Status Update",
            reason: "Updating status to in progress matches the user operational objective.",
            linkedEntityType: "task",
            linkedEntityId: 77,
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
      text: "Suggestion generated.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase7_generation_execute_suggestion",
        target: "loop_core",
        input: {
          sessionId: "phase7_generation_execute_suggestion_session",
          turnId: "phase7_generation_execute_suggestion_turn",
          message: "suggest a safe next update for task 77.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    const suggestion = output.metadata?.suggestionArtifact;
    assert.ok(suggestion, "Expected suggestion artifact in metadata.");
    assert.equal(suggestion.domain, "execute");
    assert.equal(suggestion.actionType, "update");
    assert.equal(suggestion.trigger, "proactive_context");
    assert.equal(suggestion.targetType, "task");
  } finally {
    restoreLlm();
  }
});

test("phase7 hardening: duplicate successful suggestion across iterations is denied", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase7_duplicate_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "proactive_context",
            targetType: "client_letter",
            title: "First Suggestion",
            reason: "First contextual suggestion for drafting.",
            prefillData: {
              draftType: "client_letter",
              purpose: "welcome_new_client",
              tone: "friendly",
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      toolCalls: [
        {
          id: "tc_phase7_duplicate_2",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "proactive_context",
            targetType: "task",
            title: "Second Suggestion",
            reason: "Second suggestion should be denied in same turn.",
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
      text: "Done.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase7_hardening_duplicate_suggestions",
        target: "loop_core",
        input: {
          sessionId: "phase7_hardening_duplicate_suggestions_session",
          turnId: "phase7_hardening_duplicate_suggestions_turn",
          message: "suggest what I should do next.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    const suggestionCalls = (output.toolCalls || []).filter(
      (call) => call.toolName === "suggestAction",
    );
    assert.equal(suggestionCalls.length, 2, "Expected two suggestion call attempts.");
    assert.equal(
      suggestionCalls.filter((call) => call.ok === true).length,
      1,
      "Expected only one successful suggestion per turn.",
    );
    assert.ok(
      suggestionCalls.some(
        (call) => call.ok === false && call.errorCode === "SUGGESTION_LIMIT_REACHED",
      ),
      "Expected second suggestion call to be denied by guard.",
    );
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
