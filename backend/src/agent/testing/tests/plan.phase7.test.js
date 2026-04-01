"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

const DOCUMENT_DRAFT_SOURCE_TOKEN = "__agent_current_draft__";
const DOCUMENT_DRAFT_SNAPSHOT_KEY = "_agentDraftSnapshot";
const DOCUMENT_DRAFT_PROVENANCE_KEY = "_agentDraftProvenance";

test("phase7: workflow confirmation emits mutation sync events for successful steps", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime?.loop;
  const entityExecutor = loop?.entityExecutor;
  if (!entityExecutor || typeof entityExecutor.execute !== "function") {
    throw new Error("Expected runtime.loop.entityExecutor.execute to be available.");
  }

  const restoreExecute = patchMethod(entityExecutor, "execute", async () => ({
    ok: true,
    result: {
      operation: "update",
      entityType: "client",
      entityId: 7001,
    },
    stepResults: [
      {
        stepId: "wf_close_task_1",
        ok: true,
        actionType: "UPDATE_ENTITY",
        params: { entityType: "task", entityId: 8001, changes: { status: "done" } },
        result: {
          ok: true,
          operation: "update",
          entityType: "task",
          entityId: 8001,
          after: { id: 8001, client_id: 7001 },
        },
      },
      {
        stepId: "wf_set_client_inactive",
        ok: true,
        actionType: "UPDATE_ENTITY",
        params: { entityType: "client", entityId: 7001, changes: { status: "inactive" } },
        result: {
          ok: true,
          operation: "update",
          entityType: "client",
          entityId: 7001,
          after: { id: 7001, status: "inactive" },
        },
      },
    ],
  }));

  try {
    const result = await runScenario(
      {
        id: "phase7_workflow_mutation_events_success",
        target: "sse_handler",
        input: {
          sessionId: "phase7_workflow_mutation_events_success_session",
          turnId: "phase7_workflow_mutation_events_success_turn",
          message: "yes, confirm",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase7_user_execute", scope: "execute" },
        preSession(session) {
          session.state.pendingAction = {
            id: "pending_phase7_workflow_success_1",
            toolName: "proposeUpdate",
            summary: "Set client inactive with workflow",
            args: { entityType: "client", entityId: 7001, changes: { status: "inactive" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 7001,
                changes: { status: "inactive" },
              },
              rootOperation: {
                operation: "update",
                entityType: "client",
                entityId: 7001,
                changes: { status: "inactive" },
              },
              diagnostics: {
                linkResolution: {
                  status: "resolved",
                  source: "active_entities",
                },
              },
              workflowSteps: [
                { id: "wf_close_task_1", actionType: "UPDATE_ENTITY", entityType: "task", entityId: 8001 },
                {
                  id: "wf_set_client_inactive",
                  actionType: "UPDATE_ENTITY",
                  entityType: "client",
                  entityId: 7001,
                  dependsOn: ["wf_close_task_1"],
                },
              ],
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase7_prev_turn",
            risk: "high",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const mutationEvents = result.events
      .filter((event) => event.event === "entity_mutation_success")
      .map((event) => toRecord(toRecord(event.data)?.event))
      .filter(Boolean);

    assert.equal(mutationEvents.length, 2, "Expected one mutation event per successful workflow step.");
    assert.deepEqual(
      mutationEvents.map((event) => event.entityType),
      ["task", "client"],
    );
    assert.deepEqual(
      mutationEvents.map((event) => event.operation),
      ["update", "update"],
    );
    assert.equal(mutationEvents[0]?.linking?.sourceTrace, "fallback");
    assert.equal(mutationEvents[0]?.linking?.resolutionStatus, "resolved");
    assert.ok(
      Array.isArray(mutationEvents[0]?.linking?.parentLinks),
      "Expected linking.parentLinks on workflow mutation event.",
    );
    assert.equal(mutationEvents[1]?.linking?.sourceTrace, "fallback");
  } finally {
    restoreExecute?.();
  }
});

test("phase7: failed workflow still emits mutation sync events for successful steps", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime?.loop;
  const entityExecutor = loop?.entityExecutor;
  if (!entityExecutor || typeof entityExecutor.execute !== "function") {
    throw new Error("Expected runtime.loop.entityExecutor.execute to be available.");
  }

  const restoreExecute = patchMethod(entityExecutor, "execute", async () => ({
    ok: false,
    errorCode: "WORKFLOW_STEP_FAILED",
    errorMessage: "Workflow halted at client update.",
    failedStepId: "wf_set_client_inactive",
    stepResults: [
      {
        stepId: "wf_close_task_1",
        ok: true,
        actionType: "UPDATE_ENTITY",
        params: { entityType: "task", entityId: 8101, changes: { status: "done" } },
        result: {
          ok: true,
          operation: "update",
          entityType: "task",
          entityId: 8101,
          after: { id: 8101, client_id: 7101 },
        },
      },
      {
        stepId: "wf_set_client_inactive",
        ok: false,
        actionType: "UPDATE_ENTITY",
        params: { entityType: "client", entityId: 7101, changes: { status: "inactive" } },
        result: {
          ok: false,
          operation: "update",
          entityType: "client",
          entityId: 7101,
        },
        errorCode: "DOMAIN_RULE_VIOLATION",
        errorMessage: "Client has unresolved open children.",
      },
    ],
  }));

  try {
    const result = await runScenario(
      {
        id: "phase7_workflow_mutation_events_partial_failure",
        target: "sse_handler",
        input: {
          sessionId: "phase7_workflow_mutation_events_partial_failure_session",
          turnId: "phase7_workflow_mutation_events_partial_failure_turn",
          message: "yes, confirm",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase7_user_execute", scope: "execute" },
        preSession(session) {
          session.state.pendingAction = {
            id: "pending_phase7_workflow_partial_failure_1",
            toolName: "proposeUpdate",
            summary: "Set client inactive with workflow",
            args: { entityType: "client", entityId: 7101, changes: { status: "inactive" } },
            plan: {
              operation: {
                operation: "update",
                entityType: "client",
                entityId: 7101,
                changes: { status: "inactive" },
              },
              rootOperation: {
                operation: "update",
                entityType: "client",
                entityId: 7101,
                changes: { status: "inactive" },
              },
              diagnostics: {
                linkResolution: {
                  status: "resolved",
                  source: "active_entities",
                },
              },
              workflowSteps: [
                { id: "wf_close_task_1", actionType: "UPDATE_ENTITY", entityType: "task", entityId: 8101 },
                {
                  id: "wf_set_client_inactive",
                  actionType: "UPDATE_ENTITY",
                  entityType: "client",
                  entityId: 7101,
                  dependsOn: ["wf_close_task_1"],
                },
              ],
            },
            createdAt: new Date().toISOString(),
            requestedByTurnId: "phase7_prev_turn",
            risk: "high",
          };
        },
      },
      { runtime, skipAssertions: true },
    );

    const mutationEvents = result.events
      .filter((event) => event.event === "entity_mutation_success")
      .map((event) => toRecord(toRecord(event.data)?.event))
      .filter(Boolean);

    assert.equal(mutationEvents.length, 1, "Only successful steps should emit mutation sync events.");
    assert.equal(mutationEvents[0].entityType, "task");
    assert.equal(mutationEvents[0].entityId, 8101);
    assert.equal(mutationEvents[0].operation, "update");
    assert.equal(mutationEvents[0]?.linking?.sourceTrace, "fallback");
    assert.equal(mutationEvents[0]?.linking?.resolutionStatus, "resolved");

    const planExecutedEvent = result.events.find((event) => event.event === "plan_executed");
    const artifact = toRecord(toRecord(planExecutedEvent?.data)?.artifact);
    assert.equal(artifact?.ok, false);
    assert.equal(artifact?.failedStepId, "wf_set_client_inactive");
  } finally {
    restoreExecute?.();
  }
});

test("phase7 regression: create task without parent fails at PLAN", async () => {
  const runtime = createLiveRuntime();
  const result = await executeProposeCreate(runtime, {
    entityType: "task",
    payload: { title: "Phase7 missing parent task" },
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(
    String(result?.errorMessage || ""),
    /either dossier_id .* or lawsuit_id/i,
  );
});

test("phase7 regression: create document without file and link fails at PLAN", async () => {
  const runtime = createLiveRuntime();
  const result = await executeProposeCreate(runtime, {
    entityType: "document",
    payload: { title: "Phase7 invalid document create" },
  });

  assert.equal(result?.ok, false);
  assert.equal(result?.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(result?.errorMessage || ""), /parent reference|file_path|generation source/i);
});

test("phase7 regression: save draft with linked entity persists in correct parent scope", async () => {
  const runtime = createLiveRuntime();
  const clientsService = require("../../../services/clients.service");
  const documentsService = require("../../../services/documents.service");

  const parentClient = clientsService.create({
    name: `Phase7 Linked Parent Client ${Date.now()}`,
  });
  const parentClientId = Number(parentClient?.id);
  assert.ok(Number.isInteger(parentClientId) && parentClientId > 0);

  const sessionId = `phase7_linked_document_save_${Date.now()}`;
  const turnId = `phase7_linked_document_save_turn_${Date.now()}`;
  const result = await runScenario(
    {
      id: "phase7_linked_document_save",
      target: "loop_core",
      input: {
        sessionId,
        turnId,
        message: "yes, confirm",
        metadata: { security: { authScope: "execute" } },
      },
      preSession(session) {
        session.state.pendingAction = {
          id: "pending_phase7_linked_document_save",
          toolName: "proposeCreate",
          summary: "Save draft as linked document",
          args: {
            entityType: "document",
            payload: {
              title: "Phase7 Linked Draft Document",
              client_id: parentClientId,
              generation_uid: DOCUMENT_DRAFT_SOURCE_TOKEN,
              [DOCUMENT_DRAFT_SNAPSHOT_KEY]: makeDraft({
                title: "Phase7 Linked Draft Document",
                linkedEntityType: "client",
                linkedEntityId: parentClientId,
                version: 7,
              }),
              [DOCUMENT_DRAFT_PROVENANCE_KEY]: {
                sessionId,
                sourceTurnId: "phase7_source_turn",
                draftVersion: 7,
              },
            },
          },
          plan: {
            operation: {
              operation: "create",
              entityType: "document",
              payload: {
                title: "Phase7 Linked Draft Document",
                client_id: parentClientId,
                generation_uid: DOCUMENT_DRAFT_SOURCE_TOKEN,
                [DOCUMENT_DRAFT_SNAPSHOT_KEY]: makeDraft({
                  title: "Phase7 Linked Draft Document",
                  linkedEntityType: "client",
                  linkedEntityId: parentClientId,
                  version: 7,
                }),
                [DOCUMENT_DRAFT_PROVENANCE_KEY]: {
                  sessionId,
                  sourceTurnId: "phase7_source_turn",
                  draftVersion: 7,
                },
              },
            },
          },
          createdAt: new Date().toISOString(),
          requestedByTurnId: "phase7_source_turn",
          risk: "medium",
        };
      },
    },
    { runtime, skipAssertions: true },
  );

  assert.equal(result?.output?.turnType, "CONFIRMATION");
  assert.equal(result?.output?.metadata?.confirmedExecutionResult?.ok, true);

  const entityId = result?.output?.metadata?.confirmedExecutionResult?.data?.entityId;
  assert.ok(entityId, "Expected created document entityId in execution result.");

  const created = documentsService.get(Number(entityId));
  assert.ok(created, "Expected created document record.");
  assert.equal(Number(created.client_id), parentClientId);
  assert.equal(typeof created.file_path, "string");
  assert.equal(fs.existsSync(created.file_path), true);
});

test("phase7 regression: ambiguous 'save this document' forces disambiguation", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase7_ambiguous_document_save_1",
          name: "proposeCreate",
          arguments: {
            entityType: "document",
            payload: {
              title: "Phase7 Ambiguous Save",
            },
          },
        },
      ],
    },
  ]);

  try {
    const result = await runScenario(
      {
        id: "phase7_ambiguous_document_save",
        target: "loop_core",
        input: {
          sessionId: "phase7_ambiguous_document_save_session",
          turnId: "phase7_ambiguous_document_save_turn",
          message: "Save this document",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.activeEntities = [
            {
              type: "dossier",
              id: 42,
              label: "D-42",
              sourceTool: "getEntityGraph",
              lastMentionedAt: new Date().toISOString(),
            },
            {
              type: "dossier",
              id: 52,
              label: "D-52",
              sourceTool: "getEntityGraph",
              lastMentionedAt: new Date().toISOString(),
            },
          ];
        },
      },
      { runtime, skipAssertions: true },
    );

    assert.equal(result?.output?.pendingAction, null);
    assert.match(String(result?.output?.responseText || ""), /multiple parent targets/i);
    assert.match(String(result?.output?.responseText || ""), /D-42|D-52/i);

    const failed = (result?.output?.toolCalls || []).find(
      (row) => row?.toolName === "proposeCreate" && row?.ok === false,
    );
    assert.ok(failed, "Expected failed proposeCreate tool call.");
    assert.equal(failed?.errorCode, "PLAN_LINK_RESOLUTION_AMBIGUOUS");
  } finally {
    restore?.();
  }
});

test("phase7 regression: deterministic resolver picks same target for same context", async () => {
  const runtime = createLiveRuntime();
  const restore = scriptModel(runtime, [
    {
      toolCalls: [
        {
          id: "phase7_deterministic_link_1",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Phase7 Deterministic Task" },
          },
        },
      ],
    },
    {
      toolCalls: [
        {
          id: "phase7_deterministic_link_2",
          name: "proposeCreate",
          arguments: {
            entityType: "task",
            payload: { title: "Phase7 Deterministic Task" },
          },
        },
      ],
    },
  ]);

  try {
    const first = await runScenario(
      {
        id: "phase7_deterministic_linking_first",
        target: "loop_core",
        input: {
          sessionId: "phase7_deterministic_linking_first_session",
          turnId: "phase7_deterministic_linking_first_turn",
          message: "Create task for this context",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.activeEntities = [
            {
              type: "dossier",
              id: 777,
              label: "D-777",
              sourceTool: "getEntityGraph",
              lastMentionedAt: new Date().toISOString(),
            },
          ];
        },
      },
      { runtime, skipAssertions: true },
    );

    const second = await runScenario(
      {
        id: "phase7_deterministic_linking_second",
        target: "loop_core",
        input: {
          sessionId: "phase7_deterministic_linking_second_session",
          turnId: "phase7_deterministic_linking_second_turn",
          message: "Create task for this context",
          metadata: { security: { authScope: "execute" } },
        },
        preSession(session) {
          session.activeEntities = [
            {
              type: "dossier",
              id: 777,
              label: "D-777",
              sourceTool: "getEntityGraph",
              lastMentionedAt: new Date().toISOString(),
            },
          ];
        },
      },
      { runtime, skipAssertions: true },
    );

    const firstPayload = first?.output?.pendingAction?.plan?.operation?.payload || {};
    const secondPayload = second?.output?.pendingAction?.plan?.operation?.payload || {};
    assert.equal(firstPayload.dossier_id, 777);
    assert.equal(secondPayload.dossier_id, 777);
    assert.equal(firstPayload.dossier_id, secondPayload.dossier_id);

    const firstResolution = first?.output?.pendingAction?.plan?.diagnostics?.linkResolution;
    const secondResolution = second?.output?.pendingAction?.plan?.diagnostics?.linkResolution;
    assert.equal(firstResolution?.status, "resolved");
    assert.equal(secondResolution?.status, "resolved");
    assert.equal(firstResolution?.source, "active_entities");
    assert.equal(secondResolution?.source, "active_entities");
  } finally {
    restore?.();
  }
});

function executeProposeCreate(runtime, args) {
  const tool = runtime?.loop?.registry?.get?.("proposeCreate");
  assert.ok(tool, "Expected proposeCreate tool to be available.");
  return runtime.loop.executor.execute(
    tool,
    {
      sessionId: `phase7_plan_validation_session_${Date.now()}`,
      turnId: `phase7_plan_validation_turn_${Date.now()}`,
      metadata: { security: { authScope: "execute" } },
    },
    args,
  );
}

function makeDraft({ title, linkedEntityType, linkedEntityId, version }) {
  return {
    draftType: "client_letter",
    title,
    sections: [
      { id: "sec_1", role: "heading", text: "Subject: Follow-up" },
      { id: "sec_2", role: "body", text: "This is a deterministic phase7 draft body." },
      { id: "sec_3", role: "closing", text: "Best regards" },
    ],
    layout: {
      direction: "ltr",
      language: "en",
      formality: "formal",
      documentClass: "client_letter",
    },
    content: "Subject: Follow-up\n\nThis is a deterministic phase7 draft body.\n\nBest regards",
    linkedEntityType,
    linkedEntityId,
    generatedAt: new Date().toISOString(),
    version,
  };
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

function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
