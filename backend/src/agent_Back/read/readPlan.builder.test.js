"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { buildReadPlan } = require("./readPlan.builder");

test("buildReadPlan: client lawsuits list uses depth=2", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_LAWSUITS" },
    requestContext: { clientId: 14 },
    activeScope: { entityType: "client", entityId: 14 },
  });

  assert.equal(plan?.toolName, "getEntityGraph");
  assert.deepEqual(plan?.toolInput, {
    entityType: "client",
    entityId: 14,
    depth: 2,
    include: ["lawsuits"],
  });
  assert.equal(plan?.renderHint?.listCategory, "lawsuits");
});

test("buildReadPlan: dossier scope lawsuits list prefers dossier depth=1", () => {
  const plan = buildReadPlan({
    intent: { intent: "LIST_LAWSUITS" },
    requestContext: { clientId: 14, dossierId: 33 },
    activeScope: { entityType: "dossier", entityId: 33 },
  });

  assert.equal(plan?.toolName, "getEntityGraph");
  assert.deepEqual(plan?.toolInput, {
    entityType: "dossier",
    entityId: 33,
    depth: 1,
    include: ["lawsuits"],
  });
  assert.equal(plan?.renderHint?.listCategory, "lawsuits");
});

