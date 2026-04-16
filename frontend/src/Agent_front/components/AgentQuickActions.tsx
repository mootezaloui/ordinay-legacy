import { useMemo } from "react";
import { useTranslation } from "react-i18next";
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
    const seenEntityKeys = new Set<string>();

    // Skip if data is still loading
    if (data?.loading) return [];

    const clients = data?.clients || [];
    const dossiers = data?.dossiers || [];
    const tasks = data?.tasks || [];
    const sessions = data?.sessions || [];
    const personalTasks = data?.personalTasks || [];

    // Helper to avoid duplicate entity references
    const addSuggestion = (suggestion: DynamicSuggestion, entityKey?: string) => {
      if (entityKey && seenEntityKeys.has(entityKey)) return false;
      if (entityKey) seenEntityKeys.add(entityKey);
      suggestions.push(suggestion);
      return true;
    };

    // ── 1. Overdue Tasks (highest priority) ──
    const overdueTasks = tasks.filter((t) => {
      if (!t.due_date) return false;
      if (t.status === "done" || t.status === "completed") return false;
      return new Date(t.due_date) < now;
    });

    if (overdueTasks.length > 0) {
      const mostOverdue = overdueTasks.sort((a, b) => {
        return new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime();
      })[0];

      addSuggestion({
        id: `overdue-task-${mostOverdue.id}`,
        category: "Urgent",
        prompt: `Show task "${mostOverdue.title || "pending task"}"`,
        reason: `${overdueTasks.length} task${overdueTasks.length > 1 ? "s" : ""} past due date`,
        icon: AlertCircle,
        priority: 0,
      }, `task-${mostOverdue.id}`);
    }

    // ── 2. Dossier with nearest upcoming deadline ──
    const activeDossiers = dossiers.filter(
      (d) => d.status !== "closed" && d.status !== "archived",
    );

    const dossiersWithDeadlines = activeDossiers.filter((d: any) => d.deadline);
    if (dossiersWithDeadlines.length > 0) {
      const upcomingDossiers = dossiersWithDeadlines.filter((d: any) => new Date(d.deadline) >= now);
      if (upcomingDossiers.length > 0) {
        const nearest = upcomingDossiers.sort((a: any, b: any) => {
          return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
        })[0];

        const dossierRef = nearest.reference || nearest.title || "selected dossier";
        addSuggestion({
          id: `dossier-deadline-${nearest.id}`,
          category: "Deadline",
          prompt: `Show dossier ${dossierRef}`,
          reason: `Deadline approaching`,
          icon: Calendar,
          priority: 1,
        }, `dossier-${nearest.id}`);
      }
    }

    // ── 3. High urgency dossier (if different from deadline one) ──
    const highUrgencyDossiers = activeDossiers.filter((d: any) =>
      d.urgency === "high" || d.priority === "high"
    );
    if (highUrgencyDossiers.length > 0) {
      const urgentDossier = highUrgencyDossiers[
        Math.floor(Math.random() * highUrgencyDossiers.length)
      ];
      const dossierRef = urgentDossier.reference || urgentDossier.title || "selected dossier";

      addSuggestion({
        id: `dossier-urgent-${urgentDossier.id}`,
        category: "High Priority",
        prompt: `Show dossier ${dossierRef}`,
        reason: `Requires attention`,
        icon: AlertCircle,
        priority: 1,
      }, `dossier-${urgentDossier.id}`);
    }

    // ── 4. Client with highest number of active dossiers ──
    if (clients.length > 0 && activeDossiers.length > 0) {
      const clientDossierCounts = new Map<number, number>();
      activeDossiers.forEach((d) => {
        if (d.clientId) {
          clientDossierCounts.set(d.clientId, (clientDossierCounts.get(d.clientId) || 0) + 1);
        }
      });

      if (clientDossierCounts.size > 0) {
        const topClientId = Array.from(clientDossierCounts.entries())
          .sort((a, b) => b[1] - a[1])[0][0];
        const topClient = clients.find((c) => c.id === topClientId);

        if (topClient) {
          const clientName = topClient.name || topClient.reference || "selected client";
          const dossierCount = clientDossierCounts.get(topClientId) || 0;

          addSuggestion({
            id: `client-top-${topClient.id}`,
            category: "Active Client",
            prompt: `Show client ${clientName}`,
            reason: `${dossierCount} active dossier${dossierCount > 1 ? "s" : ""}`,
            icon: Users,
            priority: 2,
          }, `client-${topClient.id}`);
        }
      }
    }

    // ── 5. Random active client (fallback if slots available) ──
    if (clients.length > 0 && suggestions.length < 3) {
      const availableClients = clients.filter((c) => !seenEntityKeys.has(`client-${c.id}`));
      if (availableClients.length > 0) {
        const randomClient = availableClients[
          Math.floor(Math.random() * availableClients.length)
        ];
        const clientName = randomClient.name || randomClient.reference || "selected client";

        addSuggestion({
          id: `client-random-${randomClient.id}`,
          category: "Clients",
          prompt: `Show client ${clientName}`,
          reason: `View client details`,
          icon: Users,
          priority: 3,
        }, `client-${randomClient.id}`);
      }
    }

    // ── 6. Random active dossier (fallback if slots available) ──
    if (activeDossiers.length > 0 && suggestions.length < 4) {
      const availableDossiers = activeDossiers.filter(
        (d) => !seenEntityKeys.has(`dossier-${d.id}`)
      );
      if (availableDossiers.length > 0) {
        const randomDossier = availableDossiers[
          Math.floor(Math.random() * availableDossiers.length)
        ];
        const dossierRef = randomDossier.reference || randomDossier.title || "selected dossier";

        addSuggestion({
          id: `dossier-random-${randomDossier.id}`,
          category: "Dossiers",
          prompt: `Show dossier ${dossierRef}`,
          reason: `${activeDossiers.length} active dossier${activeDossiers.length > 1 ? "s" : ""}`,
          icon: FileText,
          priority: 4,
        }, `dossier-${randomDossier.id}`);
      }
    } else if (dossiers.length === 0 && clients.length > 0 && suggestions.length < 4) {
      // No dossiers at all - suggest listing clients
      addSuggestion({
        id: "list-clients",
        category: "Getting Started",
        prompt: "List my clients",
        reason: `${clients.length} client${clients.length > 1 ? "s" : ""} available`,
        icon: Users,
        priority: 4,
      });
    }

    // ── 7. Task summary (general, if slots available) ──
    const pendingTasks = tasks.filter(
      (t) => t.status !== "done" && t.status !== "completed",
    );

    if (pendingTasks.length > 0 && suggestions.length < 4) {
      addSuggestion({
        id: "task-summary",
        category: "Tasks",
        prompt: "What are my pending tasks?",
        reason: `${pendingTasks.length} task${pendingTasks.length > 1 ? "s" : ""} pending`,
        icon: TrendingUp,
        priority: 5,
      });
    }

    // ── 8. Personal Tasks (if slots available) ──
    const pendingPersonal = personalTasks.filter(
      (t) => t.status !== "done" && t.status !== "completed",
    );

    if (pendingPersonal.length > 0 && suggestions.length < 4) {
      addSuggestion({
        id: "personal-tasks",
        category: "Personal",
        prompt: "Show my personal tasks",
        reason: `${pendingPersonal.length} personal task${pendingPersonal.length > 1 ? "s" : ""}`,
        icon: TrendingUp,
        priority: 6,
      });
    }

    // Sort by priority, shuffle slightly within same priority, take top 4
    const grouped = new Map<number, DynamicSuggestion[]>();
    suggestions.forEach((s) => {
      if (!grouped.has(s.priority)) grouped.set(s.priority, []);
      grouped.get(s.priority)!.push(s);
    });

    const shuffled: DynamicSuggestion[] = [];
    Array.from(grouped.keys()).sort((a, b) => a - b).forEach((priority) => {
      const group = grouped.get(priority)!;
      // Fisher-Yates shuffle within same priority group
      for (let i = group.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [group[i], group[j]] = [group[j], group[i]];
      }
      shuffled.push(...group);
    });

    return shuffled.slice(0, 4);
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
  const { t } = useTranslation("common");
  const suggestions = useDynamicSuggestions();
  const data = useData() as DataContext;
  const isLoading = data?.loading;

  // Show minimal welcome if no data yet or no suggestions
  if (isLoading || suggestions.length === 0) {
    return (
      <div className="pt-12 sm:pt-16">
        <div className="px-1 text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 mb-4 bg-black/[0.04] dark:bg-white/[0.05] rounded-2xl border border-black/[0.05] dark:border-white/[0.06]">
            <MessageSquare className="w-5 h-5 text-slate-500 dark:text-slate-400" />
          </div>
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-300">
            {t("agent.quickActions.title")}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 max-w-xs mx-auto">
            {t("agent.quickActions.hint")}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="pt-12 sm:pt-16">
      <div className="mb-6 px-1">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400 dark:text-slate-500">
          {t("agent.quickActions.heading")}
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {t("agent.quickActions.hint")}
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
              className="group flex items-center gap-3 p-4 bg-white/85 dark:bg-white/[0.04] border border-black/[0.05] dark:border-white/[0.06] rounded-2xl hover:border-black/[0.08] dark:hover:border-white/[0.08] transition-colors text-left shadow-sm"
            >
              <div
                className={`p-2 rounded-xl flex-shrink-0 border ${
                  suggestion.priority === 0
                    ? "bg-amber-50 dark:bg-amber-900/20 border-amber-200/70 dark:border-amber-800/60"
                    : "bg-black/[0.03] dark:bg-white/[0.04] border-black/[0.05] dark:border-white/[0.06]"
                }`}
              >
                <IconComponent
                  className={`w-4 h-4 ${
                    suggestion.priority === 0
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-slate-500 dark:text-slate-400"
                  }`}
                />
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
