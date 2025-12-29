import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { formatDateTimeValue, formatDateValue } from "../../../utils/dateFormat";

/**
 * Personal Task Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, category
 * ✅ Added structured edit mode for overview sections
 */

export const personalTaskConfig = {
  entityType: "personalTask",
  entityName: "Personal Task",
  icon: "fas fa-sticky-note",
  listRoute: "/personal-tasks",
  notFoundMessage: "Personal task not found",
  deleteConfirmMessage: "Are you sure you want to delete this personal task?",
  allowDelete: true,
  allowEdit: true,

  fetchData: async (id, contextData = null) => {
    // Convert id to number for comparison
    const numericId = parseInt(id);

    let personalTask;
    if (contextData?.personalTasks) {
      // Use contextData.personalTasks from DataContext (this is the live data)
      personalTask = contextData.personalTasks.find(pt => pt.id === numericId);
    } else {
      // Fallback to mockPersonalTasksExtended (static data)
      personalTask = mockPersonalTasksExtended[numericId];
    }

    if (!personalTask) return null;

    // ✅ Compute aggregated related entities from contextData if available
    const financialEntries = contextData?.financialEntries || [];

    // Filter financial entries for this personal task (internal expenses)
    const relatedFinancialEntries = financialEntries.filter(entry =>
      entry.personalTaskId === numericId && entry.scope === 'internal'
    );

    return {
      ...personalTask,
      financialEntries: relatedFinancialEntries,
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updatePersonalTask) {
      // Use DataContext to update (this persists to localStorage and API)
      await contextData.updatePersonalTask(numericId, data);
    } else {
      // Fallback to updating mockPersonalTasksExtended
      if (mockPersonalTasksExtended[numericId]) {
        mockPersonalTasksExtended[numericId] = {
          ...mockPersonalTasksExtended[numericId],
          ...data,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.deletePersonalTask) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deletePersonalTask(numericId);
    } else {
      console.log("Deleting personal task:", numericId);
    }
  },

  getTitle: (data) => data.title,
  getSubtitle: (data) => `Created on ${formatDateTimeValue(data.createdDate)} • ${data.category}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Status",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Not Started", label: "Not Started", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
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
      key: "category",
      label: "Category",
      icon: "fas fa-tag",
      colorMap: false,
      options: [
        { value: "Invoices", label: "Invoices" },
        { value: "Office", label: "Office" },
        { value: "Personal", label: "Personal" },
        { value: "IT", label: "IT" },
        { value: "Administrative", label: "Administrative" },
        { value: "Other", label: "Other" },
      ]
    }
  ],

  renderHeader: (data) => {
    const priorityConfig = {
      "High": {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-800 dark:text-red-400",
        icon: "fas fa-arrow-up",
      },
      "Medium": {
        bg: "bg-amber-100 dark:bg-amber-900/30",
        text: "text-amber-800 dark:text-amber-400",
        icon: "fas fa-minus",
      },
      "Low": {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-800 dark:text-green-400",
        icon: "fas fa-arrow-down",
      },
    };

    const categoryIcons = {
      "Invoices": "fas fa-file-invoice-dollar text-green-600",
      "Office": "fas fa-briefcase text-blue-600",
      "Personal": "fas fa-user text-purple-600",
      "IT": "fas fa-laptop text-indigo-600",
      "Administrative": "fas fa-clipboard text-slate-600",
      "Other": "fas fa-sticky-note text-amber-600",
    };

    const priority = priorityConfig[data.priority];

    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center text-white text-xl flex-shrink-0">
                <i className={categoryIcons[data.category] || "fas fa-sticky-note"}></i>
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                  {data.title}
                </h2>
                <p className="text-slate-600 dark:text-slate-400">
                  <i className="fas fa-tag mr-2"></i>
                  {data.category}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${priority.bg} ${priority.text}`}>
                <i className={priority.icon}></i>
                Priority {data.priority}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard
              icon="fas fa-calendar-alt"
              label="Due Date"
              value={data.dueDate ? formatDateValue(data.dueDate) : "N/A"}
              color="blue"
            />
            <InfoCard
              icon="fas fa-flag"
              label="Priority"
              value={data.priority}
              color={data.priority === "High" ? "red" : data.priority === "Medium" ? "amber" : "green"}
            />
            <InfoCard
              icon="fas fa-info-circle"
              label="Status"
              value={data.status}
              color="purple"
            />
          </div>
        </div>
      </ContentSection>
    );
  },

  getStats: (data) => [
    {
      icon: "fas fa-calendar-check",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.dueDate ? formatDateValue(data.dueDate) : "N/A",
      label: "Due Date"
    },
    {
      icon: "fas fa-tag",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.category,
      label: "Category"
    },
    {
      icon: "fas fa-flag",
      iconColor: data.priority === "High" ? "text-red-600 dark:text-red-400" :
        data.priority === "Medium" ? "text-amber-600 dark:text-amber-400" :
          "text-green-600 dark:text-green-400",
      bgColor: data.priority === "High" ? "bg-red-100 dark:bg-red-900/20" :
        data.priority === "Medium" ? "bg-amber-100 dark:bg-amber-900/20" :
          "bg-green-100 dark:bg-green-900/20",
      value: data.priority,
      label: "Priority"
    },
  ],

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
      description: "Office fees and internal expenses related to this task",
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
      id: "timeline",
      label: "History",
      icon: "fas fa-history",
      component: "history",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "General Information",
      editStrategy: "structured",
      fields: [
        {
          key: "title",
          label: "Task Title",
          value: (data) => data.title,
          icon: "fas fa-sticky-note",
          type: "text",
          editable: true,
          required: true,
          fullWidth: true,
        },
        {
          key: "dueDate",
          label: "Due Date",
          value: (data) => data.dueDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Task Description",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "No description",
    },
    {
      title: "Notes",
      editStrategy: "structured",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "No notes",
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
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
