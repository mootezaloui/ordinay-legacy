import { useState, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import { useData } from "../../../contexts/DataContext";
import { getStatusColor } from "../config/statusColors";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";
import { logEntityCreation, logHistoryEvent, EVENT_TYPES } from "../../../services/historyService";

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
  const {
    addDossier,
    addCase,
    addSession,
    addTask,
    deleteDossier,
    deleteCase,
    deleteSession,
    deleteTask,
  } = useData();
  const [localItems, setLocalItems] = useState(items);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

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
      ctx.dossier = data.caseNumber;
      ctx.clientId = ctx.clientId || data.clientId;
      ctx.clientName = ctx.clientName || data.client?.name || data.client;
    }

    // Case context
    if (config?.entityType === "case") {
      ctx.caseId = data.id;
      ctx.caseNumber = data.caseNumber;
      ctx.caseTitle = data.title;
      ctx.dossierId = data.dossierId || ctx.dossierId;
      ctx.clientId = ctx.clientId || data.clientId;
      ctx.clientName = ctx.clientName || data.client?.name || data.client;
    }

    // Sessions and tasks can default linkType when coming from dossier/case
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "dossier") {
      ctx.linkType = "dossier";
      ctx.dossierId = ctx.dossierId || data.id;
    }
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "case") {
      ctx.linkType = "case";
      ctx.caseId = ctx.caseId || data.id;
    }
    if (tabConfig?.aggregationType === "sessions" && config?.entityType === "client") {
      const relatedDossiers = data.relatedDossiers || [];
      if (relatedDossiers.length === 1) {
        ctx.linkType = "dossier";
        ctx.dossierId = relatedDossiers[0].id;
        ctx.dossier = relatedDossiers[0].caseNumber;
        ctx.clientId = ctx.clientId || data.id;
      }
    }
    if (tabConfig?.aggregationType === "tasks") {
      if (config?.entityType === "dossier") {
        ctx.parentType = "dossier";
        ctx.dossierId = ctx.dossierId || data.id;
      } else if (config?.entityType === "case") {
        ctx.parentType = "case";
        ctx.caseId = ctx.caseId || data.id;
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
    || (tabConfig?.aggregationType === "cases" ? "case"
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
        return "Dossier Created";
      case "cases":
        return "Lawsuit Created";
      case "sessions":
        return "Hearing Created";
      case "tasks":
        return "Task Created";
      default:
        return "Item Created";
    }
  };

  const getItemTitle = (item) => {
    if (!item) return "";
    return (
      item.caseNumber ||
      item.title ||
      item.name ||
      item.description ||
      tabConfig?.entityName ||
      "ElAment"
    );
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
        caseId: toIntOrNull(mergedFormData.caseId),
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

        // Session creation from Dossier or Case detail
        if (tabConfig?.aggregationType === "sessions") {
          if (config?.entityType === "dossier") {
            rel.linkType = "dossier";
            rel.dossierId = data.id;
          } else if (config?.entityType === "case") {
            rel.linkType = "case";
            rel.caseId = data.id;
          }
        }

        // Procès creation
        if (tabConfig?.aggregationType === "cases") {
          if (config?.entityType === "dossier") {
            rel.dossierId = data.id;
            rel.dossier = data.caseNumber;
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
              rel.dossier = parentDossier.caseNumber;
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
              showToast("Erreur creating a dossier", "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
          }
          break;
        case "cases":
          {
            const creation = await addCase({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Case creation failed:", creation.result);
              showToast("Erreur creating a lawsuit", "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
          }
          break;
        case "sessions":
          {
            const creation = await addSession({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Session creation failed:", creation.result);
              showToast("Erreur creating a session", "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
          }
          break;
        case "tasks":
          {
            const creation = await addTask({ ...normalizedFormData, ...relationshipFields });
            if (!creation.ok) {
              console.error("Task creation failed:", creation.result);
              showToast("Erreur creating a task", "error");
              return;
            }
            const created = creation.created || creation;
            newItem = { ...created };
          }
          break;
        default:
          break;
      }

      // Log history for the created entity and its parent
      logEntityCreation(referenceEntityType, newItem.id, getItemTitle(newItem));
      if (data?.id && config?.entityType) {
        logHistoryEvent({
          entityType: config.entityType,
          entityId: data.id,
          eventType: EVENT_TYPES.RELATION,
          label: getCreatedLabel(),
          details: getItemTitle(newItem),
          metadata: {
            relatedType: referenceEntityType,
            relatedId: newItem.id,
          },
        });
      }

      // Add to local state
      const updatedItems = [newItem, ...localItems];
      setLocalItems(updatedItems);

      // Notify parent component if callback exists
      if (onItemsChange && tabConfig?.itemsKey) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }

      console.log("Adding new item:", newItem);
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsAddModalOpen(false);
      showToast(`${tabConfig?.entityName || 'Element'} added successfully!`, "success");

      // Navigate to the newly created entity detail view
      if (entityConfig?.route) {
        navigate(`${entityConfig.route}/${newItem.id}`);
      }

    } catch (error) {
      console.error("Error adding item:", error);
      showToast("Error adding item", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (await confirm({
      title: "Delete Item",
      message: "Are you sure you want to delete this item?",
      confirmText: "Delete",
      cancelText: "Cancel",
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
        case "cases":
          deleteCase(itemId);
          break;
        case "sessions":
          deleteSession(itemId);
          break;
        case "tasks":
          deleteTask(itemId);
          break;
        default:
          break;
      }

      console.log("Deleting item:", itemId);
    }
  };

  // Check if add/delete is allowed
  const allowAdd = tabConfig?.allowAdd !== false;
  const allowDelete = tabConfig?.allowDelete !== false;
  const isAddEnabled = tabConfig?.addEnabled ? tabConfig.addEnabled(data) : true;
  const disabledReason = tabConfig?.addDisabledText || "Action unavailable at the moment.";

  // Get form fields - support both static formFields and dynamic getFormFields
  const formFields = tabConfig?.getFormFields
    ? tabConfig.getFormFields(data, contextData)
    : tabConfig?.formFields || [];

  const hasFormFields = formFields && formFields.length > 0;

  // Check if required parent entities exist (e.g., dossierId or caseId)
  const canAdd = hasFormFields && formFields.every(field => {
    if (field.required && field.type === 'searchable-select') {
      // Check if field has static options or a getOptions function
      return (field.options && field.options.length > 0) || field.getOptions;
    }
    return true;
  }) && (tabConfig.aggregationType !== 'tasks' || (() => {
    // Special logic for tasks: check if there are options for either dossierId or caseId
    const dossierField = formFields.find(f => f.name === 'dossierId');
    const caseField = formFields.find(f => f.name === 'caseId');
    // Check for static options or getOptions function
    const hasDossierOptions = (dossierField?.options && dossierField.options.length > 0) || dossierField?.getOptions;
    const hasCaseOptions = (caseField?.options && caseField.options.length > 0) || caseField?.getOptions;
    return hasDossierOptions || hasCaseOptions;
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
                onClick={() => setIsAddModalOpen(true)}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                Add {tabConfig.entityName || 'element'}
              </button>
            )}
          </div>
        </ContentSection>

        {/* Add Modal */}
        {hasFormFields && canAdd && isAddEnabled && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSubmit={handleAddItem}
            initialData={prefillContext}
            title={`Add ${tabConfig.entityName || 'element'}`}
            subtitle={tabConfig.addSubtitle || `Create a new ${tabConfig.entityName?.toLowerCase() || 'element'}`}
            fields={formFields}
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
                Add {tabConfig.entityName || 'Item'}
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
                allowDelete={allowDelete}
                onDelete={handleDeleteItem}
                currentLocation={location}
              />
            );
          })}
        </div>

        {/* ADD BUTTON - Bottom */}
        {allowAdd && hasFormFields && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            {isAddEnabled && canAdd ? (
              <button
                onClick={() => setIsAddModalOpen(true)}
                className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
              >
                <i className="fas fa-plus mr-2"></i>
                Add {tabConfig.entityName || 'an element'}
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
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddItem}
          initialData={prefillContext}
          title={`Ajouter ${tabConfig.entityName || 'un élément'}`}
          subtitle={tabConfig.addSubtitle || `Créer un nouveau ${tabConfig.entityName?.toLowerCase() || 'élément'}`}
          fields={formFields}
          isLoading={isLoading}
          entityType={referenceEntityType}
        />
      )}
    </>
  );
}

/**
 * ItemRow - Single item with parent context breadcrumb
 */
function ItemRow({ item, parentContext, entityConfig, allowDelete, onDelete, currentLocation }) {
  return (
    <div className="group">
      <Link
        to={`${entityConfig.route}/${item.id}`}
        state={{
          from: currentLocation.pathname,
          tab: new URLSearchParams(currentLocation.search).get('tab') || 'overview'
        }}
        className="p-6 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <div className="flex items-center gap-4 flex-1">
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
              {entityConfig.getStatus && (
                <span className={`px-2 py-0.5 rounded-full text-xs font-medium whitespace-nowrap ${getStatusColor(entityConfig.getStatus(item))}`}>
                  {entityConfig.getStatus(item)}
                </span>
              )}
            </div>

            {/* Subtitle */}
            {entityConfig.getSubtitle && (
              <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                {entityConfig.getSubtitle(item)}
              </p>
            )}

            {/* Parent Context Breadcrumb */}
            {parentContext && (
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-500">
                {parentContext.dossier && (
                  <>
                    <i className="fas fa-folder-open"></i>
                    <span className="truncate">{parentContext.dossier.caseNumber}</span>
                  </>
                )}
                {parentContext.case && (
                  <>
                    <i className="fas fa-chevron-right text-xs"></i>
                    <i className="fas fa-gavel"></i>
                    <span className="truncate">{parentContext.case.caseNumber}</span>
                  </>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-3">
            {/* Delete Button */}
            {allowDelete && onDelete && (
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onDelete(item.id);
                }}
                className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
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

