"use strict";

const CLOSED_STATUS_VALUES = new Set([
  "closed",
  "archived",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
  "dismissed",
  "inactive",
  "done",
  "paid",
  "void",
  "deleted",
]);

const CATEGORY_SYNONYMS = Object.freeze({
  divorce: ["divorce", "separation"],
  custody: ["custody", "guardian", "guardianship", "kids guard", "child guard"],
  child_support: ["child support", "alimony", "support pension", "pension"],
  visitation: ["visitation", "visit", "access", "parenting time"],
  inheritance: ["inheritance", "succession", "estate"],
  eviction: ["eviction", "expulsion"],
  collection: ["collection", "debt", "invoice", "payment"],
  hearing: ["hearing", "session", "appearance"],
  mission: ["mission", "service order", "assignment"],
});

const GLOBAL_SCOPE = Object.freeze({ type: "global", fields: [] });

function normalizeText(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function normalizePhone(value) {
  const raw = String(value || "").replace(/\D+/g, "");
  return raw || null;
}

function normalizeDate(value) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (match) return match[1];
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function tokenize(value) {
  const text = normalizeText(value);
  if (!text) return [];
  return text
    .split(" ")
    .map((token) => token.trim())
    .filter((token) => token.length > 2);
}

function collectTokens(values = []) {
  const merged = new Set();
  for (const value of values) {
    for (const token of tokenize(value)) merged.add(token);
  }
  return [...merged];
}

function extractCategories(values = []) {
  const haystack = normalizeText(values.filter(Boolean).join(" "));
  const categories = [];
  for (const [key, aliases] of Object.entries(CATEGORY_SYNONYMS)) {
    if (aliases.some((alias) => haystack.includes(normalizeText(alias)))) {
      categories.push(key);
    }
  }
  return categories;
}

function isOpenLikeStatus(value) {
  const normalized = normalizeText(value);
  if (!normalized) return true;
  return !CLOSED_STATUS_VALUES.has(normalized);
}

function buildScope(type, fields = []) {
  return { type, fields };
}

const ENTITY_IDENTITY_POLICIES = Object.freeze({
  client: {
    scope: GLOBAL_SCOPE,
    confidenceThresholds: { duplicate: 0.86, ambiguous: 0.58 },
  },
  dossier: {
    scope: buildScope("client", ["client_id"]),
    confidenceThresholds: { duplicate: 0.84, ambiguous: 0.56 },
  },
  lawsuit: {
    scope: buildScope("dossier", ["dossier_id"]),
    confidenceThresholds: { duplicate: 0.84, ambiguous: 0.56 },
  },
  task: {
    scope: buildScope("parent", ["lawsuit_id", "dossier_id"]),
    confidenceThresholds: { duplicate: 0.88, ambiguous: 0.6 },
    preferOpenCandidates: true,
  },
  session: {
    scope: buildScope("parent", ["lawsuit_id", "dossier_id"]),
    confidenceThresholds: { duplicate: 0.88, ambiguous: 0.62 },
    preferOpenCandidates: true,
  },
  mission: {
    scope: buildScope("parent", ["lawsuit_id", "dossier_id"]),
    confidenceThresholds: { duplicate: 0.88, ambiguous: 0.6 },
    preferOpenCandidates: true,
  },
  financial_entry: {
    scope: buildScope("composite_parent", [
      "lawsuit_id",
      "dossier_id",
      "mission_id",
      "task_id",
      "personal_task_id",
      "client_id",
    ]),
    confidenceThresholds: { duplicate: 0.9, ambiguous: 0.62 },
  },
  officer: {
    scope: GLOBAL_SCOPE,
    confidenceThresholds: { duplicate: 0.86, ambiguous: 0.58 },
  },
  document: {
    scope: buildScope("composite_parent", [
      "client_id",
      "dossier_id",
      "lawsuit_id",
      "mission_id",
      "task_id",
      "session_id",
      "personal_task_id",
      "financial_entry_id",
      "officer_id",
    ]),
    confidenceThresholds: { duplicate: 0.9, ambiguous: 0.62 },
  },
  note: {
    scope: buildScope("note_parent", ["entity_type", "entity_id"]),
    confidenceThresholds: { duplicate: 0.95, ambiguous: 0.75 },
  },
  notification: {
    scope: GLOBAL_SCOPE,
    confidenceThresholds: { duplicate: 0.95, ambiguous: 0.7 },
  },
  personal_task: {
    scope: GLOBAL_SCOPE,
    confidenceThresholds: { duplicate: 0.88, ambiguous: 0.6 },
    preferOpenCandidates: true,
  },
});

function getEntityIdentityPolicy(entityType) {
  return ENTITY_IDENTITY_POLICIES[String(entityType || "").toLowerCase()] || null;
}

module.exports = {
  getEntityIdentityPolicy,
  normalizeText,
  normalizePhone,
  normalizeDate,
  toNumber,
  collectTokens,
  extractCategories,
  isOpenLikeStatus,
};
