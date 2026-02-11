import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { formatDateValue } from "../../../utils/dateFormat";
import { translateSessionType, translateStatus } from "../../../utils/entityTranslations";

/**
 * Session Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status and type
 * ✅ Added structured edit mode for overview sections
 * ✅ Fully internationalized with i18n support
 */
export const createSessionConfig = (t) => ({
  // Basic info
  entityType: "session",
  entityName: t('detail.entityName'),
  icon: "fas fa-calendar",
  listRoute: "/sessions",

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

    let session;
    if (contextData?.sessions) {
      // Use contextData.sessions from DataContext (this is the live data)
      session = contextData.sessions.find(s => s.id === numericId);
    } else {
      // Fallback to null (static data)
      session = null[numericId];
    }
    if (!session) return null;

    // ✅ Ensure lawsuit/dossier objects are populated
    const clients = contextData?.clients || [];
    const lawsuits = contextData?.lawsuits || [];
    const dossiers = contextData?.dossiers || [];

    // Always resolve parents from live data (avoid undefined)
    const lawsuitData = session.lawsuitId
      ? (() => {
        const foundLawsuit = lawsuits.find(c => c.id === parseInt(session.lawsuitId));
        return foundLawsuit
          ? { id: foundLawsuit.id, lawsuitNumber: foundLawsuit.lawsuitNumber, title: foundLawsuit.title, dossierId: foundLawsuit.dossierId }
          : session.lawsuit || null;
      })()
      : session.lawsuit || null;

    const dossier = session.dossierId
      ? (() => {
        const foundDossier = dossiers.find(d => d.id === parseInt(session.dossierId));
        return foundDossier
          ? { id: foundDossier.id, lawsuitNumber: foundDossier.lawsuitNumber, title: foundDossier.title, clientId: foundDossier.clientId }
          : session.dossier || null;
      })()
      : // if linked to a lawsuit, derive dossier via lawsuit.dossierId
      (lawsuitData?.dossierId
        ? (() => {
          const found = dossiers.find(d => d.id === parseInt(lawsuitData.dossierId));
          return found
            ? { id: found.id, lawsuitNumber: found.lawsuitNumber, title: found.title, clientId: found.clientId }
            : null;
        })()
        : session.dossier || null);

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

    return {
      ...session,
      client: client || null,
      lawsuit: lawsuitData || null,
      dossier: dossier || null
    };
  },

  updateData: async (id, data, contextData = null, options = {}) => {
    const numericId = parseInt(id);

    // Filter out any potential relationship fields - session entity should only contain session-specific data
    const sessionFields = [
      'title', 'type', 'linkType', 'lawsuitId', 'dossierId', 'date', 'time',
      'duration', 'location', 'courtRoom', 'judge', 'status', 'description', 'participants', 'notes'
    ];
    const sessionData = Object.keys(data).reduce((acc, key) => {
      if (sessionFields.includes(key)) {
        acc[key] = data[key];
      }
      return acc;
    }, {});

    // Only update if there are actual session fields to update
    if (Object.keys(sessionData).length > 0) {
      if (contextData?.updateSession) {
        // Use DataContext to update (this persists to localStorage)
        await contextData.updateSession(numericId, sessionData, options);
      } else {
        // Fallback to updating null
        if (null[numericId]) {
          null[numericId] = {
            ...null[numericId],
            ...sessionData,
          };
        }
      }
    }
    // If no session fields to update, skip the update
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updateSession) {
      // Use DataContext to delete (this persists to localStorage)
      contextData.deleteSession(numericId);
    }
  },

  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => t('detail.subtitle', { type: translateSessionType(data.type, t), date: formatDateValue(data.date), time: data.time }),

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: t('detail.quickActions.status.label'),
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Scheduled", label: t('detail.quickActions.status.scheduled'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Confirmed", label: t('detail.quickActions.status.confirmed'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Pending", label: t('detail.quickActions.status.pending'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Completed", label: t('detail.quickActions.status.completed'), color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Cancelled", label: t('detail.quickActions.status.cancelled'), color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
      ]
    },
    {
      key: "type",
      label: t('detail.quickActions.type.label'),
      icon: "fas fa-tag",
      colorMap: true,
      options: [
        { value: "Consultation", label: t('detail.quickActions.type.consultation'), color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Hearing", label: t('detail.quickActions.type.hearing'), color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
        { value: "Expertise", label: t('detail.quickActions.type.expertise'), color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Mediation", label: t('detail.quickActions.type.mediation'), color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Telephone", label: t('detail.quickActions.type.telephone'), color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Other", label: t('detail.quickActions.type.other'), color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ]
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    const typeIcons = {
      "Consultation": "fas fa-comments",
      "Audience": "fas fa-gavel",
      "Expertise": "fas fa-microscope",
      "Mediation": "fas fa-handshake",
      "Telephone": "fas fa-phone",
    };

    const typeColors = {
      "Consultation": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      "Audience": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      "Expertise": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      "Mediation": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Telephone": "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
    };

    return (
      <ContentSection>
        <div className="p-6" data-tutorial="session-detail-header">
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
                <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                  <i className={typeIcons[data.type]}></i>
                  <span>{translateSessionType(data.type, t)}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${typeColors[data.type]}`}>
                {translateSessionType(data.type, t)}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {translateStatus(data.status, "sessions", t)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-calendar" label={t('detail.header.date')} value={formatDateValue(data.date)} color="blue" />
            <InfoCard icon="fas fa-clock" label={t('detail.header.time')} value={data.time} color="purple" />
            <InfoCard icon="fas fa-hourglass-half" label={t('detail.header.duration')} value={data.duration} color="green" />
            <InfoCard icon="fas fa-map-marker-alt" label={t('detail.header.location')} value={data.location} color="amber" />
            <InfoCard icon="fas fa-door-open" label={t('detail.header.courtRoom')} value={data.courtRoom} color="blue" />
            <InfoCard icon="fas fa-balance-scale" label={t('detail.header.judge')} value={data.judge} color="purple" />
          </div>
        </div>
      </ContentSection>
    );
  },

  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-calendar-alt",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: formatDateValue(data.date),
      label: t('detail.header.date')
    },
    {
      icon: "fas fa-clock",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.time,
      label: t('detail.header.time')
    },
    {
      icon: "fas fa-users",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.participants?.length || 0,
      label: t('detail.header.participants')
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
      id: "participants",
      label: t('detail.tabs.participants'),
      icon: "fas fa-users",
      component: "relatedItems",
      getCount: (data) => data.participants?.length || 0,

      itemsKey: "participants",
      emptyMessage: t('detail.participants.empty'),
      allowEdit: true,
      renderItem: (item) => {
        const roleColors = {
          Lawyer: { icon: "fas fa-gavel", bgColor: "bg-purple-100 dark:bg-purple-900/30", iconColor: "text-purple-700 dark:text-purple-300" },
          Client: { icon: "fas fa-user", bgColor: "bg-blue-100 dark:bg-blue-900/30", iconColor: "text-blue-700 dark:text-blue-300" },
          Judge: { icon: "fas fa-scale-balanced", bgColor: "bg-amber-100 dark:bg-amber-900/30", iconColor: "text-amber-700 dark:text-amber-300" },
          Witness: { icon: "fas fa-eye", bgColor: "bg-green-100 dark:bg-green-900/30", iconColor: "text-green-700 dark:text-green-300" },
          Expert: { icon: "fas fa-microscope", bgColor: "bg-teal-100 dark:bg-teal-900/30", iconColor: "text-teal-700 dark:text-teal-300" },
          default: { icon: "fas fa-user", bgColor: "bg-slate-100 dark:bg-slate-800/60", iconColor: "text-slate-600 dark:text-slate-300" }
        };
        const roleEmojis = {
          Lawyer: "⚖️",
          Client: "🧑‍💼",
          Judge: "👩‍⚖️",
          Witness: "👀",
          Expert: "🔬",
        };
        const roleStyle = roleColors[item.role] || roleColors.default;
        const emoji = roleEmojis[item.role] || "🧑";
        const detailChips = [
          `${emoji} ${item.role}`,
          item.email,
          item.phone,
          item.createdDate,
        ].filter(Boolean).join(" • ");

        return {
          title: `${emoji} ${item.name || t('detail.participants.unnamed')}`,
          subtitle: detailChips,
          icon: roleStyle.icon,
          bgColor: roleStyle.bgColor,
          iconColor: roleStyle.iconColor,
        };
      },

      allowAdd: true,
      allowDelete: true,
      entityName: t('detail.participants.entityName'),
      formFields: [
        {
          name: "name",
          label: t('detail.participants.form.name'),
          type: "text",
          required: true,
          fullWidth: true,
          placeholder: t('detail.participants.form.namePlaceholder'),
          helpText: t('detail.participants.form.nameHelp')
        },
        {
          name: "role",
          label: t('detail.participants.form.role'),
          type: "searchable-select",
          placement: "bottom",
          required: true,
          fullWidth: true,
          placeholder: t('detail.participants.form.rolePlaceholder'),
          options: [
            { value: "Lawyer", label: `⚖️ ${t('detail.participants.roles.lawyer')}` },
            { value: "Client", label: `🧑‍💼 ${t('detail.participants.roles.client')}` },
            { value: "Judge", label: `👩‍⚖️ ${t('detail.participants.roles.judge')}` },
            { value: "Witness", label: `👀 ${t('detail.participants.roles.witness')}` },
            { value: "Expert", label: `🔬 ${t('detail.participants.roles.expert')}` },
          ]
        },
        {
          name: "email",
          label: t('detail.participants.form.email'),
          type: "email",
          placeholder: t('detail.participants.form.emailPlaceholder')
        },
        {
          name: "phone",
          label: t('detail.participants.form.phone'),
          type: "tel",
          placeholder: t('detail.participants.form.phonePlaceholder'),
          helpText: t('detail.participants.form.phoneHelp')
        },
      ],
    },
    {
      id: "documents",
      label: t('detail.tabs.documents'),
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "Report",
      label: t('detail.tabs.report'),
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
          key: "title",
          label: t('detail.overview.fields.title'),
          value: (data, contextData) => data.title,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
        {
          key: "linkType",
          label: t('detail.overview.fields.linkType'),
          value: (data, contextData) => data.linkType || (data.dossierId || data.dossier ? "dossier" : "lawsuit"),
          displayValue: (data, contextData) => {
            const linkTypeOptions = {
              "lawsuit": t('detail.overview.fields.linkTypeOptions.lawsuit'),
              "dossier": t('detail.overview.fields.linkTypeOptions.dossier')
            };
            const rawValue = data.linkType || (data.dossierId || data.dossier ? "dossier" : "lawsuit");
            return linkTypeOptions[rawValue] || t('detail.overview.fields.linkTypeOptions.lawsuit');
          },
          icon: "fas fa-link",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "lawsuit", label: t('detail.overview.fields.linkTypeOptions.lawsuit') },
            { value: "dossier", label: t('detail.overview.fields.linkTypeOptions.dossier') },
          ],
          helpText: t('detail.overview.fields.linkTypeHelp')
        },
        {
          key: "lawsuitId",
          label: t('detail.overview.fields.lawsuit'),
          value: (data, contextData) => data.lawsuitId || "",
          displayValue: (data) => data.lawsuit ? `${data.lawsuit.lawsuitNumber} - ${data.lawsuit.title}` : t('detail.fallback.none'),
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
        {
          key: "dossierId",
          label: t('detail.overview.fields.dossier'),
          value: (data, contextData) => {
            // If linked to a lawsuit, get the parent dossier
            if (data.lawsuitId) {
              const parentLawsuit = (contextData?.lawsuits || []).find(c => c.id === parseInt(data.lawsuitId));
              if (parentLawsuit && parentLawsuit.dossierId) {
                return parentLawsuit.dossierId;
              }
            }
            // Otherwise use direct dossier link
            return data.dossierId || "";
          },
          displayValue: (data, contextData) => {
            // If linked to a lawsuit, show the parent dossier
            if (data.lawsuitId) {
              const parentLawsuit = (contextData?.lawsuits || []).find(c => c.id === parseInt(data.lawsuitId));
              if (parentLawsuit && parentLawsuit.dossierId) {
                const parentDossier = (contextData?.dossiers || []).find(d => d.id === parseInt(parentLawsuit.dossierId));
                if (parentDossier) {
                  return `${parentDossier.lawsuitNumber} - ${parentDossier.title}`;
                }
              }
            }
            // Otherwise show direct dossier link
            if (data.dossier) {
              return `${data.dossier.lawsuitNumber} - ${data.dossier.title}`;
            }
            if (data.dossierId) {
              const dossier = (contextData?.dossiers || []).find(d => d.id === parseInt(data.dossierId));
              if (dossier) {
                return `${dossier.lawsuitNumber} - ${dossier.title}`;
              }
            }
            return t('detail.fallback.none');
          },
          icon: "fas fa-folder",
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
      ],
    },
    {
      title: t('detail.overview.details'),
      editStrategy: "structured",
      fields: [
        {
          key: "date",
          label: t('detail.overview.fields.date'),
          value: (data, contextData) => data.date,
          displayValue: (data) => data.date ? formatDateValue(data.date) : t('detail.fallback.na'),
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "time",
          label: t('detail.overview.fields.time'),
          value: (data, contextData) => data.time,
          icon: "fas fa-clock",
          type: "select",
          editable: true,
          helpText: t('detail.overview.fields.timeHelp'),
          options: [
            { value: "08:00", label: "08:00" },
            { value: "08:30", label: "08:30" },
            { value: "09:00", label: "09:00" },
            { value: "09:30", label: "09:30" },
            { value: "10:00", label: "10:00" },
            { value: "10:30", label: "10:30" },
            { value: "11:00", label: "11:00" },
            { value: "11:30", label: "11:30" },
            { value: "12:00", label: "12:00" },
            { value: "12:30", label: "12:30" },
            { value: "13:00", label: "13:00" },
            { value: "13:30", label: "13:30" },
            { value: "14:00", label: "14:00" },
            { value: "14:30", label: "14:30" },
            { value: "15:00", label: "15:00" },
            { value: "15:30", label: "15:30" },
            { value: "16:00", label: "16:00" },
            { value: "16:30", label: "16:30" },
            { value: "17:00", label: "17:00" },
            { value: "17:30", label: "17:30" },
            { value: "18:00", label: "18:00" },
          ],
        },
        {
          key: "duration",
          label: t('detail.overview.fields.duration'),
          value: (data, contextData) => data.duration,
          icon: "fas fa-hourglass-half",
          type: "select",
          editable: true,
          options: [
            { value: "00:15", label: t('detail.overview.fields.durationOptions.00_15') },
            { value: "00:30", label: t('detail.overview.fields.durationOptions.00_30') },
            { value: "00:45", label: t('detail.overview.fields.durationOptions.00_45') },
            { value: "01:00", label: t('detail.overview.fields.durationOptions.01_00') },
            { value: "01:30", label: t('detail.overview.fields.durationOptions.01_30') },
            { value: "02:00", label: t('detail.overview.fields.durationOptions.02_00') },
            { value: "02:30", label: t('detail.overview.fields.durationOptions.02_30') },
            { value: "03:00", label: t('detail.overview.fields.durationOptions.03_00') },
            { value: "04:00", label: t('detail.overview.fields.durationOptions.04_00') },
          ],
          helpText: t('detail.overview.fields.durationHelp')
        },
        {
          key: "location",
          label: t('detail.overview.fields.location'),
          value: (data, contextData) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true
        },
        {
          key: "courtRoom",
          label: t('detail.overview.fields.courtRoom'),
          value: (data, contextData) => data.courtRoom,
          icon: "fas fa-door-open",
          type: "text",
          editable: true,
          helpText: t('detail.overview.fields.courtRoomHelp')
        },
        {
          key: "judge",
          label: t('detail.overview.fields.judge'),
          value: (data, contextData) => data.judge,
          icon: "fas fa-balance-scale",
          type: "text",
          editable: true,
          helpText: t('detail.overview.fields.judgeHelp')
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
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
    amber: "bg-amber-100 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400",
  };

  return (
    <div className="flex items-center gap-3" >
      <div className={`p-2 rounded-lg ${colors[color]}`}>
        <i className={icon}></i>
      </div>
      <div>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        <p className="text-sm font-medium text-slate-900 dark:text-white">{value}</p>
      </div>
    </div >
  );
}




