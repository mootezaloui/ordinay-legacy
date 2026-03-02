"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatOrchestrator } = require("./chat.orchestrator");

function buildOperationalStore() {
  const state = new Map();
  return {
    get(userId, conversationId) {
      return state.get(`${userId}:${conversationId}`) || null;
    },
    update(userId, conversationId, patch = {}) {
      const key = `${userId}:${conversationId}`;
      const current = state.get(key) || {};
      state.set(key, { ...current, ...(patch || {}) });
      return state.get(key);
    },
  };
}

function buildEngine(toolCalls) {
  return {
    _resolvePolicy: () => ({ version: "v3", allowedToolCategories: ["read", "draft"] }),
    ledger: { record: () => {} },
    contextStore: {
      _operationalStore: buildOperationalStore(),
      getContextForLLMInjection: () => ({}),
    },
    toolRegistry: new Map(),
    ajv: { compile: () => () => true },
    async _callReadTool(toolName, params) {
      toolCalls.push({ toolName, params });
      if (toolName === "getEntityGraph") {
        return {
          root: { type: "client", id: 7, name: "John Doe" },
          children: {
            tasks: [
              {
                type: "task",
                id: 91,
                title: "Prepare hearing file",
                status: "in_progress",
                keyDates: { nextUpcoming: "2026-03-05T09:00:00.000Z" },
              },
            ],
          },
          metrics: {
            totalTasks: 1,
          },
        };
      }
      return {};
    },
  };
}

test("show tasks resolves via deterministic read plan without LLM", async () => {
  const toolCalls = [];
  const engine = buildEngine(toolCalls);
  const orchestrator = new ChatOrchestrator({ engine });

  let llmCalled = false;
  orchestrator.helper.llmClient = async () => {
    llmCalled = true;
    throw new Error("LLM should not be called for deterministic list reads.");
  };
  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async () => ({ status: "skipped" });
  orchestrator.helper._buildDocumentContextFallback = () => null;

  const result = await orchestrator.runChatTurn({
    message: "show his tasks",
    context: {
      conversationId: "conv-read-1",
      userId: "u-read-1",
      clientId: 7,
    },
    sessionId: "s-read-1",
    userId: "u-read-1",
    agentVersion: "v3",
  });

  assert.equal(llmCalled, false);
  assert.match(result.message, /Found 1 tasks/i);
  assert.match(result.message, /Prepare hearing file/i);
  assert.doesNotMatch(
    result.message,
    /I could not produce a valid structured response/i,
  );

  const graphCall = toolCalls.find((row) => row.toolName === "getEntityGraph");
  assert.ok(graphCall);
  assert.deepEqual(graphCall.params, {
    entityType: "client",
    entityId: 7,
    depth: 2,
    include: ["tasks"],
  });
});

