import ContentSection from "../../layout/ContentSection";
import { getStatusColor } from "./statusColors";
import { formatDateValue } from "../../../utils/dateFormat";

/**
 * Session Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status and type
 * ✅ Added structured edit mode for overview sections
 */
export const sessionConfig = {
  // Basic info
  entityType: "session",
  entityName: "Hearing",
  icon: "fas fa-calendar",
  listRoute: "/sessions",

  // Messages
  notFoundMessage: "Hearing not found",
  deleteConfirmMessage: "Are you sure you want to delete this hearing?",

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

    // ✅ Ensure case/dossier objects are populated
    const cases = contextData?.cases || [];
    const dossiers = contextData?.dossiers || [];

    // Always resolve parents from live data (avoid undefined)
    const caseData = session.caseId
      ? (() => {
        const foundCase = cases.find(c => c.id === parseInt(session.caseId));
        return foundCase
          ? { id: foundCase.id, caseNumber: foundCase.caseNumber, title: foundCase.title, dossierId: foundCase.dossierId }
          : session.case || null;
      })()
      : session.case || null;

    const dossier = session.dossierId
      ? (() => {
        const foundDossier = dossiers.find(d => d.id === parseInt(session.dossierId));
        return foundDossier
          ? { id: foundDossier.id, caseNumber: foundDossier.caseNumber, title: foundDossier.title }
          : session.dossier || null;
      })()
      : // if linked to a case, derive dossier via case.dossierId
      (caseData?.dossierId
        ? (() => {
          const found = dossiers.find(d => d.id === parseInt(caseData.dossierId));
          return found
            ? { id: found.id, caseNumber: found.caseNumber, title: found.title }
            : null;
        })()
        : session.dossier || null);

    return {
      ...session,
      case: caseData || null,
      dossier: dossier || null
    };
  },

  updateData: async (id, data, contextData = null, options = {}) => {
    const numericId = parseInt(id);

    // Filter out any potential relationship fields - session entity should only contain session-specific data
    const sessionFields = [
      'title', 'type', 'linkType', 'caseId', 'dossierId', 'date', 'time',
      'duration', 'location', 'courtRoom', 'judge', 'status', 'description', 'notes', 'participants'
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
    } else {
      console.log("Deleting session:", numericId);
    }
  },

  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => `${data.type} - ${formatDateValue(data.date)} at ${data.time}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Status",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Scheduled", label: "Scheduled", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Confirmed", label: "Confirmed", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Pending", label: "Pending", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Completed", label: "Completed", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Cancelled", label: "Cancelled", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
      ]
    },
    {
      key: "type",
      label: "Type",
      icon: "fas fa-tag",
      colorMap: true,
      options: [
        { value: "Consultation", label: "Consultation", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Hearing", label: "Hearing", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
        { value: "Expertise", label: "Expertise", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Mediation", label: "Mediation", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Telephone", label: "Telephone", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Other", label: "Other", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ]
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    const typeIcons = {
      "Consultation": "fas fa-comments",
      "Hearing": "fas fa-gavel",
      "Expertise": "fas fa-microscope",
      "Mediation": "fas fa-handshake",
      "Telephone": "fas fa-phone",
    };

    const typeColors = {
      "Consultation": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      "Hearing": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      "Expertise": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      "Mediation": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Telephone": "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
    };

    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                {data.title}
              </h2>
              <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                <i className={typeIcons[data.type]}></i>
                <span>{data.type}</span>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${typeColors[data.type]}`}>
                {data.type}
              </span>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-calendar" label="Date" value={formatDateValue(data.date)} color="blue" />
            <InfoCard icon="fas fa-clock" label="Time" value={data.time} color="purple" />
            <InfoCard icon="fas fa-hourglass-half" label="Duration" value={data.duration} color="green" />
            <InfoCard icon="fas fa-map-marker-alt" label="Location" value={data.location} color="amber" />
            <InfoCard icon="fas fa-door-open" label="Court Room" value={data.courtRoom} color="blue" />
            <InfoCard icon="fas fa-balance-scale" label="Judge" value={data.judge} color="purple" />
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
      label: "Date"
    },
    {
      icon: "fas fa-clock",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.time,
      label: "Time"
    },
    {
      icon: "fas fa-users",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.participants?.length || 0,
      label: "Participants"
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
      id: "participants",
      label: "Participants",
      icon: "fas fa-users",
      component: "relatedItems",
      getCount: (data) => data.participants?.length || 0,

      itemsKey: "participants",
      emptyMessage: "No participants",
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
          title: `${emoji} ${item.name || "Unnamed participant"}`,
          subtitle: detailChips,
          icon: roleStyle.icon,
          bgColor: roleStyle.bgColor,
          iconColor: roleStyle.iconColor,
        };
      },

      allowAdd: true,
      allowDelete: true,
      entityName: "a participant",
      formFields: [
        {
          name: "name",
          label: "Name",
          type: "text",
          required: true,
          placeholder: "Full name",
          helpText: "Who will attend this hearing?"
        },
        {
          name: "role",
          label: "Role",
          type: "searchable-select",
          placement: "bottom",
          required: true,
          placeholder: "Choose a role",
          options: [
            { value: "Lawyer", label: "⚖️ Lawyer" },
            { value: "Client", label: "🧑‍💼 Client" },
            { value: "Judge", label: "👩‍⚖️ Judge" },
            { value: "Witness", label: "👀 Witness" },
            { value: "Expert", label: "🔬 Expert" },
          ]
        },
        {
          name: "email",
          label: "Email",
          type: "email",
          placeholder: "name@email.com"
        },
        {
          name: "phone",
          label: "Phone",
          type: "tel",
          placeholder: "+216 12 345 678",
          helpText: "Optional contact number for day-of coordination"
        },
      ],
    },
    {
      id: "documents",
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "Report",
      label: "Report",
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
          key: "title",
          label: "Session Title",
          value: (data, contextData) => data.title,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
        {
          key: "linkType",
          label: "Linked To",
          value: (data, contextData) => data.linkType || (data.dossierId || data.dossier ? "dossier" : "case"),
          displayValue: (data, contextData) => {
            const linkTypeOptions = {
              "case": "Lawsuit",
              "dossier": "Dossier"
            };
            const rawValue = data.linkType || (data.dossierId || data.dossier ? "dossier" : "case");
            return linkTypeOptions[rawValue] || "Lawsuit";
          },
          icon: "fas fa-link",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "case", label: "Lawsuit" },
            { value: "dossier", label: "Dossier" },
          ],
          helpText: "A session can be linked to a lawsuit or directly to a dossier"
        },
        {
          key: "caseId",
          label: "Lawsuit",
          value: (data, contextData) => data.caseId || "",
          displayValue: (data) => data.case ? `${data.case.caseNumber} - ${data.case.title}` : "None",
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
        {
          key: "dossierId",
          label: "Dossier",
          value: (data, contextData) => {
            // If linked to a case, get the parent dossier
            if (data.caseId) {
              const parentCase = (contextData?.cases || []).find(c => c.id === parseInt(data.caseId));
              if (parentCase && parentCase.dossierId) {
                return parentCase.dossierId;
              }
            }
            // Otherwise use direct dossier link
            return data.dossierId || "";
          },
          displayValue: (data, contextData) => {
            // If linked to a case, show the parent dossier
            if (data.caseId) {
              const parentCase = (contextData?.cases || []).find(c => c.id === parseInt(data.caseId));
              if (parentCase && parentCase.dossierId) {
                const parentDossier = (contextData?.dossiers || []).find(d => d.id === parseInt(parentCase.dossierId));
                if (parentDossier) {
                  return `${parentDossier.caseNumber} - ${parentDossier.title}`;
                }
              }
            }
            // Otherwise show direct dossier link
            if (data.dossier) {
              return `${data.dossier.caseNumber} - ${data.dossier.title}`;
            }
            if (data.dossierId) {
              const dossier = (contextData?.dossiers || []).find(d => d.id === parseInt(data.dossierId));
              if (dossier) {
                return `${dossier.caseNumber} - ${dossier.title}`;
              }
            }
            return "None";
          },
          icon: "fas fa-folder",
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
      ],
    },
    {
      title: "Session Details",
      editStrategy: "structured",
      fields: [
        {
          key: "date",
          label: "Date",
          value: (data, contextData) => data.date,
          displayValue: (data) => data.date ? formatDateValue(data.date) : "N/A",
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "time",
          label: "Time",
          value: (data, contextData) => data.time,
          icon: "fas fa-clock",
          type: "select",
          editable: true,
          helpText: "Select the start time of the session",
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
          label: "Estimated Duration",
          value: (data, contextData) => data.duration,
          icon: "fas fa-hourglass-half",
          type: "select",
          editable: true,
          options: [
            { value: "00:15", label: "15 minutes" },
            { value: "00:30", label: "30 minutes" },
            { value: "00:45", label: "45 minutes" },
            { value: "01:00", label: "1 hour" },
            { value: "01:30", label: "1h30" },
            { value: "02:00", label: "2 hours" },
            { value: "02:30", label: "2h30" },
            { value: "03:00", label: "3 hours" },
            { value: "04:00", label: "4 hours" },
          ],
          helpText: "Estimated duration of the session"
        },
        {
          key: "location",
          label: "Location",
          value: (data, contextData) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true
        },
        {
          key: "courtRoom",
          label: "Court Room",
          value: (data, contextData) => data.courtRoom,
          icon: "fas fa-door-open",
          type: "text",
          editable: true,
          helpText: "Specific courtroom for this hearing"
        },
        {
          key: "judge",
          label: "Judge",
          value: (data, contextData) => data.judge,
          icon: "fas fa-balance-scale",
          type: "text",
          editable: true,
          helpText: "Judge presiding over this hearing"
        },
      ],
    },
    {
      title: "Description",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "No description",
    },

  ],
};

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

