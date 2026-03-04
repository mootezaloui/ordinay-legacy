"use strict";

const { getEntityFieldSchema } = require("./entityFieldRegistry");

const PLACEHOLDER_PATTERNS = [
  /^tbd$/i,
  /^to be (defined|confirmed|decided)$/i,
  /^unknown$/i,
  /^n\/?a$/i,
  /^none$/i,
  /^null$/i,
  /^placeholder$/i,
];

function deepClone(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_) {
    return { ...value };
  }
}

function hasValue(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === "string" && !value.trim()) return false;
  return true;
}

function isCriticalPlaceholder(value) {
  if (typeof value !== "string") return false;
  const text = value.trim();
  if (!text) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(text));
}

function resolveAutoToken(auto, context = {}) {
  const token = String(auto || "").trim().toLowerCase();
  if (!token) return undefined;
  if (token === "now") return new Date().toISOString();
  if (token === "today") return new Date().toISOString().slice(0, 10);
  if (token === "currentuser") {
    const userId =
      context?.activeScope?.userId ||
      context?.activeScope?.currentUserId ||
      context?.activeScope?.createdBy ||
      null;
    return userId === null || userId === undefined ? undefined : userId;
  }
  return undefined;
}

function resolveDefaultValue(rule = {}, context = {}) {
  if (typeof rule.default === "function") {
    return rule.default(context);
  }
  if (rule.default !== undefined) return rule.default;
  if (typeof rule.auto === "function") {
    return rule.auto(context);
  }
  if (typeof rule.auto === "string") {
    return resolveAutoToken(rule.auto, context);
  }
  return undefined;
}

function validateAndPrepareFields({ entityType, payload, activeScope } = {}) {
  const normalizedEntityType = String(entityType || "").trim().toLowerCase();
  const schema = getEntityFieldSchema(normalizedEntityType);
  const preparedPayload = deepClone(payload);
  const context = {
    entityType: normalizedEntityType,
    payload: preparedPayload,
    activeScope: activeScope && typeof activeScope === "object" ? activeScope : {},
  };

  const missingCriticalFields = [];
  const entries = Object.entries(schema);

  for (const [fieldName, rule] of entries) {
    const currentValue = preparedPayload[fieldName];
    const isCritical = String(rule?.category || "").toLowerCase() === "critical";

    if (isCritical && isCriticalPlaceholder(currentValue)) {
      delete preparedPayload[fieldName];
    }

    if (!hasValue(preparedPayload[fieldName])) {
      const resolved = resolveDefaultValue(rule || {}, context);
      if (hasValue(resolved)) {
        preparedPayload[fieldName] = resolved;
      }
    }

    if (
      rule?.required === true &&
      isCritical &&
      !hasValue(preparedPayload[fieldName])
    ) {
      missingCriticalFields.push(fieldName);
    }
  }

  return {
    status: missingCriticalFields.length > 0 ? "needs_input" : "ready",
    preparedPayload,
    missingCriticalFields,
  };
}

module.exports = {
  validateAndPrepareFields,
};
