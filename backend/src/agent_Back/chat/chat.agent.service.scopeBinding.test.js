"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatAgentService } = require("./chat.agent.service");

function buildService() {
  const calls = {
    executeToolV2: [],
    storeProposal: [],
    transcript: [],
    operational: [],
    outcomeLedger: [],
  };

  const engine = {
    ajv: { compile: () => () => true },
    ledger: { record: () => {} },
    executeToolV2: async (...args) => {
      calls.executeToolV2.push(args);
      return {
        result: {
          proposalId: "prop-1",
          status: "proposed",
          actionType: "UPDATE_ENTITY",
          requiresConfirmation: true,
          humanReadableSummary: "Update task",
          affectedEntities: [{ type: "task", id: 123, operation: "update" }],
          reversible: true,
          version: "v3",
          posture: "WORK",
          confirmation: { preview: { root: { type: "task", id: 123 } } },
          snapshot: { scope: "task", scopeId: 123, hash: "sha256:x", timestamp: new Date().toISOString() },
          sessionId: "sess-1",
          params: { entityType: "task", entityId: 123, changes: { status: "done" } },
        },
      };
    },
    storeProposal: (proposal, contextSnapshot) => {
      calls.storeProposal.push({ proposal, contextSnapshot });
    },
  };

  const svc = new ChatAgentService({ engine });
  svc._resolveMutationOrchestrationPolicy = (policy) => policy;
  svc._resolveChatMutationExecutionMode = () => "confirm";
  svc._updateOperationalMutationDetectionState = (...args) => {
    calls.operational.push(args);
    return null;
  };
  svc._recordMutationOutcomeLedger = (...args) => {
    calls.outcomeLedger.push(args);
  };
  svc._recordTranscript = (payload) => {
    calls.transcript.push(payload);
  };
  svc._buildUserFacingMutationOutcomeMessage = () => "I can prepare this change. Confirm?";
  return { svc, engine, calls };
}

function baseDetectorResult() {
  return {
    proposalInput: {
      entityType: "task",
      entityId: "123",
      operation: "update",
      payload: { status: "done" },
      reasoningSummary: "Mark task done",
    },
    scores: { finalConfidence: 0.99 },
    risk: "low",
    requiresExtraConfirmation: false,
    metadata: { field: "status" },
  };
}

test("feature flag disabled skips scope binding resolver in strong-intent proposal creation", async () => {
  const prev = process.env.AGENT_SCOPE_BINDING_ENABLED;
  process.env.AGENT_SCOPE_BINDING_ENABLED = "0";
  try {
    const { svc, calls } = buildService();
    let resolverCalled = 0;
    let enrichCalled = 0;
    svc.scopeManager = {
      resolveBindingsForProposalInput: async () => {
        resolverCalled += 1;
        return { proposalInput: {} };
      },
    };
    svc._enrichCreateMutationProposalInputWithContext = async ({ detectorResult }) => {
      enrichCalled += 1;
      return JSON.parse(JSON.stringify(detectorResult.proposalInput));
    };

    const out = await svc._createMutationProposalFromStrongIntent({
      detectorResult: baseDetectorResult(),
      policy: { version: "v3" },
      executionContext: { sessionId: "sess-1", userId: "u1" },
      userMessage: "mark task as done",
    });

    assert.equal(resolverCalled, 0);
    assert.equal(enrichCalled, 1);
    assert.equal(out.bindingAudit, null);
    assert.equal(calls.executeToolV2.length, 1);
  } finally {
    if (prev === undefined) delete process.env.AGENT_SCOPE_BINDING_ENABLED;
    else process.env.AGENT_SCOPE_BINDING_ENABLED = prev;
  }
});

test("feature flag enabled uses scope binding resolver output in strong-intent proposal creation", async () => {
  const prev = process.env.AGENT_SCOPE_BINDING_ENABLED;
  process.env.AGENT_SCOPE_BINDING_ENABLED = "1";
  try {
    const { svc, calls } = buildService();
    let enrichCalled = 0;
    svc._enrichCreateMutationProposalInputWithContext = async () => {
      enrichCalled += 1;
      throw new Error("legacy enricher should not be called directly when scope manager mock handles resolution");
    };
    svc.scopeManager = {
      resolveBindingsForProposalInput: async ({ proposalInput }) => ({
        proposalInput: {
          ...proposalInput,
          payload: { ...(proposalInput.payload || {}), dossier_id: 77 },
        },
        bindingAudit: {
          applied: true,
          decision: "applied",
          source: "conversation_scope",
          reasonCode: "scope_parent_injected",
          resolutionPath: "tool_single_entity",
          injectedFields: ["dossier_id"],
        },
      }),
    };

    const out = await svc._createMutationProposalFromStrongIntent({
      detectorResult: baseDetectorResult(),
      policy: { version: "v3" },
      executionContext: { sessionId: "sess-1", userId: "u1" },
      userMessage: "mark task as done",
    });

    assert.equal(enrichCalled, 0);
    assert.equal(out.bindingAudit?.applied, true);
    assert.equal(out.toolArgs.payload.dossier_id, 77);
    const [toolName, args] = calls.executeToolV2[0];
    assert.equal(toolName, "propose_entity_mutation");
    assert.equal(args.payload.dossier_id, 77);
  } finally {
    if (prev === undefined) delete process.env.AGENT_SCOPE_BINDING_ENABLED;
    else process.env.AGENT_SCOPE_BINDING_ENABLED = prev;
  }
});

test("strong-intent proposal flow stores scopeBinding metadata and exposes it in proposal artifact when applied", async () => {
  const { svc, calls } = buildService();
  svc._createMutationProposalFromStrongIntent = async () => ({
    proposal: {
      proposalId: "prop-2",
      status: "proposed",
      actionType: "UPDATE_ENTITY",
      requiresConfirmation: true,
      humanReadableSummary: "Update task",
      affectedEntities: [{ type: "task", id: 123, operation: "update" }],
      reversible: true,
      version: "v3",
      posture: "WORK",
      confirmation: { preview: { root: { type: "task", id: 123 } } },
      snapshot: { scope: "task", scopeId: 123, hash: "sha256:x", timestamp: new Date().toISOString() },
      sessionId: "sess-1",
      params: { entityType: "task", entityId: 123, changes: { status: "done" } },
    },
    toolArgs: baseDetectorResult().proposalInput,
    bindingAudit: {
      applied: true,
      decision: "applied",
      source: "conversation_scope",
      reasonCode: "scope_parent_injected",
      resolutionPath: "tool_single_entity",
      injectedFields: ["dossier_id"],
    },
  });

  const result = await svc._executeDetectedMutationFlow({
    detectorResult: baseDetectorResult(),
    requestContext: { conversationId: "sess-1", userId: "u1" },
    executionContext: { conversationId: "sess-1", sessionId: "sess-1", userId: "u1" },
    policy: { version: "v3" },
    userMessage: "mark task as done",
  });

  assert.equal(calls.storeProposal.length, 1);
  assert.equal(calls.storeProposal[0].contextSnapshot.scopeBinding.applied, true);
  assert.equal(
    result?.ambiguityArtifact?.proposals?.[0]?.confirmation?.scopeBinding?.applied,
    true,
  );
});

test("strong-intent proposal flow keeps scopeBinding metadata internal when binding not applied", async () => {
  const { svc, calls } = buildService();
  svc._createMutationProposalFromStrongIntent = async () => ({
    proposal: {
      proposalId: "prop-3",
      status: "proposed",
      actionType: "UPDATE_ENTITY",
      requiresConfirmation: true,
      humanReadableSummary: "Update task",
      affectedEntities: [{ type: "task", id: 123, operation: "update" }],
      reversible: true,
      version: "v3",
      posture: "WORK",
      confirmation: { preview: { root: { type: "task", id: 123 } } },
      snapshot: { scope: "task", scopeId: 123, hash: "sha256:x", timestamp: new Date().toISOString() },
      sessionId: "sess-1",
      params: { entityType: "task", entityId: 123, changes: { status: "done" } },
    },
    toolArgs: baseDetectorResult().proposalInput,
    bindingAudit: {
      applied: false,
      decision: "skipped",
      source: "conversation_scope",
      reasonCode: "explicit_parent_binding_present",
      resolutionPath: "explicit_id",
      injectedFields: [],
    },
  });

  const result = await svc._executeDetectedMutationFlow({
    detectorResult: baseDetectorResult(),
    requestContext: { conversationId: "sess-1", userId: "u1" },
    executionContext: { conversationId: "sess-1", sessionId: "sess-1", userId: "u1" },
    policy: { version: "v3" },
    userMessage: "mark task as done",
  });

  assert.equal(calls.storeProposal.length, 1);
  assert.equal(calls.storeProposal[0].contextSnapshot.scopeBinding.applied, false);
  assert.equal(
    result?.ambiguityArtifact?.proposals?.[0]?.confirmation?.scopeBinding,
    undefined,
  );
});
