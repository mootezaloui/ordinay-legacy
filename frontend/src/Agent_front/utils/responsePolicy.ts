import type { AgentMessage } from "../types/agentMessage";
import type { CommentaryOutput, FollowUpSuggestion } from "../../services/api/agent";

const REDUNDANT_PHRASES = [
  "no urgent concerns",
  "stable state",
  "no records found",
  "no record found",
  "no results found",
  "no data available",
];
const CLARIFICATION_PATTERN =
  /\bwhich\s+\w+|\bprovide\s+(an|a)\s+id|more\s+information\s+required|please\s+specify|provide\s+more\s+information/i;

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
  if (refTokens.size < 4) return false;
  const commentTokens = tokenize(commentary);
  if (commentTokens.length === 0) return false;
  let overlap = 0;
  for (const token of commentTokens) {
    if (refTokens.has(token)) overlap += 1;
  }
  return overlap / refTokens.size >= 0.6;
}

function buildEmptyGuidance(entityType?: string): string {
  const label = entityType ? entityType.replace(/_/g, " ") : "records";
  return `No ${label} records are available in this scope yet. This may mean none exist, the scope is too narrow, or entries have not been added; check the parent context or broaden the scope if you expected results.`;
}

function buildMultipleGuidance(entityType?: string): string {
  const label = entityType ? entityType.replace(/_/g, " ") : "records";
  return `Multiple ${label} records match this request. Select one to continue or narrow the scope to refine the list.`;
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
    return { ...commentary, message: capSentences(commentary.message, 3) };
  }

  const resultCount = getResultCountFromMessage(message);
  const hasUrgent =
    explanation?.interpretation?.statements?.some(
      (stmt) => stmt.level === "critical" || stmt.level === "warning"
    ) || false;
  const needsClarification =
    explanation?.interpretation?.statements?.some((stmt) =>
      /multiple matches|more information|required|specify/i.test(stmt.statement)
    ) || false;
  const clarificationText = `${explanation?.facts?.summary || ""} ${(explanation?.facts?.details || []).join(" ")}`.toLowerCase();

  if (CLARIFICATION_PATTERN.test(clarificationText)) {
    return null;
  }

  if (resultCount === 0) {
    return { ...commentary, message: buildEmptyGuidance(explanation?.entityType) };
  }

  if (typeof resultCount === "number" && resultCount > 1) {
    return { ...commentary, message: buildMultipleGuidance(explanation?.entityType) };
  }

  if (!hasUrgent && !needsClarification) {
    return null;
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

  return { ...commentary, message: capSentences(commentary.message, 3) };
}

export function filterFollowUps(
  followUps: FollowUpSuggestion[] | undefined,
  resultCount: number | null
): FollowUpSuggestion[] {
  if (!followUps || followUps.length === 0) return [];
  if (resultCount === null) return followUps;

  return followUps.filter((followUp) => {
    const label = followUp.label.toLowerCase();
    if (resultCount === 0) {
      if (label.includes("recent activity")) return false;
      if (label.includes("summarize")) return false;
    }
    if (resultCount > 1) {
      if (label.includes("summarize")) return false;
      if (label.includes("explain status")) return false;
    }
    return true;
  });
}
