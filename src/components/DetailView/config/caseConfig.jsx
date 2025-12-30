import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { sessionFormFields, taskFormFields, missionFormFields } from "../../FormModal/formConfigs";
import { calculateNextHearing, formatDate, getDeadlineUrgency } from "../../../utils/deadlineUtils";
import { formatDateValue } from "../../../utils/dateFormat";

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
  entityName: "lawsuit",
  icon: "fas fa-gavel",
  listRoute: "/cases",

  // Messages
  notFoundMessage: "Lawsuit not found",
  deleteConfirmMessage: "Are you sure you want to delete this lawsuit?",

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
      // Fallback to null (static data)
      console.log('[caseConfig] null keys:', Object.keys(null));
      caseData = null[numericId];
    }
    console.log('[caseConfig] Found case:', caseData);
    if (!caseData) return null;

    // ✅ Always resolve dossier from dossierId using latest context data
    const sessions = contextData?.sessions || [];
    const tasks = contextData?.tasks || [];
    const dossiers = contextData?.dossiers || [];
    const financialEntries = contextData?.financialEntries || [];
    let dossier = null;
    if (caseData.dossierId) {
      const foundDossier = dossiers.find(d => d.id === parseInt(caseData.dossierId));
      if (foundDossier) {
        dossier = {
          id: foundDossier.id,
          caseNumber: foundDossier.caseNumber,
          title: foundDossier.title
        };
      }
    }

    // Aggregate all sessions related to this case (by caseId or dossierId)
    const caseSessions = sessions.filter((s) => s.caseId === numericId || s.dossierId === caseData.dossierId);
    const relatedFinancialEntries = financialEntries.filter(entry =>
      entry.caseId === numericId && entry.scope === 'client'
    );

    // ✅ Calculate dynamic next hearing from all related sessions
    const nextHearingObj = calculateNextHearing(caseData, caseSessions);

    return {
      ...caseData,
      dossier: dossier || { id: null, caseNumber: 'N/A', title: 'Unknown Dossier' },
      // Always derive related collections from live context (avoid stale embedded arrays)
      sessions: caseSessions,
      tasks: tasks.filter((t) => t.parentType === "case" && t.caseId === numericId),
      financialEntries: relatedFinancialEntries,
      // ✅ Add computed next hearing
      computedNextHearing: nextHearingObj,
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    // Filter out relationship fields - case entity should only contain case-specific data
    const caseFields = [
      'caseNumber', 'title', 'dossierId', 'court',
      'filingDate', 'nextHearing', 'referenceNumber', 'adversaryParty',
      'adversaryLawyer', 'status', 'description', 'notes' // ✅ Added notes
    ];
    const caseData = Object.keys(data).reduce((acc, key) => {
      if (caseFields.includes(key)) {
        acc[key] = data[key];
      }
      return acc;
    }, {});

    // Only update if there are actual case fields to update
    if (Object.keys(caseData).length > 0) {
      if (contextData?.updateCase) {
        // Use DataContext to update (this persists to localStorage)
        contextData.updateCase(numericId, caseData);
      } else {
        // Fallback to updating null
        if (null[numericId]) {
          null[numericId] = {
            ...null[numericId],
            ...caseData,
          };
        }
      }
    }
    // If no case fields to update, skip the update (this happens when only relationship fields change)
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
      label: "status",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "In Progress", label: "In Progress", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "On Hold", label: "On Hold", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Closed", label: "Closed", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
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
                  {data.dossier?.title || 'No Dossier Assigned'}
                </span>
              )}
            </div>
            <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
              {data.status}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-landmark" label="Court" value={data.court} color="purple" />
            {(() => {
              const hearing = data.computedNextHearing;
              if (!hearing) {
                return <InfoCard icon="fas fa-calendar-alt" label="Next hearing" value="No hearings" color="amber" />;
              }

              const formattedDate = formatDate(hearing.date);
              const urgency = getDeadlineUrgency(hearing);
              const linkTo = hearing.entityId ? `/sessions/${hearing.entityId}` : null;

              // Choose color based on urgency
              const urgencyColors = {
                critical: "red",
                urgent: "red",
                soon: "amber",
                normal: "amber",
              };

              // Format subtitle with time and location if available
              let subtitle = hearing.label;
              if (hearing.time) {
                subtitle += ` at ${hearing.time}`;
              }
              if (hearing.location) {
                subtitle += ` - ${hearing.location}`;
              }

              return (
                <InfoCard
                  icon="fas fa-calendar-alt"
                  label="Next hearing"
                  value={formattedDate}
                  subtitle={subtitle}
                  color={urgencyColors[urgency]}
                  linkTo={linkTo}
                />
              );
            })()}
            <InfoCard icon="fas fa-user-tie" label="Adversary Lawyer" value={data.adversaryLawyer} color="amber" />
          </div>
        </div>
      </ContentSection>
    );
  },

  // Stats cards
  getStats: (data) => {
    const hearing = data.computedNextHearing;
    const hearingValue = hearing ? formatDate(hearing.date) : "No hearings";

    return [
      {
        icon: "fas fa-calendar-check",
        iconColor: "text-red-600 dark:text-red-400",
        bgColor: "bg-red-100 dark:bg-red-900/20",
        value: hearingValue,
        label: "Next hearing"
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
        label: "Hearings"
      },
    ];
  },

  // Tabs configuration
  tabs: [
    {
      id: "overview",
      label: "Overview",
      icon: "fas fa-eye",
      component: "overview",
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
      addSubtitle: "Create a new legal hearing for this case",

      // Dynamic form fields - caseId pre-filled and disabled since we're in case context
      getFormFields: (caseData) => {
        // If the case is not linked to a dossier, return an empty array to trigger the UX message in AggregatedRelatedTab
        if (!caseData.dossierId) {
          return [];
        }
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
              helpText: "This hearing will be linked to this case",
            };
          }
          // Make linkType field non-editable - always linked to case
          if (field.name === 'linkType') {
            return {
              ...field,
              disabled: true, // Make it read-only
              defaultValue: 'case',
              helpText: "This hearing is linked to this case",
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
              placeholder: "Hearing room / Meeting location",
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
      addSubtitle: "Create a new task for this case",
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
              helpText: "Choose if this task concerns the lawsuit or the parent dossier"
            };
          } else if (field.name === 'caseId') {
            // Show this case (disabled/read-only)
            return {
              ...field,
              defaultValue: caseData.id,
              disabled: true, // Make it read-only
              options: [{
                value: caseData.id,
                label: `${caseData.caseNumber} - ${caseData.title}`
              }],
              helpText: "This task will be linked to this lawsuit",
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
              helpText: "This task will be linked to the parent dossier",
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
      entityName: "mission",
      addSubtitle: "Create a new bailiff mission for this lawsuit",
      // Dynamic form fields - entityType and entityReference pre-filled
      getFormFields: (caseData, contextData) => {
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
              helpText: `This mission will be linked to the lawsuit ${caseData.caseNumber}`,
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
      fieldKey: "notes", // ✅ Explicitly set field key for clarity
      getCount: (data) => {
        if (!data.notes) return 0;
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

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "General Information",
      editStrategy: "structured",
      fields: [
        {
          key: "caseNumber",
          label: "Lawsuit Number",
          value: (data) => data.caseNumber,
          icon: "fas fa-hashtag",
          type: "text",
          editable: true
        },
        {
          key: "title",
          label: "Lawsuit Title",
          value: (data) => data.title,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Lawsuit Description",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "No description",
    },
    {
      title: "Court Information",
      editStrategy: "structured",
      fields: [
        {
          key: "court",
          label: "Court",
          value: (data) => data.court,
          icon: "fas fa-landmark",
          type: "select",
          editable: true,
          options: [
            { value: "Court of First Instance", label: "Court of First Instance" },
            { value: "Court of Appeal", label: "Court of Appeal" },
            { value: "Court of Cassation", label: "Court of Cassation" },
          ]
        },
        {
          key: "referenceNumber",
          label: "Reference Number",
          value: (data) => data.referenceNumber,
          icon: "fas fa-hashtag",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Important Dates",
      editStrategy: "structured",
      fields: [
        {
          key: "filingDate",
          label: "Filing Date",
          value: (data) => data.filingDate,
          displayValue: (data) => data.filingDate ? formatDateValue(data.filingDate) : "N/A",
          icon: "fas fa-calendar-plus",
          type: "date",
          editable: true
        },
        {
          key: "nextHearing",
          label: "Next Hearing",
          value: (data) => {
            const hearing = data.computedNextHearing;
            if (!hearing) return "No hearings scheduled";
            return formatDate(hearing.date);
          },
          icon: "fas fa-calendar-alt",
          type: "custom",
          editable: false,
          customRender: (data) => {
            const hearing = data.computedNextHearing;
            if (!hearing) {
              return (
                <div className="text-slate-500 dark:text-slate-400 text-sm">
                  No hearings scheduled
                </div>
              );
            }

            const formattedDate = formatDate(hearing.date);
            const urgency = getDeadlineUrgency(hearing);
            const linkTo = hearing.entityId ? `/sessions/${hearing.entityId}` : null;

            // Urgency badge colors
            const urgencyStyles = {
              critical: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-red-300 dark:border-red-700",
              urgent: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-orange-300 dark:border-orange-700",
              soon: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 border-amber-300 dark:border-amber-700",
              normal: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-blue-300 dark:border-blue-700",
            };

            const urgencyLabels = {
              critical: "Today",
              urgent: "Urgent",
              soon: "Soon",
              normal: "Scheduled",
            };

            // Build full label
            let fullLabel = hearing.label;
            if (hearing.time) {
              fullLabel += ` at ${hearing.time}`;
            }
            if (hearing.location) {
              fullLabel += ` - ${hearing.location}`;
            }

            return (
              <div className="flex items-start gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-slate-900 dark:text-white font-medium">
                      {formattedDate}
                    </span>
                    {hearing.time && (
                      <span className="text-sm text-slate-600 dark:text-slate-400">
                        {hearing.time}
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium border ${urgencyStyles[urgency]}`}>
                      {urgencyLabels[urgency]}
                    </span>
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400">
                    {hearing.label}
                  </div>
                  {hearing.location && (
                    <div className="text-sm text-slate-500 dark:text-slate-500 mt-0.5">
                      <i className="fas fa-map-marker-alt mr-1"></i>
                      {hearing.location}
                    </div>
                  )}
                  {linkTo && (
                    <Link
                      to={linkTo}
                      className="text-sm text-blue-600 dark:text-blue-400 hover:underline inline-flex items-center gap-1 mt-1"
                    >
                      View Hearing Details
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
      title: "Parties",
      editStrategy: "structured",
      fields: [
        {
          key: "adversaryParty",
          label: "Adversary Party",
          value: (data) => data.adversaryParty,
          icon: "fas fa-user",
          type: "text",
          editable: true
        },
        {
          key: "adversaryLawyer",
          label: "Adversary Lawyer",
          value: (data) => data.adversaryLawyer,
          icon: "fas fa-user-tie",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Related Dossier",
      editStrategy: "structured",
      fields: [
        {
          key: "dossierId",
          label: "Associated Dossier",
          value: (data) => {
            // Return the dossierId for the select, not the full object
            return data.dossierId || "";
          },
          displayValue: (data) => {
            // For display purposes, show the full dossier info
            if (!data.dossierId) return "No dossier";
            const dossier = [].find(d => d.id === data.dossierId);
            if (dossier) return `${dossier.caseNumber} - ${dossier.title}`;
            // Fallback to hydrated dossier object if available
            if (data.dossier?.caseNumber) return `${data.dossier.caseNumber} - ${data.dossier.title}`;
            return "No dossier";
          },
          icon: "fas fa-folder-open",
          type: "searchable-select",
          editable: true,
          required: true,
          getOptions: () => [].map(d => ({
            value: d.id,
            label: `${d.caseNumber} - ${d.title}`
          })),
          helpText: "Select the dossier associated with this case",
          placeholder: "Search for a dossier..."
        },
      ],
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color, linkTo = null, subtitle = null }) {
  const colors = {
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
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
