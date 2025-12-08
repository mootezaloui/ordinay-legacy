import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockClientsExtended, getStatusColor } from "../../../utils/mockData";

/**
 * Client Entity Configuration
 * Defines how to display and interact with client data
 */
export const clientConfig = {
  // Basic info
  entityType: "client",
  entityName: "Client",
  icon: "fas fa-user-circle",
  listRoute: "/clients",
  
  // Messages
  notFoundMessage: "Client non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer ce client ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching (replace with real API calls)
  fetchData: async (id) => {
    // TODO: Replace with actual API call
    return mockClientsExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    // TODO: Replace with actual API call
    console.log("Updating client:", id, data);
  },
  
  deleteData: async (id) => {
    // TODO: Replace with actual API call
    console.log("Deleting client:", id);
  },
  
  // Header display
  getTitle: (data) => data.name,
  getSubtitle: (data) => `Client depuis le ${data.joinDate}`,
  
  // Custom header rendering
  renderHeader: (data) => (
    <ContentSection>
      <div className="p-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          {/* Avatar */}
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-3xl font-bold shadow-lg flex-shrink-0">
            {data.name.split(' ').map(n => n.charAt(0)).join('')}
          </div>

          {/* Info */}
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
                {data.status}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div className="flex items-center gap-3">
                <i className="fas fa-envelope text-blue-600 dark:text-blue-400"></i>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Email</p>
                  <p className="text-sm text-slate-900 dark:text-white">{data.email}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <i className="fas fa-phone text-green-600 dark:text-green-400"></i>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Téléphone</p>
                  <p className="text-sm text-slate-900 dark:text-white">{data.phone}</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <i className="fas fa-map-marker-alt text-red-600 dark:text-red-400"></i>
                <div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Adresse</p>
                  <p className="text-sm text-slate-900 dark:text-white">{data.address}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ContentSection>
  ),
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-folder-open",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.relatedDossiers?.length || 0,
      label: "Dossiers"
    },
    {
      icon: "fas fa-file-invoice",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.invoices?.length || 0,
      label: "Factures"
    },
    {
      icon: "fas fa-file",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.documents?.length || 0,
      label: "Documents"
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
      id: "dossiers",
      label: "Dossiers",
      icon: "fas fa-folder-open",
      component: "relatedItems",
      getCount: (data) => data.relatedDossiers?.length || 0,
      // Configuration for related items
      itemsKey: "relatedDossiers",
      itemRoute: "/dossiers",
      emptyMessage: "Aucun dossier associé",
      renderItem: (item) => ({
        title: item.caseNumber,
        subtitle: item.title,
        status: item.status,
      }),
    },
    {
      id: "documents",
      label: "Documents",
      icon: "fas fa-file",
      component: "documents",
      getCount: (data) => data.documents?.length || 0,
    },
    {
      id: "invoices",
      label: "Factures",
      icon: "fas fa-file-invoice",
      component: "relatedItems",
      getCount: (data) => data.invoices?.length || 0,
      itemsKey: "invoices",
      emptyMessage: "Aucune facture",
      renderItem: (item) => ({
        title: item.number,
        subtitle: item.date,
        status: item.status,
        extra: item.amount,
      }),
    },
    {
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "timeline",
    },
  ],
  
  // Overview tab fields
  overviewSections: [
    {
      title: "Informations Personnelles",
      fields: [
        { label: "CIN", value: (data) => data.cin, icon: "fas fa-id-card" },
        { label: "Date de naissance", value: (data) => data.dateOfBirth, icon: "fas fa-birthday-cake" },
        { label: "Profession", value: (data) => data.profession, icon: "fas fa-briefcase" },
        { label: "Entreprise", value: (data) => data.company, icon: "fas fa-building" },
        { label: "Matricule Fiscal", value: (data) => data.taxId, icon: "fas fa-file-alt" },
        { label: "Téléphone alternatif", value: (data) => data.alternatePhone, icon: "fas fa-phone-alt" },
      ],
    },
    {
      title: "Notes",
      type: "notes",
      content: (data) => data.notes,
    },
  ],
};