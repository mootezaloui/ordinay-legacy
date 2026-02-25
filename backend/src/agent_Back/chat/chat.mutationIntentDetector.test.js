"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectStrongMutationIntent,
} = require("./chat.mutationIntentDetector");

function withEnv(vars, fn) {
  const previous = {};
  for (const [k, v] of Object.entries(vars)) {
    previous[k] = process.env[k];
    if (v === null) {
      delete process.env[k];
    } else {
      process.env[k] = String(v);
    }
  }
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [k, v] of Object.entries(previous)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    });
}

test("detectStrongMutationIntent proposes low-risk single-field update", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Move hearing 42 to March 12, 2026",
        executionContext: {},
        llmHistory: {},
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "session");
      assert.equal(result.proposalInput.entityId, "42");
      assert.equal(result.proposalInput.operation, "update");
      assert.equal(result.proposalInput.payload.scheduled_at, "2026-03-12");
      assert.equal(result.risk, "low");
      assert.ok(result.scores.finalConfidence >= 0.85);
    },
  ));

test("detectStrongMutationIntent asks clarification for ambiguous temporal value", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Set hearing 42 date to 03/04",
        executionContext: {},
        llmHistory: {},
      });

      assert.equal(result.decision, "clarify");
      assert.match(String(result.question), /ambiguous/i);
      assert.equal(result.reason, "temporal_value_ambiguous");
    },
  ));

test("detectStrongMutationIntent uses adapter-defined alias metadata (dossier stage -> phase)", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Change dossier 5 stage to execution",
        executionContext: {},
        llmHistory: {},
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "dossier");
      assert.equal(result.proposalInput.entityId, "5");
      assert.deepEqual(result.proposalInput.payload, { phase: "execution" });
    },
  ));

test("detectStrongMutationIntent uses adapter valueParsers metadata for non-suffix temporal field (lawsuit next_hearing)", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Change lawsuit 20 next hearing to March 12, 2026",
        executionContext: {},
        llmHistory: {},
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "lawsuit");
      assert.equal(result.proposalInput.entityId, "20");
      assert.deepEqual(result.proposalInput.payload, { next_hearing: "2026-03-12" });
    },
  ));

test("detectStrongMutationIntent resolves direct client mutation by name and proposes status update", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Mootez Aloui is not my client anymore",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async ({ entityType, query }) => {
          assert.equal(entityType, "client");
          assert.equal(query, "Mootez Aloui");
          return { kind: "one", id: 101, matchKind: "exact" };
        },
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "client");
      assert.equal(result.proposalInput.entityId, "101");
      assert.equal(String(result.proposalInput.payload.status).toLowerCase(), "inactive");
    },
  ));

test("detectStrongMutationIntent resolves direct client mutation by name with case variation", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      let capturedQuery = null;
      const result = await detectStrongMutationIntent({
        message: "mootez aloui is not my client anymore.",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async ({ entityType, query }) => {
          capturedQuery = query;
          return { kind: "one", id: 102, matchKind: "exact" };
        },
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "client");
      assert.equal(result.proposalInput.entityId, "102");
      assert.equal(String(result.proposalInput.payload.status).toLowerCase(), "inactive");
      assert.equal(capturedQuery, "mootez aloui");
    },
  ));

test("detectStrongMutationIntent resolves direct name mutation without prior context", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Mootez Aloui is not my client anymore",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async () => ({ kind: "one", id: 103, matchKind: "exact" }),
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityId, "103");
      assert.equal(result.scores.components.entityResolutionConfidence >= 0.9, true);
    },
  ));

test("detectStrongMutationIntent asks disambiguation when multiple name matches exist", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Mootez Aloui is not my client anymore",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async () => ({
          kind: "many",
          candidates: [
            { id: 1, label: "Mootez Aloui" },
            { id: 2, label: "Mootez Aloui (Company)" },
          ],
          total: 2,
          overflow: false,
        }),
      });

      assert.equal(result.decision, "clarify");
      assert.equal(result.reason, "entity_resolution_multiple_matches");
      assert.match(String(result.question), /Did you mean/i);
      assert.match(String(result.question), /Mootez Aloui/);
      assert.equal(
        String(result.question).includes("entity type and ID"),
        false,
        "must not ask for type+ID when name lookup is possible",
      );
    },
  ));

test("detectStrongMutationIntent asks not-found clarification when named entity is missing", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Mootez Aloui is not my client anymore",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async () => ({ kind: "none" }),
      });

      assert.equal(result.decision, "clarify");
      assert.equal(result.reason, "entity_resolution_name_not_found");
      assert.match(String(result.question), /couldn't find/i);
      assert.equal(String(result.question).includes("entity type and ID"), false);
    },
  ));

test("detectStrongMutationIntent resolves non-client entity by name (close dossier title)", async () =>
  withEnv(
    {
      AGENT_MUTATION_INTENT_DETECTION: "1",
      AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
      AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
      AGENT_MUTATION_INTENT_ALLOW_HIGH_RISK: "1",
    },
    async () => {
      const result = await detectStrongMutationIntent({
        message: "Close Dossier Title*",
        executionContext: {},
        llmHistory: {},
        entityNameResolver: async ({ entityType, query }) => {
          assert.equal(entityType, "dossier");
          assert.equal(query, "Title*");
          return { kind: "one", id: 55, matchKind: "exact" };
        },
      });

      assert.equal(result.decision, "propose");
      assert.equal(result.proposalInput.entityType, "dossier");
      assert.equal(result.proposalInput.entityId, "55");
      assert.deepEqual(result.proposalInput.payload, { status: "closed" });
    },
  ));
