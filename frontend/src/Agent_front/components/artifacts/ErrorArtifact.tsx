import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, Search, ArrowRight } from "lucide-react";
import { MarkdownOutput } from "../../../components/MarkdownOutput";
import { useData } from "../../../contexts/DataContext";

interface DataContext {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{
    id: number;
    reference?: string;
    title?: string;
    status?: string;
  }>;
  tasks?: Array<{ id: number; title?: string; status?: string }>;
  loading?: boolean;
}

interface ErrorArtifactProps {
  content: string;
  onExampleClick?: (example: string) => void;
}

/**
 * Detects if the error is a "no entity context" error.
 * This happens when the user tries to use follow-ups without first loading an entity.
 */
function isContextError(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("no_entity_context") ||
    lower.includes("need context first") ||
    lower.includes("no active entity context") ||
    lower.includes("read an entity before")
  );
}

function isErrorCode(content: string): boolean {
  const trimmed = content.trim();
  if (!trimmed) return false;
  const upper = trimmed.toUpperCase();
  return (
    upper === "NO_ENTITY_CONTEXT" ||
    upper === "PENDING_SELECTION" ||
    upper === "INVALID_COMMAND" ||
    upper === "COMMAND_ERROR"
  );
}

interface ContextSuggestion {
  prompt: string;
  reason: string;
}

/**
 * Generates dynamic context suggestions based on actual user data.
 * Shows real entities the user can load to establish context.
 */
function useContextSuggestions(): ContextSuggestion[] {
  const data = useData() as DataContext;

  return useMemo(() => {
    const suggestions: ContextSuggestion[] = [];

    if (data?.loading) return [];

    const clients = data?.clients || [];
    const dossiers = data?.dossiers || [];
    const tasks = data?.tasks || [];

    // Suggest a specific client if available
    if (clients.length > 0) {
      const client = clients[0];
      const name = client.name || client.reference || "selected client";
      suggestions.push({
        prompt: `Show client ${name}`,
        reason: `${clients.length} client${clients.length > 1 ? "s" : ""} available`,
      });
    }

    // Suggest a specific dossier if available
    const activeDossiers = dossiers.filter(
      (d) => d.status !== "closed" && d.status !== "archived"
    );
    if (activeDossiers.length > 0) {
      const dossier = activeDossiers[0];
      const ref = dossier.reference || dossier.title || "selected dossier";
      suggestions.push({
        prompt: `Show dossier ${ref}`,
        reason: `${activeDossiers.length} active dossier${activeDossiers.length > 1 ? "s" : ""}`,
      });
    } else if (dossiers.length > 0) {
      // Fall back to any dossier
      const dossier = dossiers[0];
      const ref = dossier.reference || dossier.title || "selected dossier";
      suggestions.push({
        prompt: `Show dossier ${ref}`,
        reason: `${dossiers.length} dossier${dossiers.length > 1 ? "s" : ""} total`,
      });
    }

    // Suggest listing tasks if no specific entities
    const pendingTasks = tasks.filter(
      (t) => t.status !== "done" && t.status !== "completed"
    );
    if (pendingTasks.length > 0 && suggestions.length < 2) {
      suggestions.push({
        prompt: "List my tasks",
        reason: `${pendingTasks.length} pending task${pendingTasks.length > 1 ? "s" : ""}`,
      });
    }

    // Generic fallbacks if no data
    if (suggestions.length === 0) {
      if (clients.length === 0 && dossiers.length === 0) {
        // No data at all - suggest general listing
        suggestions.push({
          prompt: "List clients",
          reason: "Browse available clients",
        });
        suggestions.push({
          prompt: "List dossiers",
          reason: "Browse available dossiers",
        });
      }
    }

    return suggestions.slice(0, 3);
  }, [data]);
}

/**
 * Renders an error state as a distinct, non-chat block.
 * Factual — states what happened, no apology.
 *
 * For context errors, shows DYNAMIC suggestions based on actual user data.
 * Suggestions reference real entities, not hard-coded examples.
 */
export function ErrorArtifact({ content, onExampleClick }: ErrorArtifactProps) {
  const { t } = useTranslation("common");
  const isContext = isContextError(content);
  const normalized = content.trim().toUpperCase();
  const isPendingSelection = normalized === "PENDING_SELECTION";
  const hideContent = isErrorCode(content);
  const contextSuggestions = useContextSuggestions();

  // Only show suggestions for context errors when we have the callback
  const showSuggestions = isContext && onExampleClick && contextSuggestions.length > 0;

  return (
    <div className="artifact-build agent-artifact-card is-error">
      <div className="artifact-build-header agent-artifact-header flex items-center gap-2 px-5 py-3 border-b border-amber-200/70 dark:border-amber-800/60">
        {isContext ? (
          <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          isContext
            ? "text-amber-700 dark:text-amber-400"
            : "text-red-600 dark:text-red-400"
        }`}>
          {isContext ? t("agent.artifacts.contextNeeded") : isPendingSelection ? t("agent.artifacts.selectionNeeded") : t("agent.artifacts.error")}
        </span>
      </div>
      <div className="artifact-build-section artifact-build-section-1 px-5 py-3 space-y-3">
        {!hideContent && (
          <div className={`text-sm leading-relaxed ${
            isContext
              ? "text-amber-800 dark:text-amber-200"
              : "text-red-700 dark:text-red-300"
          }`}>
            <MarkdownOutput content={content} />
          </div>
        )}

        {/* Dynamic suggestions for context errors */}
        {showSuggestions && (
          <div className="pt-2 space-y-2">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              {t("agent.artifacts.tryLoadEntity")}
            </p>
            <div className="flex flex-wrap gap-2">
              {contextSuggestions.map((suggestion, idx) => (
                <button
                  key={suggestion.prompt}
                  type="button"
                  onClick={() => onExampleClick(suggestion.prompt)}
                  title={suggestion.reason}
                  className="artifact-build-statement inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-full transition-colors"
                  style={{ animationDelay: `${0.35 + idx * 0.1}s` }}
                >
                  {suggestion.prompt}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
