"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { evaluateMutationGovernance } = require("./mutation.governance");

test("goal-first lawsuit creation preflight does not block on UIS-defaulted structural fields", async () => {
  const result = await evaluateMutationGovernance({
    userMessage:
      "create lawsuit from: we did not find a solution with his wife, we are going to go for a lawsuit for the kids guard that is a shame",
    requestContext: {
      dossierId: 18,
      resolvedEntity: { type: "dossier", id: 18 },
    },
    executionContext: {
      dossierId: 18,
      resolvedEntity: { type: "dossier", id: 18 },
      userMessage:
        "we did not find a solution with his wife, we are going to go for a lawsuit for the kids guard that is a shame",
    },
    llmExtractor: null,
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "lawsuit");
  assert.deepEqual(result.missingRequiredFields, []);
  assert.equal(result.parentResolution?.status, "ready");
});
