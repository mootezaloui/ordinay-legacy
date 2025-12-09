import { useMemo } from "react";
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
} from "../utils/mockData";

export default function Dashboard() {
  const navigate = useNavigate();

  // Calculate real stats from mock data
  const stats = useMemo(() => {
    const activeClients = mockClients.filter(c => c.status === "Active").length;
    const activeDossiers = mockDossiers.filter(d => d.status === "En cours").length;
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