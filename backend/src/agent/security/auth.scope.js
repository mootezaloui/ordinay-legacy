"use strict";

const KNOWN_SCOPES = new Set(["read", "draft", "execute", "admin", "unknown"]);

const SCOPE_RANK = {
  unknown: 0,
  read: 1,
  draft: 2,
  execute: 3,
  admin: 4,
};

function evaluateAuthScope({ user, requestedAction } = {}) {
  const scope = normalizeScope(extractScope(user));
  const requiredByAction = normalizeRequestedActionScope(requestedAction);
  if (!requiredByAction) {
    return {
      allowed: true,
      scope,
    };
  }

  if (scope === "unknown" && (requiredByAction === "execute" || requiredByAction === "admin")) {
    return {
      allowed: false,
      reason: `Missing auth context does not permit requested action "${requiredByAction}".`,
      scope,
    };
  }

  if (scope === "unknown") {
    return {
      allowed: true,
      scope,
    };
  }

  if (!scopeSatisfies(scope, requiredByAction)) {
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

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  evaluateAuthScope,
  normalizeScope,
};
