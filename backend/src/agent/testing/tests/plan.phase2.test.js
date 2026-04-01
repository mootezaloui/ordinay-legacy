"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase2: create proposal auto-resolves parent link from draft context when unambiguous", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase2_tc_resolve_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Phase2 deterministic task" },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase2_create_resolve_from_draft",
        target: "loop_core",
        input: {
          sessionId: "phase2_create_resolve_from_draft_session",
          turnId: "phase2_create_resolve_from_draft_turn",
          message: "Create a task for this dossier: Phase2 deterministic task",
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

    const output = result.output;
    assert.ok(output?.pendingAction, "Expected pending action to be created.");
    assert.equal(output?.pendingAction?.toolName, "proposeCreate");
    assert.equal(output?.pendingAction?.plan?.operation?.operation, "create");
    assert.equal(output?.pendingAction?.plan?.operation?.entityType, "task");
    assert.equal(output?.pendingAction?.plan?.operation?.payload?.dossier_id, 222);
    assert.equal(
      output?.pendingAction?.plan?.diagnostics?.linkResolution?.status,
      "resolved",
    );
    assert.equal(
      output?.pendingAction?.plan?.diagnostics?.linkResolution?.source,
      "draft_context",
    );

    const effects = output?.pendingAction?.plan?.uiPreview?.effects || [];
    assert.equal(
      effects.some((line) => String(line || "").toLowerCase().includes("resolved parent link")),
      true,
    );
  } finally {
    restore();
  }
});

test("phase2: create proposal preserves explicit parent link provenance from payload", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase2_tc_payload_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: {
              title: "Payload-scoped task",
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
        id: "phase2_payload_link_provenance",
        target: "loop_core",
        input: {
          sessionId: "phase2_payload_link_provenance_session",
          turnId: "phase2_payload_link_provenance_turn",
          message: "Create task in dossier 333",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output?.pendingAction, "Expected pending action to be created.");
    assert.equal(output?.pendingAction?.plan?.operation?.payload?.dossier_id, 333);
    assert.equal(
      output?.pendingAction?.plan?.diagnostics?.linkResolution?.status,
      "unchanged",
    );
    assert.equal(
      output?.pendingAction?.plan?.diagnostics?.linkResolution?.source,
      "payload",
    );
  } finally {
    restore();
  }
});

test("phase2: ambiguous parent candidates block proposal with explicit diagnostics", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase2_tc_ambiguous_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Ambiguous parent task" },
          },
        },
      ],
    },
    { text: "Please clarify the parent target." },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase2_ambiguous_link_detection",
        target: "loop_core",
        input: {
          sessionId: "phase2_ambiguous_link_detection_session",
          turnId: "phase2_ambiguous_link_detection_turn",
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

    const output = result.output;
    assert.equal(output?.pendingAction, null);
    const failed = (output?.toolCalls || []).find(
      (row) => row?.toolName === "proposeCreate" && row?.ok === false,
    );
    assert.ok(failed, "Expected failed proposeCreate tool call.");
    assert.equal(failed?.errorCode, "PLAN_LINK_RESOLUTION_AMBIGUOUS");
  } finally {
    restore();
  }
});

test("phase2: unresolved parent context blocks proposal deterministically", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase2_tc_unresolved_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Unresolved parent task" },
          },
        },
      ],
    },
    { text: "Please provide a parent dossier or lawsuit." },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase2_unresolved_link_detection",
        target: "loop_core",
        input: {
          sessionId: "phase2_unresolved_link_detection_session",
          turnId: "phase2_unresolved_link_detection_turn",
          message: "Create task Unresolved parent task",
          metadata: { security: { authScope: "execute" } },
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.equal(output?.pendingAction, null);
    const failed = (output?.toolCalls || []).find(
      (row) => row?.toolName === "proposeCreate" && row?.ok === false,
    );
    assert.ok(failed, "Expected failed proposeCreate tool call.");
    assert.equal(failed?.errorCode, "PLAN_LINK_RESOLUTION_UNRESOLVED");
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
