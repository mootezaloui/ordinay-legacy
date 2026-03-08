"use strict";

const { PRIMARY_ROUTES } = require("./goalIntent.contract");

function arbitrateGoalRoute({
  decomposition = {},
  confidence = 0,
  understandingSatisfied = true,
  proposalSatisfied = true,
  exactEntityRequiredForProposal = false,
  explicitReadIntent = false,
  ambiguousExistingEntity = false,
} = {}) {
  if (!understandingSatisfied && explicitReadIntent) {
    return { mode: PRIMARY_ROUTES.DATABASE_FIRST, reason: "retrieval_fallback_when_goal_uncertain" };
  }
  if (!understandingSatisfied) {
    return { mode: PRIMARY_ROUTES.CLARIFY, reason: "understanding_context_missing" };
  }
  if (ambiguousExistingEntity || exactEntityRequiredForProposal) {
    return { mode: PRIMARY_ROUTES.CLARIFY, reason: "exact_entity_required_for_proposal" };
  }
  if (decomposition.hasMixedIntent && decomposition.hasProgressionIntent && confidence >= 0.7) {
    return { mode: PRIMARY_ROUTES.GOAL_FIRST, reason: "mixed_turn_progression_priority" };
  }
  if (decomposition.hasProgressionIntent && confidence >= 0.78) {
    if (proposalSatisfied || decomposition.hasMixedIntent || !explicitReadIntent) {
      return { mode: PRIMARY_ROUTES.GOAL_FIRST, reason: "high_confidence_progression" };
    }
  }
  if (explicitReadIntent || decomposition.hasRetrievalIntent) {
    return { mode: PRIMARY_ROUTES.DATABASE_FIRST, reason: "explicit_read_or_status_request" };
  }
  if (decomposition.hasProgressionIntent && confidence >= 0.6) {
    return { mode: PRIMARY_ROUTES.GOAL_FIRST, reason: "moderate_confidence_progression" };
  }
  return { mode: PRIMARY_ROUTES.DATABASE_FIRST, reason: "default_database_first" };
}

module.exports = { arbitrateGoalRoute };
