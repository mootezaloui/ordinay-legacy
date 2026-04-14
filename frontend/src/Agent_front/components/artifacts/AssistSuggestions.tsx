import { Check, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { AssistSuggestionsOutput, AssistSuggestionItem } from "../../../services/api/agent";
import {
  resolveAssistSuggestionQuestion,
  resolveSuggestionActionMeta,
} from "../../utils/suggestionHelpers";

interface AssistSuggestionsProps {
  data: AssistSuggestionsOutput;
  onDismiss?: () => void;
  onAccept?: (suggestion: AssistSuggestionItem) => void;
  onDecline?: (suggestion: AssistSuggestionItem) => void;
}

export function AssistSuggestions({
  data,
  onDismiss,
  onAccept,
  onDecline,
}: AssistSuggestionsProps) {
  const { t } = useTranslation("common");
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (suggestions.length === 0) return null;

  const suggestion = suggestions[0];
  const meta = resolveSuggestionActionMeta(suggestion);
  const question = resolveAssistSuggestionQuestion(suggestion);
  const decision = suggestion.decision === "accepted" || suggestion.decision === "declined"
    ? suggestion.decision
    : null;

  return (
    <div className="artifact-build agent-artifact-card is-assist">
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-assist flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            {t("agent.artifacts.suggestion")}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            {t("agent.artifacts.dismiss")}
          </button>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        <p className="text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
          {question}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          {suggestion.reason}
        </p>
        {decision ? (
          decision === "accepted" ? (
            <div className="rounded-md border border-emerald-200/80 bg-emerald-50 px-3 py-2 flex items-center gap-1.5 text-xs font-medium text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5 shrink-0" />
              {suggestion.domain === "execute" ? t("agent.artifacts.actionStarted") : t("agent.artifacts.draftGenerationStarted")}
            </div>
          ) : (
            <div className="rounded-md border border-slate-200/80 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
              {t("agent.artifacts.declined")}
            </div>
          )
        ) : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onAccept?.(suggestion)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700 transition-colors"
            >
              <Check className="h-4 w-4" />
              {t("agent.artifacts.yes")}
            </button>
            <button
              type="button"
              onClick={() => onDecline?.(suggestion)}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 transition-colors"
            >
              <X className="h-4 w-4" />
              {t("agent.artifacts.no")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
