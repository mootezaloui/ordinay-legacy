"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { DomainWorkflowPlanner } = resolvePlannerModule();

test("phase8 planner: client inactive with open descendants produces cascade + decision-required plan", async () => {
  const planner = createPlanner({
    validateOperation: async () => ({
      allowed: false,
      blockerCounts: {
        open_dossiers: 1,
        open_lawsuits: 1,
        open_tasks: 2,
        open_sessions: 1,
        active_missions: 1,
        unpaid_receivables: 2,
      },
      notes: ["Client has unresolved descendants and unpaid receivables."],
    }),
    getClientInactiveBlockers: async () => ({
      client: { id: 7, name: "Leila Ben Youssef", status: "active" },
      dossiers: [{ id: 11, status: "active" }],
      lawsuits: [{ id: 21, status: "open" }],
      tasks: [{ id: 31, status: "todo" }, { id: 32, status: "pending" }],
      sessions: [{ id: 41, status: "scheduled" }],
      missions: [{ id: 51, status: "active" }],
      unpaidReceivables: [{ id: 61 }, { id: 62 }],
    }),
  });

  const expanded = await planner.expand({
    operation: {
      operation: "update",
      entityType: "client",
      entityId: 7,
      changes: { status: "inactive" },
    },
    summary: "Set client inactive",
    userMessage: "Set client Leila inactive.",
  });

  const workflowSteps = expanded.plan.workflowSteps || [];
  const settlementSteps = workflowSteps.filter((step) => step.entityType === "financial_entry");
  assert.equal(workflowSteps.length, 7);
  assert.equal(
    settlementSteps.length,
    0,
    "Planner must not auto-settle receivables when user decision is required.",
  );
  assert.equal(workflowSteps[workflowSteps.length - 1]?.id, "step_root");
  assert.equal(
    workflowSteps[workflowSteps.length - 1]?.dependsOn?.[0],
    workflowSteps[workflowSteps.length - 2]?.id,
  );
  assert.equal(expanded.plan.diagnostics?.requiresUserDecision, true);
  assert.equal(Array.isArray(expanded.plan.diagnostics?.decisionOptions), true);
  assert.equal(
    expanded.plan.diagnostics?.decisionOptions?.some((option) => option?.key === "settle_receivables"),
    true,
  );
  assert.equal(expanded.plan.uiPreview?.scope, "workflow");
  assert.equal(expanded.plan.uiPreview?.decisions?.length, 2);
});

test("phase8 planner: explicit settlement intent includes financial settlement steps without decision pause", async () => {
  const planner = createPlanner({
    validateOperation: async () => ({
      allowed: false,
      blockerCounts: {
        open_dossiers: 1,
        open_lawsuits: 0,
        open_tasks: 0,
        open_sessions: 0,
        active_missions: 0,
        unpaid_receivables: 2,
      },
      notes: ["Client has unpaid receivables."],
    }),
    getClientInactiveBlockers: async () => ({
      client: { id: 8, name: "Settlement Client", status: "active" },
      dossiers: [{ id: 12, status: "active" }],
      lawsuits: [],
      tasks: [],
      sessions: [],
      missions: [],
      unpaidReceivables: [{ id: 71 }, { id: 72 }],
    }),
  });

  const expanded = await planner.expand({
    operation: {
      operation: "update",
      entityType: "client",
      entityId: 8,
      changes: { status: "inactive" },
    },
    summary: "Set client inactive after settling invoices",
    userMessage: "Please settle receivables and mark invoices paid before inactivating the client.",
  });

  const workflowSteps = expanded.plan.workflowSteps || [];
  const settlementSteps = workflowSteps.filter((step) => step.entityType === "financial_entry");
  assert.equal(settlementSteps.length, 2);
  assert.equal(expanded.plan.diagnostics?.requiresUserDecision, false);
  assert.equal(expanded.plan.uiPreview?.decisions?.length ?? 0, 0);
});

test("phase8 planner: delete operation requires explicit force-delete decision unless requested", async () => {
  const planner = createPlanner({
    validateOperation: async () => ({
      allowed: false,
      blockerCounts: { linked_dossiers: 3 },
      notes: ["Client has linked dossiers."],
    }),
  });

  const withoutForce = await planner.expand({
    operation: {
      operation: "delete",
      entityType: "client",
      entityId: 9,
    },
    summary: "Delete client",
    userMessage: "Delete this client.",
  });

  assert.equal(withoutForce.plan.diagnostics?.requiresUserDecision, true);
  assert.equal(withoutForce.plan.workflowSteps?.length, 1);
  assert.equal(withoutForce.plan.workflowSteps?.[0]?.id, "step_root");

  const withForce = await planner.expand({
    operation: {
      operation: "delete",
      entityType: "client",
      entityId: 9,
    },
    summary: "Delete client with force",
    userMessage: "Force delete this client including related records.",
  });

  assert.equal(withForce.plan.diagnostics?.requiresUserDecision, false);
  assert.equal(withForce.plan.workflowSteps?.length, 1);
  assert.equal(withForce.plan.workflowSteps?.[0]?.id, "step_root");
});

test("phase8 planner: closed/inactive ancestor blockers produce deterministic reopen workflow before root action", async () => {
  const planner = createPlanner({
    validateOperation: async () => ({
      allowed: false,
      blockerCounts: {
        inactive_client_ancestor: 1,
        closed_dossier_ancestor: 1,
      },
      notes: ["Linked parent client is inactive.", "Linked parent dossier is closed."],
    }),
  });

  const expanded = await planner.expand({
    operation: {
      operation: "update",
      entityType: "task",
      entityId: 301,
      changes: { status: "done" },
      payload: {
        parentType: "dossier",
        dossierId: 11,
        clientId: 1,
      },
    },
    summary: "Complete task under closed hierarchy",
    userMessage: "Complete this task.",
  });

  const workflowSteps = expanded.plan.workflowSteps || [];
  assert.equal(workflowSteps.length, 3);
  assert.deepEqual(
    workflowSteps.map((step) => `${step.entityType}:${step.operation}`),
    ["client:update", "dossier:update", "task:update"],
  );
  assert.equal(workflowSteps[2]?.id, "step_root");
  assert.equal(workflowSteps[2]?.dependsOn?.[0], workflowSteps[1]?.id);
});

test("phase8 planner: closed lawsuit ancestor reopens lawsuit before child mutation", async () => {
  const planner = createPlanner({
    validateOperation: async () => ({
      allowed: false,
      blockerCounts: {
        closed_lawsuit_ancestor: 1,
      },
      notes: ["Linked parent lawsuit is closed."],
    }),
  });

  const expanded = await planner.expand({
    operation: {
      operation: "update",
      entityType: "session",
      entityId: 901,
      changes: { status: "scheduled" },
      payload: {
        lawsuitId: 421,
      },
    },
    summary: "Reschedule session",
    userMessage: "Reschedule this session.",
  });

  const workflowSteps = expanded.plan.workflowSteps || [];
  assert.equal(workflowSteps.length, 2);
  assert.deepEqual(
    workflowSteps.map((step) => `${step.entityType}:${step.operation}`),
    ["lawsuit:update", "session:update"],
  );
  assert.equal(workflowSteps[1]?.id, "step_root");
  assert.equal(workflowSteps[1]?.dependsOn?.[0], workflowSteps[0]?.id);
});

function createPlanner(overrides = {}) {
  const emptyClientBlockers = {
    client: null,
    dossiers: [],
    lawsuits: [],
    tasks: [],
    sessions: [],
    missions: [],
    unpaidReceivables: [],
  };
  const emptyDossierBlockers = {
    dossier: null,
    lawsuits: [],
    tasks: [],
    sessions: [],
    missions: [],
    unpaidReceivables: [],
  };
  const emptyLawsuitBlockers = {
    lawsuit: null,
    tasks: [],
    sessions: [],
    missions: [],
  };

  const ruleProfile = {
    validateOperation: overrides.validateOperation || (async () => ({ allowed: true, blockerCounts: {}, notes: [] })),
    getClientInactiveBlockers:
      overrides.getClientInactiveBlockers || (async () => emptyClientBlockers),
    getDossierCloseBlockers:
      overrides.getDossierCloseBlockers || (async () => emptyDossierBlockers),
    getLawsuitCloseBlockers:
      overrides.getLawsuitCloseBlockers || (async () => emptyLawsuitBlockers),
  };
  const graphAnalyzer = {
    getClientInactiveBlockers:
      overrides.getClientInactiveBlockers || (async () => emptyClientBlockers),
    getDossierCloseBlockers:
      overrides.getDossierCloseBlockers || (async () => emptyDossierBlockers),
    getLawsuitCloseBlockers:
      overrides.getLawsuitCloseBlockers || (async () => emptyLawsuitBlockers),
  };
  return new DomainWorkflowPlanner(ruleProfile, graphAnalyzer);
}

function resolvePlannerModule() {
  const candidates = [
    path.resolve(__dirname, "../../../.agent-build/agent/domain/workflow.planner"),
    path.resolve(__dirname, "../../.agent-build/agent/domain/workflow.planner"),
    path.resolve(process.cwd(), ".agent-build/agent/domain/workflow.planner"),
    path.resolve(process.cwd(), "backend/.agent-build/agent/domain/workflow.planner"),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      return require(resolved);
    } catch {
      continue;
    }
  }
  throw new Error(
    `Unable to resolve workflow planner module for tests. Run build first. Tried: ${candidates.join(", ")}`,
  );
}
