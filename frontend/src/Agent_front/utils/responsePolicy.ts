import type { AgentMessage } from "../types/agentMessage";
import type { CommentaryOutput, FollowUpSuggestion } from "../../services/api/agent";

// Only filter out truly empty/error responses, not valid commentary
// The backend already sanitizes commentary - we only need minimal filtering here
const REDUNDANT_PHRASES = [
  "no data available",
  "error occurred",
  "something went wrong",
];
const ENABLE_COMMENTARY_RENDERING = false;

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
  if (!ENABLE_COMMENTARY_RENDERING) return null;
  const commentary = message.commentary;
  if (!commentary) return null;
  const synthesizedMessage =
    commentary.message ||
    (Array.isArray(commentary.lines) ? commentary.lines[0] : "") ||
    (typeof commentary.question === "string" ? commentary.question : "") ||
    "";
  if (!synthesizedMessage) return null;
  const normalizedMessage = synthesizedMessage.toLowerCase();
  const normalizedContent = String(message.content || "").toLowerCase().trim();

  const explanation = message.data?.explanation;
  if (!explanation) {
    if (REDUNDANT_PHRASES.some((phrase) => normalizedMessage.includes(phrase))) {
      return null;
    }
    return { ...commentary, message: capSentences(synthesizedMessage, 4) };
  }

  if (REDUNDANT_PHRASES.some((phrase) => normalizedMessage.includes(phrase))) {
    return null;
  }

  // Suppress near-duplicate commentary for plain chat responses.
  if (!explanation && normalizedContent) {
    const a = normalizedMessage.replace(/[^a-z0-9\s]/g, " ").trim();
    const b = normalizedContent.replace(/[^a-z0-9\s]/g, " ").trim();
    if (a === b || a.includes(b) || b.includes(a)) {
      return null;
    }
  }

  if (
    isRedundant(synthesizedMessage, explanation?.facts?.summary) ||
    isRedundant(synthesizedMessage, explanation?.interpretation?.summary)
  ) {
    return null;
  }

  // Assistive delta — reject messages that just narrate artifact content
  const restatementPattern = /\b(has|shows?|contains?|found|retrieved|there (?:are|is))\s+\d+\s+(task|session|hearing|dossier|mission)/i;
  if (restatementPattern.test(synthesizedMessage)) {
    return null;
  }

  return { ...commentary, message: capSentences(synthesizedMessage, 4) };
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
