"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatAgentService } = require("./chat.agent.service");

test("chat strong mutation intent path creates proposal artifact and stores Stage 3 origin metadata", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  const stored = [];
  const opState = new Map();
  const calls = [];

  const engine = {
    ajv: {},
    ledger: { record() {} },
    contextStore: {
      _operationalStore: {
        get(userId, sessionId) {
          return opState.get(`${userId}:${sessionId}`) || null;
        },
        update(userId, sessionId, updates) {
          const key = `${userId}:${sessionId}`;
          const next = { ...(opState.get(key) || {}), ...updates };
          opState.set(key, next);
          return next;
        },
      },
    },
    async executeToolV2(toolName, args, _policy, context) {
      calls.push({ toolName, args, context });
      return {
        result: {
          proposalId: "v3-UPDATE_ENTITY-stage3-test",
          status: "PROPOSED",
          actionType: "UPDATE_ENTITY",
          requiresConfirmation: true,
          humanReadableSummary: "Update session #42 fields [scheduled_at]",
          affectedEntities: [{ type: "session", id: 42, operation: "update" }],
          reversible: true,
          version: "v3",
          posture: "WORK",
          snapshot: {
            scope: "session",
            scopeId: 42,
            hash: "sha256:test",
            timestamp: new Date().toISOString(),
          },
          sessionId: "chat-sess",
          params: {
            entityType: "session",
            entityId: 42,
            changes: { scheduled_at: "2026-03-12" },
          },
        },
      };
    },
    storeProposal(proposal, contextSnapshot) {
      stored.push({ proposal, contextSnapshot });
    },
  };

  const service = new ChatAgentService({ engine, mutationIntentExtractor: async () => null });

  try {
    const result = await service._tryHandleStrongMutationIntentDetection({
      userMessage: "Move hearing 42 to March 12, 2026",
      effectiveUserMessage: "Move hearing 42 to March 12, 2026",
      requestContext: {
        conversationId: "chat-sess",
        userId: "user-1",
      },
      executionContext: {
        sessionId: "chat-sess",
        userId: "user-1",
        tenantId: null,
        dataAccess: {},
      },
      llmHistory: {},
      policy: { version: "v3" },
    });

    assert.ok(result);
    assert.equal(result.ambiguityArtifact?.type, "proposal");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].toolName, "propose_entity_mutation");
    assert.equal(calls[0].context.strongMutationIntent, true);

    assert.equal(stored.length, 1);
    assert.equal(stored[0].contextSnapshot.origin, "strong_mutation_intent");
    assert.equal(stored[0].contextSnapshot.strongMutationIntent, true);
    assert.equal(stored[0].contextSnapshot.proposalKind, "entity_mutation");
    assert.ok(
      Number(stored[0].contextSnapshot.detectionConfidence) >= 0.85,
      "expected confidence to be stored",
    );
  } finally {
    if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
    else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
    if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
    else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
    if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
    else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
  }
});
