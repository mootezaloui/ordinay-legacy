import {
  Database,
  Zap,
  FolderOpen,
  Users,
  CheckSquare,
  Calendar,
  FileText,
  TrendingUp,
  Lightbulb,
  Search,
} from "lucide-react";

const dataSources = [
  { id: "dossiers", label: "12 Dossiers", icon: FolderOpen, active: true },
  { id: "clients", label: "47 Clients", icon: Users, active: true },
  { id: "tasks", label: "23 Tasks", icon: CheckSquare, active: true },
  { id: "sessions", label: "8 Sessions", icon: Calendar, active: true },
  { id: "documents", label: "156 Documents", icon: FileText, active: true },
];

const capabilities = [
  {
    id: "analysis",
    title: "Analysis & Insights",
    icon: TrendingUp,
    examples: [
      "Which dossiers need urgent attention?",
      "Show me overdue tasks by client",
    ],
  },
  {
    id: "reporting",
    title: "Reports & Summaries",
    icon: FileText,
    examples: [
      "Prepare a summary of the Dupont case",
      "Generate monthly activity report",
    ],
  },
  {
    id: "planning",
    title: "Planning & Strategy",
    icon: Lightbulb,
    examples: [
      "What should I prioritize today?",
      "Help me plan the upcoming trial",
    ],
  },
  {
    id: "search",
    title: "Smart Search",
    icon: Search,
    examples: [
      "Find all documents related to Client X",
      "Show tasks assigned to me this month",
    ],
  },
];

interface AgentResultPreviewProps {
  onExampleClick: (example: string) => void;
}

export function AgentResultPreview({ onExampleClick }: AgentResultPreviewProps) {
  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
          <span className="text-xs font-medium text-green-700 dark:text-green-300">
            Connected to your data
          </span>
        </div>
      </div>

      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            Data Access
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {dataSources.map((source) => {
            const IconComponent = source.icon;
            return (
              <div
                key={source.id}
                className="relative p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
              >
                <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                <IconComponent className="w-4 h-4 text-slate-600 dark:text-slate-400 mb-2" />
                <div className="text-xs font-medium text-slate-900 dark:text-white">
                  {source.label.split(" ")[0]}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {source.label.split(" ")[1]}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            Capabilities
          </h3>
        </div>
        <div className="space-y-3">
          {capabilities.map((capability) => {
            const IconComponent = capability.icon;
            return (
              <div
                key={capability.id}
                className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
              >
                <div className="flex items-center gap-2 mb-2">
                  <IconComponent className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                  <span className="text-xs font-semibold text-slate-900 dark:text-white">
                    {capability.title}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {capability.examples.map((example, idx) => (
                    <button
                      key={idx}
                      onClick={() => onExampleClick(example)}
                      className="block w-full text-left text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                    >
                      • {example}
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
