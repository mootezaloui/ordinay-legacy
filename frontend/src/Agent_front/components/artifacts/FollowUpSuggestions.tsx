import { ArrowRight, Compass } from "lucide-react";
import type { FollowUpSuggestion } from "../../../services/api/agent";

interface FollowUpSuggestionsProps {
  followUps: FollowUpSuggestion[];
  onFollowUpClick: (followUp: FollowUpSuggestion) => void;
}

/**
 * Renders MANDATORY follow-up suggestions below the artifact.
 *
 * This is NOT optional. Every entity read MUST have at least 2 follow-ups.
 * Follow-ups guide the user to the next logical step.
 *
 * Each suggestion shows:
 *   - Label: what action to take
 *   - Reason: why this is suggested (shown on hover)
 */
export function FollowUpSuggestions({
  followUps,
  onFollowUpClick,
}: FollowUpSuggestionsProps) {
  if (!followUps || followUps.length === 0) return null;

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        <Compass className="w-3.5 h-3.5 text-slate-400" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Continue with
        </span>
      </div>

      {/* Follow-up buttons */}
      <div className="flex flex-wrap gap-2">
        {followUps.map((followUp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onFollowUpClick(followUp)}
            title={followUp.reason}
            className="group inline-flex items-center gap-2 text-sm px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 hover:border-slate-300 dark:hover:border-slate-600 transition-all"
          >
            <span>{followUp.label}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>

      {/* Reason hint for first suggestion */}
      {followUps[0]?.reason && (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">
          {followUps[0].reason}
        </p>
      )}
    </div>
  );
}
