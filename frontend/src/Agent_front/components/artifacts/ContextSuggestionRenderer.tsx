import { ArrowRight } from "lucide-react";
import type { ContextSuggestionOutput, ContextSuggestionItem, FollowUpSuggestion } from "../../../services/api/agent";

interface ContextSuggestionRendererProps {
  data: ContextSuggestionOutput;
  onSelect: (suggestion: ContextSuggestionItem) => void;
}

/**
 * Context Suggestion Renderer — Clean Conversational Entity Selection
 *
 * Renders context suggestions as a normal assistant message with inline selectable rows.
 * This is NOT an artifact — it's part of the conversational flow.
 *
 * Architecture:
 * - Driven ONLY by output.type === "context_suggestion"
 * - No detection logic, no inference from nested fields
 * - Clean 1:1 mapping from backend contract to UI
 */
export function ContextSuggestionRenderer({
  data,
  onSelect,
}: ContextSuggestionRendererProps) {
  return (
    <div className="agent-message-row">
      <div className="agent-bubble agent-chat-text">
        {/* Conversational introduction message */}
        <p className="text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 mb-3">
          {data.message}
        </p>

        {/* Inline suggestion rows */}
        <div className="space-y-2">
          {data.suggestions.map((suggestion) => {
            // Format metadata for display
            const metadataEntries = Object.entries(suggestion.metadata);
            const hasMetadata = metadataEntries.length > 0;

            return (
              <button
                key={suggestion.id}
                type="button"
                onClick={() => onSelect(suggestion)}
                className="agent-suggestion-row group"
              >
                <div className="flex-1 text-left">
                  {/* Primary label (entity name) */}
                  <div className="agent-suggestion-name">
                    {suggestion.label}
                  </div>

                  {/* Optional subtitle (reference number, etc.) */}
                  {suggestion.subtitle && (
                    <div className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                      {suggestion.subtitle}
                    </div>
                  )}

                  {/* Metadata (overdue count, open tasks, etc.) */}
                  {hasMetadata && (
                    <div className="agent-suggestion-metadata">
                      {metadataEntries.map(([key, value], idx) => (
                        <span key={key}>
                          {value} {key.replace(/_/g, ' ')}
                          {idx < metadataEntries.length - 1 && <span className="mx-1.5">•</span>}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Arrow indicator */}
                <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 transition-all flex-shrink-0" />
              </button>
            );
          })}
        </div>

        {/* Manual input hint (optional) */}
        {data.allowManualInput && data.manualInputHint && (
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 italic">
            {data.manualInputHint}
          </p>
        )}
      </div>
    </div>
  );
}
