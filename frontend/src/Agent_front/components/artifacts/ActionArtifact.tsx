import { ListTodo, AlertTriangle, RotateCcw, ShieldCheck } from "lucide-react";
import type { ActionProposal } from "../../../services/api/agent";

interface ActionArtifactProps {
  data: ActionProposal[];
}

/**
 * Renders proposed actions as a decision panel.
 * Each action is its own card with explicit status, reversibility,
 * and per-action confirmation — no implicit "approve all."
 */
export function ActionArtifact({ data }: ActionArtifactProps) {
  return (
    <div className="artifact-enter rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <ListTodo className="w-4 h-4 text-green-600" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Proposed Actions
          </span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {data.length} action{data.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Action cards */}
      <div className="px-5 py-4 space-y-3">
        {data.map((action: ActionProposal, idx: number) => (
          <div
            key={action.proposalId || idx}
            className="p-4 rounded border border-slate-200 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-slate-900 dark:text-white">
                  {action.action}
                </p>
                {action.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    {action.description}
                  </p>
                )}

                {/* Metadata row */}
                <div className="flex items-center gap-3 mt-2">
                  {/* Status badge */}
                  <span className="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-medium">
                    {action.status}
                  </span>

                  {/* Reversibility indicator */}
                  {action.requiresConfirmation && (
                    <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="w-3 h-3" />
                      Requires confirmation
                    </span>
                  )}
                </div>
              </div>

              {/* Confirm button */}
              {action.requiresConfirmation && (
                <button
                  type="button"
                  className="flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 text-green-700 dark:text-green-300 hover:bg-green-100 dark:hover:bg-green-900/40 transition-colors"
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Confirm
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
