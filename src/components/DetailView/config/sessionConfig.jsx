import ContentSection from "../../layout/ContentSection";
import { mockSessionsExtended, getStatusColor } from "../../../utils/mockData";

/**
 * Session Entity Configuration
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
  fetchData: async (id) => {
    return mockSessionsExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating session:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },
  
  deleteData: async (id) => {
    console.log("Deleting session:", id);
  },
  
  // Header display
  getTitle: (data) => data.title,
  getSubtitle: (data) => `${data.type} - ${data.date} à ${data.time}`,
  
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
      id: "notes",
      label: "Compte-rendu",
      icon: "fas fa-sticky-note",
      component: "notes",
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "timeline",
    },
  ],
  
  // Overview tab sections
  overviewSections: [
    {
      title: "Description",
      type: "description",
      fieldKey: "description",
      content: (data) => data.description || "Aucune description",
    },
    {
      title: "Détails de la séance",
      fields: [
        { 
          key: "type",
          label: "Type", 
          value: (data) => data.type, 
          icon: "fas fa-tag",
          type: "select",
          editable: true,
          options: [
            { value: "Consultation", label: "Consultation" },
            { value: "Audience", label: "Audience" },
            { value: "Expertise", label: "Expertise" },
            { value: "Médiation", label: "Médiation" },
            { value: "Téléphone", label: "Téléphone" },
          ]
        },
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
          type: "text",
          editable: true,
          placeholder: "10:00"
        },
        { 
          key: "duration",
          label: "Durée", 
          value: (data) => data.duration, 
          icon: "fas fa-hourglass-half",
          type: "text",
          editable: true,
          placeholder: "1h"
        },
        { 
          key: "location",
          label: "Lieu", 
          value: (data) => data.location, 
          icon: "fas fa-map-marker-alt",
          type: "text",
          editable: true
        },
        { 
          key: "status",
          label: "Statut", 
          value: (data) => data.status, 
          icon: "fas fa-info-circle",
          type: "select",
          editable: true,
          options: [
            { value: "Programmé", label: "Programmé" },
            { value: "Confirmé", label: "Confirmé" },
            { value: "En attente", label: "En attente" },
            { value: "Terminé", label: "Terminé" },
            { value: "Annulé", label: "Annulé" },
          ]
        },
      ],
    },
    {
      title: "Compte-rendu",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "Aucun compte-rendu",
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