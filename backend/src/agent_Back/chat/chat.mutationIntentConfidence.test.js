"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildScoreBreakdown,
} = require("./chat.mutationIntentConfidence");

test("buildScoreBreakdown computes weighted confidence and preserves hard gate failures", () => {
  const scores = buildScoreBreakdown({
    scores: {
      intentVerbClarity: 1,
      operationConfidence: 1,
      entityTypeConfidence: 1,
      entityResolutionConfidence: 1,
      fieldParseConfidence: 1,
      valueParseConfidence: 1,
      contextCoherenceConfidence: 1,
    },
    hardGateFailures: ["example_gate"],
    threshold: 0.85,
    entityThreshold: 0.93,
  });

  assert.equal(scores.finalConfidence, 1);
  assert.deepEqual(scores.hardGateFailures, ["example_gate"]);
  assert.equal(scores.threshold, 0.85);
  assert.equal(scores.entityThreshold, 0.93);
});
