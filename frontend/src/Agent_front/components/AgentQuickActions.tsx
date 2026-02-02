import { TrendingUp, FileText, Lightbulb, Search, ArrowRight } from "lucide-react";

interface Example {
  category: string;
  prompt: string;
  icon: typeof TrendingUp;
}

interface AgentQuickActionsProps {
  onExampleClick: (prompt: string) => void;
}

export function AgentQuickActions({ onExampleClick }: AgentQuickActionsProps) {
  const examples: Example[] = [
    {
      category: "Analysis",
      prompt: "What are my top priorities this week?",
      icon: TrendingUp,
    },
    {
      category: "Reporting",
      prompt: "Generate a summary of all active dossiers",
      icon: FileText,
    },
    {
      category: "Planning",
      prompt: "Help me prepare for the upcoming hearing",
      icon: Lightbulb,
    },
    {
      category: "Search",
      prompt: "Find all overdue tasks by client",
      icon: Search,
    },
  ];

  return (
    <div className="pt-10 sm:pt-16">
      <div className="mb-6 px-1">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Agent
        </h2>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
          Query your dossiers, clients, tasks, and documents. Use{" "}
          <kbd className="px-1.5 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-slate-500 dark:text-slate-400 font-mono text-[10px]">
            /
          </kbd>{" "}
          for commands.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {examples.map((example, idx) => {
          const IconComponent = example.icon;
          return (
            <button
              type="button"
              key={idx}
              onClick={() => onExampleClick(example.prompt)}
              className="group flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-slate-300 dark:hover:border-slate-600 transition-colors text-left"
            >
              <div className="p-1.5 bg-slate-50 dark:bg-slate-700 rounded flex-shrink-0">
                <IconComponent className="w-4 h-4 text-slate-500 dark:text-slate-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-slate-400 dark:text-slate-500">
                  {example.category}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300">
                  {example.prompt}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
