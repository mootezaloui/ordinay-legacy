"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const tool = require("./proposeEntityMutation.tool");

test("propose_entity_mutation tool is proposal-only and not directly executable without explicit command flag", async () => {
  assert.equal(tool.name, "propose_entity_mutation");
  assert.equal(tool.category, "plan");
  assert.equal(tool.sideEffects, false);

  await assert.rejects(
    () =>
      tool.handler({
        entityType: "task",
        entityId: "123",
        operation: "update",
        payload: { status: "completed" },
        reasoningSummary: "User explicitly requested completion.",
      }, {}),
    (error) => {
      assert.equal(error.code, "EXPLICIT_MUTATION_COMMAND_REQUIRED");
      return true;
    },
  );
});

test("propose_entity_mutation tool file does not use direct DB access", () => {
  const filePath = path.resolve(__dirname, "proposeEntityMutation.tool.js");
  const source = fs.readFileSync(filePath, "utf8");
  assert.equal(source.includes("db/connection"), false);
  assert.equal(source.includes("db.prepare("), false);
  assert.equal(source.includes("db.transaction("), false);
});
