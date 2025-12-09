import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockCasesExtended, getStatusColor } from "../../../utils/mockData";

/**
 * Case (Procès) Entity Configuration
 */
export const caseConfig = {
  // Basic info
  entityType: "case",
  entityName: "Procès",
  icon: "fas fa-gavel",
  listRoute: "/cases",
  
  // Messages
  notFoundMessage: "Procès non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer ce procès ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching
  fetchData: async (id) => {
    return mockCasesExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating case:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },
  
  deleteData: async (id) => {
    console.log("Deleting case:", id);
  },
  
  // Header display
  getTitle: (data) => data.caseNumber,
  getSubtitle: (data) => data.title,
  
  // Custom header rendering
  renderHeader: (data) => {
    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {data.title}
              </h2>
              <Link
                to={`/dossiers/${data.dossier.id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
              >
                <i className="fas fa-folder-open"></i>
                {data.dossier.caseNumber} - {data.dossier.title}
              </Link>
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
              {data.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-landmark" label="Tribunal" value={data.court} color="purple" />
            <InfoCard icon="fas fa-calendar-alt" label="Prochaine audience" value={data.nextHearing} color="red" />
            <InfoCard icon="fas fa-balance-scale" label="Juge" value={data.judge} color="blue" />
            <InfoCard icon="fas fa-user-tie" label="Avocat adverse" value={data.adversaryLawyer} color="amber" />
          </div>
        </div>
      </ContentSection>
    );
  },
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-calendar-check",
      iconColor: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/20",
      value: data.nextHearing,
      label: "Prochaine audience"
    },
    {
      icon: "fas fa-file",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.documents?.length || 0,
      label: "Documents"
    },
    {
      icon: "fas fa-history",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.hearings?.length || 0,
      label: "Audiences"
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
      id: "hearings",
      label: "Audiences",
      icon: "fas fa-calendar-alt",
      component: "relatedItems",
      getCount: (data) => data.hearings?.length || 0,
      
      itemsKey: "hearings",
      emptyMessage: "Aucune audience programmée",
      renderItem: (item) => ({
        title: `Audience du ${item.date}`,
        subtitle: `${item.time} - ${item.type}`,
        status: item.status,
      }),
      
      allowAdd: true,
      allowDelete: true,
      entityName: "une audience",
      formFields: [
        {
          name: "date",
          label: "Date",
          type: "date",
          required: true,
        },
        {
          name: "time",
          label: "Heure",
          type: "text",
          required: true,
          placeholder: "10:00"
        },
        {
          name: "type",
          label: "Type d'audience",
          type: "select",
          required: true,
          options: [
            { value: "Préliminaire", label: "Préliminaire" },
            { value: "Instruction", label: "Instruction" },
            { value: "Plaidoirie", label: "Plaidoirie" },
            { value: "Délibéré", label: "Délibéré" },
            { value: "Jugement", label: "Jugement" },
          ]
        },
        {
          name: "location",
          label: "Salle",
          type: "text",
          placeholder: "Ex: Salle 3"
        },
        {
          name: "status",
          label: "Statut",
          type: "select",
          required: true,
          defaultValue: "Programmée",
          options: [
            { value: "Programmée", label: "Programmée" },
            { value: "Terminée", label: "Terminée" },
            { value: "Reportée", label: "Reportée" },
            { value: "Annulée", label: "Annulée" },
          ]
        },
        {
          name: "notes",
          label: "Notes",
          type: "textarea",
          rows: 3,
        },
      ],
    },
    {
      id: "documents",
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "notes",
      label: "Notes",
      icon: "fas fa-sticky-note",
      component: "notes",
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
      title: "Description du procès",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Informations du tribunal",
      fields: [
        { 
          key: "court",
          label: "Tribunal", 
          value: (data) => data.court, 
          icon: "fas fa-landmark",
          type: "select",
          editable: true,
          options: [
            { value: "Tribunal de première instance", label: "Tribunal de première instance" },
            { value: "Cour d'appel", label: "Cour d'appel" },
            { value: "Cour de cassation", label: "Cour de cassation" },
          ]
        },
        { 
          key: "judge",
          label: "Juge", 
          value: (data) => data.judge, 
          icon: "fas fa-balance-scale",
          type: "text",
          editable: true
        },
        { 
          key: "courtRoom",
          label: "Salle", 
          value: (data) => data.courtRoom, 
          icon: "fas fa-door-open",
          type: "text",
          editable: true
        },
        { 
          key: "referenceNumber",
          label: "Numéro de référence", 
          value: (data) => data.referenceNumber, 
          icon: "fas fa-hashtag",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Dates importantes",
      fields: [
        { 
          key: "filingDate",
          label: "Date de dépôt", 
          value: (data) => data.filingDate, 
          icon: "fas fa-calendar-plus",
          type: "date",
          editable: true
        },
        { 
          key: "nextHearing",
          label: "Prochaine audience", 
          value: (data) => data.nextHearing, 
          icon: "fas fa-calendar-alt",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Parties",
      fields: [
        { 
          key: "adversaryParty",
          label: "Partie adverse", 
          value: (data) => data.adversaryParty, 
          icon: "fas fa-user",
          type: "text",
          editable: true
        },
        { 
          key: "adversaryLawyer",
          label: "Avocat adverse", 
          value: (data) => data.adversaryLawyer, 
          icon: "fas fa-user-tie",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Statut",
      fields: [
        { 
          key: "status",
          label: "Statut du procès", 
          value: (data) => data.status, 
          icon: "fas fa-info-circle",
          type: "select",
          editable: true,
          options: [
            { value: "En cours", label: "En cours" },
            { value: "En attente", label: "En attente" },
            { value: "Suspendu", label: "Suspendu" },
            { value: "Clos", label: "Clos" },
          ]
        },
      ],
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
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