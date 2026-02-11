import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { getAllAssignees, addCustomAssignee } from "../../../utils/assigneeManager";
import { formatDateTimeValue, formatDateValue } from "../../../utils/dateFormat";
import { translatePriority, translateStatus, translateAssignee } from "../../../utils/entityTranslations";

// Default assignees that are always available
const DEFAULT_ASSIGNEES = [
  { value: "Myself", label: "Myself" },
  { value: "Intern", label: "Intern" },
];

// Helper function to convert estimated time value to label (will be replaced by t() calls)
const createEstimatedTimeLabelGetter = (t) => (value) => {
  if (!value) return t('detail.fallback.na');
  const timeMap = {
    "0.5h": t('detail.estimatedTime.values.0_5h'),
    "1h": t('detail.estimatedTime.values.1h'),
    "1.5h": t('detail.estimatedTime.values.1_5h'),
    "2h": t('detail.estimatedTime.values.2h'),
    "3h": t('detail.estimatedTime.values.3h'),
    "4h": t('detail.estimatedTime.values.4h'),
    "6h": t('detail.estimatedTime.values.6h'),
    "8h": t('detail.estimatedTime.values.8h'),
    "12h": t('detail.estimatedTime.values.12h'),
    "16h": t('detail.estimatedTime.values.16h'),
    "20h": t('detail.estimatedTime.values.20h'),
    "24h": t('detail.estimatedTime.values.24h'),
    "40h": t('detail.estimatedTime.values.40h'),
    "80h": t('detail.estimatedTime.values.80h'),
  };
  return timeMap[value] || value;
};

/**
 * Task Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, assignedTo
 * ✅ Added structured edit mode for overview sections
 * ✅ UPDATED: Tasks can now belong to EITHER Dossier OR Lawsuit (Procès)
 * ✅ Fully internationalized with i18n support
 */
export const createTaskConfig = (t) => {
  const getEstimatedTimeLabel = createEstimatedTimeLabelGetter(t);

  return {
    // Basic info
    entityType: "task",
    entityName: t('detail.entityName'),
    icon: "fas fa-tasks",
    listRoute: "/tasks",

    // Messages
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),

    // Permissions
    allowDelete: true,
    allowEdit: true,

    // Data fetching
    fetchData: async (id, contextData = null) => {
      // Convert id to number for comparison
      const numericId = parseInt(id);

      let task;
      if (contextData?.tasks) {
        // Use contextData.tasks from DataContext (this is the live data)
        task = contextData.tasks.find(t => t.id === numericId);
      } else {
        // Fallback to null (static data)
        task = null[numericId];
      }
      if (!task) return null;

      // ✅ Always resolve dossier and lawsuit from IDs using latest context data
      const clients = contextData?.clients || [];
      const dossiers = contextData?.dossiers || [];
      const lawsuits = contextData?.lawsuits || [];
      const financialEntries = contextData?.financialEntries || [];

      let lawsuitData = null;
      if (task.lawsuitId) {
        const foundLawsuit = lawsuits.find(c => c.id === parseInt(task.lawsuitId));
        if (foundLawsuit) {
          lawsuitData = {
            id: foundLawsuit.id,
            lawsuitNumber: foundLawsuit.lawsuitNumber,
            title: foundLawsuit.title,
            dossierId: foundLawsuit.dossierId,
          };
        }
      }

      let dossier = null;
      if (task.dossierId) {
        const foundDossier = dossiers.find(d => d.id === parseInt(task.dossierId));
        if (foundDossier) {
          dossier = {
            id: foundDossier.id,
            lawsuitNumber: foundDossier.lawsuitNumber,
            title: foundDossier.title,
            clientId: foundDossier.clientId,
          };
        }
      }
      if (!dossier && lawsuitData?.dossierId) {
        const foundDossier = dossiers.find(d => d.id === parseInt(lawsuitData.dossierId));
        if (foundDossier) {
          dossier = {
            id: foundDossier.id,
            lawsuitNumber: foundDossier.lawsuitNumber,
            title: foundDossier.title,
            clientId: foundDossier.clientId,
          };
        }
      }

      let client = null;
      if (dossier?.clientId) {
        const foundClient = clients.find(c => c.id === parseInt(dossier.clientId));
        if (foundClient) {
          client = {
            id: foundClient.id,
            name: foundClient.name,
          };
        }
      }

      // Filter financial entries based on parent relationship
      let relatedFinancialEntries = [];
      if (task.parentType === "lawsuit" && task.lawsuitId) {
        relatedFinancialEntries = financialEntries.filter(entry =>
          entry.lawsuitId === task.lawsuitId && entry.scope === 'client'
        );
      } else if (task.dossierId) {
        relatedFinancialEntries = financialEntries.filter(entry =>
          entry.dossierId === task.dossierId && entry.scope === 'client'
        );
      }

      return {
        ...task,
        client: client || null,
        dossier: dossier || null,
        lawsuit: lawsuitData || null,
        financialEntries: relatedFinancialEntries,
      };
    },

    updateData: async (id, data, contextData = null, options = {}) => {
      const numericId = parseInt(id);

      // Filter out any potential relationship fields - task entity should only contain task-specific data
      const taskFields = [
        'title', 'parentType', 'dossierId', 'lawsuitId', 'assignedTo', 'dueDate',
        'priority', 'status', 'description', 'estimatedTime', 'notes'
      ];
      const taskData = Object.keys(data).reduce((acc, key) => {
        if (taskFields.includes(key)) {
          acc[key] = data[key];
        }
        return acc;
      }, {});

      // Only update if there are actual task fields to update
      if (Object.keys(taskData).length > 0) {
        if (contextData?.updateTask) {
          // Use DataContext to update (this persists to localStorage and API)
          await contextData.updateTask(numericId, taskData, options);
        } else {
          // Fallback to updating null
          if (null[numericId]) {
            null[numericId] = {
              ...null[numericId],
              ...taskData,
            };
          }
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      }
    },

    deleteData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      if (contextData?.deleteTask) {
        // Use DataContext to delete (this persists to localStorage)
        contextData.deleteTask(numericId);
      }
    },

    // Header display
    getTitle: (data) => data.title,
    getSubtitle: (data) => t('detail.subtitle', { date: formatDateTimeValue(data.createdDate) }),

    // ✅ NEW: Quick Actions Configuration
    quickActions: [
      {
        key: "status",
        label: t('detail.quickActions.status.label'),
        icon: "fas fa-info-circle",
        colorMap: true,
        options: [
          { value: "Not Started", label: t('detail.quickActions.status.notStarted'), color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
          { value: "In Progress", label: t('detail.quickActions.status.inProgress'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
          { value: "Blocked", label: t('detail.quickActions.status.blocked'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
          { value: "Done", label: t('detail.quickActions.status.done'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
          { value: "Cancelled", label: t('detail.quickActions.status.cancelled'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        ]
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
        key: "assignedTo",
        label: t('detail.quickActions.assignedTo.label'),
        icon: "fas fa-user",
        colorMap: false,
        getOptions: () => getAllAssignees(DEFAULT_ASSIGNEES).map((option) => ({
          ...option,
          label: translateAssignee(option.label || option.value, t, 'tasks'),
        })),
        allowCreate: true,
        onCreateOption: async (name) => {
          try {
            addCustomAssignee(name);
            return true;
          } catch (error) {
            alert(error.message);
            throw error;
          }
        },
        createLabel: t('detail.quickActions.assignedTo.create')
      }
    ],

    // Custom header rendering
    renderHeader: (data) => {
      const priorityColor = {
        "High": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
        "Medium": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
        "Low": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      };

      return (
        <ContentSection>
          <div className="p-6" data-tutorial="task-detail-header">
            <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {data.title}
                </h2>
                {data.client?.id && (
                  <Link
                    to={`/clients/${data.client.id}`}
                    className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                  >
                    <i className="fas fa-user"></i>
                    {data.client.name}
                  </Link>
                )}
                {data.dossier?.id && (
                  <Link
                    to={`/dossiers/${data.dossier.id}`}
                    className="mt-1 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                  >
                    <i className="fas fa-folder-open"></i>
                    {data.dossier.lawsuitNumber} - {data.dossier.title}
                  </Link>
                )}
                {data.lawsuit?.id && (
                  <Link
                    to={`/lawsuits/${data.lawsuit.id}`}
                    className="mt-1 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                  >
                    <i className="fas fa-gavel"></i>
                    {data.lawsuit.lawsuitNumber} - {data.lawsuit.title}
                  </Link>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${priorityColor[data.priority]}`}>
                  {t('detail.header.priority')} {translatePriority(data.priority, t, 'tasks')}
                </span>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`} data-tutorial="task-status-selector">
                  {translateStatus(data.status, 'tasks', t)}
                </span>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <InfoCard icon="fas fa-user" label={t('detail.header.assignedTo')} value={translateAssignee(data.assignedTo, t, 'tasks')} color="blue" />
              <InfoCard icon="fas fa-calendar" label={t('detail.header.dueDate')} value={formatDateValue(data.dueDate)} color="red" />
              <InfoCard icon="fas fa-clock" label={t('detail.header.estimatedTime')} value={getEstimatedTimeLabel(data.estimatedTime)} color="purple" />
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
        value: formatDateValue(data.dueDate),
        label: t('detail.header.dueDate')
      },
      {
        icon: "fas fa-user-check",
        iconColor: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/20",
        value: translateAssignee(data.assignedTo, t, 'tasks'),
        label: t('detail.header.assignedTo')
      },
    ],

    // Tabs configuration
    tabs: [
      {
        id: "overview",
        label: t('detail.tabs.overview'),
        icon: "fas fa-eye",
        component: "overview",
      },
      {
        id: "financial",
        label: t('detail.tabs.financial'),
        icon: "fas fa-coins",
        component: "financial",
        description: t('detail.tabs.financialDescription'),
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
        id: "comments",
        label: t('detail.tabs.comments'),
        icon: "fas fa-comments",
        component: "notes",
        fieldKey: "notes", // ✅ Backend uses "notes" field for all entities
        getCount: (data) => {
          if (!data.notes) return 0; // ✅ Changed from data.comments to data.notes
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

    // ✅ UPDATED: Overview sections with editStrategy and parent selection
    overviewSections: [
      {
        title: t('detail.overview.description'),
        editStrategy: "structured",
        type: "description",
        fieldKey: "description",
        content: (data) => data.description || t('detail.fallback.noDescription'),
      },
      {
        title: t('detail.overview.details'),
        editStrategy: "structured",
        fields: [
          {
            key: "dueDate",
            label: t('detail.overview.fields.dueDate'),
            value: (data, contextData) => data.dueDate,
            displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na'),
            icon: "fas fa-calendar",
            type: "date",
            editable: true
          },
          {
            key: "estimatedTime",
            label: t('detail.overview.fields.estimatedTime'),
            value: (data, contextData) => getEstimatedTimeLabel(data.estimatedTime),
            icon: "fas fa-clock",
            type: "select",
            editable: true,
            options: [
              { value: "0.5h", label: t('detail.estimatedTime.values.0_5h') },
              { value: "1h", label: t('detail.estimatedTime.values.1h') },
              { value: "1.5h", label: t('detail.estimatedTime.values.1_5h') },
              { value: "2h", label: t('detail.estimatedTime.values.2h') },
              { value: "3h", label: t('detail.estimatedTime.values.3h') },
              { value: "4h", label: t('detail.estimatedTime.values.4h') },
              { value: "6h", label: t('detail.estimatedTime.values.6h') },
              { value: "8h", label: t('detail.estimatedTime.values.8h') },
              { value: "12h", label: t('detail.estimatedTime.values.12h') },
              { value: "16h", label: t('detail.estimatedTime.values.16h') },
              { value: "20h", label: t('detail.estimatedTime.values.20h') },
              { value: "24h", label: t('detail.estimatedTime.values.24h') },
              { value: "40h", label: t('detail.estimatedTime.values.40h') },
              { value: "80h", label: t('detail.estimatedTime.values.80h') },
            ],
          },
        ],
      },
      {
        title: t('detail.overview.association'),
        editStrategy: "structured",
        fields: [
          {
            key: "parentType",
            label: t('detail.overview.fields.parentType'),
            value: (data, contextData) => data.parentType || "dossier",
            displayValue: (data, contextData) => {
              const parentTypeOptions = {
                "dossier": t('detail.overview.fields.parentTypeOptions.dossier'),
                "lawsuit": t('detail.overview.fields.parentTypeOptions.lawsuit')
              };
              return parentTypeOptions[data.parentType] || t('detail.overview.fields.parentTypeOptions.dossier');
            },
            icon: "fas fa-link",
            type: "select",
            editable: true,
            required: true,
            options: [
              { value: "dossier", label: t('detail.overview.fields.parentTypeOptions.dossier') },
              { value: "lawsuit", label: t('detail.overview.fields.parentTypeOptions.lawsuit') },
            ],
            helpText: t('detail.overview.fields.parentTypeHelp'),
          },
          {
            key: "dossierId",
            label: t('detail.overview.fields.dossier'),
            value: (data, contextData) => data.dossierId || "",
            displayValue: (data) => {
              if (!data.dossierId) return t('detail.fallback.none');
              // Use hydrated dossier object if available
              if (data.dossier?.lawsuitNumber) return `${data.dossier.lawsuitNumber} - ${data.dossier.title}`;
              return t('detail.fallback.none');
            },
            icon: "fas fa-folder-open",
            type: "searchable-select",
            editable: true,
            options: [],
            getOptions: (editedData, contextData) => ([
              { value: "", label: t('detail.overview.fields.dossierPlaceholder') },
              ...(contextData?.dossiers || []).map(d => ({
                value: d.id,
                label: `${d.lawsuitNumber} - ${d.title}`
              }))
            ]),
            helpText: t('detail.overview.fields.dossierHelp')
          },
          {
            key: "lawsuitId",
            label: t('detail.overview.fields.lawsuit'),
            value: (data, contextData) => data.lawsuitId || "",
            displayValue: (data) => {
              if (!data.lawsuitId) return t('detail.fallback.none');
              // Use hydrated lawsuit object if available
              if (data.lawsuit?.lawsuitNumber) return `${data.lawsuit.lawsuitNumber} - ${data.lawsuit.title}`;
              return t('detail.fallback.none');
            },
            icon: "fas fa-gavel",
            type: "searchable-select",
            editable: true,
            options: [],
            getOptions: (editedData, contextData) => ([
              { value: "", label: t('detail.overview.fields.lawsuitPlaceholder') },
              ...(contextData?.lawsuits || []).map(c => ({
                value: c.id,
                label: `${c.lawsuitNumber} - ${c.title}`
              }))
            ]),
            helpText: t('detail.overview.fields.lawsuitHelp')
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

};





