import { ArrowRight, Sparkles } from "lucide-react";
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
    <div className="agent-followups-section mt-5 pt-5 border-t border-black/[0.05] dark:border-white/[0.05]">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-4">
        <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/30 dark:to-indigo-900/30 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-violet-600 dark:text-violet-400" />
        </div>
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          {t("agent.followUps.header")}
        </span>
      </div>

      {/* Follow-up buttons */}
      <div className="flex flex-wrap gap-2.5">
        {followUps.map((followUp, idx) => (
          <button
            key={idx}
            type="button"
            onClick={() => onFollowUpClick(followUp)}
            title={followUp.reason}
            className="agent-followup-btn group"
          >
            <span className="agent-followup-btn-text">
              {buildFollowUpLabel(followUp, t)}
            </span>
            <ArrowRight className="w-3.5 h-3.5 text-slate-400 group-hover:text-[#3b82f6] dark:group-hover:text-[#60a5fa] group-hover:translate-x-0.5 transition-all" />
          </button>
        ))}
      </div>
    </div>
  );
}
