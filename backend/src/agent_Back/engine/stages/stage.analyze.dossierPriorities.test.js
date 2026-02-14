"use strict";

const assert = require("assert");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");

const analyzeStage = require("./stage.analyze");
const schema = require("../../schemas/dossier_priorities_analysis.schema.json");

async function run() {
  const now = new Date("2026-02-14T10:00:00.000Z");
  const originalNow = Date.now;
  Date.now = () => now.getTime();

  const ajv = new Ajv({
    allErrors: true,
    strict: true,
    allowUnionTypes: true,
  });
  addFormats(ajv);
  const validate = ajv.compile(schema);

  const snapshot = {
    snapshotType: "dossier_work_snapshot",
    entityType: "dossier",
    entityId: 77,
    snapshotAt: "2026-02-14T09:00:00.000Z",
    scope: {
      scopeType: "dossier",
      dossierId: 77,
      childEntities: [
        "tasks",
        "sessions",
        "hearings",
        "lawsuits",
        "financial_entries",
      ],
      fixed: true,
    },
    parent: {
      id: 77,
      reference: "DOS-2026-77",
      title: "Payment dispute",
      status: "on_hold",
      priority: "high",
    },
    aggregates: {
      tasks: { total: 4, active: 3, overdue: 2, blocked: 1 },
      sessions: { total: 2, upcoming: 1 },
      hearings: { upcoming: 1 },
      lawsuits: { total: 1 },
      financial: { total: 2, overdueReceivables: 1 },
      deadline: {
        status: "upcoming",
        dateValue: "2026-02-15T09:00:00.000Z",
        sourceType: "dossier",
        sourceLabel: "Court filing deadline",
      },
      workload: { urgency: "critical", pressure: true },
    },
  };

  const toolData = {
    listTasks: {
      tasks: [
        {
          id: 11,
          title: "Prepare filing packet",
          status: "open",
          priority: "high",
          due_date: "2026-02-12T10:00:00.000Z",
        },
        {
          id: 12,
          title: "Confirm witness notes",
          status: "open",
          priority: "medium",
          due_date: "2026-02-15T09:00:00.000Z",
        },
      ],
    },
    listSessions: {
      sessions: [
        {
          id: 31,
          title: "Hearing prep meeting",
          session_type: "hearing",
          status: "scheduled",
          scheduled_at: "2026-02-16T08:00:00.000Z",
        },
      ],
    },
    listLawsuits: {
      lawsuits: [
        {
          id: 41,
          title: "Main dispute",
          status: "active",
          next_hearing: "2026-02-20T10:00:00.000Z",
        },
      ],
    },
    listFinancialEntries: {
      financialEntries: [
        {
          id: 51,
          title: "Invoice #A-19",
          direction: "receivable",
          payment_status: "overdue",
          due_date: "2026-02-10T00:00:00.000Z",
        },
      ],
    },
  };

  const engine = {
    ...analyzeStage,
    contextStore: {
      get() {
        return { workSnapshot: snapshot };
      },
    },
    ledger: {
      record() {
        return { id: "ledger-test" };
      },
    },
    async _callReadTool(toolName) {
      return toolData[toolName] || {};
    },
    _validateContract(contractType, output) {
      assert.strictEqual(
        contractType,
        "dossier_priorities_analysis",
        "Expected dossier priorities contract",
      );
      const valid = validate(output);
      assert.strictEqual(
        valid,
        true,
        `Schema validation failed: ${JSON.stringify(validate.errors || [])}`,
      );
    },
  };

  const result =
    await analyzeStage._executeDossierPrioritiesAnalysisIntent.call(
      engine,
      {
        intent: "ANALYZE_ENTITY",
        analysisType: "dossier_priorities",
        entityType: "dossier",
        entityId: 77,
      },
      "review immediate dossier priorities",
      {},
      { version: "v1" },
      {},
    );

  assert.strictEqual(result.output.type, "dossier_priorities_analysis");
  assert.ok(result.output.priorityRanking.length >= 1);
  assert.strictEqual(
    result.output.recommendation.targetType,
    "task",
    "Expected overdue task as top recommendation",
  );
  assert.strictEqual(
    result.output.recommendation.targetId,
    11,
    "Expected most overdue task as top recommendation",
  );
  assert.ok(
    /overdue/i.test(result.output.recommendation.reason),
    "Recommendation should be grounded in overdue status",
  );
  assert.strictEqual(result.output.counts.tasks, 4);
  assert.strictEqual(result.output.counts.sessions, 2);
  assert.strictEqual(result.output.counts.hearings, 1);
  assert.strictEqual(result.output.counts.lawsuits, 1);
  assert.strictEqual(result.output.counts.financial_entries, 2);
  assert.strictEqual(result.output.overdue.total, 3);
  assert.ok(
    Array.isArray(result.output.deadlines) && result.output.deadlines.length > 0,
    "Expected nearest deadline in output",
  );
  assert.ok(
    result.output.conflicts.some((row) => row.code === "HOLD_WITH_NEAR_DEADLINE"),
    "Expected hold/deadline conflict detection",
  );

  Date.now = originalNow;
  console.log("stage.analyze.dossierPriorities.test passed");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
