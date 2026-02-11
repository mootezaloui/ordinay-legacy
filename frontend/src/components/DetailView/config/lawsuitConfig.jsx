import { Link } from "react-router-dom";
import i18next from "i18next";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { sessionFormFields, taskFormFields, getMissionFormFields } from "../../FormModal/formConfigs";
import { calculateNextHearing, formatDate, getDeadlineUrgency } from "../../../utils/deadlineUtils";
import { formatDateValue } from "../../../utils/dateFormat";
import { translateStatus } from "../../../utils/entityTranslations";

/**
 * Lawsuit (Procès) Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Audiences tab creates Sessions (Séances Juridiques)
 * ✅ UPDATED: Added Tasks tab for lawsuit-specific tasks
 * ✅ Fully internationalized with i18n support
 */
export const createLawsuitConfig = (t) => {
  const tSessions = (key, options) => i18next.t(key, { ns: "sessions", ...options });

  return ({
    // Basic info
    entityType: "lawsuit",
    entityName: t('detail.entityName'),
    icon: "fas fa-gavel",
    listRoute: "/lawsuits",

    // Messages
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),

    // Permissions
    allowDelete: true,
    allowEdit: true,

    // Data fetching
    fetchData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      let lawsuitData;
      if (contextData?.lawsuits) {
        // Use contextData.lawsuits from DataContext (this is the live data)
        lawsuitData = contextData.lawsuits.find(c => c.id === numericId);
      } else {
        // Fallback to null (static data)
        lawsuitData = null[numericId];
      }
      if (!lawsuitData) return null;

      // ✅ Always resolve dossier from dossierId using latest context data
      const sessions = contextData?.sessions || [];
      const tasks = contextData?.tasks || [];
      const dossiers = contextData?.dossiers || [];
      const clients = contextData?.clients || [];
      const financialEntries = contextData?.financialEntries || [];
      let dossier = null;
      let client = null;
      if (lawsuitData.dossierId) {
        const foundDossier = dossiers.find(d => d.id === parseInt(lawsuitData.dossierId));
        if (foundDossier) {
          dossier = {
            id: foundDossier.id,
            lawsuitNumber: foundDossier.lawsuitNumber,
            title: foundDossier.title,
            clientId: foundDossier.clientId,
          };

          if (foundDossier.clientId) {
            const foundClient = clients.find(c => c.id === parseInt(foundDossier.clientId));
            if (foundClient) {
              client = {
                id: foundClient.id,
                name: foundClient.name,
              };
            }
          }
        }
      }

      // Only include sessions directly linked to this lawsuit
      const lawsuitSessions = sessions.filter((s) => s.lawsuitId === numericId);
      const relatedFinancialEntries = financialEntries.filter(entry =>
        entry.lawsuitId === numericId && entry.scope === 'client'
      );

      // ✅ Calculate dynamic next hearing from all related sessions
      const nextHearingObj = calculateNextHearing(lawsuitData, lawsuitSessions);

      // Fetch documents for this lawsuit
      let documents = [];
      try {
        const documentService = (await import("../../../services/documentService")).default;
        documents = await documentService.getEntityDocuments("lawsuit", numericId);
      } catch (err) {
        console.error('[lawsuitConfig] Failed to load documents:', err);
      }

      return {
        ...lawsuitData,
        dossier: dossier || { id: null, lawsuitNumber: t('detail.fallback.na'), title: t('detail.fallback.unknownDossier') },
        client: client || { id: null, name: t('detail.fallback.unknownClient', { defaultValue: 'Unknown client' }) },
        // Always derive related collections from live context (avoid stale embedded arrays)
        sessions: lawsuitSessions,
        tasks: tasks.filter((t) => t.parentType === "lawsuit" && t.lawsuitId === numericId),
        financialEntries: relatedFinancialEntries,
        documents,
        // ✅ Add computed next hearing
        computedNextHearing: nextHearingObj,
      };
    },

    updateData: async (id, data, contextData = null) => {
      const numericId = parseInt(id);

      // Filter out relationship fields - lawsuit entity should only contain lawsuit-specific data
      const lawsuitFields = [
        'lawsuitNumber', 'title', 'dossierId', 'court',
        'filingDate', 'nextHearing', 'courtReference', 'adversaryParty',
        'adversaryLawyer', 'judgmentNumber', 'judgmentDate', 'status', 'description', 'notes'
      ];
      const lawsuitData = Object.keys(data).reduce((acc, key) => {
        if (lawsuitFields.includes(key)) {
          acc[key] = data[key];
        }
        return acc;
      }, {});

      // Only update if there are actual lawsuit fields to update
      if (Object.keys(lawsuitData).length > 0) {
        if (contextData?.updateLawsuit) {
          // Use DataContext to update (this persists to localStorage)
          contextData.updateLawsuit(numericId, lawsuitData);
        } else {
          // Fallback to updating null
          if (null[numericId]) {
            null[numericId] = {
              ...null[numericId],
              ...lawsuitData,
            };
          }
        }
      }
      // If no lawsuit fields to update, skip the update (this happens when only relationship fields change)
      await new Promise(resolve => setTimeout(resolve, 500));
    },

    deleteData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      if (contextData?.deleteLawsuit) {
        // Use DataContext to delete (this persists to localStorage)
        contextData.deleteLawsuit(numericId);
      }
    },

    // Header display
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
          { value: "In Progress", label: t('detail.quickActions.status.inProgress'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
          { value: "On Hold", label: t('detail.quickActions.status.onHold'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
          { value: "Closed", label: t('detail.quickActions.status.closed'), color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        ]
      }
    ],

    // Custom header rendering
    renderHeader: (data) => {
      return (
        <ContentSection>
          <div className="p-6" data-tutorial="lawsuit-detail-header">
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
                    {data.client?.name || t('detail.fallback.unknownClient', { defaultValue: 'Unknown client' })}
                  </span>
                )}
                {data.dossier?.id ? (
                  <Link
                    to={`/dossiers/${data.dossier.id}`}
                    className="mt-1 text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
                  >
                    <i className="fas fa-folder-open"></i>
                    {data.dossier.lawsuitNumber} - {data.dossier.title}
                  </Link>
                ) : (
                  <span className="mt-1 text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <i className="fas fa-folder-open"></i>
                    {data.dossier?.title || t('detail.header.noDossier')}
                  </span>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {translateStatus(data.status, "lawsuits", t)}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <InfoCard icon="fas fa-landmark" label={t('detail.header.court')} value={data.court} color="purple" />
              {(() => {
                const hearing = data.computedNextHearing;
                if (!hearing) {
                  return <InfoCard icon="fas fa-calendar-alt" label={t('detail.header.nextHearing')} value={t('detail.fallback.noHearings')} color="amber" />;
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
                  subtitle += ` ${t('detail.header.at')} ${hearing.time}`;
                }
                if (hearing.location) {
                  subtitle += ` - ${hearing.location}`;
                }

                return (
                  <InfoCard
                    icon="fas fa-calendar-alt"
                    label={t('detail.header.nextHearing')}
                    value={formattedDate}
                    subtitle={subtitle}
                    color={urgencyColors[urgency]}
                    linkTo={linkTo}
                  />
                );
              })()}
              <InfoCard icon="fas fa-user-tie" label={t('detail.header.adversaryLawyer')} value={data.adversaryLawyer} color="amber" />
            </div>
          </div>
        </ContentSection>
      );
    },

    // Stats cards
    getStats: (data) => {
      const hearing = data.computedNextHearing;
      const hearingValue = hearing ? formatDate(hearing.date) : t('detail.fallback.noHearings');

      return [
        {
          icon: "fas fa-calendar-check",
          iconColor: "text-red-600 dark:text-red-400",
          bgColor: "bg-red-100 dark:bg-red-900/20",
          value: hearingValue,
          label: t('detail.header.nextHearing')
        },
        {
          icon: "fas fa-file",
          iconColor: "text-purple-600 dark:text-purple-400",
          bgColor: "bg-purple-100 dark:bg-purple-900/20",
          value: data.documents?.length || 0,
          label: t('detail.tabs.documents')
        },
        {
          icon: "fas fa-history",
          iconColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-100 dark:bg-blue-900/20",
          value: data.sessions?.length || 0,
          label: t('detail.tabs.sessions')
        },
      ];
    },

    // Tabs configuration
    tabs: [
      {
        id: "overview",
        label: t('detail.tabs.overview'),
        icon: "fas fa-eye",
        component: "overview",
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
        entityName: t('detail.sessions.entityName'),
        addSubtitle: t('detail.sessions.addSubtitle'),

        // Dynamic form fields - lawsuitId pre-filled and disabled since we're in lawsuit context
        getFormFields: (lawsuitData) => {
          // If the lawsuit is not linked to a dossier, return an empty array to trigger the UX message in AggregatedRelatedTab
          if (!lawsuitData.dossierId) {
            return [];
          }
          return sessionFormFields(tSessions).map(field => {
            if (field.name === 'lawsuitId') {
              return {
                ...field,
                type: 'select', // Use regular select instead of searchable-select when disabled
                defaultValue: lawsuitData.id,
                disabled: true, // Make it read-only
                options: [{
                  value: lawsuitData.id,
                  label: `${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`
                }],
                helpText: t('detail.sessions.help.lawsuitLink'),
              };
            }
            // Make linkType field non-editable - always linked to lawsuit
            if (field.name === 'linkType') {
              return {
                ...field,
                disabled: true, // Make it read-only
                defaultValue: 'lawsuit',
                helpText: t('detail.sessions.help.linkType'),
              };
            }
            // Hide dossierId field - not needed when adding to lawsuit
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
                placeholder: t('detail.sessions.placeholders.location'),
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
        entityName: t('detail.tasks.entityName'),
        addSubtitle: t('detail.tasks.addSubtitle'),
        // Dynamic form fields - lawsuitId and dossierId pre-filled based on context
        getFormFields: (lawsuitData) => {
          // Get parent dossier data
          const parentDossier = lawsuitData.dossier;
          const tTasks = (key) => i18next.t(key, { ns: "tasks" });

          return taskFormFields(tTasks).map(field => {
            // Default parentType to 'lawsuit' since we're in lawsuit context (opposite of dossier)
            if (field.name === 'parentType') {
              return {
                ...field,
                defaultValue: 'lawsuit',
                helpText: t('detail.tasks.help.parentType')
              };
            } else if (field.name === 'lawsuitId') {
              // Show this lawsuit (disabled/read-only)
              return {
                ...field,
                defaultValue: lawsuitData.id,
                disabled: true, // Make it read-only
                options: [{
                  value: lawsuitData.id,
                  label: `${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`
                }],
                helpText: t('detail.tasks.help.lawsuitLink'),
                // Override getOptions to use this lawsuit only when parentType is 'lawsuit'
                getOptions: (formData) => {
                  if (formData.parentType !== "lawsuit") return [];
                  return [{
                    value: lawsuitData.id,
                    label: `${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`
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
                  label: `${parentDossier.lawsuitNumber} - ${parentDossier.title}`
                }] : [],
                helpText: t('detail.tasks.help.dossierLink'),
                // Override getOptions to use parent dossier only when parentType is 'dossier'
                getOptions: (formData) => {
                  if (formData.parentType !== "dossier") return [];
                  return parentDossier ? [{
                    value: parentDossier.id,
                    label: `${parentDossier.lawsuitNumber} - ${parentDossier.title}`
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
        label: t('detail.tabs.missions'),
        icon: "fas fa-clipboard-list",
        component: "aggregatedRelated",
        aggregationType: "missions",
        getCount: (data) => data.missions?.length || 0,
        itemsKey: "missions",
        allowAdd: true,
        allowDelete: false,
        entityName: t('detail.missions.entityName'),
        addSubtitle: t('detail.missions.addSubtitle'),
        // Dynamic form fields - entityType and entityReference pre-filled
        getFormFields: (lawsuitData, contextData) => {
          // Generate a default mission number
          const year = new Date().getFullYear();
          const randomNum = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
          const defaultMissionNumber = `MIS-${year}-${randomNum}`;

          return getMissionFormFields().map(field => {
            if (field.name === 'entityType') {
              return {
                ...field,
                defaultValue: 'lawsuit',
                disabled: true,
              };
            } else if (field.name === 'entityReference') {
              return {
                ...field,
                defaultValue: lawsuitData.lawsuitNumber,
                disabled: true,
                helpText: t('detail.missions.help.lawsuitLink', { lawsuitNumber: lawsuitData.lawsuitNumber }),
              };
            } else if (field.name === 'missionNumber') {
              // Let lawyers input their own reference or leave blank for auto-generation
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
        editStrategy: "structured",
        fields: [
          {
            key: "lawsuitNumber",
            label: t('detail.overview.fields.lawsuitNumber'),
            value: (data) => data.lawsuitNumber,
            icon: "fas fa-hashtag",
            type: "text",
            editable: true
          },
          {
            key: "title",
            label: t('detail.overview.fields.title'),
            value: (data) => data.title,
            icon: "fas fa-file-alt",
            type: "text",
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
      {
        title: t('detail.overview.courtInfo'),
        editStrategy: "structured",
        fields: [
          {
            key: "court",
            label: t('detail.overview.fields.court'),
            value: (data) => data.court,
            icon: "fas fa-landmark",
            type: "select",
            editable: true,
            getOptions: (editedData) => {
              const baseOptions = [
                { value: "Court of First Instance", label: t('detail.overview.courtOptions.firstInstance') },
                { value: "Court of Appeal", label: t('detail.overview.courtOptions.appeal') },
                { value: "Court of Cassation", label: t('detail.overview.courtOptions.cassation') },
              ];
              const currentValue = editedData?.court;
              if (currentValue && !baseOptions.some((option) => option.value === currentValue)) {
                return [{ value: currentValue, label: currentValue }, ...baseOptions];
              }
              return baseOptions;
            }
          },
          {
            key: "courtReference",
            label: t('detail.overview.fields.courtReference'),
            value: (data) => data.courtReference,
            icon: "fas fa-hashtag",
            type: "text",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.dates'),
        editStrategy: "structured",
        fields: [
          {
            key: "filingDate",
            label: t('detail.overview.fields.filingDate'),
            value: (data) => data.filingDate,
            displayValue: (data) => data.filingDate ? formatDateValue(data.filingDate) : t('detail.fallback.na'),
            icon: "fas fa-calendar-plus",
            type: "date",
            editable: true
          },
          {
            key: "nextHearing",
            label: t('detail.header.nextHearing'),
            value: (data) => {
              const hearing = data.computedNextHearing;
              if (!hearing) return t('detail.fallback.noHearingsScheduled');
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
                    {t('detail.fallback.noHearingsScheduled')}
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
                critical: t('detail.nextHearing.badges.today'),
                urgent: t('detail.nextHearing.badges.urgent'),
                soon: t('detail.nextHearing.badges.soon'),
                normal: t('detail.nextHearing.badges.scheduled'),
              };

              // Build full label
              let fullLabel = hearing.label;
              if (hearing.time) {
                fullLabel += ` ${t('detail.header.at')} ${hearing.time}`;
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
                        {t('detail.nextHearing.viewDetails')}
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
        title: t('detail.overview.parties'),
        editStrategy: "structured",
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
            icon: "fas fa-user-tie",
            type: "text",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.judgment'),
        editStrategy: "structured",
        fields: [
          {
            key: "judgmentNumber",
            label: t('detail.overview.fields.judgmentNumber'),
            value: (data) => data.judgmentNumber,
            icon: "fas fa-hashtag",
            type: "text",
            editable: true
          },
          {
            key: "judgmentDate",
            label: t('detail.overview.fields.judgmentDate'),
            value: (data) => data.judgmentDate,
            displayValue: (data) => data.judgmentDate ? formatDateValue(data.judgmentDate) : t('detail.fallback.na'),
            icon: "fas fa-calendar-check",
            type: "date",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.relatedDossier'),
        editStrategy: "structured",
        fields: [
          {
            key: "dossierId",
            label: t('detail.overview.fields.associatedDossier'),
            value: (data, contextData) => data.dossierId || "",
            displayValue: (data, contextData) => {
              // For display purposes, show the full dossier info
              if (!data.dossierId) return t('detail.fallback.noDossier');
              const dossiers = contextData?.dossiers || [];
              const dossier = dossiers.find(d => d.id === parseInt(data.dossierId));
              if (dossier) return `${dossier.lawsuitNumber} - ${dossier.title}`;
              // Fallback to hydrated dossier object if available
              if (data.dossier?.lawsuitNumber) return `${data.dossier.lawsuitNumber} - ${data.dossier.title}`;
              return t('detail.fallback.noDossier');
            },
            icon: "fas fa-folder-open",
            type: "searchable-select",
            editable: true,
            required: true,
            getOptions: (editedData, contextData) => (contextData?.dossiers || []).map(d => ({
              value: d.id,
              label: `${d.lawsuitNumber} - ${d.title}`
            })),
            helpText: t('detail.overview.help.associatedDossier'),
            placeholder: t('detail.overview.placeholders.associatedDossier')
          },
        ],
      },
    ],
  });
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







