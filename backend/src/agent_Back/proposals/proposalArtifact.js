"use strict";

const PROPOSAL_DEBUG_ENABLED = ["1", "true", "yes", "on"].includes(
  String(process.env.AGENT_CHAT_MUTATION_DEBUG || "").toLowerCase(),
);

function toProposalArtifact(proposal, sessionId) {
  const artifact = {
    type: "proposal",
    sessionId: sessionId || null,
    proposals: [
      {
        proposalId: proposal.proposalId,
        status: proposal.status,
        actionType: proposal.actionType,
        requiresConfirmation: proposal.requiresConfirmation,
        humanReadableSummary: proposal.humanReadableSummary,
        affectedEntities: proposal.affectedEntities,
        reversible: proposal.reversible,
        version: proposal.version,
        posture: proposal.posture,
        confirmation: proposal.confirmation || null,
        snapshot: proposal.snapshot,
        sessionId: proposal.sessionId || sessionId || null,
        params: proposal.params,
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

  return artifact;
}

module.exports = {
  toProposalArtifact,
};
