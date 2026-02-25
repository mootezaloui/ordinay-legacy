"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { _internal } = require("./agentMutationWorkflowProposal.service");

test("workflow confirmation preview groups cascade changes and exposes examples", () => {
  const preview = _internal._buildConfirmationPreview({
    rootType: "client",
    rootId: 12,
    rootLabel: "Mootez Aloui",
    requestedGoal: {
      operation: "update",
      changes: {
        status: { from: "active", to: "inactive" },
      },
    },
    steps: [
      {
        actionType: "UPDATE_ENTITY",
        params: {
          entityType: "task",
          entityId: 4,
          changes: {
            status: { from: "todo", to: "cancelled" },
            priority: { from: "medium", to: "low" },
          },
        },
      },
      {
        actionType: "UPDATE_ENTITY",
        params: {
          entityType: "lawsuit",
          entityId: 9,
          changes: {
            status: { from: "in_progress", to: "on_hold" },
          },
        },
      },
    ],
    reasoningSummary: "Related records must be aligned before the client status can be changed safely.",
    reversible: false,
  });

  assert.equal(preview.version, "v1");
  assert.equal(preview.scope, "workflow");
  assert.equal(preview.root.label, "Mootez Aloui");
  assert.equal(preview.reversibility, "not_reversible");
  assert.equal(Array.isArray(preview.primaryChanges), true);
  assert.equal(preview.primaryChanges[0].field, "status");
  assert.equal(preview.primaryChanges[0].to, "inactive");

  const taskGroup = preview.cascadeSummary.find((g) => g.entityType === "task");
  assert.ok(taskGroup, "expected task cascade group");
  assert.equal(taskGroup.totalCount, 1);
  assert.equal(taskGroup.changedFields.includes("status"), true);
  assert.equal(taskGroup.changedFields.includes("priority"), true);
  assert.equal(taskGroup.examples.length > 0, true);
  assert.equal(taskGroup.examples[0].entityLabel, "Task #4");

  const lawsuitGroup = preview.cascadeSummary.find((g) => g.entityType === "lawsuit");
  assert.ok(lawsuitGroup, "expected lawsuit cascade group");
  assert.equal(lawsuitGroup.totalCount, 1);
  assert.equal(preview.effects[0].includes("aligned"), true);
});

