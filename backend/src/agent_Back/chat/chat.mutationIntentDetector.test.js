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
