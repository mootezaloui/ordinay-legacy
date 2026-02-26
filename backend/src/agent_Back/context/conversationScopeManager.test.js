"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const OperationalContextStore = require("./operational.context");
const { ConversationScopeManager } = require("./conversationScopeManager");

function buildHarness() {
  const operationalStore = new OperationalContextStore();
  const ledgerEvents = [];
  const manager = new ConversationScopeManager({
    contextStore: { _operationalStore: operationalStore },
    ledger: { record: (e) => ledgerEvents.push(e) },
  });
  const requestContext = {
    conversationId: "conv:test:1",
    sessionId: "conv:test:1",
    userId: "user-1",
  };
  return { manager, operationalStore, ledgerEvents, requestContext };
}

test("explicit entity selection sets active scope and dedupes adjacent history", () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "ENTITY_SELECTED_EXPLICIT",
    entityType: "dossier",
    entityId: 12,
    source: "explicit",
    resolutionPath: "explicit_selection",
  });
  manager.applyEvent(requestContext, {
    type: "ENTITY_SELECTED_EXPLICIT",
    entityType: "dossier",
    entityId: 12,
    source: "explicit",
    resolutionPath: "explicit_selection",
  });

  const scope = manager.getScope(requestContext);
  assert.equal(scope.activeScope.entityType, "dossier");
  assert.equal(scope.activeScope.entityId, 12);
  assert.equal(scope.activeScope.source, "explicit");
  assert.equal(scope.activeScope.confidence, 1);
  assert.equal(scope.history.length, 1);
});

test("ambiguous read does not overwrite active scope", () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "client",
    entityId: 4,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  manager.applyEvent(requestContext, { type: "READ_AMBIGUOUS" });
  const scope = manager.getScope(requestContext);
  assert.equal(scope.activeScope.entityType, "client");
  assert.equal(scope.activeScope.entityId, 4);
});

test("confirmed delete clears active scope when deleting active entity", () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "MUTATION_CONFIRMED_UPDATE",
    entityType: "task",
    entityId: 99,
    source: "mutation",
    resolutionPath: "confirmed_mutation_result",
  });
  manager.applyEvent(requestContext, {
    type: "MUTATION_CONFIRMED_DELETE",
    entityType: "task",
    entityId: 99,
  });
  const scope = manager.getScope(requestContext);
  assert.equal(scope.activeScope, null);
  assert.equal(scope.history.length, 1);
});

test("projectScopeToRequestContext mirrors typed scope into request context", () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "lawsuit",
    entityId: 31,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  const out = {};
  manager.projectScopeToRequestContext({
    requestContext: out,
    llmHistory: { conversationScope: manager.getScope(requestContext) },
  });
  assert.equal(out.lawsuitId, 31);
  assert.equal(out.activeEntity.type, "lawsuit");
  assert.equal(out.activeEntity.id, 31);
});

test("binding injection fills missing create parent from compatible active scope", async () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "dossier",
    entityId: 77,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  const result = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "task",
      entityId: "new",
      operation: "create",
      payload: { title: "Call client" },
      reasoningSummary: "Create a task",
    },
    requestContext,
    executionContext: requestContext,
  });
  assert.equal(result.proposalInput.payload.dossier_id, 77);
  assert.equal(result.proposalInput.parent.entityType, "dossier");
  assert.equal(result.bindingAudit.applied, true);
  assert.equal(result.bindingAudit.reasonCode, "scope_parent_injected");
});

test("binding injection never overrides explicit parent or explicit payload FK", async () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "dossier",
    entityId: 77,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });

  const explicitParent = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "task",
      entityId: "new",
      operation: "create",
      parent: { entityType: "lawsuit", entityId: 55, source: "explicit" },
      payload: { title: "Task" },
      reasoningSummary: "Create task",
    },
    requestContext,
    executionContext: requestContext,
  });
  assert.equal(explicitParent.proposalInput.parent.entityId, 55);
  assert.equal(explicitParent.bindingAudit.applied, false);

  const explicitFk = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "task",
      entityId: "new",
      operation: "create",
      payload: { title: "Task", lawsuit_id: 88 },
      reasoningSummary: "Create task",
    },
    requestContext,
    executionContext: requestContext,
  });
  assert.equal(explicitFk.proposalInput.payload.lawsuit_id, 88);
  assert.equal(explicitFk.bindingAudit.applied, false);
});

test("incompatible active scope does not auto-bind", async () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "client",
    entityId: 8,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  const result = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "session",
      entityId: "new",
      operation: "create",
      payload: { title: "Hearing", scheduled_at: "2026-02-28T10:00:00Z" },
      reasoningSummary: "Create session",
    },
    requestContext,
    executionContext: requestContext,
  });
  assert.equal(result.bindingAudit.applied, false);
  assert.equal(result.bindingAudit.decision, "skipped");
});

test("legacy enricher single-candidate remap is wrapped and audited", async () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "client",
    entityId: 9,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  const result = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "lawsuit",
      entityId: "new",
      operation: "create",
      payload: { title: "New lawsuit" },
      reasoningSummary: "Create lawsuit",
    },
    requestContext,
    executionContext: requestContext,
    legacyEnricher: async (input) => ({
      ...input,
      parent: { entityType: "dossier", entityId: 101, source: "context_inferred_from_client" },
      payload: { ...(input.payload || {}), dossier_id: 101 },
    }),
  });
  assert.equal(result.proposalInput.payload.dossier_id, 101);
  assert.equal(result.bindingAudit.applied, true);
  assert.equal(result.bindingAudit.reasonCode, "legacy_scope_enricher_applied");
});

test("legacy enricher clarify propagates deterministic clarification", async () => {
  const { manager, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "client",
    entityId: 9,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  const result = await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "lawsuit",
      entityId: "new",
      operation: "create",
      payload: { title: "New lawsuit" },
      reasoningSummary: "Create lawsuit",
    },
    requestContext,
    executionContext: requestContext,
    legacyEnricher: async () => {
      const err = new Error("Multiple dossiers found");
      err.code = "PARENT_CONTEXT_DOSSIER_AMBIGUOUS";
      throw err;
    },
  });
  assert.equal(result.bindingAudit.decision, "clarify");
  assert.equal(result.clarification.code, "PARENT_CONTEXT_DOSSIER_AMBIGUOUS");
});

test("scope manager mirrors activeScope into legacy activeEntity in operational context", () => {
  const { manager, operationalStore, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "MUTATION_CONFIRMED_CREATE",
    entityType: "document",
    entityId: 501,
    source: "mutation",
    resolutionPath: "confirmed_mutation_result",
  });
  const stored = operationalStore.get("user-1", "conv:test:1");
  assert.equal(stored.activeEntity.type, "document");
  assert.equal(stored.activeEntity.id, 501);
  assert.equal(stored.conversationScope.activeScope.entityId, 501);
});

test("ledger receives scope update and binding decision logs", async () => {
  const { manager, ledgerEvents, requestContext } = buildHarness();
  manager.applyEvent(requestContext, {
    type: "READ_ENTITY_UNAMBIGUOUS",
    entityType: "dossier",
    entityId: 11,
    source: "show_command",
    resolutionPath: "tool_single_entity",
  });
  await manager.resolveBindingsForProposalInput({
    proposalInput: {
      entityType: "task",
      entityId: "new",
      operation: "create",
      payload: { title: "Task" },
      reasoningSummary: "Create task",
    },
    requestContext,
    executionContext: requestContext,
  });
  assert.equal(ledgerEvents.some((e) => e.type === "scope_update_event"), true);
  assert.equal(ledgerEvents.some((e) => e.type === "scope_binding_decision"), true);
});
