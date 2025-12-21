import { useMemo, useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";
import StatCard from "../components/dashboard/StatCard";
import ActivityFeed from "../components/dashboard/ActivityFeed";
import UpcomingEvents from "../components/dashboard/UpcomingEvents";
import QuickActions from "../components/dashboard/QuickActions";
import TaskList from "../components/dashboard/TaskList";
import {
  mockClients,
  mockDossiers,
  mockTasks,
  mockSessions,
  mockCases,
  mockAccounting,
  mockOfficersExtended,
} from "../utils/mockData";
import { financialLedger } from "../utils/financialData";
import { useSettings } from "../contexts/SettingsContext";

export default function Dashboard() {
  const navigate = useNavigate();
  const [isProjectionCollapsed, setProjectionCollapsed] = useState(false);
  const [isLoadMapCollapsed, setLoadMapCollapsed] = useState(false);
  const { formatDate: formatDisplayDate } = useSettings();

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setProjectionCollapsed(true);
      setLoadMapCollapsed(true);
    }
  }, []);

  // Calculate real stats from mock data
  const stats = useMemo(() => {
    const activeClients = mockClients.filter(c => c.status === "Active").length;
    const activeDossiers = mockDossiers.filter(d => d.status === "Ouvert").length;
    const pendingTasks = mockTasks.filter(t => t.status !== "Terminée").length;
    const todayTasks = mockTasks.filter(t => t.dueDate === new Date().toISOString().split('T')[0]).length;

    // Calculate revenue (sum of paid invoices)
    const paidInvoices = mockAccounting.filter(i => i.status === "Payée");
    const revenue = paidInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.amount.replace(/[^0-9.]/g, '')) || 0;
      return sum + amount;
    }, 0);

    return {
      clients: {
        total: mockClients.length,
        active: activeClients,
        trend: 12, // Mock trend
      },
      dossiers: {
        total: mockDossiers.length,
        active: activeDossiers,
        newThisWeek: 3, // Mock
      },
      tasks: {
        total: mockTasks.length,
        pending: pendingTasks,
        dueToday: todayTasks,
      },
      revenue: {
        total: revenue,
        trend: 23, // Mock trend
      },
    };
  }, []);

  // Generate recent activities from data
  const recentActivities = useMemo(() => {
    const activities = [];

    // Recent clients
    mockClients.slice(0, 2).forEach(client => {
      activities.push({
        id: `client-${client.id}`,
        type: "client",
        title: `Nouveau client: ${client.name}`,
        description: client.email,
        timestamp: client.joinDate || new Date().toISOString(),
        user: "Me. Hammami",
        onClick: () => navigate(`/clients/${client.id}`),
      });
    });

    // Recent dossiers
    mockDossiers.slice(0, 1).forEach(dossier => {
      activities.push({
        id: `dossier-${dossier.id}`,
        type: "dossier",
        title: `Dossier mis à jour: ${dossier.caseNumber}`,
        description: dossier.title,
        timestamp: dossier.openDate || new Date().toISOString(),
        user: "Me. Sassi",
        onClick: () => navigate(`/dossiers/${dossier.id}`),
      });
    });

    // Recent sessions
    mockSessions.slice(0, 1).forEach(session => {
      activities.push({
        id: `session-${session.id}`,
        type: "session",
        title: `Séance programmée: ${session.title}`,
        description: `${session.date} à ${session.time}`,
        timestamp: new Date().toISOString(),
        user: "Me. Cherif",
        onClick: () => navigate(`/sessions/${session.id}`),
      });
    });

    // Sort by timestamp
    return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [navigate]);

  // Get upcoming events
  const upcomingEvents = useMemo(() => {
    const events = [];

    // Upcoming sessions
    mockSessions.forEach(session => {
      const sessionDate = new Date(`${session.date}T${session.time || '00:00'}`);
      if (sessionDate > new Date()) {
        events.push({
          id: `session-${session.id}`,
          type: session.type === "Audience" ? "hearing" : "session",
          title: session.title,
          date: sessionDate.toISOString(),
          location: session.location,
          link: `/sessions/${session.id}`,
        });
      }
    });

    // Upcoming hearings from cases
    mockCases.forEach(caseItem => {
      const hearingDate = new Date(caseItem.nextHearing);
      if (hearingDate > new Date()) {
        events.push({
          id: `case-${caseItem.id}`,
          type: "hearing",
          title: caseItem.title,
          date: hearingDate.toISOString(),
          location: caseItem.court,
          link: `/cases/${caseItem.id}`,
        });
      }
    });

    // Task deadlines
    mockTasks.forEach(task => {
      const dueDate = new Date(task.dueDate);
      if (dueDate > new Date() && task.status !== "Terminée") {
        events.push({
          id: `task-${task.id}`,
          type: "deadline",
          title: `Échéance: ${task.title}`,
          date: dueDate.toISOString(),
          link: `/tasks/${task.id}`,
        });
      }
    });

    // Sort by date
    return events.sort((a, b) => new Date(a.date) - new Date(b.date));
  }, []);

  // Get urgent tasks (high priority or due soon)
const urgentTasks = useMemo(() => {
    const today = new Date();
    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

    return mockTasks
      .filter(task => {
        const dueDate = new Date(task.dueDate);
        return (
          task.status !== "Terminée" &&
          (task.priority === "Haute" || dueDate <= threeDaysFromNow)
        );
      })
      .sort((a, b) => {
        // Sort by priority then due date
        const priorityOrder = { Haute: 0, Moyenne: 1, Basse: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
  }, []);

  // Projection data: aggregate next-dated items across entities
  const projectionItems = useMemo(() => {
    const items = [];
    const now = new Date();

    const pushItem = (dateStr, type, label, route) => {
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (Number.isNaN(date.getTime()) || date <= now) return;
      items.push({ date, type, label, route });
    };

    // Sessions
    mockSessions.forEach(session => {
      pushItem(`${session.date}T${session.time || "00:00"}`, "session", session.title, `/sessions/${session.id}`);
    });

    // Tasks
    mockTasks.forEach(task => {
      pushItem(task.dueDate, "task", task.title, `/tasks/${task.id}`);
    });

    // Cases: next hearings
    mockCases.forEach(c => {
      pushItem(c.nextHearing, "case", c.title, `/cases/${c.id}`);
    });

    // Dossiers: next deadline
    mockDossiers.forEach(d => {
      if (d.nextDeadline) {
        pushItem(d.nextDeadline, "dossier", d.title, `/dossiers/${d.id}`);
      }
    });

    // Financial entries: use dueDate if available, fallback to date
    financialLedger.forEach(entry => {
      const targetDate = entry.dueDate || entry.date;
      pushItem(targetDate, "finance", entry.description, `/accounting/${entry.id}`);
    });

    // Missions with due dates (from officers)
    Object.values(mockOfficersExtended).forEach(officer => {
      officer.missions?.forEach(mission => {
        if (mission.dueDate) {
          pushItem(mission.dueDate, "mission", mission.title, `/missions/${mission.id}`);
        }
      });
    });

    return items.sort((a, b) => a.date - b.date);
  }, []);

  const laneItems = projectionItems.slice(0, 12);

  const windowSummaries = useMemo(() => {
    const horizons = [30, 60, 90];
    const now = new Date();
    return horizons.map(days => {
      const cutoff = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      const windowItems = projectionItems.filter(item => item.date <= cutoff);
      return {
        days,
        count: windowItems.length,
        highlights: windowItems.slice(0, 2),
      };
    });
  }, [projectionItems]);

  const formatDate = (date) => formatDisplayDate(date);

  const getTypeMeta = (type) => {
    const map = {
      session: { label: "Audience", icon: "fas fa-gavel", color: "text-purple-600" },
      task: { label: "Tâche", icon: "fas fa-tasks", color: "text-amber-600" },
      case: { label: "Procès", icon: "fas fa-scale-balanced", color: "text-blue-600" },
      dossier: { label: "Dossier", icon: "fas fa-folder-open", color: "text-green-600" },
      finance: { label: "Finance", icon: "fas fa-file-invoice-dollar", color: "text-emerald-600" },
      mission: { label: "Mission", icon: "fas fa-user-tie", color: "text-teal-600" },
    };
    return map[type] || { label: type, icon: "fas fa-calendar", color: "text-slate-500" };
  };

  // Load Map: group projection items by ISO week for the next 8 weeks
  const loadMapWeeks = useMemo(() => {
    const weeksToShow = 8;
    const now = new Date();

    const getISOWeek = (date) => {
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      const dayNum = d.getUTCDay() || 7;
      d.setUTCDate(d.getUTCDate() + 4 - dayNum);
      const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
      return { year: d.getUTCFullYear(), week: weekNo };
    };

    const weekKey = (dt) => {
      const { year, week } = getISOWeek(dt);
      return `${year}-W${week}`;
    };

    const weeks = [];
    for (let i = 0; i < weeksToShow; i++) {
      const start = new Date(now);
      start.setDate(start.getDate() + i * 7);
      weeks.push(start);
    }

    const bucket = weeks.reduce((acc, start) => {
      const key = weekKey(start);
      acc[key] = {
        key,
        start,
        count: 0,
        byType: {},
      };
      return acc;
    }, {});

    projectionItems.forEach((item) => {
      const key = weekKey(item.date);
      if (bucket[key]) {
        bucket[key].count += 1;
        bucket[key].byType[item.type] = (bucket[key].byType[item.type] || 0) + 1;
      }
    });

    const weeksArray = Object.values(bucket).sort((a, b) => a.start - b.start);
    const maxCount = weeksArray.reduce((m, w) => Math.max(m, w.count), 0) || 1;

    return weeksArray.map((w) => {
      const intensity = w.count <= 2 ? "light" : w.count <= 5 ? "medium" : "heavy";
      return {
        ...w,
        maxCount,
        intensity,
      };
    });
  }, [projectionItems]);

  return (
    <PageLayout>
      <PageHeader
        title="Tableau de Bord"
        subtitle="Vue d'ensemble de votre cabinet"
        icon="fas fa-chart-line"
      />

      <div className="space-y-6">
        {/* Quick Actions */}
        <ContentSection>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              Actions Rapides
            </h2>
            <QuickActions />
          </div>
        </ContentSection>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Clients"
            value={stats.clients.total}
            icon="fas fa-users"
            color="blue"
            trend={stats.clients.trend}
            trendLabel="vs mois dernier"
            onClick={() => navigate("/clients")}
          />

          <StatCard
            label="Dossiers Actifs"
            value={stats.dossiers.active}
            icon="fas fa-folder-open"
            color="purple"
            trendLabel={`${stats.dossiers.newThisWeek} nouveaux cette semaine`}
            onClick={() => navigate("/dossiers")}
          />

          <StatCard
            label="Tâches en Attente"
            value={stats.tasks.pending}
            icon="fas fa-tasks"
            color="amber"
            trendLabel={`${stats.tasks.dueToday} à faire aujourd'hui`}
            onClick={() => navigate("/tasks")}
          />

          <StatCard
            label="Revenu"
            value={`${stats.revenue.total.toLocaleString('fr-TN')} TND`}
            icon="fas fa-dollar-sign"
            color="green"
            trend={stats.revenue.trend}
            trendLabel="vs mois dernier"
            onClick={() => navigate("/accounting")}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Urgent Tasks */}
          <ContentSection title={`Tâches Urgentes (${urgentTasks.length})`}>
            <div className="p-6">
              <TaskList tasks={urgentTasks} maxItems={5} />
            </div>
          </ContentSection>

          {/* Upcoming Events */}
          <ContentSection title={`Événements à Venir (${upcomingEvents.length})`}>
            <div className="p-6">
              <UpcomingEvents events={upcomingEvents} maxItems={5} />
            </div>
          </ContentSection>
        </div>

        {/* Activity Feed and Quick Stats */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Projection Section */}
          <div className="lg:col-span-3">
            <ContentSection
              title="Projection (30–90 jours)"
              actions={
                <button
                  onClick={() => setProjectionCollapsed(!isProjectionCollapsed)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isProjectionCollapsed ? "Voir la projection" : "Masquer"}
                </button>
              }
            >
              {!isProjectionCollapsed && (
                <div className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Next 30/60/90 */}
                  <div className="lg:col-span-1 space-y-4">
                    {windowSummaries.map(win => (
                      <div
                        key={win.days}
                        className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50"
                      >
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm font-semibold text-slate-800 dark:text-white">
                            {win.days} jours
                          </span>
                          <span className="text-sm px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {win.count}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {win.highlights.length === 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Rien à signaler
                            </p>
                          )}
                          {win.highlights.map((item, idx) => {
                            const meta = getTypeMeta(item.type);
                            return (
                              <button
                                key={idx}
                                onClick={() => navigate(item.route)}
                                className="w-full text-left p-2 rounded-lg hover:bg-white hover:shadow dark:hover:bg-slate-700 transition"
                              >
                                <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                                  <i className={`${meta.icon} ${meta.color}`}></i>
                                  <span className="truncate">{item.label}</span>
                                </div>
                                <div className="text-xs text-slate-500 dark:text-slate-400">
                                  {formatDate(item.date)} · {meta.label}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Planning Lane */}
                  <div className="lg:col-span-2">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-800 dark:text-white">
                        Planning Lane
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        Prochains événements (8–12 éléments)
                      </span>
                    </div>
                    {laneItems.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        Aucun événement futur détecté.
                      </p>
                    ) : (
                      <div className="overflow-x-auto">
                        <div className="flex gap-3 min-w-max">
                          {laneItems.map((item, idx) => {
                            const meta = getTypeMeta(item.type);
                            return (
                              <button
                                key={idx}
                                onClick={() => navigate(item.route)}
                                className="min-w-[180px] p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:shadow transition"
                              >
                                <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase">
                                    {meta.label}
                                  </span>
                                  <i className={`${meta.icon} ${meta.color}`}></i>
                                </div>
                                <div className="text-base font-semibold text-slate-900 dark:text-white truncate">
                                  {item.label}
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                  {formatDate(item.date)}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ContentSection>
          </div>

          {/* Load Map */}
          <div className="lg:col-span-3">
            <ContentSection
              title="Charge à venir (par semaine)"
              actions={
                <button
                  onClick={() => setLoadMapCollapsed(!isLoadMapCollapsed)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isLoadMapCollapsed ? "Voir la charge" : "Masquer"}
                </button>
              }
            >
              {!isLoadMapCollapsed && (
                <div className="p-6">
                  {loadMapWeeks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      Aucune échéance future détectée.
                    </p>
                  ) : (
                    <div className="flex gap-3 overflow-x-auto">
                      {loadMapWeeks.map((week) => {
                        const heightRatio = week.count / week.maxCount;
                        const barHeight = Math.max(8, Math.round(heightRatio * 64)); // px
                        const intensityClasses =
                          week.intensity === "heavy"
                            ? "bg-indigo-500"
                            : week.intensity === "medium"
                              ? "bg-amber-400"
                              : "bg-emerald-400";
                        const titleParts = Object.entries(week.byType)
                          .map(([t, c]) => `${c} ${getTypeMeta(t).label.toLowerCase()}${c > 1 ? "s" : ""}`)
                          .join(", ");
                        const label = `Semaine ${week.key.split("W")[1]}`;
                        return (
                          <div key={week.key} className="flex flex-col items-center min-w-[80px]">
                            <div
                              className="w-4 rounded-full transition-all"
                              style={{ height: `${barHeight}px` }}
                            >
                              <div
                                className={`w-full h-full rounded-full ${intensityClasses}`}
                                title={titleParts || "Aucune charge"}
                              ></div>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {label}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {week.count} élément{week.count > 1 ? "s" : ""}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </ContentSection>
          </div>

          {/* Recent Activity - takes 2 columns */}
          <div className="lg:col-span-2">
            <ContentSection title="Activité Récente">
              <div className="p-6">
                <ActivityFeed activities={recentActivities} maxItems={6} />
              </div>
            </ContentSection>
          </div>

          {/* Quick Stats Panel */}
          <ContentSection title="Statistiques">
            <div className="p-6 space-y-4">
              {/* Dossiers by Status */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Dossiers par Statut
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "En cours", value: stats.dossiers.active, color: "blue" },
                    { label: "En attente", value: mockDossiers.filter(d => d.status === "En attente").length, color: "amber" },
                    { label: "Fermés", value: mockDossiers.filter(d => d.status === "Terminé").length, color: "green" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-${item.color}-500`}></div>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks by Priority */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    Tâches par Priorité
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Haute", value: mockTasks.filter(t => t.priority === "Haute" && t.status !== "Terminée").length, color: "red" },
                    { label: "Moyenne", value: mockTasks.filter(t => t.priority === "Moyenne" && t.status !== "Terminée").length, color: "amber" },
                    { label: "Basse", value: mockTasks.filter(t => t.priority === "Basse" && t.status !== "Terminée").length, color: "blue" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-${item.color}-500`}></div>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Revenue Status */}
              <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    État des Paiements
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: "Payé", value: mockAccounting.filter(i => i.status === "Payée").length, color: "green" },
                    { label: "En attente", value: mockAccounting.filter(i => i.status === "En attente").length, color: "amber" },
                    { label: "En retard", value: mockAccounting.filter(i => i.status === "En retard").length, color: "red" },
                  ].map((item) => (
                    <div key={item.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full bg-${item.color}-500`}></div>
                        <span className="text-sm text-slate-600 dark:text-slate-400">
                          {item.label}
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-slate-900 dark:text-white">
                        {item.value}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </ContentSection>
        </div>
      </div>
    </PageLayout>
  );
}
