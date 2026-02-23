"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function tmpDbPath(name) {
  return path.join(
    os.tmpdir(),
    `ordinay-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function clearBackendCache() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}backend${path.sep}src${path.sep}`)) {
      delete require.cache[key];
    }
  });
}

function removeSqliteArtifacts(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {}
  }
}

async function bootstrapTempDb(dbPath) {
  const prevDbFile = process.env.DB_FILE;
  process.env.DB_FILE = dbPath;
  clearBackendCache();

  const db = require("../../db/connection");
  const { evaluateMutationConstraints } = require("./agentDomainConstraintEvaluator");
  const { resolveAdaptiveMutationRemediation } = require("./agentMutationConstraintResolver");
  const { buildProposal } = require("./agentMutationProposal.service");

  const restore = () => {
    try {
      db.close();
    } catch {}
    clearBackendCache();
    if (prevDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = prevDbFile;
    removeSqliteArtifacts(dbPath);
  };

  return { db, evaluateMutationConstraints, resolveAdaptiveMutationRemediation, buildProposal, restore };
}

function seedBase(db) {
  db.prepare(`INSERT INTO clients (id, name, status) VALUES (1, 'Client A', 'active')`).run();
  db.prepare(
    `INSERT INTO dossiers (id, reference, client_id, title, status, priority, phase, validated)
     VALUES (1, 'DOS-1', 1, 'Dossier One', 'open', 'medium', 'investigation', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO lawsuits (id, reference, lawsuit_number, dossier_id, title, status, priority, opened_at)
     VALUES (1, 'LAW-1', 'LAW-1', 1, 'Lawsuit One', 'in_progress', 'medium', '2026-01-01')`,
  ).run();
  db.prepare(
    `INSERT INTO tasks (id, dossier_id, lawsuit_id, title, status, priority)
     VALUES (1, NULL, 1, 'Task One', 'todo', 'medium')`,
  ).run();
  db.prepare(
    `INSERT INTO sessions (id, dossier_id, lawsuit_id, title, session_type, status, scheduled_at)
     VALUES (1, NULL, 1, 'Hearing One', 'hearing', 'scheduled', '2026-03-01')`,
  ).run();
  db.prepare(
    `INSERT INTO tasks (id, dossier_id, lawsuit_id, title, status, priority)
     VALUES (2, 1, NULL, 'Dossier Task', 'todo', 'medium')`,
  ).run();
}

test("evaluateMutationConstraints returns warning + extra confirmation for paid financial entry edit", async () => {
  const dbPath = tmpDbPath("domain-evaluator-warning");
  const { db, evaluateMutationConstraints, buildProposal, restore } = await bootstrapTempDb(dbPath);
  try {
    seedBase(db);
    db.prepare(
      `INSERT INTO financial_entries (
        id, scope, client_id, entry_type, status, amount, currency, direction, title, paid_at
      ) VALUES (
        501, 'client', 1, 'income', 'paid', 100, 'TND', 'receivable', 'Invoice #1', '2026-02-10'
      )`,
    ).run();

    const existing = db.prepare(`SELECT * FROM financial_entries WHERE id = 501`).get();
    const evaluation = evaluateMutationConstraints({
      entityType: "financial_entry",
      operation: "update",
      entityId: 501,
      payload: { description: "Corrected memo" },
      existing,
    });

    assert.equal(evaluation.allowed, true);
    assert.equal(evaluation.requiresExtraConfirmation, true);
    assert.ok(Array.isArray(evaluation.warnings) && evaluation.warnings.length > 0);
    assert.match(
      String(evaluation.warnings[0]?.userFacingFactText || ""),
      /paid financial entry|paid/i,
    );

    const proposal = buildProposal(
      {
        entityType: "financial_entry",
        entityId: "501",
        operation: "update",
        payload: { description: "Corrected memo" },
        reasoningSummary: "User requested correction",
      },
      { sessionId: "resolver-test" },
    );
    assert.equal(proposal.requiresConfirmation, true);
    assert.equal(proposal.confirmation?.extraRiskAck, true);
    assert.ok(Array.isArray(proposal.confirmation?.warnings));
  } finally {
    restore();
  }
});

test("resolver creates adaptive workflow for lawsuit close blockers", async () => {
  const dbPath = tmpDbPath("resolver-lawsuit-close");
  const { db, resolveAdaptiveMutationRemediation, restore } = await bootstrapTempDb(dbPath);
  try {
    seedBase(db);
    const existing = db.prepare(`SELECT * FROM lawsuits WHERE id = 1`).get();
    const result = resolveAdaptiveMutationRemediation({
      requestedMutation: {
        entityType: "lawsuit",
        entityId: 1,
        operation: "update",
        payload: { status: "closed" },
      },
      existing,
      executionMode: "confirm",
    });

    assert.equal(result.route, "propose_workflow");
    assert.equal(result.workflowProposalInput?.workflowType, "lawsuit_closure_cleanup");
    const stepTypes = result.workflowProposalInput.steps.map((s) => `${s.params.entityType}:${s.params.changes.status}`);
    assert.ok(stepTypes.includes("task:cancelled"));
    assert.ok(stepTypes.includes("session:cancelled"));
    assert.ok(stepTypes.includes("lawsuit:closed"));
    assert.match(result.userFacingSummary, /close or cancel/i);
    assert.equal(/domain rules?/i.test(result.userFacingSummary), false);
  } finally {
    restore();
  }
});

test("resolver creates adaptive workflow for dossier close blockers", async () => {
  const dbPath = tmpDbPath("resolver-dossier-close");
  const { db, resolveAdaptiveMutationRemediation, restore } = await bootstrapTempDb(dbPath);
  try {
    seedBase(db);
    const existing = db.prepare(`SELECT * FROM dossiers WHERE id = 1`).get();
    const result = resolveAdaptiveMutationRemediation({
      requestedMutation: {
        entityType: "dossier",
        entityId: 1,
        operation: "update",
        payload: { status: "closed" },
      },
      existing,
      executionMode: "confirm",
    });

    assert.equal(result.route, "propose_workflow");
    assert.equal(result.workflowProposalInput?.workflowType, "dossier_closure_cleanup");
    const stepTypes = result.workflowProposalInput.steps.map((s) => `${s.params.entityType}:${s.params.changes.status}`);
    assert.ok(stepTypes.includes("task:cancelled"));
    assert.ok(stepTypes.includes("session:cancelled"));
    assert.ok(stepTypes.includes("lawsuit:closed"));
    assert.ok(stepTypes.includes("dossier:closed"));
  } finally {
    restore();
  }
});

test("resolver creates adaptive workflow for closed-parent child update blocker", async () => {
  const dbPath = tmpDbPath("resolver-closed-parent-child");
  const { db, resolveAdaptiveMutationRemediation, restore } = await bootstrapTempDb(dbPath);
  try {
    seedBase(db);
    db.prepare(`UPDATE dossiers SET status = 'closed' WHERE id = 1`).run();
    const existingTask = db.prepare(`SELECT * FROM tasks WHERE id = 2`).get();
    const result = resolveAdaptiveMutationRemediation({
      requestedMutation: {
        entityType: "task",
        entityId: 2,
        operation: "update",
        payload: { title: "Updated task title" },
      },
      existing: existingTask,
      executionMode: "confirm",
    });

    assert.equal(result.route, "propose_workflow");
    assert.equal(result.workflowProposalInput?.workflowType, "closed_parent_child_update");
    const steps = result.workflowProposalInput.steps;
    assert.equal(steps[0].params.entityType, "dossier");
    assert.equal(steps[0].params.changes.status, "open");
    assert.equal(steps.some((s) => s.params.entityType === "task" && s.params.entityId === 2), true);
    assert.equal(steps[steps.length - 1].params.entityType, "dossier");
    assert.equal(steps[steps.length - 1].params.changes.status, "closed");
    assert.match(result.userFacingSummary, /temporarily reopen/i);
  } finally {
    restore();
  }
});
