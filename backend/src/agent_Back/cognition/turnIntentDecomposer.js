"use strict";

function normalizeText(value) {
  return String(value || "").trim().toLowerCase();
}

function hasAny(text, patterns = []) {
  return patterns.some((pattern) => pattern.test(text));
}

function decomposeTurnIntent({ userMessage = "", lastAssistantArtifact = null } = {}) {
  const text = normalizeText(userMessage);
  const lastArtifactType = String(lastAssistantArtifact?.type || "").trim().toLowerCase();
  const solutionSeeking = /\bfind\s+(?:a\s+)?solution\b/.test(text);

  const hasRetrievalIntent = hasAny(text, [
    /\b(show|list|search|look up|open|read|get|check|status|do we have|already have|is there)\b/,
    /\bfind\s+(?:the\s+|a\s+|an\s+)?(?:client|dossier|lawsuit|case|task|session|hearing|document|record)\b/,
    /\bwhat(?:'s| is)\b/,
    /\bwhich\b/,
    /\?$/,
  ]) && !solutionSeeking;

  const hasProgressionIntent = hasAny(text, [
    /\b(we(?:'re| are)?\s+(?:filing|going to court|going to file|preparing to file))\b/,
    /\b(file|filing|create|start|initiate|schedule|reschedule|prepare|draft|submit|open)\b/,
    /\b(served|postponed|adjourned|refusing|refused|escalated|appeal|appealed)\b/,
    /\b(going to court|custody|visitation|hearing|trial|lawsuit|case update)\b/,
  ]);

  const hasAdvisoryIntent = hasAny(text, [
    /\b(what should we do|next step|next steps|what now|how should we|prepare for)\b/,
    /\b(plan|strategy|recommend|suggest|advise|guidance)\b/,
  ]);

  const hasMixedIntent = hasRetrievalIntent && hasProgressionIntent;
  const continuingProposal =
    lastArtifactType === "proposal" || lastArtifactType === "document_generation_preview";

  return {
    hasRetrievalIntent,
    hasProgressionIntent: hasProgressionIntent || continuingProposal,
    hasAdvisoryIntent,
    hasMixedIntent,
    rawSignals: {
      continuingProposal,
      lastArtifactType,
    },
  };
}

module.exports = { decomposeTurnIntent };
