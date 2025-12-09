import ContentSection from "../../layout/ContentSection";
import { mockOfficersExtended, getStatusColor } from "../../../utils/mockData";

/**
 * Officer (Huissier) Entity Configuration
 */
export const officerConfig = {
  // Basic info
  entityType: "officer",
  entityName: "Huissier",
  icon: "fas fa-user-tie",
  listRoute: "/officers",
  
  // Messages
  notFoundMessage: "Huissier non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cet huissier ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching
  fetchData: async (id) => {
    return mockOfficersExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating officer:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },
  
  deleteData: async (id) => {
    console.log("Deleting officer:", id);
  },
  
  // Header display
  getTitle: (data) => data.name,
  getSubtitle: (data) => `${data.specialization} • ${data.location}`,
  
  // Custom header rendering
  renderHeader: (data) => {
    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
              <i className="fas fa-balance-scale"></i>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.name}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    {data.specialization}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                  {data.status}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <i className="fas fa-phone text-green-600 dark:text-green-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Téléphone</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-envelope text-blue-600 dark:text-blue-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-map-marker-alt text-red-600 dark:text-red-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Localisation</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.location}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    );
  },
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-file-alt",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.cases?.length || 0,
      label: "Dossiers traités"
    },
    {
      icon: "fas fa-check-circle",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.completedCases || 0,
      label: "Terminés"
    },
    {
      icon: "fas fa-star",
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      value: data.rating ? `${data.rating}/5` : "N/A",
      label: "Évaluation"
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
      id: "cases",
      label: "Dossiers",
      icon: "fas fa-folder-open",
      component: "relatedItems",
      getCount: (data) => data.cases?.length || 0,
      
      itemsKey: "cases",
      emptyMessage: "Aucun dossier associé",
      renderItem: (item) => ({
        title: item.caseNumber,
        subtitle: item.title,
        status: item.status,
      }),
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
      title: "Informations Professionnelles",
      fields: [
        { 
          key: "specialization",
          label: "Spécialisation", 
          value: (data) => data.specialization, 
          icon: "fas fa-certificate",
          type: "select",
          editable: true,
          options: [
            { value: "Exécution", label: "Exécution" },
            { value: "Recouvrement", label: "Recouvrement" },
            { value: "Constat", label: "Constat" },
            { value: "Signification", label: "Signification" },
          ]
        },
        { 
          key: "registrationNumber",
          label: "Numéro d'inscription", 
          value: (data) => data.registrationNumber, 
          icon: "fas fa-id-card",
          type: "text",
          editable: true
        },
        { 
          key: "office",
          label: "Étude", 
          value: (data) => data.office, 
          icon: "fas fa-building",
          type: "text",
          editable: true
        },
        { 
          key: "yearsOfExperience",
          label: "Années d'expérience", 
          value: (data) => data.yearsOfExperience ? `${data.yearsOfExperience} ans` : "N/A", 
          icon: "fas fa-calendar",
          type: "number",
          editable: true
        },
      ],
    },
    {
      title: "Coordonnées",
      fields: [
        {
          key: "email",
          label: "Email",
          value: (data) => data.email,
          icon: "fas fa-envelope",
          type: "email",
          editable: true,
          required: true
        },
        {
          key: "phone",
          label: "Téléphone",
          value: (data) => data.phone,
          icon: "fas fa-phone",
          type: "tel",
          editable: true,
          required: true
        },
        {
          key: "alternatePhone",
          label: "Téléphone alternatif",
          value: (data) => data.alternatePhone,
          icon: "fas fa-phone-alt",
          type: "tel",
          editable: true
        },
        {
          key: "location",
          label: "Localisation",
          value: (data) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true
        },
        {
          key: "address",
          label: "Adresse complète",
          value: (data) => data.address,
          icon: "fas fa-map",
          type: "textarea",
          editable: true,
          rows: 2
        },
      ],
    },
    {
      title: "Statut",
      fields: [
        {
          key: "status",
          label: "Statut",
          value: (data) => data.status,
          icon: "fas fa-flag",
          type: "select",
          editable: true,
          options: [
            { value: "Disponible", label: "Disponible" },
            { value: "Occupé", label: "Occupé" },
            { value: "Inactif", label: "Inactif" },
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