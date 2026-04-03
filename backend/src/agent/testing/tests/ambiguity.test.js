"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runScenario, parseSseEvents } = require("../scenario.runner");

// ---------------------------------------------------------------------------
// P3-01: Ambiguous read query must produce toolCallsCount > 0 before
//        clarification. The UX preflight no longer short-circuits in
//        READ_ONLY mode — the loop must run and call tools.
// ---------------------------------------------------------------------------
test("P3-01: ambiguous READ_ONLY query runs loop and produces tool calls", async () => {
  const fixture = createLoopFixture({
    id: "ambiguity_read_only_tool_calls",
    message: "we will work on Leila dossier today lets start what do you know about it?",
    setup(runtime) {
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: { clients: [{ id: 10, name: "Leila Ben Youssef", status: "active" }], count: 1 },
      }));
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            { id: 101, client_id: 10, title: "Land dispute", reference: "D-2026-101", status: "open" },
            { id: 102, client_id: 10, title: "Contract review", reference: "D-2026-102", status: "open" },
          ],
          count: 2,
        },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            { id: "tc_1", name: "listClients", arguments: { query: "leila" } },
          ],
        },
        {
          text: "",
          toolCalls: [
            { id: "tc_2", name: "listDossiers", arguments: { clientId: 10 } },
          ],
        },
        {
          text: "I found 2 dossiers for Leila. Which one did you mean?\n1. Land dispute (D-2026-101)\n2. Contract review (D-2026-102)",
          toolCalls: [],
        },
      ]);
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      assert.ok(
        toolCalls.length > 0,
        `Expected toolCallsCount > 0, got ${toolCalls.length}`,
      );
      const names = toolCalls.map((tc) => tc.toolName);
      assert.ok(
        names.includes("listClients") || names.includes("listDossiers"),
        `Expected read tools to have been called, got: ${names.join(", ")}`,
      );
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-02: Read ambiguity with multiple matches returns structured options
//        via the disambiguation SSE event (mapped to context_suggestion).
// ---------------------------------------------------------------------------
test("P3-02: ambiguous read with multiple matches emits disambiguation SSE event", async () => {
  const fixture = createSseFixture({
    id: "ambiguity_disambiguation_event",
    message: "Show me Leila dossier",
    setup(runtime, context) {
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            { id: 101, client_id: 10, title: "Land dispute", reference: "D-2026-101", status: "open" },
            { id: 102, client_id: 10, title: "Contract review", reference: "D-2026-102", status: "open" },
          ],
          count: 2,
        },
      }));

      const restoreLlm = patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listDossiers", arguments: { query: "leila" } }],
        },
        {
          text: "I found 2 dossiers. Which one?",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreLlm?.();
      };
    },
    assert(result) {
      const disambiguationEvents = (result?.events || []).filter(
        (event) => event.event === "disambiguation",
      );
      assert.ok(
        disambiguationEvents.length > 0,
        "Expected at least one disambiguation SSE event.",
      );

      const payload = disambiguationEvents[0]?.data?.payload || disambiguationEvents[0]?.data;
      assert.equal(
        payload?.type,
        "context_suggestion",
        "Disambiguation payload must have type 'context_suggestion'.",
      );
      assert.ok(
        Array.isArray(payload?.suggestions) && payload.suggestions.length >= 2,
        `Expected at least 2 suggestions, got ${payload?.suggestions?.length || 0}.`,
      );
      assert.ok(
        payload.suggestions.length <= 5,
        "Suggestions must be capped to 5.",
      );
      assert.equal(
        payload?.allowManualInput,
        true,
        "allowManualInput must be true.",
      );
      assert.ok(
        typeof payload?.manualInputHint === "string" && payload.manualInputHint.length > 0,
        "manualInputHint must be a non-empty string.",
      );
      assert.ok(
        payload?.selectionPolicy && typeof payload.selectionPolicy === "object",
        "selectionPolicy must be present on context_suggestion payload.",
      );
      assert.ok(
        Array.isArray(payload?.actions) && payload.actions.length >= 2,
        "actions must include selectable disambiguation decisions.",
      );
      const decisions = new Set((payload.actions || []).map((action) => action?.decision));
      assert.ok(decisions.has("all"), "Expected an 'all' action decision.");
      assert.ok(decisions.has("none"), "Expected a 'none' action decision.");
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-03: Mutating ambiguity remains loop-first and asks clarification
//        without relying on preflight short-circuit behavior.
// ---------------------------------------------------------------------------
test("P3-03: DRAFT mode ambiguity reaches loop and asks clarification", async () => {
  const fixture = createSseFixture({
    id: "ambiguity_draft_blocks",
    message: "Update the dossier",
    mode: "DRAFT",
    setup(runtime, context) {
      // Allow DRAFT mode through auth scope check
      runtime.security = {
        sanitizeAgentInput: (raw) => ({ ok: true, value: raw }),
        evaluateAuthScope: () => ({ allowed: true, scope: "draft" }),
        checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: 0 }),
      };

      return patchLlmGenerate(runtime, context, [
        {
          text: "Which dossier do you want me to update?",
          toolCalls: [],
        },
      ]);
    },
    assert(result) {
      assert.ok(result?.capturedLoopInput, "Expected loop to run in DRAFT ambiguity scenario.");

      // No tool calls for this scripted clarification path
      const toolEvents = (result?.events || []).filter(
        (event) => event.event === "tool_start",
      );
      assert.equal(
        toolEvents.length,
        0,
        "Expected 0 tool_start events in scripted DRAFT clarification path.",
      );

      // Clarification text was delivered
      const responseText = result?.derived?.responseText || "";
      assert.ok(
        responseText.includes("dossier"),
        "Expected clarification mentioning dossier.",
      );

      // No disambiguation event — blocking mode does not produce structured options
      const disambiguationEvents = (result?.events || []).filter(
        (event) => event.event === "disambiguation",
      );
      assert.equal(
        disambiguationEvents.length,
        0,
        "Expected no disambiguation event in blocking DRAFT mode.",
      );
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-04: Stream parser test — disambiguation event does not fall to
//        recovery/default error flow. Verify done event follows.
// ---------------------------------------------------------------------------
test("P3-04: disambiguation event is followed by done without error fallback", async () => {
  const fixture = createSseFixture({
    id: "ambiguity_stream_no_recovery",
    message: "Show Leila dossier",
    setup(runtime, context) {
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [
            { id: 10, name: "Leila", status: "active" },
            { id: 11, name: "Leila K.", status: "active" },
          ],
          count: 2,
        },
      }));

      const restoreLlm = patchLlmGenerate(runtime, context, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "leila" } }],
        },
        { text: "Multiple clients named Leila found.", toolCalls: [] },
      ]);

      return () => {
        restoreLlm?.();
      };
    },
    assert(result) {
      const events = result?.events || [];
      const eventTypes = events.map((e) => e.event);

      // done must be present
      assert.ok(eventTypes.includes("done"), "Expected done event.");

      // no error events
      const errorEvents = events.filter((e) => e.event === "error");
      assert.equal(errorEvents.length, 0, "Expected no error events.");

      // disambiguation should appear before done (if entities found)
      const disambIdx = eventTypes.indexOf("disambiguation");
      const doneIdx = eventTypes.indexOf("done");
      if (disambIdx >= 0) {
        assert.ok(
          disambIdx < doneIdx,
          "disambiguation event must come before done event.",
        );
      }
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-05: Generic draft ask should ask clarification text directly when
//        details are underspecified, without forcing generateDraft.
// ---------------------------------------------------------------------------
test("P3-05: generic draft prompt asks clarification instead of generating draft", async () => {
  const fixture = createLoopFixture({
    id: "ambiguity_generic_draft_clarification",
    message: "Draft something for Leila",
    mode: "DRAFT",
    setup(runtime) {
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: { clients: [{ id: 7, name: "Leila Ben Youssef", email: "leila@example.test" }], count: 1 },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            { id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } },
          ],
        },
        {
          text: "",
          toolCalls: [
            {
              id: "tc_2",
              name: "generateDraft",
              arguments: {
                draftType: "client_letter",
                title: "Update on Your Legal Matter",
                sections: [{ role: "body", text: "Hallucinated case update body." }],
                layout: { direction: "ltr", language: "en", formality: "formal", documentClass: "letter" },
                linkedEntityType: "client",
                linkedEntityId: 7,
              },
            },
          ],
        },
        {
          text: "What type of document do you want for Leila (for example a letter or an email), and what should it say?",
          toolCalls: [],
        },
      ]);
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      const generateDraftCalls = toolCalls.filter((call) => call.toolName === "generateDraft");
      const deniedDetails = generateDraftCalls.find(
        (call) => call.errorCode === "DRAFT_DETAILS_REQUIRED",
      );
      if (generateDraftCalls.length > 0) {
        assert.ok(
          deniedDetails,
          "If generateDraft is attempted for a generic prompt, it must be denied with DRAFT_DETAILS_REQUIRED.",
        );
      }

      const successfulDraft = toolCalls.find(
        (call) => call.toolName === "generateDraft" && call.ok === true,
      );
      assert.equal(
        Boolean(successfulDraft),
        false,
        "Did not expect a successful generateDraft call for generic prompt.",
      );

      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(
        /(type|kind)\s+of\s+(draft|document)/.test(responseText) ||
          responseText.includes("purpose") ||
          responseText.includes("let me know"),
        `Expected clarification response text, got: ${result?.output?.responseText || ""}`,
      );
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-06: DRAFT follow-up with pronoun reference should not be blocked
//        by preflight when prior user turn already named a single entity.
// ---------------------------------------------------------------------------
test("P3-06: DRAFT pronoun follow-up proceeds to loop when prior entity mention exists", async () => {
  const fixture = createSseFixture({
    id: "ambiguity_draft_pronoun_followup_proceeds",
    message: "write a letter for current status of her divorce case and outline next steps",
    mode: "DRAFT",
    preSession(session) {
      const now = new Date().toISOString();
      session.metadata = {};
      session.turns = [
        {
          id: "prev_user_1",
          role: "user",
          turnType: "NEW",
          message: "draft something for leila",
          createdAt: now,
        },
        {
          id: "prev_assistant_1",
          role: "assistant",
          turnType: "NEW",
          message: "Could you clarify what kind of draft you need?",
          createdAt: now,
        },
      ];
    },
    setup(runtime) {
      // Allow DRAFT mode through auth scope check
      runtime.security = {
        sanitizeAgentInput: (raw) => ({ ok: true, value: raw }),
        evaluateAuthScope: () => ({ allowed: true, scope: "draft" }),
        checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: 0 }),
      };

      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: { clients: [{ id: 10, name: "Leila Mansouri" }], count: 1 },
      }));

      return queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [
            { id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } },
          ],
        },
        {
          text: "I found Leila Mansouri. Should I draft a client status letter for her divorce case?",
          toolCalls: [],
        },
      ]);
    },
    assert(result) {
      assert.ok(
        result?.capturedLoopInput,
        "Expected loop to run; preflight should not fully handle this follow-up.",
      );

      const toolEvents = (result?.events || []).filter((event) => event.event === "tool_start");
      const usedListClients = toolEvents.some(
        (event) => String(event?.data?.toolName || "") === "listClients",
      );
      assert.equal(
        usedListClients,
        true,
        "Expected tool-first grounding (listClients) for pronoun follow-up.",
      );

      const fullText = String(result?.derived?.responseText || "");
      assert.equal(
        fullText.includes("I could not resolve your reference to a specific entity."),
        false,
        "Expected no generic unresolved-entity preflight response.",
      );
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// P3-07: Aggregate invoice draft is allowed from financial grounding.
//        When generateDraft succeeds, SSE should emit draft_artifact and
//        final text should not remain as clarification.
// ---------------------------------------------------------------------------
test("P3-07: aggregate unpaid-invoice draft emits artifact without clarification text", async () => {
  const fixture = createSseFixture({
    id: "ambiguity_draft_denied_no_artifact",
    message: "i need to write an email for her about her unpaid invoices",
    mode: "DRAFT",
    setup(runtime) {
      runtime.security = {
        sanitizeAgentInput: (raw) => ({ ok: true, value: raw }),
        evaluateAuthScope: () => ({ allowed: true, scope: "draft" }),
        checkRateLimit: () => ({ allowed: true, remaining: 100, resetAt: 0 }),
      };

      installSyntheticReadTool(runtime, "listFinancialEntries", async () => ({
        ok: true,
        data: {
          entries: [
            {
              id: 901,
              description: "Emergency hearing preparation fee",
              amount: 1200,
              currency: "TND",
              payment_status: "unpaid",
            },
          ],
          count: 1,
        },
      }));

      const restoreStream = patchLlmStream(runtime, [
        {
          chunks: [
            {
              toolCall: {
                id: "tc_1",
                name: "listFinancialEntries",
                arguments: {
                  clientId: 7,
                  direction: "receivable",
                  paymentStatus: "unpaid",
                  limit: 10,
                },
              },
              finishReason: "tool_calls",
              done: true,
            },
          ],
        },
        {
          chunks: [
            {
              toolCall: {
                id: "tc_2",
                name: "generateDraft",
                arguments: {
                  draftType: "email",
                  title: "Email Draft - Outstanding Invoices",
                  linkedEntityType: "client",
                  linkedEntityId: 7,
                  layout: {
                    direction: "ltr",
                    language: "en",
                    formality: "formal",
                    documentClass: "email",
                  },
                  sections: [
                    { role: "subject", text: "Reminder: Outstanding invoices" },
                    {
                      role: "list_item",
                      text: "Emergency hearing preparation fee - 1200 TND - unpaid",
                    },
                  ],
                },
              },
              finishReason: "tool_calls",
              done: true,
            },
          ],
        },
        {
          chunks: [
            {
              deltaText:
                "I can prepare this email once you confirm the exact dossier/case reference, or allow me to fetch it first.",
              finishReason: "stop",
              done: true,
            },
          ],
        },
      ]);

      return () => {
        restoreStream?.();
      };
    },
    assert(result) {
      const events = result?.events || [];
      const draftArtifacts = events.filter((event) => event.event === "draft_artifact");
      assert.ok(draftArtifacts.length > 0, "Expected draft_artifact SSE event when generateDraft succeeds.");

      const successfulDraftToolResult = events.find(
        (event) =>
          event.event === "tool_result" &&
          String(event?.data?.toolName || "") === "generateDraft" &&
          event?.data?.ok === true,
      );
      assert.ok(successfulDraftToolResult, "Expected generateDraft tool_result with ok=true.");

      const responseText = String(result?.derived?.responseText || "").toLowerCase();
      assert.equal(
        responseText.includes("dossier") || responseText.includes("case reference"),
        false,
        `Did not expect forced case-grounding clarification after successful draft, got: ${responseText}`,
      );
      assert.equal(
        /[?؟]/.test(responseText),
        false,
        `Did not expect question-style clarification text after successful draft, got: ${responseText}`,
      );
    },
  });

  await runScenario(fixture);
});

// ---------------------------------------------------------------------------
// Helpers — mirror read.audit.test.js conventions
// ---------------------------------------------------------------------------
function createLoopFixture({ id, message, mode, setup, preSession, assert: assertFn }) {
  return {
    id,
    target: "loop_core",
    input: {
      sessionId: `${id}_session`,
      turnId: `${id}_turn_1`,
      message,
      mode: mode || "READ_ONLY",
      metadata: {},
    },
    setup,
    preSession,
    assert: assertFn,
  };
}

function createSseFixture({ id, message, mode, setup, preSession, assert: assertFn }) {
  return {
    id,
    target: "sse_handler",
    input: {
      sessionId: `${id}_session`,
      turnId: `${id}_turn_1`,
      message,
      mode: mode || "READ_ONLY",
      metadata: mode === "DRAFT" ? { security: { authScope: "draft" } } : {},
    },
    setup,
    preSession,
    assert: assertFn,
  };
}

function installSyntheticReadTool(runtime, name, handler) {
  const registry = runtime?.loop?.registry;
  if (!registry || !(registry.tools instanceof Map)) {
    throw new Error("Unable to install synthetic tool: missing registry map.");
  }
  registry.tools.set(name, {
    name,
    category: "READ",
    description: `Synthetic read tool ${name}`,
    inputSchema: { type: "object", properties: {}, additionalProperties: true },
    outputSchema: undefined,
    sideEffects: false,
    handler: async (context, args) => handler(context, args),
  });
}

function queueLlmResponses(runtime, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function") {
    throw new Error("Unable to patch LLM generate for ambiguity test.");
  }

  const queue = Array.isArray(responses) ? [...responses] : [];
  const original = llm.generate.bind(llm);
  llm.generate = async () => {
    const next = queue.length > 0 ? queue.shift() : { text: "Done.", toolCalls: [] };
    return {
      text: String(next?.text || ""),
      toolCalls: Array.isArray(next?.toolCalls) ? next.toolCalls : [],
      finishReason: "stop",
      raw: next,
    };
  };

  return () => {
    llm.generate = original;
  };
}

function patchLlmGenerate(runtime, context, responses) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.generate !== "function") {
    return null;
  }
  const queue = Array.isArray(responses) ? [...responses] : [];
  const restore = patchMethod(llm, "generate", async () => {
    const next = queue.length > 0 ? queue.shift() : { text: "No further actions.", toolCalls: [] };
    context.flags = context.flags || {};
    context.flags.llmCalls = Number(context.flags.llmCalls || 0) + 1;
    return {
      text: String(next?.text || ""),
      toolCalls: Array.isArray(next?.toolCalls) ? next.toolCalls : [],
      finishReason: "stop",
      raw: next,
    };
  });
  return restore;
}

function patchLlmStream(runtime, scriptedTurns) {
  const llm = runtime?.loop?.llm;
  if (!llm || typeof llm.stream !== "function") {
    throw new Error("Unable to patch LLM stream for ambiguity test.");
  }

  const queue = Array.isArray(scriptedTurns) ? [...scriptedTurns] : [];
  const original = llm.stream.bind(llm);
  llm.stream = async function* () {
    const next =
      queue.length > 0
        ? queue.shift()
        : { chunks: [{ deltaText: "Done.", finishReason: "stop", done: true }] };
    const chunks = Array.isArray(next?.chunks) ? next.chunks : [];
    for (const chunk of chunks) {
      yield chunk;
    }
  };

  return () => {
    llm.stream = original;
  };
}

function patchMethod(target, methodName, replacement) {
  if (!target || typeof target[methodName] !== "function") {
    return null;
  }
  const original = target[methodName];
  target[methodName] = replacement;
  return () => {
    target[methodName] = original;
  };
}
