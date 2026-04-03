"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase6 transport: sse emits suggestion_artifact from loop metadata fallback", async () => {
  const runtime = createLiveRuntime();
  const loop = runtime?.loop;
  if (!loop || typeof loop.run !== "function") {
    throw new Error("Expected runtime.loop.run to be available.");
  }

  const originalRun = loop.run.bind(loop);
  loop.run = async (input, session) => {
    const turnType = "NEW";
    const output = {
      sessionId: input.sessionId,
      turnId: input.turnId,
      turnType,
      responseText: "I prepared a targeted suggestion for you.",
      pendingAction: null,
      toolCalls: [],
      audit: [],
      metadata: {
        suggestionArtifact: {
          version: "v1",
          domain: "execute",
          trigger: "implicit_intent",
          actionType: "update",
          targetType: "task",
          title: "Suggested Task Status Update",
          reason: "The request implies an update but does not explicitly ask for immediate execution.",
          linkedEntityType: "task",
          linkedEntityId: 77,
          prefillData: {
            operation: "update",
            entityType: "task",
            changes: { status: { from: "pending", to: "in_progress" } },
          },
        },
      },
    };
    if (session) {
      session.state.lastTurnType = turnType;
    }
    return output;
  };

  try {
    const result = await runScenario(
      {
        id: "phase6_transport_sse_suggestion_fallback",
        target: "sse_handler",
        input: {
          sessionId: "phase6_transport_sse_suggestion_fallback_session",
          turnId: "phase6_transport_sse_suggestion_fallback_turn",
          message: "i should update task 77 status.",
          metadata: { security: { authScope: "execute" } },
        },
        requestUser: { id: "phase6_transport_user", scope: "execute" },
      },
      { runtime, skipAssertions: true },
    );

    const suggestionEvents = result.events.filter((event) => event.event === "suggestion_artifact");
    assert.equal(suggestionEvents.length, 1, "Expected one suggestion_artifact SSE event.");
    const artifact = toRecord(suggestionEvents[0]?.data)?.artifact;
    assert.ok(artifact, "Expected artifact payload in suggestion_artifact event.");
    assert.equal(artifact.domain, "execute");
    assert.equal(artifact.actionType, "update");
    assert.equal(artifact.trigger, "implicit_intent");
    assert.equal(artifact.targetType, "task");
  } finally {
    loop.run = originalRun;
  }
});

function toRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value;
}
