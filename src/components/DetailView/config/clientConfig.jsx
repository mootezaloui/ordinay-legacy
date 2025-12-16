import { Link } from "react-router-dom";
import ContentSection from "../../layout/ContentSection";
import { mockClientsExtended, getStatusColor, mockCases, mockSessions, mockTasks } from "../../../utils/mockData";
import { dossierFormFields, caseFormFields, sessionFormFields, taskFormFields } from "../../FormModal/formConfigs";

/**
 * Client Entity Configuration - UPDATED with Quick Actions
 * ✅ Added inline quick actions for status
 * ✅ Added structured edit mode for overview sections
 */
export const clientConfig = {
  entityType: "client",
  entityName: "Client",
  icon: "fas fa-user-circle",
  listRoute: "/clients",
  notFoundMessage: "Client non trouvé",
  deleteConfirmMessage: "Êtes-vous sûr de vouloir supprimer ce client ?",
  allowDelete: true,
  allowEdit: true,

  fetchData: async (id) => {
    return mockClientsExtended[id] || null;
  },

  updateData: async (id, data) => {
    console.log("Updating client:", id, data);
    await new Promise(resolve => setTimeout(resolve, 500));
  },

  deleteData: async (id) => {
    console.log("Deleting client:", id);
  },

  getTitle: (data) => data.name,
  getSubtitle: (data) => `Client depuis le ${data.joinDate}`,

  // ✅ NEW: Quick Actions Configuration
  quickActions: [
    {
      key: "status",
      label: "Statut",
      icon: "fas fa-flag",
      colorMap: true,
      options: [
        { value: "Actif", label: "Actif", color: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" },
        { value: "Inactif", label: "Inactif", color: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
      ],
    }
  ],

  renderHeader: (data) => (
    <ContentSection>
      <div className="p-6">
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

  getStats: (data) => [
    {
      icon: "fas fa-folder-open",
      iconColor: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-100 dark:bg-blue-900/20",
      value: data.relatedDossiers?.length || 0,
      label: "Dossiers"
    },
    {
      icon: "fas fa-file",
      iconColor: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-100 dark:bg-purple-900/20",
      value: data.documents?.length || 0,
      label: "Documents"
    },
  ],

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
      component: "aggregatedRelated",
      aggregationType: "dossiers",
      getCount: (data) => data.relatedDossiers?.length || 0,
      itemsKey: "relatedDossiers",
      allowAdd: true,
      allowDelete: true,
      entityName: "un dossier",
      addSubtitle: "Créer un nouveau dossier pour ce client",
      formFields: dossierFormFields.filter(field => field.name !== 'clientId'),
    },
    {
      id: "cases",
      label: "Procès",
      icon: "fas fa-gavel",
      component: "aggregatedRelated",
      aggregationType: "cases",
      getCount: (data) => {
        const relatedDossiers = data.relatedDossiers || [];
        return mockCases.filter(cas =>
          relatedDossiers.some(dossier => dossier.id === cas.dossierId)
        ).length;
      },
      allowAdd: true,
      allowDelete: false,
      entityName: "un procès",
      addSubtitle: "Créer un nouveau procès pour ce client",
      // Dynamic form fields - dossierId options filtered to client's dossiers
      getFormFields: (clientData) => {
        const relatedDossiers = clientData.relatedDossiers || [];
        return caseFormFields.map(field => {
          if (field.name === 'dossierId') {
            return {
              ...field,
              options: relatedDossiers.map(dossier => ({
                value: dossier.id,
                label: `${dossier.caseNumber} - ${dossier.title}`
              })),
              helpText: relatedDossiers.length === 0
                ? "Aucun dossier disponible. Veuillez d'abord créer un dossier."
                : "Sélectionner le dossier auquel ce procès sera rattaché"
            };
          }
          return field;
        });
      },
    },
    {
      id: "sessions",
      label: "Séances",
      icon: "fas fa-calendar-alt",
      component: "aggregatedRelated",
      aggregationType: "sessions",
      getCount: (data) => {
        const relatedDossiers = data.relatedDossiers || [];
        const relatedCases = mockCases.filter(cas =>
          relatedDossiers.some(dossier => dossier.id === cas.dossierId)
        );
        return mockSessions.filter(session =>
          relatedCases.some(cas => cas.id === session.caseId)
        ).length;
      },
      allowAdd: true,
      allowDelete: false,
      entityName: "une séance",
      addSubtitle: "Créer une nouvelle séance pour ce client",
      // Dynamic form fields - allow linking to either dossier or procès
      getFormFields: (clientData) => {
        const relatedDossiers = clientData.relatedDossiers || [];
        const relatedCases = mockCases.filter(cas =>
          relatedDossiers.some(dossier => dossier.id === cas.dossierId)
        );

        return sessionFormFields.map(field => {
          // Allow linkType to be editable - choose between dossier and case
          if (field.name === 'linkType') {
            return {
              ...field,
              // Not disabled - user can choose
              defaultValue: 'case', // Default to case if available
              helpText: relatedCases.length > 0
                ? "Choisir si cette séance est liée à un dossier ou à un procès spécifique"
                : "Choisir si cette séance est liée à un dossier"
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
                ? "Aucun procès disponible. Veuillez d'abord créer un procès."
                : "Sélectionner le procès auquel cette séance sera rattachée",
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
                ? "Aucun dossier disponible."
                : "Sélectionner le dossier auquel cette séance sera rattachée",
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
      label: "Tâches",
      icon: "fas fa-tasks",
      component: "aggregatedRelated",
      aggregationType: "tasks",
      getCount: (data) => {
        const relatedDossiers = data.relatedDossiers || [];
        const relatedCases = mockCases.filter(cas =>
          relatedDossiers.some(dossier => dossier.id === cas.dossierId)
        );
        return mockTasks.filter(task => {
          if (task.parentType === 'dossier') {
            return relatedDossiers.some(dossier => dossier.id === task.dossierId);
          } else if (task.parentType === 'case') {
            return relatedCases.some(cas => cas.id === task.caseId);
          }
          return false;
        }).length;
      },
      allowAdd: true,
      allowDelete: false,
      entityName: "une tâche",
      addSubtitle: "Créer une nouvelle tâche pour ce client",
      // Dynamic form fields - dossierId and caseId options filtered to client's entities
      getFormFields: (clientData) => {
        const relatedDossiers = clientData.relatedDossiers || [];
        const relatedCases = mockCases.filter(cas =>
          relatedDossiers.some(dossier => dossier.id === cas.dossierId)
        );

        return taskFormFields.map(field => {
          if (field.name === 'dossierId') {
            return {
              ...field,
              options: relatedDossiers.map(dossier => ({
                value: dossier.id,
                label: `${dossier.caseNumber} - ${dossier.title}`
              })),
              helpText: relatedDossiers.length === 0
                ? "Aucun dossier disponible. Veuillez d'abord créer un dossier."
                : "Sélectionner le dossier auquel cette tâche sera rattachée",
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
              options: relatedCases.map(cas => {
                const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
                return {
                  value: cas.id,
                  label: `${cas.caseNumber} - ${cas.title} (${parentDossier?.caseNumber || 'N/A'})`
                };
              }),
              helpText: relatedCases.length === 0
                ? "Aucun procès disponible. Veuillez d'abord créer un procès."
                : "Sélectionner le procès auquel cette tâche sera rattachée",
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
      label: "Comptabilité",
      icon: "fas fa-calculator",
      component: "financial",
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

  // ✅ UPDATED: Overview sections with editStrategy
  overviewSections: [
    {
      title: "Informations Personnelles",
      editStrategy: "structured",
      fields: [
        {
          key: "name",
          label: "Nom complet",
          value: (data) => data.name,
          icon: "fas fa-user",
          type: "text",
          editable: true,
          required: true
        },
        {
          key: "cin",
          label: "CIN",
          value: (data) => data.cin,
          icon: "fas fa-id-card",
          type: "text",
          editable: true
        },
        {
          key: "dateOfBirth",
          label: "Date de naissance",
          value: (data) => data.dateOfBirth,
          icon: "fas fa-birthday-cake",
          type: "date",
          editable: true
        },
        {
          key: "profession",
          label: "Profession",
          value: (data) => data.profession,
          icon: "fas fa-briefcase",
          type: "text",
          editable: true
        },
        {
          key: "company",
          label: "Entreprise",
          value: (data) => data.company,
          icon: "fas fa-building",
          type: "text",
          editable: true
        },
        {
          key: "taxId",
          label: "Matricule Fiscal",
          value: (data) => data.taxId,
          icon: "fas fa-file-alt",
          type: "text",
          editable: true
        },
      ],
    },
    {
      title: "Coordonnées",
      editStrategy: "structured",
      fields: [
        {
          key: "email",
          label: "Email",
          value: (data) => data.email,
          icon: "fas fa-envelope",
          type: "email",
          editable: true,
          required: true
        },
        {
          key: "phone",
          label: "Téléphone",
          value: (data) => data.phone,
          icon: "fas fa-phone",
          type: "tel",
          editable: true,
          required: true
        },
        {
          key: "alternatePhone",
          label: "Téléphone alternatif",
          value: (data) => data.alternatePhone,
          icon: "fas fa-phone-alt",
          type: "tel",
          editable: true
        },
        {
          key: "address",
          label: "Adresse",
          value: (data) => data.address,
          icon: "fas fa-map-marker-alt",
          type: "textarea",
          editable: true,
          rows: 2
        },
      ],
    },
    {
      title: "Informations d'inscription",
      editStrategy: "structured",
      fields: [
        {
          key: "joinDate",
          label: "Date d'inscription",
          value: (data) => data.joinDate,
          icon: "fas fa-calendar",
          type: "date",
          editable: true
        },
      ],
    },
    {
      title: "Notes",
      editStrategy: "structured",
      type: "notes",
      fieldKey: "notes",
      content: (data) => data.notes || "Aucune note",
    },
  ],
};