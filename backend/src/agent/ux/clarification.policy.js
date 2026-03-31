"use strict";

const MAX_OFFER_CHOICES = 5;

function decideClarificationAction({
  ambiguityResult,
  turnType,
  pendingAction,
  session,
} = {}) {
  const ambiguity = normalizeAmbiguityResult(ambiguityResult);
  if (!ambiguity.ambiguous) {
    return {
      action: "proceed",
      reason: "No high-confidence ambiguity detected.",
    };
  }

  if (pendingAction || turnType === "CONFIRMATION" || turnType === "REJECTION") {
    return {
      action: "proceed",
      reason: "Pending-action flow must be handled by engine confirmation logic.",
    };
  }

  const repeated = isRepeatedClarification(ambiguity, session);
  const candidateCount = ambiguity.candidates.length;
  const highRisk = ambiguity.highRiskIntent === true;

  if (ambiguity.kind === "multiple_candidates") {
    if (candidateCount >= 2 && candidateCount <= MAX_OFFER_CHOICES) {
      return {
        action: repeated ? "proceed" : "offer_choices",
        reason: repeated
          ? "Same candidate ambiguity already requested; avoiding clarification loop."
          : "Small candidate set can be resolved with explicit options.",
      };
    }
    return {
      action: "ask",
      reason: "Candidate set is too broad for safe selection.",
    };
  }

  if (highRisk && ambiguity.confidence === "high") {
    if (repeated) {
      return {
        action: candidateCount >= 2 && candidateCount <= MAX_OFFER_CHOICES ? "offer_choices" : "proceed",
        reason: "Repeated ambiguity without context change; avoid repeated blocking ask.",
      };
    }
    return {
      action: "ask",
      reason: "High-confidence ambiguity on potentially mutating intent.",
    };
  }

  if (!highRisk && ambiguity.confidence === "low") {
    return {
      action: "proceed",
      reason: "Low-confidence non-mutating ambiguity should not block progression.",
    };
  }

  if (repeated) {
    return {
      action: candidateCount >= 2 && candidateCount <= MAX_OFFER_CHOICES ? "offer_choices" : "proceed",
      reason: "Repeated unresolved ambiguity with unchanged fingerprint.",
    };
  }

  return {
    action: "ask",
    reason: "Ambiguity should be clarified before continuing.",
  };
}

function isRepeatedClarification(ambiguity, session) {
  const sessionMeta = toRecord(session && session.metadata);
  const uxMeta = toRecord(sessionMeta && sessionMeta.ux);
  const lastFingerprint = normalizeOptionalString(uxMeta && uxMeta.lastClarificationFingerprint);
  const lastKind = normalizeOptionalString(uxMeta && uxMeta.lastClarificationKind);
  if (!lastFingerprint) {
    return false;
  }
  return lastFingerprint === ambiguity.fingerprint && lastKind === ambiguity.kind;
}

function normalizeAmbiguityResult(value) {
  const row = toRecord(value) || {};
  return {
    ambiguous: row.ambiguous === true,
    kind: normalizeOptionalString(row.kind) || "none",
    confidence: normalizeOptionalString(row.confidence) || "low",
    candidates: Array.isArray(row.candidates) ? row.candidates : [],
    highRiskIntent: row.highRiskIntent === true,
    fingerprint: normalizeOptionalString(row.fingerprint) || "",
  };
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
  MAX_OFFER_CHOICES,
  decideClarificationAction,
};
