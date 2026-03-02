"use strict";

const {
  sanitizeForDisplay,
  sanitizeDisplayText,
  buildProposalDisplaySummary,
} = require("../presentation/presentationSanitizer");

const FORBIDDEN_PATTERNS = [
  { key: "slash_mutate", regex: /\/mutate\b/i },
  { key: "api", regex: /\bapi\b/i },
  { key: "endpoint", regex: /\bendpoint\b/i },
  {
    key: "tool_name",
    regex: /\b(propose_entity_mutation|propose_mutation_workflow|universalmutation|executetoolv2|confirmproposal)\b/i,
  },
  { key: "payload", regex: /\bpayload\b/i },
  { key: "json_dump", regex: /[{[]\s*"[^"]+"\s*:/ },
  { key: "stack_trace", regex: /\b(?:error:\s|node:|at\s+\S+\s*\()/i },
  { key: "sql", regex: /\b(?:select\s+.+\s+from|insert\s+into|update\s+\w+\s+set|delete\s+from)\b/i },
  { key: "use_command", regex: /\buse\s+command\b/i },
  { key: "syntax", regex: /\bsyntax\b/i },
  { key: "domain_rules", regex: /\bdomain\s+rules?\b/i },
];

function findForbiddenMatches(text) {
  const source = String(text || "");
  if (!source) return [];
  const matches = [];
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.regex.test(source)) matches.push(rule.key);
  }
  return matches;
}

function buildFallbackMessage(mutationOutcome = null) {
  const status = String(mutationOutcome?.status || "").toUpperCase();
  if (status === "EXECUTED") {
    return String(mutationOutcome?.safeMessage || "Done. I applied the requested update.");
  }
  if (status === "PROPOSED") {
    return String(mutationOutcome?.safeMessage || "I can make that change. Confirm?");
  }
  if (status === "BLOCKED") {
    return String(mutationOutcome?.safeMessage || "I can’t apply that change right now.");
  }
  if (status === "FAILED") {
    return String(
      mutationOutcome?.safeMessage ||
        "I couldn’t complete that change due to a system error. Try again, or I can prepare it for confirmation.",
    );
  }
  return "I couldn’t complete that request right now.";
}

function redactProposalArtifact(output) {
  if (!output || typeof output !== "object") return sanitizeForDisplay(output);
  if (String(output.type || "").toLowerCase() !== "proposal") return sanitizeForDisplay(output);

  const proposals = Array.isArray(output.proposals) ? output.proposals : [];
  const safeOutput = {
    ...output,
    proposals: proposals.map((proposal) => ({
      ...proposal,
      humanReadableSummary: buildProposalDisplaySummary(proposal),
    })),
  };
  return sanitizeForDisplay(safeOutput);
}

function enforceUserSafeResponsePolicy({
  text,
  output,
  mutationOutcome = null,
  logger = null,
  route = "/agent/chat",
} = {}) {
  const sanitizedOutput = redactProposalArtifact(output);
  const normalizedText = sanitizeDisplayText(String(text || ""));
  const textMatches = findForbiddenMatches(normalizedText);
  const proposalSummaries =
    sanitizedOutput &&
    typeof sanitizedOutput === "object" &&
    String(sanitizedOutput.type || "").toLowerCase() === "proposal" &&
    Array.isArray(sanitizedOutput.proposals)
      ? sanitizedOutput.proposals
          .map((p) => `${p?.humanReadableSummary || ""} ${p?.actionType || ""}`)
          .join(" | ")
      : "";
  const summaryMatches = findForbiddenMatches(proposalSummaries);
  const matchedPatterns = Array.from(new Set([...textMatches, ...summaryMatches]));

  let safeText = normalizedText;
  if (matchedPatterns.length > 0 || !safeText) {
    safeText = sanitizeDisplayText(buildFallbackMessage(mutationOutcome));
    if (typeof logger === "function") {
      try {
        logger({
          type: "chat_user_safe_response_sanitized",
          route,
          matchedPatterns,
          mutationOutcome: mutationOutcome?.status || null,
          replacementApplied: true,
          timestamp: new Date().toISOString(),
        });
      } catch (_) {}
    }
  }

  return {
    text: safeText,
    output: sanitizedOutput,
    sanitized: matchedPatterns.length > 0,
    matchedPatterns,
  };
}

module.exports = {
  enforceUserSafeResponsePolicy,
  _internal: {
    findForbiddenMatches,
    redactProposalArtifact,
    buildFallbackMessage,
  },
};
