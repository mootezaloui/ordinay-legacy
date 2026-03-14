"use strict";

const MAX_RECENT_TURNS = 12;
const SUMMARY_TRIGGER_TURNS = 24;
const SUMMARY_MAX_TOKENS = 3500;
const ENTITY_PRUNE_TURNS = 20;

const MAX_ENTITY_DIGEST_ITEMS = 12;
const MAX_ENTITY_DIGEST_CHARS = 900;
const ENTITY_HARD_CAP = 60;
const SUMMARY_OUTPUT_MAX_CHARS = 1800;
const SUMMARY_GENERATE_MAX_TOKENS = 600;

function estimateTokensFromText(text) {
  const value = typeof text === "string" ? text : "";
  if (!value.trim()) {
    return 0;
  }
  return Math.ceil(value.length / 4);
}

function estimateSessionTokens(session) {
  if (!session || !Array.isArray(session.turns)) {
    return 0;
  }

  const summary = typeof session.summary === "string" ? session.summary : "";
  const turnsText = session.turns
    .map((turn) => `[${String(turn?.role || "assistant")}] ${String(turn?.message || "")}`)
    .join("\n");
  const pendingSummary = String(session?.state?.pendingAction?.summary || "");
  const digest = [summary, turnsText, pendingSummary].filter(Boolean).join("\n");

  return estimateTokensFromText(digest);
}

module.exports = {
  MAX_RECENT_TURNS,
  SUMMARY_TRIGGER_TURNS,
  SUMMARY_MAX_TOKENS,
  ENTITY_PRUNE_TURNS,
  MAX_ENTITY_DIGEST_ITEMS,
  MAX_ENTITY_DIGEST_CHARS,
  ENTITY_HARD_CAP,
  SUMMARY_OUTPUT_MAX_CHARS,
  SUMMARY_GENERATE_MAX_TOKENS,
  estimateTokensFromText,
  estimateSessionTokens,
};
