"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { replayTurnTrace, replayTraceSuite } = require("../replay.runner");

test("replayTurnTrace matches structural turn type for NEW", async () => {
  const replay = await replayTurnTrace({
    sessionId: "replay_session_new",
    turnId: "replay_turn_new_1",
    turnType: "NEW",
    response: { pendingPresent: false, toolCallsTotal: 0 },
  });
  assert.equal(replay.ok, true);
  assert.equal(replay.comparison.turnTypeMatch, true);
});

test("replayTraceSuite matches structural outcomes for mixed traces", async () => {
  const suite = await replayTraceSuite([
    {
      sessionId: "replay_suite_session_1",
      turnId: "replay_suite_turn_1",
      turnType: "NEW",
      response: { pendingPresent: false, toolCallsTotal: 0 },
    },
    {
      sessionId: "replay_suite_session_2",
      turnId: "replay_suite_turn_2",
      authScope: "execute",
      turnType: "CONFIRMATION",
      response: { pendingPresent: false, toolCallsTotal: 0 },
    },
    {
      sessionId: "replay_suite_session_3",
      turnId: "replay_suite_turn_3",
      turnType: "REJECTION",
      response: { pendingPresent: false, toolCallsTotal: 0 },
    },
  ]);

  assert.equal(suite.ok, true);
  assert.equal(suite.failures, 0);
  assert.equal(suite.results.length, 3);
});
