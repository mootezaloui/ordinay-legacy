import { ArrowRight } from "lucide-react";
import type { ContextSuggestionOutput, ContextSuggestionItem } from "../../../services/api/agent";

interface ContextSuggestionRendererProps {
  data: ContextSuggestionOutput;
  onSelect: (suggestion: ContextSuggestionItem) => void;
}

function formatMetadataValue(value: unknown): string {
  if (typeof value === "number") {
    return new Intl.NumberFormat().format(value);
  }
  if (typeof value !== "string") return String(value ?? "");
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) return trimmed.slice(0, 10);
  return trimmed;
}

function buildFriendlyMetadata(suggestion: ContextSuggestionItem): string[] {
  const entries = (suggestion.metadata || {}) as Record<string, string | number>;
  const lines: string[] = [];

  const pick = (...keys: string[]) => {
    for (const key of keys) {
      if (entries[key] !== undefined && entries[key] !== null) return entries[key];
    }
    return null;
  };

  const overdueCount = pick(
    "overdueCount",
    "overdue_count",
    "overdue_invoice",
    "overdue_invoices",
  );
  const totalOverdue = pick("totalOverdueAmount", "total_overdue_amount");
  const daysLate = pick("daysLate", "days_late");
  const oldestDue = pick("oldestDueDate", "oldest_due_date");
  const openTasks = pick(
    "openTasksCount",
    "open_tasks_count",
    "open_task",
    "open_tasks",
  );
  const activeDossiers = pick(
    "activeDossiersCount",
    "active_dossiers_count",
    "active_dossier",
    "active_dossiers",
  );
  const clientName = pick("clientName", "client_name");

  if (typeof clientName === "string" && clientName.trim()) {
    lines.push(`Client: ${clientName.trim()}`);
  }

  if (typeof overdueCount === "number" && overdueCount > 0) {
    lines.push(`${formatMetadataValue(overdueCount)} overdue invoice${overdueCount > 1 ? "s" : ""}`);
  }
  if (typeof totalOverdue === "number" && totalOverdue > 0) {
    lines.push(`${formatMetadataValue(totalOverdue)} overdue`);
  }
  if (typeof daysLate === "number" && daysLate > 0) {
    lines.push(`${formatMetadataValue(daysLate)} day${daysLate > 1 ? "s" : ""} late`);
  }
  if (oldestDue) {
    lines.push(`oldest due ${formatMetadataValue(oldestDue)}`);
  }
  if (typeof openTasks === "number" && openTasks > 0) {
    lines.push(`${formatMetadataValue(openTasks)} open task${openTasks > 1 ? "s" : ""}`);
  }
  if (typeof activeDossiers === "number" && activeDossiers > 0) {
    lines.push(
      `${formatMetadataValue(activeDossiers)} active dossier${activeDossiers > 1 ? "s" : ""}`,
    );
  }

  return lines;
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
            const friendlyMetadata = buildFriendlyMetadata(suggestion);
            const hasMetadata = friendlyMetadata.length > 0;

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
                      {friendlyMetadata.map((line, idx) => (
                        <span key={idx}>
                          {line}
                          {idx < friendlyMetadata.length - 1 && (
                            <span className="mx-1.5">•</span>
                          )}
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
