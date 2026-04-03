"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase8 rollout: disabling FEATURE_AGENT_V2_SUGGESTIONS skips implicit suggestion enforcement", async () => {
  const restoreEnv = overrideEnv("FEATURE_AGENT_V2_SUGGESTIONS", "false");
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase8_flagoff_generate_draft_1",
          name: "generateDraft",
          arguments: {
            draftType: "client_letter",
            title: "Welcome Letter",
            sections: [
              { role: "salutation", text: "Dear Client," },
              { role: "body", text: "Welcome to our firm." },
              { role: "closing", text: "Sincerely," },
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
      text: "Your draft is ready.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const sessionId = createSessionId("phase8_rollout_flag_off_no_suggestion_enforcement");
    const result = await runScenario(
      {
        id: "phase8_rollout_flag_off_no_suggestion_enforcement",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase8_rollout_flag_off_no_suggestion_enforcement_turn",
          message: "i should write a short welcome letter.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    assert.equal(
      toolCalls.some((call) => call.toolName === "suggestAction"),
      false,
      "Did not expect suggestAction while suggestion feature flag is disabled.",
    );
    assert.equal(
      toolCalls.some((call) => call.toolName === "generateDraft" && call.ok === true),
      true,
      "Expected normal draft flow when suggestions are disabled.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      false,
      "Did not expect suggestion artifact metadata while feature is disabled.",
    );
  } finally {
    restoreLlm();
    restoreEnv();
  }
});

test("phase8 telemetry: suggestion shown then accepted is tracked", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase8_telemetry_show_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "implicit_intent",
            targetType: "client_letter",
            title: "Suggested Welcome Letter",
            reason: "The user implies drafting intent for a welcome communication.",
            prefillData: {
              draftType: "client_letter",
              tone: "friendly",
              language: "en",
            },
          },
        },
      ],
      finishReason: "tool_calls",
    },
    {
      text: "I prepared a targeted draft suggestion. Review it and tell me if you want me to continue.",
      toolCalls: [],
      finishReason: "stop",
    },
    {
      text: "Proceeding with your selected suggestion.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const sessionId = createSessionId("phase8_telemetry_show_accept");
    const shownTurn = await runScenario(
      {
        id: "phase8_telemetry_show_turn",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase8_telemetry_show_turn_id",
          message: "i should send a welcome letter to the new client.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(
      shownTurn.output?.metadata?.suggestionTelemetry?.counters?.shown,
      1,
      "Expected suggestion shown counter to increment.",
    );

    const acceptedTurn = await runScenario(
      {
        id: "phase8_telemetry_accept_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "phase8_telemetry_accept_turn_id",
          message: "Use this suggestion.",
          metadata: {
            requestSource: "assist_suggestion_cta",
            requestTriggerId: "draft:draft:client_letter:assistant",
            security: { authScope: "execute" },
          },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );

    const acceptedAudit = Array.isArray(acceptedTurn.output?.audit)
      ? acceptedTurn.output.audit
      : [];
    assert.equal(
      acceptedAudit.some((entry) => entry.eventType === "suggestion_accepted"),
      true,
      "Expected suggestion_accepted audit event.",
    );
    assert.equal(
      acceptedTurn.output?.metadata?.suggestionTelemetry?.counters?.accepted,
      1,
      "Expected suggestion accepted counter to increment.",
    );
    assert.equal(
      Boolean(acceptedTurn.output?.metadata?.suggestionTelemetry?.pending),
      false,
      "Expected pending suggestion telemetry to be cleared after acceptance.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase8 execute accept: assist_suggestion_cta leads to plan proposal, not immediate execution", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase8_execute_accept_show_1",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "implicit_intent",
            targetType: "task",
            title: "Suggested Task Update",
            reason: "The user implied a task status update without an explicit direct command.",
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
      toolCalls: [
        {
          id: "tc_phase8_execute_accept_plan_1",
          name: "proposeUpdate",
          arguments: {
            entityType: "task",
            entityId: 77,
            changes: { status: { from: "pending", to: "in_progress" } },
            reason: "User accepted the suggested plan update.",
          },
        },
      ],
      finishReason: "tool_calls",
    },
  ]);

  try {
    const sessionId = createSessionId("phase8_execute_accept_plan_only");
    await runScenario(
      {
        id: "phase8_execute_accept_show_turn",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase8_execute_accept_show_turn_id",
          message: "i should mark task 77 as in progress.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const acceptedTurn = await runScenario(
      {
        id: "phase8_execute_accept_plan_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "phase8_execute_accept_plan_turn_id",
          message: "Update task 77 status to in progress.",
          metadata: {
            requestSource: "assist_suggestion_cta",
            requestTriggerId: "execute:update:task:assistant",
            security: { authScope: "execute" },
          },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );

    const output = acceptedTurn.output;
    assert.ok(output, "Expected loop output.");
    assert.ok(output.pendingAction, "Expected pending plan action after accepting execute suggestion.");
    assert.ok(output.metadata?.planArtifact, "Expected plan artifact after execute suggestion acceptance.");
    assert.equal(
      Boolean(output.metadata?.planExecutedArtifact),
      false,
      "Did not expect immediate execution artifact on suggestion accept.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase8 telemetry: suggestion shown then dismissed is tracked", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase8_telemetry_dismiss_show_1",
          name: "suggestAction",
          arguments: {
            domain: "execute",
            actionType: "update",
            trigger: "implicit_intent",
            targetType: "task",
            title: "Suggested Task Update",
            reason: "The message implies a status update without explicit execution request.",
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
      text: "I prepared a targeted next-step suggestion for this update. Review it and tell me if you want me to continue.",
      toolCalls: [],
      finishReason: "stop",
    },
    {
      text: "Understood.",
      toolCalls: [],
      finishReason: "stop",
    },
  ]);

  try {
    const sessionId = createSessionId("phase8_telemetry_show_dismiss");
    await runScenario(
      {
        id: "phase8_telemetry_dismiss_show_turn",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase8_telemetry_dismiss_show_turn_id",
          message: "i should update task 77 status.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const dismissedTurn = await runScenario(
      {
        id: "phase8_telemetry_dismiss_turn",
        target: "loop_core",
        resetSession: false,
        input: {
          sessionId,
          turnId: "phase8_telemetry_dismiss_turn_id",
          message: "Nevermind, show me active tasks instead.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true, resetSession: false },
    );

    const dismissedAudit = Array.isArray(dismissedTurn.output?.audit)
      ? dismissedTurn.output.audit
      : [];
    assert.equal(
      dismissedAudit.some((entry) => entry.eventType === "suggestion_dismissed"),
      true,
      "Expected suggestion_dismissed audit event.",
    );
    assert.equal(
      dismissedTurn.output?.metadata?.suggestionTelemetry?.counters?.dismissed,
      1,
      "Expected suggestion dismissed counter to increment.",
    );
  } finally {
    restoreLlm();
  }
});

test("phase8 fallback: suggestAction failure in implicit flow yields safe fallback response", async () => {
  const runtime = createLiveRuntime();
  const restoreLlm = queueLlmResponses(runtime, [
    {
      toolCalls: [
        {
          id: "tc_phase8_fallback_failed_suggestion_1",
          name: "suggestAction",
          arguments: {
            domain: "draft",
            actionType: "draft",
            trigger: "implicit_intent",
            targetType: "client_letter",
            title: "Bad Suggestion Payload",
            reason: "Intentionally missing prefillData to trigger validation failure.",
          },
        },
      ],
      finishReason: "tool_calls",
    },
  ]);

  try {
    const sessionId = createSessionId("phase8_fallback_suggestion_failure");
    const result = await runScenario(
      {
        id: "phase8_fallback_suggestion_failure_turn",
        target: "loop_core",
        input: {
          sessionId,
          turnId: "phase8_fallback_suggestion_failure_turn_id",
          message: "i should send the new client a welcome letter.",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output, "Expected loop output.");
    assert.equal(
      Boolean(output.pendingAction),
      false,
      "Fallback response must remain non-mutating and non-pending.",
    );
    assert.equal(
      String(output.responseText || "").toLowerCase().includes("continue?"),
      true,
      "Expected fallback response to ask for explicit confirmation.",
    );
    assert.equal(
      Boolean(output.metadata?.suggestionArtifact),
      true,
      "Expected fallback suggestion artifact on fallback path.",
    );
    const audit = Array.isArray(output.audit) ? output.audit : [];
    assert.equal(
      audit.some((entry) => entry.eventType === "suggestion_failed"),
      true,
      "Expected suggestion_failed audit event.",
    );
    assert.equal(
      audit.some((entry) => entry.eventType === "suggestion_fallback_artifact_emitted"),
      true,
      "Expected suggestion_fallback_artifact_emitted audit event.",
    );
    assert.equal(
      output.metadata?.suggestionTelemetry?.counters?.shown,
      1,
      "Expected shown telemetry counter to increment for fallback artifact.",
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

function overrideEnv(name, value) {
  const previous = process.env[name];
  if (typeof value === "undefined") {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
  return () => {
    if (typeof previous === "undefined") {
      delete process.env[name];
    } else {
      process.env[name] = previous;
    }
  };
}

function createSessionId(prefix) {
  return `${String(prefix || "phase8")}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
