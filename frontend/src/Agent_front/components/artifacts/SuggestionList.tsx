import { ArrowRight } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { FollowUpSuggestion } from "../../../services/api/agent";
import { buildFollowUpLabel } from "../../utils/followUpLabels";

interface SuggestionListProps {
  suggestions: FollowUpSuggestion[];
  introText?: string;
  onSuggestionClick: (suggestion: FollowUpSuggestion) => void;
}

/**
 * Renders context suggestions as conversational inline selectable rows.
 * Used when the agent needs the user to select from multiple matching entities.
 *
 * Unlike artifact-style rendering, this appears as a normal assistant message
 * with clickable suggestion rows embedded in the conversation.
 */
export function SuggestionList({
  suggestions,
  introText,
  onSuggestionClick,
}: SuggestionListProps) {
  const { t } = useTranslation("common");

  if (!suggestions || suggestions.length === 0) return null;

  // Extract entity type from first suggestion
  const entityType = suggestions[0]?.entityType || "record";
  const defaultIntro = t("agent.followUps.suggestionIntro", {
    count: suggestions.length,
    entity: entityType,
  });

  return (
    <div className="agent-message-row">
      <div className="agent-bubble agent-suggestions-bubble">
        {/* Introduction text */}
        <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 mb-3">
          {introText || defaultIntro}
        </p>

        {/* Suggestion rows */}
        <div className="space-y-2">
          {suggestions.map((suggestion, idx) => {
            const label = buildFollowUpLabel(suggestion, t);

            // Extract entity name and metadata from label
            // Label format: "Review {entityType} context: {entityName}"
            const labelMatch = label.match(/Review\s+\w+\s+context:\s+(.+)$/);
            const entityName = labelMatch ? labelMatch[1] : label;

            // Parse signal for metadata (e.g., "3 overdue invoice(s), 2 open task(s)")
            const signal = suggestion.reason || "";
            const hasMetadata = signal && signal.length > 0;

            return (
              <button
                key={idx}
                type="button"
                onClick={() => onSuggestionClick(suggestion)}
                className="agent-suggestion-row group"
              >
                <div className="flex-1 text-left">
                  <div className="agent-suggestion-name">
                    {entityName}
                  </div>
                  {hasMetadata && (
                    <div className="agent-suggestion-metadata">
                      {signal}
                    </div>
                  )}
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-[#3b82f6] dark:group-hover:text-[#60a5fa] group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
