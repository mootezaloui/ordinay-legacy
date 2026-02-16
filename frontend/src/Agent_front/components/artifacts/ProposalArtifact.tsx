import { useState } from "react";
import { Zap, CheckCircle2, XCircle, Clock, AlertCircle, Trash2, Link2, Unlink } from "lucide-react";
import type { ProposalOutput, ExecutionResult } from "../../../services/api/agent";

interface ProposalArtifactProps {
  data: ProposalOutput;
  onConfirm: (proposalId: string) => Promise<ExecutionResult>;
  onCancel: (proposalId: string) => void;
}

type ProposalStatus = "pending" | "confirming" | "confirmed" | "cancelled" | "failed";

interface ProposalState {
  status: ProposalStatus;
  error?: string;
  executionResult?: ExecutionResult;
}

/**
 * Render field-level diff for UPDATE_ENTITY operations
 */
function renderFieldDiff(field: string, from: any, to: any): JSX.Element {
  return (
    <div key={field} className="field-diff">
      <span className="field-name">{field}:</span>
      <span className="diff-from">{JSON.stringify(from)}</span>
      <span className="diff-arrow">→</span>
      <span className="diff-to">{JSON.stringify(to)}</span>
    </div>
  );
}

/**
 * Render operation details based on universal action type
 */
function renderOperationDetails(proposal: any): JSX.Element {
  const { actionType, params } = proposal;
  const entityLabel = (entity: any, fallbackType = "entity") => {
    if (!entity || typeof entity !== "object") return fallbackType;
    return (
      entity.reference ||
      entity.title ||
      entity.name ||
      entity.label ||
      entity.type ||
      fallbackType
    );
  };

  // CREATE_ENTITY: Show all payload fields
  if (actionType === "CREATE_ENTITY" && params) {
    return (
      <div className="operation-details">
        <div className="operation-type">
          Create {params.entityType}
        </div>
        <div className="operation-fields">
          {params.payload &&
            Object.entries(params.payload).map(([key, value]) => (
              <div key={key} className="field-create">
                <span className="field-name">{key}:</span>
                <span className="field-value">{JSON.stringify(value)}</span>
              </div>
            ))}
        </div>
      </div>
    );
  }

  // UPDATE_ENTITY: Show field-by-field diffs
  if (actionType === "UPDATE_ENTITY" && params) {
    return (
      <div className="operation-details">
        <div className="operation-type">
          Update {params.entityLabel || params.reference || params.title || params.entityType}
        </div>
        <div className="operation-diffs">
          {params.changes &&
            Object.entries(params.changes).map(([field, diff]: [string, any]) =>
              renderFieldDiff(field, diff.from, diff.to)
            )}
        </div>
      </div>
    );
  }

  // DELETE_ENTITY: Show delete impact
  if (actionType === "DELETE_ENTITY" && params) {
    return (
      <div className="operation-details">
        <div className="operation-type operation-type-delete">
          <Trash2 className="w-4 h-4 inline-block mr-1" />
          Delete {params.entityLabel || params.reference || params.title || params.entityType}
        </div>
        <div className="delete-impact text-xs text-red-600 dark:text-red-400 mt-1">
          Soft-delete — record will be marked as deleted but can be restored
        </div>
      </div>
    );
  }

  // ATTACH_TO_ENTITY: Show attachment details
  if (actionType === "ATTACH_TO_ENTITY" && params) {
    return (
      <div className="operation-details">
        <div className="operation-type">
          Attach {params.attachmentType} to {entityLabel(params.target, params.target?.type || "entity")}
        </div>
        {params.attachmentType === "note" && params.payload?.content && (
          <div className="attachment-preview">{params.payload.content}</div>
        )}
        {params.attachmentType === "doc_draft" && params.payload?.title && (
          <div className="attachment-preview">
            <strong>{params.payload.title}</strong>
            {params.payload.content && <div className="mt-2">{params.payload.content.substring(0, 200)}...</div>}
          </div>
        )}
      </div>
    );
  }

  // LINK_ENTITIES: Show relationship change
  if (actionType === "LINK_ENTITIES" && params) {
    const isRemove = params.mode === "remove";
    const LinkIcon = isRemove ? Unlink : Link2;
    return (
      <div className="operation-details">
        <div className="operation-type">
          <LinkIcon className="w-4 h-4 inline-block mr-1" />
          {isRemove ? "Unlink" : "Link"} {params.sourceLabel || params.sourceReference || params.sourceTitle || params.sourceType}
          {isRemove ? " from " : " to "}
          {params.targetLabel || params.targetReference || params.targetTitle || params.targetType}
        </div>
        {params.linkField && (
          <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            via {params.linkField}
          </div>
        )}
      </div>
    );
  }

  // Fallback: Show humanReadableSummary for legacy actions
  return (
    <div className="proposal-summary">
      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
        {proposal.humanReadableSummary || proposal.description || `${proposal.actionType || proposal.action}`}
      </p>
    </div>
  );
}

/**
 * Renders action proposals with explicit confirm/cancel workflow.
 *
 * V3 Execution Layer:
 * - Shows proposals requiring explicit user confirmation
 * - Displays snapshot info (scope, timestamp)
 * - Calls POST /agent/confirm on confirm button click
 * - Blocks duplicate confirmations
 * - Shows field-level diffs for UPDATE_ENTITY operations
 */
export function ProposalArtifact({ data, onConfirm, onCancel }: ProposalArtifactProps) {
  // Track state for each proposal
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>(() => {
    const initial: Record<string, ProposalState> = {};
    data.proposals.forEach((proposal) => {
      initial[proposal.proposalId] = { status: "pending" };
    });
    return initial;
  });

  // Handle confirm
  const handleConfirm = async (proposalId: string) => {
    setProposalStates((prev) => ({
      ...prev,
      [proposalId]: { status: "confirming" },
    }));

    try {
      const execResult = await onConfirm(proposalId);
      if (execResult.status === "success") {
        setProposalStates((prev) => ({
          ...prev,
          [proposalId]: { status: "confirmed", executionResult: execResult },
        }));
      } else {
        const safeMsg = execResult.error?.safeMessage || execResult.error?.message || "Execution failed";
        setProposalStates((prev) => ({
          ...prev,
          [proposalId]: { status: "failed", error: safeMsg, executionResult: execResult },
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setProposalStates((prev) => ({
        ...prev,
        [proposalId]: { status: "failed", error: errorMessage },
      }));
    }
  };

  // Handle cancel
  const handleCancel = (proposalId: string) => {
    setProposalStates((prev) => ({
      ...prev,
      [proposalId]: { status: "cancelled" },
    }));
    onCancel(proposalId);
  };

  return (
    <div className="artifact-build agent-artifact-card is-proposal">
      {/* Header */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-proposal flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-violet shrink-0 flex items-center justify-center w-10 h-10 rounded-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Action Proposal
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {data.proposals.length} {data.proposals.length === 1 ? "action" : "actions"} requiring confirmation
            </p>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="artifact-build-body px-5 py-4 space-y-4">
        {data.proposals.map((proposal) => {
          const state = proposalStates[proposal.proposalId];
          const isPending = state.status === "pending";
          const isConfirming = state.status === "confirming";
          const isConfirmed = state.status === "confirmed";
          const isCancelled = state.status === "cancelled";
          const isFailed = state.status === "failed";

          return (
            <div
              key={proposal.proposalId}
              className={`proposal-item border rounded-lg p-4 transition-all ${
                isConfirmed
                  ? "border-green-300 bg-green-50 dark:border-green-800 dark:bg-green-950/20"
                  : isCancelled
                  ? "border-gray-300 bg-gray-50 dark:border-gray-700 dark:bg-gray-900/20 opacity-60"
                  : isFailed
                  ? "border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                  : "border-violet-200 bg-violet-50/30 dark:border-violet-800 dark:bg-violet-950/20"
              }`}
            >
              {/* Proposal details (with field-level diffs for universal operations) */}
              <div className="mb-3">
                {renderOperationDetails(proposal)}
              </div>

              {/* Snapshot info (subtle) */}
              {proposal.snapshot && (
                <div className="proposal-snapshot flex items-center gap-2 text-xs text-gray-500 dark:text-gray-500 mb-3">
                  <Clock className="w-3 h-3" />
                  <span>
                    {proposal.snapshot.scope}
                    {" • "}
                    {new Date(proposal.snapshot.timestamp).toLocaleString()}
                  </span>
                </div>
              )}

              {/* Affected entities */}
              {proposal.affectedEntities && proposal.affectedEntities.length > 0 && (
                <div className="affected-entities flex flex-wrap gap-2 mb-3">
                  {proposal.affectedEntities.map((entity, idx) => (
                    <span
                      key={idx}
                      className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-md bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                    >
                      {entity.reference || entity.title || entity.name || entity.type}
                    </span>
                  ))}
                </div>
              )}

              {/* Status indicators */}
              {isConfirmed && (
                <div className="execution-result-success mb-3">
                  <div className="flex items-center gap-2 text-sm text-green-700 dark:text-green-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmed and executed</span>
                  </div>
                  {state.executionResult?.executedActions?.map((ea, i) => (
                    <div key={i} className="text-xs text-green-600 dark:text-green-500 mt-1 ml-6">
                      {ea.actionType} completed at {new Date(ea.executedAt).toLocaleTimeString()}
                    </div>
                  ))}
                  {state.executionResult?.audit?.executedAt && (
                    <div className="text-xs text-gray-500 dark:text-gray-500 mt-1 ml-6">
                      Audit: {state.executionResult.audit.sessionId || proposal.proposalId}
                      {" • "}
                      {new Date(state.executionResult.audit.executedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {isCancelled && (
                <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-3">
                  <XCircle className="w-4 h-4" />
                  <span>Cancelled</span>
                </div>
              )}

              {isFailed && (
                <div className="execution-result-failure mb-3">
                  <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>{state.error || "Execution failed"}</span>
                  </div>
                  {state.executionResult?.error?.code && (
                    <div className="text-xs text-red-500 dark:text-red-400 mt-1 ml-6">
                      Error code: {state.executionResult.error.code}
                      {state.executionResult.error.requiresReproposal && " — please retry"}
                    </div>
                  )}
                </div>
              )}

              {/* Confirm/Cancel buttons */}
              {(isPending || isConfirming) && (
                <div className="proposal-actions flex gap-2">
                  <button
                    onClick={() => handleConfirm(proposal.proposalId)}
                    disabled={isConfirming}
                    className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                      isConfirming
                        ? "bg-violet-300 text-violet-800 cursor-wait"
                        : "bg-violet-600 hover:bg-violet-700 text-white"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isConfirming ? "Confirming..." : "Confirm"}
                  </button>

                  <button
                    onClick={() => handleCancel(proposal.proposalId)}
                    disabled={isConfirming}
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-md border border-gray-300 hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
