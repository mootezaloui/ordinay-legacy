import type { AgentMessage } from "../types/agentMessage";
import type { CommentaryOutput, FollowUpSuggestion } from "../../services/api/agent";

// Only filter out truly empty/error responses, not valid commentary
// The backend already sanitizes commentary - we only need minimal filtering here
const REDUNDANT_PHRASES = [
  "no data available",
  "error occurred",
  "something went wrong",
];

function splitSentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [])
    .map((part) => part.trim())
    .filter(Boolean);
}

function capSentences(text: string, maxSentences: number): string {
  const sentences = splitSentences(text);
  if (sentences.length <= maxSentences) return text.trim();
  return sentences.slice(0, maxSentences).join(" ").trim();
}

function tokenize(text: string): string[] {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3);
}

function isRedundant(commentary: string, reference: string | undefined): boolean {
  if (!commentary || !reference) return false;
  const refTokens = new Set(tokenize(reference));
  // Require more reference tokens before considering redundancy
  if (refTokens.size < 8) return false;
  const commentTokens = tokenize(commentary);
  if (commentTokens.length === 0) return false;
  let overlap = 0;
  for (const token of commentTokens) {
    if (refTokens.has(token)) overlap += 1;
  }
  // Raised threshold from 0.6 to 0.85 - only filter near-exact duplicates
  return overlap / refTokens.size >= 0.85;
}

export function getResultCountFromMessage(message: AgentMessage): number | null {
  const explanation = message.data?.explanation;
  if (!explanation) return null;

  const summaryText = explanation.facts?.summary || explanation.summary || "";
  if (/no\s+\w+/i.test(summaryText) || /no\s+.+(found|available)/i.test(summaryText)) {
    return 0;
  }

  if (explanation.entityId?.startsWith("list:")) {
    const countMatch = summaryText.match(/(\d+)/);
    if (countMatch) {
      return parseInt(countMatch[1], 10);
    }
    const countFromStatements = explanation.interpretation?.statements?.find((stmt) =>
      /\d+/.test(stmt.statement)
    );
    if (countFromStatements) {
      const match = countFromStatements.statement.match(/(\d+)/);
      if (match) return parseInt(match[1], 10);
    }
    if (Array.isArray(explanation.facts?.details)) {
      return explanation.facts.details.length;
    }
  }

  return 1;
}

export function decideCommentary(message: AgentMessage): CommentaryOutput | null {
  const commentary = message.commentary;
  if (!commentary?.message) return null;

  const explanation = message.data?.explanation;
  if (!explanation) {
    const normalized = commentary.message.toLowerCase();
    if (REDUNDANT_PHRASES.some((phrase) => normalized.includes(phrase))) {
      return null;
    }
    return { ...commentary, message: capSentences(commentary.message, 4) };
  }

  const normalized = commentary.message.toLowerCase();
  if (REDUNDANT_PHRASES.some((phrase) => normalized.includes(phrase))) {
    return null;
  }

  if (
    isRedundant(commentary.message, explanation?.facts?.summary) ||
    isRedundant(commentary.message, explanation?.interpretation?.summary)
  ) {
    return null;
  }

  // Assistive delta — reject messages that just narrate artifact content
  const restatementPattern = /\b(has|shows?|contains?|found|retrieved|there (?:are|is))\s+\d+\s+(task|session|hearing|dossier|mission)/i;
  if (restatementPattern.test(commentary.message)) {
    return null;
  }

  return { ...commentary, message: capSentences(commentary.message, 4) };
}

export function filterFollowUps(
  followUps: FollowUpSuggestion[] | undefined,
  resultCount: number | null
): FollowUpSuggestion[] {
  if (!followUps || followUps.length === 0) return [];

  // Schema safety: drop any follow-ups with invalid categories (frontend guard)
  const VALID_CATEGORIES = new Set([
    "urgency", "accountability", "planning", "exploration", "summary",
    "selection", "search", "navigation", "guidance",
  ]);
  const schemaValidFollowUps = followUps.filter((f) => {
    if (!f.category || !VALID_CATEGORIES.has(f.category)) {
      console.warn(`[ResponsePolicy] Dropped follow-up with invalid category: "${f.category}"`);
      return false;
    }
    return true;
  });

  if (resultCount === null) return schemaValidFollowUps;

  return schemaValidFollowUps.filter((followUp) => {
    const normalizedIntent = String(followUp.intent || "").toUpperCase();
    const labelKey = String(followUp.labelKey || "").toLowerCase();
    const isSummarize =
      labelKey === "summarize" || normalizedIntent.includes("SUMMARIZE");
    const isExplainStatus =
      labelKey === "explain_status" ||
      (normalizedIntent.includes("EXPLAIN") && normalizedIntent.includes("STATE"));
    if (resultCount === 0) {
      if (isSummarize) return false;
    }
    if (resultCount > 1) {
      if (isSummarize) return false;
      if (isExplainStatus) return false;
    }
    return true;
  });
}
