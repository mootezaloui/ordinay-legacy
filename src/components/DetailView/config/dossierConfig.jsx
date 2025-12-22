import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockDossiersExtended, mockClients, getStatusColor, mockCases, mockSessions, mockTasks, mockOfficers } from "../../../utils/mockData";
import { taskFormFields, caseFormFields, sessionFormFields, missionFormFields, getPhaseOptions, addCustomPhase } from "../../FormModal/formConfigs";

/**
 * Dossier Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, lawyer, phase
 * ✅ Added structured edit mode for overview sections
 */
export const dossierConfig = {
  entityType: "dossier",
  entityName: "Dossier",
  icon: "fas fa-folder-open",
  listRoute: "/dossiers",
  notFoundMessage: "Dossier non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer ce dossier ?",
  allowDelete: true,
  allowEdit: true,

  fetchData: async (id, contextData = null) => {
    console.log('[dossierConfig] fetchData called with id:', id);
    const numericId = parseInt(id);

    let dossier;
    if (contextData?.dossiers) {
      // Use contextData.dossiers from DataContext (this is the live data)
      console.log('[dossierConfig] Using contextData.dossiers');
      dossier = contextData.dossiers.find(d => d.id === numericId);
    } else {
      // Fallback to mockDossiersExtended (static data)
      console.log('[dossierConfig] mockDossiersExtended keys:', Object.keys(mockDossiersExtended));
      dossier = mockDossiersExtended[numericId];
    }
    console.log('[dossierConfig] Found dossier:', dossier);
    if (!dossier) return null;

    if (!dossier.transactions) {
      dossier.transactions = [];
    }

    // ✅ Compute aggregated related entities from contextData if available
    const sessions = contextData?.sessions || mockSessions;
    const tasks = contextData?.tasks || mockTasks;
    const cases = contextData?.cases || [];

    // Always derive proceedings from the live cases list to stay in sync with deletions
    const dossierCases = cases.filter(c => c.dossierId === numericId);
    // Aggregate all sessions related to this dossier (by dossierId or by caseId)
    const relatedSessions = sessions.filter(session =>
      session.dossierId === numericId ||
      dossierCases.some(cas => cas.id === session.caseId)
    );
    const relatedTasks = tasks.filter(task =>
      (task.parentType === 'dossier' && task.dossierId === numericId) ||
      (task.parentType === 'case' && dossierCases.some(cas => cas.id === task.caseId))
    );

    // ✅ Always resolve client from clientId using latest context data
    const clients = contextData?.clients || mockClients;
    let client = null;
    if (dossier.clientId) {
      const foundClient = clients.find(c => c.id === parseInt(dossier.clientId));
      if (foundClient) {
        client = {
          id: foundClient.id,
          name: foundClient.name,
          email: foundClient.email,
          phone: foundClient.phone
        };
      }
    }

    return {
      ...dossier,
      client: client || { id: null, name: 'Client non assigné' },
      sessions: relatedSessions,
      tasks: relatedTasks,
      proceedings: dossierCases,
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updateDossier) {
      // Use DataContext to update (this persists to localStorage)
      contextData.updateDossier(numericId, data);
    } else {
      // Fallback to updating mockDossiersExtended
      if (mockDossiersExtended[numericId]) {
        const enrichedData = { ...data };

        // ✅ Update client object when clientId changes
        if ('clientId' in data) {
          const client = mockClients.find(c => c.id === parseInt(data.clientId));
          if (client) {
            enrichedData.client = {
              id: client.id,
              name: client.name,
              email: client.email,
              phone: client.phone
            };
          }
        }

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

        // ✅ Sync proceedings (cases) with global mockCases array
        if ('proceedings' in data) {
          data.proceedings.forEach(cas => {
            const existingIndex = mockCases.findIndex(c => c.id === cas.id);
            if (existingIndex === -1) {
              // New case - add to global array
              mockCases.push(cas);
            } else {
              // Existing case - update it
              mockCases[existingIndex] = cas;
            }
          });
        }

        mockDossiersExtended[numericId] = {
          ...mockDossiersExtended[numericId],
          ...enrichedData,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.deleteDossier) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deleteDossier(numericId);
    } else {
      console.log("Deleting dossier:", numericId);
    }
  },

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
        { value: "Ouvert", label: "Ouvert", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "En attente", label: "En attente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Fermé", label: "Fermé", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
        { value: "Suspendu", label: "Suspendu", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
      ],
      // Validation now handled by domainRules service
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
      key: "phase",
      label: "Phase",
      icon: "fas fa-stream",
      colorMap: false,
      getOptions: () => getPhaseOptions(),
      allowCreate: true,
      createLabel: "Ajouter une phase",
      onCreateOption: async (name) => {
        addCustomPhase(name);
      }
    }
  ],

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
              {data.client?.id ? (
                <Link
                  to={`/clients/${data.client.id}`}
                  className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                >
                  <i className="fas fa-user"></i>
                  {data.client.name}
                </Link>
              ) : (
                <span className="text-slate-500 dark:text-slate-400 flex items-center gap-2">
                  <i className="fas fa-user"></i>
                  {data.client?.name || 'Client non assigné'}
                </span>
              )}
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
            <InfoCard icon="fas fa-stream" label="Phase" value={data.phase || "Non définie"} color="green" />
            <InfoCard icon="fas fa-clock" label="Prochaine échéance" value={data.nextDeadline} color="amber" />
          </div>
        </div>
      </ContentSection>
    );
  },

  getStats: (data) => {
    const transactions = data.transactions || [];
    const revenues = transactions.filter(t => t.type === 'revenue');
    const expenses = transactions.filter(t => t.type === 'expense');

    const totalRevenue = revenues.reduce((sum, t) => {
      const amount = parseFloat(t.amount.replace(/[^\d.]/g, '')) || 0;
      return sum + amount;
    }, 0);

    const totalExpenses = expenses.reduce((sum, t) => {
      const amount = parseFloat(t.amount.replace(/[^\d.]/g, '')) || 0;
      return sum + amount;
    }, 0);

    return [
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
        icon: "fas fa-gavel",
        iconColor: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/20",
        value: data.proceedings?.length || 0,
        label: "Procès"
      },
      {
        icon: "fas fa-chart-line",
        iconColor: totalRevenue >= totalExpenses ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
        bgColor: totalRevenue >= totalExpenses ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20",
        value: `${(totalRevenue - totalExpenses).toFixed(0)} TND`,
        label: "Bénéfice Net"
      },
    ];
  },

  tabs: [
    {
      id: "overview",
      label: "Vue d'ensemble",
      icon: "fas fa-eye",
      component: "overview",
    },
    {
      id: "proceedings",
      label: "Procès",
      icon: "fas fa-gavel",
      component: "aggregatedRelated",
      aggregationType: "cases",
      getCount: (data) => data.proceedings?.length || 0,
      itemsKey: "proceedings",
      allowAdd: true,
      allowDelete: true,
      entityName: "un procès",
      addSubtitle: "Créer un nouveau procès pour ce dossier",
      formFields: caseFormFields.filter(field => field.name !== 'dossierId'),
    },
    {
      id: "sessions",
      label: "Audiences",
      icon: "fas fa-calendar-alt",
      component: "aggregatedRelated",
      aggregationType: "sessions",
      getCount: (data) => data.sessions?.length || 0,
      itemsKey: "sessions",
      allowAdd: true,
      allowDelete: false,
      entityName: "une séance",
      addSubtitle: "Créer une nouvelle séance pour ce dossier",
      // Dynamic form fields - allow linking to either this dossier or one of its procès
      getFormFields: (dossierData) => {
        const dossierCases = dossierData.proceedings || [];

        return sessionFormFields.map(field => {
          // Allow linkType to be editable - choose between dossier and case
          if (field.name === 'linkType') {
            return {
              ...field,
              // Not disabled - user can choose
              defaultValue: 'case', // Default to case if procès exist, else dossier
              helpText: dossierCases.length > 0
                ? "Choisir si cette séance est liée à ce dossier ou à un procès spécifique"
                : "Cette séance sera liée à ce dossier (aucun procès disponible)"
            };
          }
          if (field.name === 'caseId') {
            return {
              ...field,
              type: 'select', // Use regular select for better display
              options: dossierCases.map(cas => ({
                value: cas.id,
                label: `${cas.caseNumber} - ${cas.title}`
              })),
              helpText: dossierCases.length === 0
                ? "Aucun procès disponible. Veuillez d'abord créer un procès."
                : "Sélectionner le procès auquel cette séance sera rattachée",
              // Only show this field when linkType is 'case'
              getOptions: (formData) => {
                if (formData.linkType !== "case") return [];
                return dossierCases.map(cas => ({
                  value: cas.id,
                  label: `${cas.caseNumber} - ${cas.title}`
                }));
              }
            };
          }
          if (field.name === 'dossierId') {
            return {
              ...field,
              type: 'select', // Use regular select for better display
              defaultValue: dossierData.id,
              disabled: true, // Make it read-only when shown
              options: [{
                value: dossierData.id,
                label: `${dossierData.caseNumber} - ${dossierData.title}`
              }],
              helpText: "Cette séance sera rattachée à ce dossier",
              // Only show this field when linkType is 'dossier'
              hideIf: false, // Will be controlled by getOptions
              getOptions: (formData) => {
                if (formData.linkType !== "dossier") return [];
                return [{
                  value: dossierData.id,
                  label: `${dossierData.caseNumber} - ${dossierData.title}`
                }];
              }
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
      addSubtitle: "Créer une nouvelle tâche pour ce dossier",
      // Dynamic form fields - dossierId and caseId options filtered to this dossier
      getFormFields: (dossierData) => {
        const dossierCases = dossierData.proceedings || [];

        return taskFormFields.map(field => {
          // Default parentType to 'dossier' since we're in dossier context
          if (field.name === 'parentType') {
            return {
              ...field,
              defaultValue: 'dossier',
              helpText: dossierCases.length > 0
                ? "Choisir si cette tâche concerne le dossier en général ou un procès spécifique"
                : "Cette tâche sera rattachée au dossier (aucun procès disponible)"
            };
          } else if (field.name === 'dossierId') {
            // Show this field as disabled/read-only with the current dossier pre-filled
            return {
              ...field,
              defaultValue: dossierData.id, // Auto-fill with current dossier ID
              disabled: true, // Make it read-only (unchangeable)
              options: [{
                value: dossierData.id,
                label: `${dossierData.caseNumber} - ${dossierData.title}`
              }],
              helpText: "Cette tâche sera rattachée à ce dossier",
              // Override getOptions to use this dossier only
              getOptions: (formData) => {
                if (formData.parentType !== "dossier") return [];
                return [{
                  value: dossierData.id,
                  label: `${dossierData.caseNumber} - ${dossierData.title}`
                }];
              }
            };
          } else if (field.name === 'caseId') {
            return {
              ...field,
              options: dossierCases.map(cas => ({
                value: cas.id,
                label: `${cas.caseNumber} - ${cas.title}`
              })),
              helpText: dossierCases.length === 0
                ? "Aucun procès disponible. Veuillez d'abord créer un procès."
                : "Sélectionner le procès auquel cette tâche sera rattachée",
              // Override getOptions to use filtered options
              getOptions: (formData) => {
                if (formData.parentType !== "case") return [];
                return dossierCases.map(cas => ({
                  value: cas.id,
                  label: `${cas.caseNumber} - ${cas.title}`
                }));
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
      allowAdd: true,
      allowDelete: false,
      entityName: "une mission",
      addSubtitle: "Créer une nouvelle mission d'huissier pour ce dossier",
      // Dynamic form fields - entityType and entityReference pre-filled
      getFormFields: (dossierData) => {
        // Generate a default mission number
        const year = new Date().getFullYear();
        const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
        const defaultMissionNumber = `MIS-${year}-${randomNum}`;

        return missionFormFields.map(field => {
          if (field.name === 'entityType') {
            return {
              ...field,
              defaultValue: 'dossier',
              disabled: true,
            };
          } else if (field.name === 'entityReference') {
            return {
              ...field,
              defaultValue: dossierData.caseNumber,
              disabled: true,
              helpText: `Cette mission sera liée au dossier ${dossierData.caseNumber}`,
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
      getCount: (data) => data.notes?.length || 0,
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
      title: "Informations Générales",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      fields: [
        {
          key: "caseNumber",
          label: "Numéro de dossier",
          value: (data) => data.caseNumber,
          icon: "fas fa-hashtag",
          type: "text",
          editable: true,
          helpText: "Format: DOS-ANNÉE-NUMÉRO"
        },
        {
          key: "title",
          label: "Titre du dossier",
          value: (data) => data.title,
          icon: "fas fa-heading",
          type: "text",
          editable: true,
          fullWidth: true
        },
        {
          key: "clientId",
          label: "Client",
          value: (data) => {
            const clientId = data.clientId || data.client?.id;
            return clientId;
          },
          displayValue: (data) => {
            const clientId = data.clientId || data.client?.id;
            const client = mockClients.find(c => c.id == clientId);
            return client ? client.name : "Client inconnu";
          },
          icon: "fas fa-user",
          type: "searchable-select",
          editable: true,
          getOptions: () => mockClients.map(client => ({
            value: client.id,
            label: client.name
          })),
          helpText: "Attention: Changer le client transférera le dossier vers un autre client"
        },
        {
          key: "category",
          label: "Catégorie",
          value: (data) => data.category,
          icon: "fas fa-layer-group",
          type: "select",
          editable: true,
          options: [
            { value: "Commercial", label: "Droit Commercial" },
            { value: "Famille", label: "Droit de la Famille" },
            { value: "Pénal", label: "Droit Pénal" },
            { value: "Travail", label: "Droit du Travail" },
            { value: "Immobilier", label: "Droit Immobilier" },
            { value: "Administratif", label: "Droit Administratif" },
            { value: "Fiscal", label: "Droit Fiscal" },
            { value: "Autre", label: "Autre" },
          ]
        },
        {
          key: "phase",
          label: "Phase",
          value: (data) => data.phase,
          icon: "fas fa-stream",
          type: "select",
          editable: true,
          options: [
            { value: "Ouverture", label: "Ouverture" },
            { value: "Instruction", label: "Instruction" },
            { value: "NAcgociation", label: "NAcgociation" },
            { value: "Plaidoirie", label: "Plaidoirie" },
            { value: "Jugement", label: "Jugement" },
            { value: "ExAccution", label: "ExAccution" },
          ]
        },
        {
          key: "openDate",
          label: "Date d'ouverture",
          value: (data) => data.openDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "nextDeadline",
          label: "Prochaine échéance",
          value: (data) => data.nextDeadline,
          icon: "fas fa-clock",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Description du dossier",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      type: "description",
      fieldKey: "description",
      content: (data) => data.description,
    },
    {
      title: "Partie Adverse",
      editStrategy: "structured", // ✅ Requires explicit Edit button
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
      editStrategy: "structured", // ✅ Requires explicit Edit button
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
