"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { groundCurrentMatter } = require("./liveMatterGrounding");

function createReadTool(map = {}) {
  return async (toolName, input) => {
    const handler = map[toolName];
    if (typeof handler !== "function") {
      throw new Error(`Unexpected tool call: ${toolName}`);
    }
    return handler(input || {});
  };
}

test("groundCurrentMatter resolves a single open dossier from client scope for create flows", async () => {
  const readTool = createReadTool({
    listDossiersForClient: async ({ clientId }) => ({
      dossiers: [
        { id: 87, title: "Divorce Case #2024-087", client_id: clientId, status: "open" },
        { id: 88, title: "Closed Matter", client_id: clientId, status: "closed" },
      ],
    }),
  });

  const result = await groundCurrentMatter({
    readTool,
    requestContext: {
      clientId: 12,
      resolvedEntity: { type: "client", id: 12 },
    },
    decision: {
      primaryRoute: { mode: "GOAL_FIRST" },
      goal: { targetEntityType: "lawsuit", intendedOperation: "create" },
    },
  });

  assert.equal(result.status, "resolved_single");
  assert.equal(result.groundedScope.entityType, "dossier");
  assert.equal(result.groundedScope.dossierId, 87);
  assert.equal(result.groundedScope.clientId, 12);
});

test("groundCurrentMatter resolves a single task from dossier scope for update flows", async () => {
  const readTool = createReadTool({
    listTasks: async ({ dossierId }) => ({
      tasks: [
        { id: 33, title: "Prepare filing", dossier_id: dossierId, status: "in_progress" },
      ],
    }),
  });

  const result = await groundCurrentMatter({
    readTool,
    requestContext: {
      dossierId: 87,
      resolvedEntity: { type: "dossier", id: 87 },
    },
    decision: {
      primaryRoute: { mode: "GOAL_FIRST" },
      goal: { targetEntityType: "task", intendedOperation: "update" },
    },
  });

  assert.equal(result.status, "resolved_single");
  assert.equal(result.groundedScope.entityType, "task");
  assert.equal(result.groundedScope.taskId, 33);
  assert.equal(result.groundedScope.dossierId, 87);
});

test("groundCurrentMatter asks for clarification when client scope has multiple open dossiers", async () => {
  const readTool = createReadTool({
    listDossiersForClient: async () => ({
      dossiers: [
        { id: 87, title: "Divorce Case #2024-087", status: "open" },
        { id: 91, title: "Child Support Matter", status: "open" },
      ],
    }),
  });

  const result = await groundCurrentMatter({
    readTool,
    requestContext: { clientId: 12, resolvedEntity: { type: "client", id: 12 } },
    decision: {
      primaryRoute: { mode: "CLARIFY" },
      goal: { targetEntityType: "lawsuit", intendedOperation: "create" },
    },
  });

  assert.equal(result.status, "resolved_multiple");
  assert.equal(result.entityType, "dossier");
  assert.equal(result.candidates.length, 2);
  assert.match(result.message, /multiple current dossiers/i);
});

test("groundCurrentMatter re-checks dossier scope and falls back to new-lawsuit guidance when no lawsuit exists", async () => {
  const readTool = createReadTool({
    listLawsuits: async () => ({ lawsuits: [] }),
  });

  const result = await groundCurrentMatter({
    readTool,
    requestContext: {
      clientId: 12,
      dossierId: 87,
      resolvedEntity: { type: "dossier", id: 87 },
    },
    decision: {
      primaryRoute: { mode: "GOAL_FIRST" },
      goal: { targetEntityType: "lawsuit", intendedOperation: "update" },
    },
  });

  assert.equal(result.status, "resolved_none");
  assert.equal(result.entityType, "lawsuit");
  assert.equal(result.parentScope.entityType, "dossier");
  assert.equal(result.parentScope.dossierId, 87);
  assert.match(result.message, /prepare a new one/i);
});

test("groundCurrentMatter uses exact personal task scope without extra reads", async () => {
  let callCount = 0;
  const readTool = async () => {
    callCount += 1;
    return { personalTasks: [] };
  };

  const result = await groundCurrentMatter({
    readTool,
    requestContext: {
      personalTaskId: 14,
      resolvedEntity: { type: "personal_task", id: 14 },
    },
    decision: {
      primaryRoute: { mode: "GOAL_FIRST" },
      goal: { targetEntityType: "personal_task", intendedOperation: "update" },
    },
  });

  assert.equal(result.status, "resolved_single");
  assert.equal(result.groundedScope.entityType, "personal_task");
  assert.equal(result.groundedScope.personalTaskId, 14);
  assert.equal(callCount, 0);
});

test("groundCurrentMatter resolves parent personal task for financial entry creation", async () => {
  const readTool = createReadTool({
    listFinancialEntries: async () => ({ financialEntries: [] }),
  });

  const result = await groundCurrentMatter({
    readTool,
    requestContext: {
      personalTaskId: 14,
      resolvedEntity: { type: "personal_task", id: 14 },
    },
    decision: {
      primaryRoute: { mode: "GOAL_FIRST" },
      goal: { targetEntityType: "financial_entry", intendedOperation: "create" },
    },
  });

  assert.equal(result.status, "resolved_single");
  assert.equal(result.groundedScope.entityType, "personal_task");
  assert.equal(result.groundedScope.personalTaskId, 14);
});
