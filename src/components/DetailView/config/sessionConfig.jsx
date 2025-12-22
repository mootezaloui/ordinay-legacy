import ContentSection from "../../layout/ContentSection";
import { mockSessionsExtended, mockCases, mockDossiers, getStatusColor } from "../../../utils/mockData";

/**
 * Session Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status and type
 * ✅ Added structured edit mode for overview sections
 */
export const sessionConfig = {
  // Basic info
  entityType: "session",
  entityName: "Séance",
  icon: "fas fa-calendar",
  listRoute: "/sessions",

  // Messages
  notFoundMessage: "Séance non trouvée",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette séance ?",

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
      // Fallback to mockSessionsExtended (static data)
      session = mockSessionsExtended[numericId];
    }
    if (!session) return null;

    // ✅ Ensure case/dossier objects are populated
    const cases = contextData?.cases || mockCases;
    const dossiers = contextData?.dossiers || mockDossiers;

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

  updateData: async (id, data, contextData = null) => {
    const numericId = parseInt(id);

    if (contextData?.updateSession) {
      // Use DataContext to update (this persists to localStorage)
      contextData.updateSession(numericId, data);
    } else {
      // Fallback to updating mockSessionsExtended
      if (mockSessionsExtended[numericId]) {
        mockSessionsExtended[numericId] = {
          ...mockSessionsExtended[numericId],
          ...data,
        };
      }
    }
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
  getSubtitle: (data) => `${data.type} - ${data.date} à ${data.time}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-info-circle",
      colorMap: true,
      options: [
        { value: "Programmée", label: "Programmée", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Confirmée", label: "Confirmée", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "En attente", label: "En attente", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Terminée", label: "Terminée", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Annulée", label: "Annulée", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" },
      ]
    },
    {
      key: "type",
      label: "Type",
      icon: "fas fa-tag",
      colorMap: true,
      options: [
        { value: "Consultation", label: "Consultation", color: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" },
        { value: "Audience", label: "Audience", color: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400" },
        { value: "Expertise", label: "Expertise", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Médiation", label: "Médiation", color: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400" },
        { value: "Téléphone", label: "Téléphone", color: "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300" },
        { value: "Autre", label: "Autre", color: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300" },
      ]
    }
  ],

  // Custom header rendering
  renderHeader: (data) => {
    const typeIcons = {
      "Consultation": "fas fa-comments",
      "Audience": "fas fa-gavel",
      "Expertise": "fas fa-microscope",
      "Médiation": "fas fa-handshake",
      "Téléphone": "fas fa-phone",
    };

    const typeColors = {
      "Consultation": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
      "Audience": "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
      "Expertise": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
      "Médiation": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
      "Téléphone": "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300",
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
            <InfoCard icon="fas fa-calendar" label="Date" value={data.date} color="blue" />
            <InfoCard icon="fas fa-clock" label="Heure" value={data.time} color="purple" />
            <InfoCard icon="fas fa-hourglass-half" label="Durée" value={data.duration} color="green" />
            <InfoCard icon="fas fa-map-marker-alt" label="Lieu" value={data.location} color="amber" />
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
      value: data.date,
      label: "Date"
    },
    {
      icon: "fas fa-clock",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.time,
      label: "Heure"
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
      label: "Vue d'ensemble",
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
      emptyMessage: "Aucun participant",
      renderItem: (item) => ({
        title: item.name,
        subtitle: item.role,
      }),

      allowAdd: true,
      allowDelete: true,
      entityName: "un participant",
      formFields: [
        {
          name: "name",
          label: "Nom",
          type: "text",
          required: true,
        },
        {
          name: "role",
          label: "Rôle",
          type: "select",
          required: true,
          options: [
            { value: "Avocat", label: "Avocat" },
            { value: "Client", label: "Client" },
            { value: "Juge", label: "Juge" },
            { value: "Témoin", label: "Témoin" },
            { value: "Expert", label: "Expert" },
          ]
        },
        {
          name: "email",
          label: "Email",
          type: "email",
        },
        {
          name: "phone",
          label: "Téléphone",
          type: "tel",
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
      id: "Compte-rendu",
      label: "Compte-rendu",
      icon: "fas fa-sticky-note",
      component: "notes",
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "history",
    },
  ],

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "Informations générales",
      editStrategy: "structured",
      fields: [
        {
          key: "title",
          label: "Titre de la séance",
          value: (data) => data.title,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
        {
          key: "linkType",
          label: "Lié à",
          value: (data) => {
            // Return the actual value, not the label
            if (data.linkType) return data.linkType;
            if (data.dossierId || data.dossier) return "dossier";
            if (data.caseId || data.case) return "case";
            return "case";
          },
          icon: "fas fa-link",
          type: "select",
          editable: true,
          required: true,
          options: [
            { value: "case", label: "Procès" },
            { value: "dossier", label: "Dossier directement" },
          ],
          helpText: "Une audience peut être liée à un procès ou directement à un dossier"
        },
        {
          key: "caseId",
          label: "Procès",
          value: (data) => data.caseId || "",
          displayValue: (data) => data.case ? `${data.case.caseNumber} - ${data.case.title}` : "Aucun",
          icon: "fas fa-gavel",
          type: "searchable-select",
          editable: true,
          options: [
            { value: "", label: "Sélectionner un procès..." },
            ...mockCases.map(c => ({
              value: c.id,
              label: `${c.caseNumber} - ${c.title}`
            }))
          ],
          getOptions: () => ([
            { value: "", label: "Sélectionner un procès..." },
            ...mockCases.map(c => ({
              value: c.id,
              label: `${c.caseNumber} - ${c.title}`
            }))
          ]),
          helpText: "Sélectionner le procès concerné"
        },
        {
          key: "dossierId",
          label: "Dossier",
          value: (data) => {
            // If linked to a case, get the parent dossier
            if (data.caseId) {
              const parentCase = mockCases.find(c => c.id === data.caseId);
              if (parentCase && parentCase.dossierId) {
                return parentCase.dossierId;
              }
            }
            // Otherwise use direct dossier link
            return data.dossierId || "";
          },
          displayValue: (data) => {
            // If linked to a case, show the parent dossier
            if (data.caseId) {
              const parentCase = mockCases.find(c => c.id === data.caseId);
              if (parentCase && parentCase.dossierId) {
                const parentDossier = mockDossiers.find(d => d.id === parentCase.dossierId);
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
              const dossier = mockDossiers.find(d => d.id === data.dossierId);
              if (dossier) {
                return `${dossier.caseNumber} - ${dossier.title}`;
              }
            }
            return "Aucun";
          },
          icon: "fas fa-folder",
          type: "searchable-select",
          editable: true,
          options: [
            { value: "", label: "Sélectionner un dossier..." },
            ...mockDossiers.map(d => ({
              value: d.id,
              label: `${d.caseNumber} - ${d.title}`
            }))
          ],
          getOptions: () => ([
            { value: "", label: "Sélectionner un dossier..." },
            ...mockDossiers.map(d => ({
              value: d.id,
              label: `${d.caseNumber} - ${d.title}`
            }))
          ]),
          helpText: "Sélectionner le dossier concerné"
        },
      ],
    },
    {
      title: "Détails de la séance",
      editStrategy: "structured",
      fields: [
        {
          key: "date",
          label: "Date",
          value: (data) => data.date,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        {
          key: "time",
          label: "Heure",
          value: (data) => data.time,
          icon: "fas fa-clock",
          type: "select",
          editable: true,
          helpText: "Sélectionnez l'heure de début",
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
          label: "Durée estimée",
          value: (data) => data.duration,
          icon: "fas fa-hourglass-half",
          type: "select",
          editable: true,
          options: [
            { value: "00:15", label: "15 minutes" },
            { value: "00:30", label: "30 minutes" },
            { value: "00:45", label: "45 minutes" },
            { value: "01:00", label: "1 heure" },
            { value: "01:30", label: "1h30" },
            { value: "02:00", label: "2 heures" },
            { value: "02:30", label: "2h30" },
            { value: "03:00", label: "3 heures" },
            { value: "04:00", label: "4 heures" },
          ],
          helpText: "Durée prévue de la séance"
        },
        {
          key: "location",
          label: "Lieu",
          value: (data) => data.location,
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Description",
      editStrategy: "structured",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Notes",
      editStrategy: "structured",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "Aucune notes",
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
