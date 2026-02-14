"use strict";

const assert = require("assert");
const pipeline = require("./pipeline");

function buildEngine({
  contextSnapshot = { lastPosture: "WORK" },
  resolveEntityImpl,
  executeDraftImpl,
} = {}) {
  const calls = {
    resolveEntity: [],
    executeDraft: [],
  };

  const engine = {
    ...pipeline,
    policies: {
      v1: {
        version: "v1",
        defaultReasoner: "rule",
        allowedIntents: [
          "GENERAL_CHAT",
          "DRAFT_GENERIC",
          "DRAFT_CLIENT_EMAIL",
          "DRAFT_INVITATION",
        ],
        allowedToolCategories: ["read", "draft", "analysis"],
        allowExecution: false,
        allowExternalSearch: false,
        allowEnrichment: true,
      },
    },
    reasoners: { rule: { name: "rule" } },
    ledger: { record: () => ({ id: "ledger-1" }) },
    contextStore: {
      get: () => contextSnapshot,
    },
    _assertExecutionIntent: () => {},
    _updateConversationContext: () => {},
    _validateAgainstSchema: () => {},
    async resolveEntity(payload) {
      calls.resolveEntity.push(payload);
      if (typeof resolveEntityImpl === "function") {
        return resolveEntityImpl(payload);
      }
      return {
        found: true,
        entityType: payload.entityType || "client",
        entityId: Number(payload.identifier) || 1,
        entityLabel: "Resolved Entity",
      };
    },
    async _executeDraftIntent(draftIntent, message, context, policy, engineCtx) {
      calls.executeDraft.push({ draftIntent, message, context });
      return executeDraftImpl(draftIntent, message, context, policy, engineCtx);
    },
  };

  return { engine, calls };
}

async function testDraftWithKnownTypeRequestsEntitySelectionFirst() {
  const { engine, calls } = buildEngine({
    executeDraftImpl: async (draftIntent, _message) => {
      assert.strictEqual(draftIntent.intent, "DRAFT_CLIENT_EMAIL");
      assert.strictEqual(draftIntent.draftType, "CLIENT_EMAIL");
      return {
        intent: "DRAFT_CLIENT_EMAIL",
        agentVersion: "v1",
        reasoner: "draft-gate",
        output: {
          type: "context_suggestion",
          entityType: "client",
          capability: "DRAFT",
          originalIntent: "DRAFT_CLIENT_EMAIL",
          originalDraftType: "CLIENT_EMAIL",
          message: "I found matching clients.",
          suggestions: [
            {
              id: "client-42",
              entityType: "client",
              entityId: 42,
              label: "Client #42",
              metadata: {},
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
              scope: { clientId: 42 },
            },
          ],
          timestamp: new Date().toISOString(),
          source: "rule-based",
        },
        needsClarification: true,
      };
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "Draft a client email regarding overdue payment",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(result.output.type, "context_suggestion");
  assert.strictEqual(result.output.entityType, "client");
  assert.notStrictEqual(result.output.type, "draft_type_selection");
  assert.strictEqual(calls.executeDraft.length, 1);
}

async function testClientSelectionWithMultipleInvoicesPromptsInvoiceSelection() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: true,
      entityType: "client",
      entityId: 42,
      entityLabel: "Client #42",
    }),
    executeDraftImpl: async (draftIntent, _message, context) => {
      assert.strictEqual(draftIntent.intent, "DRAFT_CLIENT_EMAIL");
      assert.strictEqual(draftIntent.draftType, "CLIENT_EMAIL");
      assert.strictEqual(context._resolvedFromSuggestion, true);
      return {
        intent: "DRAFT_CLIENT_EMAIL",
        agentVersion: "v1",
        reasoner: "draft-gate",
        output: {
          type: "context_suggestion",
          category: "invoice_selection",
          entityType: "financial_entry",
          capability: "DRAFT",
          originalIntent: "DRAFT_CLIENT_EMAIL",
          originalDraftType: "CLIENT_EMAIL",
          message: "Which invoice should I reference?",
          suggestions: [
            {
              id: "invoice-101",
              entityType: "financial_entry",
              entityId: 101,
              label: "Invoice #101",
              metadata: {},
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
              scope: { clientId: 42, financialEntryId: 101 },
            },
            {
              id: "invoice-102",
              entityType: "financial_entry",
              entityId: 102,
              label: "Invoice #102",
              metadata: {},
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
              scope: { clientId: 42, financialEntryId: 102 },
            },
          ],
          timestamp: new Date().toISOString(),
          source: "rule-based",
        },
        needsClarification: true,
      };
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "use this client",
    context: {},
    agentVersion: "v1",
    followUpIntent: {
      type: "FOLLOW_UP_INTENT",
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      originalIntent: "DRAFT_CLIENT_EMAIL",
      originalDraftType: "CLIENT_EMAIL",
      originalMessage: "Draft a client email regarding overdue payment",
      resolvedEntity: { type: "client", id: 42, label: "Client #42" },
    },
  });

  assert.strictEqual(calls.resolveEntity.length, 1);
  assert.strictEqual(result.output.type, "context_suggestion");
  assert.strictEqual(result.output.category, "invoice_selection");
}

async function testInvoiceSelectionExecutesDraft() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: true,
      entityType: "client",
      entityId: 42,
      entityLabel: "Client #42",
    }),
    executeDraftImpl: async (draftIntent, _message, context) => {
      assert.strictEqual(draftIntent.intent, "DRAFT_CLIENT_EMAIL");
      assert.strictEqual(draftIntent.draftType, "CLIENT_EMAIL");
      assert.strictEqual(context._resolvedFromSuggestion, true);
      assert.ok(context.invoiceSelection);
      assert.strictEqual(context.invoiceSelection.mode, "single");
      assert.strictEqual(context.invoiceSelection.invoiceId, 101);
      return {
        intent: "DRAFT_CLIENT_EMAIL",
        agentVersion: "v1",
        reasoner: "draft-gate",
        output: {
          type: "draft",
          draftType: "CLIENT_EMAIL",
          content: "Generated draft for selected invoice.",
          timestamp: new Date().toISOString(),
          source: "rule-based",
        },
      };
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "select invoice 101",
    context: {},
    agentVersion: "v1",
    followUpIntent: {
      type: "FOLLOW_UP_INTENT",
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      originalIntent: "DRAFT_CLIENT_EMAIL",
      originalDraftType: "CLIENT_EMAIL",
      originalMessage: "Draft a client email regarding overdue payment",
      resolvedEntity: { type: "client", id: 42, label: "Client #42" },
      selectionCategory: "invoice_selection",
      selectionId: "101",
    },
  });

  assert.strictEqual(calls.resolveEntity.length, 1);
  assert.strictEqual(result.output.type, "draft");
  assert.strictEqual(calls.executeDraft.length, 1);
}

async function testPrefixedInvoiceSelectionIdExecutesDraft() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: true,
      entityType: "client",
      entityId: 42,
      entityLabel: "Client #42",
    }),
    executeDraftImpl: async (draftIntent, _message, context) => {
      assert.strictEqual(draftIntent.intent, "DRAFT_CLIENT_EMAIL");
      assert.strictEqual(draftIntent.draftType, "CLIENT_EMAIL");
      assert.strictEqual(context._resolvedFromSuggestion, true);
      assert.ok(context.invoiceSelection);
      assert.strictEqual(context.invoiceSelection.mode, "single");
      assert.strictEqual(context.invoiceSelection.invoiceId, 101);
      return {
        intent: "DRAFT_CLIENT_EMAIL",
        agentVersion: "v1",
        reasoner: "draft-gate",
        output: {
          type: "draft",
          draftType: "CLIENT_EMAIL",
          content: "Generated draft for selected invoice.",
          timestamp: new Date().toISOString(),
          source: "rule-based",
        },
      };
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "select invoice 101",
    context: {},
    agentVersion: "v1",
    followUpIntent: {
      type: "FOLLOW_UP_INTENT",
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      originalIntent: "DRAFT_CLIENT_EMAIL",
      originalDraftType: "CLIENT_EMAIL",
      originalMessage: "Draft a client email regarding overdue payment",
      resolvedEntity: { type: "client", id: 42, label: "Client #42" },
      selectionCategory: "invoice_selection",
      selectionId: "invoice-101",
    },
  });

  assert.strictEqual(calls.resolveEntity.length, 1);
  assert.strictEqual(result.output.type, "draft");
  assert.strictEqual(calls.executeDraft.length, 1);
}

async function testGenericOfficialDraftPromptsDraftTypeSelection() {
  const { engine, calls } = buildEngine({
    executeDraftImpl: async (draftIntent) => {
      assert.strictEqual(draftIntent.intent, "DRAFT_GENERIC");
      assert.strictEqual(draftIntent.draftType, null);
      return {
        intent: "DRAFT_GENERIC",
        agentVersion: "v1",
        reasoner: "draft-gate",
        output: {
          type: "draft_type_selection",
          entityType: "draft_type",
          message: "Please choose the type of draft you want to generate:",
          suggestions: [],
          timestamp: new Date().toISOString(),
          source: "rule-based",
        },
        needsClarification: true,
      };
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "write something official",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(calls.executeDraft.length, 1);
  assert.strictEqual(result.output.type, "draft_type_selection");
}

async function run() {
  await testDraftWithKnownTypeRequestsEntitySelectionFirst();
  await testClientSelectionWithMultipleInvoicesPromptsInvoiceSelection();
  await testInvoiceSelectionExecutesDraft();
  await testPrefixedInvoiceSelectionIdExecutesDraft();
  await testGenericOfficialDraftPromptsDraftTypeSelection();
  console.log("draft ambiguity pipeline tests passed");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };
