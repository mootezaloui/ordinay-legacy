import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import i18next from "i18next";
import { dossierFormFields, caseFormFields, sessionFormFields, taskFormFields } from "../../FormModal/formConfigs";
import { formatDateValue } from "../../../utils/dateFormat";

/**
 * Client Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Fully internationalized with i18n support
 */
export const createClientConfig = (t) => {
  const tDossiers = i18next.getFixedT("dossiers");
  const tCases = i18next.getFixedT("cases");
  const tTasks = i18next.getFixedT("tasks");
  const tSessions = i18next.getFixedT("sessions");

  return {
    entityType: "client",
    entityName: t('detail.entityName'),
    icon: "fas fa-user-circle",
    listRoute: "/clients",
    notFoundMessage: t('detail.notFound'),
    deleteConfirmMessage: t('detail.deleteConfirm'),
    allowDelete: true,
    allowEdit: true,

    fetchData: async (id, contextData = null) => {
      let client;

      // Convert id to number for comparison
      const numericId = parseInt(id);

      if (contextData?.clients) {
        // Use contextData.clients from DataContext (this is the live data)
        client = contextData.clients.find(c => c.id === numericId);
      } else {
        // Fallback to null (static data)
        client = null[numericId];
      }

      if (!client) return null;

      // ✅ Compute aggregated related entities from contextData if available
      const dossiers = contextData?.dossiers || [];
      const cases = contextData?.cases || [];
      const sessions = contextData?.sessions || [];
      const tasks = contextData?.tasks || [];
      const financialEntries = contextData?.financialEntries || [];

      const relatedDossiers = dossiers.filter(d => d.clientId === numericId);
      const relatedCases = cases.filter(cas =>
        relatedDossiers.some(dossier => dossier.id === cas.dossierId)
      );
      // Aggregate all sessions related to this client (by related cases or dossiers)
      const relatedSessions = sessions.filter(session =>
        relatedCases.some(cas => cas.id === session.caseId) ||
        relatedDossiers.some(dossier => dossier.id === session.dossierId)
      );
      const relatedTasks = tasks.filter(task =>
        task.clientId === numericId ||
        relatedDossiers.some(d => d.id === task.dossierId) ||
        relatedCases.some(c => c.id === task.caseId)
      );
      const relatedFinancialEntries = financialEntries.filter(entry =>
        entry.clientId === numericId && entry.scope === 'client'
      );

      return {
        ...client,
        relatedDossiers,
        relatedCases,
        relatedSessions,
        relatedTasks,
        financialEntries: relatedFinancialEntries,
        // For tab count compatibility:
        sessions: relatedSessions,
      };
    },

    updateData: async (id, data, contextData = null) => {
      const numericId = parseInt(id);

      // Filter out relationship fields - client entity should only contain client-specific data
      const clientFields = [
        'name', 'email', 'phone', 'alternatePhone', 'address', 'status',
        'cin', 'dateOfBirth', 'profession', 'company', 'taxId', 'notes', 'joinDate'
      ];
      const clientData = Object.keys(data).reduce((acc, key) => {
        if (clientFields.includes(key)) {
          acc[key] = data[key];
        }
        return acc;
      }, {});

      // Only update if there are actual client fields to update
      if (Object.keys(clientData).length > 0) {
        if (contextData?.updateClient) {
          // Use DataContext to update (this persists to localStorage)
          contextData.updateClient(numericId, clientData);
        } else {
          // Fallback to updating null
          if (null[numericId]) {
            null[numericId] = {
              ...null[numericId],
              ...clientData,
            };
          }
        }
      }
      // If no client fields to update, skip the update (this happens when only relationship fields change)
      await new Promise(resolve => setTimeout(resolve, 500));
    },

    deleteData: async (id, contextData = null) => {
      const numericId = parseInt(id);

      if (contextData?.deleteClient) {
        // Use DataContext to delete (this persists to localStorage)
        contextData.deleteClient(numericId);
      } else {
        console.log("Deleting client:", numericId);
      }
    },

    getTitle: (data) => data.name,
    getSubtitle: (data) => t('detail.subtitle', { date: formatDateValue(data.joinDate) }),

    // ✅ NEW: Quick Actions Configuration
    quickActions: [
      {
        key: "status",
        label: t('detail.quickActions.status.label'),
        icon: "fas fa-flag",
        colorMap: true,
        options: [
          { value: "Active", label: t('detail.quickActions.status.active'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
          { value: "Inactive", label: t('detail.quickActions.status.inactive'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
        ],
      }
    ],

    renderHeader: (data) => (
      <ContentSection>
        <div className="p-6" data-tutorial="client-detail-header">
          <div className="flex flex-col md:flex-row items-start gap-6">
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
              {data.name.split(' ').map(n => n.charAt(0)).join('')}
            </div>

            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.name}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    {data.profession} {data.company && `- ${data.company}`}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                  {t(`detail.quickActions.status.${(data.status || "").toLowerCase()}`, { defaultValue: data.status })}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <i className="fas fa-envelope text-blue-600 dark:text-blue-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.overview.fields.email')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-phone text-green-600 dark:text-green-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.overview.fields.phone')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-map-marker-alt text-red-600 dark:text-red-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.overview.fields.address')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.address}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    ),

    getStats: (data) => [
      {
        icon: "fas fa-folder-open",
        iconColor: "text-blue-600 dark:text-blue-400",
        bgColor: "bg-blue-100 dark:bg-blue-900/20",
        value: data.relatedDossiers?.length || 0,
        label: t('detail.stats.dossiers')
      },
      {
        icon: "fas fa-file",
        iconColor: "text-purple-600 dark:text-purple-400",
        bgColor: "bg-purple-100 dark:bg-purple-900/20",
        value: data.documents?.length || 0,
        label: t('detail.stats.documents')
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
        id: "dossiers",
        label: t('detail.tabs.dossiers'),
        icon: "fas fa-folder-open",
        component: "aggregatedRelated",
        aggregationType: "dossiers",
        getCount: (data) => data.relatedDossiers?.length || 0,
        itemsKey: "relatedDossiers",
        allowAdd: true,
        allowDelete: true,
        entityName: "dossier",
        addSubtitle: t('detail.tabs.dossiersAddSubtitle'),
        getFormFields: () => {
          const dossierT = (key) => i18next.t(key, { ns: "dossiers" });
          return dossierFormFields(dossierT).filter(field => field.name !== 'clientId');
        },
      },
      {
        id: "cases",
        label: t('detail.tabs.cases'),
        icon: "fas fa-gavel",
        component: "aggregatedRelated",
        aggregationType: "cases",
        itemsKey: "relatedCases",
        getCount: (data) => data.relatedCases?.length || 0,
        allowAdd: true,
        addEnabled: (clientData) => (clientData.relatedDossiers || []).length > 0,
        addDisabledText: t('detail.tabs.casesDisabled'),
        allowDelete: false,
        entityName: t('detail.tabs.casesEntity'),
        addSubtitle: t('detail.tabs.casesAddSubtitle'),
        // Dynamic form fields - dossierId options filtered to client's dossiers
        getFormFields: (clientData) => {
          const relatedDossiers = clientData.relatedDossiers || [];
          const caseT = (key) => i18next.t(key, { ns: "cases" });
          return caseFormFields(caseT).map(field => {
            if (field.name === 'dossierId') {
              return {
                ...field,
                options: relatedDossiers.map(dossier => ({
                  value: dossier.id,
                  label: `${dossier.caseNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.casesDossierHelp')
              };
            }
            return field;
          });
        },
      },
      {
        id: "sessions",
        label: t('detail.tabs.sessions'),
        icon: "fas fa-calendar-alt",
        component: "aggregatedRelated",
        aggregationType: "sessions",
        itemsKey: "relatedSessions",
        getCount: (data) => data.relatedSessions?.length || 0,
        allowAdd: true,
        addEnabled: (clientData) => (clientData.relatedDossiers || []).length > 0,
        addDisabledText: t('detail.tabs.sessionsDisabled'),
        allowDelete: false,
        entityName: t('detail.tabs.sessionsEntity'),
        addSubtitle: t('detail.tabs.sessionsAddSubtitle'),
        // Dynamic form fields - allow linking to either dossier or lawsuit
        getFormFields: (clientData) => {
          const relatedDossiers = clientData.relatedDossiers || [];
          const relatedCases = clientData.relatedCases || [];
          const sessionT = (key) => i18next.t(key, { ns: "sessions" });

          return sessionFormFields(sessionT).map(field => {
            // Allow linkType to be editable - choose between dossier and case
            if (field.name === 'linkType') {
              return {
                ...field,
                // Not disabled - user can choose
                defaultValue: 'case', // Default to case if available
                helpText: relatedCases.length > 0
                  ? t('detail.forms.sessionLinkHelpWithCases')
                  : t('detail.forms.sessionLinkHelpNoCases')
              };
            }
            if (field.name === 'caseId') {
              return {
                ...field,
                type: 'select', // Use regular select for better display
                options: relatedCases.map(cas => {
                  const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
                  return {
                    value: cas.id,
                    label: `${cas.caseNumber} - ${cas.title} (${parentDossier?.caseNumber || 'N/A'})`
                  };
                }),
                helpText: relatedCases.length === 0
                  ? t('detail.forms.casesEmpty')
                  : t('detail.forms.sessionCaseHelp'),
                // Only show this field when linkType is 'case'
                getOptions: (formData) => {
                  if (formData.linkType !== "case") return [];
                  return relatedCases.map(cas => {
                    const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
                    return {
                      value: cas.id,
                      label: `${cas.caseNumber} - ${cas.title} (${parentDossier?.caseNumber || 'N/A'})`
                    };
                  });
                }
              };
            }
            if (field.name === 'dossierId') {
              return {
                ...field,
                type: 'select', // Use regular select for better display
                options: relatedDossiers.map(dossier => ({
                  value: dossier.id,
                  label: `${dossier.caseNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.sessionDossierHelp'),
                // Only show this field when linkType is 'dossier'
                getOptions: (formData) => {
                  if (formData.linkType !== "dossier") return [];
                  return relatedDossiers.map(dossier => ({
                    value: dossier.id,
                    label: `${dossier.caseNumber} - ${dossier.title}`
                  }));
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
        itemsKey: "relatedTasks",
        getCount: (data) => data.relatedTasks?.length || 0,
        allowAdd: true,
        addEnabled: (clientData) => (clientData.relatedDossiers || []).length > 0,
        addDisabledText: t('detail.tabs.tasksDisabled'),
        allowDelete: false,
        entityName: t('detail.tabs.tasksEntity'),
        addSubtitle: t('detail.tabs.tasksAddSubtitle'),
        // Dynamic form fields - dossierId and caseId options filtered to client's entities
        getFormFields: (clientData) => {
          const relatedDossiers = clientData.relatedDossiers || [];
          const relatedCases = clientData.relatedCases || [];
          const taskT = (key) => i18next.t(key, { ns: "tasks" });

          return taskFormFields(taskT).map(field => {
            if (field.name === 'dossierId') {
              return {
                ...field,
                required: false,
                options: relatedDossiers.map(dossier => ({
                  value: dossier.id,
                  label: `${dossier.caseNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.taskDossierHelp'),
                // Override getOptions to use filtered options
                getOptions: (formData) => {
                  if (formData.parentType !== "dossier") return [];
                  return relatedDossiers.map(dossier => ({
                    value: dossier.id,
                    label: `${dossier.caseNumber} - ${dossier.title}`
                  }));
                }
              };
            } else if (field.name === 'caseId') {
              return {
                ...field,
                required: false,
                options: relatedCases.map(cas => {
                  const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
                  return {
                    value: cas.id,
                    label: `${cas.caseNumber} - ${cas.title} (${parentDossier?.caseNumber || 'N/A'})`
                  };
                }),
                helpText: relatedCases.length === 0
                  ? t('detail.forms.casesEmpty')
                  : t('detail.forms.taskCaseHelp'),
                // Override getOptions to use filtered options
                getOptions: (formData) => {
                  if (formData.parentType !== "case") return [];
                  return relatedCases.map(cas => {
                    const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
                    return {
                      value: cas.id,
                      label: `${cas.caseNumber} - ${cas.title} (${parentDossier?.caseNumber || 'N/A'})`
                    };
                  });
                }
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
        id: "history",
        label: t('detail.tabs.history'),
        icon: "fas fa-history",
        component: "history",
      },
    ],

    // ✅ UPDATED: Overview sections with editStrategy
    overviewSections: [
      {
        title: t('detail.overview.personal'),
        editStrategy: "structured",
        fields: [
          {
            key: "name",
            label: t('detail.overview.fields.name'),
            value: (data) => data.name,
            icon: "fas fa-user",
            type: "text",
            editable: true,
            required: true
          },
          {
            key: "cin",
            label: t('detail.overview.fields.cin'),
            value: (data) => data.cin,
            icon: "fas fa-id-card",
            type: "text",
            editable: true
          },
          {
            key: "dateOfBirth",
            label: t('detail.overview.fields.dob'),
            value: (data) => data.dateOfBirth,
            displayValue: (data) => data.dateOfBirth ? formatDateValue(data.dateOfBirth) : t('detail.fallback.na'),
            icon: "fas fa-birthday-cake",
            type: "date",
            editable: true
          },
          {
            key: "profession",
            label: t('detail.overview.fields.profession'),
            value: (data) => data.profession,
            icon: "fas fa-briefcase",
            type: "text",
            editable: true
          },
          {
            key: "company",
            label: t('detail.overview.fields.company'),
            value: (data) => data.company,
            icon: "fas fa-building",
            type: "text",
            editable: true
          },
          {
            key: "taxId",
            label: t('detail.overview.fields.taxId'),
            value: (data) => data.taxId,
            icon: "fas fa-file-alt",
            type: "text",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.contact'),
        editStrategy: "structured",
        fields: [
          {
            key: "email",
            label: t('detail.overview.fields.email'),
            value: (data) => data.email,
            icon: "fas fa-envelope",
            type: "email",
            editable: true,
            required: true
          },
          {
            key: "phone",
            label: t('detail.overview.fields.phone'),
            value: (data) => data.phone,
            icon: "fas fa-phone",
            type: "tel",
            editable: true,
            required: true
          },
          {
            key: "alternatePhone",
            label: t('detail.overview.fields.alternatePhone'),
            value: (data) => data.alternatePhone,
            icon: "fas fa-phone-alt",
            type: "tel",
            editable: true
          },
          {
            key: "address",
            label: t('detail.overview.fields.address'),
            value: (data) => data.address,
            icon: "fas fa-map-marker-alt",
            type: "textarea",
            editable: true,
            rows: 2
          },
        ],
      },
      {
        title: t('detail.overview.registration'),
        editStrategy: "structured",
        fields: [
          {
            key: "joinDate",
            label: t('detail.overview.fields.joinDate'),
            displayValue: (data) => data.joinDate ? formatDateValue(data.joinDate) : t('detail.fallback.na'),
            icon: "fas fa-calendar",
            type: "date",
            editable: true
          },
        ],
      },
      {
        title: t('detail.overview.notes'),
        editStrategy: "structured",
        type: "notes",
        fieldKey: "notes",
        content: (data) => data.notes || t('detail.overview.notesEmpty'),
      },
    ],
  };
};
