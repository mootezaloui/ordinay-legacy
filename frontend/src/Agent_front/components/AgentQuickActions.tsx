import { Sparkles, TrendingUp, FileText, Lightbulb, Search, ArrowRight } from "lucide-react";

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
    <div className="pt-6 sm:pt-10">
      <div className="flex items-start gap-3 mb-6">
        <div className="p-2 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg flex-shrink-0">
          <Sparkles className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
            What can I help you with?
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            I have access to your dossiers, clients, tasks, and documents.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {examples.map((example, idx) => {
          const IconComponent = example.icon;
          return (
            <button
              key={idx}
              onClick={() => onExampleClick(example.prompt)}
              className="group flex items-center gap-3 p-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-sm transition-all text-left"
            >
              <div className="p-1.5 bg-blue-50 dark:bg-blue-900/20 rounded-md group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors flex-shrink-0">
                <IconComponent className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-blue-600 dark:text-blue-400">
                  {example.category}
                </div>
                <div className="text-sm text-slate-900 dark:text-white">
                  {example.prompt}
                </div>
              </div>
              <ArrowRight className="w-3.5 h-3.5 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
