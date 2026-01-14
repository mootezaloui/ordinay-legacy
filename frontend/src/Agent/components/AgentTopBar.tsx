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
    <div className="h-14 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between">
      <div className="flex items-center gap-3">
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
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-sm font-semibold text-slate-900 dark:text-white">
            Organia Intelligence
          </span>
        </div>
      </div>

      <button
        onClick={onToggleContext}
        className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
      >
        <Database className="w-3.5 h-3.5" />
        {showContextSidebar ? "Hide Context" : "Show Context"}
      </button>
    </div>
  );
}
