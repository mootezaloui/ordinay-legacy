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

test("chat strong mutation intent resolves direct named client mutation before clarification", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

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
      if (toolName === "listClients") {
        return {
          result: {
            clients: [{ id: 12, name: "Mootez Aloui", status: "active" }],
            count: 1,
          },
        };
      }
      if (toolName === "propose_entity_mutation") {
        return {
          result: {
            proposalId: "v3-UPDATE_ENTITY-stage3-client-name",
            status: "PROPOSED",
            actionType: "UPDATE_ENTITY",
            requiresConfirmation: true,
            humanReadableSummary: "Update client #12 fields [status]",
            affectedEntities: [{ type: "client", id: 12, operation: "update" }],
            reversible: true,
            version: "v3",
            posture: "WORK",
            snapshot: {
              scope: "client",
              scopeId: 12,
              hash: "sha256:test",
              timestamp: new Date().toISOString(),
            },
            sessionId: "chat-sess",
            params: {
              entityType: "client",
              entityId: 12,
              changes: { status: "inactive" },
            },
          },
        };
      }
      throw new Error(`Unexpected tool: ${toolName}`);
    },
    storeProposal() {},
  };

  const service = new ChatAgentService({ engine, mutationIntentExtractor: async () => null });

  try {
    const result = await service._tryHandleStrongMutationIntentDetection({
      userMessage: "Mootez Aloui is not my client anymore.",
      effectiveUserMessage: "Mootez Aloui is not my client anymore.",
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
    assert.equal(calls.some((c) => c.toolName === "listClients"), true);
    assert.equal(calls.some((c) => c.toolName === "propose_entity_mutation"), true);
    assert.equal(
      calls.some((c) => c.toolName === "listClients" && String(c.args?.query || "") === "Mootez Aloui"),
      true,
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

test("run() bypasses advisory llm when strong mutation intent + resolved entity", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  const opState = new Map();
  const calls = [];
  let llmCalled = false;

  const engine = {
    ajv: { compile: () => () => true },
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
      getContextForLLMInjection() {
        return {};
      },
    },
    _resolvePolicy() {
      return { version: "v3" };
    },
    executeToolV2: async (toolName, args) => {
      calls.push({ toolName, args });
      if (toolName === "listClients") {
        return { result: { clients: [{ id: 12, name: "Mootez Aloui" }], count: 1 } };
      }
      if (toolName === "propose_entity_mutation") {
        return {
          result: {
            proposalId: "p-1",
            status: "PROPOSED",
            actionType: "UPDATE_ENTITY",
            requiresConfirmation: true,
            humanReadableSummary: "Update client",
            affectedEntities: [{ type: "client", id: 12, operation: "update" }],
            reversible: true,
            version: "v3",
            posture: "WORK",
            params: { entityType: "client", entityId: 12, changes: { status: "inactive" } },
          },
        };
      }
      throw new Error(`Unexpected tool ${toolName}`);
    },
    toolRegistry: { get: () => null },
    storeProposal() {},
  };

  const service = new ChatAgentService({
    engine,
    mutationIntentExtractor: async () => null,
    llmClient: async () => {
      llmCalled = true;
      throw new Error("LLM should not be called for forced mutation proposal");
    },
  });

  try {
    const result = await service.run({
      message: "client mootez aloui is not mine anymore",
      context: { conversationId: "chat-sess", userId: "user-1" },
      sessionId: "chat-sess",
      agentVersion: "v3",
      userId: "user-1",
    });
    assert.ok(result);
    assert.equal(result.ambiguityArtifact?.type, "proposal");
    assert.equal(llmCalled, false);
    assert.equal(calls.some((c) => c.toolName === "propose_entity_mutation"), true);
  } finally {
    if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
    else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
    if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
    else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
    if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
    else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
  }
});

test("follow-up confirmation resumes persisted candidate mutation proposal", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  const opState = new Map();
  const key = "user-1:chat-sess";
  opState.set(key, {
    candidateMutation: {
      detectorResult: {
        decision: "propose",
        proposalInput: {
          entityType: "client",
          entityId: "12",
          operation: "update",
          payload: { status: "inactive" },
          reasoningSummary: "resume",
        },
        scores: { finalConfidence: 0.95, components: {} },
        metadata: { field: "status" },
        risk: "low",
        requiresExtraConfirmation: false,
      },
      createdAt: new Date().toISOString(),
    },
    pendingMutationProposal: null,
    suppressMutationDetectionUntilResolved: false,
  });

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
          const k = `${userId}:${sessionId}`;
          const next = { ...(opState.get(k) || {}), ...updates };
          opState.set(k, next);
          return next;
        },
      },
    },
    async executeToolV2(toolName, args) {
      calls.push({ toolName, args });
      if (toolName === "propose_entity_mutation") {
        return {
          result: {
            proposalId: "resume-proposal",
            status: "PROPOSED",
            actionType: "UPDATE_ENTITY",
            requiresConfirmation: true,
            humanReadableSummary: "Update client",
            affectedEntities: [{ type: "client", id: 12, operation: "update" }],
            reversible: true,
            version: "v3",
            posture: "WORK",
            params: { entityType: "client", entityId: 12, changes: { status: "inactive" } },
          },
        };
      }
      throw new Error(`Unexpected tool ${toolName}`);
    },
    storeProposal() {},
  };

  const service = new ChatAgentService({ engine, mutationIntentExtractor: async () => null });
  try {
    const result = await service._tryHandleStrongMutationIntentDetection({
      userMessage: "can you do it please",
      effectiveUserMessage: "can you do it please",
      requestContext: { conversationId: "chat-sess", userId: "user-1" },
      executionContext: { conversationId: "chat-sess", sessionId: "chat-sess", userId: "user-1", dataAccess: {} },
      llmHistory: {},
      policy: { version: "v3" },
    });
    assert.ok(result);
    assert.equal(result.ambiguityArtifact?.type, "proposal");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].toolName, "propose_entity_mutation");
  } finally {
    if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
    else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
    if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
    else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
    if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
    else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
  }
});

test("advisory phrase remains advisory (no forced mutation proposal)", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  const opState = new Map();
  let llmCalled = false;
  const engine = {
    ajv: { compile: () => () => true },
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
      getContextForLLMInjection() {
        return {};
      },
    },
    _resolvePolicy() {
      return { version: "v3" };
    },
    toolRegistry: { get: () => null, list: () => [] },
  };
  const service = new ChatAgentService({
    engine,
    mutationIntentExtractor: async () => null,
    llmClient: async () => {
      llmCalled = true;
      return { content: "You should reassign the client and update internal records.", tool_calls: [] };
    },
  });
  try {
    const result = await service.run({
      message: "what should I do if a client is no longer mine?",
      context: { conversationId: "chat-sess", userId: "user-1" },
      sessionId: "chat-sess",
      userId: "user-1",
      agentVersion: "v3",
    });
    assert.ok(result);
    assert.equal(result.ambiguityArtifact, null);
    assert.equal(String(result.message).toLowerCase().includes("confirm"), false);
    assert.equal(String(result.message).toLowerCase().includes("proposal"), false);
    assert.equal(opState.get("user-1:chat-sess")?.mode, "informational");
  } finally {
    if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
    else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
    if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
    else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
    if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
    else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
  }
});

test("semantic normalization examples (dead/transfer/FR) produce execution proposal path, not advisory", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "0";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  const samples = [
    "client mootez aloui is dead",
    "i have transfered the client mootez aloui to another lawyer",
    "je viens de perdre mon client Mootez aloui",
  ];

  for (const sample of samples) {
    const opState = new Map();
    let llmCalled = false;
    const calls = [];
    const engine = {
      ajv: { compile: () => () => true },
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
        getContextForLLMInjection() {
          return {};
        },
      },
      _resolvePolicy() {
        return { version: "v3" };
      },
      executeToolV2: async (toolName, args) => {
        calls.push({ toolName, args });
        if (toolName === "listClients") {
          return { result: { clients: [{ id: 12, name: "Mootez Aloui" }], count: 1 } };
        }
        if (toolName === "propose_entity_mutation") {
          return {
            result: {
              proposalId: "semantic-example-proposal",
              status: "PROPOSED",
              actionType: "UPDATE_ENTITY",
              requiresConfirmation: true,
              humanReadableSummary: "Update client",
              affectedEntities: [{ type: "client", id: 12, operation: "update" }],
              reversible: true,
              version: "v3",
              posture: "WORK",
              params: { entityType: "client", entityId: 12, changes: { status: "inactive" } },
            },
          };
        }
        throw new Error(`Unexpected tool ${toolName} for sample: ${sample}`);
      },
      toolRegistry: { get: () => null, list: () => [] },
      storeProposal() {},
    };

    const service = new ChatAgentService({
      engine,
      mutationIntentExtractor: async () => null,
      llmClient: async () => {
        llmCalled = true;
        return { content: "advisory fallback", tool_calls: [] };
      },
    });

    const result = await service.run({
      message: sample,
      context: { conversationId: `chat-${Math.random()}`, userId: "user-1" },
      sessionId: `chat-${Math.random()}`,
      userId: "user-1",
      agentVersion: "v3",
    });
    assert.ok(result, sample);
    assert.equal(result.ambiguityArtifact?.type, "proposal", sample);
    assert.equal(llmCalled, false, sample);
    assert.equal(calls.some((c) => c.toolName === "propose_entity_mutation"), true, sample);
  }

  if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
  else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
  if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
  else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
  if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
  else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
});
