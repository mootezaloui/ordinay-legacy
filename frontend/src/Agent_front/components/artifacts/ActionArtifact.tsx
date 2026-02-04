import { useState } from "react";
import {
  AlertTriangle,
  ShieldCheck,
  Zap,
  CheckCircle2,
  XCircle,
  Check,
  X,
  ChevronRight,
  Clock,
} from "lucide-react";
import type { ActionProposal } from "../../../services/api/agent";

interface ActionArtifactProps {
  data: ActionProposal[];
  onApprove?: (proposalId: string) => void;
  onReject?: (proposalId: string) => void;
  onApproveAll?: () => void;
  onCancelAll?: () => void;
}

type ActionStatus = "pending" | "approved" | "rejected" | "executing" | "completed";

interface ActionState {
  status: ActionStatus;
  timestamp?: Date;
}

/**
 * Renders proposed actions as a decision panel with approve/reject workflow.
 *
 * Behavioral patterns:
 * - Per-action approve/reject buttons
 * - Confirmation gate before execution
 * - Sequential task execution with checkpoints
 * - Visual feedback for each action state
 */
export function ActionArtifact({
  data,
  onApprove,
  onReject,
  onApproveAll,
  onCancelAll,
}: ActionArtifactProps) {
  // Track state for each action
  const [actionStates, setActionStates] = useState<Record<string, ActionState>>(() => {
    const initial: Record<string, ActionState> = {};
    data.forEach((action, idx) => {
      const id = action.proposalId || `action-${idx}`;
      initial[id] = { status: "pending" };
    });
    return initial;
  });

  // Count actions by status
  const statusCounts = Object.values(actionStates).reduce(
    (acc, state) => {
      acc[state.status] = (acc[state.status] || 0) + 1;
      return acc;
    },
    {} as Record<ActionStatus, number>
  );

  const pendingCount = statusCounts.pending || 0;
  const approvedCount = statusCounts.approved || 0;
  const rejectedCount = statusCounts.rejected || 0;
  const hasDecisions = approvedCount > 0 || rejectedCount > 0;
  const allDecided = pendingCount === 0;
  const requiresConfirmation = data.some((a) => a.requiresConfirmation);

  // Handle individual action approval
  const handleApprove = (proposalId: string) => {
    setActionStates((prev) => ({
      ...prev,
      [proposalId]: { status: "approved", timestamp: new Date() },
    }));
    onApprove?.(proposalId);
  };

  // Handle individual action rejection
  const handleReject = (proposalId: string) => {
    setActionStates((prev) => ({
      ...prev,
      [proposalId]: { status: "rejected", timestamp: new Date() },
    }));
    onReject?.(proposalId);
  };

  // Handle approve all
  const handleApproveAll = () => {
    const newStates: Record<string, ActionState> = {};
    data.forEach((action, idx) => {
      const id = action.proposalId || `action-${idx}`;
      if (actionStates[id].status === "pending") {
        newStates[id] = { status: "approved", timestamp: new Date() };
      } else {
        newStates[id] = actionStates[id];
      }
    });
    setActionStates(newStates);
    onApproveAll?.();
  };

  // Handle cancel/reset all
  const handleCancelAll = () => {
    const newStates: Record<string, ActionState> = {};
    data.forEach((action, idx) => {
      const id = action.proposalId || `action-${idx}`;
      newStates[id] = { status: "pending" };
    });
    setActionStates(newStates);
    onCancelAll?.();
  };

  return (
    <div className="artifact-build agent-artifact-card is-action">
      {/* Header */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-action flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-cyan">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Proposed Actions
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {data.length} action{data.length !== 1 ? "s" : ""} to review
            </p>
          </div>
        </div>

        {/* Status summary */}
        <div className="flex items-center gap-2">
          {approvedCount > 0 && (
            <span className="agent-status-badge agent-status-badge-completed">
              <Check className="w-3 h-3" />
              {approvedCount} approved
            </span>
          )}
          {rejectedCount > 0 && (
            <span className="agent-status-badge agent-status-badge-urgent">
              <X className="w-3 h-3" />
              {rejectedCount} rejected
            </span>
          )}
          {pendingCount > 0 && (
            <span className="agent-status-badge agent-status-badge-pending">
              <Clock className="w-3 h-3" />
              {pendingCount} pending
            </span>
          )}
        </div>
      </div>

      {/* Action workflow items */}
      <div className="agent-action-workflow mx-5 my-4">
        {data.map((action: ActionProposal, idx: number) => {
          const id = action.proposalId || `action-${idx}`;
          const state = actionStates[id];
          const isApproved = state.status === "approved";
          const isRejected = state.status === "rejected";
          const isPending = state.status === "pending";

          return (
            <div
              key={id}
              className={`agent-action-item ${
                isApproved ? "is-approved" : isRejected ? "is-rejected" : ""
              }`}
            >
              <div className="flex items-start gap-3">
                {/* Step number / status icon */}
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                    isApproved
                      ? "bg-emerald-100 dark:bg-emerald-900/30"
                      : isRejected
                        ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-slate-100 dark:bg-slate-800"
                  }`}
                >
                  {isApproved ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                  ) : isRejected ? (
                    <XCircle className="w-4 h-4 text-red-500 dark:text-red-400" />
                  ) : (
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                      {idx + 1}
                    </span>
                  )}
                </div>

                {/* Action content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1">
                      <p
                        className={`text-[15px] font-medium leading-snug ${
                          isRejected
                            ? "text-slate-400 dark:text-slate-500 line-through"
                            : "text-slate-800 dark:text-slate-100"
                        }`}
                      >
                        {action.action}
                      </p>
                      {action.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                          {action.description}
                        </p>
                      )}

                      {/* Metadata row */}
                      <div className="flex items-center flex-wrap gap-2 mt-2">
                        {action.requiresConfirmation && isPending && (
                          <span className="agent-status-badge agent-status-badge-in-progress">
                            <AlertTriangle className="w-3 h-3" />
                            Requires confirmation
                          </span>
                        )}
                        {isApproved && (
                          <span className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3" />
                            Approved
                          </span>
                        )}
                        {isRejected && (
                          <span className="text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                            <XCircle className="w-3 h-3" />
                            Rejected
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Action buttons */}
                    {isPending && (
                      <div className="agent-action-buttons flex-shrink-0">
                        <button
                          type="button"
                          onClick={() => handleApprove(id)}
                          className="agent-action-btn-approve"
                          title="Approve this action"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleReject(id)}
                          className="agent-action-btn-reject"
                          title="Reject this action"
                        >
                          <X className="w-3.5 h-3.5" />
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Connector to next item */}
              {idx < data.length - 1 && (
                <div className="ml-4 mt-2 flex items-center gap-1 text-slate-300 dark:text-slate-600">
                  <div className="w-px h-4 bg-current" />
                  <ChevronRight className="w-3 h-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Confirmation gate */}
      {(requiresConfirmation || hasDecisions) && (
        <div className="agent-confirmation-gate">
          <div className="agent-confirmation-message">
            <AlertTriangle className="w-4 h-4" />
            {allDecided ? (
              <span>
                Ready to execute {approvedCount} action
                {approvedCount !== 1 ? "s" : ""}
              </span>
            ) : (
              <span>
                Review each action before confirming
              </span>
            )}
          </div>
          <div className="agent-confirmation-actions">
            {!allDecided && pendingCount > 0 && (
              <button
                type="button"
                onClick={handleApproveAll}
                className="agent-btn-confirm-all"
              >
                <Check className="w-4 h-4" />
                Approve All ({pendingCount})
              </button>
            )}
            {hasDecisions && (
              <button
                type="button"
                onClick={handleCancelAll}
                className="agent-btn-cancel-all"
              >
                Reset
              </button>
            )}
            {allDecided && approvedCount > 0 && (
              <button
                type="button"
                onClick={() => {
                  // Execute approved actions
                  console.log("Executing approved actions");
                }}
                className="agent-btn-confirm-all"
              >
                <ShieldCheck className="w-4 h-4" />
                Execute Actions
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
