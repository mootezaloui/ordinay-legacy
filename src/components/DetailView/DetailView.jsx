import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useData } from "../../contexts/DataContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import { getEntityConfig } from "./config/entityConfigs";
import OverviewTab from "./tabs/OverviewTab";
import DocumentsTab from "./tabs/DocumentsTab";
import TimelineTab from "./tabs/TimelineTab";
import HistoryTab from "./tabs/HistoryTab";
import NotesTab from "./tabs/NotesTab";
import RelatedItemsTab from "./tabs/RelatedItemsTab";
import AggregatedRelatedTab from "./tabs/AggregatedRelatedTab";
import MissionsTab from "./tabs/MissionsTab";
import FinancialTab from "./tabs/FinancialTab";
import QuickActionsBar from "./QuickActionsBar";
import ClientNotificationPrompt from "../ui/ClientNotificationPrompt";
import { shouldPromptClientNotification, sendClientNotification, getPendingNotification, clearPendingNotification, setPendingNotification } from "../../services/clientCommunication";
import BlockerModal from "../ui/BlockerModal";
import { canPerformAction } from "../../services/domainRules";

/**
 * Generic DetailView component with modern inline editing UX
 * ✅ UPDATED: Inline quick actions + structured edit mode
 * ✅ UPDATED: Uses DataContext for dynamic data
 */
export default function DetailView({ entityType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const contextData = useData(); // Get all data from context
  const [isEditing, setIsEditing] = useState(false);
  const justSaved = useRef(false);
  const pendingNotificationRef = useRef(null);
  const latestContextRef = useRef(contextData);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [notificationPrompt, setNotificationPrompt] = useState({
    isOpen: false,
    eventType: null,
    eventData: null,
  });

  // Get configuration for this entity type
  const config = getEntityConfig(entityType);

  // ✅ Read active tab from URL query parameter, fallback to first tab or state
  const tabFromUrl = searchParams.get('tab');
  const tabFromState = location.state?.tab;
  const defaultTab = tabFromUrl || tabFromState || config.tabs?.[0]?.id || "overview";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [data, setData] = useState(null);
  const [originalData, setOriginalData] = useState(null);
  const [loading, setLoading] = useState(true);
  const globalLoading = contextData.loading;

  // Fallback: If financialEntry not found, use location.state?.createdEntry
  useEffect(() => {
    if (
      entityType === 'financialEntry' &&
      !loading &&
      !data &&
      location.state?.createdEntry
    ) {
      setData(location.state.createdEntry);
      setOriginalData(location.state.createdEntry);
    }
  }, [entityType, loading, data, location.state]);

  // Keep latest context in a ref so delayed callbacks don't read stale values
  useEffect(() => {
    latestContextRef.current = contextData;
  }, [contextData]);

  // ✅ Sync activeTab with URL parameter
  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  useEffect(() => {
    let isMounted = true;

    // Consume any pending notification (e.g., from a creation flow that navigated here)
    // Read pending notification but defer display until data is loaded to avoid flicker during navigation
    const pending = getPendingNotification?.();
    if (pending && pending.eventType) {
      pendingNotificationRef.current = pending;
    }

    const fetchData = async () => {
      if (!justSaved.current) {
        setLoading(true);
      }
      try {
        const entityData = await config.fetchData(id, latestContextRef.current);
        if (!isMounted) return;
        setData(entityData);
        setOriginalData(entityData);
      } catch (error) {
        console.error("Error fetching data:", error);
      } finally {
        if (!isMounted) return;
        setLoading(false);
        justSaved.current = false;
      }
    };

    // Reset to default tab when navigating to a different entity
    const tabFromUrl = searchParams.get('tab');
    if (!tabFromUrl) {
      const defaultTab = config.tabs?.[0]?.id || "overview";
      setActiveTab(defaultTab);
    }

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [id, entityType, contextData.clients, contextData.dossiers, contextData.cases, contextData.tasks, contextData.sessions, contextData.officers, contextData.personalTasks]);

  // Show pending notification once data is loaded to avoid pre-navigation flicker
  useEffect(() => {
    if (!loading && pendingNotificationRef.current && pendingNotificationRef.current.eventType) {
      const pending = pendingNotificationRef.current;
      pendingNotificationRef.current = null;
      setNotificationPrompt({
        isOpen: true,
        eventType: pending.eventType,
        eventData: pending.eventData,
      });
    }
  }, [loading]);

  if (loading || globalLoading) {
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

  if (!loading && !globalLoading && !data) {
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
    // ✅ Validate with domain rules before allowing any change
    const validationResult = canPerformAction(entityType, id, 'edit', {
      data: data,
      newData: { ...data, [field]: value },
      entities: contextData
    });

    if (!validationResult.allowed) {
      // Show blocker message with proper toast
      let blockerMsg = "Cette modification n'est pas autorisée";
      if (validationResult.blockers && validationResult.blockers.length > 0) {
        const firstBlocker = validationResult.blockers[0];
        if (typeof firstBlocker === 'object' && firstBlocker !== null) {
          blockerMsg = firstBlocker.reason || blockerMsg;
        } else if (typeof firstBlocker === 'string') {
          blockerMsg = firstBlocker;
        }
      }
      showToast(blockerMsg, "error", {
        title: "Modification bloquée",
        context: entityType,
      });
      // Do not proceed with update or show success toast
      return;
    }

    // Run field-level validation if provided
    if (validation) {
      const error = validation(data, value);
      if (error) {
        showToast(error, "error", {
          title: "Validation échouée",
          context: entityType,
        });
        return;
      }
    }

    const oldValue = data[field];

    // Optimistic update
    const newData = { ...data, [field]: value };
    setData(newData);

    try {
      // Auto-save to backend and update context
      await config.updateData(id, { [field]: value }, contextData);

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
      // Prompt client notification for status changes (post-success, optional)
      if (field === "status") {
        const notificationCheck = shouldPromptClientNotification(
          entityType,
          "changeStatus",
          {
            oldValue,
            newValue: value,
            data,
            newData,
          },
          contextData
        );

        if (notificationCheck?.shouldPrompt) {
          setNotificationPrompt({
            isOpen: true,
            eventType: notificationCheck.eventType,
            eventData: notificationCheck.eventData,
          });
        }
      }

    } catch (error) {
      console.error("Error saving quick action:", error);
      // Rollback on error
      setData({ ...data, [field]: oldValue });
      showToast("Erreur lors de l'enregistrement", "error", {
        title: "Erreur de sauvegarde",
        context: entityType,
      });
    }
  };

  const handleDataChange = (newData) => {
    setData(newData);
  };

  const handleDocumentsChange = (newDocuments) => {
    const newData = { ...data, documents: newDocuments };
    setData(newData);
  };

  const handleItemsChange = async (itemsKey, newItems) => {
    const newData = { ...data, [itemsKey]: newItems };
    setData(newData);

    // ✅ Persist the changes to backend
    try {
      await config.updateData(id, { [itemsKey]: newItems }, contextData);
      setOriginalData(newData);
    } catch (error) {
      console.error("Error saving items change:", error);
      // Rollback on error
      setData(data);
      showToast("Erreur lors de l'enregistrement", "error", {
        title: "Erreur de sauvegarde",
        context: entityType,
      });
    }
  };

  // Handle data refresh (for financial tab and other updates)
  const handleDataRefresh = async () => {
    try {
      const entityData = await config.fetchData(id, latestContextRef.current);
      // Force new object reference to trigger re-render
      setData(entityData ? { ...entityData } : entityData);
      setOriginalData(entityData ? { ...entityData } : entityData);
    } catch (error) {
      console.error("Error refreshing data:", error);
    }
  };

  // ✅ Handle structured section saves (batched changes)
  const handleSectionSave = async (sectionData) => {
    try {
      // Update context synchronously
      await config.updateData(id, sectionData, latestContextRef.current);
      // Optimistically update local state
      setData(prev => ({ ...prev, ...sectionData }));
      setOriginalData(prev => ({ ...prev, ...sectionData }));
      setIsEditing(false);
      showToast("Modifications enregistrées avec succès!", "success");
      justSaved.current = true;
    } catch (error) {
      console.error("Error saving:", error);
      showToast("Erreur lors de l'enregistrement", "error");
    }
  };

  const handleSave = async () => {
    try {
      // ✅ Check for relational impact changes before saving
      // Only pass the fields that actually changed
      const changedFields = {};
      Object.keys(data).forEach(key => {
        if (data[key] !== originalData[key]) {
          changedFields[key] = data[key];
        }
      });

      const validationResult = canPerformAction(entityType, id, 'edit', {
        data: originalData,
        newData: changedFields,
        entities: contextData
      });

      if (!validationResult.allowed) {
        showToast(validationResult.blockers[0] || "Cette modification n'est pas autorisée", "error");
        return;
      }

      // ✅ If requires confirmation for relational changes, show impact dialog
      if (validationResult.requiresConfirmation) {
        const confirmed = await confirm({
          title: "⚠️ Changement de rattachement",
          message: validationResult.impactSummary?.join('\n') || "Êtes-vous sûr de vouloir effectuer ce changement ?",
          confirmText: "Confirmer le changement",
          cancelText: "Annuler",
          variant: "warning"
        });

        if (!confirmed) {
          return;
        }
      }

      // Update context synchronously
      await config.updateData(id, data, latestContextRef.current);
      // Optimistically update local state
      setOriginalData({ ...data });
      setIsEditing(false);
      showToast("Modifications enregistrées avec succès!", "success");
      justSaved.current = true;
      // Optionally refresh from backend for denormalized fields
      setTimeout(() => { handleDataRefresh(); }, 10);
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
    // Domain rule validation before prompting delete
    const result = canPerformAction(entityType, parseInt(id), 'delete', {
      data,
      entities: contextData
    });
    if (!result.allowed) {
      setValidationResult(result);
      setBlockerModalOpen(true);
      return;
    }

    if (await confirm({
      title: "Supprimer",
      message: config.deleteConfirmMessage,
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      try {
        await config.deleteData(id, contextData);
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
            entityType={config.entityType}
            entityId={parseInt(id)}
            contextData={contextData}
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
      case "history":
        return <HistoryTab entityType={config.entityType} entityId={parseInt(id)} />;
      case "notes":
        return <NotesTab
          data={data}
          config={config}
          onUpdate={async (updates) => {
            try {
              await config.updateData(id, updates, latestContextRef.current);
              setData(prev => ({ ...prev, ...updates }));
              setOriginalData(prev => ({ ...prev, ...updates }));
            } catch (error) {
              console.error('[DetailView] Error updating notes:', error);
              throw error;
            }
          }}
        />;
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
            contextData={contextData}
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

          // ✅ Merge newly added items with existing items
          const existingCases = latestContextRef.current.cases || [].filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          const newlyAddedCases = data.relatedCases || [];
          const caseIds = new Set(newlyAddedCases.map(c => c.id));
          const uniqueExistingCases = existingCases.filter(c => !caseIds.has(c.id));

          items = [...newlyAddedCases, ...uniqueExistingCases];

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
          // ✅ Merge newly added items (data.proceedings) with existing items (filtered from latestContextRef.current.cases || [])
          const existingProceedings = latestContextRef.current.cases || [].filter(c => c.dossierId === data.id);

          // Combine and deduplicate
          const newlyAddedProceedings = data.proceedings || [];
          const proceedingIds = new Set(newlyAddedProceedings.map(p => p.id));
          const uniqueExistingProceedings = existingProceedings.filter(p => !proceedingIds.has(p.id));

          items = [...newlyAddedProceedings, ...uniqueExistingProceedings];
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

      case "sessions": {
        const allSessions = latestContextRef.current.sessions || [];
        const allCases = latestContextRef.current.cases || latestContextRef.current.cases || [];
        const allDossiers = latestContextRef.current.dossiers || [];

        if (isClient) {
          const relatedDossiers = allDossiers.filter((d) => d.clientId === data.id);
          const relatedCases = allCases.filter((c) => relatedDossiers.some((d) => d.id === c.dossierId));

          const existingSessions = allSessions.filter(
            (s) =>
              (s.caseId && relatedCases.some((c) => c.id === s.caseId)) ||
              (s.dossierId && relatedDossiers.some((d) => d.id === s.dossierId))
          );

          const newlyAddedSessions = data.relatedSessions || [];
          const sessionIds = new Set(newlyAddedSessions.map((s) => s.id));
          const uniqueExistingSessions = existingSessions.filter((s) => !sessionIds.has(s.id));

          items = [...newlyAddedSessions, ...uniqueExistingSessions].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );

          getParentContext = (session) => {
            const parentCase = session.caseId ? relatedCases.find((c) => c.id === session.caseId) : null;
            const parentDossier = parentCase
              ? relatedDossiers.find((d) => d.id === parentCase.dossierId)
              : relatedDossiers.find((d) => d.id === session.dossierId);
            return { dossier: parentDossier, case: parentCase };
          };

          entityConfig = {
            title: "Audiences",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage:
              "Aucune Audiences programmAce pour ce client.\nPour ajouter une audience, crAcez d'abord un dossier et un procA\"s.",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} • ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          const dossierCases = (latestContextRef.current.cases || []).filter((c) => c.dossierId === data.id);

          const existingSessions = allSessions.filter(
            (s) =>
              s.dossierId === data.id ||
              (s.caseId && dossierCases.some((c) => c.id === s.caseId))
          );

          const newlyAddedSessions = data.sessions || [];
          const sessionIds = new Set(newlyAddedSessions.map((s) => s.id));
          const uniqueExistingSessions = existingSessions.filter((s) => !sessionIds.has(s.id));

          items = [...newlyAddedSessions, ...uniqueExistingSessions].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );

          getParentContext = (session) => {
            const parentCase = session.caseId ? dossierCases.find((c) => c.id === session.caseId) : null;
            return { case: parentCase };
          };

          entityConfig = {
            title: "Audiences",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: "Aucune sAcance programmAce pour ce dossier",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} • ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'case') {
          items =
            data.sessions ||
            allSessions.filter(
              (s) => s.caseId === data.id || s.dossierId === data.dossier?.id
            );
          items = items.sort((a, b) => new Date(a.date) - new Date(b.date));
          getParentContext = null; // No parent context needed (direct children)

          entityConfig = {
            title: "Audiences",
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: "Aucune sAcance programmAce pour ce procA\"s",
            getTitle: (item) => item.title,
            getSubtitle: (item) => `${item.date} • ${item.time} • ${item.location}`,
            getStatus: (item) => item.status,
          };
        }
        break;
      }

      case "tasks":
        if (isClient) {
          // Client entity: Get all Tasks related to this client (via Dossiers or Procès)
          const relatedDossiers = data.relatedDossiers || [];
          const relatedCasesForTasks = latestContextRef.current.cases || [].filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          // ✅ Merge newly added items with existing items
          const existingTasks = latestContextRef.current.tasks || [].filter(task => {
            if (task.parentType === 'dossier') {
              return relatedDossiers.some(dossier => dossier.id === task.dossierId);
            } else if (task.parentType === 'case') {
              return relatedCasesForTasks.some(cas => cas.id === task.caseId);
            }
            return false;
          });

          const newlyAddedTasks = data.relatedTasks || [];
          const taskIds = new Set(newlyAddedTasks.map(t => t.id));
          const uniqueExistingTasks = existingTasks.filter(t => !taskIds.has(t.id));

          items = [...newlyAddedTasks, ...uniqueExistingTasks];

          items = items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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

          // ✅ Merge newly added items (data.tasks) with existing items (filtered from latestContextRef.current.tasks || [])
          const existingTasks = latestContextRef.current.tasks || [].filter(task => {
            if (task.parentType === 'dossier' && task.dossierId === data.id) {
              return true;
            } else if (task.parentType === 'case') {
              return dossierCases.some(cas => cas.id === task.caseId);
            }
            return false;
          });

          // Combine and deduplicate
          const newlyAddedTasks = data.tasks || [];
          const taskIds = new Set(newlyAddedTasks.map(t => t.id));
          const uniqueExistingTasks = existingTasks.filter(t => !taskIds.has(t.id));

          items = [...newlyAddedTasks, ...uniqueExistingTasks];
          items = items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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

          // ✅ PRIORITY 1: Use data from entity object if available (newly added items)
          // ✅ PRIORITY 2: Fall back to filtering global array (existing items)
          items = data.tasks || latestContextRef.current.tasks || [].filter(task => {
            if (task.parentType === 'case' && task.caseId === data.id) {
              return true;
            } else if (task.parentType === 'dossier' && parentDossier && task.dossierId === parentDossier.id) {
              return true;
            }
            return false;
          });
          items = items.sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));

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
            route: "/missions", // Navigate to mission detail
            emptyMessage: "Aucune mission d'huissier pour ce dossier",
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => {
              // Lookup officer name from officerId if not already set
              const officerName = item.officerName || (item.officerId ? latestContextRef.current.officers || [].find(o => o.id === parseInt(item.officerId))?.name : null) || 'N/A';
              return `${item.title} • ${item.missionType} • Huissier: ${officerName}`;
            },
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
            route: "/missions", // Navigate to mission detail
            emptyMessage: "Aucune mission d'huissier pour ce procès",
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => {
              // Lookup officer name from officerId if not already set
              const officerName = item.officerName || (item.officerId ? latestContextRef.current.officers || [].find(o => o.id === parseInt(item.officerId))?.name : null) || 'N/A';
              return `${item.title} • ${item.missionType} • Huissier: ${officerName}`;
            },
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
        contextData={contextData}
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
              onClick={() => navigate(-1)}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
            >
              <i className="fas fa-arrow-left mr-2"></i>
              Retour
            </button>

            {config.allowEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors duration-200"
              >
                <i className="fas fa-edit mr-2"></i>
                Modifier
              </button>
            )}

            {config.allowEdit && isEditing && (
              <>
                <button
                  onClick={() => {
                    setData(originalData);
                    setIsEditing(false);
                  }}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-times mr-2"></i>
                  Annuler
                </button>
                <button
                  onClick={handleSave}
                  className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-save mr-2"></i>
                  Enregistrer
                </button>
              </>
            )}

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
            contextData={contextData}
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
                onClick={() => {
                  setActiveTab(tab.id);
                  setSearchParams({ tab: tab.id });
                }}
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

      {/* Domain rule blocker modal */}
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName="Supprimer"
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={config.getTitle ? config.getTitle(data) : ''}
        entityType={entityType}
        entityId={parseInt(id)}
        action="delete"
        onRetry={() => handleDelete()}
      />
      {/* Client notification prompt for inline changes */}
      <ClientNotificationPrompt
        isOpen={notificationPrompt.isOpen}
        eventType={notificationPrompt.eventType}
        eventData={notificationPrompt.eventData}
        onConfirm={async () => {
          const { eventType, eventData } = notificationPrompt;
          try {
            await sendClientNotification(eventType, eventData, { channels: ["email"] });
          } catch (error) {
            console.error("Error sending client notification:", error);
          } finally {
            clearPendingNotification?.();
            setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
          }
        }}
        onClose={() => {
          clearPendingNotification?.();
          setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
        }}
      />
    </PageLayout>
  );
}


