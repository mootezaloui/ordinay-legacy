import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockDossiersExtended, getStatusColor } from "../../../utils/mockData";
// ⭐ Import existing form configs
import { taskFormFields } from "../../FormModal/formConfigs";

/**
 * Dossier Entity Configuration
 * Uses existing FormModal and formConfigs - NO DUPLICATION!
 */
export const dossierConfig = {
  // Basic info
  entityType: "dossier",
  entityName: "Dossier",
  icon: "fas fa-folder-open",
  listRoute: "/dossiers",
  
  // Messages
  notFoundMessage: "Dossier non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer ce dossier ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching
  fetchData: async (id) => {
    return mockDossiersExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating dossier:", id, data);
  },
  
  deleteData: async (id) => {
    console.log("Deleting dossier:", id);
  },
  
  // Header display
  getTitle: (data) => data.caseNumber,
  getSubtitle: (data) => data.title,
  
  // Custom header rendering
  renderHeader: (data) => {
    const priorityColor = {
      "Haute": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      "Moyenne": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Basse": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    };

    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {data.title}
              </h2>
              <Link
                to={`/clients/${data.client.id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
              >
                <i className="fas fa-user"></i>
                {data.client.name}
              </Link>
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-calendar" label="Date d'ouverture" value={data.openDate} color="blue" />
            <InfoCard icon="fas fa-layer-group" label="Catégorie" value={data.category} color="purple" />
            <InfoCard icon="fas fa-user-tie" label="Avocat assigné" value={data.assignedLawyer} color="green" />
            <InfoCard icon="fas fa-clock" label="Prochaine échéance" value={data.nextDeadline} color="amber" />
          </div>
        </div>
      </ContentSection>
    );
  },
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-file",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.documents?.length || 0,
      label: "Documents"
    },
    {
      icon: "fas fa-tasks",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.tasks?.length || 0,
      label: "Tâches"
    },
    {
      icon: "fas fa-sticky-note",
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      value: data.notes?.length || 0,
      label: "Notes"
    },
    {
      icon: "fas fa-gavel",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.proceedings?.length || 0,
      label: "Procédures"
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
      id: "tasks",
      label: "Tâches",
      icon: "fas fa-tasks",
      component: "relatedItems",
      getCount: (data) => data.tasks?.length || 0,
      
      itemsKey: "tasks",
      emptyMessage: "Aucune tâche",
      renderItem: (item) => ({
        title: item.title,
        subtitle: `Échéance: ${item.dueDate} | Assigné à: ${item.assignee}`,
        status: item.status,
      }),
      
      // ⭐ ADD functionality - Uses existing taskFormFields!
      allowAdd: true,
      allowDelete: true,
      entityName: "une tâche",
      addSubtitle: "Créer une nouvelle tâche pour ce dossier",
      formFields: taskFormFields.filter(field => field.name !== 'dossierId'), // Remove dossier selector since we're in dossier context
    },
    {
      id: "proceedings",
      label: "Procédures",
      icon: "fas fa-gavel",
      component: "relatedItems",
      getCount: (data) => data.proceedings?.length || 0,
      
      itemsKey: "proceedings",
      emptyMessage: "Aucune procédure",
      renderItem: (item) => ({
        title: item.caseNumber,
        subtitle: `${item.title} - Prochaine audience: ${item.nextHearing}`,
        status: item.status,
      }),
      
      // ⭐ Procedure form - defined inline (not in formConfigs yet)
      allowAdd: true,
      allowDelete: true,
      entityName: "une procédure",
      addSubtitle: "Créer une nouvelle procédure pour ce dossier",
      formFields: [
        {
          name: "caseNumber",
          label: "Numéro de procédure",
          type: "text",
          required: true,
          placeholder: "PROC-2024-XXX"
        },
        {
          name: "title",
          label: "Titre",
          type: "text",
          required: true,
          fullWidth: true,
          placeholder: "Ex: Audience préliminaire"
        },
        {
          name: "court",
          label: "Tribunal",
          type: "select",
          required: true,
          options: [
            { value: "Tribunal de première instance", label: "Tribunal de première instance" },
            { value: "Cour d'appel", label: "Cour d'appel" },
            { value: "Cour de cassation", label: "Cour de cassation" },
            { value: "Tribunal administratif", label: "Tribunal administratif" },
          ]
        },
        {
          name: "nextHearing",
          label: "Prochaine audience",
          type: "date",
          required: true,
        },
        {
          name: "judge",
          label: "Juge",
          type: "text",
          placeholder: "Nom du juge"
        },
        {
          name: "status",
          label: "Statut",
          type: "select",
          required: true,
          defaultValue: "En cours",
          options: [
            { value: "En cours", label: "En cours" },
            { value: "En attente", label: "En attente" },
            { value: "Terminée", label: "Terminée" },
            { value: "Suspendue", label: "Suspendue" },
          ]
        },
        {
          name: "notes",
          label: "Notes",
          type: "textarea",
          fullWidth: true,
          rows: 3,
          placeholder: "Notes sur la procédure..."
        },
      ],
    },
    {
      id: "notes",
      label: "Notes",
      icon: "fas fa-sticky-note",
      component: "notes",
      getCount: (data) => data.notes?.length || 0,
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "timeline",
    },
    {
      id: "financials",
      label: "Finances",
      icon: "fas fa-dollar-sign",
      component: "financials",
    },
  ],
  
  // Overview tab sections
  overviewSections: [
    {
      title: "Description du dossier",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description,
    },
    {
      title: "Partie Adverse",
      fields: [
        { 
          key: "adversaryParty",
          label: "Nom", 
          value: (data) => data.adversaryParty, 
          icon: "fas fa-user",
          type: "text",
          editable: true
        },
        { 
          key: "adversaryLawyer",
          label: "Avocat", 
          value: (data) => data.adversaryLawyer, 
          icon: "fas fa-gavel",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Informations Juridiques",
      fields: [
        { 
          key: "courtReference",
          label: "Référence tribunal", 
          value: (data) => data.courtReference, 
          icon: "fas fa-balance-scale",
          type: "text",
          editable: true
        },
        { 
          key: "estimatedValue",
          label: "Valeur estimée", 
          value: (data) => data.estimatedValue, 
          icon: "fas fa-money-bill-wave",
          type: "text",
          editable: true
        },
      ],
    },
  ],
  
  // Financial data
  getFinancials: (data) => data.financials,
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
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