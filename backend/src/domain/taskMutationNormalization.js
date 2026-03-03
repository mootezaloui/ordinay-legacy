"use strict";

const TASK_ALLOWED_STATUSES = Object.freeze(["todo", "in_progress", "blocked", "done", "cancelled"]);
const TASK_ALLOWED_PRIORITIES = Object.freeze(["urgent", "high", "medium", "low"]);

const STATUS_ALIASES = Object.freeze({
  "not started": "todo",
  "not_started": "todo",
  pending: "todo",
  todo: "todo",
  "in progress": "in_progress",
  in_progress: "in_progress",
  blocked: "blocked",
  done: "done",
  completed: "done",
  cancelled: "cancelled",
  canceled: "cancelled",
});

const PRIORITY_ALIASES = Object.freeze({
  urgent: "urgent",
  high: "high",
  medium: "medium",
  low: "low",
  normale: "medium",
  normal: "medium",
});

function _normalizeToken(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function normalizeTaskStatus(value, fallback = "todo") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  const normalized = STATUS_ALIASES[raw] || STATUS_ALIASES[_normalizeToken(raw)] || _normalizeToken(raw);
  return TASK_ALLOWED_STATUSES.includes(normalized) ? normalized : fallback;
}

function normalizeTaskPriority(value, fallback = "medium") {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const raw = String(value).trim().toLowerCase();
  const normalized = PRIORITY_ALIASES[raw] || PRIORITY_ALIASES[_normalizeToken(raw)] || _normalizeToken(raw);
  return TASK_ALLOWED_PRIORITIES.includes(normalized) ? normalized : fallback;
}

function normalizeTaskMutationPayload(payload = {}, { operation = "create" } = {}) {
  const safePayload =
    payload && typeof payload === "object" && !Array.isArray(payload) ? { ...payload } : {};
  const op = String(operation || "").trim().toLowerCase();

  if (op === "create") {
    safePayload.status = normalizeTaskStatus(safePayload.status, "todo");
    safePayload.priority = normalizeTaskPriority(safePayload.priority, "medium");
    return safePayload;
  }

  if (Object.prototype.hasOwnProperty.call(safePayload, "status")) {
    safePayload.status = normalizeTaskStatus(safePayload.status, "todo");
  }
  if (Object.prototype.hasOwnProperty.call(safePayload, "priority")) {
    safePayload.priority = normalizeTaskPriority(safePayload.priority, "medium");
  }
  return safePayload;
}

module.exports = {
  TASK_ALLOWED_STATUSES,
  TASK_ALLOWED_PRIORITIES,
  normalizeTaskStatus,
  normalizeTaskPriority,
  normalizeTaskMutationPayload,
};
