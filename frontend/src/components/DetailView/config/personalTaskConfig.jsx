import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { formatDateTimeValue, formatDateValue } from "../../../utils/dateFormat";
import { translateStatus, translatePriority, translatePersonalTaskCategory } from "../../../utils/entityTranslations";

/**
 * Personal Task Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status, priority, category
 * ✅ Added structured edit mode for overview sections
 * ✅ Fully internationalized with i18n support
 */

export const createPersonalTaskConfig = (t) => ({
  entityType: "personalTask",
  entityName: t('detail.entityName'),
  icon: "fas fa-sticky-note",
  listRoute: "/personal-tasks",
  notFoundMessage: t('detail.notFound'),
  deleteConfirmMessage: t('detail.deleteConfirm'),
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
    }
  },

  getTitle: (data) => data.title,
  getSubtitle: (data) => t('detail.subtitle', { date: formatDateTimeValue(data.createdDate), category: translatePersonalTaskCategory(data.category, t) }),

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: t('detail.quickActions.status.label'),
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Not Started", label: t('detail.quickActions.status.notStarted'), color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
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
      key: "category",
      label: t('detail.quickActions.category.label'),
      icon: "fas fa-tag",
      colorMap: true,
      options: [
        { value: "Invoices", label: t('detail.quickActions.category.invoices'), icon: "fas fa-file-invoice-dollar", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Office", label: t('detail.quickActions.category.office'), icon: "fas fa-briefcase", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Personal", label: t('detail.quickActions.category.personal'), icon: "fas fa-user", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
        { value: "IT", label: t('detail.quickActions.category.it'), icon: "fas fa-laptop", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400" },
        { value: "Administrative", label: t('detail.quickActions.category.administrative'), icon: "fas fa-clipboard", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Other", label: t('detail.quickActions.category.other'), icon: "fas fa-sticky-note", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
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

    const categoryConfig = {
      "Invoices": {
        icon: "fas fa-file-invoice-dollar",
        color: "text-green-600 dark:text-green-400",
      },
      "Office": {
        icon: "fas fa-briefcase",
        color: "text-blue-600 dark:text-blue-400",
      },
      "Personal": {
        icon: "fas fa-user",
        color: "text-purple-600 dark:text-purple-400",
      },
      "IT": {
        icon: "fas fa-laptop",
        color: "text-indigo-600 dark:text-indigo-400",
      },
      "Administrative": {
        icon: "fas fa-clipboard",
        color: "text-slate-600 dark:text-slate-400",
      },
      "Other": {
        icon: "fas fa-sticky-note",
        color: "text-amber-600 dark:text-amber-400",
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
    const category = categoryConfig[data.category];

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
                <p className="text-slate-600 dark:text-slate-400 flex items-center gap-2">
                  <i className={`${category?.icon} ${category?.color}`}></i>
                  {translatePersonalTaskCategory(data.category, t)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 ${priority?.bg || "bg-slate-200 dark:bg-slate-700"} ${priority?.text || "text-slate-800 dark:text-slate-300"}`}>
                <i className={priority?.icon || "fas fa-flag"}></i>
                {translatePriority(data.priority, t, "personalTasks")}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {translateStatus(data.status, "personalTasks", t)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoCard
              icon="fas fa-calendar-alt"
              label={t('detail.header.dueDate')}
              value={data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na')}
              color="blue"
            />
            <InfoCard
              icon="fas fa-flag"
              label={t('detail.header.priority')}
              value={translatePriority(data.priority, t, "personalTasks")}
              color={data.priority === "High" ? "red" : data.priority === "Medium" ? "amber" : "green"}
            />
            <InfoCard
              icon="fas fa-info-circle"
              label={t('detail.header.status')}
              value={translateStatus(data.status, "personalTasks", t)}
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
      value: data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na'),
      label: t('detail.header.dueDate')
    },
    {
      icon: "fas fa-tag",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: translatePersonalTaskCategory(data.category, t),
      label: t('detail.header.category')
    },
    {
      icon: "fas fa-flag",
      iconColor: data.priority === "High" ? "text-red-600 dark:text-red-400" :
        data.priority === "Medium" ? "text-amber-600 dark:text-amber-400" :
          "text-green-600 dark:text-green-400",
      bgColor: data.priority === "High" ? "bg-red-100 dark:bg-red-900/20" :
        data.priority === "Medium" ? "bg-amber-100 dark:bg-amber-900/20" :
          "bg-green-100 dark:bg-green-900/20",
      value: translatePriority(data.priority, t, "personalTasks"),
      label: t('detail.header.priority')
    },
  ],

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
      id: "notes",
      label: t('detail.tabs.notes', { ns: 'common' }),
      icon: "fas fa-sticky-note",
      component: "notes",
      fieldKey: "notes",
      getCount: (data) => {
        if (!data.notes) return 0;
        if (Array.isArray(data.notes)) return data.notes.length;
        return 1;
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
      editStrategy: "structured",
      fields: [
        {
          key: "title",
          label: t('detail.overview.fields.title'),
          value: (data) => data.title,
          icon: "fas fa-sticky-note",
          type: "text",
          editable: true,
          required: true,
          fullWidth: true,
        },
        {
          key: "dueDate",
          label: t('detail.overview.fields.dueDate'),
          value: (data) => data.dueDate,
          displayValue: (data) => data.dueDate ? formatDateValue(data.dueDate) : t('detail.fallback.na'),
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: t('detail.overview.description'),
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || t('detail.fallback.noDescription'),
    },
  ],
});

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
