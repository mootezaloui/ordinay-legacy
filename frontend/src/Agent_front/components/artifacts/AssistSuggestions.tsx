import { Sparkles, PlusCircle, FileText, StickyNote, PenLine } from "lucide-react";
import type { AssistSuggestionsOutput, AssistSuggestionItem } from "../../../services/api/agent";

interface AssistSuggestionsProps {
  data: AssistSuggestionsOutput;
  onDismiss?: () => void;
  onAction?: (label: string) => void;
}

const ACTION_TYPE_META: Record<string, { label: string; color: string }> = {
  CREATE_ENTITY: { label: "Create", color: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30" },
  ADD_NOTE: { label: "Add Note", color: "text-sky-600 dark:text-sky-400 bg-sky-50 dark:bg-sky-900/30" },
  GENERATE_DOCUMENT: { label: "Generate", color: "text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30" },
  ENRICH_FIELD: { label: "Complete", color: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30" },
};

function ActionIcon({ actionType }: { actionType: string }) {
  const cls = "w-4 h-4 shrink-0";
  if (actionType === "CREATE_ENTITY") return <PlusCircle className={cls} />;
  if (actionType === "ADD_NOTE") return <StickyNote className={cls} />;
  if (actionType === "GENERATE_DOCUMENT") return <FileText className={cls} />;
  if (actionType === "ENRICH_FIELD") return <PenLine className={cls} />;
  return <Sparkles className={cls} />;
}

function SuggestionCard({ suggestion, onAction }: { suggestion: AssistSuggestionItem; onAction?: (label: string) => void }) {
  const meta = ACTION_TYPE_META[suggestion.actionType] || { label: suggestion.actionType, color: "text-slate-600 bg-slate-50" };
  return (
    <div className="flex items-start gap-3 py-3 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
      <div className="mt-0.5 text-amber-500 dark:text-amber-400">
        <ActionIcon actionType={suggestion.actionType} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-snug">
            {suggestion.label}
          </span>
          <span className={`text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${meta.color}`}>
            {meta.label}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
          {suggestion.reason}
        </p>
      </div>
      {onAction && (
        <button
          type="button"
          onClick={() => onAction(suggestion.label)}
          className="shrink-0 mt-0.5 text-xs font-medium px-2.5 py-1 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/50 transition-colors"
        >
          Do it
        </button>
      )}
    </div>
  );
}

export function AssistSuggestions({ data, onDismiss, onAction }: AssistSuggestionsProps) {
  const suggestions = Array.isArray(data.suggestions) ? data.suggestions : [];
  if (suggestions.length === 0) return null;

  return (
    <div className="artifact-build agent-artifact-card is-assist">
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-assist flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-amber-500 dark:text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
            Suggested Actions
          </span>
          <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
            {suggestions.length} suggestion{suggestions.length !== 1 ? "s" : ""}
          </span>
        </div>
        {onDismiss && (
          <button
            onClick={onDismiss}
            className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
          >
            Dismiss
          </button>
        )}
      </div>
      <div className="px-4 py-1">
        {suggestions.map((suggestion, idx) => (
          <SuggestionCard key={idx} suggestion={suggestion} onAction={onAction} />
        ))}
      </div>
    </div>
  );
}
