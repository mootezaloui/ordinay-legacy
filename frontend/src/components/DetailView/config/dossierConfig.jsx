import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import i18next from "i18next";
import { getStatusColor } from "./statusColors";
import { taskFormFields, lawsuitFormFields, sessionFormFields, getMissionFormFields } from "../../FormModal/formConfigs";
import { getAllPhases, addCustomPhase } from "../../../utils/phaseManager";
import { getAllCategories, addCustomCategory } from "../../../utils/categoryManager";
import { calculateNextDeadline, formatDate, getDeadlineNavigationPath, getDeadlineUrgency } from "../../../utils/deadlineUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import { translateStatus, translateCategory, translatePriority, translatePhase } from "../../../utils/entityTranslations";
import { formatCurrency as formatCurrencyValue } from "../../../utils/currency";

// Default phases for dossiers
const DEFAULT_PHASES = [
  { value: "Opening", label: "Opening" },
  { value: "Investigation", label: "Investigation" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Pleading", label: "Pleading" },
  { value: "Judgment", label: "Judgment" },
  { value: "Execution", label: "Execution" },
];

// Default categories for dossiers
const DEFAULT_CATEGORIES = [
  { value: "Commercial Law", label: "Commercial Law" },
  { value: "Family Law", label: "Family Law" },
  { value: "Criminal Law", label: "Criminal Law" },
  { value: "Labor Law", label: "Labor Law" },
  { value: "Real Estate Law", label: "Real Estate Law" },
  { value: "Administrative Law", label: "Administrative Law" },
  { value: "Tax Law", label: "Tax Law" },
];

/**
 * Dossier Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, lawyer, phase
 * ✅ Added structured edit mode for overview sections
 * ✅ Fully internationalized with i18n support
 */
export const createDossierConfig = (t, helpers = {}) => {
  const tSessions = (key, options) => i18next.t(key, { ns: "sessions", ...options });
  const formatCurrency = helpers?.formatCurrency || formatCurrencyValue;

  return {
    entityType: "dossier",
    entityName: t('detail.entityName'),
    icon: "fas fa-folder-open",
    listRoute: "/dossiers",
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      let dossier;
      if (contextData?.dossiers) {
        // Use contextData.dossiers from DataContext (this is the live data)
        dossier = contextData.dossiers.find(d => d.id === numericId);
      } else {
        // Fallback to null (static data)
        dossier = null[numericId];
      }
      if (!dossier) return null;

      if (!dossier.transactions) {
        dossier.transactions = [];
      }

      // ✅ Compute aggregated related entities from contextData if available
      const sessions = contextData?.sessions || [];
      const tasks = contextData?.tasks || [];
      const lawsuits = contextData?.lawsuits || [];
      const financialEntries = contextData?.financialEntries || [];

      // Always derive proceedings from the live lawsuits list to stay in sync with deletions
      const dossierLawsuits = lawsuits.filter(lawsuit => lawsuit.dossierId === numericId);
      // Aggregate all sessions related to this dossier (by dossierId or by lawsuitId)
      const relatedSessions = sessions.filter(session =>
        session.dossierId === numericId ||
        dossierLawsuits.some(lawsuit => lawsuit.id === session.lawsuitId)
      );
      const relatedTasks = tasks.filter(task =>
        (task.parentType === 'dossier' && task.dossierId === numericId) ||
        (task.parentType === 'lawsuit' && dossierLawsuits.some(lawsuit => lawsuit.id === task.lawsuitId))
      );
      const relatedFinancialEntries = financialEntries.filter(entry =>
        entry.dossierId === numericId ||
        dossierLawsuits.some(lawsuit => lawsuit.id === entry.lawsuitId)
      );

      // ✅ Calculate dynamic next deadline from all related entities
      const nextDeadlineObj = calculateNextDeadline(dossier, relatedSessions, relatedTasks, relatedFinancialEntries);

      // ✅ Always resolve client from clientId using latest context data
      const clients = contextData?.clients || [];
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

      // Fetch documents for this dossier
      let documents = [];
      try {
        const documentService = (await import("../../../services/documentService")).default;
        documents = await documentService.getEntityDocuments("dossier", numericId);
      } catch (err) {
        console.error('[dossierConfig] Failed to load documents:', err);
      }

      return {
        ...dossier,
        client: client || { id: null, name: t('detail.fallback.unassignedClient') },
        sessions: relatedSessions,
        tasks: relatedTasks,
        proceedings: dossierLawsuits,
        financialEntries: relatedFinancialEntries,
        documents,
        // ✅ Add computed next deadline
        computedNextDeadline: nextDeadlineObj,
      };
    },

    updateData: async (id, data, contextData = null, options = {}) => {
      const numericId = parseInt(id);

      // Filter out relationship fields - dossier entity should only contain dossier-specific data
      const dossierFields = [
        'lawsuitNumber', 'title', 'clientId', 'category', 'priority', 'phase',
        'openDate', 'nextDeadline', 'description', 'adversaryParty', 'adversaryLawyer', 'status', 'notes'
      ];
      const dossierData = Object.keys(data).reduce((acc, key) => {
        if (dossierFields.includes(key)) {
          acc[key] = data[key];
        }
        return acc;
      }, {});

      // Only update if there are actual dossier fields to update
      if (Object.keys(dossierData).length > 0 && contextData?.updateDossier) {
        // Use DataContext to update (this persists to localStorage)
        // Pass skipConfirmation only if explicitly set in options (when user confirmed via ConfirmImpactModal)
        const skipConfirmation = options.skipConfirmation || false;
        contextData.updateDossier(numericId, dossierData, skipConfirmation);
      } else {
      }
      // If no dossier fields to update, skip the update (this happens when only relationship fields change)
      await new Promise(resolve => setTimeout(resolve, 500));
    },

    deleteData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      if (contextData?.deleteDossier) {
        // Use DataContext to delete (this persists to localStorage)
        contextData.deleteDossier(numericId);
      }
    },

    getTitle: (data) => data.title,
    getSubtitle: (data) => data.lawsuitNumber,

    // ✅ NEW: Quick Actions Configuration
    quickActions: [
      {
        key: "status",
        label: t('detail.quickActions.status.label'),
        icon: "fas fa-info-circle",
        colorMap: true,
        options: [
          { value: "Open", label: t('detail.quickActions.status.open'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
          { value: "In Progress", label: t('detail.quickActions.status.inProgress'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
          { value: "On Hold", label: t('detail.quickActions.status.onHold'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
          { value: "Closed", label: t('detail.quickActions.status.closed'), color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
        ],
        // Validation now handled by domainRules service
      },
      {
        key: "priority",
        label: t('detail.quickActions.priority.label'),
        icon: "fas fa-flag",
        colorMap: true,
        options: [
          { value: "High", label: t('detail.quickActions.priority.high'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
          { value: "Medium", label: t('detail.quickActions.priority.medium'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
          { value: "Low", label: t('detail.quickActions.priority.low'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        ]
      },
      {
        key: "phase",
        label: t('detail.quickActions.phase.label'),
        icon: "fas fa-stream",
        colorMap: false,
        getOptions: () => getAllPhases(DEFAULT_PHASES).map((option) => ({
          ...option,
          label: translatePhase(option.value || option.label, t)
        })),
        allowCreate: true,
        createLabel: t('detail.quickActions.phase.create'),
        onCreateOption: async (name) => {
          addCustomPhase(name);
          return true;
        }
      }
    ],

    renderHeader: (data) => {
      const priorityColor = {
        "High": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        "Medium": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        "Low": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      };

      return (
        <ContentSection>
          <div className="p-6" data-tutorial="dossier-detail-header">
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
                    {data.client?.name || t('detail.fallback.unassignedClient')}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColor[data.priority]}`}>
                  {t('detail.header.priority')} {translatePriority(data.priority, t)}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                  {translateStatus(data.status, 'dossiers', t)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <InfoCard icon="fas fa-calendar" label={t('detail.header.openingDate')} value={formatDateValue(data.openDate)} color="blue" />
              <InfoCard icon="fas fa-layer-group" label={t('detail.header.category')} value={translateCategory(data.category, t)} color="purple" />
              <InfoCard icon="fas fa-stream" label={t('detail.header.phase')} value={translatePhase(data.phase, t) || t('detail.fallback.notDefined')} color="green" />
              {(() => {
                const deadline = data.computedNextDeadline;
                if (!deadline) {
                  return <InfoCard icon="fas fa-clock" label={t('detail.header.nextDeadline')} value={t('detail.fallback.noDeadlines')} color="amber" />;
                }

                const formattedDate = formatDate(deadline.date);
                const urgency = getDeadlineUrgency(deadline);
                const linkTo = getDeadlineNavigationPath(deadline, data.id);

                // Choose color based on urgency
                const urgencyColors = {
                  critical: "red",
                  urgent: "amber",
                  soon: "amber",
                  normal: "amber",
                };

                return (
                  <InfoCard
                    icon="fas fa-clock"
                    label={t('detail.header.nextDeadline')}
                    value={formattedDate}
                    subtitle={deadline.label}
                    color={urgencyColors[urgency]}
                    linkTo={linkTo}
                  />
                );
              })()}
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
          label: t('detail.stats.documents')
        },
        {
          icon: "fas fa-tasks",
          iconColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-100 dark:bg-blue-900/20",
          value: data.tasks?.length || 0,
          label: t('detail.stats.tasks')
        },
        {
          icon: "fas fa-gavel",
          iconColor: "text-green-600 dark:text-green-400",
          bgColor: "bg-green-100 dark:bg-green-900/20",
          value: data.proceedings?.length || 0,
          label: t('detail.stats.lawsuits')
        },
        {
          icon: "fas fa-chart-line",
          iconColor: totalRevenue >= totalExpenses ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
          bgColor: totalRevenue >= totalExpenses ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20",
          value: formatCurrency(totalRevenue - totalExpenses),
          label: t('detail.stats.netProfit')
        },
      ];
    },

    tabs: [
      {
        id: "overview",
        label: t('detail.tabs.overview'),
        icon: "fas fa-eye",
        component: "overview",
      },
      {
        id: "proceedings",
        label: t('detail.tabs.proceedings'),
        icon: "fas fa-gavel",
        component: "aggregatedRelated",
        aggregationType: "lawsuits",
        getCount: (data) => data.proceedings?.length || 0,
        itemsKey: "proceedings",
        allowAdd: true,
        allowDelete: true,
        entityName: t('detail.tabs.proceedingsEntity'),
        addSubtitle: t('detail.tabs.proceedingsAddSubtitle'),
        getFormFields: () => {
          const lawsuitT = (key) => i18next.t(key, { ns: "lawsuits" });
          return lawsuitFormFields(lawsuitT).filter(field => field.name !== 'dossierId');
        },
      },
      {
        id: "sessions",
        label: t('detail.tabs.sessions'),
        icon: "fas fa-calendar-alt",
        component: "aggregatedRelated",
        aggregationType: "sessions",
        getCount: (data) => data.sessions?.length || 0,
        itemsKey: "sessions",
        allowAdd: true,
        allowDelete: false,
        entityName: t('detail.tabs.sessionsEntity'),
        addSubtitle: t('detail.tabs.sessionsAddSubtitle'),
        // Dynamic form fields - allow linking to either this dossier or one of its procès
        getFormFields: (dossierData) => {
          const dossierLawsuits = dossierData.proceedings || [];
          const sessionT = (key) => i18next.t(key, { ns: "sessions" });

          return sessionFormFields(sessionT).map(field => {
            // Allow linkType to be editable - choose between dossier and lawsuit
            if (field.name === 'linkType') {
              return {
                ...field,
                // Not disabled - user can choose
                defaultValue: 'lawsuit', // Default to lawsuit if procès exist, else dossier
                helpText: dossierLawsuits.length > 0
                  ? t('detail.forms.sessions.linkHelpWithLawsuits')
                  : t('detail.forms.sessions.linkHelpNoLawsuits')
              };
            }
            if (field.name === 'lawsuitId') {
              return {
                ...field,
                type: 'select', // Use regular select for better display
                options: dossierLawsuits.map(lawsuit => ({
                  value: lawsuit.id,
                  label: `${lawsuit.lawsuitNumber} - ${lawsuit.title}`
                })),
                helpText: dossierLawsuits.length === 0
                  ? t('detail.forms.sessions.lawsuitsEmpty')
                  : t('detail.forms.sessions.lawsuitHelp'),
                // Only show this field when linkType is 'lawsuit'
                getOptions: (formData) => {
                  if (formData.linkType !== "lawsuit") return [];
                  return dossierLawsuits.map(lawsuit => ({
                    value: lawsuit.id,
                    label: `${lawsuit.lawsuitNumber} - ${lawsuit.title}`
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
                  label: `${dossierData.lawsuitNumber} - ${dossierData.title}`
                }],
                helpText: t('detail.forms.sessions.dossierHelp'),
                // Only show this field when linkType is 'dossier'
                hideIf: false, // Will be controlled by getOptions
                getOptions: (formData) => {
                  if (formData.linkType !== "dossier") return [];
                  return [{
                    value: dossierData.id,
                    label: `${dossierData.lawsuitNumber} - ${dossierData.title}`
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
        label: t('detail.tabs.tasks'),
        icon: "fas fa-tasks",
        component: "aggregatedRelated",
        aggregationType: "tasks",
        getCount: (data) => data.tasks?.length || 0,
        itemsKey: "tasks",
        allowAdd: true,
        allowDelete: false,
        entityName: t('detail.tabs.tasksEntity'),
        addSubtitle: t('detail.tabs.tasksAddSubtitle'),
        // Dynamic form fields - dossierId and lawsuitId options filtered to this dossier
        getFormFields: (dossierData) => {
          const dossierLawsuits = dossierData.proceedings || [];
          const tTasks = (key) => i18next.t(key, { ns: "tasks" });

          return taskFormFields(tTasks).map(field => {
            // Default parentType to 'dossier' since we're in dossier context
            if (field.name === 'parentType') {
              return {
                ...field,
                defaultValue: 'dossier',
                helpText: dossierLawsuits.length > 0
                  ? t('detail.forms.tasks.linkHelpWithLawsuits')
                  : t('detail.forms.tasks.linkHelpNoLawsuits')
              };
            } else if (field.name === 'dossierId') {
              // Show this field as disabled/read-only with the current dossier pre-filled
              return {
                ...field,
                defaultValue: dossierData.id, // Auto-fill with current dossier ID
                disabled: true, // Make it read-only (unchangeable)
                options: [{
                  value: dossierData.id,
                  label: `${dossierData.lawsuitNumber} - ${dossierData.title}`
                }],
                helpText: t('detail.forms.tasks.dossierHelp'),
                // Override getOptions to use this dossier only
                getOptions: (formData) => {
                  if (formData.parentType !== "dossier") return [];
                  return [{
                    value: dossierData.id,
                    label: `${dossierData.lawsuitNumber} - ${dossierData.title}`
                  }];
                }
              };
            } else if (field.name === 'lawsuitId') {
              return {
                ...field,
                options: dossierLawsuits.map(lawsuit => ({
                  value: lawsuit.id,
                  label: `${lawsuit.lawsuitNumber} - ${lawsuit.title}`
                })),
                helpText: dossierLawsuits.length === 0
                  ? t('detail.forms.tasks.lawsuitsEmpty')
                  : t('detail.forms.tasks.lawsuitHelp'),
                // Override getOptions to use filtered options
                getOptions: (formData) => {
                  if (formData.parentType !== "lawsuit") return [];
                  return dossierLawsuits.map(lawsuit => ({
                    value: lawsuit.id,
                    label: `${lawsuit.lawsuitNumber} - ${lawsuit.title}`
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
        label: t('detail.tabs.missions'),
        icon: "fas fa-clipboard-list",
        component: "aggregatedRelated",
        aggregationType: "missions",
        getCount: (data) => data.missions?.length || 0,
        allowAdd: true,
        allowDelete: false,
        entityName: t('detail.tabs.missionsEntity'),
        addSubtitle: t('detail.tabs.missionsAddSubtitle'),
        // Dynamic form fields - entityType and entityReference pre-filled
        getFormFields: (dossierData, contextData) => {
          // Generate a default mission number
          const year = new Date().getFullYear();
          const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const defaultMissionNumber = `MIS-${year}-${randomNum}`;

          return getMissionFormFields().map(field => {
            if (field.name === 'entityType') {
              return {
                ...field,
                defaultValue: 'dossier',
                disabled: true,
              };
            } else if (field.name === 'entityReference') {
              return {
                ...field,
                defaultValue: dossierData.lawsuitNumber,
                disabled: true,
                helpText: t('detail.forms.missions.linkedToDossier', { lawsuitNumber: dossierData.lawsuitNumber }),
              };
            } else if (field.name === 'missionNumber') {
              // Allow lawyers to enter their own reference or leave blank for auto-generation
              return {
                ...field,
                defaultValue: '',
                disabled: false,
              };
            } else if (field.name === 'officerId') {
              return {
                ...field,
                options: (contextData?.officers || []).map(officer => ({
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
        label: t('detail.tabs.financial'),
        icon: "fas fa-calculator",
        component: "financial",
        getCount: (data) => {
          // Count financial entries (excluding void/cancelled)
          if (!data.financialEntries) return 0;
          return data.financialEntries.filter(e =>
            e.status !== 'void' && e.status !== 'cancelled'
          ).length;
        },
      },
      {
        id: "documents",
        label: t('detail.tabs.documents'),
        icon: "fas fa-file",
        component: "documents",
        getCount: (data) => data.documents?.length || 0,
      },
      {
        id: "notes",
        label: t('detail.tabs.notes', { ns: 'common' }),
        icon: "fas fa-sticky-note",
        component: "notes",
        fieldKey: "notes", // ✅ Explicitly set field key for clarity
        getCount: (data) => {
          if (!data.notes) return 0;
          if (Array.isArray(data.notes)) return data.notes.length;
          return 1; // Legacy single string note
        },
      },
      {
        id: "timeline",
        label: t('detail.tabs.history'),
        icon: "fas fa-history",
        component: "history",
      },
    ],

    // ✅ UPDATED: Overview sections with editStrategy
    overviewSections: [
      {
        title: t('detail.overview.general'),
        editStrategy: "structured", // ✅ Requires explicit Edit button
        fields: [
          {
            key: "lawsuitNumber",
            label: t('detail.overview.fields.lawsuitNumber'),
            value: (data) => data.lawsuitNumber,
            icon: "fas fa-hashtag",
            type: "text",
            editable: true,
            helpText: t('detail.overview.fields.lawsuitNumberHelp')
          },
          {
            key: "title",
            label: t('detail.overview.fields.title'),
            value: (data) => data.title,
            icon: "fas fa-heading",
            type: "text",
            editable: true,
            fullWidth: true
          },
          {
            key: "clientId",
            label: t('detail.overview.fields.client'),
            value: (data) => {
              const clientId = data.clientId || data.client?.id;
              return clientId;
            },
            displayValue: (data, contextData) => {
              const clientId = data.clientId || data.client?.id;
              const clients = contextData?.clients || [];
              const client = clients.find(c => c.id == clientId);
              return client ? client.name : t('detail.fallback.unknownClient');
            },
            icon: "fas fa-user",
            type: "searchable-select",
            editable: true,
            getOptions: (formData, contextData) => {
              const clients = contextData?.clients || [];
              return clients.map(client => ({
                value: client.id,
                label: client.name
              }));
            },
            helpText: t('detail.overview.fields.clientHelp')
          },
          {
            key: "category",
            label: t('detail.overview.fields.category'),
            value: (data) => data.category,
            icon: "fas fa-layer-group",
            type: "select",
            editable: true,
            displayValue: (data) => translateCategory(data.category, t),
            getOptions: (formData) => {
              const baseOptions = getAllCategories(DEFAULT_CATEGORIES).map((option) => ({
                ...option,
                label: translateCategory(option.value || option.label, t)
              }));
              const currentValue = formData?.category;
              if (currentValue && !baseOptions.some((option) => option.value === currentValue)) {
                return [{ value: currentValue, label: translateCategory(currentValue, t) }, ...baseOptions];
              }
              return baseOptions;
            },
          },
          {
            key: "phase",
            label: t('detail.overview.fields.phase'),
            value: (data) => data.phase,
            icon: "fas fa-stream",
            type: "select",
            editable: true,
            displayValue: (data) => translatePhase(data.phase, t) || t('detail.fallback.notDefined'),
            getOptions: () => getAllPhases(DEFAULT_PHASES).map((option) => ({
              ...option,
              label: translatePhase(option.value || option.label, t)
            })),
          },
          {
            key: "openDate",
            label: t('detail.overview.fields.openDate'),
            value: (data) => data.openDate,
            displayValue: (data) => data.openDate ? formatDateValue(data.openDate) : t('detail.fallback.na'),
            icon: "fas fa-calendar",
            type: "date",
            editable: true
          },
          {
            key: "nextDeadline",
            label: t('detail.overview.fields.nextDeadline'),
            value: (data) => {
              const deadline = data.computedNextDeadline;
              if (!deadline) return t('detail.overview.fields.nextDeadlineEmpty');
              return formatDate(deadline.date);
            },
            icon: "fas fa-clock",
            type: "custom",
            editable: false,
            customRender: (data) => {
              const deadline = data.computedNextDeadline;
              if (!deadline) {
                return (
                  <div className="text-slate-500 dark:text-slate-400 text-sm">
                    {t('detail.overview.fields.nextDeadlineEmpty')}
                  </div>
                );
              }

              const formattedDate = formatDate(deadline.date);
              const urgency = getDeadlineUrgency(deadline);
              const linkTo = getDeadlineNavigationPath(deadline, data.id);

              // Urgency badge colors
              const urgencyStyles = {
                critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700",
                urgent: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-700",
                soon: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-700",
                normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700",
              };

              const urgencyLabels = {
                critical: t('detail.deadlines.urgency.critical'),
                urgent: t('detail.deadlines.urgency.urgent'),
                soon: t('detail.deadlines.urgency.soon'),
                normal: t('detail.deadlines.urgency.normal'),
              };

              return (
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-slate-900 dark:text-white font-medium">
                        {formattedDate}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${urgencyStyles[urgency]}`}>
                        {urgencyLabels[urgency]}
                      </span>
                    </div>
                    <div className="text-sm text-slate-600 dark:text-slate-400">
                      {deadline.label}
                    </div>
                    {linkTo && (
                      <Link
                        to={linkTo}
                        className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                      >
                        {t('detail.deadlines.viewDetails')}
                        <i className="fas fa-arrow-right text-xs"></i>
                      </Link>
                    )}
                  </div>
                </div>
              );
            }
          },
        ],
      },
      {
        title: t('detail.overview.description'),
        editStrategy: "structured", // ✅ Requires explicit Edit button
        type: "description",
        fieldKey: "description",
        content: (data) => data.description,
      },
      {
        title: t('detail.overview.adverse'),
        editStrategy: "structured", // ✅ Requires explicit Edit button
        fields: [
          {
            key: "adversaryParty",
            label: t('detail.overview.fields.adversaryParty'),
            value: (data) => data.adversaryParty,
            icon: "fas fa-user",
            type: "text",
            editable: true
          },
          {
            key: "adversaryLawyer",
            label: t('detail.overview.fields.adversaryLawyer'),
            value: (data) => data.adversaryLawyer,
            icon: "fas fa-gavel",
            type: "text",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.legal'),
        editStrategy: "structured", // ✅ Requires explicit Edit button
        fields: [
          {
            key: "courtReference",
            label: t('detail.overview.fields.courtReference'),
            value: (data) => data.courtReference,
            icon: "fas fa-balance-scale",
            type: "text",
            editable: true
          },
          {
            key: "estimatedValue",
            label: t('detail.overview.fields.estimatedValue'),
            value: (data) => data.estimatedValue,
            icon: "fas fa-money-bill-wave",
            type: "text",
            editable: true
          },
        ],
      },
    ],
  };
};

// Helper component
function InfoCard({ icon, label, value, color, linkTo = null, subtitle = null }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
  };

  const content = (
    <>
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <i className={icon}></i>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">{value}</p>
        {subtitle && (
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{subtitle}</p>
        )}
      </div>
    </>
  );

  if (linkTo) {
    return (
      <Link
        to={linkTo}
        className="flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 p-2 -m-2 rounded-lg transition-colors group"
      >
        {content}
        <i className="fas fa-arrow-right text-slate-400 dark:text-slate-500 text-xs opacity-0 group-hover:opacity-100 transition-opacity"></i>
      </Link>
    );
  }

  return <div className="flex items-center gap-3">{content}</div>;
}







