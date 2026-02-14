"use strict";

const assert = require("assert");
const pipeline = require("./pipeline");

async function run() {
  let analyzeCalls = 0;
  let readCalls = 0;
  const contextUpdates = [];

  const engine = {
    ...pipeline,
    policies: {
      v1: {
        version: "v1",
        defaultReasoner: "rule",
        allowedIntents: [
          "GENERAL_CHAT",
          "EXPLAIN_ENTITY_STATE",
          "SUMMARIZE_SESSION",
          "DRAFT_INVITATION",
          "DRAFT_CLIENT_EMAIL",
          "DRAFT_GENERIC",
        ],
        allowedToolCategories: ["read", "analysis", "draft"],
        allowExecution: false,
        allowExternalSearch: true,
        allowEnrichment: false,
      },
    },
    reasoners: {
      rule: { name: "rule", chat: async () => ({ type: "chat", message: "ok" }) },
    },
    ledger: {
      record() {
        return { id: "ledger-1" };
      },
    },
    contextStore: {
      get() {
        return {
          lastPosture: "WORK",
          workSnapshot: {
            entityType: "dossier",
            entityId: 77,
            parent: { id: 77, reference: "DOS-2026-77", title: "Case" },
            scope: {
              childEntities: [
                "tasks",
                "sessions",
                "hearings",
                "lawsuits",
                "financial_entries",
              ],
            },
            aggregates: {
              tasks: { total: 2, overdue: 1 },
              sessions: { total: 1 },
              hearings: { upcoming: 1 },
              lawsuits: { total: 1 },
              financial: { total: 1, overdueReceivables: 0 },
              deadline: {
                status: "upcoming",
                dateValue: "2026-02-15T09:00:00.000Z",
              },
              workload: { urgency: "high" },
            },
          },
        };
      },
    },
    _assertExecutionIntent() {},
    _updateConversationContext(context, message, result) {
      contextUpdates.push({ context, message, type: result?.output?.type || null });
    },
    async _executeReadIntent() {
      readCalls += 1;
      return {
        intent: "READ_DATA",
        output: { type: "explanation", summary: "unexpected read path" },
      };
    },
    async _executeDossierPrioritiesAnalysisIntent() {
      analyzeCalls += 1;
      return {
        intent: "ANALYZE_ENTITY",
        agentVersion: "v1",
        reasoner: "analyze-gate",
        output: {
          type: "dossier_priorities_analysis",
          dossier: {
            id: 77,
            reference: "DOS-2026-77",
            title: "Case",
            status: "open",
            priority: "high",
          },
          counts: { tasks: 2, sessions: 1, hearings: 1, lawsuits: 1, financial_entries: 1 },
          deadlines: [],
          overdue: { total: 1, byType: { tasks: 1, sessions: 0, hearings: 0, lawsuits: 0, financial_entries: 0 } },
          conflicts: [],
          priorityRanking: [
            {
              rank: 1,
              itemType: "task",
              itemId: 10,
              label: "Task",
              score: 90,
              reason: "Overdue",
              dueAt: null,
              status: "open",
            },
          ],
          recommendation: {
            action: "FOCUS_TOP_PRIORITY",
            targetType: "task",
            targetId: 10,
            reason: "Overdue",
          },
          can_help_with: [{ action: "OPEN_TOP_TASK", intent: "READ_TASK", label: "Open top priority task" }],
          timestamp: new Date().toISOString(),
          source: "deterministic-analyze-gate",
          requires_validation: false,
        },
      };
    },
  };

  const result = await pipeline.run.call(engine, {
    message: "review immediate dossier priorities",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(result.output.type, "dossier_priorities_analysis");
  assert.strictEqual(analyzeCalls, 1, "Analyze artifact should be generated exactly once");
  assert.strictEqual(readCalls, 0, "Read snapshot path should not run for analyze priority intent");
  assert.strictEqual(
    contextUpdates.filter((entry) => entry.type === "dossier_priorities_analysis").length,
    1,
    "Expected exactly one context update carrying the analysis artifact",
  );

  console.log("pipeline.dossierPriorities.test passed");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
