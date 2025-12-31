import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { getAllAssignees, addCustomAssignee } from "../../../utils/assigneeManager";
import { formatDateTimeValue, formatDateValue } from "../../../utils/dateFormat";

// Default assignees that are always available
const DEFAULT_ASSIGNEES = [
  { value: "Myself", label: "Myself" },
  { value: "Intern", label: "Intern" },
];

// Helper function to convert estimated time value to label
const getEstimatedTimeLabel = (value) => {
  if (!value) return "N/A";
  const timeMap = {
    "0.5h": "30 minutes",
    "1h": "1 hour",
    "1.5h": "1h30",
    "2h": "2 hours",
    "3h": "3 hours",
    "4h": "4 hours",
    "6h": "6 hours",
    "8h": "8 hours",
    "12h": "12 hours",
    "16h": "16 hours",
    "20h": "20 hours",
    "24h": "1 day",
    "40h": "2 days",
    "80h": "1 week",
  };
  return timeMap[value] || value;
};

/**
 * Task Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, assignedTo
 * ✅ Added structured edit mode for overview sections
 * ✅ UPDATED: Tasks can now belong to EITHER Dossier OR Case (Procès)
 */
export const taskConfig = {
  // Basic info
  entityType: "task",
  entityName: "Task",
  icon: "fas fa-tasks",
  listRoute: "/tasks",

  // Messages
  notFoundMessage: "Task not found",
  deleteConfirmMessage: "Are you sure you want to delete this task ?",

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

    // ✅ Always resolve dossier and case from IDs using latest context data
    const dossiers = contextData?.dossiers || [];
    const cases = contextData?.cases || [];
    const financialEntries = contextData?.financialEntries || [];

    let dossier = null;
    if (task.dossierId) {
      const foundDossier = dossiers.find(d => d.id === parseInt(task.dossierId));
      if (foundDossier) {
        dossier = {
          id: foundDossier.id,
          caseNumber: foundDossier.caseNumber,
          title: foundDossier.title
        };
      }
    }

    let caseData = null;
    if (task.caseId) {
      const foundCase = cases.find(c => c.id === parseInt(task.caseId));
      if (foundCase) {
        caseData = {
          id: foundCase.id,
          caseNumber: foundCase.caseNumber,
          title: foundCase.title
        };
      }
    }

    // Filter financial entries based on parent relationship
    let relatedFinancialEntries = [];
    if (task.parentType === "case" && task.caseId) {
      relatedFinancialEntries = financialEntries.filter(entry =>
        entry.caseId === task.caseId && entry.scope === 'client'
      );
    } else if (task.dossierId) {
      relatedFinancialEntries = financialEntries.filter(entry =>
        entry.dossierId === task.dossierId && entry.scope === 'client'
      );
    }

    return {
      ...task,
      dossier: dossier || null,
      case: caseData || null,
      financialEntries: relatedFinancialEntries,
    };
  },

  updateData: async (id, data, contextData = null, options = {}) => {
    const numericId = parseInt(id);

    // Filter out any potential relationship fields - task entity should only contain task-specific data
    const taskFields = [
      'title', 'parentType', 'dossierId', 'caseId', 'assignedTo', 'dueDate',
      'priority', 'status', 'description', 'estimatedTime', 'notes' // ✅ Added notes
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
    } else {
      console.log("Deleting task:", numericId);
    }
  },

  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => `Created on ${formatDateTimeValue(data.createdDate)}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Status",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Not Started", label: "Not Started", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
        { value: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Blocked", label: "Blocked", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
        { value: "Done", label: "Done", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Cancelled", label: "Cancelled", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
      ]
    },
    {
      key: "priority",
      label: "Priority",
      icon: "fas fa-flag",
      colorMap: true,
      options: [
        { value: "High", label: "High", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
        { value: "Medium", label: "Medium", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Low", label: "Low", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
      ]
    },
    {
      key: "assignedTo",
      label: "Assigned to",
      icon: "fas fa-user",
      colorMap: false,
      getOptions: () => getAllAssignees(DEFAULT_ASSIGNEES),
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
      createLabel: "Add"
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    const priorityColor = {
      "High": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
      "Medium": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Low": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
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
                Priority {data.priority}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard icon="fas fa-user" label="Assigned to" value={data.assignedTo} color="blue" />
            <InfoCard icon="fas fa-calendar" label="Due Date" value={formatDateValue(data.dueDate)} color="red" />
            <InfoCard icon="fas fa-clock" label="Estimated Time" value={getEstimatedTimeLabel(data.estimatedTime)} color="purple" />
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
      label: "Due Date"
    },
    {
      icon: "fas fa-user-check",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.assignedTo,
      label: "Assigned to"
    },
  ],

  // Tabs configuration
  tabs: [
    {
      id: "overview",
      label: "Overview",
      icon: "fas fa-eye",
      component: "overview",
    },
    {
      id: "financial",
      label: "Accounting",
      icon: "fas fa-coins",
      component: "financial",
      description: "Financial tracking related to this task",
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
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "comments",
      label: "Comments",
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
      label: "History",
      icon: "fas fa-history",
      component: "history",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy and parent selection
  overviewSections: [
    {
      title: "Task Description",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "No description",
    },
    {
      title: "Task Details",
      editStrategy: "structured",
      fields: [
        {
          key: "dueDate",
          label: "Due Date",
          value: (data, contextData) => data.dueDate,
          displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : "N/A",
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "estimatedTime",
          label: "Estimated Time",
          value: (data, contextData) => getEstimatedTimeLabel(data.estimatedTime),
          icon: "fas fa-clock",
          type: "select",
          editable: true,
          options: [
            { value: "0.5h", label: "30 minutes" },
            { value: "1h", label: "1 hour" },
            { value: "1.5h", label: "1h30" },
            { value: "2h", label: "2 hours" },
            { value: "3h", label: "3 hours" },
            { value: "4h", label: "4 hours" },
            { value: "6h", label: "6 hours" },
            { value: "8h", label: "8 hours" },
            { value: "12h", label: "12 hours" },
            { value: "16h", label: "16 hours" },
            { value: "20h", label: "20 hours" },
            { value: "24h", label: "1 day" },
            { value: "40h", label: "2 days" },
            { value: "80h", label: "1 week" },
          ],
        },
      ],
    },
    {
      title: "Associated Entity",
      editStrategy: "structured",
      fields: [
        {
          key: "parentType",
          label: "Link Type",
          value: (data, contextData) => data.parentType || "dossier",
          displayValue: (data, contextData) => {
            const parentTypeOptions = {
              "dossier": "Dossier",
              "case": "Lawsuit"
            };
            return parentTypeOptions[data.parentType] || "Dossier";
          },
          icon: "fas fa-link",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "dossier", label: "Dossier" },
            { value: "case", label: "Lawsuit" },
          ],
          helpText: "A task can be linked to either a Dossier or a Lawsuite",
        },
        {
          key: "dossierId",
          label: "Dossier",
          value: (data, contextData) => data.dossierId || "",
          displayValue: (data) => {
            if (!data.dossierId) return "None";
            // Use hydrated dossier object if available
            if (data.dossier?.caseNumber) return `${data.dossier.caseNumber} - ${data.dossier.title}`;
            return "None";
          },
          icon: "fas fa-folder-open",
          type: "searchable-select",
          editable: true,
          options: [],
          getOptions: (editedData, contextData) => ([
            { value: "", label: "Select a dossier..." },
            ...(contextData?.dossiers || []).map(d => ({
              value: d.id,
              label: `${d.caseNumber} - ${d.title}`
            }))
          ]),
          helpText: "Select the relevant dossier"
        },
        {
          key: "caseId",
          label: "Lawsuite",
          value: (data, contextData) => data.caseId || "",
          displayValue: (data) => {
            if (!data.caseId) return "None";
            // Use hydrated case object if available
            if (data.case?.caseNumber) return `${data.case.caseNumber} - ${data.case.title}`;
            return "None";
          },
          icon: "fas fa-gavel",
          type: "searchable-select",
          editable: true,
          options: [],
          getOptions: (editedData, contextData) => ([
            { value: "", label: "Select a lawsuit..." },
            ...(contextData?.cases || []).map(c => ({
              value: c.id,
              label: `${c.caseNumber} - ${c.title}`
            }))
          ]),
          helpText: "Select the relevant lawsuit"
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
