"use strict";

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

function normalizeText(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findForbiddenMatches(text) {
  const source = String(text || "");
  if (!source) return [];
  const matches = [];
  for (const rule of FORBIDDEN_PATTERNS) {
    if (rule.regex.test(source)) matches.push(rule.key);
  }
  return matches;
}

function sanitizeSummaryText(text) {
  let cleaned = String(text || "").trim();
  if (!cleaned) return "";
  cleaned = cleaned.replace(/\/mutate\b/gi, "");
  cleaned = cleaned.replace(/\b(?:payload|api|endpoint|syntax)\b/gi, "");
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function sanitizeStructuredValue(value) {
  if (value === null || value === undefined) return value ?? null;
  if (typeof value === "string") return sanitizeSummaryText(value);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeStructuredValue(item)).filter((item) => item !== "");
  }
  if (typeof value === "object") {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      const sanitized = sanitizeStructuredValue(item);
      if (sanitized === undefined) continue;
      out[key] = sanitized;
    }
    return out;
  }
  return sanitizeSummaryText(String(value));
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
  if (!output || typeof output !== "object") return output;
  if (String(output.type || "").toLowerCase() !== "proposal") return output;

  const proposals = Array.isArray(output.proposals) ? output.proposals : [];
  return {
    ...output,
    proposals: proposals.map((proposal) => {
      const safe = {
        proposalId: proposal?.proposalId || null,
        status: proposal?.status || null,
        requiresConfirmation: proposal?.requiresConfirmation === true,
        humanReadableSummary: sanitizeSummaryText(proposal?.humanReadableSummary || ""),
        affectedEntities: Array.isArray(proposal?.affectedEntities)
          ? proposal.affectedEntities
          : [],
        reversible: proposal?.reversible === true,
        version: proposal?.version || null,
        posture: proposal?.posture || null,
        sessionId: proposal?.sessionId || output?.sessionId || null,
      };
      if (proposal?.confirmation && typeof proposal.confirmation === "object") {
        safe.confirmation = {
          mode: proposal.confirmation.mode || null,
          extraRiskAck: proposal.confirmation.extraRiskAck === true,
          warnings: Array.isArray(proposal.confirmation.warnings)
            ? proposal.confirmation.warnings.map((w) => sanitizeSummaryText(w)).filter(Boolean)
            : undefined,
          impactSummary: Array.isArray(proposal.confirmation.impactSummary)
            ? proposal.confirmation.impactSummary.map((w) => sanitizeSummaryText(w)).filter(Boolean)
            : undefined,
        };
        if (proposal.confirmation.preview && typeof proposal.confirmation.preview === "object") {
          safe.confirmation.preview = sanitizeStructuredValue(proposal.confirmation.preview);
        }
      }
      if (proposal?.actionType && findForbiddenMatches(proposal.actionType).length === 0) {
        safe.actionType = proposal.actionType;
      }
      return safe;
    }),
  };
}

function enforceUserSafeResponsePolicy({
  text,
  output,
  mutationOutcome = null,
  logger = null,
  route = "/agent/chat",
} = {}) {
  const sanitizedOutput = redactProposalArtifact(output);
  const textMatches = findForbiddenMatches(text);
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

  let safeText = String(text || "");
  if (matchedPatterns.length > 0) {
    safeText = buildFallbackMessage(mutationOutcome);
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
    sanitizeStructuredValue,
  },
};
