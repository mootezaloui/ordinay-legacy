import ContentSection from "../../layout/ContentSection";
import { missionFormFields } from "../../FormModal/formConfigs";
import { mockOfficersExtended, mockDossiers, mockCases, getStatusColor } from "../../../utils/mockData";

/**
 * Officer (Huissier) Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Dynamic entity selection based on "Lié à" dropdown
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
    // ✅ Actually update the officer data in mockOfficersExtended
    if (mockOfficersExtended[id]) {
      mockOfficersExtended[id] = {
        ...mockOfficersExtended[id],
        ...data,
      };
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id) => {
    console.log("Deleting officer:", id);
  },

  // Header display
  getTitle: (data) => data.name,
  getSubtitle: (data) => data.location,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-flag",
      colorMap: true,
      options: [
        { value: "Disponible", label: "Disponible", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Occupé", label: "Occupé", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Inactif", label: "Inactif", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ]
    }
  ],

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
                    Huissier de Justice
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
      icon: "fas fa-clipboard-check",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.missions?.length || 0,
      label: "Total missions"
    },
    {
      icon: "fas fa-spinner",
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      value: data.missions?.filter(m => m.status === "En cours" || m.status === "Programmée").length || 0,
      label: "En cours"
    },
    {
      icon: "fas fa-check-circle",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.missions?.filter(m => m.status === "Terminée").length || 0,
      label: "Terminées"
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
      id: "missions",
      label: "Missions",
      icon: "fas fa-clipboard-check",
      component: "missions",
      getCount: (data) => data.missions?.length || 0,

      itemsKey: "missions",
      emptyMessage: "Aucune mission assignée à cet huissier",

      allowAdd: true,
      allowDelete: true,
      entityName: "une mission",
      addSubtitle: "Assigner une nouvelle mission à cet huissier",

      // ✅ UPDATED: Use same getFormFields pattern as dossier and case
      getFormFields: (officerData) => {
        // Generate a default mission number
        const year = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const defaultMissionNumber = `MIS-${year}-${randomNum}`;

        const fields = missionFormFields.map(field => {
          // Pre-fill and disable officerId with current officer
          if (field.name === 'officerId') {
            return {
              ...field,
              defaultValue: officerData.id,
              disabled: true,
              helpText: `Cette mission sera assignée à ${officerData.name}`,
            };
          }
          // Auto-generate mission number
          if (field.name === 'missionNumber') {
            return {
              ...field,
              defaultValue: defaultMissionNumber,
              disabled: true,
            };
          }
          // Enable entityType (not disabled) for officer selection
          if (field.name === 'entityType') {
            return {
              ...field,
              disabled: false, // Allow selection for officers
              helpText: "Sélectionner si cette mission concerne un dossier ou un procès",
            };
          }
          // Enable entityReference (not disabled) for officer selection
          if (field.name === 'entityReference') {
            return {
              ...field,
              disabled: false, // Allow selection for officers
              type: 'searchable-select', // Make it searchable
              helpText: "Sélectionnez le dossier ou procès pour cette mission",
              getOptions: (formData) => {
                const entityType = formData.entityType;

                if (entityType === 'dossier') {
                  return mockDossiers.map(d => ({
                    value: d.caseNumber,
                    label: `${d.caseNumber} - ${d.title}`,
                  }));
                } else if (entityType === 'case') {
                  return mockCases.map(c => ({
                    value: c.caseNumber,
                    label: `${c.caseNumber} - ${c.title}`,
                  }));
                }

                return [];
              },
            };
          }
          return field;
        });

        // ✅ Add officer-specific fields after standard mission fields
        return [
          ...fields,
          {
            name: "result",
            label: "Résultat / Réponse",
            type: "textarea",
            placeholder: "Compte-rendu de l'huissier après exécution de la mission...",
            required: false,
            fullWidth: true,
            rows: 4,
            helpText: "Important: Enregistrer ce que l'huissier a rapporté",
          },
        ];
      },
    },
    {
      id: "cases",
      label: "Affaires liées",
      icon: "fas fa-folder-open",
      component: "relatedItems",
      getCount: (data) => data.cases?.length || 0,

      itemsKey: "cases",
      emptyMessage: "Aucune affaire associée",
      itemRoute: (item) => {
        // Determine if it's a dossier or case based on caseNumber prefix
        if (item.caseNumber.startsWith('DOS-')) {
          return '/dossiers';
        } else if (item.caseNumber.startsWith('PRO-')) {
          return '/cases';
        }
        return '/dossiers';
      },
      renderItem: (item) => {
        // Determine type and icon based on caseNumber prefix
        const isDossier = item.caseNumber.startsWith('DOS-');
        const icon = isDossier ? 'fas fa-folder-open' : 'fas fa-gavel';
        const iconColor = isDossier ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

        return {
          title: item.caseNumber,
          subtitle: item.title,
          status: item.status,
          icon: icon,
          iconColor: iconColor,
        };
      },

      allowAdd: false,
      allowDelete: false,
    },
    {
      id: "financial",
      label: "Comptabilité",
      icon: "fas fa-coins",
      component: "financial",
      description: "Suivi financier de toutes les missions de cet huissier"
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

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "Informations générales",
      editStrategy: "structured",
      fields: [
        {
          key: "name",
          label: "Nom complet",
          value: (data) => data.name,
          icon: "fas fa-user",
          type: "text",
          editable: true,
          required: true,
          placeholder: "Ex: Me. Ahmed Ben Salem"
        },
        {
          key: "status",
          label: "Statut",
          value: (data) => data.status,
          displayValue: (data) => data.status || "N/A",
          icon: "fas fa-flag",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "Disponible", label: "Disponible" },
            { value: "Occupé", label: "Occupé" },
            { value: "Inactif", label: "Inactif" },
          ]
        },
      ],
    },
    {
      title: "Coordonnées",
      editStrategy: "structured",
      fields: [
        {
          key: "email",
          label: "Email",
          value: (data) => data.email,
          icon: "fas fa-envelope",
          type: "email",
          editable: true,
          required: true,
          placeholder: "email@exemple.com"
        },
        {
          key: "phone",
          label: "Téléphone",
          value: (data) => data.phone,
          icon: "fas fa-phone",
          type: "tel",
          editable: true,
          required: true,
          placeholder: "+216 98 123 456"
        },
        {
          key: "alternatePhone",
          label: "Téléphone alternatif",
          value: (data) => data.alternatePhone || "N/A",
          icon: "fas fa-phone-alt",
          type: "tel",
          editable: true,
          placeholder: "+216 71 234 567"
        },
        {
          key: "location",
          label: "Localisation",
          value: (data) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true,
          required: true,
          placeholder: "Ex: Tunis"
        },
        {
          key: "address",
          label: "Adresse complète",
          value: (data) => data.address || "N/A",
          icon: "fas fa-map",
          type: "textarea",
          editable: true,
          rows: 2,
          placeholder: "Adresse du cabinet/étude"
        },
      ],
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