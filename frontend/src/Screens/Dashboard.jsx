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
import { getDashboardSummary } from "../services/api/dashboard";

export default function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [isWorkloadCollapsed, setWorkloadCollapsed] = useState(false);
  const [isLoadMapCollapsed, setLoadMapCollapsed] = useState(false);
  const { formatDate: formatDisplayDate } = useSettings();
  const { clients, dossiers, tasks, sessions, cases, missions, financialEntries } = useData();
  const initialSummary = {
    totalClients: 0,
    clientsDelta: 0,
    activeDossiers: 0,
    newDossiersThisWeek: 0,
    pendingTasks: 0,
    tasksDueToday: 0,
    revenue: 0,
    revenueDelta: 0,
  };
  const [summary, setSummary] = useState(initialSummary);
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);

  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      setWorkloadCollapsed(true);
      setLoadMapCollapsed(true);
    }
  }, [sessions, cases, tasks, t]);

  useEffect(() => {
    let isMounted = true;

    const fetchSummary = async () => {
      try {
        setIsLoadingSummary(true);
        const data = await getDashboardSummary();
        if (isMounted) {
          setSummary(data);
        }
      } catch (error) {
        console.error("[Dashboard] Failed to load dashboard summary:", error);
        if (isMounted) {
          setSummary(initialSummary);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSummary(false);
        }
      }
    };

    fetchSummary();

    return () => {
      isMounted = false;
    };
  }, []);

  // Adapt backend summary to UI structure
  const stats = useMemo(() => {
    return {
      clients: {
        total: summary.totalClients,
        trend: summary.clientsDelta,
      },
      dossiers: {
        active: summary.activeDossiers,
        newThisWeek: summary.newDossiersThisWeek,
      },
      tasks: {
        pending: summary.pendingTasks,
        dueToday: summary.tasksDueToday,
      },
      revenue: {
        total: summary.revenue,
        trend: summary.revenueDelta,
      },
    };
  }, [summary]);

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
    const now = new Date();

    // Upcoming sessions
    sessions.forEach(session => {
      const sessionDate = new Date(`${session.date}T${session.time || '00:00'}`);
      if (sessionDate > now) {
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
      if (hearingDate > now) {
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
      if (
        dueDate > now &&
        task.status !== "Done" &&
        task.status !== "Cancelled"
      ) {
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
  }, [sessions, cases, tasks, t]);

  // Get urgent tasks (high priority or due soon)
  const urgentTasks = useMemo(() => {
    const today = new Date();
    const threeDaysFromNow = new Date(today.getTime() + 3 * 24 * 60 * 60 * 1000);

    return tasks
      .filter(task => {
        const dueDate = new Date(task.dueDate);
        return (
          task.status !== "Done" &&
          task.status !== "Cancelled" &&
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

  const DAY_MS = 24 * 60 * 60 * 1000;
  const WORKLOAD_HORIZON_DAYS = 90;

  // Workload health: aggregate future load by bucket and type (tasks, hearings, missions)
  const workloadItems = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const horizon = new Date(startOfToday.getTime() + WORKLOAD_HORIZON_DAYS * DAY_MS);

    const toDate = (dateStr, timeStr) => {
      if (!dateStr) return null;
      const iso = timeStr ? `${dateStr}T${timeStr || "00:00"}` : dateStr;
      const date = new Date(iso);
      if (Number.isNaN(date.getTime())) return null;
      if (date < startOfToday || date > horizon) return null;
      return date;
    };

    const isInactive = (status = "") => ["Done", "Cancelled", "Completed", "Closed"].includes(status);

    const items = [];

    tasks.forEach((task) => {
      if (isInactive(task.status)) return;
      const date = toDate(task.dueDate);
      if (!date) return;
      items.push({ date, type: "task" });
    });

    sessions.forEach((session) => {
      if (isInactive(session.status)) return;
      const date = toDate(session.date, session.time);
      if (!date) return;
      items.push({ date, type: "hearing" });
    });

    cases.forEach((caseItem) => {
      if (isInactive(caseItem.status)) return;
      const date = toDate(caseItem.nextHearing);
      if (!date) return;
      items.push({ date, type: "hearing" });
    });

    Object.values(missions).forEach((officer) => {
      officer.missions?.forEach((mission) => {
        if (isInactive(mission.status)) return;
        const date = toDate(mission.dueDate || mission.plannedDate || mission.assignDate);
        if (!date) return;
        items.push({ date, type: "mission" });
      });
    });

    return items.sort((a, b) => a.date - b.date);
  }, [tasks, sessions, cases, missions]);

  const workloadBuckets = useMemo(() => {
    const bucketDefs = [
      { key: "immediate", min: 0, max: 7, label: t("dashboard.workload.buckets.immediate") },
      { key: "near", min: 8, max: 30, label: t("dashboard.workload.buckets.near") },
      { key: "upcoming", min: 31, max: 90, label: t("dashboard.workload.buckets.upcoming") },
    ];

    const totalsByType = { task: 0, hearing: 0, mission: 0 };
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const buckets = bucketDefs.map((bucket) => ({
      ...bucket,
      total: 0,
      byType: { task: 0, hearing: 0, mission: 0 },
    }));

    workloadItems.forEach((item) => {
      const daysAhead = Math.floor((item.date - startOfToday) / DAY_MS);
      const bucket = buckets.find((b) => daysAhead >= b.min && daysAhead <= b.max);
      if (!bucket) return;
      bucket.total += 1;
      bucket.byType[item.type] = (bucket.byType[item.type] || 0) + 1;
      totalsByType[item.type] = (totalsByType[item.type] || 0) + 1;
    });

    return { buckets, totalsByType };
  }, [workloadItems, t]);

  const workloadTypeLabels = useMemo(
    () => ({
      task: t("dashboard.workload.entities.tasks"),
      hearing: t("dashboard.workload.entities.hearings"),
      mission: t("dashboard.workload.entities.missions"),
    }),
    [t]
  );

  const getLoadLevel = (count) => {
    if (count === 0) return "calm";
    if (count <= 4) return "steady";
    if (count <= 8) return "heavy";
    return "critical";
  };

  const getLevelStyles = (level) => {
    const map = {
      calm: {
        badge: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-200",
        bar: "bg-emerald-500",
      },
      steady: {
        badge: "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200",
        bar: "bg-amber-500",
      },
      heavy: {
        badge: "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-200",
        bar: "bg-orange-500",
      },
      critical: {
        badge: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-200",
        bar: "bg-rose-500",
      },
    };
    return map[level] || map.calm;
  };

  // Rolling weekly buckets starting today (Variant A)
  const loadMapWeeks = useMemo(() => {
    const MAX_WEEKS = 4; // show up to 4 explicit weeks, then aggregate beyond
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const bucketTemplate = Array.from({ length: MAX_WEEKS }, (_v, idx) => {
      const start = new Date(startOfToday.getTime() + idx * 7 * DAY_MS);
      const end = new Date(start.getTime() + 6 * DAY_MS);
      let labelKey = "dashboard.loadMap.week.this";
      if (idx === 1) labelKey = "dashboard.loadMap.week.next";
      if (idx >= 2) labelKey = "dashboard.loadMap.week.inN";

      return {
        key: `week-${idx}`,
        index: idx,
        start,
        end,
        label: idx <= 1 ? t(labelKey) : t(labelKey, { count: idx }),
        range: t("dashboard.loadMap.range", {
          start: formatDisplayDate(start),
          end: formatDisplayDate(end),
        }),
        total: 0,
        byType: {},
      };
    });

    const beyondBucket = {
      key: "beyond",
      index: MAX_WEEKS,
      start: new Date(startOfToday.getTime() + MAX_WEEKS * 7 * DAY_MS),
      end: new Date(startOfToday.getTime() + 12 * 7 * DAY_MS),
      label: t("dashboard.loadMap.week.beyond"),
      range: t("dashboard.loadMap.beyondRange"),
      total: 0,
      byType: {},
    };

    workloadItems.forEach((item) => {
      const daysAhead = Math.floor((item.date - startOfToday) / DAY_MS);
      if (daysAhead < 0) return;
      const weekIndex = Math.floor(daysAhead / 7);
      const bucket = bucketTemplate[weekIndex];
      const target = bucket || beyondBucket;
      target.total += 1;
      target.byType[item.type] = (target.byType[item.type] || 0) + 1;
    });

    const bucketsWithData = bucketTemplate.filter((b, idx) => b.total > 0 || idx === 0);
    const includeBeyond = beyondBucket.total > 0;
    const allBuckets = includeBeyond ? [...bucketsWithData, beyondBucket] : bucketsWithData;
    const hasWorkload = allBuckets.some((b) => b.total > 0);
    if (!hasWorkload) return [];
    const maxCount = allBuckets.reduce((m, b) => Math.max(m, b.total), 0) || 1;

    return allBuckets.map((b) => ({
      ...b,
      maxCount,
      intensity: b.total === 0 ? "light" : b.total <= 2 ? "light" : b.total <= 5 ? "medium" : "heavy",
    }));
  }, [workloadItems, t, formatDisplayDate]);

  const immediateBucket = workloadBuckets.buckets.find((b) => b.key === "immediate") || { total: 0 };
  const immediateLevel = getLoadLevel(immediateBucket.total);
  const immediateStyles = getLevelStyles(immediateLevel);
  const totalWorkloadCount = workloadBuckets.buckets.reduce((sum, bucket) => sum + bucket.total, 0);

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
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" data-tutorial="dashboard-stats">
          <StatCard
            label={t("dashboard.stats.totalClients")}
            value={isLoadingSummary ? "—" : stats.clients.total}
            icon="fas fa-users"
            color="blue"
            trend={isLoadingSummary ? undefined : stats.clients.trend}
            trendLabel={!isLoadingSummary ? t("dashboard.stats.trendVsLastMonth") : undefined}
            onClick={() => navigate("/clients")}
          />

          <StatCard
            label={t("dashboard.stats.activeDossiers")}
            value={isLoadingSummary ? "—" : stats.dossiers.active}
            icon="fas fa-folder-open"
            color="purple"
            trendLabel={
              !isLoadingSummary
                ? t("dashboard.stats.newThisWeek", { count: stats.dossiers.newThisWeek })
                : undefined
            }
            onClick={() => navigate("/dossiers")}
          />

          <StatCard
            label={t("dashboard.stats.pendingTasks")}
            value={isLoadingSummary ? "—" : stats.tasks.pending}
            icon="fas fa-tasks"
            color="amber"
            trendLabel={
              !isLoadingSummary ? t("dashboard.stats.dueToday", { count: stats.tasks.dueToday }) : undefined
            }
            onClick={() => navigate("/tasks")}
          />

          <StatCard
            label={t("dashboard.stats.revenue")}
            value={
              isLoadingSummary
                ? "—"
                : `${stats.revenue.total.toLocaleString('fr-TN')} ${t("dashboard.stats.currency")}`
            }
            icon="fas fa-dollar-sign"
            color="green"
            trend={isLoadingSummary ? undefined : stats.revenue.trend}
            trendLabel={!isLoadingSummary ? t("dashboard.stats.trendVsLastMonth") : undefined}
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
          {/* Workload Health */}
          <div className="lg:col-span-3">
            <ContentSection
              title={t("dashboard.workload.title")}
              actions={
                <button
                  onClick={() => setWorkloadCollapsed(!isWorkloadCollapsed)}
                  className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  {isWorkloadCollapsed ? t("dashboard.workload.show") : t("dashboard.workload.hide")}
                </button>
              }
            >
              {!isWorkloadCollapsed && (
                <div className="p-6 space-y-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {t("dashboard.workload.subtitle")}
                      </p>
                      <p className="text-xs text-slate-400 dark:text-slate-500">
                        {t("dashboard.workload.guiding")}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 px-3 py-1 rounded-full ${immediateStyles.badge}`}>
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {t("dashboard.workload.pressureLabel", {
                          level: t(`dashboard.workload.pressure.${immediateLevel}`),
                        })}
                      </span>
                      <span className="text-[11px] text-slate-600 dark:text-slate-200">
                        {t("dashboard.workload.pressureHint")}
                      </span>
                    </div>
                  </div>

                  {totalWorkloadCount === 0 ? (
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                      {t("dashboard.workload.empty")}
                    </p>
                  ) : (
                    <div className="space-y-4">
                      {workloadBuckets.buckets.map((bucket) => {
                        const level = getLoadLevel(bucket.total);
                        const styles = getLevelStyles(level);
                        const typeOrder = [
                          { key: "task", icon: "fas fa-tasks", color: "text-amber-600" },
                          { key: "hearing", icon: "fas fa-gavel", color: "text-indigo-600" },
                          { key: "mission", icon: "fas fa-user-tie", color: "text-teal-600" },
                        ];

                        return (
                          <div
                            key={bucket.key}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-sm"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">
                                  {bucket.label}
                                </p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">
                                  {t(`dashboard.workload.range.${bucket.key}`)}
                                </p>
                              </div>
                              <span className={`text-xs font-semibold px-2 py-1 rounded-full ${styles.badge}`}>
                                {t(`dashboard.workload.pressure.${level}`)}
                              </span>
                            </div>

                            <div className="mt-3 flex items-center gap-3">
                              <div className="text-3xl font-semibold text-slate-900 dark:text-white">
                                {bucket.total}
                              </div>
                              <div className="flex-1 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                                <div
                                  className={`h-full ${styles.bar}`}
                                  style={{ width: `${Math.min(100, bucket.total * 12)}%` }}
                                ></div>
                              </div>
                            </div>

                            <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {typeOrder.map((type) => (
                                <div
                                  key={type.key}
                                  className="flex items-center justify-between text-sm text-slate-700 dark:text-slate-200"
                                >
                                  <div className="flex items-center gap-2">
                                    <i className={`${type.icon} ${type.color}`}></i>
                                    <span>{workloadTypeLabels[type.key]}</span>
                                  </div>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {t(`dashboard.workload.counts.${type.key}`, {
                                      count: bucket.byType[type.key] || 0,
                                    })}
                                  </span>
                                </div>
                              ))}
                            </div>

                            {bucket.total === 0 && (
                              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                                {t("dashboard.workload.emptyBucket")}
                              </p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </ContentSection>
          </div>

          {/* Weekly Load (rolling) */}
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
                    <div className="space-y-3">
                      {loadMapWeeks.map((week) => {
                        const barWidth = Math.min(100, Math.round((week.total / week.maxCount) * 100));
                        const intensityClasses =
                          week.intensity === "heavy"
                            ? "bg-indigo-500"
                            : week.intensity === "medium"
                              ? "bg-amber-400"
                              : "bg-emerald-400";
                        const typeOrder = [
                          { key: "task", icon: "fas fa-tasks", color: "text-amber-600" },
                          { key: "hearing", icon: "fas fa-gavel", color: "text-indigo-600" },
                          { key: "mission", icon: "fas fa-user-tie", color: "text-teal-600" },
                        ];

                        return (
                          <div
                            key={week.key}
                            className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-sm font-semibold text-slate-800 dark:text-white">{week.label}</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400">{week.range}</p>
                              </div>
                              <span className="text-sm font-semibold text-slate-900 dark:text-white">{week.total}</span>
                            </div>

                            <div className="mt-3 h-2 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                              <div
                                className={`h-full ${intensityClasses}`}
                                style={{ width: `${barWidth}%` }}
                              ></div>
                            </div>

                            <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm text-slate-700 dark:text-slate-200">
                              {typeOrder.map((type) => (
                                <div key={type.key} className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <i className={`${type.icon} ${type.color}`}></i>
                                    <span>{workloadTypeLabels[type.key]}</span>
                                  </div>
                                  <span className="font-semibold text-slate-900 dark:text-white">
                                    {t(`dashboard.workload.counts.${type.key}`, {
                                      count: week.byType[type.key] || 0,
                                    })}
                                  </span>
                                </div>
                              ))}
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
                    {
                      label: t("dashboard.quickStats.dossiers.inProgress"),
                      value: dossiers.filter(d => d.status === "Open" || d.status === "In Progress").length,
                      color: "blue",
                    },
                    {
                      label: t("dashboard.quickStats.dossiers.pending"),
                      value: dossiers.filter(d => d.status === "On Hold").length,
                      color: "amber",
                    },
                    {
                      label: t("dashboard.quickStats.dossiers.closed"),
                      value: dossiers.filter(d => d.status === "Closed").length,
                      color: "green",
                    },
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
                    {
                      label: t("dashboard.quickStats.tasks.high"),
                      value: tasks.filter(t => t.priority === "High" && t.status !== "Done" && t.status !== "Cancelled").length,
                      color: "red",
                    },
                    {
                      label: t("dashboard.quickStats.tasks.medium"),
                      value: tasks.filter(t => t.priority === "Medium" && t.status !== "Done" && t.status !== "Cancelled").length,
                      color: "amber",
                    },
                    {
                      label: t("dashboard.quickStats.tasks.low"),
                      value: tasks.filter(t => t.priority === "Low" && t.status !== "Done" && t.status !== "Cancelled").length,
                      color: "blue",
                    },
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

