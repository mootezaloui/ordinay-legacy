import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import { getEntityConfig } from "./config/entityConfigs";
import OverviewTab from "./tabs/OverviewTab";
import DocumentsTab from "./tabs/DocumentsTab";
import TimelineTab from "./tabs/TimelineTab";
import NotesTab from "./tabs/NotesTab";
import RelatedItemsTab from "./tabs/RelatedItemsTab";
import AggregatedRelatedTab from "./tabs/AggregatedRelatedTab";
import MissionsTab from "./tabs/MissionsTab";
import FinancialTab from "./tabs/FinancialTab";
import QuickActionsBar from "./QuickActionsBar";
import { mockCases, mockSessions, mockTasks } from "../../utils/mockData";

/**
 * Generic DetailView component with modern inline editing UX
 * ✅ UPDATED: Inline quick actions + structured edit mode
 */
export default function DetailView({ entityType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [isEditing, setIsEditing] = useState(false);
  const [activeTab, setActiveTab] = useState("overview");
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Get configuration for this entity type
  const config = getEntityConfig(entityType);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const entityData = await config.fetchData(id);
        setData(entityData);
        setOriginalData(entityData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [id, entityType]);

  if (loading) {
    return (
      <PageLayout>
        <div className="flex items-center justify-center py-12">
          <div className="text-center">
            <i className="fas fa-spinner fa-spin text-4xl text-blue-600 dark:text-blue-400 mb-4"></i>
            <p className="text-slate-600 dark:text-slate-400">Chargement...</p>
          </div>
        </div>
      </PageLayout>
    );
  }

  if (!data) {
    return (
      <PageLayout>
        <div className="text-center py-12">
          <i className={`${config.icon} text-6xl text-slate-400 dark:text-slate-600 mb-4`}></i>
          <p className="text-slate-600 dark:text-slate-400 mb-4">
            {config.notFoundMessage}
          </p>
          <button
            onClick={() => navigate(config.listRoute)}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            <i className="fas fa-arrow-left mr-2"></i>
            Retour à la liste
          </button>
        </div>
      </PageLayout>
    );
  }

  // ✅ Handle inline quick action changes
  const handleQuickAction = async (field, value, validation) => {
    // Run validation if provided
    if (validation) {
      const error = validation(data, value);
      if (error) {
        showToast(error, "error");
        return;
      }
    }

    const oldValue = data[field];

    // Optimistic update
    const newData = { ...data, [field]: value };
    setData(newData);

    try {
      // Auto-save to backend
      await config.updateData(id, { [field]: value });

      // Create timeline entry
      const timelineEntry = {
        type: `${field}_change`,
        event: `${field} modifié`,
        timestamp: new Date().toISOString(),
        user: "Me. Hammami", // TODO: Get from auth context
        oldValue,
        newValue: value,
      };

      // Add to timeline if it exists
      if (data.timeline) {
        newData.timeline = [timelineEntry, ...data.timeline];
        setData(newData);
      }

      // Update original data to reflect saved state
      setOriginalData(newData);

    } catch (error) {
      console.error("Error saving quick action:", error);
      // Rollback on error
      setData({ ...data, [field]: oldValue });
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleDataChange = (newData) => {
    setData(newData);
  };

  const handleDocumentsChange = (newDocuments) => {
    const newData = { ...data, documents: newDocuments };
    setData(newData);
  };

  const handleItemsChange = (itemsKey, newItems) => {
    const newData = { ...data, [itemsKey]: newItems };
    setData(newData);
  };

  // Handle data refresh (for financial tab and other updates)
  const handleDataRefresh = async () => {
    try {
      const entityData = await config.fetchData(id);
      setData(entityData);
      setOriginalData(entityData);
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // ✅ Handle structured section saves (batched changes)
  const handleSectionSave = async (sectionData) => {
    const updatedData = { ...data, ...sectionData };
    setData(updatedData);

    try {
      await config.updateData(id, sectionData);

      // Create batched timeline entry for multiple field changes
      const changedFields = Object.keys(sectionData).filter(
        key => sectionData[key] !== originalData[key]
      );

      if (changedFields.length > 0) {
        const timelineEntry = {
          type: "fields_updated",
          event: "Plusieurs champs modifiés",
          timestamp: new Date().toISOString(),
          user: "Me. Hammami", // TODO: Get from auth context
          changes: changedFields.map(field => ({
            field,
            oldValue: originalData[field],
            newValue: sectionData[field],
          })),
        };

        if (updatedData.timeline) {
          updatedData.timeline = [timelineEntry, ...updatedData.timeline];
          setData(updatedData);
        }
      }

      setOriginalData(updatedData);
      setIsEditing(false);
      showToast("Modifications enregistrées avec succès!", "success");
    } catch (error) {
      console.error("Error saving:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleSave = async () => {
    try {
      await config.updateData(id, data);
      setOriginalData(data);
      setIsEditing(false);
      showToast("Modifications enregistrées avec succès!", "success");
    } catch (error) {
      console.error("Error saving:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleCancel = () => {
    setData(originalData);
    setIsEditing(false);
  };

  const handleDelete = async () => {
    if (await confirm({
      title: "Supprimer",
      message: config.deleteConfirmMessage,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      try {
        await config.deleteData(id);
        navigate(config.listRoute);
      } catch (error) {
        showToast("Erreur lors de la suppression", "error");
      }
    }
  };

  const renderTabContent = () => {
    const tabConfig = config.tabs.find(t => t.id === activeTab);

    if (!tabConfig) return null;

    // ✅ Support for custom render functions
    if (tabConfig.render) {
      return tabConfig.render(data, handleDataChange);
    }

    switch (tabConfig.component) {
      case "overview":
        return (
          <OverviewTab
            data={data}
            config={config}
            isEditing={isEditing}
            onDataChange={handleDataChange}
            onSectionSave={handleSectionSave}
          />
        );
      case "documents":
        return (
          <DocumentsTab
            data={data}
            config={config}
            onDocumentsChange={handleDocumentsChange}
          />
        );
      case "timeline":
        return <TimelineTab data={data} config={config} />;
      case "notes":
        return <NotesTab data={data} config={config} />;
      case "financial":
        return (
          <FinancialTab
            entityType={config.entityType}
            entityId={parseInt(id)}
            entityData={data}
            onUpdate={handleDataRefresh}
          />
        );
      case "relatedItems":
        return (
          <RelatedItemsTab
            data={data}
            config={config}
            tabConfig={tabConfig}
            onItemsChange={handleItemsChange}
          />
        );
      case "missions":
        return (
          <MissionsTab
            data={data}
            config={config}
            tabConfig={tabConfig}
            onItemsChange={handleItemsChange}
          />
        );
      case "aggregatedRelated":
        return renderAggregatedTab(tabConfig);
      default:
        return <div className="p-6 text-slate-600 dark:text-slate-400">Tab content not found</div>;
    }
  };

  // Helper to render aggregated related entity tabs (for Client and Dossier entities)
  const renderAggregatedTab = (tabConfig) => {
    // Aggregate data based on type
    let items = [];
    let getParentContext = null;
    let entityConfig = {};

    // Check entity type to determine context
    const isClient = config.entityType === 'client';
    const isDossier = config.entityType === 'dossier';

    switch (tabConfig.aggregationType) {
      case "dossiers":
        // Client entity: Direct children - no aggregation needed
        items = data.relatedDossiers || [];
        getParentContext = null;

        entityConfig = {
          title: "Dossiers",
          icon: "fas fa-folder-open",
          iconColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-100 dark:bg-blue-900/20",
          route: "/dossiers",
          emptyMessage: "Aucun dossier pour ce client",
          getTitle: (item) => item.caseNumber,
          getSubtitle: (item) => `${item.title} • Catégorie: ${item.category || 'N/A'}`,
          getStatus: (item) => item.status,
        };
        break;

      case "cases":
        if (isClient) {
          // Client entity: Get all Procès related to this client (via Dossiers)
          const relatedDossiers = data.relatedDossiers || [];
          items = mockCases.filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          getParentContext = (cas) => {
            const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
            return { dossier: parentDossier };
          };

          entityConfig = {
            title: "Procès",
            icon: "fas fa-gavel",
            iconColor: "text-purple-600 dark:text-purple-400",
            bgColor: "bg-purple-100 dark:bg-purple-900/20",
            route: "/cases",
            emptyMessage: "Aucun procès pour ce client",
            getTitle: (item) => item.caseNumber,
            getSubtitle: (item) => `${item.title} • Prochaine audience: ${item.nextHearing || 'Non programmée'}`,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          // Dossier entity: Direct children - proceedings of this dossier
          items = data.proceedings || [];
          getParentContext = null; // No parent context needed (direct children)

          entityConfig = {
            title: "Procès",
            icon: "fas fa-gavel",
            iconColor: "text-purple-600 dark:text-purple-400",
            bgColor: "bg-purple-100 dark:bg-purple-900/20",
            route: "/cases",
            emptyMessage: "Aucun procès pour ce dossier",
            getTitle: (item) => item.caseNumber,
            getSubtitle: (item) => `${item.title} • Prochaine audience: ${item.nextHearing || 'Non programmée'}`,
            getStatus: (item) => item.status,
          };
        }
        break;

      case "sessions":
        if (isClient) {
          // Client entity: Get all Séances related to this client (via Procès)
          const relatedDossiers = data.relatedDossiers || [];
          const relatedCases = mockCases.filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          items = mockSessions.filter(session =>
            relatedCases.some(cas => cas.id === session.caseId)
          ).sort((a, b) => new Date(a.date) - new Date(b.date));

          getParentContext = (session) => {
            const parentCase = relatedCases.find(c => c.id === session.caseId);
            const parentDossier = parentCase ? relatedDossiers.find(d => d.id === parentCase.dossierId) : null;
            return {
              dossier: parentDossier,
              case: parentCase
            };
          };

          entityConfig = {
            title: "Séances",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: "Aucune séance programmée pour ce client",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} à ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          // Dossier entity: Get all Séances from this dossier's procès
          const dossierCases = data.proceedings || [];

          items = mockSessions.filter(session =>
            dossierCases.some(cas => cas.id === session.caseId)
          ).sort((a, b) => new Date(a.date) - new Date(b.date));

          getParentContext = (session) => {
            const parentCase = dossierCases.find(c => c.id === session.caseId);
            return { case: parentCase };
          };

          entityConfig = {
            title: "Séances",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: "Aucune séance programmée pour ce dossier",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} à ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'case') {
          // Case entity: Direct children - sessions of this case only
          items = data.sessions || [];
          getParentContext = null; // No parent context needed (direct children)

          entityConfig = {
            title: "Séances",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: "Aucune séance programmée pour ce procès",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} à ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        }
        break;

      case "tasks":
        if (isClient) {
          // Client entity: Get all Tasks related to this client (via Dossiers or Procès)
          const relatedDossiers = data.relatedDossiers || [];
          const relatedCasesForTasks = mockCases.filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          items = mockTasks.filter(task => {
            if (task.parentType === 'dossier') {
              return relatedDossiers.some(dossier => dossier.id === task.dossierId);
            } else if (task.parentType === 'case') {
              return relatedCasesForTasks.some(cas => cas.id === task.caseId);
            }
            return false;
          }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

          getParentContext = (task) => {
            if (task.parentType === 'dossier') {
              const parentDossier = relatedDossiers.find(d => d.id === task.dossierId);
              return { dossier: parentDossier };
            } else if (task.parentType === 'case') {
              const parentCase = relatedCasesForTasks.find(c => c.id === task.caseId);
              const parentDossier = parentCase ? relatedDossiers.find(d => d.id === parentCase.dossierId) : null;
              return {
                dossier: parentDossier,
                case: parentCase
              };
            }
            return null;
          };

          entityConfig = {
            title: "Tâches",
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: "Aucune tâche pour ce client",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `Échéance: ${item.dueDate} • Assigné à: ${item.assignedTo}`,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          // Dossier entity: Get all Tasks for THIS dossier or its procès
          const dossierCases = data.proceedings || [];

          items = mockTasks.filter(task => {
            if (task.parentType === 'dossier' && task.dossierId === data.id) {
              return true;
            } else if (task.parentType === 'case') {
              return dossierCases.some(cas => cas.id === task.caseId);
            }
            return false;
          }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

          getParentContext = (task) => {
            if (task.parentType === 'case') {
              const parentCase = dossierCases.find(c => c.id === task.caseId);
              return { case: parentCase };
            }
            return null; // Task directly linked to dossier, no parent context needed
          };

          entityConfig = {
            title: "Tâches",
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: "Aucune tâche pour ce dossier",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `Échéance: ${item.dueDate} • Assigné à: ${item.assignedTo}`,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'case') {
          // Case entity: Get all Tasks for THIS case or its parent dossier
          const parentDossier = data.dossier;

          items = mockTasks.filter(task => {
            if (task.parentType === 'case' && task.caseId === data.id) {
              return true;
            } else if (task.parentType === 'dossier' && parentDossier && task.dossierId === parentDossier.id) {
              return true;
            }
            return false;
          }).sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

          getParentContext = (task) => {
            if (task.parentType === 'dossier') {
              return { dossier: parentDossier };
            }
            return null; // Task directly linked to case, no parent context needed
          };

          entityConfig = {
            title: "Tâches",
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: "Aucune tâche pour ce procès",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `Échéance: ${item.dueDate} • Assigné à: ${item.assignedTo}`,
            getStatus: (item) => item.status,
          };
        }
        break;

      case "missions":
        // Missions are directly available on dossier or case data
        if (isDossier) {
          items = data.missions || [];
          getParentContext = null;

          entityConfig = {
            title: "Missions Huissier",
            icon: "fas fa-clipboard-list",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
            route: "/officers", // Link to officer detail where mission is shown
            emptyMessage: "Aucune mission d'huissier pour ce dossier",
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => `${item.title} • ${item.missionType} • Huissier: ${item.officerName || 'N/A'}`,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'case') {
          items = data.missions || [];
          getParentContext = null;

          entityConfig = {
            title: "Missions Huissier",
            icon: "fas fa-clipboard-list",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
            route: "/officers",
            emptyMessage: "Aucune mission d'huissier pour ce procès",
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => `${item.title} • ${item.missionType} • Huissier: ${item.officerName || 'N/A'}`,
            getStatus: (item) => item.status,
          };
        }
        break;

      default:
        return <div className="p-6 text-slate-600 dark:text-slate-400">Type d'agrégation non reconnu</div>;
    }

    return (
      <AggregatedRelatedTab
        data={data}
        config={config}
        items={items}
        getParentContext={getParentContext}
        entityConfig={entityConfig}
        tabConfig={tabConfig}
        onItemsChange={handleItemsChange}
      />
    );
  };

  return (
    <PageLayout>
      <PageHeader
        title={config.getTitle(data)}
        subtitle={config.getSubtitle(data)}
        icon={config.icon}
        actions={
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(config.listRoute)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Retour
            </button>

            {config.allowDelete && !isEditing && (
              <button
                onClick={handleDelete}
                className="px-4 py-2 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors duration-200"
              >
                <i className="fas fa-trash mr-2"></i>
                Supprimer
              </button>
            )}
          </div>
        }
      />

      <div className="space-y-6">
        {/* Header Section - customizable per entity */}
        {config.renderHeader && config.renderHeader(data)}

        {/* ✅ NEW: Quick Actions Bar - Inline editable fields */}
        {config.quickActions && (
          <QuickActionsBar
            data={data}
            config={config}
            onQuickAction={handleQuickAction}
          />
        )}

        {/* Stats Cards - if defined */}
        {config.getStats && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {config.getStats(data).map((stat, index) => (
              <div
                key={index}
                className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
              >
                <div className="flex items-center gap-3">
                  <div className={`p-3 rounded-lg ${stat.bgColor}`}>
                    <i className={`${stat.icon} ${stat.iconColor} text-xl`}></i>
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-slate-900 dark:text-white">
                      {stat.value}
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400">{stat.label}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        <div className="border-b border-slate-200 dark:border-slate-700 overflow-x-auto">
          <div className="flex gap-2 min-w-max">
            {config.tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 font-medium transition-colors duration-200 border-b-2 flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                  }`}
              >
                <i className={tab.icon}></i>
                {tab.label}
                {tab.getCount && (
                  <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs">
                    {tab.getCount(data)}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        {renderTabContent()}
      </div>
    </PageLayout>
  );
}