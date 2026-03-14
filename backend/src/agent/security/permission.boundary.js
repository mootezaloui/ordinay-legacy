"use strict";

const MODE_ALLOWED_CATEGORIES = {
  READ_ONLY: new Set(["READ", "EXTERNAL"]),
  DRAFT: new Set(["READ", "EXTERNAL", "PLAN", "WRITE"]),
  EXECUTE: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "EXECUTE"]),
  AUTONOMOUS: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "EXECUTE"]),
};

const SCOPE_ALLOWED_CATEGORIES = {
  unknown: new Set(["READ", "EXTERNAL"]),
  read: new Set(["READ", "EXTERNAL"]),
  draft: new Set(["READ", "EXTERNAL", "PLAN", "WRITE"]),
  execute: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "EXECUTE"]),
  admin: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "EXECUTE"]),
};

function validatePermissionBoundary({ mode, authScope, toolCategory, permissionDecision } = {}) {
  const normalizedMode = normalizeMode(mode);
  const normalizedScope = normalizeScope(authScope);
  const normalizedCategory = normalizeCategory(toolCategory);
  const decision = isRecord(permissionDecision) ? permissionDecision : null;

  if (!normalizedMode || !normalizedCategory || !decision) {
    return {
      valid: false,
      reason: "Permission boundary inputs are incomplete or invalid.",
    };
  }

  const modeAllows = MODE_ALLOWED_CATEGORIES[normalizedMode].has(normalizedCategory);
  const scopeAllows = SCOPE_ALLOWED_CATEGORIES[normalizedScope].has(normalizedCategory);
  const expectedAllowed = modeAllows && scopeAllows;

  if (Boolean(decision.allowed) !== expectedAllowed) {
    return {
      valid: false,
      reason: `Permission mismatch: mode=${normalizedMode}, scope=${normalizedScope}, category=${normalizedCategory}, decision.allowed=${Boolean(
        decision.allowed,
      )}.`,
    };
  }

  if (expectedAllowed) {
    const expectedConfirmation = requiresConfirmation(normalizedMode, normalizedCategory);
    if (Boolean(decision.requiresConfirmation) !== expectedConfirmation) {
      return {
        valid: false,
        reason: `Permission confirmation mismatch: mode=${normalizedMode}, category=${normalizedCategory}, expected=${expectedConfirmation}, got=${Boolean(
          decision.requiresConfirmation,
        )}.`,
      };
    }
  }

  return { valid: true };
}

function requiresConfirmation(mode, category) {
  if (category === "WRITE") {
    return true;
  }
  if (category === "EXECUTE") {
    return mode === "EXECUTE" || mode === "AUTONOMOUS";
  }
  return false;
}

function normalizeMode(value) {
  const mode = String(value || "").trim().toUpperCase();
  return Object.prototype.hasOwnProperty.call(MODE_ALLOWED_CATEGORIES, mode) ? mode : null;
}

function normalizeCategory(value) {
  const category = String(value || "").trim().toUpperCase();
  return ["READ", "WRITE", "PLAN", "EXECUTE", "EXTERNAL"].includes(category)
    ? category
    : null;
}

function normalizeScope(value) {
  const scope = String(value || "").trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(SCOPE_ALLOWED_CATEGORIES, scope) ? scope : "unknown";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  validatePermissionBoundary,
};

