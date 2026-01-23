import React from "react";
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
import { useData } from "../../contexts/DataContext";
import { DataAccessPermissions } from "../../services/api/agent";

const DATA_SOURCE_CONFIG = [
  { id: "dossiers", label: "Dossiers", icon: FolderOpen },
  { id: "clients", label: "Clients", icon: Users },
  { id: "lawsuits", label: "lawsuits", icon: FileText },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "personalTasks", label: "Personal Tasks", icon: CheckSquare },
  { id: "missions", label: "Missions", icon: Zap },
  { id: "sessions", label: "Sessions", icon: Calendar },
  { id: "documents", label: "Documents", icon: FileText },
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
      "Prepare a summary of the Dupont lawsuit",
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
  dataAccess: DataAccessPermissions;
  setDataAccess: React.Dispatch<React.SetStateAction<DataAccessPermissions>>;
}

export function AgentResultPreview({
  onExampleClick,
  dataAccess,
  setDataAccess,
}: AgentResultPreviewProps) {
  const { dossiers, clients, lawsuits, tasks, personalTasks, missions, sessions } =
    useData();

  const handleToggleSource = (id: keyof DataAccessPermissions) => {
    setDataAccess((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleToggleAll = () => {
    const allEnabled = Object.values(dataAccess).every(Boolean);
    const newState = {} as DataAccessPermissions;
    (Object.keys(dataAccess) as Array<keyof DataAccessPermissions>).forEach((key) => {
      newState[key] = !allEnabled;
    });
    setDataAccess(newState);
  };

  return (
    <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <button
          type="button"
          onClick={handleToggleAll}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border transition-colors w-full
            ${
              Object.values(dataAccess).some(Boolean)
                ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 cursor-pointer"
                : "bg-slate-100 dark:bg-slate-800 border-slate-300 dark:border-slate-700 cursor-pointer"
            }`}
          aria-pressed={Object.values(dataAccess).some(Boolean) ? "true" : "false"}
        >
          <div
            className={`w-2 h-2 rounded-full animate-pulse
            ${
              Object.values(dataAccess).some(Boolean)
                ? "bg-green-500"
                : "bg-red-500 dark:bg-slate-600 animate-none"
            }`}
          ></div>
          <span
            className={`text-xs font-medium
            ${
              Object.values(dataAccess).some(Boolean)
                ? "text-green-700 dark:text-green-300"
                : "text-slate-500 dark:text-slate-400 line-through"
            }`}
          >
            {Object.values(dataAccess).some(Boolean)
              ? "Connected to your data"
              : "Data access disabled"}
          </span>
        </button>
      </div>

      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 mb-3">
          <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
          <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
            Data Access
          </h3>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {DATA_SOURCE_CONFIG.map((source) => {
            const IconComponent = source.icon;
            let value: string | number = "--";
            if (source.id === "dossiers" && dossiers) value = dossiers.length;
            else if (source.id === "clients" && clients) value = clients.length;
            else if (source.id === "lawsuits" && lawsuits) value = lawsuits.length;
            else if (source.id === "tasks" && tasks) value = tasks.length;
            else if (source.id === "personalTasks" && personalTasks)
              value = personalTasks.length;
            else if (source.id === "missions" && missions)
              value = missions.length;
            else if (source.id === "sessions" && sessions)
              value = sessions.length;
            const enabled = dataAccess[source.id as keyof DataAccessPermissions];
            return (
              <button
                key={source.id}
                type="button"
                onClick={() => handleToggleSource(source.id as keyof DataAccessPermissions)}
                className={`relative p-3 w-full text-left bg-slate-50 dark:bg-slate-800 rounded-lg transition-colors border-2 ${
                  enabled
                    ? "border-green-200 dark:border-green-800 hover:bg-slate-100 dark:hover:bg-slate-750"
                    : "border-slate-300 dark:border-slate-700 opacity-60"
                }`}
                aria-pressed={enabled ? "true" : "false"}
                tabIndex={0}
              >
                <div
                  className={`absolute top-2 right-2 w-1.5 h-1.5 rounded-full ${
                    enabled ? "bg-green-500" : "bg-red-500 dark:bg-slate-600"
                  }`}
                ></div>
                <IconComponent
                  className={`w-4 h-4 mb-2 ${
                    enabled
                      ? "text-slate-600 dark:text-slate-400"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                />
                <div
                  className={`text-xs font-medium ${
                    enabled
                      ? "text-slate-900 dark:text-white"
                      : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {value}
                </div>
                <div
                  className={`text-xs ${
                    enabled
                      ? "text-slate-500 dark:text-slate-400"
                      : "text-slate-400 dark:text-slate-600"
                  }`}
                >
                  {source.label}
                </div>
              </button>
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
                      type="button"
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


