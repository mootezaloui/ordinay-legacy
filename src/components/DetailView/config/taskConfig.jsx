import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockTasksExtended, mockDossiers, mockCases, getStatusColor } from "../../../utils/mockData";

/**
 * Task Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, assignedTo
 * ✅ Added structured edit mode for overview sections
 * ✅ UPDATED: Tasks can now belong to EITHER Dossier OR Case (Procès)
 */
export const taskConfig = {
  // Basic info
  entityType: "task",
  entityName: "Tâche",
  icon: "fas fa-tasks",
  listRoute: "/tasks",

  // Messages
  notFoundMessage: "Tâche non trouvée",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette tâche ?",

  // Permissions
  allowDelete: true,
  allowEdit: true,

  // Data fetching
  fetchData: async (id) => {
    return mockTasksExtended[id] || null;
  },

  updateData: async (id, data) => {
    console.log("Updating task:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id) => {
    console.log("Deleting task:", id);
  },

  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => `Créée le ${data.createdDate}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Non commencée", label: "Non commencée", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
        { value: "En cours", label: "En cours", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "En attente", label: "En attente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
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
      key: "assignedTo",
      label: "Assigné à",
      icon: "fas fa-user",
      colorMap: false,
      options: [
        { value: "Me. Hammami", label: "Me. Hammami" },
        { value: "Me. Ben Ali", label: "Me. Ben Ali" },
        { value: "Me. Trabelsi", label: "Me. Trabelsi" },
      ]
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    const priorityColor = {
      "Haute": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      "Moyenne": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Basse": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    };

    // Determine parent link based on parentType
    const parentLink = data.parentType === "case" && data.case
      ? (
        <Link
          to={`/cases/${data.case.id}`}
          className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
        >
          <i className="fas fa-gavel"></i>
          {data.case.caseNumber} - {data.case.title}
        </Link>
      )
      : data.dossier
        ? (
          <Link
            to={`/dossiers/${data.dossier.id}`}
            className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
          >
            <i className="fas fa-folder-open"></i>
            {data.dossier.caseNumber} - {data.dossier.title}
          </Link>
        )
        : null;

    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {data.title}
              </h2>
              {parentLink}
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColor[data.priority]}`}>
                Priorité {data.priority}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard icon="fas fa-user" label="Assigné à" value={data.assignedTo} color="blue" />
            <InfoCard icon="fas fa-calendar" label="Date limite" value={data.dueDate} color="red" />
            <InfoCard icon="fas fa-clock" label="Temps estimé" value={data.estimatedTime || "N/A"} color="purple" />
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
      icon: "fas fa-user-check",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.assignedTo,
      label: "Assigné"
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
      id: "financial",
      label: "Comptabilité",
      icon: "fas fa-coins",
      component: "financial",
      description: "Suivi financier lié à cette tâche"
    },
    {
      id: "documents",
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "comments",
      label: "Commentaires",
      icon: "fas fa-comments",
      component: "notes",
      getCount: (data) => data.comments?.length || 0,
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "timeline",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy and parent selection
  overviewSections: [
    {
      title: "Description de la tâche",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Détails de la tâche",
      editStrategy: "structured",
      fields: [
        {
          key: "dueDate",
          label: "Date d'échéance",
          value: (data) => data.dueDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "estimatedTime",
          label: "Temps estimé",
          value: (data) => data.estimatedTime || "N/A",
          icon: "fas fa-clock",
          type: "text",
          editable: true,
          placeholder: "Ex: 2h"
        },
      ],
    },
    {
      title: "Entité associée",
      editStrategy: "structured",
      fields: [
        {
          key: "parentType",
          label: "Type de lien",
          value: (data) => data.parentType || "dossier",
          icon: "fas fa-link",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "dossier", label: "Dossier" },
            { value: "case", label: "Procès" },
          ],
          helpText: "Une tâche peut être liée à un dossier ou à un procès"
        },
        {
          key: "dossierId",
          label: "Dossier",
          value: (data) => data.dossierId || "",
          displayValue: (data) => data.dossier ? `${data.dossier.caseNumber} - ${data.dossier.title}` : "Aucun",
          icon: "fas fa-folder-open",
          type: "searchable-select",
          editable: true,
          options: [
            { value: "", label: "Sélectionner un dossier..." },
            ...mockDossiers.map(d => ({
              value: d.id,
              label: `${d.caseNumber} - ${d.title}`
            }))
          ],
          helpText: "Sélectionner le dossier concerné"
        },
        {
          key: "caseId",
          label: "Procès",
          value: (data) => data.caseId || "",
          displayValue: (data) => data.case ? `${data.case.caseNumber} - ${data.case.title}` : "Aucun",
          icon: "fas fa-gavel",
          type: "searchable-select",
          editable: true,
          options: [
            { value: "", label: "Sélectionner un procès..." },
            ...mockCases.map(c => ({
              value: c.id,
              label: `${c.caseNumber} - ${c.title}`
            }))
          ],
          helpText: "Sélectionner le procès concerné"
        },
      ],
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
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