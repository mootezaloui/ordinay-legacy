import { Sparkles, Database, ChevronLeft, ChevronRight } from "lucide-react";

interface AgentTopBarProps {
  showHistorySidebar: boolean;
  showContextSidebar: boolean;
  onToggleHistory: () => void;
  onToggleContext: () => void;
}

export function AgentTopBar({
  showHistorySidebar,
  showContextSidebar,
  onToggleHistory,
  onToggleContext,
}: AgentTopBarProps) {
  return (
    <div className="h-14 flex-shrink-0 border-b border-slate-200/70 dark:border-slate-800/80 bg-white/90 dark:bg-slate-950/70 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {!showHistorySidebar && (
          <button
            onClick={onToggleHistory}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        )}
        {showHistorySidebar && (
          <button
            onClick={onToggleHistory}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 rounded-lg flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            <span className="hidden sm:inline">Organia Intelligence</span>
            <span className="sm:hidden">Organia Agent</span>
          </span>
        </div>
      </div>

      <button
        onClick={onToggleContext}
        className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap"
        aria-label={showContextSidebar ? "Hide context panel" : "Show context panel"}
      >
        <Database className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">
          {showContextSidebar ? "Hide Context" : "Show Context"}
        </span>
        <span className="sm:hidden">Context</span>
      </button>
    </div>
  );
}
