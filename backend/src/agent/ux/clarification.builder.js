"use strict";

const DEFAULT_DETAIL_OPTIONS = [
  "email",
  "phone",
  "address",
  "status",
  "date",
  "amount",
];

function buildClarificationResponse({
  ambiguityResult,
  candidates,
  session,
} = {}) {
  const ambiguity = normalizeAmbiguityResult(ambiguityResult);
  const resolvedCandidates = normalizeCandidates(
    Array.isArray(candidates) && candidates.length > 0
      ? candidates
      : ambiguity.candidates,
  );

  if (
    ambiguity.kind === "multiple_candidates" &&
    resolvedCandidates.length > 0
  ) {
    return buildChoicesPrompt(resolvedCandidates);
  }

  if (ambiguity.kind === "missing_target") {
    const recentType = inferRecentEntityType(session);
    if (recentType) {
      return `Please identify the target ${recentType} before I continue the requested action.`;
    }
    return "Please specify the exact target before I continue this action.";
  }

  if (ambiguity.kind === "missing_action_detail") {
    return [
      "I have the target, but the requested change is still underspecified.",
      `Which fields should I update (${DEFAULT_DETAIL_OPTIONS.join(", ")})?`,
    ].join(" ");
  }

  if (ambiguity.kind === "unclear_reference") {
    return "I could not resolve your reference to a specific entity. Please provide the exact name or more details so I can proceed safely.";
  }

  return "Please provide the missing legal workflow details so I can proceed precisely.";
}

function buildChoicesPrompt(candidates) {
  const limited = candidates.slice(0, 5);
  const entityType =
    normalizeOptionalString(limited[0] && limited[0].type) || "item";
  const options = limited
    .map((candidate) => formatCandidate(candidate))
    .filter(Boolean);
  const plural = pluralize(entityType);

  if (options.length === 0) {
    return "Multiple candidates are available. Please select one by ID.";
  }

  return `Which ${plural} should I use: ${options.join(", ")}?`;
}

function formatCandidate(candidate) {
  const type = normalizeOptionalString(candidate && candidate.type) || "item";
  const id = normalizeOptionalString(candidate && candidate.id);
  const label = normalizeOptionalString(candidate && candidate.label);
  if (!id && !label) {
    return "";
  }
  if (id && label) {
    return `${type}:${id} (${label})`;
  }
  if (id) {
    return `${type}:${id}`;
  }
  return `${type}:${label}`;
}

function inferRecentEntityType(session) {
  const entities = Array.isArray(session && session.activeEntities)
    ? session.activeEntities
    : [];
  if (entities.length === 0) {
    return "";
  }
  const latest = entities.slice().sort((left, right) => {
    const leftTime = Date.parse(
      String(left && left.lastMentionedAt ? left.lastMentionedAt : ""),
    );
    const rightTime = Date.parse(
      String(right && right.lastMentionedAt ? right.lastMentionedAt : ""),
    );
    if (Number.isFinite(rightTime) && Number.isFinite(leftTime)) {
      return rightTime - leftTime;
    }
    return 0;
  })[0];

  return normalizeOptionalString(latest && latest.type);
}

function pluralize(value) {
  const base = String(value || "").trim();
  if (!base) {
    return "items";
  }
  if (base.endsWith("s")) {
    return base;
  }
  return `${base}s`;
}

function normalizeAmbiguityResult(value) {
  const row = toRecord(value) || {};
  return {
    kind: normalizeOptionalString(row.kind) || "none",
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
  };
}

function normalizeCandidates(value) {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => toRecord(row))
    .filter(Boolean)
    .map((candidate) => ({
      type: normalizeOptionalString(candidate.type),
      id: candidate.id,
      label: normalizeOptionalString(candidate.label),
    }));
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
  buildClarificationResponse,
};
