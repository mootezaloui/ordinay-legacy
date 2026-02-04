import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FollowUpSuggestion } from "../../../services/api/agent";
import { buildFollowUpLabel } from "../../utils/followUpLabels";

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
  const { t } = useTranslation("common");

  return (
    <div className="mt-5 pt-4 border-t border-slate-200/70 dark:border-slate-700/50">
      {/* Follow-up buttons */}
      <div className="flex flex-wrap gap-2">
        {followUps.map((followUp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onFollowUpClick(followUp)}
            title={followUp.reason}
            className="group inline-flex items-center gap-2 text-sm px-3.5 py-2 border border-slate-200/80 dark:border-slate-700/70 rounded-full bg-white/90 dark:bg-slate-900/70 text-slate-700 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-900 hover:border-slate-300/80 dark:hover:border-slate-600 transition-all shadow-sm"
          >
            <span>{buildFollowUpLabel(followUp, t)}</span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>
    </div>
  );
}
