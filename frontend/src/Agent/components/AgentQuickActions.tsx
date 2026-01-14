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
    <div className="py-16">
      <div className="text-center mb-12">
        <div className="inline-flex p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
          What can I help you with?
        </h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          I have access to all your dossiers, clients, tasks, and documents. Ask
          me to analyze your work, prepare reports, or help you plan your next
          steps.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
        {examples.map((example, idx) => {
          const IconComponent = example.icon;
          return (
            <button
              key={idx}
              onClick={() => onExampleClick(example.prompt)}
              className="group p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                  <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                    {example.category}
                  </div>
                  <div className="text-sm text-slate-900 dark:text-white font-medium">
                    {example.prompt}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
