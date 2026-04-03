"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase7 stream: suggestion_artifact is emitted before text and done", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase7_stream_order_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "implicit_intent",
            targetType: "client_letter",
            title: "Suggested Welcome Draft",
            reason: "The user implies drafting intent without an explicit direct draft command.",
            linkedEntityType: "client",
            linkedEntityId: 1001,
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
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase7_stream_order_suggestion_before_text",
        target: "sse_handler",
        input: {
          sessionId: "phase7_stream_order_suggestion_before_text_session",
          turnId: "phase7_stream_order_suggestion_before_text_turn",
          message: "i should send the new client a welcome letter.",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase7_stream_user", scope: "execute" },
      },
      { runtime, skipAssertions: true },
    );

    const events = result.events || [];
    const idxSuggestion = events.findIndex((event) => event.event === "suggestion_artifact");
    const idxText = events.findIndex((event) => event.event === "text_delta");
    const idxDone = events.findIndex((event) => event.event === "done");

    assert.ok(idxSuggestion >= 0, "Expected suggestion_artifact event.");
    assert.ok(idxText >= 0, "Expected text_delta event.");
    assert.ok(idxDone >= 0, "Expected done event.");
    assert.ok(
      idxSuggestion < idxText,
      "Expected suggestion_artifact to be emitted before text_delta.",
    );
    assert.ok(idxText < idxDone, "Expected text_delta to be emitted before done.");
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
