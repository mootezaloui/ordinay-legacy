import { useMemo } from "react";
import {
  MessageSquare,
  TrendingUp,
  FileText,
  Users,
  AlertCircle,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { useData } from "../../contexts/DataContext";

interface DataContext {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{
    id: number;
    reference?: string;
    title?: string;
    status?: string;
    clientId?: number;
  }>;
  tasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    priority?: string;
    due_date?: string;
  }>;
  sessions?: Array<{
    id: number;
    title?: string;
    scheduled_at?: string;
    session_date?: string;
  }>;
  personalTasks?: Array<{
    id: number;
    title?: string;
    status?: string;
    due_date?: string;
  }>;
  loading?: boolean;
}

interface DynamicSuggestion {
  id: string;
  category: string;
  prompt: string;
  reason: string;
  icon: typeof TrendingUp;
  priority: number;
}

interface AgentQuickActionsProps {
  onExampleClick?: (prompt: string) => void;
}

/**
 * Generates dynamic suggestions based on actual user data.
 * Suggestions are contextual and reference real entities when available.
 */
function useDynamicSuggestions(): DynamicSuggestion[] {
  const data = useData() as DataContext;

  return useMemo(() => {
    const suggestions: DynamicSuggestion[] = [];
    const now = new Date();

    // Skip if data is still loading
    if (data?.loading) return [];

    const clients = data?.clients || [];
    const dossiers = data?.dossiers || [];
    const tasks = data?.tasks || [];
    const sessions = data?.sessions || [];
    const personalTasks = data?.personalTasks || [];

    // ── Overdue Tasks (highest priority) ──
    const overdueTasks = tasks.filter((t) => {
      if (!t.due_date) return false;
      if (t.status === "done" || t.status === "completed") return false;
      return new Date(t.due_date) < now;
    });

    if (overdueTasks.length > 0) {
      suggestions.push({
        id: "overdue-tasks",
        category: "Urgent",
        prompt: "Show my overdue tasks",
        reason: `${overdueTasks.length} task${overdueTasks.length > 1 ? "s" : ""} past due date`,
        icon: AlertCircle,
        priority: 0,
      });
    }

    // ── Upcoming Sessions (high priority) ──
    const upcomingSessions = sessions.filter((s) => {
      const date = s.scheduled_at || s.session_date;
      if (!date) return false;
      const sessionDate = new Date(date);
      const daysUntil = Math.ceil((sessionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      return daysUntil >= 0 && daysUntil <= 7;
    });

    if (upcomingSessions.length > 0) {
      suggestions.push({
        id: "upcoming-sessions",
        category: "This Week",
        prompt: "List my sessions this week",
        reason: `${upcomingSessions.length} session${upcomingSessions.length > 1 ? "s" : ""} scheduled`,
        icon: Calendar,
        priority: 1,
      });
    }

    // ── Active Dossiers ──
    const activeDossiers = dossiers.filter(
      (d) => d.status !== "closed" && d.status !== "archived"
    );

    if (activeDossiers.length > 0) {
      // Suggest viewing a specific recent dossier
      const recentDossier = activeDossiers[0];
      const dossierRef = recentDossier.reference || recentDossier.title || `#${recentDossier.id}`;

      suggestions.push({
        id: "active-dossiers",
        category: "Dossiers",
        prompt: `Show dossier ${dossierRef}`,
        reason: `${activeDossiers.length} active dossier${activeDossiers.length > 1 ? "s" : ""}`,
        icon: FileText,
        priority: 2,
      });
    } else if (dossiers.length === 0) {
      // No dossiers at all - suggest listing clients first
      if (clients.length > 0) {
        suggestions.push({
          id: "list-clients",
          category: "Getting Started",
          prompt: "List my clients",
          reason: `${clients.length} client${clients.length > 1 ? "s" : ""} available`,
          icon: Users,
          priority: 2,
        });
      }
    }

    // ── Client Overview (if we have clients) ──
    if (clients.length > 0 && suggestions.length < 3) {
      const recentClient = clients[0];
      const clientName = recentClient.name || recentClient.reference || `#${recentClient.id}`;

      suggestions.push({
        id: "client-overview",
        category: "Clients",
        prompt: `Show client ${clientName}`,
        reason: `View client details and related dossiers`,
        icon: Users,
        priority: 3,
      });
    }

    // ── Task Summary (if we have tasks) ──
    const pendingTasks = tasks.filter(
      (t) => t.status !== "done" && t.status !== "completed"
    );

    if (pendingTasks.length > 0 && suggestions.length < 4) {
      suggestions.push({
        id: "task-summary",
        category: "Tasks",
        prompt: "What are my pending tasks?",
        reason: `${pendingTasks.length} task${pendingTasks.length > 1 ? "s" : ""} pending`,
        icon: TrendingUp,
        priority: 4,
      });
    }

    // ── Personal Tasks (if available) ──
    const pendingPersonal = personalTasks.filter(
      (t) => t.status !== "done" && t.status !== "completed"
    );

    if (pendingPersonal.length > 0 && suggestions.length < 4) {
      suggestions.push({
        id: "personal-tasks",
        category: "Personal",
        prompt: "Show my personal tasks",
        reason: `${pendingPersonal.length} personal task${pendingPersonal.length > 1 ? "s" : ""}`,
        icon: TrendingUp,
        priority: 5,
      });
    }

    // Sort by priority and take top 4
    return suggestions.sort((a, b) => a.priority - b.priority).slice(0, 4);
  }, [data]);
}

/**
 * Agent Welcome State
 *
 * Shown when the conversation is empty.
 * Displays DYNAMIC suggestions based on actual user data.
 *
 * DESIGN PRINCIPLE: Suggestions are context-aware and data-driven.
 * They reference real entities and reflect actual system state.
 */
export function AgentQuickActions({ onExampleClick }: AgentQuickActionsProps) {
  const suggestions = useDynamicSuggestions();
  const data = useData() as DataContext;
  const isLoading = data?.loading;

  // Show minimal welcome if no data yet or no suggestions
  if (isLoading || suggestions.length === 0) {
    return (
      <div className="pt-12 sm:pt-16">
        <div className="px-1 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 bg-slate-100 dark:bg-slate-800 rounded-2xl border border-slate-200/70 dark:border-slate-700/60">
            <MessageSquare className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            Organia Intelligence
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
            Query your dossiers, clients, tasks, and documents. Use{" "}
            <kbd className="px-2 py-0.5 bg-white/80 dark:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400 font-mono text-[10px] border border-slate-200/60 dark:border-slate-700/60">
              /
            </kbd>{" "}
            for commands.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-12 sm:pt-16">
      <div className="mb-6 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
          Agent
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          Query your dossiers, clients, tasks, and documents. Use{" "}
          <kbd className="px-2 py-0.5 bg-white/80 dark:bg-slate-800 rounded-full text-slate-500 dark:text-slate-400 font-mono text-[10px] border border-slate-200/60 dark:border-slate-700/60">
            /
          </kbd>{" "}
          for commands.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {suggestions.map((suggestion) => {
          const IconComponent = suggestion.icon;
          return (
            <button
              type="button"
              key={suggestion.id}
              onClick={() => onExampleClick?.(suggestion.prompt)}
              className="group flex items-center gap-3 p-4 bg-white/85 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 rounded-2xl hover:border-slate-300/80 dark:hover:border-slate-600 transition-colors text-left shadow-sm"
            >
              <div className={`p-2 rounded-xl flex-shrink-0 border ${
                suggestion.priority === 0
                  ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200/70 dark:border-amber-800/60"
                  : "bg-slate-50 dark:bg-slate-800 border-slate-200/70 dark:border-slate-700/60"
              }`}>
                <IconComponent className={`w-4 h-4 ${
                  suggestion.priority === 0
                    ? "text-amber-600 dark:text-amber-400"
                    : "text-slate-500 dark:text-slate-400"
                }`} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400 dark:text-slate-500">
                  {suggestion.category}
                </div>
                <div className="text-sm text-slate-700 dark:text-slate-300 truncate">
                  {suggestion.prompt}
                </div>
                <div className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">
                  {suggestion.reason}
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
