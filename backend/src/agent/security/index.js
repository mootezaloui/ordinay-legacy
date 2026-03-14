"use strict";

const { evaluateAuthScope } = require("./auth.scope");
const { buildAuditIntegrityEnvelope, hashAuditPayload } = require("./audit.integrity");
const { sanitizeAgentInput } = require("./input.sanitizer");
const { validatePermissionBoundary } = require("./permission.boundary");
const { createRateLimiter, resolveRateLimitKey } = require("./rate.limiter");

function createSecurityRuntime({ rateLimiterConfig } = {}) {
  const limiter = createRateLimiter(rateLimiterConfig);

  function safe(label, fallback, fn) {
    try {
      return fn();
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown security error");
      console.warn(`[agent.security] ${label} failed: ${message}`);
      return fallback;
    }
  }

  return {
    sanitizeAgentInput(rawInput) {
      return safe(
        "sanitizeAgentInput",
        {
          ok: false,
          error: { code: "INPUT_SANITIZER_FAILED", message: "Failed to sanitize input." },
        },
        () => sanitizeAgentInput(rawInput),
      );
    },
    resolveRateLimitKey(context = {}) {
      return safe("resolveRateLimitKey", "anonymous", () => resolveRateLimitKey(context));
    },
    checkRateLimit(context = {}) {
      return safe(
        "checkRateLimit",
        { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 },
        () => {
          const key =
            context.key ||
            resolveRateLimitKey({
              userId: context.userId,
              sessionId: context.sessionId,
              ip: context.ip,
            });
          return limiter.check(key);
        },
      );
    },
    evaluateAuthScope(params = {}) {
      return safe(
        "evaluateAuthScope",
        { allowed: false, scope: "unknown", reason: "Auth scope evaluation failed." },
        () => evaluateAuthScope(params),
      );
    },
    validatePermissionBoundary(params = {}) {
      return safe(
        "validatePermissionBoundary",
        { valid: false, reason: "Permission boundary validation failed." },
        () => validatePermissionBoundary(params),
      );
    },
    hashAuditPayload(record) {
      return safe("hashAuditPayload", "", () => hashAuditPayload(record));
    },
    buildAuditIntegrityEnvelope(record) {
      return safe(
        "buildAuditIntegrityEnvelope",
        { algorithm: "sha256", version: "v1", hash: "" },
        () => buildAuditIntegrityEnvelope(record),
      );
    },
    rateLimiterStats() {
      return safe("rateLimiterStats", { buckets: 0, limit: 0, windowMs: 0 }, () => limiter.stats());
    },
  };
}

module.exports = {
  createSecurityRuntime,
  sanitizeAgentInput,
  createRateLimiter,
  resolveRateLimitKey,
  evaluateAuthScope,
  validatePermissionBoundary,
  hashAuditPayload,
  buildAuditIntegrityEnvelope,
};

