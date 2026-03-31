"use strict";

const {
  assertTurnType,
  assertHasPendingAction,
  assertNoPendingAction,
  assertToolCallCount,
  assertMetadataField,
  assertCitationPresence,
  assertClarificationTriggered,
  assertFailureType,
  assertSseEvents,
} = require("./assertions");
const { getScenarioFixture } = require("./scenario.fixtures");
const { createLiveRuntime, createLiveStreamHandler } = require("./runtime.resolver");

async function runScenario(fixtureOrId, options = {}) {
  const fixture = normalizeFixture(fixtureOrId);
  const runtime = options.runtime || createLiveRuntime();
  const context = { flags: {} };
  let cleanup = null;

  try {
    if (typeof fixture.setup === "function") {
      cleanup = await fixture.setup(runtime, context, options);
    }

    const result =
      fixture.target === "sse_handler"
        ? await runScenarioViaSseHandler(runtime, fixture, options)
        : await runScenarioViaLoop(runtime, fixture, options);

    result.fixture = fixture;
    result.runtime = runtime;
    result.context = context;

    if (!options.skipAssertions) {
      applyScenarioExpectations(result);
    }
    if (typeof fixture.assert === "function") {
      await fixture.assert(result);
    }

    return result;
  } finally {
    if (typeof cleanup === "function") {
      await cleanup();
    }
  }
}

async function runScenarioSuite(fixturesOrIds, options = {}) {
  const list = Array.isArray(fixturesOrIds) ? fixturesOrIds : [];
  const results = [];
  for (const item of list) {
    const result = await runScenario(item, options);
    results.push({
      fixtureId: result.fixture.id,
      ok: true,
      result,
    });
  }
  return {
    ok: true,
    count: results.length,
    results,
  };
}

async function runScenarioViaLoop(runtime, fixture, options) {
  const input = materializeInput(fixture, options);
  const session = await getOrCreateSession(runtime, input);
  resetSessionForScenario(session, input, fixture, options);
  applyPreSession(fixture, session, runtime);
  if (typeof options.prepareSession === "function") {
    await options.prepareSession(session, runtime, fixture);
  }

  const output = await runtime.loop.run(input, session);
  runtime.sessionStore.updateSession(session);
  return {
    target: "loop_core",
    input,
    output,
    session,
    events: [],
    derived: {
      responseText: String(output?.responseText || ""),
    },
    capturedLoopInput: input,
    capturedLoopOutput: output,
  };
}

async function runScenarioViaSseHandler(runtime, fixture, options) {
  const input = materializeInput(fixture, options);
  const session = await getOrCreateSession(runtime, input);
  resetSessionForScenario(session, input, fixture, options);
  applyPreSession(fixture, session, runtime);

  const handler = createLiveStreamHandler(runtime);
  const req = {
    body: input,
    headers: {},
    ip: options.ip || "127.0.0.1",
    user: fixture.requestUser ?? options.requestUser ?? null,
  };
  const resRecorder = createMockSseResponse();

  const loop = runtime?.loop;
  const originalRun = loop?.run ? loop.run.bind(loop) : null;
  let capturedLoopInput = null;
  let capturedLoopOutput = null;
  if (loop && typeof originalRun === "function") {
    loop.run = async (loopInput, loopSession) => {
      capturedLoopInput = cloneSimple(loopInput);
      const output = await originalRun(loopInput, loopSession);
      capturedLoopOutput = cloneSimple(output);
      return output;
    };
  }

  try {
    await Promise.resolve(handler(req, resRecorder.res));
    await resRecorder.waitForEnd();
  } finally {
    if (loop && typeof originalRun === "function") {
      loop.run = originalRun;
    }
  }

  const events = parseSseEvents(resRecorder.getData()).filter((event) => event.event !== "agent_event");
  return {
    target: "sse_handler",
    input,
    output: null,
    session: await runtime.sessionStore.getOrLoadSession(input.sessionId),
    events,
    derived: deriveSseOutcome(events),
    capturedLoopInput,
    capturedLoopOutput,
  };
}

function applyScenarioExpectations(result) {
  const expect = result?.fixture?.expect || {};
  if (expect.turnType) {
    assertTurnType(result, expect.turnType);
  }
  if (expect.hasPendingAction) {
    assertHasPendingAction(result);
  }
  if (expect.noPendingAction) {
    assertNoPendingAction(result);
  }
  if (Number.isFinite(expect.toolCallCount)) {
    assertToolCallCount(result, expect.toolCallCount);
  }
  if (Array.isArray(expect.metadataFields)) {
    for (const entry of expect.metadataFields) {
      if (!entry || typeof entry.path !== "string") {
        continue;
      }
      assertMetadataField(result, entry.path, entry.value);
    }
  }
  if (typeof expect.citationPresence === "boolean") {
    assertCitationPresence(result, expect.citationPresence);
  }
  if (expect.clarificationTriggered) {
    assertClarificationTriggered(result);
  }
  if (expect.failureType) {
    assertFailureType(result, expect.failureType);
  }
  if (expect.sseEvents) {
    assertSseEvents(result, expect.sseEvents);
  }
}

function createMockSseResponse() {
  const chunks = [];
  let ended = false;
  let endResolver = null;
  const waitForEndPromise = new Promise((resolve) => {
    endResolver = resolve;
  });
  const headers = {};

  const res = {
    headersSent: false,
    writableEnded: false,
    socket: { setNoDelay() {} },
    setHeader(name, value) {
      headers[String(name)] = value;
    },
    flushHeaders() {
      this.headersSent = true;
    },
    write(payload) {
      chunks.push(String(payload || ""));
      return true;
    },
    flush() {},
    end(payload) {
      if (payload) {
        chunks.push(String(payload));
      }
      this.writableEnded = true;
      ended = true;
      if (typeof endResolver === "function") {
        endResolver();
      }
    },
  };

  return {
    res,
    waitForEnd: async () => {
      if (!ended) {
        await waitForEndPromise;
      }
      return true;
    },
    getData: () => chunks.join(""),
    headers,
  };
}

function parseSseEvents(raw) {
  const blocks = String(raw || "")
    .split(/\n\n+/)
    .map((row) => row.trim())
    .filter(Boolean);
  const events = [];
  for (const block of blocks) {
    const lines = block.split("\n");
    let eventName = "message";
    const dataLines = [];
    for (const line of lines) {
      if (line.startsWith("event:")) {
        eventName = line.slice(6).trim();
      } else if (line.startsWith("data:")) {
        dataLines.push(line.slice(5).trim());
      }
    }
    const rawData = dataLines.join("\n");
    let data = rawData;
    try {
      data = JSON.parse(rawData);
    } catch {
      data = rawData;
    }
    events.push({ event: eventName, data });
  }
  return events;
}

function deriveSseOutcome(events) {
  const text = events
    .filter((event) => event.event === "text_delta")
    .map((event) => String(event?.data?.delta || ""))
    .join("");
  const pending = events.filter((event) => event.event === "pending");
  const errors = events.filter((event) => event.event === "error");
  const done = events.some((event) => event.event === "done");

  return {
    responseText: text,
    pendingCount: pending.length,
    errorCount: errors.length,
    errorMessages: errors.map((event) => String(event?.data?.message || "")),
    done,
  };
}

async function getOrCreateSession(runtime, input) {
  const existing = await runtime.sessionStore.getOrLoadSession(input.sessionId);
  if (existing) {
    return existing;
  }
  return runtime.sessionStore.createSession({
    sessionId: input.sessionId,
    userId: input.userId,
  });
}

function resetSessionForScenario(session, input, fixture, options) {
  if (!session || fixture?.resetSession === false || options?.resetSession === false) {
    return;
  }
  session.state = {
    status: "ACTIVE",
    pendingAction: null,
    lastTurnType: "NEW",
  };
  session.turns = [];
  session.history = [];
  session.activeEntities = [];
  session.summary = undefined;
  session.updatedAt = new Date().toISOString();
}

function applyPreSession(fixture, session, runtime) {
  if (!fixture.preSession) {
    return;
  }
  if (typeof fixture.preSession === "function") {
    fixture.preSession(session, runtime);
    return;
  }
  if (typeof fixture.preSession === "object" && fixture.preSession !== null) {
    Object.assign(session, cloneSimple(fixture.preSession));
  }
}

function normalizeFixture(fixtureOrId) {
  if (typeof fixtureOrId === "string") {
    return getScenarioFixture(fixtureOrId);
  }
  if (!fixtureOrId || typeof fixtureOrId !== "object") {
    throw new Error("runScenario requires a fixture id or fixture object.");
  }
  return fixtureOrId;
}

function materializeInput(fixture, options) {
  const seed = fixture.input || {};
  const legacyMode =
    normalizeOptionalString(seed.mode) || normalizeOptionalString(options.mode) || "";
  const input = {
    sessionId: String(seed.sessionId || options.sessionId || `${fixture.id}_session`),
    turnId: String(seed.turnId || options.turnId || `${fixture.id}_turn_${Date.now()}`),
    message: String(seed.message || options.message || "Test turn"),
    metadata: { ...(seed.metadata || {}), ...(options.metadata || {}) },
    userId: seed.userId || options.userId,
    ...(legacyMode ? { mode: legacyMode } : {}),
  };
  return input;
}

function normalizeOptionalString(value) {
  return String(value || "").trim();
}

function cloneSimple(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
}

module.exports = {
  runScenario,
  runScenarioSuite,
  parseSseEvents,
  deriveSseOutcome,
};
