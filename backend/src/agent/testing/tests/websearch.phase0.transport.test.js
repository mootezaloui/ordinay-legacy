"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");
const { runScenario } = require("../scenario.runner");

test("phase0 websearch transport: emits web_search_results artifact from mcpWebSearch metadata", async () => {
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
      responseText: "",
      pendingAction: null,
      toolCalls: [
        {
          id: "tool_record_websearch_1",
          toolName: "mcpWebSearch",
          args: { query: "latest tunis labor law updates" },
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          ok: true,
          metadata: {
            webSearchResult: {
              query: "latest tunis labor law updates",
              provider: "langsearch",
              status: "complete",
              reason: null,
              resultCount: 1,
              totalEstimatedMatches: 1,
              someResultsRemoved: false,
              results: [
                {
                  id: "1",
                  title: "Labor code update",
                  snippet: "Recent amendment summary",
                  url: "https://example.org/labor-code-update",
                  source: "Example Legal News",
                  publishedDate: "2026-03-20",
                },
              ],
              citation: { source: "langsearch", endpoint: "/v1/web-search" },
            },
          },
        },
      ],
      audit: [],
      metadata: {},
    };
    if (session) {
      session.state.lastTurnType = turnType;
    }
    return output;
  };

  try {
    const result = await runScenario(
      {
        id: "phase0_websearch_transport_artifact",
        target: "sse_handler",
        input: {
          sessionId: "phase0_websearch_transport_session",
          turnId: "phase0_websearch_transport_turn",
          message: "search web labor law update",
          metadata: {
            webSearchTrigger: "button",
            security: { authScope: "read" },
          },
        },
        requestUser: { id: "phase0_websearch_user", scope: "read" },
      },
      { runtime, skipAssertions: true },
    );

    const artifactEvents = result.events.filter((event) => event.event === "artifact");
    assert.equal(artifactEvents.length, 1, "Expected one artifact SSE event.");

    const payload = toRecord(artifactEvents[0]?.data);
    assert.equal(payload?.intent, "WEB_SEARCH");
    assert.equal(payload?.output?.type, "web_search_results");
    assert.equal(payload?.output?.searchIntent, "WEB_SEARCH");
    assert.equal(payload?.output?.triggeredBy, "button");
    assert.equal(payload?.output?.resultCount, 1);
    assert.equal(payload?.output?.results?.[0]?.url, "https://example.org/labor-code-update");
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
