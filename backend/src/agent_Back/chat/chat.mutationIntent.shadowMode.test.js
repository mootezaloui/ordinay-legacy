"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { detectStrongMutationIntent } = require("./chat.mutationIntentDetector");

test("detector returns propose decision with shadowMode flag when shadow mode enabled", async () => {
  const prev = {
    DETECTION: process.env.AGENT_MUTATION_INTENT_DETECTION,
    SHADOW: process.env.AGENT_MUTATION_INTENT_SHADOW_MODE,
    LLM: process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR,
  };
  process.env.AGENT_MUTATION_INTENT_DETECTION = "1";
  process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = "1";
  process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = "0";

  try {
    const result = await detectStrongMutationIntent({
      message: "Update task 123 status to completed",
      executionContext: {},
      llmHistory: {},
    });
    assert.equal(result.decision, "propose");
    assert.equal(result.shadowMode, true);
  } finally {
    if (prev.DETECTION === undefined) delete process.env.AGENT_MUTATION_INTENT_DETECTION;
    else process.env.AGENT_MUTATION_INTENT_DETECTION = prev.DETECTION;
    if (prev.SHADOW === undefined) delete process.env.AGENT_MUTATION_INTENT_SHADOW_MODE;
    else process.env.AGENT_MUTATION_INTENT_SHADOW_MODE = prev.SHADOW;
    if (prev.LLM === undefined) delete process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR;
    else process.env.AGENT_MUTATION_INTENT_LLM_EXTRACTOR = prev.LLM;
  }
});
