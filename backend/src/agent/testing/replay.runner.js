"use strict";

const { runScenario } = require("./scenario.runner");

async function replayTurnTrace(trace, options = {}) {
  const fixture = buildReplayFixture(trace, options);
  const scenarioResult = await runScenario(fixture, {
    ...options,
    skipAssertions: true,
  });

  const comparison = compareReplayOutcome(trace, scenarioResult);
  return {
    ok: comparison.ok,
    trace,
    fixture,
    comparison,
    result: scenarioResult,
  };
}

async function replayTraceSuite(traces, options = {}) {
  const list = Array.isArray(traces) ? traces : [];
  const results = [];
  let failures = 0;
  for (const trace of list) {
    const replay = await replayTurnTrace(trace, options);
    results.push(replay);
    if (!replay.ok) {
      failures += 1;
    }
  }
  return {
    ok: failures === 0,
    count: results.length,
    failures,
    results,
  };
}

function buildReplayFixture(trace, options) {
  const row = isRecord(trace) ? trace : {};
  const sessionId = normalizeOptionalString(row.sessionId) || `replay_session_${Date.now()}`;
  const turnId = normalizeOptionalString(row.turnId) || `replay_turn_${Date.now()}`;
  const traceTurnType = normalizeOptionalString(row.turnType).toUpperCase();
  const message =
    normalizeOptionalString(row.message) ||
    normalizeOptionalString(options.defaultMessage) ||
    defaultReplayMessage(traceTurnType, turnId);
  const target = normalizeOptionalString(options.target) || "loop_core";
  const authScope = resolveReplayAuthScope(row);

  const fixture = {
    id: `replay_${turnId}`,
    description: "Replay fixture generated from turn_trace",
    target,
    input: {
      sessionId,
      turnId,
      message,
      metadata: {
        replay: true,
        replaySourceTurnId: row.turnId || "",
        security: {
          authScope,
        },
      },
    },
    expect: {},
  };

  if (traceTurnType === "CONFIRMATION" || traceTurnType === "REJECTION" || traceTurnType === "AMENDMENT") {
    fixture.preSession = (session) => {
      session.state.pendingAction = {
        id: `replay_pending_${session.id}_${turnId}`,
        toolName: "__replay_tool",
        summary: "__replay_tool({})",
        args: {},
        createdAt: new Date().toISOString(),
        requestedByTurnId: "replay_seed",
        risk: "medium",
      };
    };
  }

  if (traceTurnType === "NEW" || traceTurnType === "AMENDMENT") {
    fixture.setup = (runtime) => patchLlmGenerate(runtime, [{ text: "Replay response.", toolCalls: [] }]);
  }

  return fixture;
}

function compareReplayOutcome(trace, scenarioResult) {
  const expectedTurnType = normalizeOptionalString(trace?.turnType).toUpperCase();
  const actualTurnType = normalizeOptionalString(
    scenarioResult?.output?.turnType || scenarioResult?.capturedLoopOutput?.turnType,
  ).toUpperCase();

  const expectedPending = toOptionalBoolean(trace?.response?.pendingPresent);
  const actualPending = Boolean(
    scenarioResult?.output?.pendingAction || scenarioResult?.session?.state?.pendingAction,
  );

  const expectedToolCalls = normalizeOptionalNumber(trace?.response?.toolCallsTotal);
  const actualToolCalls = Array.isArray(scenarioResult?.output?.toolCalls)
    ? scenarioResult.output.toolCalls.length
    : Array.isArray(scenarioResult?.capturedLoopOutput?.toolCalls)
      ? scenarioResult.capturedLoopOutput.toolCalls.length
      : 0;

  const expectedFailureType = normalizeOptionalString(trace?.failure?.type);
  const actualFailureType = normalizeOptionalString(
    scenarioResult?.failure?.type || scenarioResult?.output?.metadata?.failure?.type,
  );

  const turnTypeMatch = !expectedTurnType || expectedTurnType === actualTurnType;
  const pendingMatch = expectedPending == null || expectedPending === actualPending;
  const toolCountMatch = expectedToolCalls == null || expectedToolCalls === actualToolCalls;
  const failureTypeMatch = !expectedFailureType || expectedFailureType === actualFailureType;

  return {
    ok: turnTypeMatch && pendingMatch && toolCountMatch && failureTypeMatch,
    expectedTurnType,
    actualTurnType,
    turnTypeMatch,
    expectedPending,
    actualPending,
    pendingMatch,
    expectedToolCalls,
    actualToolCalls,
    toolCountMatch,
    expectedFailureType,
    actualFailureType,
    failureTypeMatch,
  };
}

function patchLlmGenerate(runtime, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function") {
    return null;
  }
  const queue = Array.isArray(responses) ? [...responses] : [];
  const original = llm.generate;
  llm.generate = async () => {
    const next = queue.length > 0 ? queue.shift() : { text: "No further actions.", toolCalls: [] };
    return {
      text: String(next?.text || ""),
      toolCalls: Array.isArray(next?.toolCalls) ? next.toolCalls : [],
      finishReason: "stop",
      raw: next || {},
    };
  };
  return () => {
    llm.generate = original;
  };
}

function defaultReplayMessage(turnType, turnId) {
  switch (turnType) {
    case "CONFIRMATION":
      return "yes";
    case "REJECTION":
      return "no";
    case "AMENDMENT":
      return "change this proposal";
    default:
      return `Replay turn ${turnId}`;
  }
}

function resolveReplayAuthScope(traceRow) {
  const row = isRecord(traceRow) ? traceRow : {};
  const metadata = isRecord(row.metadata) ? row.metadata : {};
  const security = isRecord(metadata.security) ? metadata.security : {};
  const explicit =
    normalizeOptionalString(row.authScope) ||
    normalizeOptionalString(security.authScope);
  if (explicit) {
    return explicit;
  }
  const legacy = mapLegacyModeToScope(row.mode);
  if (legacy) {
    return legacy;
  }
  return "read";
}

function mapLegacyModeToScope(mode) {
  const normalized = normalizeOptionalString(mode).toUpperCase();
  if (normalized === "DRAFT") return "draft";
  if (normalized === "EXECUTE" || normalized === "AUTONOMOUS") return "execute";
  if (normalized === "READ_ONLY") return "read";
  return "";
}

function normalizeOptionalString(value) {
  return String(value || "").trim();
}

function normalizeOptionalNumber(value) {
  if (value == null || value === "") {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function toOptionalBoolean(value) {
  if (value === true) return true;
  if (value === false) return false;
  return null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  replayTurnTrace,
  replayTraceSuite,
};
