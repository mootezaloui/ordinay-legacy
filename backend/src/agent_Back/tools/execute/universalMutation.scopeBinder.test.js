"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const universalMutationTool = require("./universalMutation.tool");

function createInput(payload) {
  return {
    operation: "CREATE_ENTITY",
    params: {
      entityType: "task",
      payload,
      reason: "Create task from chat",
    },
  };
}

test("create task binds dossier scope and does not ask for dossier_id", async () => {
  const result = await universalMutationTool.handler(
    createInput({ title: "Prepare brief" }),
    { dossierId: 10, sessionId: "s1" },
  );

  assert.equal(result?.params?.payload?.dossier_id, 10);
  assert.equal(result?.params?.payload?.lawsuit_id, undefined);
});

test("create task binds lawsuit scope and prefers lawsuit_id over dossier_id", async () => {
  const result = await universalMutationTool.handler(
    createInput({ title: "Prepare exhibits" }),
    { dossierId: 10, lawsuitId: 7, sessionId: "s2" },
  );

  assert.equal(result?.params?.payload?.lawsuit_id, 7);
  assert.equal(result?.params?.payload?.dossier_id, undefined);
});

test("create task without scope asks for references, not raw fk names", async () => {
  await assert.rejects(
    () =>
      universalMutationTool.handler(
        createInput({ title: "Call witness" }),
        { sessionId: "s3" },
      ),
    (error) => {
      assert.equal(error?.code, "MUTATION_SCOPE_BINDING_REQUIRED");
      assert.match(
        String(error?.message || ""),
        /dossier reference or a lawsuit reference/i,
      );
      assert.doesNotMatch(String(error?.message || ""), /dossier_id/i);
      assert.doesNotMatch(String(error?.message || ""), /lawsuit_id/i);
      return true;
    },
  );
});
