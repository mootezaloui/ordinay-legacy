import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";

/**
 * Personal Task Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, category
 * ✅ Added structured edit mode for overview sections
 */

export const personalTaskConfig = {
  entityType: "personalTask",
  entityName: "Tâche Personnelle",
  icon: "fas fa-sticky-note",
  listRoute: "/personal-tasks",
  notFoundMessage: "Tâche personnelle non trouvée",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette tâche personnelle ?",
  allowDelete: true,
  allowEdit: true,

  fetchData: async (id, contextData = null) => {
    // Convert id to number for comparison
    const numericId = parseInt(id);

    let personalTask;
    if (contextData?.personalTasks) {
      // Use contextData.personalTasks from DataContext (this is the live data)
      personalTask = contextData.personalTasks.find(pt => pt.id === numericId);
    } else {
      // Fallback to mockPersonalTasksExtended (static data)
      personalTask = mockPersonalTasksExtended[numericId];
    }
    return personalTask || null;
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updatePersonalTask) {
      // Use DataContext to update (this persists to localStorage and API)
      await contextData.updatePersonalTask(numericId, data);
    } else {
      // Fallback to updating mockPersonalTasksExtended
      if (mockPersonalTasksExtended[numericId]) {
        mockPersonalTasksExtended[numericId] = {
          ...mockPersonalTasksExtended[numericId],
          ...data,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.deletePersonalTask) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deletePersonalTask(numericId);
    } else {
      console.log("Deleting personal task:", numericId);
    }
  },

  getTitle: (data) => data.title,
  getSubtitle: (data) => `Créée le ${data.createdDate} • ${data.category}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Non commencée", label: "Non commencée", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
        { value: "En attente", label: "En attente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "En cours", label: "En cours", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Planifiée", label: "Planifiée", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
        { value: "Terminée", label: "Terminée", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
      ]
    },
    {
      key: "priority",
      label: "Priorité",
      icon: "fas fa-flag",
      colorMap: true,
      options: [
        { value: "Haute", label: "Haute", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
        { value: "Moyenne", label: "Moyenne", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Basse", label: "Basse", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
      ]
    },
    {
      key: "category",
      label: "Catégorie",
      icon: "fas fa-tag",
      colorMap: false,
      options: [
        { value: "Factures", label: "Factures" },
        { value: "Bureau", label: "Bureau" },
        { value: "Personnel", label: "Personnel" },
        { value: "Informatique", label: "Informatique" },
        { value: "Administratif", label: "Administratif" },
        { value: "Autre", label: "Autre" },
      ]
    }
  ],

  renderHeader: (data) => {
    const priorityConfig = {
      "Haute": {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-800 dark:text-red-400",
        icon: "fas fa-arrow-up",
      },
      "Moyenne": {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-800 dark:text-amber-400",
        icon: "fas fa-minus",
      },
      "Basse": {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-800 dark:text-green-400",
        icon: "fas fa-arrow-down",
      },
    };

    const categoryIcons = {
      "Factures": "fas fa-file-invoice-dollar text-green-600",
      "Bureau": "fas fa-briefcase text-blue-600",
      "Personnel": "fas fa-user text-purple-600",
      "Informatique": "fas fa-laptop text-indigo-600",
      "Administratif": "fas fa-clipboard text-slate-600",
      "Autre": "fas fa-sticky-note text-amber-600",
    };

    const priority = priorityConfig[data.priority];

    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xl flex-shrink-0">
                <i className={categoryIcons[data.category] || "fas fa-sticky-note"}></i>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {data.title}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  <i className="fas fa-tag mr-2"></i>
                  {data.category}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${priority.bg} ${priority.text}`}>
                <i className={priority.icon}></i>
                Priorité {data.priority}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard
              icon="fas fa-calendar-alt"
              label="Date limite"
              value={data.dueDate || "N/A"}
              color="blue"
            />
            <InfoCard
              icon="fas fa-flag"
              label="Priorité"
              value={data.priority}
              color={data.priority === "Haute" ? "red" : data.priority === "Moyenne" ? "amber" : "green"}
            />
            <InfoCard
              icon="fas fa-info-circle"
              label="Statut"
              value={data.status}
              color="purple"
            />
          </div>
        </div>
      </ContentSection>
    );
  },

  getStats: (data) => [
    {
      icon: "fas fa-calendar-check",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.dueDate || "N/A",
      label: "Échéance"
    },
    {
      icon: "fas fa-tag",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.category,
      label: "Catégorie"
    },
    {
      icon: "fas fa-flag",
      iconColor: data.priority === "Haute" ? "text-red-600 dark:text-red-400" :
        data.priority === "Moyenne" ? "text-amber-600 dark:text-amber-400" :
          "text-green-600 dark:text-green-400",
      bgColor: data.priority === "Haute" ? "bg-red-100 dark:bg-red-900/20" :
        data.priority === "Moyenne" ? "bg-amber-100 dark:bg-amber-900/20" :
          "bg-green-100 dark:bg-green-900/20",
      value: data.priority,
      label: "Priorité"
    },
  ],

  tabs: [
    {
      id: "overview",
      label: "Vue d'ensemble",
      icon: "fas fa-eye",
      component: "overview",
    },
    {
      id: "financial",
      label: "Comptabilité",
      icon: "fas fa-coins",
      component: "financial",
      description: "Frais de bureau et dépenses internes liés à cette tâche"
    },
    {
      id: "documents",
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "history",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "Informations générales",
      editStrategy: "structured",
      fields: [
        {
          key: "title",
          label: "Titre de la tâche",
          value: (data) => data.title,
          icon: "fas fa-sticky-note",
          type: "text",
          editable: true,
          required: true,
          fullWidth: true,
        },
        {
          key: "dueDate",
          label: "Date limite",
          value: (data) => data.dueDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Description de la tâche",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Notes",
      editStrategy: "structured",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "Aucune note",
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
  };

  return (
    <div className="flex items-center gap-3">
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <i className={icon}></i>
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{value}</p>
      </div>
    </div>
  );
}
