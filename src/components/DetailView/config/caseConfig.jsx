import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockCasesExtended, mockDossiers, getStatusColor, mockSessions, mockTasks, mockOfficers } from "../../../utils/mockData";
import { sessionFormFields, taskFormFields, missionFormFields } from "../../FormModal/formConfigs";

/**
 * Case (Procès) Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Audiences tab creates Sessions (Séances Juridiques)
 * ✅ UPDATED: Added Tasks tab for case-specific tasks
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
  fetchData: async (id, contextData = null) => {
    console.log('[caseConfig] fetchData called with id:', id);
    const numericId = parseInt(id);

    let caseData;
    if (contextData?.cases) {
      // Use contextData.cases from DataContext (this is the live data)
      console.log('[caseConfig] Using contextData.cases');
      caseData = contextData.cases.find(c => c.id === numericId);
    } else {
      // Fallback to mockCasesExtended (static data)
      console.log('[caseConfig] mockCasesExtended keys:', Object.keys(mockCasesExtended));
      caseData = mockCasesExtended[numericId];
    }
    console.log('[caseConfig] Found case:', caseData);
    if (!caseData) return null;

    // ✅ Ensure dossier object is populated
    const dossiers = contextData?.dossiers || mockDossiers;
    let dossier = caseData.dossier;
    if (!dossier && caseData.dossierId) {
      const foundDossier = dossiers.find(d => d.id === parseInt(caseData.dossierId));
      if (foundDossier) {
        dossier = {
          id: foundDossier.id,
          caseNumber: foundDossier.caseNumber,
          title: foundDossier.title
        };
      }
    }

    return {
      ...caseData,
      dossier: dossier || { id: null, caseNumber: 'N/A', title: 'Dossier inconnu' }
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updateCase) {
      // Use DataContext to update (this persists to localStorage)
      contextData.updateCase(numericId, data);
    } else {
      // Fallback to updating mockCasesExtended
      if (mockCasesExtended[numericId]) {
        // ✅ Sync sessions with global mockSessions array
        if ('sessions' in data) {
          data.sessions.forEach(session => {
            const existingIndex = mockSessions.findIndex(s => s.id === session.id);
            if (existingIndex === -1) {
              // New session - add to global array
              mockSessions.push(session);
            } else {
              // Existing session - update it
              mockSessions[existingIndex] = session;
            }
          });
        }

        // ✅ Sync tasks with global mockTasks array
        if ('tasks' in data) {
          data.tasks.forEach(task => {
            const existingIndex = mockTasks.findIndex(t => t.id === task.id);
            if (existingIndex === -1) {
              // New task - add to global array
              mockTasks.push(task);
            } else {
              // Existing task - update it
              mockTasks[existingIndex] = task;
            }
          });
        }

        mockCasesExtended[numericId] = {
          ...mockCasesExtended[numericId],
          ...data,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.deleteCase) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deleteCase(numericId);
    } else {
      console.log("Deleting case:", numericId);
    }
  },

  // Header display
  getTitle: (data) => data.caseNumber,
  getSubtitle: (data) => data.title,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "En cours", label: "En cours", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "En attente", label: "En attente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Suspendu", label: "Suspendu", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
        { value: "Clos", label: "Clos", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
      ]
    }
  ],

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
              {data.dossier?.id ? (
                <Link
                  to={`/dossiers/${data.dossier.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                >
                  <i className="fas fa-folder-open"></i>
                  {data.dossier.caseNumber} - {data.dossier.title}
                </Link>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <i className="fas fa-folder-open"></i>
                  {data.dossier?.title || 'Dossier non assigné'}
                </span>
              )}
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
      label: "Prochaine Audience"
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
      value: data.sessions?.length || 0,
      label: "Séances"
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
      id: "sessions",
      label: "Séances",
      icon: "fas fa-calendar-alt",
      component: "aggregatedRelated",
      aggregationType: "sessions",
      getCount: (data) => data.sessions?.length || 0,
      itemsKey: "sessions",
      allowAdd: true,
      allowDelete: false,
      entityName: "une séance",
      addSubtitle: "Créer une nouvelle séance juridique pour ce procès",

      // Dynamic form fields - caseId pre-filled and disabled since we're in case context
      getFormFields: (caseData) => {
        return sessionFormFields.map(field => {
          if (field.name === 'caseId') {
            return {
              ...field,
              type: 'select', // Use regular select instead of searchable-select when disabled
              defaultValue: caseData.id,
              disabled: true, // Make it read-only
              options: [{
                value: caseData.id,
                label: `${caseData.caseNumber} - ${caseData.title}`
              }],
              helpText: "Cette séance sera rattachée à ce procès",
            };
          }
          // Make linkType field non-editable - always linked to case
          if (field.name === 'linkType') {
            return {
              ...field,
              disabled: true, // Make it read-only
              defaultValue: 'case',
              helpText: "Cette séance est liée à ce procès",
            };
          }
          // Hide dossierId field - not needed when adding to case
          if (field.name === 'dossierId') {
            return {
              ...field,
              hideIf: true, // Hide this field completely
            };
          }
          // Pre-fill type as "Audience" but allow user to change it
          if (field.name === 'type') {
            return {
              ...field,
              defaultValue: "Audience",
            };
          }
          // Pre-fill location with helpful placeholder
          if (field.name === 'location') {
            return {
              ...field,
              placeholder: "Salle d'audience / Lieu de rendez-vous",
            };
          }
          return field;
        });
      },
    },
    {
      id: "tasks",
      label: "Tâches",
      icon: "fas fa-tasks",
      component: "aggregatedRelated",
      aggregationType: "tasks",
      getCount: (data) => data.tasks?.length || 0,
      itemsKey: "tasks",
      allowAdd: true,
      allowDelete: false,
      entityName: "une tâche",
      addSubtitle: "Créer une nouvelle tâche pour ce procès",
      // Dynamic form fields - caseId and dossierId pre-filled based on context
      getFormFields: (caseData) => {
        // Get parent dossier data
        const parentDossier = caseData.dossier;

        return taskFormFields.map(field => {
          // Default parentType to 'case' since we're in case context (opposite of dossier)
          if (field.name === 'parentType') {
            return {
              ...field,
              defaultValue: 'case',
              helpText: "Choisir si cette tâche concerne le procès ou le dossier parent"
            };
          } else if (field.name === 'caseId') {
            // Show this procès (disabled/read-only)
            return {
              ...field,
              defaultValue: caseData.id,
              disabled: true, // Make it read-only
              options: [{
                value: caseData.id,
                label: `${caseData.caseNumber} - ${caseData.title}`
              }],
              helpText: "Cette tâche sera rattachée à ce procès",
              // Override getOptions to use this case only when parentType is 'case'
              getOptions: (formData) => {
                if (formData.parentType !== "case") return [];
                return [{
                  value: caseData.id,
                  label: `${caseData.caseNumber} - ${caseData.title}`
                }];
              }
            };
          } else if (field.name === 'dossierId') {
            // Show parent dossier (disabled/read-only)
            return {
              ...field,
              defaultValue: parentDossier?.id,
              disabled: true, // Make it read-only
              options: parentDossier ? [{
                value: parentDossier.id,
                label: `${parentDossier.caseNumber} - ${parentDossier.title}`
              }] : [],
              helpText: "Cette tâche sera rattachée au dossier parent",
              // Override getOptions to use parent dossier only when parentType is 'dossier'
              getOptions: (formData) => {
                if (formData.parentType !== "dossier") return [];
                return parentDossier ? [{
                  value: parentDossier.id,
                  label: `${parentDossier.caseNumber} - ${parentDossier.title}`
                }] : [];
              }
            };
          }
          return field;
        });
      },
    },
    {
      id: "missions",
      label: "Missions",
      icon: "fas fa-clipboard-list",
      component: "aggregatedRelated",
      aggregationType: "missions",
      getCount: (data) => data.missions?.length || 0,
      itemsKey: "missions",
      allowAdd: true,
      allowDelete: false,
      entityName: "une mission",
      addSubtitle: "Créer une nouvelle mission d'huissier pour ce procès",
      // Dynamic form fields - entityType and entityReference pre-filled
      getFormFields: (caseData) => {
        // Generate a default mission number
        const year = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const defaultMissionNumber = `MIS-${year}-${randomNum}`;

        return missionFormFields.map(field => {
          if (field.name === 'entityType') {
            return {
              ...field,
              defaultValue: 'case',
              disabled: true,
            };
          } else if (field.name === 'entityReference') {
            return {
              ...field,
              defaultValue: caseData.caseNumber,
              disabled: true,
              helpText: `Cette mission sera liée au procès ${caseData.caseNumber}`,
            };
          } else if (field.name === 'missionNumber') {
            return {
              ...field,
              defaultValue: defaultMissionNumber,
              disabled: true,
            };
          } else if (field.name === 'officerId') {
            return {
              ...field,
              options: mockOfficers.map(officer => ({
                value: officer.id,
                label: officer.name
              })),
            };
          }
          return field;
        });
      },
    },
    {
      id: "financial",
      label: "Comptabilité",
      icon: "fas fa-calculator",
      component: "financial",
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
          key: "caseNumber",
          label: "Numéro de procès",
          value: (data) => data.caseNumber,
          icon: "fas fa-hashtag",
          type: "text",
          editable: true
        },
        {
          key: "title",
          label: "Titre du procès",
          value: (data) => data.title,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Description du procès",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Informations du tribunal",
      editStrategy: "structured",
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
      editStrategy: "structured",
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
      editStrategy: "structured",
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
      title: "Dossier lié",
      editStrategy: "structured",
      fields: [
        {
          key: "dossierId",
          label: "Dossier associé",
          value: (data) => {
            // Return the dossierId for the select, not the full object
            return data.dossierId || "";
          },
          displayValue: (data) => {
            // For display purposes, show the full dossier info
            if (!data.dossierId) return "Aucun dossier";
            const dossier = mockDossiers.find(d => d.id === data.dossierId);
            if (dossier) return `${dossier.caseNumber} - ${dossier.title}`;
            // Fallback to hydrated dossier object if available
            if (data.dossier?.caseNumber) return `${data.dossier.caseNumber} - ${data.dossier.title}`;
            return "Aucun dossier";
          },
          icon: "fas fa-folder-open",
          type: "searchable-select",
          editable: true,
          required: true,
          options: mockDossiers.map(d => ({
            value: d.id,
            label: `${d.caseNumber} - ${d.title}`
          })),
          helpText: "Sélectionnez le dossier auquel ce procès est associé",
          placeholder: "Rechercher un dossier..."
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