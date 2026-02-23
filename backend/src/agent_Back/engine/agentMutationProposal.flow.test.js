"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createActionProposal, ACTION_STATUS } = require("../contracts/actionProposal.contract");
const { storeProposal, confirmProposal } = require("./confirmation");

function makeEngineStub() {
  return {
    ledger: { record() {} },
    toolRegistry: { get() { return null; } },
    async _computeSnapshotHash() {
      return "sha256:null";
    },
  };
}

test("confirmProposal blocks CREATE_ENTITY proposal without explicit mutation command origin metadata", async () => {
  const engine = makeEngineStub();
  const proposal = createActionProposal({
    proposalId: `v3-CREATE_ENTITY-${Date.now()}-test`,
    actionType: "CREATE_ENTITY",
    toolCategory: "execute",
    params: {
      entityType: "task",
      payload: {
        dossier_id: 1,
        title: "Test task",
      },
    },
    reversible: true,
    requiresConfirmation: true,
    humanReadableSummary: "Create task (reason: explicit test)",
    affectedEntities: [{ type: "task", id: "new" }],
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot: {
      scope: "task",
      scopeId: "new",
      hash: "sha256:null",
      timestamp: new Date().toISOString(),
    },
    sessionId: "sess-test",
  });

  storeProposal.call(engine, proposal, {
    proposalKind: "entity_mutation",
    // explicitMutationCommand intentionally omitted
  });

  const result = await confirmProposal.call(engine, {
    proposalId: proposal.proposalId,
    sessionId: "sess-test",
    userId: 7,
  });

  assert.equal(result.type, "execution_result");
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "EXPLICIT_MUTATION_COMMAND_REQUIRED");
  assert.equal(result.error.requiresReproposal, true);
});

test("confirmProposal allows UPDATE_ENTITY proposal from strong mutation intent origin", async () => {
  const engine = makeEngineStub();
  const proposal = createActionProposal({
    proposalId: `v3-UPDATE_ENTITY-${Date.now()}-strong-intent`,
    actionType: "UPDATE_ENTITY",
    toolCategory: "execute",
    params: {
      entityType: "task",
      entityId: 123,
      changes: { status: "completed" },
    },
    reversible: true,
    requiresConfirmation: true,
    humanReadableSummary: "Update task #123 (reason: detected strong intent)",
    affectedEntities: [{ type: "task", id: 123 }],
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot: {
      scope: "task",
      scopeId: 123,
      hash: "sha256:null",
      timestamp: new Date().toISOString(),
    },
    sessionId: "sess-stage3",
  });

  storeProposal.call(engine, proposal, {
    proposalKind: "entity_mutation",
    origin: "strong_mutation_intent",
    strongMutationIntent: true,
    detectionConfidence: 0.93,
  });

  const modulePath = require.resolve("./universalOperations");
  const previousExports = require.cache[modulePath]?.exports;
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: {
      executeCreateEntity: async () => {
        throw new Error("not used");
      },
      executeUpdateEntity: async () => ({ id: 123, status: "completed" }),
      executeDeleteEntity: async () => {
        throw new Error("not used");
      },
      executeLinkEntities: async () => {
        throw new Error("not used");
      },
      executeAttachToEntity: async () => {
        throw new Error("not used");
      },
    },
  };

  try {
    const result = await confirmProposal.call(engine, {
      proposalId: proposal.proposalId,
      sessionId: "sess-stage3",
      userId: 7,
    });

    assert.equal(result.type, "execution_result");
    assert.equal(result.status, "success");
    assert.equal(result.executedActions[0].actionType, "UPDATE_ENTITY");
  } finally {
    if (previousExports) {
      require.cache[modulePath].exports = previousExports;
    } else {
      delete require.cache[modulePath];
    }
  }
});

test("confirmProposal requires ackRisk for high-risk strong-intent mutation proposals", async () => {
  const engine = makeEngineStub();
  const proposal = createActionProposal({
    proposalId: `v3-UPDATE_ENTITY-${Date.now()}-risk-ack`,
    actionType: "UPDATE_ENTITY",
    toolCategory: "execute",
    params: {
      entityType: "task",
      entityId: 999,
      changes: { status: "closed" },
    },
    reversible: true,
    requiresConfirmation: true,
    humanReadableSummary: "Update task #999 status closed",
    affectedEntities: [{ type: "task", id: 999 }],
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot: {
      scope: "task",
      scopeId: 999,
      hash: "sha256:null",
      timestamp: new Date().toISOString(),
    },
    sessionId: "sess-risk",
  });

  storeProposal.call(engine, proposal, {
    proposalKind: "entity_mutation",
    origin: "strong_mutation_intent",
    strongMutationIntent: true,
    requiresExtraConfirmation: true,
    riskLevel: "high",
  });

  const result = await confirmProposal.call(engine, {
    proposalId: proposal.proposalId,
    sessionId: "sess-risk",
    userId: 7,
    ackRisk: false,
  });

  assert.equal(result.type, "execution_result");
  assert.equal(result.status, "failed");
  assert.equal(result.error.code, "RISK_ACK_REQUIRED");
});

test("confirmProposal treats single /agent/chat confirm as risk acknowledgement for high-risk mutation proposals", async () => {
  const engine = makeEngineStub();
  const proposal = createActionProposal({
    proposalId: `v3-UPDATE_ENTITY-${Date.now()}-chat-risk-ack`,
    actionType: "UPDATE_ENTITY",
    toolCategory: "execute",
    params: {
      entityType: "client",
      entityId: 1,
      changes: { status: "inActive" },
    },
    reversible: true,
    requiresConfirmation: true,
    humanReadableSummary: "Update client #1 status inactive",
    affectedEntities: [{ type: "client", id: 1 }],
    status: ACTION_STATUS.PROPOSED,
    version: "v3",
    posture: "WORK",
    snapshot: {
      scope: "client",
      scopeId: 1,
      hash: "sha256:null",
      timestamp: new Date().toISOString(),
    },
    sessionId: "sess-chat-risk",
  });

  storeProposal.call(engine, proposal, {
    proposalKind: "entity_mutation",
    origin: "strong_mutation_intent",
    strongMutationIntent: true,
    sourceRoute: "/agent/chat",
    requiresExtraConfirmation: true,
    riskLevel: "high",
  });

  const modulePath = require.resolve("./universalOperations");
  const previousExports = require.cache[modulePath]?.exports;
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: {
      executeCreateEntity: async () => {
        throw new Error("not used");
      },
      executeUpdateEntity: async () => ({ ok: true, entityType: "client", entityId: 1, rowCount: 1 }),
      executeMutationWorkflow: async () => {
        throw new Error("not used");
      },
      executeDeleteEntity: async () => {
        throw new Error("not used");
      },
      executeLinkEntities: async () => {
        throw new Error("not used");
      },
      executeAttachToEntity: async () => {
        throw new Error("not used");
      },
    },
  };

  try {
    const result = await confirmProposal.call(engine, {
      proposalId: proposal.proposalId,
      sessionId: "sess-chat-risk",
      userId: 7,
      ackRisk: false,
    });

    assert.equal(result.type, "execution_result");
    assert.equal(result.status, "success");
    assert.equal(result.executedActions[0].actionType, "UPDATE_ENTITY");
  } finally {
    if (previousExports) {
      require.cache[modulePath].exports = previousExports;
    } else {
      delete require.cache[modulePath];
    }
  }
});
