"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildProposalDisplaySummary } = require("./presentationSanitizer");

test("workflow summary reflects bulk task creation scope", () => {
  const summary = buildProposalDisplaySummary({
    actionType: "EXECUTE_MUTATION_WORKFLOW",
    humanReadableSummary: "Execute 5 mutation steps (create_entity)",
    params: {
      workflow: {
        workflowType: "UNIVERSAL_MUTATION_BATCH",
        steps: [
          { actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "A" } } },
          { actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "B" } } },
          { actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "C" } } },
        ],
      },
    },
    affectedEntities: [
      { type: "dossier", reference: "DOS-2026-001", label: "Divorce dossier" },
      { type: "lawsuit", reference: "PRO-2026-001", label: "Divorce case" },
    ],
  });

  assert.equal(summary, "Create 3 tasks linked to DOS-2026-001 under PRO-2026-001");
});

