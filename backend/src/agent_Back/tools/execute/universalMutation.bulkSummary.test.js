"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const universalMutationTool = require("./universalMutation.tool");

test("bulk create task workflow proposal summary is task-specific", async () => {
  const proposal = await universalMutationTool.handler(
    {
      operations: [
        {
          op: "CREATE_ENTITY",
          entityType: "task",
          payload: { title: "Task one", dossier_id: 1, status: "pending" },
          reason: "Create planned tasks",
        },
        {
          op: "CREATE_ENTITY",
          entityType: "task",
          payload: { title: "Task two", dossier_id: 1 },
          reason: "Create planned tasks",
        },
      ],
      idempotencyKey: "test_bulk_task_summary",
      origin: "test",
      risk: "medium",
    },
    { sourceRoute: "test" },
  );

  assert.equal(proposal.actionType, "EXECUTE_MUTATION_WORKFLOW");
  assert.match(proposal.humanReadableSummary, /^Create 2 tasks/);
  assert.equal(proposal.params.workflow.steps.length, 2);
  assert.equal(proposal.params.workflow.steps[0].params.status, "todo");
});
