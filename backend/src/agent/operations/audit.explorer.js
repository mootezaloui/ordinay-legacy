"use strict";

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

function createAuditExplorer(repository, options = {}) {
  const maxLimit = clampLimit(options.maxLimit, MAX_LIMIT);

  async function getRecentAuditEvents({ limit, eventTypes, sessionId } = {}) {
    if (!repository || typeof repository.getRecentAuditEvents !== "function") {
      return [];
    }

    const safeLimit = clampLimit(limit, Math.min(maxLimit, MAX_LIMIT), maxLimit);
    const safeEventTypes = normalizeEventTypes(eventTypes);
    const safeSessionId = normalizeOptionalString(sessionId);

    const rows = await repository.getRecentAuditEvents({
      limit: safeLimit,
      eventTypes: safeEventTypes,
      sessionId: safeSessionId || undefined,
    });

    return compactRows(rows);
  }

  async function getTurnTraceByTurnId(turnId) {
    if (!repository || typeof repository.getTurnTraceByTurnId !== "function") {
      return null;
    }

    const safeTurnId = normalizeOptionalString(turnId);
    if (!safeTurnId) {
      return null;
    }

    const row = await repository.getTurnTraceByTurnId(safeTurnId);
    return row ? compactRow(row) : null;
  }

  async function getHealthSnapshots({ limit } = {}) {
    if (!repository || typeof repository.getHealthSnapshots !== "function") {
      return [];
    }

    const rows = await repository.getHealthSnapshots({
      limit: clampLimit(limit, Math.min(maxLimit, 50), Math.min(maxLimit, 50)),
    });
    return compactRows(rows);
  }

  async function getPerformanceSnapshots({ limit } = {}) {
    if (!repository || typeof repository.getPerformanceSnapshots !== "function") {
      return [];
    }

    const rows = await repository.getPerformanceSnapshots({
      limit: clampLimit(limit, Math.min(maxLimit, 50), Math.min(maxLimit, 50)),
    });
    return compactRows(rows);
  }

  return {
    getRecentAuditEvents,
    getTurnTraceByTurnId,
    getHealthSnapshots,
    getPerformanceSnapshots,
  };
}

function compactRows(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(compactRow).filter(Boolean);
}

function compactRow(value) {
  const row = toRecord(value);
  if (!row) {
    return null;
  }

  const data = toRecord(row.data);
  return {
    id: String(row.id || ""),
    sessionId: String(row.sessionId || ""),
    turnId: String(row.turnId || ""),
    eventType: String(row.eventType || ""),
    timestamp: String(row.timestamp || ""),
    data: compactData(data),
  };
}

function compactData(value) {
  const row = toRecord(value);
  if (!row) {
    return {};
  }

  const output = {};
  const keys = Object.keys(row).sort().slice(0, 20);
  for (const key of keys) {
    output[key] = compactValue(row[key]);
  }
  return output;
}

function compactValue(value) {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === "string") {
    return value.length > 300 ? `${value.slice(0, 300)}...` : value;
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.slice(0, 10).map(compactValue);
  }
  if (typeof value === "object") {
    const row = toRecord(value);
    if (!row) {
      return {};
    }
    const subset = {};
    for (const key of Object.keys(row).slice(0, 10)) {
      subset[key] = compactValue(row[key]);
    }
    return subset;
  }
  return String(value);
}

function normalizeEventTypes(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => String(entry || "").trim()).filter(Boolean))].slice(0, 20);
}

function clampLimit(value, fallback, max = MAX_LIMIT) {
  const parsed = Number.parseInt(String(value ?? fallback ?? DEFAULT_LIMIT), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return Math.min(DEFAULT_LIMIT, max);
  }
  return Math.min(parsed, max);
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  createAuditExplorer,
};
