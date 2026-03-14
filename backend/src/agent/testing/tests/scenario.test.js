"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runScenario } = require("../scenario.runner");

const SCENARIOS = [
  "simple_read_only_query",
  "write_proposal_pending",
  "confirmation_execution",
  "rejection_path",
  "amendment_replaces_pending",
  "ambiguity_clarification",
  "guided_workflow_suggestion",
  "retrieval_assisted_answer",
  "grounded_citation_aware_response",
  "rate_limit_denial",
  "unknown_scope_read_only_allowed",
];

for (const scenarioId of SCENARIOS) {
  test(`scenario fixture: ${scenarioId}`, async () => {
    const result = await runScenario(scenarioId);
    assert.equal(result.fixture.id, scenarioId);
    assert.ok(result.target === "loop_core" || result.target === "sse_handler");
    if (result.target === "sse_handler") {
      const hasDone = result.events.some((event) => event.event === "done");
      assert.equal(hasDone, true, "Expected SSE done event");
    }
  });
}

