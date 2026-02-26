"use strict";

const CHAT_STATES = Object.freeze({
  RETRIEVE: "RETRIEVE",
  PLAN_DRAFT: "PLAN_DRAFT",
  EXECUTE: "EXECUTE",
  CLARIFY: "CLARIFY",
  FINAL: "FINAL",
});

function selectInitialState({
  followUpIntent = null,
  sessionState = {},
  policy = null,
  requestContext = {},
} = {}) {
  if (
    String(followUpIntent?.intent || "").toUpperCase() === "RESOLVE_CONTEXT_AND_CONTINUE" ||
    sessionState?.pendingClarification
  ) {
    return CHAT_STATES.CLARIFY;
  }
  if (sessionState?.pendingProposal) {
    return CHAT_STATES.EXECUTE;
  }
  if (requestContext?.draftSession) {
    return CHAT_STATES.PLAN_DRAFT;
  }
  const version = String(policy?.version || "").toLowerCase();
  return version === "v1" ? CHAT_STATES.RETRIEVE : CHAT_STATES.PLAN_DRAFT;
}

module.exports = {
  CHAT_STATES,
  selectInitialState,
};

