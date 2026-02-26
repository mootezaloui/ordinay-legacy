import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useData } from "../../../contexts/DataContext";
import { useTutorialSafe } from "../../../contexts/TutorialContext";
import { getStatusColor } from "../config/statusColors";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";
import BlockerModal from "../../ui/BlockerModal";
import { logEntityCreation, logHistoryEvent, EVENT_TYPES } from "../../../services/historyService";
import { useSettings } from "../../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { translateStatus, translateAssignee } from "../../../utils/entityTranslations";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../../ui/dropdown-menu";

/**
 * AggregatedRelatedTab - Generic tab for displaying aggregated related entities
 *
 * This component displays entities that are related to a Client through the hierarchy,
 * always showing the parent context (Dossier and/or Procès) to preserve the data model.
 *
 * Props:
 * - data: The client data
 * - config: Entity configuration
 * - items: Array of items to display
 * - getParentContext: Function to get parent Dossier/Procès for each item
 * - entityConfig: Configuration for the entity type being displayed
 * - tabConfig: Tab configuration (for add/delete functionality)
 * - onItemsChange: Callback when items are added or deleted
 */
export default function AggregatedRelatedTab({
  data,
  config,
  items = [],
  getParentContext,
  entityConfig,
  tabConfig,
  onItemsChange,
  contextData
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { formatDate, currency } = useSettings();
  const { t } = useTranslation("common");
  const tutorial = useTutorialSafe(); // Safe hook that returns null if not in provider
  const {
    addDossier,
    addLawsuit,
    addSession,
    addTask,
    addMission,
    addFinancialEntry,
    deleteDossier,
    deleteLawsuit,
    deleteSession,
    deleteTask,
    deleteMission,
  } = useData();
  const [localItems, setLocalItems] = useState(items);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);

  // Prefill context so FormModal (and notifications) know parent relationships even if fields are hidden
  const prefillContext = (() => {
    const ctx = {};

    // Always carry client context when available
    if (config?.entityType === "client") {
      ctx.clientId = data.id;
      ctx.clientName = data.name;
      ctx.client = data.name;
    } else if (data?.clientId) {
      ctx.clientId = data.clientId;
      ctx.clientName = data.client?.name || data.client;
    }

    // Dossier context
    if (config?.entityType === "dossier") {
      ctx.dossierId = data.id;
      ctx.dossier = data.lawsuitNumber;
      ctx.clientId = ctx.clientId || data.clientId;
      ctx.clientName = ctx.clientName || data.client?.name || data.client;
    }

    // Lawsuit context
    if (config?.entityType === "lawsuit") {
      ctx.lawsuitId = data.id;
      ctx.lawsuitNumber = data.lawsuitNumber;
      ctx.lawsuitTitle = data.title;
      ctx.dossierId = data.dossierId || ctx.dossierId;
      ctx.clientId = ctx.clientId || data.clientId;
      ctx.clientName = ctx.clientName || data.client?.name || data.client;
    }

    // Sessions and tasks can default linkType when coming from dossier/lawsuit
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "dossier") {
      ctx.linkType = "dossier";
      ctx.dossierId = ctx.dossierId || data.id;
    }
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "lawsuit") {
      ctx.linkType = "lawsuit";
      ctx.lawsuitId = ctx.lawsuitId || data.id;
    }
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "client") {
      const relatedDossiers = data.relatedDossiers || [];
      if (relatedDossiers.length === 1) {
        ctx.linkType = "dossier";
        ctx.dossierId = relatedDossiers[0].id;
        ctx.dossier = relatedDossiers[0].lawsuitNumber;
        ctx.clientId = ctx.clientId || data.id;
      }
    }
    if (tabConfig?.aggregationType === "tasks") {
      if (config?.entityType === "dossier") {
        ctx.parentType = "dossier";
        ctx.dossierId = ctx.dossierId || data.id;
      } else if (config?.entityType === "lawsuit") {
        ctx.parentType = "lawsuit";
        ctx.lawsuitId = ctx.lawsuitId || data.id;
      }
    }

    return ctx;
  })();

  // Update local items when props change
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  // Normalize aggregation key to a reference-aware entity type (plural -> singular)
  const referenceEntityType = tabConfig?.referenceEntityType
    || (tabConfig?.aggregationType === "lawsuits" ? "lawsuit"
      : tabConfig?.aggregationType === "dossiers" ? "dossier"
        : tabConfig?.aggregationType === "missions" ? "mission"
          : tabConfig?.aggregationType === "tasks" ? "task"
            : tabConfig?.aggregationType === "sessions" ? "session"
              : tabConfig?.aggregationType === "personalTasks" ? "personalTask"
                : tabConfig?.aggregationType);

  const toIntOrNull = (value) => {
    const n = parseInt(value, 10);
    return Number.isNaN(n) ? null : n;
  };

  const getCreatedLabel = () => {
    switch (tabConfig?.aggregationType) {
      case "dossiers":
        return t("detail.history.labels.dossierCreated");
      case "lawsuits":
        return t("detail.history.labels.lawsuitCreated");
      case "sessions":
        return t("detail.history.labels.hearingCreated");
      case "tasks":
        return t("detail.history.labels.taskCreated");
      case "missions":
        return t("detail.history.labels.missionCreated");
      default:
        return t("detail.history.labels.itemCreated");
    }
  };

  const getItemTitle = (item) => {
    if (!item) return "";

    const aggregationType = tabConfig?.aggregationType;

    // For entities with both title/name and reference, show both for clarity
    switch (aggregationType) {
      case "dossiers": {
        const title = item.title || "";
        const reference = item.lawsuitNumber || item.reference || "";
        if (title && reference) return `${title} (${reference})`;
        return title || reference || tabConfig?.entityName || "Element";
      }

      case "lawsuits": {
        const title = item.title || "";
        const reference = item.lawsuitNumber || item.reference || "";
        if (title && reference) return `${title} (${reference})`;
        return title || reference || tabConfig?.entityName || "Element";
      }

      case "sessions": {
        const title = item.title || item.sessionType || item.description || "";
        const date = item.sessionDate || item.date || item.scheduledAt || "";
        const formattedDate = formatDate(date);
        if (title && formattedDate) return `${title} (${formattedDate})`;
        return title || formattedDate || tabConfig?.entityName || "Element";
      }

      case "tasks": {
        const title = item.title || item.description || "";
        const dueDate = item.dueDate || "";
        const formattedDate = formatDate(dueDate);
        if (title && formattedDate) return `${title} (Due: ${formattedDate})`;
        return title || formattedDate || tabConfig?.entityName || "Element";
      }

      case "missions": {
        const title = item.title || item.description || "";
        const reference = item.reference || "";
        if (title && reference) return `${title} (${reference})`;
        return title || reference || tabConfig?.entityName || "Element";
      }

      default:
        return (
          item.title ||
          item.name ||
          item.description ||
          item.lawsuitNumber ||
          item.reference ||
          tabConfig?.entityName ||
          "Element"
        );
    }
  };

  const handleAddItem = async (formData) => {
    setIsLoading(true);

    try {
      // Merge in parent context so the saved entity and notification logic both know relationships
      const mergedFormData = { ...prefillContext, ...formData };

      // Normalize numeric ids to avoid filter mismatches
      const normalizedFormData = {
        ...mergedFormData,
        clientId: toIntOrNull(mergedFormData.clientId),
        dossierId: toIntOrNull(mergedFormData.dossierId),
        lawsuitId: toIntOrNull(mergedFormData.lawsuitId),
        officerId: toIntOrNull(mergedFormData.officerId),
        missionId: toIntOrNull(mergedFormData.missionId),
      };

      // Inject parent relationships to keep entities consistent with main list creations
      const relationshipFields = (() => {
        const rel = {};

        // Dossier creation from Client detail
        if (tabConfig?.aggregationType === "dossiers" && config?.entityType === "client") {
          rel.clientId = data.id;
          rel.client = data.name;
        }

        // Session creation from Dossier or Lawsuit detail
        if (tabConfig?.aggregationType === "sessions") {
          if (config?.entityType === "dossier") {
            rel.linkType = "dossier";
            rel.dossierId = data.id;
          } else if (config?.entityType === "lawsuit") {
            rel.linkType = "lawsuit";
            rel.lawsuitId = data.id;
          }
        }

        // Procès creation
        if (tabConfig?.aggregationType === "lawsuits") {
          if (config?.entityType === "dossier") {
            rel.dossierId = data.id;
            rel.dossier = data.lawsuitNumber;
            const clientId = data.clientId || data.client?.id;
            const clientName = data.client?.name || data.client;
            if (clientId) rel.clientId = parseInt(clientId, 10);
            if (clientName) rel.client = clientName;
          } else if (config?.entityType === "client") {
            const parentDossier = (data.relatedDossiers || []).find(
              (d) => d.id === normalizedFormData.dossierId
            );
            if (parentDossier) {
              rel.dossierId = parentDossier.id;
              rel.dossier = parentDossier.lawsuitNumber;
              const clientId = parentDossier.clientId || data.id;
              const clientName = parentDossier.client || data.name;
              if (clientId) rel.clientId = parseInt(clientId, 10);
              if (clientName) rel.client = clientName;
            }
          }
        }

        return rel;
      })();

      // Create new item (default shape; may be overwritten for backend-created entities)
      let newItem = {
        id: Date.now(),
        ...normalizedFormData,
        ...relationshipFields,
        [config.entityType + 'Id']: data.id,
        createdDate: new Date().toISOString().split('T')[0],
      };

      // Persist via global store (same flow as list screens)
      switch (tabConfig?.aggregationType) {
        case "dossiers":
          {
            const creation = await addDossier({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Dossier creation failed:", creation.result);
              const message = creation.result?.message || t("detail.related.errors.createDossier");
              showToast(message, "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
            // Notify tutorial
            if (tutorial?.setCreatedDossier) tutorial.setCreatedDossier(created.id);
          }
          break;
        case "lawsuits":
          {
            const creation = await addLawsuit({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Lawsuit creation failed:", creation.result);
              const message = creation.result?.message || t("detail.related.errors.createLawsuit");
              showToast(message, "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
            // Notify tutorial
            if (tutorial?.setCreatedLawsuit) tutorial.setCreatedLawsuit(created.id);
          }
          break;
        case "sessions":
          {
            const creation = await addSession({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Session creation failed:", creation.result);
              if (creation.result?.allowed === false) {
                setValidationResult(creation.result);
                setBlockerModalOpen(true);
              } else {
                const message = creation.result?.message || t("detail.related.errors.createSession");
                showToast(message, "error");
              }
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
            // Notify tutorial
            if (tutorial?.setCreatedSession) tutorial.setCreatedSession(created.id);
          }
          break;
        case "tasks":
          {
            const creation = await addTask({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Task creation failed:", creation.result);
              if (creation.result?.allowed === false) {
                setValidationResult(creation.result);
                setBlockerModalOpen(true);
              } else {
                const message = creation.result?.message || t("detail.related.errors.createTask");
                showToast(message, "error");
              }
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
            // Notify tutorial
            if (tutorial?.setCreatedTask) tutorial.setCreatedTask(created.id);
          }
          break;
        case "missions":
          {
            const creation = await addMission({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Mission creation failed:", creation.result);
              if (creation.result?.allowed === false) {
                setValidationResult(creation.result);
                setBlockerModalOpen(true);
              } else {
                const blockerMessage =
                  Array.isArray(creation.result?.blockers)
                    ? creation.result.blockers
                        .map((b) => (typeof b === "string" ? b : b?.reason || ""))
                        .filter(Boolean)
                        .join(" | ")
                    : null;
                const message =
                  blockerMessage ||
                  creation.result?.message ||
                  t("detail.related.toast.error.createMission");
                showToast(message, "error");
              }
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
            if (normalizedFormData.financialEntries && Array.isArray(normalizedFormData.financialEntries) && normalizedFormData.financialEntries.length > 0) {
              const dossierId = normalizedFormData.dossierId || null;
              const lawsuitId = normalizedFormData.lawsuitId || null;
              let clientId = normalizedFormData.clientId || null;
              if (!clientId && dossierId) {
                const dossier = contextData?.dossiers?.find(d => d.id === dossierId);
                if (dossier) clientId = dossier.clientId;
              } else if (!clientId && lawsuitId) {
                const lawsuitItem = contextData?.lawsuits?.find(c => c.id === lawsuitId);
                if (lawsuitItem?.dossierId) {
                  const dossier = contextData?.dossiers?.find(d => d.id === lawsuitItem.dossierId);
                  if (dossier) clientId = dossier.clientId;
                }
              }
              for (const entry of normalizedFormData.financialEntries) {
                await addFinancialEntry({
                  ...entry,
                  missionId: created.id,
                  clientId,
                  dossierId,
                  lawsuitId,
                  type: "expense",
                  category: "bailiff_fees",
                  status: entry.status || "draft",
                  currency,
                });
              }
            }
            // Notify tutorial
            if (tutorial?.setCreatedMission) tutorial.setCreatedMission(created.id);
          }
          break;
        default:
          break;
      }

      // Log history for the created entity and its parent
      logEntityCreation(referenceEntityType, newItem.id, getItemTitle(newItem));
      if (data?.id && config?.entityType) {
        const itemTitle = getItemTitle(newItem);
        logHistoryEvent({
          entityType: config.entityType,
          entityId: data.id,
          eventType: EVENT_TYPES.RELATION,
          label: `${getCreatedLabel()}: ${itemTitle}`,
          details: `${getCreatedLabel()}: ${itemTitle}`,
          metadata: {
            childType: referenceEntityType,
            childId: newItem.id,
          },
        });
        if (tabConfig?.aggregationType === "sessions" && config?.entityType === "lawsuit" && data?.dossierId) {
          logHistoryEvent({
            entityType: "dossier",
            entityId: data.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            details: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            metadata: {
              childType: "lawsuit",
              childId: data.id,
              relatedType: referenceEntityType,
              relatedId: newItem.id,
            },
          });
        }
        if (tabConfig?.aggregationType === "tasks" && config?.entityType === "lawsuit" && data?.dossierId) {
          logHistoryEvent({
            entityType: "dossier",
            entityId: data.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            details: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            metadata: {
              childType: "lawsuit",
              childId: data.id,
              relatedType: referenceEntityType,
              relatedId: newItem.id,
            },
          });
        }
        if (tabConfig?.aggregationType === "missions" && config?.entityType === "lawsuit" && data?.dossierId) {
          logHistoryEvent({
            entityType: "dossier",
            entityId: data.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            details: `${getCreatedLabel()}: ${itemTitle} (${data.lawsuitNumber || data.title || ""})`,
            metadata: {
              childType: "lawsuit",
              childId: data.id,
              relatedType: referenceEntityType,
              relatedId: newItem.id,
            },
          });
        }
      }

      // Add to local state
      const updatedItems = [newItem, ...localItems];
      setLocalItems(updatedItems);

      // Notify parent component if callback exists
      if (onItemsChange && tabConfig?.itemsKey) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsAddModalOpen(false);
      showToast(
        t("detail.related.toast.addSuccess", {
          entityName: tabConfig?.entityName || t("detail.related.fallback.element"),
        }),
        "success"
      );

      // Navigate to the newly created entity detail view
      if (entityConfig?.route) {
        navigate(`${entityConfig.route}/${newItem.id}`);
      }

    } catch (error) {
      console.error("Error adding item:", error);
      showToast(t("detail.related.toast.addError"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    const targetItem = localItems.find(item => item.id === itemId);
    const itemName = targetItem && entityConfig.getTitle ? entityConfig.getTitle(targetItem) : entityConfig.title?.toLowerCase();
    if (await confirm({
      title: t("dialog.detail.related.delete.title", { entity: itemName }),
      message: t("dialog.detail.related.delete.message", { entity: itemName }),
      confirmText: t("dialog.detail.related.delete.confirm"),
      cancelText: t("dialog.detail.related.delete.cancel"),
      variant: "danger"
    })) {
      const updatedItems = localItems.filter(item => item.id !== itemId);
      setLocalItems(updatedItems);

      if (onItemsChange && tabConfig?.itemsKey) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }

      // Keep global store consistent with list screens
      switch (tabConfig?.aggregationType) {
        case "dossiers":
          deleteDossier(itemId);
          break;
        case "lawsuits":
          deleteLawsuit(itemId);
          break;
        case "sessions":
          deleteSession(itemId);
          break;
        case "tasks":
          deleteTask(itemId);
          break;
        case "missions":
          deleteMission(itemId);
          break;
        default:
          break;
      }
    }
  };

  // Check if add/delete is allowed
  const allowAdd = tabConfig?.allowAdd !== false;
  const allowDelete = tabConfig?.allowDelete !== false;
  const isAddEnabled = tabConfig?.addEnabled ? tabConfig.addEnabled(data) : true;
  const disabledReason = tabConfig?.addDisabledText || t("detail.related.disabledAction");

  // Get form fields - support both static formFields and dynamic getFormFields
  const formFields = tabConfig?.getFormFields
    ? tabConfig.getFormFields(data, contextData)
    : tabConfig?.formFields || [];

  // Adjust task form when adding from a Lawsuit detail: lock linkage to the current lawsuit
  const finalFormFields = formFields.map((field) => {
    if (tabConfig?.aggregationType === "tasks" && config?.entityType === "lawsuit") {
      if (field.name === "parentType") {
        return {
          ...field,
          defaultValue: "lawsuit",
          disabled: true,
          helpText: t("detail.related.help.taskLawsuitLink"),
        };
      }
      if (field.name === "lawsuitId") {
        return {
          ...field,
          required: true,
          disabled: true,
          hideIf: () => false, // always show the locked lawsuit context
          helpText: t("detail.related.help.taskLawsuitLink"),
        };
      }
      if (field.name === "dossierId") {
        return {
          ...field,
          hideIf: () => true, // hide dossier selection to avoid re-routing tasks
        };
      }
    }
    return field;
  });

  const hasFormFields = finalFormFields && finalFormFields.length > 0;

  // Check if required parent entities exist (e.g., dossierId or lawsuitId)
  const canAdd = hasFormFields && finalFormFields.every(field => {
    if (field.required && field.type === 'searchable-select') {
      // Check if field has static options or a getOptions function
      return (field.options && field.options.length > 0) || field.getOptions;
    }
    return true;
  }) && (tabConfig.aggregationType !== 'tasks' || (() => {
    // Special logic for tasks: check if there are options for either dossierId or lawsuitId
    const dossierField = finalFormFields.find(f => f.name === 'dossierId');
    const lawsuitField = finalFormFields.find(f => f.name === 'lawsuitId');
    // Check for static options or getOptions function
    const hasDossierOptions = (dossierField?.options && dossierField.options.length > 0) || dossierField?.getOptions;
    const hasLawsuitOptions = (lawsuitField?.options && lawsuitField.options.length > 0) || lawsuitField?.getOptions;
    return hasDossierOptions || hasLawsuitOptions;
  })());

  if (localItems.length === 0) {
    return (
      <>
        <ContentSection title={entityConfig.title}>
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <i className={`${entityConfig.icon} text-slate-400 dark:text-slate-600 text-2xl`}></i>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {entityConfig.emptyMessage}
            </p>

            {/* Improved UX: Show message instead of a disabled add button when prerequisites are missing */}
            {allowAdd && hasFormFields && (!canAdd || !isAddEnabled) && (
              <div className="mt-4 text-amber-600 dark:text-amber-400 font-medium flex flex-col items-center gap-2 text-center">
                <i className="fas fa-info-circle text-2xl"></i>
                <span>{disabledReason}</span>
              </div>
            )}
            {/* Show add button only if allowed and parent entity exists */}
            {allowAdd && hasFormFields && canAdd && isAddEnabled && (
              <button
                onClick={() => {
                  // Handle tutorial state when adding dossier from client detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-dossier-from-client" &&
                    tabConfig?.aggregationType === "dossiers") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding task from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-task-from-dossier" &&
                    tabConfig?.aggregationType === "tasks") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding mission from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-mission-from-dossier" &&
                    tabConfig?.aggregationType === "missions") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding lawsuit from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-lawsuit-from-dossier" &&
                    tabConfig?.aggregationType === "lawsuits") {
                    tutorial.setWaitingForAction(true);
                  }
                  setIsAddModalOpen(true);
                }}
                data-tutorial={
                  tabConfig?.aggregationType === "dossiers" && config?.entityType === "client"
                    ? "add-dossier-from-client-button"
                    : tabConfig?.aggregationType === "lawsuits" && config?.entityType === "dossier"
                      ? "add-lawsuit-from-dossier-button"
                      : tabConfig?.aggregationType === "tasks" && config?.entityType === "dossier"
                        ? "add-task-from-dossier-button"
                        : tabConfig?.aggregationType === "missions" && config?.entityType === "dossier"
                          ? "add-mission-from-dossier-button"
                          : undefined
                }
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                {t("detail.related.add", { entityName: tabConfig.entityName || t("detail.related.fallback.element") })}
              </button>
            )}
          </div>
        </ContentSection>

        {/* Add Modal */}
        {hasFormFields && canAdd && isAddEnabled && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={() => {
              setIsAddModalOpen(false);
              // Reset tutorial waiting state if modal is closed without creating
              if (tutorial?.setWaitingForAction) {
                tutorial.setWaitingForAction(false);
              }
            }}
            onSubmit={handleAddItem}
            initialData={prefillContext}
            title={t("detail.related.form.add", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })}
            subtitle={tabConfig.addSubtitle || t("detail.related.form.create", { entityName: tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.entity").toLowerCase() })}
            fields={finalFormFields}
            isLoading={isLoading}
            entityType={referenceEntityType}
            entities={contextData}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ContentSection
        title={`${entityConfig.title} (${localItems.length})`}
        actions={
          // ADD BUTTON - Header
          allowAdd && hasFormFields && (
            isAddEnabled && canAdd ? (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                {t("actions.add")} {tabConfig.entityName || t("detail.related.fallback.element")}
              </button>
            ) : (
              <span className="text-xs text-slate-500 dark:text-slate-400">
                {disabledReason}
              </span>
            )
          )
        }
      >
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {localItems.map(item => {
            const parentContext = getParentContext ? getParentContext(item) : null;
            return (
              <ItemRow
                key={item.id}
                item={item}
                parentContext={parentContext}
                entityConfig={entityConfig}
                aggregationType={tabConfig?.aggregationType}
                allowDelete={allowDelete}
                onDelete={handleDeleteItem}
                currentLocation={location}
                formatDate={formatDate}
              />
            );
          })}
        </div>

        {/* ADD BUTTON - Bottom */}
        {allowAdd && hasFormFields && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            {isAddEnabled && canAdd ? (
              <button
                onClick={() => {
                  // Handle tutorial state when adding dossier from client detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-dossier-from-client" &&
                    tabConfig?.aggregationType === "dossiers") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding task from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-task-from-dossier" &&
                    tabConfig?.aggregationType === "tasks") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding mission from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-mission-from-dossier" &&
                    tabConfig?.aggregationType === "missions") {
                    tutorial.setWaitingForAction(true);
                  }
                  // Handle tutorial state when adding lawsuit from dossier detail
                  if (tutorial?.setWaitingForAction &&
                    tutorial?.currentStep?.id === "create-lawsuit-from-dossier" &&
                    tabConfig?.aggregationType === "lawsuits") {
                    tutorial.setWaitingForAction(true);
                  }
                  setIsAddModalOpen(true);
                }}
                data-tutorial={
                  tabConfig?.aggregationType === "dossiers" && config?.entityType === "client"
                    ? "add-dossier-from-client-button"
                    : tabConfig?.aggregationType === "lawsuits" && config?.entityType === "dossier"
                      ? "add-lawsuit-from-dossier-button"
                      : tabConfig?.aggregationType === "tasks" && config?.entityType === "dossier"
                        ? "add-task-from-dossier-button"
                        : tabConfig?.aggregationType === "missions" && config?.entityType === "dossier"
                          ? "add-mission-from-dossier-button"
                          : undefined
                }
                className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
              >
                <i className="fas fa-plus mr-2"></i>
                {t("detail.related.add", { entityName: tabConfig.entityName || t("detail.related.fallback.element") })}
              </button>
            ) : (
              <div className="text-center text-sm text-slate-500 dark:text-slate-400">
                {disabledReason}
              </div>
            )}
          </div>
        )}
      </ContentSection>

      {/* Add Modal */}
      {hasFormFields && (
        <FormModal
          isOpen={isAddModalOpen}
          onClose={() => {
            setIsAddModalOpen(false);
            // Reset tutorial waiting state if modal is closed without creating
            if (tutorial?.setWaitingForAction) {
              tutorial.setWaitingForAction(false);
            }
          }}
          onSubmit={handleAddItem}
          initialData={prefillContext}
          title={t("detail.related.form.add", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })}
          subtitle={tabConfig.addSubtitle || t("detail.related.form.create", { entityName: tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.entity").toLowerCase() })}
          fields={finalFormFields}
          isLoading={isLoading}
          entityType={referenceEntityType}
          entities={contextData}
        />
      )}

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => {
          setBlockerModalOpen(false);
          setValidationResult(null);
        }}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={tabConfig.entityName || t("detail.related.fallback.entity")}
        impactSummary={validationResult?.impactSummary || []}
      />
    </>
  );
}

/**
 * ItemRow - Single item with parent context breadcrumb
 */
function ItemRow({ item, parentContext, entityConfig, aggregationType, allowDelete, onDelete, currentLocation, formatDate }) {
  const { t } = useTranslation("common");
  const { t: tTasks } = useTranslation("tasks");
  const subtitle = entityConfig.getSubtitle
    ? entityConfig.getSubtitle(item, formatDate)
    : null;

  // Get raw status and translate it
  const rawStatus = entityConfig.getStatus ? entityConfig.getStatus(item) : null;
  const translatedStatus = rawStatus ? translateStatus(rawStatus, aggregationType, t) : null;

  const taskMeta = (() => {
    if (aggregationType !== "tasks") return null;
    const dueLabel = tTasks("table.columns.dueDate");
    const assignedLabel = tTasks("table.columns.assignedTo");
    const formattedDate = formatDate ? formatDate(item.dueDate) : item.dueDate;
    const assignee = translateAssignee(item.assignedTo, tTasks, "tasks");
    if (!formattedDate && !assignee) return null;
    return `${dueLabel}: ${formattedDate || t("detail.fallback.na")}${assignee ? ` • ${assignedLabel}: ${assignee}` : ""}`;
  })();

  return (
    <div className="group">
      <Link
        to={`${entityConfig.route}/${item.id}`}
        state={{
          from: currentLocation.pathname,
          tab: new URLSearchParams(currentLocation.search).get('tab') || 'overview'
        }}
        className="p-4 md:p-6 flex flex-col md:flex-row md:items-center md:justify-between gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors rounded-2xl md:rounded-none"
      >
        <div className="flex items-start md:items-center gap-4 flex-1">
          {/* Icon */}
          <div className={`w-12 h-12 rounded-lg ${entityConfig.bgColor} flex items-center justify-center flex-shrink-0`}>
            <i className={`${entityConfig.icon} ${entityConfig.iconColor}`}></i>
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {/* Title and Status */}
            <div className="flex items-center gap-2 mb-1">
              <p className="font-semibold text-slate-900 dark:text-white truncate">
                {entityConfig.getTitle(item)}
              </p>
              {translatedStatus && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(rawStatus)}`}>
                  {translatedStatus}
                </span>
              )}
            </div>

            {/* Subtitle or Task Metadata */}
            {taskMeta ? (
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {taskMeta}
              </p>
            ) : entityConfig.getSubtitle && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {subtitle}
              </p>
            )}

            {/* Parent Context Breadcrumb */}
            {parentContext && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                {parentContext.dossier && (
                  <>
                    <i className="fas fa-folder-open"></i>
                    <span className="truncate">{parentContext.dossier.lawsuitNumber}</span>
                  </>
                )}
                {parentContext.lawsuit && (
                  <>
                    <i className="fas fa-chevron-right text-xs"></i>
                    <i className="fas fa-gavel"></i>
                    <span className="truncate">{parentContext.lawsuit.lawsuitNumber}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Mobile more menu */}
            {allowDelete && onDelete && (
              <div className="md:hidden">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.preventDefault()}
                      className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center"
                      aria-label={t("actions.more", { defaultValue: "More actions" })}
                    >
                      <i className="fas fa-ellipsis-h text-sm"></i>
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem
                      className="text-red-600 focus:text-red-600"
                      onSelect={(event) => {
                        event.preventDefault();
                        onDelete(item.id);
                      }}
                    >
                      {t("actions.delete")}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            )}

            {/* Desktop delete button */}
            {allowDelete && onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="hidden md:inline-flex p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                title="Delete"
              >
                <i className="fas fa-trash text-red-600 dark:text-red-400 text-sm"></i>
              </button>
            )}

            {/* Chevron */}
            <i className="fas fa-chevron-right text-slate-400 group-hover:text-slate-600 dark:group-hover:text-slate-300 transition-colors"></i>
          </div>
        </div>
      </Link>
    </div>
  );
}





