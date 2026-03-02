"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatOrchestrator } = require("./chat.orchestrator");
const { getChatOrchestratorState, updateChatOrchestratorState } = require("./chat.session.state");

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

function buildEngine({ llmHistory = {} } = {}) {
  const operationalStore = buildOperationalStore();
  const mutationCalls = [];
  const storedProposals = [];
  return {
    mutationCalls,
    storedProposals,
    _resolvePolicy: () => ({ version: "v3", allowedToolCategories: ["read", "draft"] }),
    ledger: { record: () => {} },
    contextStore: {
      _operationalStore: operationalStore,
      getContextForLLMInjection: () => llmHistory,
    },
    toolRegistry: new Map(),
    ajv: { compile: () => () => true },
    executeToolV2: async (toolName, input) => {
      mutationCalls.push({ toolName, input });
      if (toolName !== "universalMutation") {
        throw new Error(`Unexpected tool: ${toolName}`);
      }
      const firstOp = input?.operations?.[0] || {};
      if (String(firstOp?.op || "").toUpperCase() === "CREATE_ENTITY") {
        const payloadEnvelope = firstOp?.payload || {};
        if (
          !payloadEnvelope ||
          typeof payloadEnvelope !== "object" ||
          Array.isArray(payloadEnvelope) ||
          !payloadEnvelope.payload ||
          typeof payloadEnvelope.payload !== "object" ||
          Array.isArray(payloadEnvelope.payload)
        ) {
          throw new Error("CREATE_ENTITY operation payload must contain nested payload object");
        }
      }
      return {
        result: {
          proposalId: "prop-1",
          status: "PROPOSED",
          actionType: String(input?.operations?.[0]?.op || "CREATE_ENTITY"),
          requiresConfirmation: true,
          humanReadableSummary: "Mutation proposal",
          affectedEntities: [{ type: "lawsuit", id: null, operation: "create" }],
          reversible: true,
          version: "v3",
          posture: "WORK",
          confirmation: {},
          snapshot: null,
          sessionId: "s-1",
          params: input?.operations?.[0]?.payload || {},
        },
      };
    },
    storeProposal: (proposal, contextSnapshot) => {
      storedProposals.push({
        proposal,
        contextSnapshot: contextSnapshot || {},
      });
    },
  };
}

test("clarification trap escape: unrelated new intent clears pending clarification", async () => {
  const engine = buildEngine();
  const orchestrator = new ChatOrchestrator({ engine });

  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async ({ userMessage }) => {
    if (/lawsuit/i.test(String(userMessage || ""))) {
      return {
        status: "ambiguous",
        suggestionArtifact: {
          type: "context_suggestion",
          message: "I could not find an exact lawsuit match. Please provide reference/title.",
          entityType: "lawsuit",
          suggestions: [
            {
              id: "lawsuit-101",
              entityType: "lawsuit",
              entityId: 101,
              label: "Commercial Dispute Alpha",
              reference: "LAW-2026-101",
              scope: { lawsuitId: 101 },
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            },
            {
              id: "lawsuit-102",
              entityType: "lawsuit",
              entityId: 102,
              label: "Commercial Dispute Beta",
              reference: "LAW-2026-102",
              scope: { lawsuitId: 102 },
              intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            },
          ],
        },
      };
    }
    return { status: "skipped" };
  };
  orchestrator.helper._buildDocumentContextFallback = ({ userMessage }) => {
    if (/summaris|summarise|summarize/i.test(String(userMessage || ""))) {
      return { message: "Dossier summary path executed." };
    }
    return null;
  };

  const requestBase = {
    context: {
      conversationId: "conv-clarify-trap",
      userId: "u-1",
      dossierId: 1,
      resolvedEntity: { type: "dossier", id: 1, label: "Divorce (DOS-2026-001)" },
    },
    sessionId: "s-1",
    userId: "u-1",
    agentVersion: "v3",
  };

  const turn1 = await orchestrator.runChatTurn({
    ...requestBase,
    message: "Open lawsuit for Divorce (DOS-2026-001)",
  });
  assert.equal(turn1.outputArtifact?.type, "context_suggestion");
  assert.match(turn1.message, /exact lawsuit match/i);

  const stateAfterTurn1 = getChatOrchestratorState(engine, {
    conversationId: "conv-clarify-trap",
    userId: "u-1",
  });
  assert.equal(Boolean(stateAfterTurn1.pendingClarification), true);

  const turn2 = await orchestrator.runChatTurn({
    ...requestBase,
    message: "summarise what we have in the dossier",
  });
  assert.equal(turn2.message, "Dossier summary path executed.");
  assert.equal(turn2.outputArtifact?.type, "chat");

  const stateAfterTurn2 = getChatOrchestratorState(engine, {
    conversationId: "conv-clarify-trap",
    userId: "u-1",
  });
  assert.equal(stateAfterTurn2.pendingClarification, null);
});

test("future create intent bypasses read-ambiguity and produces mutation proposal", async () => {
  const engine = buildEngine();
  const orchestrator = new ChatOrchestrator({ engine });

  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async () => ({ status: "skipped" });
  orchestrator.helper._buildDocumentContextFallback = () => null;
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({ entityType: "lawsuit", fields: {} });

  const result = await orchestrator.runChatTurn({
    message: "we will be having a lawsuit for the divorce case",
    context: {
      conversationId: "conv-mutation-governance",
      userId: "u-2",
      dossierId: 12,
      resolvedEntity: { type: "dossier", id: 12, label: "Divorce (DOS-2026-001)" },
    },
    sessionId: "s-1",
    userId: "u-2",
    agentVersion: "v3",
  });

  assert.equal(result?.outputArtifact?.type, "proposal");
  assert.equal(result?.mutationOutcome?.status, "PROPOSED");
  assert.equal(engine.mutationCalls.length, 1);
  assert.equal(engine.mutationCalls[0]?.toolName, "universalMutation");
  assert.equal(engine.mutationCalls[0]?.input?.operations?.[0]?.op, "CREATE_ENTITY");
  assert.equal(engine.mutationCalls[0]?.input?.operations?.[0]?.entityType, "lawsuit");
  assert.equal(engine.storedProposals.length, 1);
  assert.equal(engine.storedProposals[0]?.contextSnapshot?.proposalKind, "entity_mutation");
  assert.equal(engine.storedProposals[0]?.contextSnapshot?.origin, "strong_mutation_intent");
  assert.equal(engine.storedProposals[0]?.contextSnapshot?.strongMutationIntent, true);
});

test("pending clarification is cleared when new turn routes to mutation governance", async () => {
  const engine = buildEngine();
  const orchestrator = new ChatOrchestrator({ engine });

  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async () => ({ status: "skipped" });
  orchestrator.helper._buildDocumentContextFallback = () => null;
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({ entityType: "lawsuit", fields: {} });

  updateChatOrchestratorState(engine, {
    conversationId: "conv-clear-pending",
    userId: "u-3",
  }, {
    pendingClarification: {
      entityType: "lawsuit",
      resumeState: "RETRIEVE",
      createdAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 60000).toISOString(),
      turnsRemaining: 2,
      artifact: {
        type: "context_suggestion",
        message: "I could not find an exact match.",
        suggestions: [],
      },
    },
    activeState: "CLARIFY",
  });

  await orchestrator.runChatTurn({
    message: "we will be having a lawsuit for the divorce case",
    context: {
      conversationId: "conv-clear-pending",
      userId: "u-3",
      dossierId: 77,
      resolvedEntity: { type: "dossier", id: 77 },
    },
    sessionId: "s-1",
    userId: "u-3",
    agentVersion: "v3",
  });

  const stateAfter = getChatOrchestratorState(engine, {
    conversationId: "conv-clear-pending",
    userId: "u-3",
  });
  assert.equal(stateAfter.pendingClarification, null);
});

test("future create intent uses conversation activeScope dossier when request context lacks dossierId", async () => {
  const engine = buildEngine({
    llmHistory: {
      conversationScope: {
        activeScope: {
          entityType: "dossier",
          entityId: 10,
          source: "resolved",
          confidence: 1,
        },
      },
    },
  });
  const orchestrator = new ChatOrchestrator({ engine });

  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async () => ({ status: "skipped" });
  orchestrator.helper._buildDocumentContextFallback = () => null;
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({ entityType: "lawsuit", fields: { dossier_id: null } });

  const result = await orchestrator.runChatTurn({
    message: "oh my god they did not agree, we will be having a lawsuit for the divorce case, its a shame",
    context: {
      conversationId: "conv-active-scope-only",
      userId: "u-4",
      clientId: 4,
      resolvedEntity: { type: "client", id: 4 },
    },
    sessionId: "s-1",
    userId: "u-4",
    agentVersion: "v3",
  });

  assert.equal(result?.outputArtifact?.type, "proposal");
  assert.equal(engine.mutationCalls.length, 1);
  assert.equal(engine.mutationCalls[0]?.input?.operations?.[0]?.op, "CREATE_ENTITY");
  assert.equal(engine.mutationCalls[0]?.input?.operations?.[0]?.entityType, "lawsuit");
  assert.equal(
    Number(engine.mutationCalls[0]?.input?.operations?.[0]?.payload?.payload?.dossier_id),
    10,
  );
});

test("after lawsuit mutation context, create task routes to task entityType", async () => {
  const engine = buildEngine();
  const orchestrator = new ChatOrchestrator({ engine });

  orchestrator.helper._resolvePosture = async () => "ASSISTANT";
  orchestrator._discoverScopeBeforeContract = async () => ({ status: "skipped" });
  orchestrator.helper._buildDocumentContextFallback = () => null;
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({ fields: { title: "prepare evidence list", due_date: "2026-03-05" } });

  const result = await orchestrator.runChatTurn({
    message: "create a task to prepare evidence list",
    context: {
      conversationId: "conv-lawsuit-then-task",
      userId: "u-5",
      dossierId: 10,
      previousMutationContext: { entityType: "lawsuit" },
      resolvedEntity: { type: "dossier", id: 10 },
    },
    sessionId: "s-1",
    userId: "u-5",
    agentVersion: "v3",
  });

  assert.equal(result?.outputArtifact?.type, "proposal");
  assert.equal(engine.mutationCalls.length, 1);
  assert.equal(engine.mutationCalls[0]?.input?.operations?.[0]?.entityType, "task");
  assert.equal(
    String(engine.mutationCalls[0]?.input?.operations?.[0]?.payload?.entityType || "").toLowerCase(),
    "task",
  );
});
