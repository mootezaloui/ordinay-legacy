"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ChatOrchestrator } = require("./chat.orchestrator");

function createOperationalStore() {
  const rows = new Map();
  const key = (userId, conversationId) => `${String(userId)}::${String(conversationId)}`;
  return {
    get(userId, conversationId) {
      return rows.get(key(userId, conversationId)) || null;
    },
    update(userId, conversationId, patch = {}) {
      const current = rows.get(key(userId, conversationId)) || {};
      rows.set(key(userId, conversationId), { ...current, ...patch });
    },
  };
}

test("routing integration: pending tasks executes deterministic direct read", async () => {
  const operationalStore = createOperationalStore();
  const engine = {
    _resolvePolicy: () => ({
      version: "v3",
      allowedToolCategories: ["read", "analysis", "plan", "draft", "research"],
    }),
    _callReadTool: async (toolName) => {
      if (toolName !== "listTasks") throw new Error(`Unexpected tool: ${toolName}`);
      return {
        tasks: [{ id: 1, title: "Collect exhibits", status: "todo" }],
        count: 1,
      };
    },
    ledger: {
      record: () => {},
    },
    contextStore: {
      _operationalStore: operationalStore,
      _transcriptStore: { updateOrAddTurn: () => {} },
      getContextForLLMInjection: () => ({}),
    },
  };

  const orchestrator = new ChatOrchestrator({
    engine,
    llmClient: async () => ({ content: "" }),
  });
  orchestrator.helper._resolvePosture = async () => "ASSISTANT";

  const result = await orchestrator.runChatTurn({
    message: "What are my pending tasks?",
    context: { conversationId: "conv-int", userId: "u-int" },
    agentVersion: "v3",
  });

  assert.match(String(result?.message || ""), /Found 1 tasks/i);
  assert.equal(result?.ambiguityArtifact || null, null);
  assert.equal(result?.outputArtifact?.deterministicRead, true);
});

test("routing integration: global list clients adds post-list narrowing suggestion", async () => {
  const operationalStore = createOperationalStore();
  const ledgerRows = [];
  const engine = {
    _resolvePolicy: () => ({
      version: "v3",
      allowedToolCategories: ["read", "analysis", "plan", "draft", "research"],
    }),
    _callReadTool: async (toolName) => {
      if (toolName !== "listClients") throw new Error(`Unexpected tool: ${toolName}`);
      return {
        clients: [
          { id: 1, name: "Acme Corp" },
          { id: 2, name: "Beta LLC" },
          { id: 3, name: "Gamma SARL" },
        ],
        count: 3,
      };
    },
    ledger: {
      record: (entry) => ledgerRows.push(entry),
    },
    contextStore: {
      _operationalStore: operationalStore,
      _transcriptStore: { updateOrAddTurn: () => {} },
      getContextForLLMInjection: () => ({}),
    },
  };

  const orchestrator = new ChatOrchestrator({
    engine,
    llmClient: async () => ({ content: "" }),
  });
  orchestrator.helper._resolvePosture = async () => "ASSISTANT";

  const result = await orchestrator.runChatTurn({
    message: "list my clients",
    context: { conversationId: "conv-clients", userId: "u-clients" },
    agentVersion: "v3",
  });

  assert.match(String(result?.message || ""), /Found 3 clients/i);
  assert.match(String(result?.message || ""), /You can narrow this list by client name or reference/i);
  const policyTrace = ledgerRows.find((row) => row?.step === "intent_policy_evaluated");
  assert.equal(policyTrace?.intentPolicy?.globalSafe, true);
  assert.equal(policyTrace?.intentPolicy?.reasonCode, "global_safe_collection_listing");
});
