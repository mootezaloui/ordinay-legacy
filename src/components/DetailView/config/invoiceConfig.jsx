import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockAccountingExtended, getStatusColor } from "../../../utils/mockData";

/**
 * Invoice (Facture) Entity Configuration
 */
export const invoiceConfig = {
  // Basic info
  entityType: "invoice",
  entityName: "Facture",
  icon: "fas fa-file-invoice",
  listRoute: "/accounting",
  
  // Messages
  notFoundMessage: "Facture non trouvée",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer cette facture ?",
  
  // Permissions
  allowDelete: true,
  allowEdit: true,
  
  // Data fetching
  fetchData: async (id) => {
    return mockAccountingExtended[id] || null;
  },
  
  updateData: async (id, data) => {
    console.log("Updating invoice:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },
  
  deleteData: async (id) => {
    console.log("Deleting invoice:", id);
  },
  
  // Header display
  getTitle: (data) => data.invoiceNumber,
  getSubtitle: (data) => `Client: ${data.client.name}`,
  
  // Custom header rendering
  renderHeader: (data) => {
    return (
      <ContentSection>
        <div className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">
                Facture {data.invoiceNumber}
              </h2>
              <Link
                to={`/clients/${data.client.id}`}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-2"
              >
                <i className="fas fa-user"></i>
                {data.client.name}
              </Link>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <p className="text-sm text-slate-500 dark:text-slate-400">Montant total</p>
                <p className="text-3xl font-bold text-slate-900 dark:text-white">{data.amount}</p>
              </div>
              <span className={`px-3 py-1 rounded-full text-sm font-medium ${getStatusColor(data.status)}`}>
                {data.status}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <InfoCard icon="fas fa-calendar" label="Date d'émission" value={data.date} color="blue" />
            <InfoCard icon="fas fa-calendar-check" label="Date d'échéance" value={data.dueDate} color="red" />
            <InfoCard icon="fas fa-tag" label="Type" value={data.type} color="purple" />
            <InfoCard icon="fas fa-receipt" label="Mode de paiement" value={data.paymentMethod || "N/A"} color="green" />
          </div>
        </div>
      </ContentSection>
    );
  },
  
  // Stats cards
  getStats: (data) => [
    {
      icon: "fas fa-dollar-sign",
      iconColor: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-100 dark:bg-green-900/20",
      value: data.amount,
      label: "Montant"
    },
    {
      icon: "fas fa-money-bill-wave",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.paidAmount || "0 TND",
      label: "Payé"
    },
    {
      icon: "fas fa-calendar-alt",
      iconColor: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-100 dark:bg-red-900/20",
      value: data.dueDate,
      label: "Échéance"
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
      id: "items",
      label: "Lignes de facture",
      icon: "fas fa-list",
      component: "relatedItems",
      getCount: (data) => data.items?.length || 0,
      
      itemsKey: "items",
      emptyMessage: "Aucune ligne de facture",
      renderItem: (item) => ({
        title: item.description,
        subtitle: `Quantité: ${item.quantity} × ${item.unitPrice}`,
        extra: item.total,
      }),
      
      allowAdd: true,
      allowDelete: true,
      entityName: "une ligne",
      formFields: [
        {
          name: "description",
          label: "Description",
          type: "text",
          required: true,
          fullWidth: true,
          placeholder: "Ex: Consultation juridique"
        },
        {
          name: "quantity",
          label: "Quantité",
          type: "number",
          required: true,
          defaultValue: "1"
        },
        {
          name: "unitPrice",
          label: "Prix unitaire",
          type: "text",
          required: true,
          placeholder: "Ex: 500 TND"
        },
      ],
    },
    {
      id: "payments",
      label: "Paiements",
      icon: "fas fa-money-check",
      component: "relatedItems",
      getCount: (data) => data.payments?.length || 0,
      
      itemsKey: "payments",
      emptyMessage: "Aucun paiement",
      renderItem: (item) => ({
        title: `Paiement du ${item.date}`,
        subtitle: `${item.method} - ${item.reference}`,
        extra: item.amount,
        status: "Payée",
      }),
      
      allowAdd: true,
      allowDelete: true,
      entityName: "un paiement",
      formFields: [
        {
          name: "date",
          label: "Date",
          type: "date",
          required: true,
        },
        {
          name: "amount",
          label: "Montant",
          type: "text",
          required: true,
          placeholder: "Ex: 500 TND"
        },
        {
          name: "method",
          label: "Mode de paiement",
          type: "select",
          required: true,
          options: [
            { value: "Espèces", label: "Espèces" },
            { value: "Chèque", label: "Chèque" },
            { value: "Virement", label: "Virement" },
            { value: "Carte bancaire", label: "Carte bancaire" },
          ]
        },
        {
          name: "reference",
          label: "Référence",
          type: "text",
          placeholder: "Numéro de chèque, référence..."
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
      id: "timeline",
      label: "Historique",
      icon: "fas fa-history",
      component: "timeline",
    },
  ],
  
  // Overview tab sections
  overviewSections: [
    {
      title: "Informations client",
      fields: [
        { 
          key: "client.name",
          label: "Client", 
          value: (data) => data.client?.name || "N/A", 
          icon: "fas fa-user",
          editable: false
        },
        { 
          key: "client.email",
          label: "Email", 
          value: (data) => data.client?.email || "N/A", 
          icon: "fas fa-envelope",
          editable: false
        },
        { 
          key: "client.phone",
          label: "Téléphone", 
          value: (data) => data.client?.phone || "N/A", 
          icon: "fas fa-phone",
          editable: false
        },
        { 
          key: "client.address",
          label: "Adresse", 
          value: (data) => data.client?.address || "N/A", 
          icon: "fas fa-map-marker-alt",
          editable: false
        },
      ],
    },
    {
      title: "Détails de la facture",
      fields: [
        { 
          key: "invoiceNumber",
          label: "Numéro de facture", 
          value: (data) => data.invoiceNumber, 
          icon: "fas fa-hashtag",
          type: "text",
          editable: true
        },
        { 
          key: "type",
          label: "Type", 
          value: (data) => data.type, 
          icon: "fas fa-tag",
          type: "select",
          editable: true,
          options: [
            { value: "Honoraire", label: "Honoraire" },
            { value: "Consultation", label: "Consultation" },
            { value: "Frais", label: "Frais" },
          ]
        },
        { 
          key: "date",
          label: "Date d'émission", 
          value: (data) => data.date, 
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
        { 
          key: "dueDate",
          label: "Date d'échéance", 
          value: (data) => data.dueDate, 
          icon: "fas fa-calendar-check",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Montants",
      fields: [
        { 
          key: "subtotal",
          label: "Sous-total", 
          value: (data) => data.subtotal || data.amount, 
          icon: "fas fa-calculator",
          type: "text",
          editable: true
        },
        { 
          key: "tax",
          label: "TVA (19%)", 
          value: (data) => data.tax || "0 TND", 
          icon: "fas fa-percent",
          type: "text",
          editable: true
        },
        { 
          key: "amount",
          label: "Total TTC", 
          value: (data) => data.amount, 
          icon: "fas fa-dollar-sign",
          type: "text",
          editable: true,
          required: true
        },
        { 
          key: "paidAmount",
          label: "Montant payé", 
          value: (data) => data.paidAmount || "0 TND", 
          icon: "fas fa-money-bill-wave",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Statut et paiement",
      fields: [
        { 
          key: "status",
          label: "Statut", 
          value: (data) => data.status, 
          icon: "fas fa-info-circle",
          type: "select",
          editable: true,
          options: [
            { value: "Payée", label: "Payée" },
            { value: "En attente", label: "En attente" },
            { value: "En retard", label: "En retard" },
            { value: "Annulée", label: "Annulée" },
          ]
        },
        { 
          key: "paymentMethod",
          label: "Mode de paiement", 
          value: (data) => data.paymentMethod || "Non défini", 
          icon: "fas fa-credit-card",
          type: "select",
          editable: true,
          options: [
            { value: "Espèces", label: "Espèces" },
            { value: "Chèque", label: "Chèque" },
            { value: "Virement", label: "Virement" },
            { value: "Carte bancaire", label: "Carte bancaire" },
          ]
        },
      ],
    },
    {
      title: "Notes",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "Aucune note",
    },
  ],
};

// Helper component
function InfoCard({ icon, label, value, color }) {
  const colors = {
    blue: "bg-blue-100 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400",
    red: "bg-red-100 dark:bg-red-900/20 text-red-600 dark:text-red-400",
    purple: "bg-purple-100 dark:bg-purple-900/20 text-purple-600 dark:text-purple-400",
    green: "bg-green-100 dark:bg-green-900/20 text-green-600 dark:text-green-400",
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