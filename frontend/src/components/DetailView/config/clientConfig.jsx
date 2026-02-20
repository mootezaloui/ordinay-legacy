import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import i18next from "i18next";
import { dossierFormFields, lawsuitFormFields, sessionFormFields, taskFormFields } from "../../FormModal/formConfigs";
import { formatDateValue } from "../../../utils/dateFormat";

/**
 * Client Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Fully internationalized with i18n support
 */
export const createClientConfig = (t) => {
  const tDossiers = (key, options) => i18next.t(key, { ns: "dossiers", ...options });
  const tLawsuits = (key, options) => i18next.t(key, { ns: "lawsuits", ...options });
  const tTasks = (key, options) => i18next.t(key, { ns: "tasks", ...options });
  const tSessions = (key, options) => i18next.t(key, { ns: "sessions", ...options });

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
      const lawsuits = contextData?.lawsuits || [];
      const sessions = contextData?.sessions || [];
      const tasks = contextData?.tasks || [];
      const financialEntries = contextData?.financialEntries || [];

      const relatedDossiers = dossiers.filter(d => d.clientId === numericId);
      const relatedLawsuits = lawsuits.filter(lawsuit =>
        relatedDossiers.some(dossier => dossier.id === lawsuit.dossierId)
      );
      // Aggregate all sessions related to this client (by related lawsuits or dossiers)
      const relatedSessions = sessions.filter(session =>
        relatedLawsuits.some(lawsuit => lawsuit.id === session.lawsuitId) ||
        relatedDossiers.some(dossier => dossier.id === session.dossierId)
      );
      const relatedTasks = tasks.filter(task =>
        task.clientId === numericId ||
        relatedDossiers.some(d => d.id === task.dossierId) ||
        relatedLawsuits.some(c => c.id === task.lawsuitId)
      );
      const relatedFinancialEntries = financialEntries.filter(entry =>
        entry.clientId === numericId && entry.scope === 'client'
      );

      // Fetch documents for this client
      let documents = [];
      try {
        const documentService = (await import("../../../services/documentService")).default;
        documents = await documentService.getEntityDocuments("client", numericId);
      } catch (err) {
        console.error('[clientConfig] Failed to load documents:', err);
      }

      return {
        ...client,
        relatedDossiers,
        relatedLawsuits,
        relatedSessions,
        relatedTasks,
        financialEntries: relatedFinancialEntries,
        documents,
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
        entityName: t('detail.tabs.dossiersEntity'),
        addSubtitle: t('detail.tabs.dossiersAddSubtitle'),
        getFormFields: () => {
          const dossierT = (key) => i18next.t(key, { ns: "dossiers" });
          return dossierFormFields(dossierT).filter(field => field.name !== 'clientId');
        },
      },
      {
        id: "lawsuits",
        label: t('detail.tabs.lawsuits'),
        icon: "fas fa-gavel",
        component: "aggregatedRelated",
        aggregationType: "lawsuits",
        itemsKey: "relatedLawsuits",
        getCount: (data) => data.relatedLawsuits?.length || 0,
        allowAdd: true,
        addEnabled: (clientData) => (clientData.relatedDossiers || []).length > 0,
        addDisabledText: t('detail.tabs.lawsuitsDisabled'),
        allowDelete: false,
        entityName: t('detail.tabs.lawsuitsEntity'),
        addSubtitle: t('detail.tabs.lawsuitsAddSubtitle'),
        // Dynamic form fields - dossierId options filtered to client's dossiers
        getFormFields: (clientData) => {
          const relatedDossiers = clientData.relatedDossiers || [];
          const lawsuitT = (key) => i18next.t(key, { ns: "lawsuits" });
          return lawsuitFormFields(lawsuitT).map(field => {
            if (field.name === 'dossierId') {
              return {
                ...field,
                options: relatedDossiers.map(dossier => ({
                  value: dossier.id,
                  label: `${dossier.lawsuitNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.lawsuitsDossierHelp')
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
          const relatedLawsuits = clientData.relatedLawsuits || [];
          const sessionT = (key) => i18next.t(key, { ns: "sessions" });

          return sessionFormFields(sessionT).map(field => {
            // Allow linkType to be editable - choose between dossier and lawsuit
            if (field.name === 'linkType') {
              return {
                ...field,
                // Not disabled - user can choose
                defaultValue: 'lawsuit', // Default to lawsuit if available
                helpText: relatedLawsuits.length > 0
                  ? t('detail.forms.sessionLinkHelpWithLawsuits')
                  : t('detail.forms.sessionLinkHelpNoLawsuits')
              };
            }
            if (field.name === 'lawsuitId') {
              return {
                ...field,
                type: 'select', // Use regular select for better display
                options: relatedLawsuits.map(lawsuit => {
                  const parentDossier = relatedDossiers.find(d => d.id === lawsuit.dossierId);
                  return {
                    value: lawsuit.id,
                    label: `${lawsuit.lawsuitNumber} - ${lawsuit.title} (${parentDossier?.lawsuitNumber || 'N/A'})`
                  };
                }),
                helpText: relatedLawsuits.length === 0
                  ? t('detail.forms.lawsuitsEmpty')
                  : t('detail.forms.sessionLawsuitHelp'),
                // Only show this field when linkType is 'lawsuit'
                getOptions: (formData) => {
                  if (formData.linkType !== "lawsuit") return [];
                  return relatedLawsuits.map(lawsuit => {
                    const parentDossier = relatedDossiers.find(d => d.id === lawsuit.dossierId);
                    return {
                      value: lawsuit.id,
                      label: `${lawsuit.lawsuitNumber} - ${lawsuit.title} (${parentDossier?.lawsuitNumber || 'N/A'})`
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
                  label: `${dossier.lawsuitNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.sessionDossierHelp'),
                // Only show this field when linkType is 'dossier'
                getOptions: (formData) => {
                  if (formData.linkType !== "dossier") return [];
                  return relatedDossiers.map(dossier => ({
                    value: dossier.id,
                    label: `${dossier.lawsuitNumber} - ${dossier.title}`
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
        // Dynamic form fields - dossierId and lawsuitId options filtered to client's entities
        getFormFields: (clientData) => {
          const relatedDossiers = clientData.relatedDossiers || [];
          const relatedLawsuits = clientData.relatedLawsuits || [];
          const taskT = (key) => i18next.t(key, { ns: "tasks" });

          return taskFormFields(taskT).map(field => {
            if (field.name === 'dossierId') {
              return {
                ...field,
                required: false,
                options: relatedDossiers.map(dossier => ({
                  value: dossier.id,
                  label: `${dossier.lawsuitNumber} - ${dossier.title}`
                })),
                helpText: relatedDossiers.length === 0
                  ? t('detail.forms.dossiersEmpty')
                  : t('detail.forms.taskDossierHelp'),
                // Override getOptions to use filtered options
                getOptions: (formData) => {
                  if (formData.parentType !== "dossier") return [];
                  return relatedDossiers.map(dossier => ({
                    value: dossier.id,
                    label: `${dossier.lawsuitNumber} - ${dossier.title}`
                  }));
                }
              };
            } else if (field.name === 'lawsuitId') {
              return {
                ...field,
                required: false,
                options: relatedLawsuits.map(lawsuit => {
                  const parentDossier = relatedDossiers.find(d => d.id === lawsuit.dossierId);
                  return {
                    value: lawsuit.id,
                    label: `${lawsuit.lawsuitNumber} - ${lawsuit.title} (${parentDossier?.lawsuitNumber || 'N/A'})`
                  };
                }),
                helpText: relatedLawsuits.length === 0
                  ? t('detail.forms.lawsuitsEmpty')
                  : t('detail.forms.taskLawsuitHelp'),
                // Override getOptions to use filtered options
                getOptions: (formData) => {
                  if (formData.parentType !== "lawsuit") return [];
                  return relatedLawsuits.map(lawsuit => {
                    const parentDossier = relatedDossiers.find(d => d.id === lawsuit.dossierId);
                    return {
                      value: lawsuit.id,
                      label: `${lawsuit.lawsuitNumber} - ${lawsuit.title} (${parentDossier?.lawsuitNumber || 'N/A'})`
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
    ],
  };
};






