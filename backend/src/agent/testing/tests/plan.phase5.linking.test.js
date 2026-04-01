"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase5 linking: proposal preview shows explicit payload link target and source", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase5_linking_payload_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: {
              title: "Phase5 payload linked task",
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
        id: "phase5_linking_payload_preview",
        target: "loop_core",
        input: {
          sessionId: "phase5_linking_payload_preview_session",
          turnId: "phase5_linking_payload_preview_turn",
          message: "Create a task in dossier 333",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const pending = result.output?.pendingAction;
    assert.ok(pending, "Expected pending action to be created.");
    assert.equal(pending.plan?.operation?.payload?.dossier_id, 333);
    assert.equal(pending.plan?.uiPreview?.linking?.status, "unchanged");
    assert.equal(pending.plan?.uiPreview?.linking?.source, "payload");
    assert.equal(pending.plan?.uiPreview?.linking?.userSpecified, true);
    assert.equal(pending.plan?.uiPreview?.linking?.target?.entityType, "dossier");
    assert.equal(pending.plan?.uiPreview?.linking?.target?.entityId, 333);
  } finally {
    restore();
  }
});

test("phase5 linking: proposal preview shows auto-resolved link provenance", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase5_linking_resolved_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Phase5 auto-resolved task" },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_linking_resolved_preview",
        target: "loop_core",
        input: {
          sessionId: "phase5_linking_resolved_preview_session",
          turnId: "phase5_linking_resolved_preview_turn",
          message: "Create a task for this dossier",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.currentDraft = {
            draftType: "note",
            title: "Draft Context",
            sections: [{ id: "s1", role: "body", text: "context" }],
            layout: {
              direction: "ltr",
              language: "en",
              formality: "standard",
              documentClass: "note",
            },
            linkedEntityType: "dossier",
            linkedEntityId: 222,
            generatedAt: new Date().toISOString(),
            version: 1,
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const pending = result.output?.pendingAction;
    assert.ok(pending, "Expected pending action to be created.");
    assert.equal(pending.plan?.operation?.payload?.dossier_id, 222);
    assert.equal(pending.plan?.uiPreview?.linking?.status, "resolved");
    assert.equal(pending.plan?.uiPreview?.linking?.source, "draft_context");
    assert.equal(pending.plan?.uiPreview?.linking?.userSpecified, false);
    assert.equal(pending.plan?.uiPreview?.linking?.target?.entityType, "dossier");
    assert.equal(pending.plan?.uiPreview?.linking?.target?.entityId, 222);
  } finally {
    restore();
  }
});

test("phase5 linking: ambiguous parent links return deterministic disambiguation before proposal", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase5_linking_ambiguous_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Ambiguous parent task" },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase5_linking_ambiguous_disambiguation",
        target: "loop_core",
        input: {
          sessionId: "phase5_linking_ambiguous_disambiguation_session",
          turnId: "phase5_linking_ambiguous_disambiguation_turn",
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
    );

    assert.equal(result.output?.pendingAction, null, "No proposal should be created while ambiguous.");
    assert.match(
      String(result.output?.responseText || ""),
      /multiple parent targets/i,
      "Expected deterministic disambiguation response.",
    );
    assert.match(String(result.output?.responseText || ""), /D-101|L-202/);

    const failed = (result.output?.toolCalls || []).find(
      (row) => row?.toolName === "proposeCreate" && row?.ok === false,
    );
    assert.ok(failed, "Expected failed proposeCreate tool call.");
    assert.equal(failed?.errorCode, "PLAN_LINK_RESOLUTION_AMBIGUOUS");
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
