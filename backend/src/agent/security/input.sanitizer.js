"use strict";

const MAX_SESSION_ID_LENGTH = 128;
const MAX_TURN_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 8000;
const MAX_USER_ID_LENGTH = 128;
const METADATA_MAX_DEPTH = 4;
const METADATA_MAX_KEYS = 64;
const METADATA_MAX_ARRAY = 64;
const METADATA_MAX_STRING = 1024;

function sanitizeAgentInput(rawInput) {
  const payload = isPlainObject(rawInput) ? rawInput : null;
  if (!payload) {
    return invalid("INVALID_PAYLOAD", "Invalid payload: expected JSON object body.");
  }

  const sessionId = sanitizeBoundedRequiredString(
    payload.sessionId,
    "sessionId",
    MAX_SESSION_ID_LENGTH,
  );
  if (!sessionId.ok) return sessionId;

  const turnId = sanitizeBoundedRequiredString(payload.turnId, "turnId", MAX_TURN_ID_LENGTH);
  if (!turnId.ok) return turnId;

  const message = sanitizeBoundedRequiredString(payload.message, "message", MAX_MESSAGE_LENGTH);
  if (!message.ok) return message;

  const metadata = sanitizeMetadata(payload.metadata);
  const userId = sanitizeOptionalString(payload.userId, MAX_USER_ID_LENGTH);

  return {
    ok: true,
    value: {
      sessionId: sessionId.value,
      turnId: turnId.value,
      message: message.value,
      metadata,
      userId: userId || undefined,
    },
  };
}

function sanitizeBoundedRequiredString(value, field, maxLength) {
  const text = String(value ?? "").trim();
  if (!text) {
    return invalid("MISSING_REQUIRED_FIELD", `Invalid payload: ${field} is required.`);
  }
  if (text.length > maxLength) {
    return invalid(
      "FIELD_TOO_LONG",
      `Invalid payload: ${field} exceeds max length ${maxLength}.`,
    );
  }
  return { ok: true, value: text };
}

function sanitizeOptionalString(value, maxLength) {
  if (value == null) return null;
  const text = String(value).trim();
  if (!text) return null;
  if (text.length > maxLength) {
    return text.slice(0, maxLength);
  }
  return text;
}

function sanitizeMetadata(value) {
  if (!isPlainObject(value)) {
    return {};
  }

  const walked = walkMetadata(value, 0);
  return isPlainObject(walked) ? walked : {};
}

function walkMetadata(value, depth) {
  if (depth > METADATA_MAX_DEPTH) {
    return undefined;
  }

  if (value == null) {
    return null;
  }

  const primitive = sanitizePrimitive(value);
  if (primitive !== undefined) {
    return primitive;
  }

  if (Array.isArray(value)) {
    const out = [];
    const max = Math.min(value.length, METADATA_MAX_ARRAY);
    for (let index = 0; index < max; index += 1) {
      const next = walkMetadata(value[index], depth + 1);
      if (next !== undefined) {
        out.push(next);
      }
    }
    return out;
  }

  if (!isPlainObject(value)) {
    return undefined;
  }

  const out = {};
  const keys = Object.keys(value).sort();
  const max = Math.min(keys.length, METADATA_MAX_KEYS);
  for (let index = 0; index < max; index += 1) {
    const key = keys[index];
    const next = walkMetadata(value[key], depth + 1);
    if (next !== undefined) {
      out[key] = next;
    }
  }
  return out;
}

function sanitizePrimitive(value) {
  if (typeof value === "string") {
    return value.length > METADATA_MAX_STRING ? value.slice(0, METADATA_MAX_STRING) : value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : undefined;
  }
  if (typeof value === "boolean") {
    return value;
  }
  return undefined;
}

function invalid(code, message) {
  return {
    ok: false,
    error: { code, message },
  };
}

function isPlainObject(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  sanitizeAgentInput,
  MAX_SESSION_ID_LENGTH,
  MAX_TURN_ID_LENGTH,
  MAX_MESSAGE_LENGTH,
};
