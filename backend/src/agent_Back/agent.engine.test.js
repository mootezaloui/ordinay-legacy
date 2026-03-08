"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const AgentEngine = require("./agent.engine");

test("normalizeProposalExecutionTarget maps CREATE_ENTITY proposals to universalMutation input", () => {
  const normalized = AgentEngine.normalizeProposalExecutionTarget({
    proposalId: "p1",
    actionType: "CREATE_ENTITY",
    humanReadableSummary: "Create lawsuit",
    params: {
      entityType: "lawsuit",
      payload: {
        entityType: "lawsuit",
        payload: {
          dossier_id: 18,
          title: "Custody lawsuit",
        },
      },
    },
  });

  assert.equal(normalized.toolName, "universalMutation");
  assert.equal(normalized.params.operations[0].op, "CREATE_ENTITY");
  assert.equal(normalized.params.operations[0].entityType, "lawsuit");
  assert.deepEqual(normalized.params.operations[0].payload, {
    dossier_id: 18,
    title: "Custody lawsuit",
  });
});
