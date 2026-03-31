"use strict";

async function withInjectedFailure(target, failureMode, fn) {
  if (!target || typeof target !== "object") {
    throw new Error("withInjectedFailure requires a runtime target object.");
  }
  if (typeof fn !== "function") {
    throw new Error("withInjectedFailure requires a callback function.");
  }

  const restorers = [];
  injectFailure(target, failureMode, restorers);
  try {
    return await fn(target);
  } finally {
    restoreAll(restorers);
  }
}

function injectFailure(target, failureMode, restorers) {
  const mode = normalizeMode(failureMode);
  switch (mode) {
    case "llm_provider_failure":
      requireMethod(target?.loop?.llm, "generate", mode);
      requireMethod(target?.loop?.llm, "stream", mode);
      patchMethod(target.loop.llm, "stream", async function* () {
        throw new Error("Injected LLM provider failure.");
      }, restorers);
      patchMethod(target.loop.llm, "generate", async () => {
        throw new Error("Injected LLM provider failure.");
      }, restorers);
      return;

    case "retrieval_build_failure":
      requireMethod(target?.retrieval, "buildRetrievalContext", mode);
      patchMethod(target.retrieval, "buildRetrievalContext", () => {
        throw new Error("Injected retrieval context failure.");
      }, restorers);
      return;

    case "summarizer_failure":
      requireMethod(target?.loop?.memory?.summarizer, "maybeUpdateSummary", mode);
      patchMethod(target.loop.memory.summarizer, "maybeUpdateSummary", async () => {
        throw new Error("Injected summarizer failure.");
      }, restorers);
      return;

    case "tool_execution_failure":
      requireMethod(target?.loop?.executor, "execute", mode);
      patchMethod(target.loop.executor, "execute", async () => ({
        ok: false,
        errorCode: "INJECTED_TOOL_FAILURE",
        errorMessage: "Injected tool execution failure.",
      }), restorers);
      return;

    case "persistence_append_failure":
      requireMethod(target?.repository, "appendAudit", mode);
      patchMethod(target.repository, "appendAudit", async () => {
        throw new Error("Injected persistence append failure.");
      }, restorers);
      return;

    case "rate_limiter_denial":
      requireMethod(target?.security, "checkRateLimit", mode);
      patchMethod(target.security, "checkRateLimit", () => ({
        allowed: false,
        remaining: 0,
        resetAt: Date.now() + 60_000,
        reason: "Injected rate limiter denial.",
      }), restorers);
      return;

    case "permission_boundary_mismatch":
      requireMethod(target?.security, "validatePermissionBoundary", mode);
      patchMethod(target.security, "validatePermissionBoundary", () => ({
        valid: false,
        reason: "Injected permission boundary mismatch.",
      }), restorers);
      return;

    default:
      throw new Error(`Unsupported failure mode "${failureMode}".`);
  }
}

function normalizeMode(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function requireMethod(target, methodName, mode) {
  if (!target || typeof target[methodName] !== "function") {
    throw new Error(`Failure mode "${mode}" requires method "${methodName}".`);
  }
}

function patchMethod(target, methodName, replacement, restorers) {
  const original = target[methodName];
  target[methodName] = replacement;
  restorers.push(() => {
    target[methodName] = original;
  });
}

function restoreAll(restorers) {
  for (let index = restorers.length - 1; index >= 0; index -= 1) {
    try {
      restorers[index]();
    } catch {
      continue;
    }
  }
}

module.exports = {
  withInjectedFailure,
};
