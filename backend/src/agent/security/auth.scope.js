"use strict";

const KNOWN_SCOPES = new Set(["read", "draft", "execute", "admin", "unknown"]);

const MODE_REQUIRED_SCOPE = {
  READ_ONLY: "read",
  DRAFT: "draft",
  EXECUTE: "execute",
  AUTONOMOUS: "execute",
};

const SCOPE_RANK = {
  unknown: 0,
  read: 1,
  draft: 2,
  execute: 3,
  admin: 4,
};

function evaluateAuthScope({ user, mode, requestedAction } = {}) {
  const normalizedMode = normalizeMode(mode);
  if (!normalizedMode) {
    return {
      allowed: false,
      reason: "Invalid mode for auth scope evaluation.",
      scope: "unknown",
    };
  }

  const scope = normalizeScope(extractScope(user));
  const isMissingAuthContext = scope === "unknown";

  if (isMissingAuthContext) {
    if (normalizedMode === "READ_ONLY" || normalizedMode === "DRAFT") {
      return {
        allowed: true,
        scope,
      };
    }
    return {
      allowed: false,
      reason: "Missing auth context only allows READ_ONLY and DRAFT modes.",
      scope,
    };
  }

  const requiredByMode = MODE_REQUIRED_SCOPE[normalizedMode] || "execute";
  if (!scopeSatisfies(scope, requiredByMode)) {
    return {
      allowed: false,
      reason: `Auth scope "${scope}" does not permit mode "${normalizedMode}".`,
      scope,
    };
  }

  const requiredByAction = normalizeRequestedActionScope(requestedAction);
  if (requiredByAction && !scopeSatisfies(scope, requiredByAction)) {
    return {
      allowed: false,
      reason: `Auth scope "${scope}" does not permit requested action "${requiredByAction}".`,
      scope,
    };
  }

  return {
    allowed: true,
    scope,
  };
}

function extractScope(user) {
  if (!isRecord(user)) {
    return "unknown";
  }

  const direct = normalizeScope(user.scope || user.authScope || user.role);
  if (direct !== "unknown") {
    return direct;
  }

  if (Array.isArray(user.permissions)) {
    const mapped = mapPermissionsToScope(user.permissions);
    if (mapped !== "unknown") {
      return mapped;
    }
  }

  return "unknown";
}

function mapPermissionsToScope(permissions) {
  const normalized = permissions
    .map((value) => String(value || "").trim().toLowerCase())
    .filter(Boolean);

  if (normalized.some((value) => value.includes("admin"))) return "admin";
  if (normalized.some((value) => value.includes("execute") || value.includes("write"))) return "execute";
  if (normalized.some((value) => value.includes("draft"))) return "draft";
  if (normalized.some((value) => value.includes("read") || value.includes("view"))) return "read";
  return "unknown";
}

function normalizeRequestedActionScope(requestedAction) {
  const action = String(requestedAction || "").trim().toLowerCase();
  if (!action) return null;
  if (action.includes("admin")) return "admin";
  if (action.includes("execute") || action.includes("autonomous") || action.includes("write")) {
    return "execute";
  }
  if (action.includes("draft")) return "draft";
  if (action.includes("read")) return "read";
  return null;
}

function scopeSatisfies(actualScope, requiredScope) {
  const actual = SCOPE_RANK[normalizeScope(actualScope)] || 0;
  const required = SCOPE_RANK[normalizeScope(requiredScope)] || 0;
  return actual >= required;
}

function normalizeScope(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (KNOWN_SCOPES.has(normalized)) {
    return normalized;
  }

  switch (normalized) {
    case "reader":
    case "readonly":
    case "read_only":
      return "read";
    case "writer":
    case "editor":
    case "guided":
      return "draft";
    case "operator":
      return "execute";
    default:
      return "unknown";
  }
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toUpperCase();
  if (Object.prototype.hasOwnProperty.call(MODE_REQUIRED_SCOPE, mode)) {
    return mode;
  }
  return null;
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  evaluateAuthScope,
  normalizeScope,
};

