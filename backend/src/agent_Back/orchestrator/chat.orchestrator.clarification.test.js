"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { ChatOrchestrator } = require("./chat.orchestrator");
const { updateChatOrchestratorState } = require("./chat.session.state");

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

test("pending clarification is cleared on fresh complete intent and deterministic list runs", async () => {
  const operationalStore = createOperationalStore();
  const engine = {
    _resolvePolicy: () => ({
      version: "v3",
      allowedToolCategories: ["read", "analysis", "plan", "draft", "research"],
    }),
    _callReadTool: async (toolName) => {
      if (toolName === "listTasks") return { tasks: [], count: 0 };
      throw new Error(`Unexpected tool call: ${toolName}`);
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

  const requestContext = { conversationId: "conv-1", userId: "u-1" };
  updateChatOrchestratorState(engine, requestContext, {
    pendingClarification: {
      entityType: "dossier",
      resumeState: "RETRIEVE",
      artifact: {
        type: "context_suggestion",
        message: "Please specify the dossier.",
        suggestions: [
          { entityType: "dossier", entityId: 10, label: "Dossier A" },
        ],
      },
      turnsRemaining: 2,
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 120000).toISOString(),
    },
    activeState: "CLARIFY",
  });

  const result = await orchestrator.runChatTurn({
    message: "What are my pending tasks?",
    context: requestContext,
    agentVersion: "v3",
  });

  assert.match(String(result?.message || ""), /No tasks found|Found \d+ tasks/i);
  const nextState = operationalStore.get("u-1", "conv-1")?.orchestratorState || {};
  assert.equal(nextState.pendingClarification, null);
});

