import { Loader2 } from "lucide-react";

interface StatusMessageProps {
  action: string;
  phase?: string;
}

/**
 * Status Message
 *
 * Renders the current processing status from the backend.
 * These are deterministic updates sent via SSE as the agent
 * progresses through its work.
 *
 * Status messages:
 * - Update in place (replace previous status)
 * - Show a spinner indicating active work
 * - Describe what the agent is doing ("Retrieving client data…")
 * - Disappear when the artifact arrives
 *
 * Visual style: Active, showing the agent is working, but not intrusive.
 */
export function StatusMessage({ action, phase }: StatusMessageProps) {
  return (
    <div className="status-message agent-message-row animate-in fade-in duration-150">
      <div className="agent-status-line">
        {/* Spinner — work in progress */}
        <Loader2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 animate-spin flex-shrink-0" />

        {/* Status action text */}
        <span className="text-xs text-slate-600 dark:text-slate-300">
          {action}
        </span>

        {/* Phase indicator (development only) */}
        {process.env.NODE_ENV === "development" && phase && (
          <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2">
            [{phase}]
          </span>
        )}
      </div>
    </div>
  );
}
