"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveCognitiveGoalIntent } = require("./goalIntentResolver");
const { PRIMARY_ROUTES, GOAL_TYPES } = require("./goalIntent.contract");
const { buildArtifactComposition } = require("./artifactComposerPolicy");
const { validateTurnArtifactComposition } = require("../contracts/turnArtifactComposition.contract");

function mockJudge(payload) {
  return async () => JSON.stringify(payload);
}

test("mixed custody turn routes goal-first with focused existence check", async () => {
  const decision = await resolveCognitiveGoalIntent({
    userMessage: "Do we already have a custody case for her, and if not let's file one.",
    requestContext: {
      dossierId: 42,
      userId: "u1",
      conversationId: "c1",
    },
    sessionState: {},
    llmExtractor: mockJudge({
      goalType: "CASE_DEVELOPMENT",
      legalPhase: "PRE_FILING",
      targetEntityType: "lawsuit",
      intendedOperation: "create",
      routeHint: "GOAL_FIRST",
      confidence: 0.88,
      understandingContextNeeded: [],
      proposalContextNeeded: [],
      executionContextNeeded: ["confirmation"],
      secondaryOpportunities: ["RUN_FOCUSED_EXISTENCE_CHECK", "SUGGEST_CREATE_IF_ABSENT"],
    }),
  });

  assert.equal(decision.primaryRoute.mode, PRIMARY_ROUTES.GOAL_FIRST);
  assert.equal(decision.goal.targetEntityType, "lawsuit");
  assert.equal(decision.goal.goalType, GOAL_TYPES.CASE_DEVELOPMENT);
  assert.equal(decision.turnDecomposition.hasMixedIntent, true);
  assert.ok(
    decision.secondaryOpportunities.some((item) => item.type === "RUN_FOCUSED_EXISTENCE_CHECK"),
  );
  assert.ok(
    decision.minimalSupportingReads.some((item) => item.entityType === "lawsuit"),
  );
});

test("custody escalation phrasing resolves to goal-first create path", async () => {
  const decision = await resolveCognitiveGoalIntent({
    userMessage:
      "we did not find a solution with his wife, we are going to go for a lawsuit for the kids guard that is a shame",
    requestContext: {
      clientId: 4,
      resolvedEntity: { type: "client", id: 4 },
      userId: "u1",
      conversationId: "c1",
    },
    sessionState: {},
    llmExtractor: mockJudge({
      goalType: "CASE_DEVELOPMENT",
      legalPhase: "PRE_FILING",
      targetEntityType: "lawsuit",
      intendedOperation: "create",
      routeHint: "GOAL_FIRST",
      confidence: 0.86,
      understandingContextNeeded: [],
      proposalContextNeeded: [],
      executionContextNeeded: ["confirmation"],
      secondaryOpportunities: ["SUGGEST_CREATE_IF_ABSENT"],
    }),
  });

  assert.equal(decision.primaryRoute.mode, PRIMARY_ROUTES.GOAL_FIRST);
  assert.equal(decision.goal.goalType, GOAL_TYPES.CASE_DEVELOPMENT);
  assert.equal(decision.goal.targetEntityType, "lawsuit");
  assert.equal(decision.goal.intendedOperation, "create");
});

test("fact update keeps proposal safety separate from execution safety", async () => {
  const decision = await resolveCognitiveGoalIntent({
    userMessage: "They served us today.",
    requestContext: {
      userId: "u1",
      conversationId: "c1",
    },
    sessionState: {},
    llmExtractor: mockJudge({
      goalType: "FACT_UPDATE",
      legalPhase: "LITIGATION",
      targetEntityType: "lawsuit",
      intendedOperation: null,
      routeHint: "GOAL_FIRST",
      confidence: 0.82,
      understandingContextNeeded: [],
      proposalContextNeeded: ["parent_scope"],
      executionContextNeeded: ["confirmation"],
      secondaryOpportunities: ["SUGGEST_NOTE"],
    }),
  });

  assert.equal(decision.goal.goalType, GOAL_TYPES.FACT_UPDATE);
  assert.equal(decision.primaryRoute.mode, PRIMARY_ROUTES.GOAL_FIRST);
  assert.equal(decision.contextRequirements.proposalSatisfied, false);
  assert.ok(decision.contextRequirements.executionContextNeeded.includes("confirmation"));
});

test("pure status inquiry stays database-first", async () => {
  const decision = await resolveCognitiveGoalIntent({
    userMessage: "What's the status of the custody lawsuit?",
    requestContext: {
      dossierId: 55,
      userId: "u1",
      conversationId: "c1",
    },
    sessionState: {},
    llmExtractor: mockJudge({
      goalType: "STATUS_INQUIRY",
      legalPhase: "UNKNOWN",
      targetEntityType: "lawsuit",
      intendedOperation: "inspect",
      routeHint: "DATABASE_FIRST",
      confidence: 0.9,
      understandingContextNeeded: [],
      proposalContextNeeded: [],
      executionContextNeeded: [],
      secondaryOpportunities: ["SHOW_STATUS_SUMMARY"],
    }),
  });

  assert.equal(decision.primaryRoute.mode, PRIMARY_ROUTES.DATABASE_FIRST);
  assert.equal(decision.goal.goalType, GOAL_TYPES.STATUS_INQUIRY);
});

test("scoped follow-up retrieval question does not force clarification", async () => {
  const decision = await resolveCognitiveGoalIntent({
    userMessage: "this guy has an open dossier i think isn't it ?",
    requestContext: {
      resolvedEntity: { type: "client", id: 7 },
      clientId: 7,
      userId: "u1",
      conversationId: "c1",
    },
    sessionState: {},
    llmExtractor: mockJudge({
      goalType: "STATUS_INQUIRY",
      legalPhase: "UNKNOWN",
      targetEntityType: "dossier",
      intendedOperation: "inspect",
      routeHint: "DATABASE_FIRST",
      confidence: 0.78,
      understandingContextNeeded: [],
      proposalContextNeeded: [],
      executionContextNeeded: [],
      secondaryOpportunities: [],
    }),
  });

  assert.equal(decision.primaryRoute.mode, PRIMARY_ROUTES.DATABASE_FIRST);
  assert.equal(decision.goal.goalType, GOAL_TYPES.STATUS_INQUIRY);
});

test("artifact composition suppresses suggestions when clarification is present", () => {
  const composition = buildArtifactComposition({
    primaryRoute: "CLARIFY",
    assistantMode: "CLARIFY",
    suggestions: [
      {
        actionType: "CREATE_LAWSUIT",
        source: "cognitive_layer",
        promotionEligible: true,
      },
    ],
    clarificationArtifact: {
      type: "context_suggestion",
      message: "Which dossier should this belong to?",
    },
  });

  const validated = validateTurnArtifactComposition(composition);
  assert.equal(validated.suggestions.length, 0);
  assert.ok(validated.clarificationArtifact);
});
