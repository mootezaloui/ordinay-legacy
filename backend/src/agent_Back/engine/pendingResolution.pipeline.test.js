"use strict";

const assert = require("assert");
const pipeline = require("./pipeline");

function buildEngine({
  resolveEntityImpl,
  executeDraftImpl,
  snapshotOutput,
  policy,
}) {
  const calls = {
    resolveEntity: [],
    executeDraft: [],
  };

  const engine = {
    ...pipeline,
    policies: {
      v1:
        policy ||
        {
          version: "v1",
          defaultReasoner: "rule",
          allowedIntents: ["GENERAL_CHAT", "DRAFT_CLIENT_EMAIL", "DRAFT_INVITATION"],
          allowedToolCategories: ["read", "draft"],
          allowExecution: false,
          allowExternalSearch: false,
          allowEnrichment: true,
        },
    },
    reasoners: { rule: { name: "rule" } },
    ledger: { record: () => ({ id: "ledger-1" }) },
    contextStore: {
      get: () =>
        snapshotOutput || {
          lastPosture: "WORK",
        },
    },
    _assertExecutionIntent: () => {},
    _updateConversationContext: () => {},
    async resolveEntity(payload) {
      calls.resolveEntity.push(payload);
      return resolveEntityImpl(payload);
    },
    async _executeDraftIntent(draftIntent, message, context) {
      calls.executeDraft.push({ draftIntent, message, context });
      return executeDraftImpl(draftIntent, message, context);
    },
  };

  return { engine, calls };
}

async function testSuggestionResolutionPath() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: true,
      entityType: "client",
      entityId: 42,
      entityLabel: "Brahim Trabelsi",
    }),
    executeDraftImpl: async () => ({
      intent: "DRAFT_CLIENT_EMAIL",
      agentVersion: "v1",
      reasoner: "draft-gate",
      output: { type: "CLIENT_EMAIL", content: "Draft..." },
    }),
  });

  const result = await pipeline.run.call(engine, {
    message: "Brahim Trabelsi",
    context: {},
    agentVersion: "v1",
    followUpIntent: {
      type: "FOLLOW_UP_INTENT",
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      entityType: "client",
      entityId: 42,
      origin: { entity: "CLIENT", entityId: 42 },
      scope: { clientId: 42 },
      originalIntent: "DRAFT_CLIENT_EMAIL",
      originalDraftType: "CLIENT_EMAIL",
      originalMessage: "Draft a payment reminder",
      resolvedEntity: { type: "client", id: 42, label: "Brahim Trabelsi" },
    },
  });

  assert.strictEqual(calls.resolveEntity[0].mode, "id");
  assert.strictEqual(calls.resolveEntity[0].entityType, "client");
  assert.strictEqual(calls.executeDraft.length, 1);
  assert.strictEqual(result.output.type, "CLIENT_EMAIL");
}

async function testManualNameResolutionSuccess() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: true,
      entityType: "client",
      entityId: 42,
      entityLabel: "Brahim Trabelsi",
    }),
    executeDraftImpl: async () => ({
      intent: "DRAFT_CLIENT_EMAIL",
      agentVersion: "v1",
      reasoner: "draft-gate",
      output: { type: "CLIENT_EMAIL", content: "Draft..." },
    }),
    snapshotOutput: {
      lastPosture: "WORK",
      lastOutput: {
        type: "context_suggestion",
        originalIntent: "DRAFT_CLIENT_EMAIL",
        originalDraftType: "CLIENT_EMAIL",
        originalMessage: "Draft a payment reminder",
        entityType: "client",
      },
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "Brahim Trabelsi",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(calls.resolveEntity[0].mode, "name");
  assert.strictEqual(calls.resolveEntity[0].identifier, "Brahim Trabelsi");
  assert.strictEqual(calls.executeDraft.length, 1);
  assert.strictEqual(result.output.type, "CLIENT_EMAIL");
}

async function testManualNameResolutionFailure() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: false,
      reason: "not_found",
      message: 'No client found matching "X"',
    }),
    executeDraftImpl: async () => {
      throw new Error("Should not execute draft");
    },
    snapshotOutput: {
      lastPosture: "WORK",
      lastOutput: {
        type: "context_suggestion",
        originalIntent: "DRAFT_CLIENT_EMAIL",
        originalDraftType: "CLIENT_EMAIL",
        originalMessage: "Draft a payment reminder",
        entityType: "client",
      },
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "X",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(calls.resolveEntity[0].mode, "name");
  assert.strictEqual(calls.executeDraft.length, 0);
  assert.strictEqual(result.reasoner, "pending-resolution");
  assert.strictEqual(result.resolutionMode, true);
  assert.ok(result.output.summary.includes('No client found matching "X"'));
}

async function testManualNameAmbiguousNarrowing() {
  const { engine, calls } = buildEngine({
    resolveEntityImpl: async () => ({
      found: false,
      reason: "ambiguous",
      message: 'Multiple clients match "Brahim".',
      candidates: [
        { id: 1, name: "Brahim Trabelsi", score: 0.9 },
        { id: 2, name: "Brahim Trabelsy", score: 0.88 },
      ],
    }),
    executeDraftImpl: async () => {
      throw new Error("Should not execute draft");
    },
    snapshotOutput: {
      lastPosture: "WORK",
      lastOutput: {
        type: "context_suggestion",
        originalIntent: "DRAFT_CLIENT_EMAIL",
        originalDraftType: "CLIENT_EMAIL",
        originalMessage: "Draft a payment reminder",
        entityType: "client",
      },
    },
  });

  const result = await pipeline.run.call(engine, {
    message: "Brahim",
    context: {},
    agentVersion: "v1",
  });

  assert.strictEqual(calls.resolveEntity[0].mode, "name");
  assert.strictEqual(calls.executeDraft.length, 0);
  assert.strictEqual(result.reasoner, "pending-resolution");
  assert.strictEqual(result.output.type, "context_suggestion");
  assert.ok(Array.isArray(result.output.suggestions));
  assert.strictEqual(result.output.suggestions.length, 2);
  assert.strictEqual(result.resolutionMode, true);
}

async function run() {
  await testSuggestionResolutionPath();
  await testManualNameResolutionSuccess();
  await testManualNameResolutionFailure();
  await testManualNameAmbiguousNarrowing();
  console.log("pendingResolution pipeline tests passed");
}

if (require.main === module) {
  run().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { run };

