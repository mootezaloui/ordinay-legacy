import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "../../../utils/mockData";

/**
 * Personal Task Configuration
 * For non-legal, personal/administrative tasks
 */

// Mock extended data
export const mockPersonalTasksExtended = {
  1: {
    id: 1,
    title: "Payer facture électricité",
    category: "Factures",
    dueDate: "2024-12-15",
    priority: "Haute",
    status: "En attente",
    notes: "Facture du mois de novembre - Montant: 150 TND",
    createdDate: "2024-12-01",
    description: "Paiement mensuel de la facture d'électricité du bureau",
    timeline: [
      {
        type: "created",
        event: "Tâche créée",
        date: "2024-12-01 09:00",
      },
      {
        type: "action",
        event: "Facture reçue par email",
        date: "2024-12-05 14:30",
      },
    ],
    documents: [],
  },
};

export const personalTaskConfig = {
  // Basic info
  entityType: "personalTask",
  entityName: "Tâche Personnelle",
  icon: "fas fa-sticky-note",
  listRoute: "/personal-tasks",
  
  // Messages
  notFoundMessage: "Tâche personnelle non trouvée",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette tâche personnelle ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching
  fetchData: async (id) => {
    return mockPersonalTasksExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating personal task:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },
  
  deleteData: async (id) => {
    console.log("Deleting personal task:", id);
  },
  
  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => `Créée le ${data.createdDate} • ${data.category}`,
  
  // Custom header rendering
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
              value={data.dueDate} 
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
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-calendar-check",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.dueDate,
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
  
  // Tabs configuration
  tabs: [
    {
      id: "overview",
      label: "Vue d'ensemble",
      icon: "fas fa-eye",
      component: "overview",
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
      component: "timeline",
    },
  ],
  
  // Overview tab sections
  overviewSections: [
    {
      title: "Description de la tâche",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Détails",
      fields: [
        { 
          key: "category",
          label: "Catégorie", 
          value: (data) => data.category, 
          icon: "fas fa-tag",
          type: "select",
          editable: true,
          options: [
            { value: "Factures", label: "Factures" },
            { value: "Bureau", label: "Bureau" },
            { value: "Personnel", label: "Personnel" },
            { value: "Informatique", label: "Informatique" },
            { value: "Administratif", label: "Administratif" },
            { value: "Autre", label: "Autre" },
          ]
        },
        { 
          key: "dueDate",
          label: "Date limite", 
          value: (data) => data.dueDate, 
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        { 
          key: "priority",
          label: "Priorité", 
          value: (data) => data.priority, 
          icon: "fas fa-flag",
          type: "select",
          editable: true,
          options: [
            { value: "Haute", label: "Haute" },
            { value: "Moyenne", label: "Moyenne" },
            { value: "Basse", label: "Basse" },
          ]
        },
        { 
          key: "status",
          label: "Statut", 
          value: (data) => data.status, 
          icon: "fas fa-info-circle",
          type: "select",
          editable: true,
          options: [
            { value: "Non commencée", label: "Non commencée" },
            { value: "En attente", label: "En attente" },
            { value: "En cours", label: "En cours" },
            { value: "Planifiée", label: "Planifiée" },
            { value: "Terminée", label: "Terminée" },
          ]
        },
      ],
    },
    {
      title: "Notes",
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
