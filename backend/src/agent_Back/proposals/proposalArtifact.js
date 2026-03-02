"use strict";

const {
  sanitizeForDisplay,
  buildProposalDisplaySummary,
} = require("../presentation/presentationSanitizer");

const PROPOSAL_DEBUG_ENABLED =
  ["1", "true", "yes", "on"].includes(String(process.env.AGENT_CHAT_MUTATION_DEBUG || "").toLowerCase()) ||
  ["1", "true", "yes", "on"].includes(String(process.env.AGENT_MUTATION_DEBUG || "").toLowerCase()) ||
  process.env.NODE_ENV !== "production";

function toProposalArtifact(proposal, sessionId) {
  const displayProposal = sanitizeForDisplay({
    ...proposal,
    humanReadableSummary: buildProposalDisplaySummary(proposal),
  });

  const artifact = {
    type: "proposal",
    sessionId: sessionId || null,
    proposals: [
      {
        proposalId: proposal.proposalId,
        status: proposal.status,
        actionType: proposal.actionType,
        requiresConfirmation: proposal.requiresConfirmation,
        humanReadableSummary: displayProposal?.humanReadableSummary || "",
        affectedEntities: Array.isArray(displayProposal?.affectedEntities)
          ? displayProposal.affectedEntities
          : [],
        reversible: proposal.reversible,
        version: proposal.version,
        posture: proposal.posture,
        confirmation:
          displayProposal?.confirmation && typeof displayProposal.confirmation === "object"
            ? displayProposal.confirmation
            : null,
        snapshot:
          displayProposal?.snapshot && typeof displayProposal.snapshot === "object"
            ? displayProposal.snapshot
            : null,
        sessionId: proposal.sessionId || sessionId || null,
        params:
          displayProposal?.params && typeof displayProposal.params === "object"
            ? displayProposal.params
            : {},
      },
    ],
  };

  if (PROPOSAL_DEBUG_ENABLED) {
    try {
      const first = artifact.proposals?.[0] || {};
      const confirmation = first.confirmation || null;
      console.warn("[agent-proposal-debug]", {
        source: "toProposalArtifact",
        actionType: first.actionType || null,
        proposalId: first.proposalId || null,
        hasConfirmation: Boolean(confirmation),
        confirmationKeys: confirmation ? Object.keys(confirmation) : [],
        extraRiskAck: confirmation?.extraRiskAck === true,
      });
    } catch (_) {}
  }

  try {
    const first = artifact.proposals?.[0] || {};
    if (first?.requiresConfirmation) {
      console.warn("[CONFIRM_DEBUG][backend][proposalArtifact]", {
        proposalId: first.proposalId || null,
        actionType: first.actionType || null,
        humanReadableSummary: first.humanReadableSummary || null,
        reversible: first.reversible,
        confirmation: first.confirmation || null,
        affectedEntities: first.affectedEntities || [],
        workflow: first.params?.workflow || null,
        params: first.params || null,
      });
    }
  } catch (_) {}

  return artifact;
}

module.exports = {
  toProposalArtifact,
};
