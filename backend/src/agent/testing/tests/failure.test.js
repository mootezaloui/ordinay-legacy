"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { withInjectedFailure } = require("../failure.injector");
const { runScenario } = require("../scenario.runner");
const { getScenarioFixture } = require("../scenario.fixtures");
const { createLiveRuntime } = require("../runtime.resolver");

test("LLM provider failure is surfaced without crashing process", async () => {
  const runtime = createLiveRuntime();
  const fixture = {
    id: "llm_failure_probe",
    description: "Direct loop execution with injected LLM failure",
    target: "loop_core",
    input: {
      sessionId: "llm_failure_session",
      turnId: `llm_failure_turn_${Date.now()}`,
      message: "Provide a concise status update.",
      metadata: {},
    },
    expect: {},
  };
  await assert.rejects(async () =>
    withInjectedFailure(runtime, "llm_provider_failure", async () => {
      await runScenario(fixture, {
        runtime,
        skipAssertions: true,
      });
    }),
  );
});

test("rate limiter denial is emitted through SSE error path", async () => {
  const runtime = createLiveRuntime();
  const fixture = {
    ...getScenarioFixture("simple_read_only_query"),
    target: "sse_handler",
  };
  await withInjectedFailure(runtime, "rate_limiter_denial", async () => {
    const result = await runScenario(fixture, {
      runtime,
      skipAssertions: true,
    });
    const errorEvents = result.events.filter((event) => event.event === "error");
    assert.ok(errorEvents.length > 0);
  });
});

test("permission boundary mismatch fails closed on tool call", async () => {
  const runtime = createLiveRuntime();
  const fixture = {
    ...getScenarioFixture("write_proposal_pending"),
    expect: {},
    assert: null,
  };
  await withInjectedFailure(runtime, "permission_boundary_mismatch", async () => {
    const result = await runScenario(fixture, {
      runtime,
      skipAssertions: true,
    });
    const toolCalls = Array.isArray(result.output?.toolCalls) ? result.output.toolCalls : [];
    assert.ok(toolCalls.length > 0);
    assert.equal(toolCalls[0].errorCode, "SECURITY_PERMISSION_BOUNDARY_VIOLATION");
  });
});

test("persistence append failure stays non-crashing on turn completion", async () => {
  const runtime = createLiveRuntime();
  await withInjectedFailure(runtime, "persistence_append_failure", async () => {
    const result = await runScenario("simple_read_only_query", {
      runtime,
      skipAssertions: true,
    });
    assert.equal(result.target, "loop_core");
  });
});
