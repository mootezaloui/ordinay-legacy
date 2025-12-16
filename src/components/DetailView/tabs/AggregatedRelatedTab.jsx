import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";
import { getStatusColor } from "../../../utils/mockData";

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
  onItemsChange
}) {
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const [localItems, setLocalItems] = useState(items);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Update local items when props change
  useEffect(() => {
    setLocalItems(items);
  }, [items]);

  const handleAddItem = async (formData) => {
    setIsLoading(true);

    try {
      // Create new item
      const newItem = {
        id: Date.now(),
        ...formData,
        // Add parent reference
        [config.entityType + 'Id']: data.id,
        createdDate: new Date().toISOString().split('T')[0],
      };

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
      showToast(`${tabConfig?.entityName || 'Élément'} ajouté avec succès!`, "success");

    } catch (error) {
      console.error("Error adding item:", error);
      showToast("Erreur lors de l'ajout", "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (await confirm({
      title: "Supprimer l'élément",
      message: "Êtes-vous sûr de vouloir supprimer cet élément ?",
      confirmText: "Supprimer",
      cancelText: "Annuler",
      variant: "danger"
    })) {
      const updatedItems = localItems.filter(item => item.id !== itemId);
      setLocalItems(updatedItems);

      if (onItemsChange && tabConfig?.itemsKey) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }

      console.log("Deleting item:", itemId);
    }
  };

  // Check if add/delete is allowed
  const allowAdd = tabConfig?.allowAdd !== false;
  const allowDelete = tabConfig?.allowDelete !== false;

  // Get form fields - support both static formFields and dynamic getFormFields
  const formFields = tabConfig?.getFormFields
    ? tabConfig.getFormFields(data)
    : tabConfig?.formFields || [];

  const hasFormFields = formFields && formFields.length > 0;

  // Check if required parent entities exist (e.g., dossierId or caseId)
  const canAdd = hasFormFields && formFields.every(field => {
    if (field.required && field.type === 'searchable-select') {
      return field.options && field.options.length > 0;
    }
    return true;
  });

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

            {/* ADD BUTTON - Empty State */}
            {allowAdd && hasFormFields && (
              <button
                onClick={() => setIsAddModalOpen(true)}
                disabled={!canAdd}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                title={!canAdd ? "Créez d'abord les entités parentes requises" : ""}
              >
                <i className="fas fa-plus"></i>
                Ajouter {tabConfig.entityName || 'un élément'}
              </button>
            )}
          </div>
        </ContentSection>

        {/* Add Modal */}
        {hasFormFields && (
          <FormModal
            isOpen={isAddModalOpen}
            onClose={() => setIsAddModalOpen(false)}
            onSubmit={handleAddItem}
            title={`Ajouter ${tabConfig.entityName || 'un élément'}`}
            subtitle={tabConfig.addSubtitle || `Créer un nouveau ${tabConfig.entityName?.toLowerCase() || 'élément'}`}
            fields={formFields}
            isLoading={isLoading}
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
            <button
              onClick={() => setIsAddModalOpen(true)}
              disabled={!canAdd}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canAdd ? "Créez d'abord les entités parentes requises" : ""}
            >
              <i className="fas fa-plus"></i>
              Ajouter
            </button>
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
              />
            );
          })}
        </div>

        {/* ADD BUTTON - Bottom */}
        {allowAdd && hasFormFields && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={() => setIsAddModalOpen(true)}
              disabled={!canAdd}
              className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              title={!canAdd ? "Créez d'abord les entités parentes requises" : ""}
            >
              <i className="fas fa-plus mr-2"></i>
              Ajouter {tabConfig.entityName || 'un élément'}
            </button>
          </div>
        )}
      </ContentSection>

      {/* Add Modal */}
      {hasFormFields && (
        <FormModal
          isOpen={isAddModalOpen}
          onClose={() => setIsAddModalOpen(false)}
          onSubmit={handleAddItem}
          title={`Ajouter ${tabConfig.entityName || 'un élément'}`}
          subtitle={tabConfig.addSubtitle || `Créer un nouveau ${tabConfig.entityName?.toLowerCase() || 'élément'}`}
          fields={formFields}
          isLoading={isLoading}
        />
      )}
    </>
  );
}

/**
 * ItemRow - Single item with parent context breadcrumb
 */
function ItemRow({ item, parentContext, entityConfig, allowDelete, onDelete }) {
  return (
    <div className="group">
      <Link
        to={`${entityConfig.route}/${item.id}`}
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
                title="Supprimer"
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
