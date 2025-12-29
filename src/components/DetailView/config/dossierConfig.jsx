import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { taskFormFields, caseFormFields, sessionFormFields, missionFormFields } from "../../FormModal/formConfigs";
import { getAllPhases, addCustomPhase } from "../../../utils/phaseManager";
import { calculateNextDeadline, formatDate, getDeadlineNavigationPath, getDeadlineUrgency } from "../../../utils/deadlineUtils";

// Default phases for dossiers
const DEFAULT_PHASES = [
  { value: "Opening", label: "Opening" },
  { value: "Instruction", label: "Instruction" },
  { value: "Negotiation", label: "Negotiation" },
  { value: "Pleading", label: "Pleading" },
  { value: "Judgment", label: "Judgment" },
  { value: "Execution", label: "Execution" },
];

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
  notFoundMessage: "Dossier not found",
  deleteConfirmMessage: "Are you sure you want to delete this Dossier?",
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
      // Fallback to null (static data)
      console.log('[dossierConfig] null keys:', Object.keys(null));
      dossier = null[numericId];
    }
    console.log('[dossierConfig] Found dossier:', dossier);
    if (!dossier) return null;

    if (!dossier.transactions) {
      dossier.transactions = [];
    }

    // ✅ Compute aggregated related entities from contextData if available
    const sessions = contextData?.sessions || [];
    const tasks = contextData?.tasks || [];
    const cases = contextData?.cases || [];
    const financialEntries = contextData?.financialEntries || [];

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
    const relatedFinancialEntries = financialEntries.filter(entry =>
      entry.dossierId === numericId ||
      dossierCases.some(cas => cas.id === entry.caseId)
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

    return {
      ...dossier,
      client: client || { id: null, name: 'Client non assigné' },
      sessions: relatedSessions,
      tasks: relatedTasks,
      proceedings: dossierCases,
      financialEntries: relatedFinancialEntries,
      // ✅ Add computed next deadline
      computedNextDeadline: nextDeadlineObj,
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    // Filter out relationship fields - dossier entity should only contain dossier-specific data
    const dossierFields = [
      'caseNumber', 'title', 'clientId', 'category', 'priority', 'phase',
      'openDate', 'nextDeadline', 'description', 'status'
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
      contextData.updateDossier(numericId, dossierData);
    }
    // If no dossier fields to update, skip the update (this happens when only relationship fields change)
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
      label: "Status",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Open", label: "Open", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "On Hold", label: "On Hold", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Closed", label: "Closed", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ],
      // Validation now handled by domainRules service
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
      key: "phase",
      label: "Phase",
      icon: "fas fa-stream",
      colorMap: false,
      getOptions: () => getAllPhases(DEFAULT_PHASES),
      allowCreate: true,
      createLabel: "Add a phase",
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
                  {data.client?.name || "Client Not Assigned"}
                </span>
              )}
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

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-calendar" label="Opening Date" value={data.openDate} color="blue" />
            <InfoCard icon="fas fa-layer-group" label="Category" value={data.category} color="purple" />
            <InfoCard icon="fas fa-stream" label="Phase" value={data.phase || "Not defined"} color="green" />
            {(() => {
              const deadline = data.computedNextDeadline;
              if (!deadline) {
                return <InfoCard icon="fas fa-clock" label="Next deadline" value="No deadlines" color="amber" />;
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
                  label="Next deadline"
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
        label: "Documents"
      },
      {
        icon: "fas fa-tasks",
        iconColor: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/20",
        value: data.tasks?.length || 0,
        label: "Tasks"
      },
      {
        icon: "fas fa-gavel",
        iconColor: "text-green-600 dark:text-green-400",
        bgColor: "bg-green-100 dark:bg-green-900/20",
        value: data.proceedings?.length || 0,
        label: "Lawsuits"
      },
      {
        icon: "fas fa-chart-line",
        iconColor: totalRevenue >= totalExpenses ? "text-green-600 dark:text-green-400" : "text-red-600 dark:text-red-400",
        bgColor: totalRevenue >= totalExpenses ? "bg-green-100 dark:bg-green-900/20" : "bg-red-100 dark:bg-red-900/20",
        value: `${(totalRevenue - totalExpenses).toFixed(0)} TND`,
        label: "Net Profit"
      },
    ];
  },

  tabs: [
    {
      id: "overview",
      label: "Overview",
      icon: "fas fa-eye",
      component: "overview",
    },
    {
      id: "proceedings",
      label: "Lawsuits",
      icon: "fas fa-gavel",
      component: "aggregatedRelated",
      aggregationType: "cases",
      getCount: (data) => data.proceedings?.length || 0,
      itemsKey: "proceedings",
      allowAdd: true,
      allowDelete: true,
      entityName: "a lawsuit",
      addSubtitle: "Create a new lawsuit for this Dossier",
      formFields: caseFormFields.filter(field => field.name !== 'dossierId'),
    },
    {
      id: "sessions",
      label: "Hearings",
      icon: "fas fa-calendar-alt",
      component: "aggregatedRelated",
      aggregationType: "sessions",
      getCount: (data) => data.sessions?.length || 0,
      itemsKey: "sessions",
      allowAdd: true,
      allowDelete: false,
      entityName: "a hearing",
      addSubtitle: "Create a new hearing for this Dossier",
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
                ? "Choose if this hearing is linked to this Dossier or a specific lawsuit"
                : "This hearing will be linked to this Dossier (no lawsuits available)"
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
                ? "No lawsuits available. Please create a lawsuit first."
                : "Select the lawsuit to which this hearing will be linked",
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
              helpText: "This hearing will be linked to this Dossier",
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
      label: "Tasks",
      icon: "fas fa-tasks",
      component: "aggregatedRelated",
      aggregationType: "tasks",
      getCount: (data) => data.tasks?.length || 0,
      itemsKey: "tasks",
      allowAdd: true,
      allowDelete: false,
      entityName: "a task",
      addSubtitle: "Create a new task for this Dossier",
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
                ? "Choose if this task concerns the Dossier in general or a specific lawsuit"
                : "This task will be linked to the Dossier (no lawsuits available)"
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
              helpText: "This task will be linked to this Dossier",
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
                ? "No lawsuits available. Please create a lawsuit first."
                : "Select the lawsuit to which this task will be linked",
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
      entityName: "a mission",
      addSubtitle: "Create a new officer mission for this Dossier",
      // Dynamic form fields - entityType and entityReference pre-filled
      getFormFields: (dossierData, contextData) => {
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
              helpText: `This mission will be linked to the Dossier ${dossierData.caseNumber}`,
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
      label: "Accounting",
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
      label: "History",
      icon: "fas fa-history",
      component: "history",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "General Information",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      fields: [
        {
          key: "caseNumber",
          label: "Dossier Number",
          value: (data) => data.caseNumber,
          icon: "fas fa-hashtag",
          type: "text",
          editable: true,
          helpText: "Format: DOS-YEAR-NUMBER"
        },
        {
          key: "title",
          label: "Dossier Title",
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
          displayValue: (data, contextData) => {
            const clientId = data.clientId || data.client?.id;
            const clients = contextData?.clients || [];
            const client = clients.find(c => c.id == clientId);
            return client ? client.name : "Unknown Client";
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
          helpText: "Attention: Changing the client will transfer the file to another client"
        },
        {
          key: "category",
          label: "Catégorie",
          value: (data) => data.category,
          icon: "fas fa-layer-group",
          type: "select",
          editable: true,
          options: [
            { value: "Commercial", label: "Commercial Law" },
            { value: "Family", label: "Family Law" },
            { value: "Criminal", label: "Criminal Law" },
            { value: "Labor", label: "Labor Law" },
            { value: "Real Estate", label: "Real Estate Law" },
            { value: "Administrative", label: "Administrative Law" },
            { value: "Tax", label: "Tax Law" },
            { value: "Other", label: "Other" },
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
            { value: "Opening", label: "Opening" },
            { value: "Instruction", label: "Instruction" },
            { value: "Negotiation", label: "Negotiation" },
            { value: "Pleading", label: "Pleading" },
            { value: "Judgment", label: "Judgment" },
            { value: "Execution", label: "Execution" },
          ]
        },
        {
          key: "openDate",
          label: "Opening Date",
          value: (data) => data.openDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "nextDeadline",
          label: "Next Deadline",
          value: (data) => {
            const deadline = data.computedNextDeadline;
            if (!deadline) return "No upcoming deadlines";
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
                  No upcoming deadlines
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
              critical: "Critical",
              urgent: "Urgent",
              soon: "Soon",
              normal: "Planned",
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
                      View details
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
      title: "Dossier Description",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      type: "description",
      fieldKey: "description",
      content: (data) => data.description,
    },
    {
      title: "Adverse Party",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      fields: [
        {
          key: "adversaryParty",
          label: "Name",
          value: (data) => data.adversaryParty,
          icon: "fas fa-user",
          type: "text",
          editable: true
        },
        {
          key: "adversaryLawyer",
          label: "Lawyer",
          value: (data) => data.adversaryLawyer,
          icon: "fas fa-gavel",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Legal Information",
      editStrategy: "structured", // ✅ Requires explicit Edit button
      fields: [
        {
          key: "courtReference",
          label: "Court Reference",
          value: (data) => data.courtReference,
          icon: "fas fa-balance-scale",
          type: "text",
          editable: true
        },
        {
          key: "estimatedValue",
          label: "Estimated Value",
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
