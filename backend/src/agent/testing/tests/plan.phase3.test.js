"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

const DOCUMENT_DRAFT_SOURCE_TOKEN = "__agent_current_draft__";
const DOCUMENT_DRAFT_SNAPSHOT_KEY = "_agentDraftSnapshot";
const DOCUMENT_DRAFT_PROVENANCE_KEY = "_agentDraftProvenance";

test("phase3: document proposal auto-attaches current draft storage source", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase3_tc_document_bridge_1",
          name: "proposeCreate",
          arguments: {
            entityType: "document",
            payload: {
              title: "Phase3 Draft Save",
              dossier_id: 909,
            },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase3_document_storage_bridge",
        target: "loop_core",
        input: {
          sessionId: "phase3_document_storage_bridge_session",
          turnId: "phase3_document_storage_bridge_turn",
          message: "Save this draft to dossier 909",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.currentDraft = makeDraft({
            title: "Phase3 Draft Letter",
            linkedEntityType: "dossier",
            linkedEntityId: 909,
            version: 3,
          });
        },
      },
      { runtime, skipAssertions: true },
    );

    const output = result.output;
    assert.ok(output?.pendingAction, "Expected pending action from proposeCreate.");
    const payload = output?.pendingAction?.plan?.operation?.payload || {};
    assert.equal(payload.generation_uid, DOCUMENT_DRAFT_SOURCE_TOKEN);
    assert.equal(payload?.[DOCUMENT_DRAFT_SNAPSHOT_KEY]?.title, "Phase3 Draft Letter");
    assert.equal(payload?.[DOCUMENT_DRAFT_PROVENANCE_KEY]?.sessionId, "phase3_document_storage_bridge_session");
    assert.equal(payload?.[DOCUMENT_DRAFT_PROVENANCE_KEY]?.sourceTurnId, "phase3_document_storage_bridge_turn");
    assert.equal(payload?.[DOCUMENT_DRAFT_PROVENANCE_KEY]?.draftVersion, 3);
  } finally {
    restore();
  }
});

test("phase3: confirm materializes draft into document file and persists provenance", async () => {
  const runtime = createLiveRuntime();
  const sessionId = "phase3_confirm_document_session";
  const pendingActionId = "pending_phase3_confirm_document";
  const clientsService = require("../../../services/clients.service");
  const parentClient = clientsService.create({
    name: `Phase3 Parent Client ${Date.now()}`,
  });
  const parentClientId = Number(parentClient?.id);
  assert.ok(Number.isInteger(parentClientId) && parentClientId > 0);

  const result = await runScenario(
    {
      id: "phase3_confirm_document_materialization",
      target: "loop_core",
      input: {
        sessionId,
        turnId: "phase3_confirm_document_turn",
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      preSession(session) {
        session.state.pendingAction = {
          id: pendingActionId,
          toolName: "proposeCreate",
          summary: "Create document from current draft",
          args: {
            entityType: "document",
            payload: {
              title: "Phase3 Confirmed Draft Document",
              client_id: parentClientId,
              generation_uid: DOCUMENT_DRAFT_SOURCE_TOKEN,
              [DOCUMENT_DRAFT_SNAPSHOT_KEY]: makeDraft({
                title: "Phase3 Confirmed Draft Document",
                linkedEntityType: "client",
                linkedEntityId: parentClientId,
                version: 4,
              }),
              [DOCUMENT_DRAFT_PROVENANCE_KEY]: {
                sessionId,
                sourceTurnId: "phase3_source_turn",
                draftVersion: 4,
              },
            },
          },
          plan: {
            operation: {
              operation: "create",
              entityType: "document",
              payload: {
                title: "Phase3 Confirmed Draft Document",
                client_id: parentClientId,
                generation_uid: DOCUMENT_DRAFT_SOURCE_TOKEN,
                [DOCUMENT_DRAFT_SNAPSHOT_KEY]: makeDraft({
                  title: "Phase3 Confirmed Draft Document",
                  linkedEntityType: "client",
                  linkedEntityId: parentClientId,
                  version: 4,
                }),
                [DOCUMENT_DRAFT_PROVENANCE_KEY]: {
                  sessionId,
                  sourceTurnId: "phase3_source_turn",
                  draftVersion: 4,
                },
              },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase3_source_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  assert.equal(result.output?.turnType, "CONFIRMATION");
  assert.equal(result.output?.pendingAction, null);
  assert.equal(result.output?.metadata?.confirmedExecutionResult?.ok, true);

  const entityId = result.output?.metadata?.confirmedExecutionResult?.data?.entityId;
  assert.ok(entityId, "Expected created document entityId in execution result.");

  const documentsService = require("../../../services/documents.service");
  const created = documentsService.get(Number(entityId));
  assert.ok(created, "Expected created document record.");
  assert.equal(typeof created.file_path, "string");
  assert.equal(fs.existsSync(created.file_path), true, "Expected rendered document file to exist.");

  const artifact = safeParse(created.artifact_json);
  assert.equal(artifact?.draft_provenance?.source, "agent_session_draft");
  assert.equal(artifact?.draft_provenance?.session_id, sessionId);
  assert.equal(artifact?.draft_provenance?.source_turn_id, "phase3_source_turn");
  assert.equal(artifact?.draft_provenance?.draft_version, 4);
});

function makeDraft({ title, linkedEntityType, linkedEntityId, version }) {
  return {
    draftType: "client_letter",
    title,
    sections: [
      { id: "sec_1", role: "heading", text: "Subject: Follow-up" },
      { id: "sec_2", role: "body", text: "This is a phase3 deterministic draft body." },
      { id: "sec_3", role: "closing", text: "Best regards" },
    ],
    layout: {
      direction: "ltr",
      language: "en",
      formality: "formal",
      documentClass: "client_letter",
    },
    content: "Subject: Follow-up\n\nThis is a phase3 deterministic draft body.\n\nBest regards",
    linkedEntityType,
    linkedEntityId,
    generatedAt: new Date().toISOString(),
    version,
  };
}

function safeParse(value) {
  try {
    return JSON.parse(String(value || "{}"));
  } catch {
    return {};
  }
}

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
