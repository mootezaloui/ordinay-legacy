"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runScenario } = require("../scenario.runner");

test("Draft flow Example 1: vague request asks for dossier + type before drafting", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_example_1_vague",
    message: "Draft something for Leila",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [{ id: 2001, name: "Leila Mansouri", status: "active" }],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            {
              id: 51,
              client_id: 2001,
              reference: "D-51",
              title: "Mansouri v. SARL Atlas",
              category: "Commercial",
              status: "active",
            },
            {
              id: 52,
              client_id: 2001,
              reference: "D-52",
              title: "Property claim",
              category: "Civil",
              status: "active",
            },
            {
              id: 53,
              client_id: 2001,
              reference: "D-53",
              title: "Employment dispute",
              category: "Labor",
              status: "closed",
            },
          ],
          count: 3,
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_2", name: "listDossiers", arguments: { clientId: 2001, limit: 10 } }],
        },
        {
          text:
            "I found client Leila Mansouri with 3 dossiers:\n" +
            "1. D-51 - Mansouri v. SARL Atlas (Commercial) - Active\n" +
            "2. D-52 - Property claim (Civil) - Active\n" +
            "3. D-53 - Employment dispute (Labor) - Closed\n" +
            "Which dossier is this for? And what type of document would you like?",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      assert.ok(toolCalls.some((call) => call.toolName === "listClients"), "Expected listClients call.");
      assert.ok(toolCalls.some((call) => call.toolName === "listDossiers"), "Expected listDossiers call.");
      assert.equal(
        toolCalls.some((call) => call.toolName === "generateDraft" && call.ok === true),
        false,
        "Did not expect successful generateDraft for vague request.",
      );
      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(responseText.includes("which dossier"), "Expected dossier clarification.");
      assert.ok(responseText.includes("what type of document"), "Expected type clarification.");
    },
  });

  await runScenario(fixture);
});

test("Draft flow guard: French clarification is accepted and loop exits before max iterations", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_fr_clarification_exit",
    message: "draft something for leila",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [{ id: 2001, name: "Leila Ben Youssef", status: "active" }],
          count: 1,
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } }],
        },
        {
          text: "",
          toolCalls: [
            {
              id: "tc_2",
              name: "generateDraft",
              arguments: {
                draftType: "client_letter",
                title: "Brouillon",
                sections: [{ role: "body", text: "Texte générique." }],
                layout: { direction: "ltr", language: "fr", formality: "formal", documentClass: "letter" },
                linkedEntityType: "client",
                linkedEntityId: 2001,
              },
            },
          ],
        },
        {
          text:
            "Bonjour ! Pour préparer le brouillon, pourriez‑vous préciser :\n" +
            "1. **Type de document**\n" +
            "2. **Objet principal**\n" +
            "3. **Ton souhaité**\n" +
            "4. **Faits clés (dates/références)**",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const responseText = String(result?.output?.responseText || "");
      assert.match(
        responseText.toLowerCase(),
        /pour préparer le brouillon|pour preparer le brouillon/,
        "Expected French clarification response text.",
      );
      const iterations = Number(result?.output?.metadata?.loopStats?.iterations || 0);
      assert.ok(
        iterations > 0 && iterations <= 4,
        `Expected loop to exit early, got iterations=${iterations}`,
      );
      const deniedDetails = (result?.output?.toolCalls || []).find(
        (call) => call.toolName === "generateDraft" && call.errorCode === "DRAFT_DETAILS_REQUIRED",
      );
      assert.ok(deniedDetails, "Expected DRAFT_DETAILS_REQUIRED denial before clarification.");
    },
  });

  await runScenario(fixture);
});

test("Draft flow Example 2: entity clear, type vague suggests document options", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_example_2_entity_clear_type_vague",
    message: "Draft something for dossier D-51",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "getEntityGraph", async () => ({
        ok: true,
        data: {
          entity: { type: "dossier", id: 51, reference: "D-51", title: "Mansouri v. SARL Atlas" },
          summary: {
            upcomingHearing: "2026-03-25",
            overdueTasks: 2,
            pendingMotion: true,
          },
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "getEntityGraph", arguments: { entityType: "dossier", entityId: 51, depth: 2 } }],
        },
        {
          text:
            "I've reviewed dossier D-51 (Mansouri v. SARL Atlas).\n" +
            "Based on the current status, I could draft:\n" +
            "1. Hearing preparation notes (hearing on March 25)\n" +
            "2. A letter to the court about pending overdue tasks\n" +
            "3. A status update for the client\n" +
            "4. A case summary report\n" +
            "What type of document would be most helpful?",
          toolCalls: [],
        },
        {
          text:
            "I can draft one of these for dossier D-51: hearing preparation notes, a court follow-up letter, a client status update, or a case summary report. What type of document would you like?",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      assert.ok(
        toolCalls.some((call) => call.toolName === "getEntityGraph"),
        "Expected getEntityGraph call.",
      );
      assert.equal(
        toolCalls.some((call) => call.toolName === "generateDraft" && call.ok === true),
        false,
        "Did not expect successful generateDraft when type is vague.",
      );
      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(responseText.includes("what type of document"), "Expected suggestion clarification question.");
      assert.ok(responseText.includes("march 25"), "Expected case-grounded suggestion details.");
    },
  });

  await runScenario(fixture);
});

test("Draft flow Example 3: type clear, entity ambiguous asks which case", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_example_3_type_clear_entity_ambiguous",
    message: "Write a letter to the judge for Leila",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [{ id: 2001, name: "Leila Mansouri", status: "active" }],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            {
              id: 51,
              client_id: 2001,
              reference: "D-51",
              title: "Mansouri v. SARL Atlas",
              court: "Commercial Court",
              has_lawsuit: true,
              status: "active",
            },
            {
              id: 52,
              client_id: 2001,
              reference: "D-52",
              title: "Property claim",
              court: "Civil Court",
              has_lawsuit: true,
              status: "active",
            },
            {
              id: 53,
              client_id: 2001,
              reference: "D-53",
              title: "Employment dispute",
              has_lawsuit: false,
              status: "closed",
            },
          ],
          count: 3,
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_2", name: "listDossiers", arguments: { clientId: 2001, limit: 10 } }],
        },
        {
          text:
            "Leila has 2 active cases with court proceedings:\n" +
            "1. D-51 - Mansouri v. SARL Atlas (Commercial Court)\n" +
            "2. D-52 - Property claim (Civil Court)\n" +
            "Which case should this letter be for?",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      assert.ok(toolCalls.some((call) => call.toolName === "listClients"), "Expected listClients call.");
      assert.ok(toolCalls.some((call) => call.toolName === "listDossiers"), "Expected listDossiers call.");
      assert.equal(
        toolCalls.some((call) => call.toolName === "generateDraft" && call.ok === true),
        false,
        "Did not expect successful generateDraft with ambiguous case selection.",
      );
      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(responseText.includes("which case"), "Expected case disambiguation question.");
      assert.ok(responseText.includes("2 active cases"), "Expected narrowed case options.");
    },
  });

  await runScenario(fixture);
});

test("Draft flow Example 4: type + entity clear asks missing postponement reason", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_example_4_missing_detail",
    message: "Write a postponement letter for Leila's commercial case",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [{ id: 2001, name: "Leila Mansouri", status: "active" }],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            {
              id: 51,
              client_id: 2001,
              reference: "D-51",
              title: "Mansouri v. SARL Atlas",
              category: "Commercial",
              status: "active",
            },
          ],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "getEntityGraph", async () => ({
        ok: true,
        data: {
          entity: { type: "dossier", id: 51, reference: "D-51", title: "Mansouri v. SARL Atlas" },
          lawsuit: { caseNumber: "COM-2026-118", court: "Commercial Court" },
          sessions: [{ date: "2026-03-25", purpose: "hearing" }],
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_2", name: "listDossiers", arguments: { clientId: 2001, limit: 10 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_3", name: "getEntityGraph", arguments: { entityType: "dossier", entityId: 51, depth: 2 } }],
        },
        {
          text:
            "I'll draft a postponement letter for the March 25 hearing at the Commercial Court. " +
            "What's the reason for the postponement request? (for example, need more preparation time or client unavailability).",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      assert.ok(
        toolCalls.some((call) => call.toolName === "getEntityGraph"),
        "Expected getEntityGraph call.",
      );
      assert.equal(
        toolCalls.some((call) => call.toolName === "generateDraft" && call.ok === true),
        false,
        "Did not expect successful generateDraft before missing reason is provided.",
      );
      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(responseText.includes("what's the reason"), "Expected missing-reason clarification.");
      assert.ok(responseText.includes("march 25"), "Expected hearing date context.");
    },
  });

  await runScenario(fixture);
});

test("Draft flow Example 5: clear entity + type + reason generates draft", async () => {
  const fixture = createLoopFixture({
    id: "draft_flow_example_5_generate",
    message:
      "Write a postponement letter for Leila's commercial case. The client needs more time to gather financial documents.",
    mode: "DRAFT",
    setup(runtime) {
      const restoreUx = forceLoopProceed(runtime);
      installSyntheticReadTool(runtime, "listClients", async () => ({
        ok: true,
        data: {
          clients: [{ id: 2001, name: "Leila Mansouri", status: "active" }],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "listDossiers", async () => ({
        ok: true,
        data: {
          dossiers: [
            {
              id: 51,
              client_id: 2001,
              reference: "D-51",
              title: "Mansouri v. SARL Atlas",
              category: "Commercial",
              status: "active",
            },
          ],
          count: 1,
        },
      }));
      installSyntheticReadTool(runtime, "getEntityGraph", async () => ({
        ok: true,
        data: {
          entity: { type: "dossier", id: 51, reference: "D-51", title: "Mansouri v. SARL Atlas" },
          lawsuit: { caseNumber: "COM-2026-118", court: "Commercial Court", judge: "Judge H. Ben Salem" },
          sessions: [{ date: "2026-03-25", purpose: "hearing" }],
          client: { name: "Leila Mansouri" },
        },
      }));

      const restoreLlm = queueLlmResponses(runtime, [
        {
          text: "",
          toolCalls: [{ id: "tc_1", name: "listClients", arguments: { query: "Leila", limit: 5 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_2", name: "listDossiers", arguments: { clientId: 2001, limit: 10 } }],
        },
        {
          text: "",
          toolCalls: [{ id: "tc_3", name: "getEntityGraph", arguments: { entityType: "dossier", entityId: 51, depth: 2 } }],
        },
        {
          text: "",
          toolCalls: [
            {
              id: "tc_4",
              name: "generateDraft",
              arguments: {
                draftType: "court_letter",
                title: "Postponement Request - March 25 Hearing",
                metadata: {
                  client: "Leila Mansouri",
                  dossier: "D-51",
                  language: "en",
                  tone: "formal",
                },
                sections: [
                  { role: "date", text: "March 19, 2026" },
                  { role: "recipient", text: "The Honorable Commercial Court" },
                  { role: "subject", label: "Subject:", text: "Request to postpone hearing (COM-2026-118)" },
                  {
                    role: "body",
                    text:
                      "On behalf of our client, Leila Mansouri, we respectfully request a postponement of the hearing scheduled for March 25, 2026. The client requires additional time to gather financial documents necessary for a complete and accurate submission.",
                  },
                  { role: "closing", text: "Respectfully submitted," },
                  { role: "signature_name", text: "Counsel for Leila Mansouri" },
                ],
                layout: {
                  direction: "ltr",
                  language: "en",
                  formality: "formal",
                  documentClass: "court_letter",
                },
                linkedEntityType: "dossier",
                linkedEntityId: 51,
              },
            },
          ],
        },
        {
          text: "I've drafted the postponement letter. Review it below.",
          toolCalls: [],
        },
      ]);

      return () => {
        restoreUx?.();
        restoreLlm?.();
      };
    },
    assert(result) {
      const toolCalls = result?.output?.toolCalls || [];
      const successfulDraftCall = toolCalls.find(
        (call) => call.toolName === "generateDraft" && call.ok === true,
      );
      assert.ok(successfulDraftCall, "Expected successful generateDraft call.");
      const deniedDraftCall = toolCalls.find(
        (call) => call.toolName === "generateDraft" && call.ok === false,
      );
      assert.equal(Boolean(deniedDraftCall), false, "Did not expect denied generateDraft in clear scenario.");
      const responseText = String(result?.output?.responseText || "").toLowerCase();
      assert.ok(responseText.includes("drafted the postponement letter"), "Expected draft completion message.");
    },
  });

  await runScenario(fixture);
});

function createLoopFixture({ id, message, mode, setup, assert: assertFn }) {
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
    throw new Error("Unable to patch LLM generate for draft flow test.");
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

function forceLoopProceed(runtime) {
  return patchMethod(runtime?.ux, "evaluatePreLoop", () => ({
    handled: false,
    action: "proceed",
    metadata: {
      uxDecision: {
        action: "proceed_with_ambiguity",
        posture: "clarification",
        ambiguityKind: "unclear_reference",
        ambiguityConfidence: "medium",
        workflowType: "none",
        reason: "Draft flow ambiguity should be resolved with READ tools first.",
      },
    },
  }));
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
