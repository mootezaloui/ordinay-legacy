"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { toProposalArtifact } = require("./proposalArtifact");

test("single task creation artifact keeps standard summary", () => {
  const proposal = {
    proposalId: "p-single",
    status: "PROPOSED",
    actionType: "CREATE_ENTITY",
    requiresConfirmation: true,
    reversible: true,
    version: "v3",
    posture: "WORK",
    sessionId: "s1",
    params: {
      entityType: "task",
      payload: { title: "Prepare divorce petition", status: "todo", priority: "high" },
    },
    affectedEntities: [{ type: "task", id: null, operation: "create" }],
  };

  const artifact = toProposalArtifact(proposal, "s1");
  const item = artifact.proposals[0];
  assert.equal(item.actionType, "CREATE_ENTITY");
  assert.match(item.humanReadableSummary, /Create/i);
  assert.equal(item.workflowPreview, null);
  assert.deepEqual(item.previewItems, []);
  assert.ok(item.preview && typeof item.preview === "object");
  assert.deepEqual(item.preview.items, []);
});

test("batch task workflow artifact contains grouped preview and title bullets", () => {
  const proposal = {
    proposalId: "p-batch",
    status: "PROPOSED",
    actionType: "EXECUTE_MUTATION_WORKFLOW",
    requiresConfirmation: true,
    reversible: false,
    version: "v3",
    posture: "WORK",
    sessionId: "s2",
    params: {
      workflow: {
        workflowType: "UNIVERSAL_MUTATION_BATCH",
        steps: [
          { stepId: "step_1", actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "Review dossier facts", status: "todo", priority: "high" } } },
          { stepId: "step_2", actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "Collect children documents", status: "todo", priority: "medium" } } },
          { stepId: "step_3", actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "Draft petition timeline", status: "todo", priority: "medium" } } },
        ],
      },
    },
    affectedEntities: [
      { type: "task", id: null, operation: "create" },
      { type: "task", id: null, operation: "create" },
      { type: "task", id: null, operation: "create" },
      { type: "dossier", id: 101, operation: "scope", reference: "DOS-2026-001", label: "Divorce dossier" },
      { type: "lawsuit", id: 42, operation: "scope", reference: "PRO-2026-001", label: "Divorce case" },
    ],
  };

  const artifact = toProposalArtifact(proposal, "s2");
  const item = artifact.proposals[0];
  assert.equal(item.workflowPreview.groupedMode, "single_entity_type");
  assert.equal(item.workflowPreview.totalSteps, 3);
  assert.equal(item.workflowPreview.groups.length, 1);
  assert.match(item.workflowPreview.summaryLine, /^Create 3 tasks in PRO-2026-001/);
  assert.equal(item.previewItems.length, 3);
  assert.equal(item.preview.items.length, 3);
  assert.equal(item.preview.items[0].title, "Review dossier facts");
  assert.equal(item.preview.items[0].status, "todo");
  assert.equal(item.preview.items[0].priority, "high");
  assert.ok(Array.isArray(item.preview.items[0].parentLinks));
  assert.ok(!("dossierId" in (item.preview.items[0] || {})));
  assert.ok(!("lawsuitId" in (item.preview.items[0] || {})));
  assert.match(item.humanReadableSummary, /^Create 3 tasks in PRO-2026-001/);
  assert.match(item.humanReadableSummary, /- Review dossier facts/);
  assert.match(item.humanReadableSummary, /- Collect children documents/);
});

test("mixed workflow artifact renders sections per entity type", () => {
  const proposal = {
    proposalId: "p-mixed",
    status: "PROPOSED",
    actionType: "EXECUTE_MUTATION_WORKFLOW",
    requiresConfirmation: true,
    reversible: false,
    version: "v3",
    posture: "WORK",
    sessionId: "s3",
    params: {
      workflow: {
        workflowType: "UNIVERSAL_MUTATION_BATCH",
        steps: [
          { stepId: "step_1", actionType: "CREATE_ENTITY", params: { entityType: "task", payload: { title: "Create task A", status: "todo", priority: "high" } } },
          { stepId: "step_2", actionType: "CREATE_ENTITY", params: { entityType: "session", payload: { title: "Schedule meeting with client", status: "scheduled" } } },
          { stepId: "step_3", actionType: "CREATE_ENTITY", params: { entityType: "mission", payload: { title: "Assign bailiff follow-up", status: "planned" } } },
        ],
      },
    },
    affectedEntities: [
      { type: "task", id: null, operation: "create" },
      { type: "session", id: null, operation: "create" },
      { type: "mission", id: null, operation: "create" },
      { type: "dossier", id: 101, operation: "scope", reference: "DOS-2026-001", label: "Divorce dossier" },
    ],
  };

  const artifact = toProposalArtifact(proposal, "s3");
  const item = artifact.proposals[0];
  assert.equal(item.workflowPreview.groupedMode, "mixed_entity_types");
  assert.equal(item.workflowPreview.groups.length, 3);
  assert.equal(item.previewItems.length, 3);
  assert.equal(item.preview.items.length, 3);
  assert.match(item.humanReadableSummary, /Create 1 task in DOS-2026-001/);
  assert.match(item.humanReadableSummary, /Create 1 session in DOS-2026-001/);
  assert.match(item.humanReadableSummary, /Create 1 mission in DOS-2026-001/);
});
