"use strict";

const SCOPE_ALLOWED_CATEGORIES = {
  unknown: new Set(["READ", "EXTERNAL", "PLAN", "DRAFT", "SYSTEM"]),
  read: new Set(["READ", "EXTERNAL"]),
  draft: new Set(["READ", "EXTERNAL", "DRAFT", "SYSTEM"]),
  execute: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "DRAFT", "EXECUTE", "SYSTEM"]),
  admin: new Set(["READ", "EXTERNAL", "PLAN", "WRITE", "DRAFT", "EXECUTE", "SYSTEM"]),
};

function validatePermissionBoundary({ authScope, toolCategory, permissionDecision } = {}) {
  const normalizedScope = normalizeScope(authScope);
  const normalizedCategory = normalizeCategory(toolCategory);
  const decision = isRecord(permissionDecision) ? permissionDecision : null;

  if (!normalizedCategory || !decision) {
    return {
      valid: false,
      reason: "Permission boundary inputs are incomplete or invalid.",
    };
  }

  const scopeAllows = SCOPE_ALLOWED_CATEGORIES[normalizedScope].has(normalizedCategory);
  const expectedAllowed = scopeAllows;

  if (Boolean(decision.allowed) !== expectedAllowed) {
    return {
      valid: false,
      reason: `Permission mismatch: scope=${normalizedScope}, category=${normalizedCategory}, decision.allowed=${Boolean(
        decision.allowed,
      )}.`,
    };
  }

  if (expectedAllowed) {
    const expectedConfirmation = requiresConfirmation(normalizedCategory);
    if (Boolean(decision.requiresConfirmation) !== expectedConfirmation) {
      return {
        valid: false,
        reason: `Permission confirmation mismatch: scope=${normalizedScope}, category=${normalizedCategory}, expected=${expectedConfirmation}, got=${Boolean(
          decision.requiresConfirmation,
        )}.`,
      };
    }
  }

  return { valid: true };
}

function requiresConfirmation(category) {
  return category === "WRITE" || category === "EXECUTE";
}

function normalizeCategory(value) {
  const category = String(value || "").trim().toUpperCase();
  return ["READ", "WRITE", "DRAFT", "PLAN", "EXECUTE", "EXTERNAL", "SYSTEM"].includes(category)
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
