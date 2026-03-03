"use strict";

const DEFAULT_STATE = Object.freeze({
  activeState: null,
  activeScope: null,
  pendingClarification: null,
  pendingProposal: null,
  structuredDraft: null,
  lastStructuredDraft: null,
  lastDraftCapability: null,
  lastDraftEntityType: null,
  turnCounter: 0,
});

function _keyParts(requestContext = {}) {
  const conversationId =
    requestContext?.conversationId ||
    requestContext?.agentSessionId ||
    requestContext?.sessionId ||
    "global";
  const userId = requestContext?.userId || "default";
  return { conversationId: String(conversationId), userId: String(userId) };
}

function _store(engine) {
  const s = engine?.contextStore?._operationalStore;
  if (!s || typeof s.get !== "function" || typeof s.update !== "function") return null;
  return s;
}

function getChatOrchestratorState(engine, requestContext = {}) {
  const store = _store(engine);
  if (!store) return { ...DEFAULT_STATE };
  const { conversationId, userId } = _keyParts(requestContext);
  const row = store.get(userId, conversationId);
  return {
    ...DEFAULT_STATE,
    ...(row?.orchestratorState && typeof row.orchestratorState === "object"
      ? row.orchestratorState
      : {}),
  };
}

function updateChatOrchestratorState(engine, requestContext = {}, patch = {}) {
  const store = _store(engine);
  if (!store) return { ...DEFAULT_STATE, ...(patch || {}) };
  const { conversationId, userId } = _keyParts(requestContext);
  const current = getChatOrchestratorState(engine, requestContext);
  const next = {
    ...current,
    ...(patch && typeof patch === "object" ? patch : {}),
  };
  store.update(userId, conversationId, { orchestratorState: next });
  return next;
}

function clearPendingProposalState(engine, requestContext = {}) {
  return updateChatOrchestratorState(engine, requestContext, { pendingProposal: null });
}

function clearPendingClarificationState(engine, requestContext = {}) {
  return updateChatOrchestratorState(engine, requestContext, {
    pendingClarification: null,
  });
}

module.exports = {
  getChatOrchestratorState,
  updateChatOrchestratorState,
  clearPendingProposalState,
  clearPendingClarificationState,
};
