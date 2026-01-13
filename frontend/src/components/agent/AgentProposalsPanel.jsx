/**
 * Agent Proposals Panel
 *
 * Phase C.2 - Review-only action proposals with disabled controls
 *
 * Displays action proposals as cards with explicit status:
 * - Proposal ID
 * - Action type
 * - Human-readable summary
 * - Status badge (PROPOSED/PERMITTED/BLOCKED/etc.)
 * - Affected entities
 * - Confirmation button (visually disabled, no execution possible)
 *
 * Following render contract rules from Phase C.0
 * Reinforces: AI suggests, humans decide
 */

export default function AgentProposalsPanel({
  actionProposals,
  status,
  blockingReason,
}) {
  if (!actionProposals || actionProposals.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-3">
          <span className="text-2xl font-semibold">PR</span>
        </div>
        <p className="text-gray-700 font-medium dark:text-slate-200">No action proposals</p>
        <p className="text-sm text-gray-500 mt-2 dark:text-slate-400">
          Agent has not suggested any actions for this request
        </p>
        {blockingReason && (
          <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg mx-auto max-w-md dark:bg-red-900/30 dark:border-red-800">
            <div className="font-semibold text-red-800 mb-1 dark:text-red-100">BLOCKED</div>
            <div className="text-sm text-red-700 dark:text-red-200">{blockingReason}</div>
          </div>
        )}
      </div>
    );
  }

  if (status === "BLOCKED") {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800">
        <div className="font-semibold text-red-800 mb-2 dark:text-red-100">
          Action Proposals Blocked
        </div>
        <div className="text-sm text-red-700 dark:text-red-200">
          {blockingReason || "Action proposals are not available"}
        </div>
      </div>
    );
  }

  if (status === "FAILED") {
    return (
      <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800">
        <p className="text-red-800 font-medium dark:text-red-100">
          Cannot display proposals: Status is FAILED
        </p>
      </div>
    );
  }

  const getStatusConfig = (proposalStatus) => {
    switch (proposalStatus) {
      case "PROPOSED":
        return {
          badge: "bg-blue-600 text-white",
          label: "Proposed",
          description: "Agent suggestion pending review",
        };
      case "PERMITTED":
        return {
          badge: "bg-green-600 text-white",
          label: "Permitted",
          description: "Action allowed by policy, awaiting confirmation",
        };
      case "BLOCKED":
        return {
          badge: "bg-red-600 text-white",
          label: "Blocked",
          description: "Action not permitted by current policy",
        };
      case "CONFIRMED":
        return {
          badge: "bg-purple-600 text-white",
          label: "Confirmed",
          description: "Action confirmed by user",
        };
      case "REJECTED":
        return {
          badge: "bg-gray-600 text-white",
          label: "Rejected",
          description: "Action rejected by user",
        };
      case "EXECUTED":
        return {
          badge: "bg-green-700 text-white",
          label: "Executed",
          description: "Action completed successfully",
        };
      case "FAILED":
        return {
          badge: "bg-red-700 text-white",
          label: "Failed",
          description: "Action execution failed",
        };
      default:
        return {
          badge: "bg-gray-600 text-white",
          label: proposalStatus,
          description: "Unknown status",
        };
    }
  };

  const renderProposal = (proposal, index) => {
    const statusConfig = getStatusConfig(proposal.status);

    return (
      <div
        key={index}
        className="bg-white border-2 border-gray-200 rounded-lg p-5 mb-5 shadow-sm dark:bg-slate-800 dark:border-slate-700"
      >
        <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-slate-700">
          <div className="flex items-center gap-3">
            <span
              className={`px-3 py-1 rounded text-sm font-semibold ${statusConfig.badge}`}
            >
              {statusConfig.label}
            </span>
            <span className="text-xs text-gray-500 font-mono dark:text-slate-400">
              {proposal.proposalId}
            </span>
          </div>
        </div>

        <div className="mb-3 text-xs text-gray-600 dark:text-slate-300">
          {statusConfig.description}
        </div>

        <div className="mb-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 dark:text-slate-400">
            Action Type
          </div>
          <div className="font-mono text-sm font-medium text-gray-800 dark:text-slate-100">
            {proposal.actionType || "Unknown"}
          </div>
        </div>

        <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded dark:bg-blue-900/30 dark:border-blue-700">
          <div className="text-sm text-gray-800 leading-relaxed dark:text-slate-100">
            {proposal.humanReadableSummary || "No summary available"}
          </div>
        </div>

        {proposal.affectedEntities && proposal.affectedEntities.length > 0 && (
          <div className="mb-4">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
              Affected Entities
            </div>
            <div className="flex flex-wrap gap-2">
              {proposal.affectedEntities.map((entity, i) => (
                <span
                  key={i}
                  className="px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100"
                >
                  {entity.type} #{entity.id}
                  {entity.name && ` - ${entity.name}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {proposal.reversible !== undefined && (
          <div className="mb-3 text-xs">
            <span className="font-semibold text-gray-600 dark:text-slate-300">Reversible:</span>{" "}
            <span
              className={`font-medium ${
                proposal.reversible ? "text-green-700 dark:text-green-300" : "text-amber-700 dark:text-amber-200"
              }`}
            >
              {proposal.reversible ? "Yes" : "No"}
            </span>
          </div>
        )}

        {proposal.status === "BLOCKED" && proposal.blockingReason && (
          <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-400 rounded dark:bg-red-900/30 dark:border-red-700">
            <div className="text-xs font-semibold text-red-800 uppercase tracking-wide mb-1 dark:text-red-200">
              Blocking Reason
            </div>
            <div className="text-sm text-red-700 dark:text-red-200">
              {proposal.blockingReason}
            </div>
          </div>
        )}

        {proposal.suggestedAlternative && (
          <div className="mb-4 p-3 bg-blue-50 border-l-4 border-blue-400 rounded dark:bg-blue-900/30 dark:border-blue-700">
            <div className="text-xs font-semibold text-blue-800 uppercase tracking-wide mb-1 dark:text-blue-200">
              Suggested Alternative
            </div>
            <div className="text-sm text-blue-700 dark:text-blue-100">
              {proposal.suggestedAlternative}
            </div>
          </div>
        )}

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
          <button
            className="px-4 py-2 bg-gray-300 text-gray-500 text-sm font-medium rounded-md cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
            disabled
            title="Confirmation flow not yet implemented. Proposals are review-only in this phase."
          >
            Confirm Action (Not Available)
          </button>
          <div className="text-xs text-gray-500 mt-2 dark:text-slate-400">
            Confirmation flow not implemented. This proposal is for review only.
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
          <div className="grid grid-cols-2 gap-3 text-xs text-gray-500 dark:text-slate-400">
            {proposal.requiresConfirmation !== undefined && (
              <div>
                <span className="font-semibold">Requires Confirmation:</span>{" "}
                {proposal.requiresConfirmation ? "Yes" : "No"}
              </div>
            )}
            {proposal.reversible !== undefined && (
              <div>
                <span className="font-semibold">Can be reversed:</span>{" "}
                {proposal.reversible ? "Yes" : "No"}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
          Action Proposals
          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded dark:bg-blue-900/40 dark:text-blue-100">
            {actionProposals.length}
          </span>
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400">Review only - no execution</p>
      </div>

      {actionProposals.map((proposal, index) => renderProposal(proposal, index))}
    </div>
  );
}
