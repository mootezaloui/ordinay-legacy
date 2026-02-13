"use strict";

const assert = require("assert");
const {
  getContextSuggestions,
  formatSuggestionResponse,
} = require("./stage.contextSuggest");

function createEngineMock(toolResults = {}) {
  return {
    async _callReadTool(toolName) {
      if (Object.prototype.hasOwnProperty.call(toolResults, toolName)) {
        return toolResults[toolName];
      }
      return {};
    },
  };
}

async function testClientSuggestions() {
  const engine = createEngineMock({
    findClientsWithOverdueInvoices: {
      clients: [
        {
          client_id: 2,
          client_name: "Beta SARL",
          overdue_count: 2,
          total_overdue_amount: 12000,
          oldest_due_date: "2026-01-05T00:00:00Z",
        },
        {
          client_id: 1,
          client_name: "Alpha Corp",
          overdue_count: 3,
          total_overdue_amount: 4800,
          oldest_due_date: "2026-01-01T00:00:00Z",
        },
      ],
    },
  });

  const suggestions = await getContextSuggestions.call(
    engine,
    "DRAFT_CLIENT_EMAIL",
    ["client"],
    {
      policy: { version: "v1", allowedToolCategories: ["read"] },
      requestContext: {},
      userMessage: "Draft an overdue payment email",
      now: "2026-02-12T00:00:00Z",
    },
  );

  assert.ok(Array.isArray(suggestions));
  assert.ok(suggestions.length >= 2);
  assert.strictEqual(suggestions[0].entityId, 1);
  assert.strictEqual(suggestions[0].metadata.overdueCount, 3);
  assert.strictEqual(suggestions[0].metadata.totalOverdueAmount, 4800);
}

async function testUpcomingSessionsSuggestions() {
  const engine = createEngineMock({
    listSessions: {
      sessions: [
        { id: 1, title: "Past Hearing", scheduled_at: "2026-02-01T10:00:00Z" },
        { id: 2, title: "Next Hearing", scheduled_at: "2026-02-14T10:00:00Z" },
        { id: 3, title: "Later Hearing", scheduled_at: "2026-02-20T10:00:00Z" },
      ],
    },
  });

  const suggestions = await getContextSuggestions.call(
    engine,
    "DRAFT_INVITATION",
    ["session"],
    {
      policy: { version: "v1", allowedToolCategories: ["read"] },
      requestContext: {},
      userMessage: "Write hearing invitation",
      now: "2026-02-12T00:00:00Z",
    },
  );

  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].entityId, 2);
  assert.strictEqual(suggestions[1].entityId, 3);
}

async function testDossierSemanticSuggestions() {
  const engine = createEngineMock();
  const suggestions = await getContextSuggestions.call(
    engine,
    "DRAFT_INTERNAL_NOTE",
    ["dossier"],
    {
      policy: { version: "v1", allowedToolCategories: ["read"] },
      requestContext: {
        vectorSearch: {
          async searchDossiers() {
            return [
              {
                id: 9,
                reference: "DOS-2026-009",
                title: "Labor Code Dispute",
                score: 0.83,
              },
              {
                id: 10,
                reference: "DOS-2026-010",
                title: "Civil Contract Review",
                score: 0.72,
              },
            ];
          },
        },
      },
      userMessage: "Draft note for labor code dispute",
      now: "2026-02-12T00:00:00Z",
    },
  );

  assert.strictEqual(suggestions.length, 1);
  assert.strictEqual(suggestions[0].entityId, 9);
  assert.ok(suggestions[0].signal.includes("similarity"));
}

async function testFallbackWhenNoData() {
  const engine = createEngineMock({
    listClients: { clients: [] },
    listFinancialEntries: { financialEntries: [] },
    listDossiers: { dossiers: [] },
    listTasks: { tasks: [] },
  });

  const suggestions = await getContextSuggestions.call(
    engine,
    "DRAFT_CLIENT_EMAIL",
    ["client"],
    {
      policy: { version: "v1", allowedToolCategories: ["read"] },
      requestContext: {},
      userMessage: "Draft client email",
      now: "2026-02-12T00:00:00Z",
    },
  );

  assert.deepStrictEqual(suggestions, []);

  const fallback = formatSuggestionResponse("client", []);
  assert.strictEqual(fallback.summary, "Which client should this be for?");
}

async function testOverdueFallback() {
  const engine = createEngineMock({
    findClientsWithOverdueInvoices: { clients: [] },
    listClients: {
      clients: [
        { id: 1, name: "Alpha Corp", updated_at: "2026-02-01T09:00:00Z" },
        { id: 2, name: "Beta SARL", updated_at: "2026-02-10T10:00:00Z" },
      ],
    },
  });

  const suggestions = await getContextSuggestions.call(
    engine,
    "DRAFT_CLIENT_EMAIL",
    ["client"],
    {
      policy: { version: "v1", allowedToolCategories: ["read"] },
      requestContext: {},
      userMessage: "Draft a client email regarding overdue payment",
      now: "2026-02-12T00:00:00Z",
    },
  );

  assert.strictEqual(suggestions.length, 2);
  assert.strictEqual(suggestions[0].entityId, 2);
  assert.ok(suggestions[0].signal.includes("last interaction"));
}

async function run() {
  await testClientSuggestions();
  await testUpcomingSessionsSuggestions();
  await testDossierSemanticSuggestions();
  await testFallbackWhenNoData();
  await testOverdueFallback();
  // eslint-disable-next-line no-console
  console.log("stage.contextSuggest tests passed");
}

if (require.main === module) {
  run().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  run,
};
