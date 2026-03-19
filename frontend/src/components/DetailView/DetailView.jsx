import { useState, useEffect, useRef, useCallback } from "react";
import { useParams, useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { useToast } from "../../contexts/ToastContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useData } from "../../contexts/DataContext";
import { useTutorialSafe } from "../../contexts/TutorialContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import DetailSkeleton from "../skeleton/DetailSkeleton";
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
import GenerateDocumentModal from "../ui/GenerateDocumentModal";
import { shouldPromptClientNotification, sendClientNotification, getPendingNotification, clearPendingNotification, setPendingNotification } from "../../services/clientCommunication";
import BlockerModal from "../ui/BlockerModal";
import { canPerformAction } from "../../services/domainRules";
import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { translateCategory } from "../../utils/entityTranslations";
import { useOperator } from '../../contexts/OperatorContext';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";

/**
 * Generic DetailView component with modern inline editing UX
 * ✅ UPDATED: Inline quick actions + structured edit mode
 * ✅ UPDATED: Uses DataContext for dynamic data
 * ✅ UPDATED: Supports internationalized configs
 */
export default function DetailView({ entityType }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { formatDate, formatCurrency, notificationPrefs } = useSettings();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const contextData = useData(); // Get all data from context
  const { operator } = useOperator();

  // Document Generation Modal State
  const [generateDocModalOpen, setGenerateDocModalOpen] = useState(false);

  // When opening GenerateDocumentModal, inject operator info into contextData
  const getContextDataWithOperator = () => {
    const contextWithOperator = { ...contextData };
    if (operator) {
      contextWithOperator.operators = [operator];
      contextWithOperator.currentOperatorId = operator.id;
    }
    return contextWithOperator;
  };

  // Map entity types to their i18n namespaces
  const getTranslationNamespace = (type) => {
    const namespaceMap = {
      'client': 'clients',
      'dossier': 'dossiers',
      'task': 'tasks',
      'lawsuit': 'lawsuits',
      'officer': 'officers',
      'personalTask': 'personalTasks',
      'session': 'sessions',
      'financialEntry': 'accounting',
      'mission': 'missions',
    };
    return namespaceMap[type] || type;
  };

  const { t } = useTranslation([getTranslationNamespace(entityType), "common"]);
  const tutorial = useTutorialSafe(); // Safe hook for tutorial integration
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

  // When notification prompt opens during tutorial, advance to the notification step
  // Use refs to avoid dependency on tutorial object which changes every render
  const nextStepRef = useRef(tutorial?.nextStep);
  const currentStepRef = useRef(tutorial?.currentStep);
  const setWaitingForActionRef = useRef(tutorial?.setWaitingForAction);
  nextStepRef.current = tutorial?.nextStep;
  currentStepRef.current = tutorial?.currentStep;
  setWaitingForActionRef.current = tutorial?.setWaitingForAction;


  useEffect(() => {
    // When notification opens after creation, advance to the notification step
    // and hide the overlay until the user chooses send or ignore.
    const isCreationStep = (
      currentStepRef.current?.id === "create-dossier-from-client" ||
      currentStepRef.current?.id === "create-lawsuit-from-dossier"
    );
    if (notificationPrompt.isOpen && isCreationStep && nextStepRef.current) {
      if (setWaitingForActionRef.current) {
        setWaitingForActionRef.current(true);
      }
      nextStepRef.current();
    }
  }, [notificationPrompt.isOpen]);

  const formatSessionSubtitle = (item) => {
    const parts = [formatDate(item.date)];
    if (item.time) parts.push(item.time);
    if (item.location) parts.push(item.location);
    return parts.join(" • ");
  };

  const formatTaskSubtitle = (item) => {
    const duePart = formatDate(item.dueDate);
    const assignedPart = item.assignedTo ? ` • ${t("detail.aggregated.labels.assignedTo", { ns: "common" })}: ${item.assignedTo}` : "";
    return `${t("detail.aggregated.labels.due", { ns: "common" })}: ${duePart}${assignedPart}`;
  };

  // Get configuration for this entity type (pass translation function for internationalized configs)
  const config = getEntityConfig(entityType, t, { formatCurrency });

  // ✅ Read active tab from URL query parameter, fallback to first tab or state
  const tabFromUrl = searchParams.get('tab');
  const tabFromState = location.state?.tab;
  const defaultTab = tabFromUrl || tabFromState || config.tabs?.[0]?.id || "overview";
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [prevTabIndex, setPrevTabIndex] = useState(config.tabs.findIndex(t => t.id === defaultTab));
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

  useEffect(() => {
    const tabFromUrl = searchParams.get('tab');
    if (tabFromUrl && tabFromUrl !== activeTab) {
      const newIndex = config.tabs.findIndex(t => t.id === tabFromUrl);
      const oldIndex = config.tabs.findIndex(t => t.id === activeTab);
      setPrevTabIndex(oldIndex);
      setActiveTab(tabFromUrl);
    }
  }, [searchParams]);

  const handleTabChange = (nextTabId) => {
    const nextIndex = config.tabs.findIndex(t => t.id === nextTabId);
    const oldIndex = config.tabs.findIndex(t => t.id === activeTab);
    setPrevTabIndex(oldIndex);
    setActiveTab(nextTabId);
    setSearchParams({ tab: nextTabId }, { replace: true });
  };

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
  }, [id, entityType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Tabs Animation Logic
  const navContainerRef = useRef(null);
  const itemsRef = useRef({});
  const indicatorRef = useRef(null);
  const lastIndicatorX = useRef(0);
  const lastIndicatorW = useRef(0);

  const updateIndicator = useCallback(() => {
    if (!navContainerRef.current || !indicatorRef.current) return;

    const activeBtn = itemsRef.current[activeTab];
    if (!activeBtn) return;

    const containerRect = navContainerRef.current.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    const x = btnRect.left - containerRect.left;
    const w = btnRect.width;

    indicatorRef.current.animate(
      [
        { 
          transform: `translateX(${lastIndicatorX.current}px)`, 
          width: `${lastIndicatorW.current}px`,
          opacity: lastIndicatorW.current === 0 ? 0 : 1 
        },
        { 
          transform: `translateX(${x}px)`, 
          width: `${w}px`,
          opacity: 1 
        },
      ],
      {
        duration: 350,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        fill: "forwards",
      }
    );

    lastIndicatorX.current = x;
    lastIndicatorW.current = w;
  }, [activeTab]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

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

  if ((loading || globalLoading) && !data) {
    return (
      <PageLayout>
        <DetailSkeleton />
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
            {t("actions.backToList", { ns: "common" })}
          </button>
        </div>
      </PageLayout>
    );
  }

  // ✅ Handle inline quick action changes
  const handleQuickAction = async (field, value, validation, skipValidation = false) => {
    // ✅ Validate with domain rules before allowing any change (unless already validated)
    if (!skipValidation) {
      const validationResult = canPerformAction(entityType, id, 'edit', {
        data: data,
        newData: { ...data, [field]: value },
        entities: contextData
      });

      if (!validationResult.allowed) {
        // Show blocker message with proper toast
        let blockerMsg = t("detail.toast.error.notAllowed", { ns: "common" });
        if (validationResult.blockers && validationResult.blockers.length > 0) {
          const firstBlocker = validationResult.blockers[0];
          if (typeof firstBlocker === 'object' && firstBlocker !== null) {
            blockerMsg = firstBlocker.reason || blockerMsg;
          } else if (typeof firstBlocker === 'string') {
            blockerMsg = firstBlocker;
          }
        }
        showToast(blockerMsg, "error", {
          title: t("detail.toast.title.blocked", { ns: "common" }),
          context: entityType,
        });
        // Do not proceed with update or show success toast
        return;
      }
    }

    // Run field-level validation if provided
    if (validation) {
      const error = validation(data, value);
      if (error) {
        showToast(error, "error", {
          title: t("detail.toast.title.validationFailed", { ns: "common" }),
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
      // Pass skipConfirmation option if validation was already handled
      await config.updateData(id, { [field]: value }, contextData, { skipConfirmation: skipValidation });

      // Get operator name from context (hook is already at component scope)
      const operatorName = operator?.name || "Principal Lawyer";
      // Create timeline entry
      const timelineEntry = {
        type: `${field}_change`,
        event: `${field} modified`,
        timestamp: new Date().toISOString(),
        user: operatorName,
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
          contextData,
          notificationPrefs
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
      showToast(t("detail.toast.error.saveInline", { ns: "common" }), "error", {
        title: t("detail.toast.title.saveError", { ns: "common" }),
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
    setOriginalData(newData);
  };

  // Global mutationSync handles post-generation refreshes.
  const handleDocumentGenerated = async () => {};

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
      showToast(t("detail.toast.error.save", { ns: "common" }), "error", {
        title: t("detail.toast.title.saveError", { ns: "common" }),
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
  const handleSectionSave = async (sectionData, options = {}) => {
    try {
      // Update context synchronously
      await config.updateData(id, sectionData, latestContextRef.current, options);
      // Optimistically update local state
      setData(prev => ({ ...prev, ...sectionData }));
      setOriginalData(prev => ({ ...prev, ...sectionData }));
      setIsEditing(false);
      showToast(t("detail.toast.success.save", { ns: "common" }), "success");
      justSaved.current = true;
    } catch (error) {
      console.error("Error saving:", error);
      showToast(t("detail.toast.error.save", { ns: "common" }), "error");
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
        showToast(validationResult.blockers[0] || t("detail.validation.modificationNotAllowed", { ns: "common" }), "error");
        return;
      }

      // ✅ If requires confirmation for relational changes, show impact dialog
      if (validationResult.requiresConfirmation) {
        const confirmed = await confirm({
          title: t("dialog.detail.impact.change.title", { ns: "common" }),
          message: validationResult.impactSummary?.join("\n") || t("dialog.detail.impact.change.message", { ns: "common" }),
          confirmText: t("dialog.detail.impact.change.confirm", { ns: "common" }),
          cancelText: t("dialog.detail.impact.change.cancel", { ns: "common" }),
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
      showToast(t("detail.toast.success.save", { ns: "common" }), "success");
      justSaved.current = true;
    } catch (error) {
      console.error("Error saving:", error);
      showToast(t("detail.toast.error.save", { ns: "common" }), "error");
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
      title: t("dialog.detail.entity.delete.title", { ns: "common", entity: config.title }),
      message: config.deleteConfirmMessage,
      confirmText: t("dialog.detail.entity.delete.confirm", { ns: "common" }),
      cancelText: t("dialog.detail.entity.delete.cancel", { ns: "common" }),
      variant: "danger"
    })) {
      try {
        await config.deleteData(id, contextData);
        navigate(config.listRoute);
      } catch (error) {
        showToast(t("detail.toast.error.delete", { ns: "common" }), "error");
      }
    }
  };

  const handleForceDelete = async () => {
    setBlockerModalOpen(false);

    try {
      // Get the cascade delete function from context
      const cascadeDeleteFunction = contextData[`delete${entityType.charAt(0).toUpperCase() + entityType.slice(1)}Cascade`];

      if (!cascadeDeleteFunction) {
        showToast(t("detail.toast.error.cascadeUnavailable", { ns: "common" }), "error");
        return;
      }

      const result = await cascadeDeleteFunction(parseInt(id));

      if (!result || !result.ok) {
        console.error('[DetailView.handleForceDelete] Cascade delete failed:', result);
        showToast(t("detail.toast.error.cascade", { ns: "common" }), "error");
        return;
      }

      showToast(t("detail.toast.success.cascade", { ns: "common", entity: config.title }), "success", {
        title: t("detail.toast.title.cascade", { ns: "common" }),
        context: entityType,
      });

      setValidationResult(null);
      navigate(config.listRoute);
    } catch (error) {
      console.error('[DetailView.handleForceDelete] Error:', error);
      showToast(t("detail.toast.error.cascade", { ns: "common" }), "error");
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
            onSectionSaveWithOptions={handleSectionSave}
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
        return <HistoryTab entityType={config.entityType} entityId={parseInt(id)} label={tabConfig.label} />;
      case "notes":
        return <NotesTab
          data={data}
          config={config}
          tabConfig={tabConfig}
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
        return <div className="p-6 text-slate-600 dark:text-slate-400">{t("detail.errors.tabNotFound", { ns: "common" })}</div>;
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
          title: t("entities.dossiers", { ns: "common" }),
          icon: "fas fa-folder-open",
          iconColor: "text-blue-600 dark:text-blue-400",
          bgColor: "bg-blue-100 dark:bg-blue-900/20",
          route: "/dossiers",
          emptyMessage: t("detail.aggregated.empty.dossiers", { ns: "common" }),
          getTitle: (item) => item.lawsuitNumber,
          getSubtitle: (item) => {
            const translatedCategory = item.category ? translateCategory(item.category, t) : 'N/A';
            return `${item.title} • ${t("detail.aggregated.labels.category", { ns: "common" })}: ${translatedCategory}`;
          },
          getStatus: (item) => item.status,
        };
        break;

      case "lawsuits":
        if (isClient) {
          // Client entity: Get all Procès related to this client (via Dossiers)
          const relatedDossiers = data.relatedDossiers || [];

          // ✅ Merge newly added items with existing items
          const existingLawsuits = (latestContextRef.current.lawsuits || []).filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          const newlyAddedLawsuits = data.relatedLawsuits || [];
          const lawsuitIds = new Set(newlyAddedLawsuits.map(c => c.id));
          const uniqueExistingLawsuits = existingLawsuits.filter(c => !lawsuitIds.has(c.id));

          items = [...newlyAddedLawsuits, ...uniqueExistingLawsuits];

          getParentContext = (cas) => {
            const parentDossier = relatedDossiers.find(d => d.id === cas.dossierId);
            return { dossier: parentDossier };
          };

          entityConfig = {
            title: t("entities.lawsuits", { ns: "common" }),
            icon: "fas fa-gavel",
            iconColor: "text-purple-600 dark:text-purple-400",
            bgColor: "bg-purple-100 dark:bg-purple-900/20",
            route: "/lawsuits",
            emptyMessage: t("detail.aggregated.empty.lawsuitsClient", { ns: "common" }),
            getTitle: (item) => item.lawsuitNumber,
            getSubtitle: (item) => `${item.title} • ${t("detail.aggregated.labels.nextHearing", { ns: "common" })}: ${item.nextHearing ? formatDate(item.nextHearing) : t("detail.aggregated.labels.notScheduled", { ns: "common" })}`,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          // Dossier entity: Direct children - proceedings of this dossier
          // ✅ Merge newly added items (data.proceedings) with existing items (filtered from latestContextRef.current.lawsuits || [])
          const existingProceedings = (latestContextRef.current.lawsuits || []).filter(c => c.dossierId === data.id);

          // Combine and deduplicate
          const newlyAddedProceedings = data.proceedings || [];
          const proceedingIds = new Set(newlyAddedProceedings.map(p => p.id));
          const uniqueExistingProceedings = existingProceedings.filter(p => !proceedingIds.has(p.id));

          items = [...newlyAddedProceedings, ...uniqueExistingProceedings];
          getParentContext = null; // No parent context needed (direct children)

          entityConfig = {
            title: t("entities.lawsuits", { ns: "common" }),
            icon: "fas fa-gavel",
            iconColor: "text-purple-600 dark:text-purple-400",
            bgColor: "bg-purple-100 dark:bg-purple-900/20",
            route: "/lawsuits",
            emptyMessage: t("detail.aggregated.empty.lawsuitsDossier", { ns: "common" }),
            getTitle: (item) => item.lawsuitNumber,
            getSubtitle: (item) => `${item.title} • ${t("detail.aggregated.labels.nextHearing", { ns: "common" })}: ${item.nextHearing ? formatDate(item.nextHearing) : t("detail.aggregated.labels.notScheduled", { ns: "common" })}`,
            getStatus: (item) => item.status,
          };
        }
        break;

      case "sessions": {
        const allSessions = latestContextRef.current.sessions || [];
        const allLawsuits = latestContextRef.current.lawsuits || latestContextRef.current.lawsuits || [];
        const allDossiers = latestContextRef.current.dossiers || [];

        if (isClient) {
          const relatedDossiers = allDossiers.filter((d) => d.clientId === data.id);
          const relatedLawsuits = allLawsuits.filter((c) => relatedDossiers.some((d) => d.id === c.dossierId));

          const existingSessions = allSessions.filter(
            (s) =>
              (s.lawsuitId && relatedLawsuits.some((c) => c.id === s.lawsuitId)) ||
              (s.dossierId && relatedDossiers.some((d) => d.id === s.dossierId))
          );

          const newlyAddedSessions = data.relatedSessions || [];
          const sessionIds = new Set(newlyAddedSessions.map((s) => s.id));
          const uniqueExistingSessions = existingSessions.filter((s) => !sessionIds.has(s.id));

          items = [...newlyAddedSessions, ...uniqueExistingSessions].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );

          getParentContext = (session) => {
            const parentLawsuit = session.lawsuitId ? relatedLawsuits.find((c) => c.id === session.lawsuitId) : null;
            const parentDossier = parentLawsuit
              ? relatedDossiers.find((d) => d.id === parentLawsuit.dossierId)
              : relatedDossiers.find((d) => d.id === session.dossierId);
            return { dossier: parentDossier, lawsuit: parentLawsuit };
          };

          entityConfig = {
            title: t("entities.hearings", { ns: "common" }),
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: t("detail.aggregated.empty.hearingsClient", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatSessionSubtitle,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          const dossierLawsuits = (latestContextRef.current.lawsuits || []).filter((c) => c.dossierId === data.id);

          const existingSessions = allSessions.filter(
            (s) =>
              s.dossierId === data.id ||
              (s.lawsuitId && dossierLawsuits.some((c) => c.id === s.lawsuitId))
          );

          const newlyAddedSessions = data.sessions || [];
          const sessionIds = new Set(newlyAddedSessions.map((s) => s.id));
          const uniqueExistingSessions = existingSessions.filter((s) => !sessionIds.has(s.id));

          items = [...newlyAddedSessions, ...uniqueExistingSessions].sort(
            (a, b) => new Date(a.date) - new Date(b.date)
          );

          getParentContext = (session) => {
            const parentLawsuit = session.lawsuitId ? dossierLawsuits.find((c) => c.id === session.lawsuitId) : null;
            return { lawsuit: parentLawsuit };
          };

          entityConfig = {
            title: t("entities.hearings", { ns: "common" }),
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: t("detail.aggregated.empty.hearingsDossier", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatSessionSubtitle,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'lawsuit') {
          items =
            data.sessions ||
            allSessions.filter(
              (s) => s.lawsuitId === data.id || s.dossierId === data.dossier?.id
            );
          items = items.sort((a, b) => new Date(a.date) - new Date(b.date));
          getParentContext = null; // No parent context needed (direct children)

          entityConfig = {
            title: t("entities.hearings", { ns: "common" }),
            icon: "fas fa-calendar-alt",
            iconColor: "text-green-600 dark:text-green-400",
            bgColor: "bg-green-100 dark:bg-green-900/20",
            route: "/sessions",
            emptyMessage: t("detail.aggregated.empty.hearingsLawsuit", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatSessionSubtitle,
            getStatus: (item) => item.status,
          };
        }
        break;
      }

      case "tasks":
        if (isClient) {
          // Client entity: Get all Tasks related to this client (via Dossiers or Procès)
          const relatedDossiers = data.relatedDossiers || [];
          const relatedLawsuitsForTasks = (latestContextRef.current.lawsuits || []).filter(cas =>
            relatedDossiers.some(dossier => dossier.id === cas.dossierId)
          );

          // ✅ Merge newly added items with existing items
          const existingTasks = (latestContextRef.current.tasks || []).filter(task => {
            if (task.parentType === 'dossier') {
              return relatedDossiers.some(dossier => dossier.id === task.dossierId);
            } else if (task.parentType === 'lawsuit') {
              return relatedLawsuitsForTasks.some(cas => cas.id === task.lawsuitId);
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
            } else if (task.parentType === 'lawsuit') {
              const parentLawsuit = relatedLawsuitsForTasks.find(c => c.id === task.lawsuitId);
              const parentDossier = parentLawsuit ? relatedDossiers.find(d => d.id === parentLawsuit.dossierId) : null;
              return {
                dossier: parentDossier,
                lawsuit: parentLawsuit
              };
            }
            return null;
          };

          entityConfig = {
            title: t("entities.tasks", { ns: "common" }),
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: t("detail.aggregated.empty.tasksClient", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatTaskSubtitle,
            getStatus: (item) => item.status,
          };
        } else if (isDossier) {
          // Dossier entity: Get all Tasks for THIS dossier or its procès
          const dossierLawsuits = data.proceedings || [];

          // ✅ Merge newly added items (data.tasks) with existing items (filtered from latestContextRef.current.tasks || [])
          const existingTasks = (latestContextRef.current.tasks || []).filter(task => {
            if (task.parentType === 'dossier' && task.dossierId === data.id) {
              return true;
            } else if (task.parentType === 'lawsuit') {
              return dossierLawsuits.some(cas => cas.id === task.lawsuitId);
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
            if (task.parentType === 'lawsuit') {
              const parentLawsuit = dossierLawsuits.find(c => c.id === task.lawsuitId);
              return { lawsuit: parentLawsuit };
            }
            return null; // Task directly linked to dossier, no parent context needed
          };

          entityConfig = {
            title: t("entities.tasks", { ns: "common" }),
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: t("detail.aggregated.empty.tasksDossier", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatTaskSubtitle,
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'lawsuit') {
          // Lawsuit entity: Get all Tasks for THIS lawsuit or its parent dossier
          const parentDossier = data.dossier;

          // ✅ PRIORITY 1: Use data from entity object if available (newly added items)
          // ✅ PRIORITY 2: Fall back to filtering global array (existing items)
          items = data.tasks || (latestContextRef.current.tasks || []).filter(task => {
            if (task.parentType === 'lawsuit' && task.lawsuitId === data.id) {
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
            return null; // Task directly linked to lawsuit, no parent context needed
          };

          entityConfig = {
            title: t("entities.tasks", { ns: "common" }),
            icon: "fas fa-tasks",
            iconColor: "text-amber-600 dark:text-amber-400",
            bgColor: "bg-amber-100 dark:bg-amber-900/20",
            route: "/tasks",
            emptyMessage: t("detail.aggregated.empty.tasksLawsuit", { ns: "common" }),
            getTitle: (item) => item.title,
            getSubtitle: formatTaskSubtitle,
            getStatus: (item) => item.status,
          };
        }
        break;

      case "missions":
        // Missions are directly available on dossier or lawsuit data
        if (isDossier) {
          items = data.missions || [];
          getParentContext = null;

          entityConfig = {
            title: t("entities.missionsBailiff", { ns: "common" }),
            icon: "fas fa-clipboard-list",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
            route: "/missions", // Navigate to mission detail
            emptyMessage: t("detail.aggregated.empty.missionsDossier", { ns: "common" }),
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => {
              // Lookup officer name from officerId if not already set
              const officerName = item.officerName || (item.officerId ? (latestContextRef.current.officers || []).find(o => o.id === parseInt(item.officerId))?.name : null) || 'N/A';
              return `${item.title} • ${item.missionType} • ${t("detail.aggregated.labels.bailiff", { ns: "common" })}: ${officerName}`;
            },
            getStatus: (item) => item.status,
          };
        } else if (config.entityType === 'lawsuit') {
          items = data.missions || [];
          getParentContext = null;

          entityConfig = {
            title: t("entities.missionsBailiff", { ns: "common" }),
            icon: "fas fa-clipboard-list",
            iconColor: "text-indigo-600 dark:text-indigo-400",
            bgColor: "bg-indigo-100 dark:bg-indigo-900/20",
            route: "/missions", // Navigate to mission detail
            emptyMessage: t("detail.aggregated.empty.missionsLawsuit", { ns: "common" }),
            getTitle: (item) => item.missionNumber,
            getSubtitle: (item) => {
              // Lookup officer name from officerId if not already set
              const officerName = item.officerName || (item.officerId ? (latestContextRef.current.officers || []).find(o => o.id === parseInt(item.officerId))?.name : null) || 'N/A';
              return `${item.title} • ${item.missionType} • ${t("detail.aggregated.labels.bailiff", { ns: "common" })}: ${officerName}`;
            },
            getStatus: (item) => item.status,
          };
        }
        break;

      default:
        return <div className="p-6 text-slate-600 dark:text-slate-400">{t("detail.errors.unrecognizedAggregation", { ns: "common" })}</div>;
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
          <>
            {/* Mobile actions */}
            <div className="flex flex-col gap-2 w-full sm:w-auto md:hidden">
              <button
                onClick={() => navigate(-1)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                {t("actions.back", { ns: "common" })}
              </button>

              {(entityType === 'dossier' || entityType === 'lawsuit' || entityType === 'session') && (
                <button
                  onClick={() => setGenerateDocModalOpen(true)}
                  className="w-full px-4 py-2 border border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-file-alt mr-2"></i>
                  {t("documentGeneration.actions.generate", { ns: "common" })}
                </button>
              )}

              {config.allowDelete && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className="w-full px-4 py-2 border border-slate-300 dark:border-slate-700 rounded-lg font-medium text-slate-700 dark:text-slate-200"
                    >
                      <i className="fas fa-ellipsis-h mr-2"></i>
                      {t("actions.more", { ns: "common", defaultValue: "More actions" })}
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onSelect={(event) => {
                        event.preventDefault();
                        handleDelete();
                      }}
                    >
                      <i className="fas fa-trash mr-2"></i>
                      {t("actions.delete", { ns: "common" })}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            {/* Desktop actions */}
            <div className="hidden md:flex items-center gap-3">
              <button
                onClick={() => navigate(-1)}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors duration-200"
              >
                <i className="fas fa-arrow-left mr-2"></i>
                {t("actions.back", { ns: "common" })}
              </button>

              {/* Generate Document Button - Only for dossier and lawsuit (proces) */}
              {(entityType === 'dossier' || entityType === 'lawsuit' || entityType === 'session') && (
                <button
                  onClick={() => setGenerateDocModalOpen(true)}
                  className="px-4 py-2 border border-blue-600 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/30 text-blue-700 dark:text-blue-400 rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-file-alt mr-2"></i>
                  {t("documentGeneration.actions.generate", { ns: "common" })}
                </button>
              )}

              {config.allowDelete && (
                <button
                  onClick={handleDelete}
                  className="px-4 py-2 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors duration-200"
                >
                  <i className="fas fa-trash mr-2"></i>
                  {t("actions.delete", { ns: "common" })}
                </button>
              )}
            </div>
          </>
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

        {/* Mobile tab selector */}
        <div className="md:hidden">
          <label className="block text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
            {t("detail.tabs.label", { ns: "common", defaultValue: "Section" })}
          </label>
          <select
            value={activeTab}
            onChange={(e) => handleTabChange(e.target.value)}
            className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700 rounded-xl bg-white dark:bg-slate-800 text-slate-900 dark:text-white"
          >
            {config.tabs.map((tab) => (
              <option key={tab.id} value={tab.id}>
                {tab.label}
              </option>
            ))}
          </select>
        </div>

        {/* Tabs */}
        <div className="hidden md:block border-b border-slate-200 dark:border-slate-700 relative">
          <div 
            ref={navContainerRef}
            className="flex flex-nowrap overflow-x-auto scrollbar-hide gap-1"
          >
            {/* Animated Tab Indicator */}
            <div
              ref={indicatorRef}
              className="absolute bottom-0 h-0.5 bg-blue-600 dark:bg-blue-400 z-10 pointer-events-none"
              style={{ left: 0, opacity: 0 }}
            />

            {config.tabs.map((tab) => {
              // Determine tutorial attribute based on entity type and tab id
              const getTutorialAttribute = () => {
                if (entityType === "client" && tab.id === "dossiers") return "client-dossiers-tab";
                if (entityType === "dossier" && tab.id === "proceedings") return "dossier-lawsuits-tab";
                if (entityType === "dossier" && tab.id === "tasks") return "dossier-tasks-tab";
                if (entityType === "dossier" && tab.id === "missions") return "dossier-missions-tab";
                if (entityType === "dossier" && tab.id === "documents") return "dossier-documents-tab";
                if (entityType === "dossier" && tab.id === "notes") return "dossier-notes-tab";
                if (entityType === "dossier" && tab.id === "timeline") return "dossier-history-tab";
                return undefined;
              };

              return (
                <button
                  key={tab.id}
                  ref={(el) => (itemsRef.current[tab.id] = el)}
                  onClick={() => handleTabChange(tab.id)}
                  className={`px-4 py-3 font-medium transition-colors duration-200 border-b-2 border-transparent flex items-center gap-2 min-w-max whitespace-nowrap ${activeTab === tab.id
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  data-tutorial={getTutorialAttribute()}
                >
                  <i className={tab.icon}></i>
                  {tab.label}
                  {tab.getCount && (
                    <span className="px-2 py-0.5 bg-slate-100 dark:bg-slate-700 rounded-full text-xs">
                      {tab.getCount(data)}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Content */}
        <div 
          key={activeTab} 
          className={
            config.tabs.findIndex(t => t.id === activeTab) >= prevTabIndex 
              ? "animate-tab-content-right" 
              : "animate-tab-content-left"
          }
          onAnimationEnd={(e) => {
            // Only clear if it's the container's own animation
            if (e.target === e.currentTarget) {
              e.currentTarget.className = "";
            }
          }}
        >
          {renderTabContent()}
        </div>
      </div>

      {/* Domain rule blocker modal */}
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setValidationResult(null);
        }}
        actionName={t("actions.delete", { ns: "common" })}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={config.getTitle ? config.getTitle(data) : ''}
        requiresForceDelete={validationResult?.requiresForceDelete || false}
        affectedEntities={validationResult?.affectedEntities || []}
        forceDeleteMessage={validationResult?.forceDeleteMessage || ""}
        onForceDelete={handleForceDelete}
      />
      {/* Client notification prompt for inline changes */}
      <ClientNotificationPrompt
        isOpen={notificationPrompt.isOpen}
        eventType={notificationPrompt.eventType}
        eventData={notificationPrompt.eventData}
        onConfirm={async () => {
          const { eventType, eventData } = notificationPrompt;
          let success = false;
          try {
            const result = await sendClientNotification(eventType, eventData, { channels: ["email"] });
            success = result?.success ?? false;
          } catch (error) {
            console.error("Error sending client notification:", error);
            success = false;
          } finally {
            clearPendingNotification?.();
            setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
            // Resume overlay for the next step after user decision
            if (tutorial?.setWaitingForAction) {
              tutorial.setWaitingForAction(false);
            }
            // Advance tutorial after notification is handled (for both dossier and lawsuit creation)
            if ((tutorial?.currentStep?.id === "client-notification-intro" ||
              tutorial?.currentStep?.id === "lawsuit-notification-intro") && tutorial?.nextStep) {
              tutorial.nextStep();
            }
          }
          return success;
        }}
        onClose={() => {
          clearPendingNotification?.();
          setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
          // Resume overlay for the next step after user decision
          if (tutorial?.setWaitingForAction) {
            tutorial.setWaitingForAction(false);
          }
          // Advance tutorial after notification is dismissed (for both dossier and lawsuit creation)
          if ((tutorial?.currentStep?.id === "client-notification-intro" ||
            tutorial?.currentStep?.id === "lawsuit-notification-intro") && tutorial?.nextStep) {
            tutorial.nextStep();
          }
        }}
      />

      {/* Generate Document Modal (always rendered at root level) */}
      {(entityType === 'dossier' || entityType === 'lawsuit' || entityType === 'session') && (
        <>
          {/** Map 'lawsuit' to 'proces' for document generation */}
          <GenerateDocumentModal
            isOpen={generateDocModalOpen}
            onClose={() => setGenerateDocModalOpen(false)}
            entityType={entityType === 'lawsuit' ? 'proces' : entityType}
            entityData={data}
            contextData={getContextDataWithOperator()}
            onDocumentGenerated={handleDocumentGenerated}
          />
        </>
      )}
    </PageLayout>
  );
}






