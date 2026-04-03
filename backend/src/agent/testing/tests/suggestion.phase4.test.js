"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase4 suggestion: implicit draft intent emits suggestion_artifact and skips pending action", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_draft_direct_1",
          name: "generateDraft",
          arguments: {
            draftType: "client_letter",
            title: "Welcome Letter",
            sections: [{ role: "body", text: "Welcome draft content." }],
            layout: {
              direction: "ltr",
              language: "en",
              formality: "formal",
              documentClass: "letter",
            },
            linkedEntityType: "client",
            linkedEntityId: 9001,
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      toolCalls: [
        {
          id: "tc_suggest_draft_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "implicit_intent",
            targetType: "client_letter",
            title: "Suggested Welcome Letter Draft",
            reason:
              "The user implied sending a welcome letter to a newly onboarded client.",
            linkedEntityType: "client",
            linkedEntityId: "plan_ui_smoke_client",
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
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase4_suggestion_implicit_draft",
        target: "sse_handler",
        input: {
          sessionId: "phase4_suggestion_implicit_draft_session",
          turnId: "phase4_suggestion_implicit_draft_turn",
          message:
            "i should send Plan UI Smoke Client a letter of welcome since its a new client.",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase4_suggestion_user", scope: "execute" },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.capturedLoopOutput;
    assert.ok(output, "Expected loop output to be captured.");
    assert.equal(Boolean(output.pendingAction), false, "Suggestion flow must not create pending actions.");
    assert.ok(output.metadata?.suggestionArtifact, "Expected suggestionArtifact in output metadata.");
    assert.equal(output.metadata.suggestionArtifact.domain, "draft");
    assert.equal(output.metadata.suggestionArtifact.trigger, "implicit_intent");
    assert.equal(output.metadata.suggestionArtifact.actionType, "draft");

    const loopToolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    assert.equal(
      loopToolCalls.some((call) => call.toolName === "generateDraft"),
      false,
      "generateDraft should not run before implicit suggestion.",
    );
    assert.equal(
      loopToolCalls.filter((call) => call.toolName === "suggestAction" && call.ok === true).length,
      1,
      "Expected exactly one successful suggestAction call.",
    );

    const suggestionEvents = result.events.filter((event) => event.event === "suggestion_artifact");
    assert.equal(suggestionEvents.length, 1, "Expected exactly one suggestion_artifact SSE event.");
    const pendingEvents = result.events.filter((event) => event.event === "pending");
    assert.equal(pendingEvents.length, 0, "Suggestion flow must not emit pending event.");
  } finally {
    restoreLlm();
  }
});

test("phase4 suggestion: implicit execute intent emits suggestion first and blocks plan pending", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_plan_direct_1",
          name: "proposeUpdate",
          arguments: {
            entityType: "task",
            entityId: 77,
            changes: { status: { from: "pending", to: "in_progress" } },
            reason: "The user implied we should move the task forward.",
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      toolCalls: [
        {
          id: "tc_suggest_execute_1",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "implicit_intent",
            targetType: "task",
            title: "Suggested Task Status Update",
            reason: "The message implies a status mutation but does not request immediate execution.",
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
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase4_suggestion_implicit_execute",
        target: "loop_core",
        input: {
          sessionId: "phase4_suggestion_implicit_execute_session",
          turnId: "phase4_suggestion_implicit_execute_turn",
          message: "i should mark task 77 as in progress.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.equal(Boolean(output.pendingAction), false, "Implicit execute suggestion must not create pending action.");
    assert.ok(output.metadata?.suggestionArtifact, "Expected suggestion artifact metadata.");
    assert.equal(output.metadata.suggestionArtifact.domain, "execute");
    assert.equal(output.metadata.suggestionArtifact.actionType, "update");
    assert.equal(output.metadata.suggestionArtifact.trigger, "implicit_intent");

    const loopToolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    assert.equal(
      loopToolCalls.some((call) => call.toolName === "proposeUpdate"),
      false,
      "proposeUpdate should not run before implicit suggestion is emitted.",
    );
    assert.equal(
      loopToolCalls.filter((call) => call.toolName === "suggestAction" && call.ok === true).length,
      1,
      "Expected one successful suggestAction call.",
    );
    assert.equal(Boolean(output.metadata?.planArtifact), false, "No plan artifact expected in suggestion-first path.");
  } finally {
    restoreLlm();
  }
});

test("phase4 suggestion: one successful suggestion per turn is enforced", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_suggest_limit_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "proactive_context",
            targetType: "client_letter",
            title: "Primary Welcome Letter Suggestion",
            reason: "The user explicitly asked for a welcome letter draft for a new client.",
            prefillData: {
              draftType: "client_letter",
              purpose: "welcome_new_client",
              tone: "friendly",
              language: "en",
            },
          },
        },
        {
          id: "tc_suggest_limit_2",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "proactive_context",
            targetType: "client_letter",
            title: "Secondary Welcome Letter Suggestion",
            reason: "A second suggestion in the same turn should be blocked by the loop guard.",
            prefillData: {
              draftType: "client_letter",
              purpose: "welcome_new_client",
              tone: "formal",
              language: "en",
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      text: "Suggestion pass complete.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase4_suggestion_limit_guard",
        target: "loop_core",
        input: {
          sessionId: "phase4_suggestion_limit_guard_session",
          turnId: "phase4_suggestion_limit_guard_turn",
          message: "create for Plan UI Smoke Client a letter of welcome since its a new client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.equal(Boolean(output.pendingAction), false);
    assert.ok(output.metadata?.suggestionArtifact, "Expected suggestion metadata from first call.");

    const suggestionCalls = (output.toolCalls || []).filter(
      (call) => call.toolName === "suggestAction",
    );
    assert.equal(suggestionCalls.length, 2, "Expected two suggestAction call records.");
    assert.equal(
      suggestionCalls.filter((call) => call.ok === true).length,
      1,
      "Expected only first suggestion to succeed.",
    );
    assert.ok(
      suggestionCalls.some(
        (call) => call.ok === false && call.errorCode === "SUGGESTION_LIMIT_REACHED",
      ),
      "Expected second suggestion to be denied by turn-level limit.",
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
