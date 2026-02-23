"use strict";

function logMutationIntentDetection(logger, payload = {}) {
  if (typeof logger !== "function") return;
  try {
    logger({
      type: "mutation_intent_detection_evaluated",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  } catch (_) {
    // logging should never break chat flow
  }
}

function logMutationIntentProposalCreated(logger, payload = {}) {
  if (typeof logger !== "function") return;
  try {
    logger({
      type: "mutation_intent_proposal_created",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  } catch (_) {}
}

function logMutationIntentClarification(logger, payload = {}) {
  if (typeof logger !== "function") return;
  try {
    logger({
      type: "mutation_intent_clarification_requested",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  } catch (_) {}
}

function logMutationIntentActionAttempted(logger, payload = {}) {
  if (typeof logger !== "function") return;
  try {
    logger({
      type: "mutation_intent_action_attempted",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  } catch (_) {}
}

function logMutationIntentActionOutcome(logger, payload = {}) {
  if (typeof logger !== "function") return;
  try {
    logger({
      type: "mutation_intent_action_outcome",
      ...payload,
      timestamp: payload.timestamp || new Date().toISOString(),
    });
  } catch (_) {}
}

module.exports = {
  logMutationIntentDetection,
  logMutationIntentProposalCreated,
  logMutationIntentClarification,
  logMutationIntentActionAttempted,
  logMutationIntentActionOutcome,
};
