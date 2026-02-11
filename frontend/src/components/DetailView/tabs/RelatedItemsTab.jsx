import { useState, useMemo, useEffect } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useToast } from "../../../contexts/ToastContext";
import { useConfirm } from "../../../contexts/ConfirmContext";
import ContentSection from "../../layout/ContentSection";
import FormModal from "../../FormModal/FormModal";

import { resolveDetailRoute } from "../../../utils/routeResolver";
import { useTranslation } from "react-i18next";
import { getStatusColor } from "../config/statusColors";
import { translateStatus } from "../../../utils/entityTranslations";

/**
 * RelatedItems Tab - Enhanced with dynamic field options
 * ✅ UPDATED: Handles getOptions() for dynamic dropdowns
 * ✅ UPDATED: Processes searchable-select fields
 * ✅ FIXED: Synchronizes local items state with parent data prop
 */
export default function RelatedItemsTab({ data, config, tabConfig, onItemsChange }) {
  const navigate = useNavigate();
  const { showToast } = useToast();
  const { confirm } = useConfirm();
  const { t } = useTranslation("common");
  const [items, setItems] = useState(data[tabConfig.itemsKey] || []);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({});
  const [editingItem, setEditingItem] = useState(null);

  // ✅ Synchronize local items state with parent data prop
  useEffect(() => {
    setItems(data[tabConfig.itemsKey] || []);
  }, [data, tabConfig.itemsKey]);

  // ✅ Process form fields to handle dynamic options
  const processedFormFields = useMemo(() => {
    if (!tabConfig.formFields) return [];

    return tabConfig.formFields.map(field => {
      // If field has getOptions function, call it with current formData
      if (field.getOptions && typeof field.getOptions === 'function') {
        return {
          ...field,
          options: field.getOptions(formData),
        };
      }
      return field;
    });
  }, [tabConfig.formFields, formData]);

  const handleSaveItem = async (submittedFormData) => {
    setIsLoading(true);

    try {
      const isEdit = Boolean(editingItem);
      // Create new item
      const newItem = isEdit
        ? { ...editingItem, ...submittedFormData }
        : {
          id: Date.now(),
          ...submittedFormData,
          // Add parent reference if needed
          [config.entityType + 'Id']: data.id,
          createdDate: new Date().toISOString().split('T')[0],
        };

      // ✅ Special handling for tasks: set parentType based on parent entity
      if (tabConfig.itemsKey === 'tasks') {
        newItem.parentType = config.entityType; // 'dossier' or 'lawsuit'

        // Set the appropriate parent ID and clear the other
        if (config.entityType === 'dossier') {
          newItem.dossierId = data.id;
          newItem.lawsuitId = null;
        } else if (config.entityType === 'lawsuit') {
          newItem.lawsuitId = data.id;
          newItem.dossierId = null;
        }
      }

      // Add to local state
      const updatedItems = isEdit
        ? items.map((item) => (item.id === newItem.id ? newItem : item))
        : [newItem, ...items];
      setItems(updatedItems);

      // Notify parent component
      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }

      // TODO: Save to backend
      await new Promise(resolve => setTimeout(resolve, 500));

      setIsAddModalOpen(false);
      setEditingItem(null);
      setFormData({}); // Reset form data
      const entityLabel = tabConfig.entityName || t("detail.related.fallback.entity");
      const actionKey = isEdit ? "update" : "create";
      showToast(t(`detail.related.toast.success.${actionKey}`, { entity: entityLabel }), "success");

      // ✅ Navigate to the new entity's detail view
      // Map itemsKey to entity type for routing
      const entityTypeMap = {
        'tasks': 'task',
        'sessions': 'session',
        'dossiers': 'dossier',
        'lawsuits': 'lawsuit',
        'officers': 'officer',
        'missions': 'mission'
      };
      const itemEntityType = entityTypeMap[tabConfig.itemsKey] || tabConfig.itemsKey?.replace(/s$/, '');
      if (itemEntityType) {
        const detailRoute = resolveDetailRoute(itemEntityType, newItem.id);
        if (detailRoute) {
          setTimeout(() => navigate(detailRoute), 100);
        }
      }

    } catch (error) {
      console.error("Error adding item:", error);
      showToast(t("detail.related.toast.error.add"), "error");
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteItem = async (itemId) => {
    if (await confirm({
      title: t("dialog.detail.related.delete.title", { entity: (tabConfig.entityName || t("detail.related.fallback.entity")).toLowerCase() }),
      message: t("dialog.detail.related.delete.message", { entity: (tabConfig.entityName || t("detail.related.fallback.entity")).toLowerCase() }),
      confirmText: t("dialog.detail.related.delete.confirm"),
      cancelText: t("dialog.detail.related.delete.cancel"),
      variant: "danger"
    })) {
      const updatedItems = items.filter(item => item.id !== itemId);
      setItems(updatedItems);

      if (onItemsChange) {
        onItemsChange(tabConfig.itemsKey, updatedItems);
      }

      // TODO: Delete from backend
    }
  };

  const handleModalOpen = (item = null) => {
    // Initialize with defaults when opening
    const defaults = {};
    tabConfig.formFields?.forEach((field) => {
      defaults[field.name] = field.defaultValue || "";
    });
    if (item) {
      setEditingItem(item);
      setFormData({ ...defaults, ...item });
    } else {
      setEditingItem(null);
      setFormData(defaults);
    }
    setIsAddModalOpen(true);
  };

  const handleModalClose = () => {
    // Clear form data on close
    setFormData({});
    setEditingItem(null);
    setIsAddModalOpen(false);
  };

  if (items.length === 0) {
    return (
      <>
        <ContentSection title={tabConfig.label}>
          <div className="p-12 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
              <i className={`${tabConfig.icon} text-slate-400 dark:text-slate-600 text-2xl`}></i>
            </div>
            <p className="text-slate-600 dark:text-slate-400 mb-4">
              {tabConfig.emptyMessage || t("detail.related.empty.noItems")}
            </p>

            {/* ADD BUTTON - Empty State */}
            {tabConfig.allowAdd !== false && (
              <button
                onClick={() => handleModalOpen()}
                className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors inline-flex items-center gap-2"
              >
                <i className="fas fa-plus"></i>
                Add {tabConfig.entityName || 'an item'}
              </button>
            )}
          </div>
        </ContentSection>

        {/* Add Modal */}
        {tabConfig.formFields && (
          <FormModal
            key={`${tabConfig.itemsKey}-${editingItem?.id || 'new'}`}
            isOpen={isAddModalOpen}
            onClose={handleModalClose}
            onSubmit={handleSaveItem}
            title={editingItem
              ? t("detail.related.edit", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })
              : t("detail.related.add", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })
            }
            subtitle={editingItem
              ? (tabConfig.editSubtitle || t("detail.related.subtitle.edit", { entity: (tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.element")) }))
              : (tabConfig.addSubtitle || t("detail.related.subtitle.add", { entity: (tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.element")), parent: config.getTitle(data) }))
            }
            fields={processedFormFields}
            isLoading={isLoading}
            // ✅ Pass formData state handlers for dynamic updates
            formData={formData}
            onFormDataChange={setFormData}
            initialData={editingItem || undefined}
          />
        )}
      </>
    );
  }

  return (
    <>
      <ContentSection
        title={`${tabConfig.label} (${items.length})`}
        actions={
          // ADD BUTTON - Header
          tabConfig.allowAdd !== false && (
            <button
              onClick={handleModalOpen}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2"
            >
              <i className="fas fa-plus"></i>
              Add {tabConfig.entityName || 'an item'}
            </button>
          )
        }
      >
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {items.map((item) => {
            const renderedItem = tabConfig.renderItem(item);
            const itemRoute = tabConfig.itemRoute ? (typeof tabConfig.itemRoute === 'function' ? tabConfig.itemRoute(item) : tabConfig.itemRoute) : null;
            const hasRoute = itemRoute && item.id;

            const ItemWrapper = hasRoute ? Link : 'div';
            const wrapperProps = hasRoute
              ? { to: `${itemRoute}/${item.id}` }
              : {};

            return (
              <div
                key={item.id}
                className="group"
              >
                <ItemWrapper
                  {...wrapperProps}
                  className={`p-6 flex items-center justify-between transition-colors ${hasRoute ? 'hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer' : ''
                    }`}
                >
                  <div className="flex items-center gap-4 flex-1">
                    {/* Icon - NEW */}
                    {renderedItem.icon && (
                      <div className={`w-12 h-12 rounded-lg ${renderedItem.bgColor || 'bg-slate-100 dark:bg-slate-800'} flex items-center justify-center flex-shrink-0`}>
                        <i className={`${renderedItem.icon} ${renderedItem.iconColor || 'text-slate-600 dark:text-slate-400'}`}></i>
                      </div>
                    )}

                    {/* Content */}
                    <div className="flex-1">
                      <p className="font-semibold text-slate-900 dark:text-white">
                        {renderedItem.title}
                      </p>
                      {renderedItem.subtitle && (
                        <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                          {renderedItem.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    {renderedItem.extra && (
                      <span className="text-lg font-bold text-slate-900 dark:text-white">
                        {renderedItem.extra}
                      </span>
                    )}
                    {renderedItem.status && (
                      <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(renderedItem.status)}`}>
                        {renderedItem.statusLabel ||
                          translateStatus(
                            renderedItem.status,
                            renderedItem.statusNamespace || tabConfig.statusNamespace || tabConfig.itemsKey,
                            t
                          )}
                      </span>
                    )}



                    {/* Delete Button */}
                    {tabConfig.allowDelete !== false && (
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleDeleteItem(item.id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors opacity-0 group-hover:opacity-100"
                        title={t("actions.delete")}
                      >
                        <i className="fas fa-trash text-red-600 dark:text-red-400 text-sm"></i>
                      </button>
                    )}

                    {hasRoute && (
                      <i className="fas fa-chevron-right text-slate-400"></i>
                    )}
                  </div>
                </ItemWrapper>
              </div>
            );
          })}
        </div>

        {/* ADD BUTTON - Bottom */}
        {tabConfig.allowAdd !== false && (
          <div className="p-6 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={handleModalOpen}
              className="w-full py-3 border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-500 dark:hover:border-blue-500 rounded-lg text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors font-medium"
            >
              <i className="fas fa-plus mr-2"></i>
              Add {tabConfig.entityName || 'an item'}
            </button>
          </div>
        )}
      </ContentSection>

      {/* Add Modal */}
      {tabConfig.formFields && (
        <FormModal
          isOpen={isAddModalOpen}
          onClose={handleModalClose}
          onSubmit={handleSaveItem}
          title={editingItem
            ? t("detail.related.edit", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })
            : t("detail.related.add", { entityName: tabConfig.entityName || t("detail.related.fallback.entity") })
          }
          subtitle={editingItem
            ? (tabConfig.editSubtitle || t("detail.related.subtitle.edit", { entity: (tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.element")) }))
            : (tabConfig.addSubtitle || t("detail.related.subtitle.add", { entity: (tabConfig.entityName?.toLowerCase() || t("detail.related.fallback.element")), parent: config.getTitle(data) }))
          }
          fields={processedFormFields}
          isLoading={isLoading}
          // ✅ Pass formData state handlers for dynamic updates
          formData={formData}
          onFormDataChange={setFormData}
          initialData={editingItem || undefined}
        />
      )}
    </>
  );
}



