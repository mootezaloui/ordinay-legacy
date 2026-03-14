"use strict";

const crypto = require("node:crypto");

const INTEGRITY_ALGORITHM = "sha256";
const INTEGRITY_VERSION = "v1";

function hashAuditPayload(record) {
  const canonical = canonicalStringify(normalizeAuditRecord(record));
  return crypto.createHash(INTEGRITY_ALGORITHM).update(canonical, "utf8").digest("hex");
}

function buildAuditIntegrityEnvelope(record) {
  return {
    algorithm: INTEGRITY_ALGORITHM,
    version: INTEGRITY_VERSION,
    hash: hashAuditPayload(record),
  };
}

function normalizeAuditRecord(record) {
  const row = isRecord(record) ? record : {};
  return {
    id: normalizeString(row.id),
    sessionId: normalizeString(row.sessionId),
    turnId: normalizeString(row.turnId),
    eventType: normalizeString(row.eventType),
    timestamp: normalizeString(row.timestamp),
    data: stripIntegrity(row.data),
  };
}

function stripIntegrity(value) {
  if (Array.isArray(value)) {
    return value.map(stripIntegrity);
  }

  if (!isRecord(value)) {
    return normalizePrimitive(value);
  }

  const output = {};
  const keys = Object.keys(value).sort();
  for (const key of keys) {
    if (key === "__integrity") {
      continue;
    }
    output[key] = stripIntegrity(value[key]);
  }
  return output;
}

function canonicalStringify(value) {
  if (value === null) return "null";
  if (value === undefined) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "string") return JSON.stringify(value);

  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalStringify(entry)).join(",")}]`;
  }

  if (isRecord(value)) {
    const keys = Object.keys(value).sort();
    const pairs = [];
    for (const key of keys) {
      pairs.push(`${JSON.stringify(key)}:${canonicalStringify(value[key])}`);
    }
    return `{${pairs.join(",")}}`;
  }

  return JSON.stringify(String(value));
}

function normalizePrimitive(value) {
  if (typeof value === "string" || typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : null;
  }
  if (value == null) {
    return null;
  }
  return String(value);
}

function normalizeString(value) {
  return String(value ?? "").trim();
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  hashAuditPayload,
  buildAuditIntegrityEnvelope,
  canonicalStringify,
  INTEGRITY_ALGORITHM,
  INTEGRITY_VERSION,
};

