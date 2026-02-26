"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { planEntityCreation } = require("./entityCreationPlanner");

test("planner enriches dossier create for divorce case", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      resolvedEntityContext: { parent: { entityType: "client", entityId: 3 } },
      conversationContext: "Create divorce case for Mootez",
      extractedSignals: { parent: { entityType: "client", entityId: 3 }, parentName: "Mootez" },
    },
    {
      llmGenerate: async () =>
        JSON.stringify({
          decision: "proceed",
          semanticProfile: {
            entityType: "dossier",
            title: "Divorce - Mootez",
            category: "Family Law",
            subtype: "Divorce",
            priority: "medium",
            phaseOrState: "initiation",
            tags: ["family-law", "divorce"],
            summary: "Create a family-law divorce dossier for Mootez.",
            assumptions: ["Default phase set to initiation."],
            missingCritical: [],
          },
          legalSummary: "New family-law divorce matter for Mootez requiring parenting arrangements and asset division review.",
          caseFocusPoints: [
            "Divorce / family law filing strategy",
            "Parenting arrangements for minor children",
            "Asset division and financial settlement planning",
          ],
          suggestedNextSteps: [
            "Prepare an initial divorce petition draft",
            "Collect marriage and family status documents",
          ],
          riskSignals: ["Child custody / parenting arrangements"],
          payloadCandidate: {
            title: "Divorce - Mootez",
            category: "Family Law",
            phase: "initiation",
            priority: "medium",
            status: "open",
            description: "Open a new divorce dossier for client Mootez.",
          },
          clarificationQuestions: [],
          suggestedChildren: [],
          riskFlags: [],
          confidence: 0.93,
        }),
    },
  );

  assert.ok(result.enrichedPayload);
  assert.equal(result.enrichedPayload.category, "Family Law");
  assert.equal(result.enrichedPayload.phase, "initiation");
  assert.equal(result.enrichedPayload.priority, "medium");
  assert.match(String(result.enrichedPayload.title), /Divorce/i);
  assert.equal(
    /user requested|placeholder|tbd/i.test(JSON.stringify(result)),
    false,
    "planner output must not contain placeholder/generic text",
  );
});

test("planner clarifies missing case type for dossier create", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      resolvedEntityContext: { parent: { entityType: "client", entityId: 3 } },
      conversationContext: "Open new case for Mootez",
      extractedSignals: { parent: { entityType: "client", entityId: 3 }, parentName: "Mootez" },
    },
    {
      llmGenerate: async () =>
        JSON.stringify({
          decision: "clarify",
          semanticProfile: {
            entityType: "dossier",
            title: "Case - Mootez",
            category: null,
            subtype: null,
            priority: "medium",
            phaseOrState: "initiation",
            tags: [],
            summary: "Prepare a dossier draft for Mootez once the case type is confirmed.",
            assumptions: [],
            missingCritical: ["case_type_or_category"],
          },
          legalSummary: "A new legal matter can be opened once the case type is confirmed.",
          caseFocusPoints: ["Case type / legal domain classification"],
          suggestedNextSteps: ["Confirm the legal domain to prepare the correct opening dossier"],
          riskSignals: [],
          payloadCandidate: {},
          clarificationQuestions: ["What type of case is this (divorce/family, criminal, civil/contract, labor, etc.)?"],
          suggestedChildren: [],
          riskFlags: [],
          confidence: 0.74,
        }),
    },
  );

  assert.equal(Array.isArray(result.clarificationQuestions), true);
  assert.ok(result.clarificationQuestions.length > 0);
  assert.equal(result.enrichedPayload, undefined);
});

test("planner filters payload to adapter allowed fields", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      resolvedEntityContext: { parent: { entityType: "client", entityId: 3 } },
      conversationContext: "Create divorce case for Mootez",
      extractedSignals: { parentName: "Mootez", parent: { entityType: "client", entityId: 3 } },
    },
    {
      llmGenerate: async () =>
        JSON.stringify({
          decision: "proceed",
          semanticProfile: {
            entityType: "dossier",
            title: "Divorce - Mootez",
            category: "Family Law",
            subtype: "Divorce",
            priority: "medium",
            phaseOrState: "initiation",
            tags: ["family-law", "divorce"],
            summary: "Create a divorce dossier for Mootez.",
            assumptions: [],
            missingCritical: [],
          },
          legalSummary: "New family-law divorce matter for Mootez.",
          caseFocusPoints: ["Divorce / family law intake"],
          suggestedNextSteps: ["Prepare an initial divorce petition draft"],
          riskSignals: [],
          payloadCandidate: {
            title: "Divorce - Mootez",
            category: "Family Law",
            phase: "initiation",
            priority: "medium",
            unsupported_field_xyz: "drop me",
          },
          clarificationQuestions: [],
          suggestedChildren: [],
          riskFlags: [],
          confidence: 0.9,
        }),
    },
  );

  assert.ok(result.enrichedPayload);
  assert.equal("unsupported_field_xyz" in result.enrichedPayload, false);
});

test("planner retries on placeholder/invalid output and clarifies when still bad", async () => {
  let calls = 0;
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      conversationContext: "Open new case for Mootez",
      extractedSignals: {},
    },
    {
      llmGenerate: async () => {
        calls += 1;
        if (calls === 1) return "{ not-json";
        return JSON.stringify({
          decision: "proceed",
          semanticProfile: {
            entityType: "dossier",
            title: "New item",
            category: null,
            subtype: null,
            priority: "medium",
            phaseOrState: "initiation",
            tags: [],
            summary: "User requested update in conversation",
            assumptions: [],
            missingCritical: [],
          },
          legalSummary: "New item",
          caseFocusPoints: ["placeholder"],
          suggestedNextSteps: ["placeholder"],
          riskSignals: [],
          payloadCandidate: { title: "New item" },
          clarificationQuestions: [],
          suggestedChildren: [],
          riskFlags: [],
          confidence: 0.8,
        });
      },
    },
  );

  assert.equal(calls, 2);
  assert.ok(Array.isArray(result.clarificationQuestions));
  assert.ok(result.clarificationQuestions.length > 0);
  assert.equal(result.enrichedPayload, undefined);
});

test("planner recovers JSON from fenced/wrapped LLM output", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      resolvedEntityContext: { parent: { entityType: "client", entityId: 3 } },
      conversationContext: "Create divorce case for Mootez",
      extractedSignals: { parentName: "Mootez", parent: { entityType: "client", entityId: 3 } },
    },
    {
      llmGenerate: async () =>
        [
          "Sure, here is the JSON:",
          "```json",
          JSON.stringify({
            decision: "proceed",
            semanticProfile: {
              entityType: "dossier",
              title: "Divorce - Mootez",
              category: "Family Law",
              subtype: "Divorce",
              priority: "medium",
              phaseOrState: "initiation",
              tags: ["family-law", "divorce"],
              summary: "Create a divorce dossier for Mootez.",
              assumptions: [],
              missingCritical: [],
            },
            legalSummary: "New family-law divorce matter for Mootez.",
            caseFocusPoints: ["Divorce / family law intake"],
            suggestedNextSteps: ["Prepare an initial divorce petition draft"],
            riskSignals: [],
            payloadCandidate: {
              title: "Divorce - Mootez",
              category: "Family Law",
              phase: "initiation",
              priority: "medium",
              status: "open",
            },
            clarificationQuestions: [],
            suggestedChildren: [],
            riskFlags: [],
            confidence: 0.87,
          }),
          "```",
        ].join("\n"),
    },
  );

  assert.ok(result.enrichedPayload);
  assert.equal(result.enrichedPayload.category, "Family Law");
});

test("planner fallback clarification uses detected context hints", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      conversationContext:
        "My client Mootez Aloui needs a new case opened.",
      extractedSignals: { parentName: "Mootez Aloui" },
    },
    {
      llmGenerate: async () => null,
    },
  );

  assert.ok(Array.isArray(result.clarificationQuestions));
  assert.match(result.clarificationQuestions[0], /Mootez Aloui/i);
});

test("planner uses high-confidence dossier fallback inference when LLM fails", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      resolvedEntityContext: { parent: { entityType: "client", entityId: 3 } },
      conversationContext:
        "My client Mootez Aloui wants a divorce with a parenting plan and fair asset split. His wife moved away, ran up debt in his name, and they are separated.",
      extractedSignals: { parentName: "Mootez Aloui", parent: { entityType: "client", entityId: 3 } },
    },
    { llmGenerate: async () => null },
  );

  assert.ok(result.enrichedPayload);
  assert.equal(result.enrichedPayload.category, "Family Law");
  assert.equal(result.enrichedPayload.phase, "initiation");
  assert.ok(Array.isArray(result.semanticProfile.assumptions));
  assert.ok(result.semanticProfile.assumptions.some((v) => /spouse/i.test(v)));
  assert.ok(Array.isArray(result.semanticProfile.missingOptional));
  assert.ok(result.semanticProfile.missingOptional.length > 0);
  assert.equal(result.enrichedPayload.category, "Family Law");
  assert.ok(Array.isArray(result.caseFocusPoints));
  assert.ok(result.caseFocusPoints.some((v) => /parenting|custody/i.test(v)));
  assert.ok(result.caseFocusPoints.some((v) => /debt|liabilit/i.test(v)));
  assert.ok(result.caseFocusPoints.some((v) => /asset/i.test(v)));
  assert.ok(Array.isArray(result.suggestedNextSteps));
  assert.ok(result.suggestedNextSteps.some((v) => /divorce petition/i.test(v)));
  const combined = JSON.stringify({
    legalSummary: result.legalSummary,
    caseFocusPoints: result.caseFocusPoints,
    suggestedNextSteps: result.suggestedNextSteps,
  });
  assert.equal(/inferred|defaulted|based on narrative|planned change/i.test(combined), false);
});

test("planner client name extraction stops before narrative clauses", async () => {
  const { _internal } = require("./entityCreationPlanner");
  const name = _internal.parseClientNameFromContext(
    "Hi, I need to tell you about my client Mootez Aloui – he’s been married since 2015 and wants a divorce.",
    {},
  );
  assert.equal(name, "Mootez Aloui");
});

test("planner clarification semantic profile includes missingOptional", async () => {
  const result = await planEntityCreation(
    {
      entityType: "dossier",
      conversationContext: "Open new case for Mootez",
      extractedSignals: { parentName: "Mootez" },
    },
    { llmGenerate: async () => null },
  );

  assert.ok(result.semanticProfile);
  assert.ok(Array.isArray(result.semanticProfile.missingOptional));
  assert.ok(Array.isArray(result.clarificationQuestions));
  assert.ok(result.clarificationQuestions.length > 0);
});
