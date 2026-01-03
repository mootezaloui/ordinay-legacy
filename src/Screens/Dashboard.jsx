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
import { useSettings } from "../contexts/SettingsContext";
import { useData } from "../contexts/DataContext";
import { useTranslation } from "react-i18next";

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isProjectionCollapsed, setProjectionCollapsed] = useState(false);
  const [isLoadMapCollapsed, setLoadMapCollapsed] = useState(false);
  const { formatDate: formatDisplayDate } = useSettings();
  const { clients, dossiers, tasks, sessions, cases, missions, financialEntries } = useData();
  // Temporary aliases to remove mock references
  const mockClients = clients || [];
  const mockDossiers = dossiers || [];
  const mockTasks = tasks || [];
  const mockSessions = sessions || [];
  const mockCases = cases || [];
  const mockAccounting = financialEntries || [];
  const mockOfficersExtended = (missions || []).reduce((acc, m) => {
    const list = acc[m.officerId] || { missions: [] };
    list.missions.push(m);
    acc[m.officerId] = list;
    return acc;
  }, {});

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setProjectionCollapsed(true);
      setLoadMapCollapsed(true);
    }
  }, [sessions, cases, tasks, t]);

  // Calculate real stats from mock data
  const stats = useMemo(() => {
    const activeClients = clients.filter(c => c.status === "Active").length;
    const activeDossiers = dossiers.filter(d => d.status === "Open").length;
    const pendingTasks = tasks.filter(t => t.status !== "Completed").length;
    const todayTasks = tasks.filter(t => t.dueDate === new Date().toISOString().split('T')[0]).length;

    // Calculate revenue (sum of paid invoices)
    const paidInvoices = financialEntries.filter(i => i.status === "Paid");
    const revenue = paidInvoices.reduce((sum, inv) => {
      const amount = parseFloat(inv.amount.replace(/[^0-9.]/g, '')) || 0;
      return sum + amount;
    }, 0);

    return {
      clients: {
        total: clients.length,
        active: activeClients,
        trend: 12, // Mock trend
      },
      dossiers: {
        total: dossiers.length,
        active: activeDossiers,
        newThisWeek: 3, // Mock
      },
      tasks: {
        total: tasks.length,
        pending: pendingTasks,
        dueToday: todayTasks,
      },
      revenue: {
        total: revenue,
        trend: 23, // Mock trend
      },
    };
  }, [clients, dossiers, tasks, financialEntries]);

  // Generate recent activities from data
  const recentActivities = useMemo(() => {
    const activities = [];

    // Recent clients
    clients.slice(0, 2).forEach(client => {
      activities.push({
        id: `client-${client.id}`,
        type: "client",
        title: t("dashboard.activities.newClient", { name: client.name }),
        description: client.email,
        timestamp: client.joinDate || new Date().toISOString(),
        user: "Me. Hammami",
        onClick: () => navigate(`/clients/${client.id}`),
      });
    });

    // Recent dossiers
    dossiers.slice(0, 1).forEach(dossier => {
      activities.push({
        id: `dossier-${dossier.id}`,
        type: "dossier",
        title: t("dashboard.activities.dossierUpdated", { caseNumber: dossier.caseNumber }),
        description: dossier.title,
        timestamp: dossier.openDate || new Date().toISOString(),
        user: "Me. Sassi",
        onClick: () => navigate(`/dossiers/${dossier.id}`),
      });
    });

    // Recent sessions
    sessions.slice(0, 1).forEach(session => {
      activities.push({
        id: `session-${session.id}`,
        type: "session",
        title: t("dashboard.activities.scheduledHearing", { title: session.title }),
        description: t("dashboard.activities.sessionDescription", {
          date: formatDisplayDate(session.date),
          time: session.time,
        }),
        timestamp: new Date().toISOString(),
        user: "Me. Cherif",
        onClick: () => navigate(`/sessions/${session.id}`),
      });
    });

    // Sort by timestamp
    return activities.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  }, [clients, dossiers, sessions, formatDisplayDate, navigate, t]);

  // Get upcoming events
  const upcomingEvents = useMemo(() => {
    const events = [];

    // Upcoming sessions
    sessions.forEach(session => {
      const sessionDate = new Date(`${session.date}T${session.time || '00:00'}`);
      if (sessionDate > new Date()) {
        events.push({
          id: `session-${session.id}`,
          type: session.type === "Audience" ? "hearing" : "session",
          title: t("dashboard.activities.scheduledHearing", { title: session.title }),
          date: sessionDate.toISOString(),
          location: session.location,
          link: `/sessions/${session.id}`,
        });
      }
    });

    // Upcoming hearings from cases
    cases.forEach(caseItem => {
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
    tasks.forEach(task => {
      const dueDate = new Date(task.dueDate);
      if (dueDate > new Date() && task.status !== "Completed") {
        events.push({
          id: `task-${task.id}`,
          type: "deadline",
          title: t("dashboard.activities.deadline", { title: task.title }),
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

    return tasks
      .filter(task => {
        const dueDate = new Date(task.dueDate);
        return (
          task.status !== "Completed" &&
          (task.priority === "High" || dueDate <= threeDaysFromNow)
        );
      })
      .sort((a, b) => {
        // Sort by priority then due date
        const priorityOrder = { High: 0, Medium: 1, Low: 2 };
        const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
        if (priorityDiff !== 0) return priorityDiff;
        return new Date(a.dueDate) - new Date(b.dueDate);
      });
  }, [tasks]);

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
    sessions.forEach(session => {
      pushItem(`${session.date}T${session.time || "00:00"}`, "session", session.title, `/sessions/${session.id}`);
    });

    // Tasks
    tasks.forEach(task => {
      pushItem(task.dueDate, "task", task.title, `/tasks/${task.id}`);
    });

    // Cases: next hearings
    cases.forEach(c => {
      pushItem(c.nextHearing, "case", c.title, `/cases/${c.id}`);
    });

    // Dossiers: next deadline
    dossiers.forEach(d => {
      if (d.nextDeadline) {
        pushItem(d.nextDeadline, "dossier", d.title, `/dossiers/${d.id}`);
      }
    });

    // Financial entries: use dueDate if available, fallback to date
    financialEntries.forEach(entry => {
      const targetDate = entry.dueDate || entry.date;
      const displayText = entry.title || entry.description || t("dashboard.activities.entryTitle", { id: entry.id });
      pushItem(targetDate, "finance", displayText, `/accounting/${entry.id}`);
    });

    // Missions with due dates (from officers)
    Object.values(missions).forEach(officer => {
      officer.missions?.forEach(mission => {
        if (mission.dueDate) {
          pushItem(mission.dueDate, "mission", mission.title, `/missions/${mission.id}`);
        }
      });
    });

    return items.sort((a, b) => a.date - b.date);
  }, [sessions, tasks, cases, dossiers, financialEntries, missions, t]);

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
      session: { key: "session", icon: "fas fa-gavel", color: "text-purple-600" },
      task: { key: "task", icon: "fas fa-tasks", color: "text-amber-600" },
      case: { key: "case", icon: "fas fa-scale-balanced", color: "text-blue-600" },
      dossier: { key: "dossier", icon: "fas fa-folder-open", color: "text-green-600" },
      finance: { key: "finance", icon: "fas fa-file-invoice-dollar", color: "text-emerald-600" },
      mission: { key: "mission", icon: "fas fa-user-tie", color: "text-teal-600" },
    };
    const base = map[type] || { key: "generic", icon: "fas fa-calendar", color: "text-slate-500" };
    const labelKey = `dashboard.types.${base.key}`;
    const label =
      base.key === "generic"
        ? t(labelKey, { type })
        : t(labelKey);
    return { ...base, label };
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
        title={t("dashboard.title")}
        subtitle={t("dashboard.subtitle")}
        icon="fas fa-chart-line"
      />

      <div className="space-y-6">
        {/* Quick Actions */}
        <ContentSection>
          <div className="p-6">
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
              {t("dashboard.quickActions.title")}
            </h2>
            <QuickActions />
          </div>
        </ContentSection>

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label={t("dashboard.stats.totalClients")}
            value={stats.clients.total}
            icon="fas fa-users"
            color="blue"
            trend={stats.clients.trend}
            trendLabel={t("dashboard.stats.trendVsLastMonth")}
            onClick={() => navigate("/clients")}
          />

          <StatCard
            label={t("dashboard.stats.activeDossiers")}
            value={stats.dossiers.active}
            icon="fas fa-folder-open"
            color="purple"
            trendLabel={t("dashboard.stats.newThisWeek", { count: stats.dossiers.newThisWeek })}
            onClick={() => navigate("/dossiers")}
          />

          <StatCard
            label={t("dashboard.stats.pendingTasks")}
            value={stats.tasks.pending}
            icon="fas fa-tasks"
            color="amber"
            trendLabel={t("dashboard.stats.dueToday", { count: stats.tasks.dueToday })}
            onClick={() => navigate("/tasks")}
          />

          <StatCard
            label={t("dashboard.stats.revenue")}
            value={`${stats.revenue.total.toLocaleString('fr-TN')} ${t("dashboard.stats.currency")}`}
            icon="fas fa-dollar-sign"
            color="green"
            trend={stats.revenue.trend}
            trendLabel={t("dashboard.stats.trendVsLastMonth")}
            onClick={() => navigate("/accounting")}
          />
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Urgent Tasks */}
          <ContentSection title={t("dashboard.urgentTasks.title", { count: urgentTasks.length })}>
            <div className="p-6">
              <TaskList tasks={urgentTasks} maxItems={5} />
            </div>
          </ContentSection>

          {/* Upcoming Events */}
          <ContentSection title={t("dashboard.upcomingEvents.title", { count: upcomingEvents.length })}>
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
              title={t("dashboard.projection.title")}
              actions={
                <button
                  onClick={() => setProjectionCollapsed(!isProjectionCollapsed)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isProjectionCollapsed ? t("dashboard.projection.show") : t("dashboard.projection.hide")}
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
                            {t("dashboard.projection.daysLabel", { count: win.days })}
                          </span>
                          <span className="text-sm px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                            {win.count}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {win.highlights.length === 0 && (
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              {t("dashboard.projection.nothing")}
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
                                  {t("dashboard.projection.itemMeta", {
                                    date: formatDate(item.date),
                                    label: meta.label,
                                  })}
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
                        {t("dashboard.planningLane.title")}
                      </h3>
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        {t("dashboard.planningLane.subtitle")}
                      </span>
                    </div>
                    {laneItems.length === 0 ? (
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t("dashboard.planningLane.empty")}
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
              title={t("dashboard.loadMap.title")}
              actions={
                <button
                  onClick={() => setLoadMapCollapsed(!isLoadMapCollapsed)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isLoadMapCollapsed ? t("dashboard.loadMap.show") : t("dashboard.loadMap.hide")}
                </button>
              }
            >
              {!isLoadMapCollapsed && (
                <div className="p-6">
                  {loadMapWeeks.length === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t("dashboard.loadMap.empty")}
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
                          .map(([typeKey, count]) =>
                            t("dashboard.loadMap.tooltipType", {
                              count,
                              type: getTypeMeta(typeKey).label,
                            })
                          )
                          .join(", ");
                        const tooltip = titleParts || t("dashboard.loadMap.tooltipNone");
                        const label = t("dashboard.loadMap.weekLabel", { week: week.key.split("W")[1] });
                        return (
                          <div key={week.key} className="flex flex-col items-center min-w-[80px]">
                            <div
                              className="w-4 rounded-full transition-all"
                              style={{ height: `${barHeight}px` }}
                            >
                              <div
                                className={`w-full h-full rounded-full ${intensityClasses}`}
                                title={tooltip}
                              ></div>
                            </div>
                            <div className="mt-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
                              {label}
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                              {t("dashboard.loadMap.itemsCount", { count: week.count })}
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
            <ContentSection title={t("dashboard.recentActivity.title")}>
              <div className="p-6">
                <ActivityFeed activities={recentActivities} maxItems={6} />
              </div>
            </ContentSection>
          </div>

          {/* Quick Stats Panel */}
          <ContentSection title={t("dashboard.quickStats.title")}>
            <div className="p-6 space-y-4">
              {/* Dossiers by Status */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                    {t("dashboard.quickStats.dossiers.title")}
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: t("dashboard.quickStats.dossiers.inProgress"), value: stats.dossiers.active, color: "blue" },
                    { label: t("dashboard.quickStats.dossiers.pending"), value: dossiers.filter(d => d.status === "En Pending").length, color: "amber" },
                    { label: t("dashboard.quickStats.dossiers.closed"), value: dossiers.filter(d => d.status === "Closed").length, color: "green" },
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
                    {t("dashboard.quickStats.tasks.title")}
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: t("dashboard.quickStats.tasks.high"), value: tasks.filter(t => t.priority === "High" && t.status !== "Completed").length, color: "red" },
                    { label: t("dashboard.quickStats.tasks.medium"), value: tasks.filter(t => t.priority === "Medium" && t.status !== "Completed").length, color: "amber" },
                    { label: t("dashboard.quickStats.tasks.low"), value: tasks.filter(t => t.priority === "Low" && t.status !== "Completed").length, color: "blue" },
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
                    {t("dashboard.quickStats.payments.title")}
                  </span>
                </div>
                <div className="space-y-2">
                  {[
                    { label: t("dashboard.quickStats.payments.paid"), value: financialEntries.filter(i => i.status === "Paid").length, color: "green" },
                    { label: t("dashboard.quickStats.payments.pending"), value: financialEntries.filter(i => i.status === "Pending").length, color: "amber" },
                    { label: t("dashboard.quickStats.payments.overdue"), value: financialEntries.filter(i => i.status === "Overdue").length, color: "red" },
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

