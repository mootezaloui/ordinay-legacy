import React, { useMemo } from "react";
import {
  Database,
  Zap,
  FolderOpen,
  Users,
  CheckSquare,
  Calendar,
  FileText,
  Wallet,
  Bell,
  History,
  TrendingUp,
  Search,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";
import { DataAccessPermissions } from "../../services/api/agent";

interface DataContext {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{
    id: number;
    reference?: string;
    title?: string;
    status?: string;
    clientId?: number;
  }>;
  lawsuits?: Array<{ id: number; reference?: string; lawsuit_number?: string }>;
  tasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    priority?: string;
    due_date?: string;
  }>;
  personalTasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    due_date?: string;
  }>;
  missions?: Array<{ id: number; reference?: string; status?: string }>;
  sessions?: Array<{
    id: number;
    title?: string;
    scheduled_at?: string;
    session_date?: string;
  }>;
  financialEntries?: Array<{
    id: number;
    reference?: string;
    status?: string;
    due_date?: string;
    paid_at?: string;
  }>;
  loading?: boolean;
}

interface DynamicCapability {
  id: string;
  title: string;
  icon: typeof TrendingUp;
  examples: Array<{ prompt: string; reason: string }>;
  priority: number;
}

const DATA_SOURCE_CONFIG = [
  { id: "dossiers", label: "Dossiers", icon: FolderOpen },
  { id: "clients", label: "Clients", icon: Users },
  { id: "lawsuits", label: "lawsuits", icon: FileText },
  { id: "tasks", label: "Tasks", icon: CheckSquare },
  { id: "personalTasks", label: "Personal Tasks", icon: CheckSquare },
  { id: "missions", label: "Missions", icon: Zap },
  { id: "sessions", label: "Sessions", icon: Calendar },
  { id: "financialEntries", label: "Accounting", icon: Wallet },
  { id: "notifications", label: "Notifications", icon: Bell },
  { id: "history", label: "History", icon: History },
  { id: "documents", label: "Documents", icon: FileText },
];

/**
 * Generates dynamic capabilities based on actual user data.
 * Each capability shows contextual examples referencing real entities.
 */
function useDynamicCapabilities(): DynamicCapability[] {
  const data = useData() as DataContext;

  return useMemo(() => {
    const capabilities: DynamicCapability[] = [];
    const now = new Date();

    if (data?.loading) return [];

    const clients = data?.clients || [];
    const dossiers = data?.dossiers || [];
    const tasks = data?.tasks || [];
    const sessions = data?.sessions || [];
    const financialEntries = data?.financialEntries || [];

    // ── Analysis & Insights ──
    const analysisExamples: Array<{ prompt: string; reason: string }> = [];

    // Overdue tasks analysis
    const overdueTasks = tasks.filter((t) => {
      if (!t.due_date || t.status === "done" || t.status === "completed") return false;
      return new Date(t.due_date) < now;
    });
    if (overdueTasks.length > 0) {
      analysisExamples.push({
        prompt: "Show overdue tasks",
        reason: `${overdueTasks.length} overdue`,
      });
    }

    // Active dossiers analysis
    const activeDossiers = dossiers.filter(
      (d) => d.status !== "closed" && d.status !== "archived"
    );
    if (activeDossiers.length > 0) {
      analysisExamples.push({
        prompt: "Which dossiers need attention?",
        reason: `${activeDossiers.length} active`,
      });
    }

    // Priority tasks
    const urgentTasks = tasks.filter(
      (t) => t.priority === "urgent" && t.status !== "done" && t.status !== "completed"
    );
    if (urgentTasks.length > 0) {
      analysisExamples.push({
        prompt: "List urgent tasks",
        reason: `${urgentTasks.length} urgent`,
      });
    }

    if (analysisExamples.length > 0) {
      capabilities.push({
        id: "analysis",
        title: "Analysis & Insights",
        icon: TrendingUp,
        examples: analysisExamples.slice(0, 2),
        priority: 0,
      });
    }

    // ── Reports & Summaries ──
    const reportExamples: Array<{ prompt: string; reason: string }> = [];

    // Dossier summaries
    if (activeDossiers.length > 0) {
      const dossier = activeDossiers[0];
      const ref = dossier.reference || dossier.title || `#${dossier.id}`;
      reportExamples.push({
        prompt: `Summarize dossier ${ref}`,
        reason: "Get case overview",
      });
    }

    // Client summaries
    if (clients.length > 0) {
      const client = clients[0];
      const name = client.name || client.reference || `#${client.id}`;
      reportExamples.push({
        prompt: `Show client ${name}`,
        reason: "View client details",
      });
    }

    if (reportExamples.length > 0) {
      capabilities.push({
        id: "reporting",
        title: "Reports & Summaries",
        icon: FileText,
        examples: reportExamples.slice(0, 2),
        priority: 1,
      });
    }

    // ── Scheduling & Sessions ──
    const scheduleExamples: Array<{ prompt: string; reason: string }> = [];

    const upcomingSessions = sessions.filter((s) => {
      const date = s.scheduled_at || s.session_date;
      if (!date) return false;
      return new Date(date) >= now;
    });

    if (upcomingSessions.length > 0) {
      scheduleExamples.push({
        prompt: "List upcoming sessions",
        reason: `${upcomingSessions.length} scheduled`,
      });
    }

    // Sessions this week
    const weekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
    const thisWeekSessions = upcomingSessions.filter((s) => {
      const date = new Date(s.scheduled_at || s.session_date || "");
      return date <= weekFromNow;
    });

    if (thisWeekSessions.length > 0) {
      scheduleExamples.push({
        prompt: "Sessions this week",
        reason: `${thisWeekSessions.length} this week`,
      });
    }

    if (scheduleExamples.length > 0) {
      capabilities.push({
        id: "scheduling",
        title: "Scheduling",
        icon: Calendar,
        examples: scheduleExamples.slice(0, 2),
        priority: 2,
      });
    }

    // ── Financial Overview ──
    const financialExamples: Array<{ prompt: string; reason: string }> = [];

    const unpaidEntries = financialEntries.filter(
      (e) => !e.paid_at && e.status !== "paid"
    );
    const overduePayments = unpaidEntries.filter((e) => {
      if (!e.due_date) return false;
      return new Date(e.due_date) < now;
    });

    if (overduePayments.length > 0) {
      financialExamples.push({
        prompt: "Show overdue payments",
        reason: `${overduePayments.length} overdue`,
      });
    } else if (unpaidEntries.length > 0) {
      financialExamples.push({
        prompt: "List unpaid entries",
        reason: `${unpaidEntries.length} unpaid`,
      });
    }

    if (financialEntries.length > 0) {
      financialExamples.push({
        prompt: "Financial summary",
        reason: `${financialEntries.length} entries`,
      });
    }

    if (financialExamples.length > 0) {
      capabilities.push({
        id: "financial",
        title: "Financial",
        icon: Wallet,
        examples: financialExamples.slice(0, 2),
        priority: 3,
      });
    }

    // ── Search (always available if we have data) ──
    const searchExamples: Array<{ prompt: string; reason: string }> = [];

    if (clients.length > 0) {
      searchExamples.push({
        prompt: "List all clients",
        reason: `${clients.length} available`,
      });
    }

    if (dossiers.length > 0) {
      searchExamples.push({
        prompt: "List all dossiers",
        reason: `${dossiers.length} total`,
      });
    }

    if (searchExamples.length > 0) {
      capabilities.push({
        id: "search",
        title: "Search & Browse",
        icon: Search,
        examples: searchExamples.slice(0, 2),
        priority: 4,
      });
    }

    return capabilities.sort((a, b) => a.priority - b.priority).slice(0, 4);
  }, [data]);
}

interface AgentResultPreviewProps {
  onExampleClick?: (example: string) => void;
  dataAccess: DataAccessPermissions;
  setDataAccess: React.Dispatch<React.SetStateAction<DataAccessPermissions>>;
}

export function AgentResultPreview({
  onExampleClick,
  dataAccess,
  setDataAccess,
}: AgentResultPreviewProps) {
  const data = useData() as DataContext;
  const capabilities = useDynamicCapabilities();

  const {
    dossiers = [],
    clients = [],
    lawsuits = [],
    tasks = [],
    personalTasks = [],
    missions = [],
    sessions = [],
    financialEntries = [],
  } = data || {};

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
    <div className="h-full w-full flex flex-col border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
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

      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex-shrink-0">
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
            if (source.id === "dossiers") value = dossiers.length;
            else if (source.id === "clients") value = clients.length;
            else if (source.id === "lawsuits") value = lawsuits.length;
            else if (source.id === "tasks") value = tasks.length;
            else if (source.id === "personalTasks") value = personalTasks.length;
            else if (source.id === "missions") value = missions.length;
            else if (source.id === "sessions") value = sessions.length;
            else if (source.id === "financialEntries") value = financialEntries.length;
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

      {/* Dynamic Capabilities based on actual data */}
      {capabilities.length > 0 && onExampleClick && (
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center gap-2 mb-3">
            <Zap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
            <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
              Quick Actions
            </h3>
          </div>
          <div className="space-y-3">
            {capabilities.map((capability) => {
              const IconComponent = capability.icon;
              return (
                <div
                  key={capability.id}
                  className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg"
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
                        onClick={() => onExampleClick(example.prompt)}
                        className="group flex items-center justify-between w-full text-left text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      >
                        <span className="truncate">• {example.prompt}</span>
                        <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {example.reason}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
