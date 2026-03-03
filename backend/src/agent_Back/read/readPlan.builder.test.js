"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildReadPlan } = require("./readPlan.builder");

test("LIST_TASKS with no scope builds deterministic direct listTasks plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_TASKS" },
    requestContext: {},
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "listTasks");
  assert.equal(plan.executionMode, "direct");
  assert.deepEqual(plan.renderHint, { listCategory: "tasks" });
});

test("LIST_TASKS with dossier scope builds graph plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_TASKS" },
    requestContext: { dossierId: 55 },
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "getEntityGraph");
  assert.equal(plan.executionMode, "graph");
  assert.equal(plan.toolInput.entityType, "dossier");
  assert.equal(plan.toolInput.entityId, 55);
  assert.deepEqual(plan.toolInput.include, ["tasks"]);
});

test("READ_TASK with no scope still returns null", () => {
  const plan = buildReadPlan({
    intent: { intent: "READ_TASK" },
    requestContext: {},
    activeScope: null,
  });
  assert.equal(plan, null);
});

test("LIST_CLIENTS with no scope builds direct listClients plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_CLIENTS" },
    requestContext: {},
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "listClients");
  assert.equal(plan.executionMode, "direct");
});

test("LIST_LAWSUITS with client scope builds graph plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_LAWSUITS" },
    requestContext: { clientId: 7 },
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "getEntityGraph");
  assert.equal(plan.executionMode, "graph");
  assert.equal(plan.toolInput.entityType, "client");
  assert.equal(plan.toolInput.entityId, 7);
});

test("LIST_LAWSUITS with no scope builds direct listLawsuits plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_LAWSUITS" },
    requestContext: {},
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "listLawsuits");
  assert.equal(plan.executionMode, "direct");
});

test("LIST_DOSSIERS with no scope builds direct listDossiers plan", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_DOSSIERS" },
    requestContext: {},
    activeScope: null,
  });
  assert.ok(plan);
  assert.equal(plan.toolName, "listDossiers");
  assert.equal(plan.executionMode, "direct");
});
