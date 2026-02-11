import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { translateStatus } from "../../../utils/entityTranslations";
import { getMissionFormFields } from "../../FormModal/formConfigs";

/**
 * Officer (Huissier) Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 * ✅ Dynamic entity selection based on "Lié à" dropdown
 * ✅ Fully internationalized with i18n support
 */
export const createOfficerConfig = (t) => ({
  // Basic info
  entityType: "officer",
  entityName: t('detail.entityName'),
  icon: "fas fa-user-tie",
  listRoute: "/officers",

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

    let officer;
    if (contextData?.officers) {
      // Use contextData.officers from DataContext (this is the live data)
      officer = contextData.officers.find(o => o.id === numericId);
    } else {
      // Fallback to null (static data)
      officer = null[numericId];
    }

    if (!officer) return null;

    // ✅ Compute aggregated related entities from contextData if available
    const missions = contextData?.missions || [];
    const lawsuits = contextData?.lawsuits || [];
    const dossiers = contextData?.dossiers || [];
    const financialEntries = contextData?.financialEntries || [];

    // Filter missions assigned to this officer
    const officerMissions = missions.filter(m => String(m.officerId) === String(numericId));

    // Filter lawsuits where this officer has missions
    const relatedlawsuitIds = new Set(
      missions
        .filter(m => String(m.officerId) === String(numericId) && (m.lawsuitId || (m.entityType === "lawsuit" && m.entityId)))
        .map(m => m.lawsuitId || (m.entityType === "lawsuit" ? m.entityId : null))
        .filter(Boolean)
    );
    const officerLawsuits = lawsuits.filter(c => relatedlawsuitIds.has(c.id));

    // Filter dossiers where this officer has missions
    const relatedDossierIds = new Set(
      missions
        .filter(m => String(m.officerId) === String(numericId) && (m.dossierId || (m.entityType === "dossier" && m.entityId)))
        .map(m => m.dossierId || (m.entityType === "dossier" ? m.entityId : null))
        .filter(Boolean)
    );
    const officerDossiers = dossiers.filter(d => relatedDossierIds.has(d.id));


    // Robust: include entries with officerId or with missionId belonging to officer's missions
    const officerMissionIds = new Set(officerMissions.map(m => m.id));
    const relatedFinancialEntries = financialEntries.filter(entry =>
      entry.scope === 'client' &&
      (entry.officerId === numericId || (entry.missionId && officerMissionIds.has(entry.missionId)))
    );

    return {
      ...officer,
      missions: officerMissions,
      lawsuits: [...officerDossiers, ...officerLawsuits],
      dossiers: officerDossiers,
      financialEntries: relatedFinancialEntries,
    };
  },

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    // 🚨 CRITICAL SAFETY: Relational arrays (missions, lawsuits, dossiers) should NEVER trigger officer table updates
    // These are read-only computed properties from the backend
    const relationalFields = ['missions', 'lawsuits', 'dossiers'];
    const hasOnlyRelationalFields = Object.keys(data).every(key => relationalFields.includes(key));

    if (hasOnlyRelationalFields) {
      // These updates are safe to ignore - the relational data is managed by the mission/lawsuit/dossier services
      return;
    }

    // Only update officer table fields (name, email, phone, agency, status, notes)
    const officerFields = ['name', 'email', 'phone', 'location', 'agency', 'status', 'notes', 'registrationNumber'];
    const officerOnlyData = {};
    let hasOfficerFields = false;

    for (const key of Object.keys(data)) {
      if (officerFields.includes(key)) {
        officerOnlyData[key] = data[key];
        hasOfficerFields = true;
      }
    }

    if (!hasOfficerFields) {
      return;
    }

    if (contextData?.updateOfficer) {
      // Use DataContext to update (this persists to backend)
      contextData.updateOfficer(numericId, officerOnlyData);
    } else {
      // Fallback to updating null
      if (null[numericId]) {
        null[numericId] = {
          ...null[numericId],
          ...officerOnlyData,
        };
      }
    }
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.deleteOfficer) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deleteOfficer(numericId);
    }
  },

  // Header display
  getTitle: (data) => data.name,
  getSubtitle: (data) => data.location,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: t('detail.quickActions.status.label'),
      icon: "fas fa-flag",
      colorMap: true,
      options: [
        { value: "Available", label: t('detail.quickActions.status.available'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Busy", label: t('detail.quickActions.status.busy'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Inactive", label: t('detail.quickActions.status.inactive'), color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ]
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-col md:flex-row items-start gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
              <i className="fas fa-balance-scale"></i>
            </div>

            {/* Info */}
            <div className="flex-1">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h2 className="text-2xl font-bold text-slate-900 dark:text-white">
                    {data.name}
                  </h2>
                  <p className="text-slate-600 dark:text-slate-400 mt-1">
                    {data.agency || t('detail.header.independent')}
                  </p>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                  {translateStatus(data.status, "officers", t)}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="flex items-center gap-3">
                  <i className="fas fa-phone text-green-600 dark:text-green-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.header.phone')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.phone}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-envelope text-blue-600 dark:text-blue-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.header.email')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <i className="fas fa-map-marker-alt text-red-600 dark:text-red-400"></i>
                  <div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">{t('detail.header.location')}</p>
                    <p className="text-sm text-slate-900 dark:text-white">{data.location}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </ContentSection>
    );
  },

  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-clipboard-check",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.missions?.length || 0,
      label: t('detail.stats.totalMissions')
    },
    {
      icon: "fas fa-spinner",
      iconColor: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/20",
      value: data.missions?.filter(m => m.status === "In Progress" || m.status === "Scheduled").length || 0,
      label: t('detail.stats.inProgress')
    },
    {
      icon: "fas fa-check-circle",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.missions?.filter(m => m.status === "Completed").length || 0,
      label: t('detail.stats.completed')
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
      id: "missions",
      label: t('detail.tabs.missions'),
      icon: "fas fa-clipboard-check",
      component: "missions",
      getCount: (data) => data.missions?.length || 0,

      itemsKey: "missions",
      emptyMessage: t('detail.missions.empty', { ns: 'missions', defaultValue: 'No missions yet' }),

      allowAdd: true,
      allowDelete: true,
      entityName: t('detail.missions.entityName', { ns: 'missions', defaultValue: 'Mission' }),
      addSubtitle: t('form.subtitle.add', { ns: 'missions', defaultValue: 'Create a new mission' }),

      // ✅ UPDATED: Use same getFormFields pattern as dossier and lawsuit
      getFormFields: (officerData, contextData) => {
        const fields = getMissionFormFields().map(field => {
          // Pre-fill and disable officerId with current officer
          if (field.name === 'officerId') {
            return {
              ...field,
              defaultValue: officerData.id,
              displayValue: officerData.name,
              options: [{ value: officerData.id, label: officerData.name }],
              disabled: true,
              helpText: t('form.help.bailiffAssigned', { ns: 'missions', name: officerData.name, defaultValue: `This mission will be assigned to ${officerData.name}` }),
            };
          }
          // Mission reference: editable/optional like dossier/lawsuit; leave blank to auto-generate
          if (field.name === 'missionNumber') {
            return {
              ...field,
              defaultValue: '',
              disabled: false,
            };
          }
          // Enable entityType (not disabled) for officer selection
          if (field.name === 'entityType') {
            return {
              ...field,
              disabled: false, // Allow selection for officers
              helpText: t('form.help.entityType', { ns: 'missions', defaultValue: 'Select whether the mission concerns a dossier or a lawsuit' }),
            };
          }
          // Enable entityReference (not disabled) for officer selection
          if (field.name === 'entityReference') {
            return {
              ...field,
              disabled: false, // Allow selection for officers
              type: 'searchable-select', // Make it searchable
              helpText: t('form.help.entityReferenceSelect', { ns: 'missions', defaultValue: 'Select the dossier or lawsuit for this mission' }),
              getOptions: (formData) => {
                const entityType = formData.entityType;

                if (entityType === 'dossier') {
                  return (contextData?.dossiers || []).map(d => ({
                    value: d.lawsuitNumber,
                    label: `${d.lawsuitNumber} - ${d.title}`,
                  }));
                } else if (entityType === 'lawsuit') {
                  return (contextData?.lawsuits || []).map(c => ({
                    value: c.lawsuitNumber,
                    label: `${c.lawsuitNumber} - ${c.title}`,
                  }));
                }

                return [];
              },
            };
          }
          return field;
        });

        return fields;
      },
    },
    {
      id: "lawsuits",
      label: t('detail.tabs.lawsuits'),
      icon: "fas fa-folder-open",
      component: "relatedItems",
      getCount: (data) => data.lawsuits?.length || 0,

      itemsKey: "lawsuits",
      emptyMessage: t('detail.lawsuits.empty'),
      itemRoute: (item) => {
        // Determine if it's a dossier or lawsuit based on lawsuitNumber prefix
        if (item.lawsuitNumber.startsWith('DOS-')) {
          return '/dossiers';
        } else if (item.lawsuitNumber.startsWith('PRO-')) {
          return '/lawsuits';
        }
        return '/dossiers';
      },
      renderItem: (item) => {
        // Determine type and icon based on lawsuitNumber prefix
        const isDossier = item.lawsuitNumber.startsWith('DOS-');
        const icon = isDossier ? 'fas fa-folder-open' : 'fas fa-gavel';
        const iconColor = isDossier ? 'text-amber-600 dark:text-amber-400' : 'text-red-600 dark:text-red-400';

        return {
          title: item.lawsuitNumber,
          subtitle: item.title,
          status: item.status,
          statusNamespace: isDossier ? "dossiers" : "lawsuits",
          icon: icon,
          iconColor: iconColor,
        };
      },

      allowAdd: false,
      allowDelete: false,
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
          key: "name",
          label: t('detail.overview.fields.name'),
          value: (data) => data.name,
          icon: "fas fa-user",
          type: "text",
          editable: true,
          required: true,
          placeholder: t('detail.overview.placeholders.name')
        },
        {
          key: "status",
          label: t('detail.quickActions.status.label'),
          value: (data) => data.status,
          displayValue: (data) => translateStatus(data.status, "officers", t) || t('detail.fallback.na'),
          icon: "fas fa-flag",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "Available", label: t('detail.quickActions.status.available') },
            { value: "Busy", label: t('detail.quickActions.status.busy') },
            { value: "Inactive", label: t('detail.quickActions.status.inactive') },
          ]
        },
      ],
    },
    {
      title: t('detail.overview.contact'),
      editStrategy: "structured",
      fields: [
        {
          key: "email",
          label: t('detail.header.email'),
          value: (data) => data.email,
          icon: "fas fa-envelope",
          type: "email",
          editable: true,
          required: true,
          placeholder: t('detail.overview.placeholders.email')
        },
        {
          key: "phone",
          label: t('detail.header.phone'),
          value: (data) => data.phone,
          icon: "fas fa-phone",
          type: "tel",
          editable: true,
          required: true,
          placeholder: t('detail.overview.placeholders.phone')
        },
        {
          key: "alternatePhone",
          label: t('detail.overview.fields.alternatePhone'),
          value: (data) => data.alternatePhone || t('detail.fallback.na'),
          icon: "fas fa-phone-alt",
          type: "tel",
          editable: true,
          placeholder: t('detail.overview.placeholders.alternatePhone')
        },
        {
          key: "location",
          label: t('detail.header.location'),
          value: (data) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true,
          required: true,
          placeholder: t('detail.overview.placeholders.location')
        },
        {
          key: "address",
          label: t('detail.overview.fields.address'),
          value: (data) => data.address || t('detail.fallback.na'),
          icon: "fas fa-map",
          type: "textarea",
          editable: true,
          rows: 2,
          placeholder: t('detail.overview.placeholders.address')
        },
      ],
    },
  ],
});






