import { Sparkles, Database, ChevronLeft, ChevronRight } from "lucide-react";
import type { AgentModelPreference } from "../../services/api/agent";

interface AgentTopBarProps {
  showHistorySidebar: boolean;
  showContextSidebar: boolean;
  onToggleHistory: () => void;
  onToggleContext: () => void;
  modelPreference: AgentModelPreference;
  onModelPreferenceChange: (value: AgentModelPreference) => void;
  isStreaming?: boolean;
}

export function AgentTopBar({
  showHistorySidebar,
  showContextSidebar,
  onToggleHistory,
  onToggleContext,
  modelPreference,
  onModelPreferenceChange,
  isStreaming = false,
}: AgentTopBarProps) {
  return (
    <div className="h-14 flex-shrink-0 border-b border-black/[0.05] dark:border-white/[0.05] bg-white/80 dark:bg-[#0f172a]/80 backdrop-blur px-3 sm:px-4 flex items-center justify-between gap-3">
      <div className="flex items-center gap-2 min-w-0">
        {!showHistorySidebar && (
          <button
            onClick={onToggleHistory}
            className="p-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded-lg transition-colors"
          >
            <ChevronRight className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        )}
        {showHistorySidebar && (
          <button
            onClick={onToggleHistory}
            className="p-2 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded-lg transition-colors"
          >
            <ChevronLeft className="w-4 h-4 text-slate-500 dark:text-slate-400" />
          </button>
        )}
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a] rounded-lg flex-shrink-0">
            <Sparkles className="w-3.5 h-3.5" />
          </div>
          <span className="text-sm font-semibold text-[#0f172a] dark:text-[#f1f5f9] truncate">
            <span className="hidden sm:inline">Ordinay Intelligence</span>
            <span className="sm:hidden">Ordinay Agent</span>
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate max-w-[200px]">
          {modelPreference || "Configure AI in Settings"}
        </span>
        <button
          onClick={onToggleContext}
          className="flex items-center gap-2 px-2.5 sm:px-3 py-1.5 text-xs font-medium text-slate-500 dark:text-slate-400 hover:bg-black/[0.04] dark:hover:bg-white/[0.05] rounded-lg transition-colors whitespace-nowrap"
          aria-label={
            showContextSidebar ? "Hide context panel" : "Show context panel"
          }
        >
          <Database className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">
            {showContextSidebar ? "Hide Context" : "Show Context"}
          </span>
          <span className="sm:hidden">Context</span>
        </button>
      </div>
    </div>
  );
}
