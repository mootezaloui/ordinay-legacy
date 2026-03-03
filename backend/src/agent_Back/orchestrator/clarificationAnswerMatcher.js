"use strict";

const { normalizeText } = require("../entity.resolver");

const YES_TOKENS = new Set([
  "yes",
  "yeah",
  "yep",
  "ok",
  "okay",
  "sure",
  "confirm",
  "confirmed",
  "proceed",
  "go ahead",
  "go-ahead",
  "do it",
  "apply",
]);

const NO_TOKENS = new Set([
  "no",
  "nope",
  "nah",
  "cancel",
  "stop",
  "deny",
  "reject",
  "never mind",
  "nevermind",
]);

function _toPositiveInt(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function _normalizeRef(value) {
  return normalizeText(String(value || "")).replace(/\s+/g, "");
}

function _normalizedEditSimilarity(a, b) {
  const x = String(a || "");
  const y = String(b || "");
  if (!x || !y) return 0;
  if (x === y) return 1;
  const n = x.length;
  const m = y.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 0; i <= n; i += 1) dp[i][0] = i;
  for (let j = 0; j <= m; j += 1) dp[0][j] = j;
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      const cost = x[i - 1] === y[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  const distance = dp[n][m];
  return 1 - distance / Math.max(n, m);
}

function _scoreLabelSimilarity(messageNorm, labelNorm) {
  if (!messageNorm || !labelNorm) return 0;
  if (messageNorm === labelNorm) return 1;
  if (labelNorm.includes(messageNorm)) return 0.94;
  if (messageNorm.includes(labelNorm)) return 0.9;
  const edit = _normalizedEditSimilarity(messageNorm, labelNorm);
  const msgTokens = messageNorm.split(/\s+/).filter(Boolean);
  const labelSet = new Set(labelNorm.split(/\s+/).filter(Boolean));
  let overlap = 0;
  for (const token of msgTokens) {
    if (labelSet.has(token)) overlap += 1;
  }
  const overlapRatio = overlap / Math.max(1, msgTokens.length);
  return Math.max(edit * 0.85, overlapRatio);
}

function _extractCandidates(pendingClarification = null) {
  const artifact =
    pendingClarification && typeof pendingClarification === "object"
      ? pendingClarification.artifact
      : null;
  const suggestions = Array.isArray(artifact?.suggestions) ? artifact.suggestions : [];
  return suggestions
    .map((row) => {
      const entityType = String(row?.entityType || artifact?.entityType || pendingClarification?.entityType || "")
        .trim()
        .toLowerCase();
      const entityId = _toPositiveInt(row?.entityId) || _toPositiveInt(row?.id);
      const label = String(row?.label || row?.title || row?.name || "").trim() || null;
      const reference = String(row?.reference || row?.code || "").trim() || null;
      const scope =
        row?.scope && typeof row.scope === "object" && !Array.isArray(row.scope) ? row.scope : {};
      if (!entityType || !entityId) return null;
      return { entityType, entityId, label, reference, scope };
    })
    .filter(Boolean);
}

function _extractMessageSignals(userMessage = "") {
  const messageRaw = String(userMessage || "").trim();
  const messageNorm = normalizeText(messageRaw);
  const compact = messageNorm.replace(/\s+/g, " ").trim();
  const compactRef = _normalizeRef(messageRaw);
  const exactId = /^\d+$/.test(messageRaw) ? _toPositiveInt(messageRaw) : null;
  const refs = new Set();
  const refPattern = /\b[A-Z]{2,10}-\d{1,8}(?:-\d{1,8})?\b/gi;
  for (const match of messageRaw.matchAll(refPattern)) {
    const normalized = _normalizeRef(match[0]);
    if (normalized) refs.add(normalized);
  }
  if (compactRef && /[a-z]\d|\d[a-z]|-/.test(messageRaw)) refs.add(compactRef);
  return { messageRaw, messageNorm, compact, exactId, refs };
}

function _normalizeYesNo(userMessage = "") {
  const compact = normalizeText(String(userMessage || "")).replace(/\s+/g, " ").trim();
  if (!compact) return null;
  if (YES_TOKENS.has(compact)) return "yes";
  if (NO_TOKENS.has(compact)) return "no";
  return null;
}

function _expectsYesNo(pendingClarification = null) {
  const artifact = pendingClarification?.artifact || {};
  if (String(pendingClarification?.expectedAnswerType || "").toLowerCase() === "yes_no") return true;
  const options = Array.isArray(artifact?.options) ? artifact.options : [];
  if (options.length !== 2) return false;
  const normalized = options.map((option) => {
    const intent = String(option?.intent || option?.resolveContext?.intent || "").toUpperCase();
    const label = normalizeText(option?.label || option?.title || "");
    return { intent, label };
  });
  const hasAffirmative = normalized.some((row) =>
    row.intent.includes("CONFIRM") ||
    row.intent.includes("PROCEED") ||
    YES_TOKENS.has(row.label),
  );
  const hasNegative = normalized.some((row) =>
    row.intent.includes("REJECT") ||
    row.intent.includes("DENY") ||
    row.intent.includes("CANCEL") ||
    NO_TOKENS.has(row.label),
  );
  return hasAffirmative && hasNegative;
}

function clarificationAnswerMatcher(pendingClarification, userMessage) {
  if (!pendingClarification || typeof pendingClarification !== "object") {
    return { isAnswer: false, reason: "no_pending_clarification" };
  }
  const message = String(userMessage || "").trim();
  if (!message) {
    return { isAnswer: false, reason: "empty_message" };
  }

  const candidates = _extractCandidates(pendingClarification);
  const signals = _extractMessageSignals(message);

  if (candidates.length > 0 && signals.exactId) {
    const matchedById = candidates.find((candidate) => candidate.entityId === signals.exactId);
    if (matchedById) {
      return {
        isAnswer: true,
        reason: "matched_candidate_id",
        resolved: { kind: "selection", ...matchedById },
      };
    }
  }

  if (candidates.length > 0 && signals.refs.size > 0) {
    const matchedByRef = candidates.find((candidate) => {
      const candidateRef = _normalizeRef(candidate.reference || candidate.label || "");
      if (!candidateRef) return false;
      for (const ref of signals.refs) {
        if (!ref) continue;
        if (ref === candidateRef) return true;
        if (candidateRef.includes(ref)) return true;
        if (ref.includes(candidateRef)) return true;
      }
      return false;
    });
    if (matchedByRef) {
      return {
        isAnswer: true,
        reason: "matched_candidate_reference",
        resolved: { kind: "selection", ...matchedByRef },
      };
    }
  }

  if (candidates.length > 0 && signals.messageNorm) {
    const ranked = candidates
      .map((candidate) => {
        const labelNorm = normalizeText(candidate.label || "");
        const score = _scoreLabelSimilarity(signals.messageNorm, labelNorm);
        return { candidate, score };
      })
      .filter((entry) => entry.score >= 0.88)
      .sort((a, b) => b.score - a.score);
    if (ranked.length === 1 || (ranked.length > 1 && ranked[0].score - ranked[1].score >= 0.08)) {
      return {
        isAnswer: true,
        reason: "matched_candidate_label",
        resolved: { kind: "selection", ...ranked[0].candidate },
      };
    }
  }

  if (_expectsYesNo(pendingClarification)) {
    const yesNo = _normalizeYesNo(message);
    if (yesNo) {
      return {
        isAnswer: true,
        reason: "matched_yes_no",
        resolved: { kind: "yes_no", value: yesNo },
      };
    }
    return { isAnswer: false, reason: "expected_yes_no_but_unmatched" };
  }

  return { isAnswer: false, reason: "message_does_not_match_pending_clarification_shape" };
}

module.exports = {
  clarificationAnswerMatcher,
};
