import { useState } from "react";
import ContentSection from "../../layout/ContentSection";
import SearchableSelect from "../../FormModal/SearchableSelect";
import BlockerModal from "../../ui/BlockerModal";
import ConfirmImpactModal from "../../ui/ConfirmImpactModal";
import { canPerformAction } from "../../../services/domainRules";

/**
 * Overview Tab - Displays general information
 * ✅ UPDATED: Supports both inline quick actions and structured edit sections
 */
export default function OverviewTab({ data, config, isEditing, onDataChange, onSectionSave, entityType, entityId, contextData = {}, onSectionSaveWithOptions }) {
  if (!config.overviewSections) {
    return (
      <div className="p-6 text-center text-slate-600 dark:text-slate-400">
        No overview configuration found
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${config.overviewSections.length > 1 ? 'lg:grid-cols-2' : ''} gap-6`}>
      {config.overviewSections.map((section, index) => {
        // ✅ Check if this section should use structured edit mode
        const isStructuredEdit = section.editStrategy === "structured";

        if (isStructuredEdit) {
          return (
            <StructuredEditSection
              key={index}
              section={section}
              data={data}
              onSave={onSectionSave}
              onSaveWithOptions={onSectionSaveWithOptions || onSectionSave}
              entityType={entityType}
              entityId={entityId}
              contextData={contextData}
            />
          );
        }

        // Default: Regular read-only or inline-editable section
        return (
          <RegularSection
            key={index}
            section={section}
            data={data}
            isEditing={isEditing}
            onDataChange={onDataChange}
            contextData={contextData}
          />
        );
      })}
    </div>
  );
}

/**
 * Structured Edit Section - Explicit Edit/Save buttons
 */
function StructuredEditSection({ section, data, onSave, onSaveWithOptions, entityType, entityId, contextData = {} }) {
  const [isEditing, setIsEditing] = useState(false);
  const [editedData, setEditedData] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingData, setPendingData] = useState(null);

  const handleEdit = () => {
    // ✅ Validate before allowing edit
    if (entityType && entityId) {
      const result = canPerformAction(entityType, entityId, 'edit', {
        data,
        entities: {
          financialEntries: contextData.financialEntries || [],
          clients: contextData.clients || [],
          dossiers: contextData.dossiers || [],
          cases: contextData.cases || [],
          officers: contextData.officers || [],
          missions: contextData.missions || [],
          tasks: contextData.tasks || [],
          sessions: contextData.sessions || [],
        }
      });

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
    }

    // Initialize edited data with current values
    const initialData = {};
    if (section.fields) {
      section.fields.forEach(field => {
        const fieldKey = field.key || field.label.toLowerCase().replace(/\s+/g, '_');
        const resolvedFromField = typeof field.value === 'function'
          ? field.value(data)
          : undefined;
        const resolvedValue = resolvedFromField !== undefined ? resolvedFromField : data[fieldKey];
        initialData[fieldKey] = resolvedValue ?? '';
      });
    } else if (section.fieldKey) {
      initialData[section.fieldKey] = data[section.fieldKey] ?? (
        typeof section.content === 'function' ? section.content(data) : section.content
      );
    }
    setEditedData(initialData);
    setIsEditing(true);
  };

  const handleSave = async () => {
    // ✅ Validate before saving
    if (entityType && entityId) {
      console.log("[OverviewTab] Validating section save:");
      console.log("  Entity type:", entityType);
      console.log("  Entity ID:", entityId);
      console.log("  Original data:", data);
      console.log("  Edited data (changes only):", editedData);

      const result = canPerformAction(entityType, entityId, 'edit', {
        data,
        newData: editedData,  // Only the changed fields
        entities: contextData  // Pass full context for client resolution
      });

      console.log("  Validation result:", result);

      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }

      // Phase 2.5: Check for relational-impact changes
      if (result.requiresConfirmation) {
        console.log("  >>> CONFIRMATION REQUIRED - showing modal");
        setValidationResult(result);
        setPendingData(editedData);
        setConfirmImpactModalOpen(true);
        return;
      }
    }

    // Proceed with save
    await performSave(editedData);
  };

  const performSave = async (dataToSave, options = {}) => {
    setIsSaving(true);
    if (options.skipConfirmation && onSaveWithOptions) {
      await onSaveWithOptions(dataToSave, options);
    } else {
      await onSave(dataToSave);
    }
    setIsSaving(false);
    setIsEditing(false);
  };

  const handleConfirmImpact = async () => {
    setConfirmImpactModalOpen(false);
    await performSave(pendingData, { skipConfirmation: true });
    setPendingData(null);
  };

  const handleCancel = () => {
    setEditedData({});
    setIsEditing(false);
  };

  const handleFieldChange = (fieldKey, value) => {
    const newData = { ...editedData, [fieldKey]: value };

    // ✅ Handle linkType clearing (for sessions)
    if (fieldKey === "linkType") {
      if (value === "case") {
        newData.dossierId = "";
      } else if (value === "dossier") {
        newData.caseId = "";
      }
    }

    // ✅ Handle parentType clearing (for tasks)
    if (fieldKey === "parentType") {
      if (value === "case") {
        newData.dossierId = "";
        newData.dossier = null;
      } else if (value === "dossier") {
        newData.caseId = "";
        newData.case = null;
      }
    }

    // ✅ Handle clientId change - clear dependent dossier and case (for financial entries)
    if (fieldKey === "clientId") {
      newData.dossierId = "";
      newData.dossierReference = "";
      newData.caseId = "";
      newData.caseReference = "";
    }

    // ✅ Handle dossierId change - clear dependent case and update client (for financial entries)
    if (fieldKey === "dossierId") {
      const selectedDossier = [].find(d => d.id === parseInt(value));
      if (selectedDossier) {
        newData.dossier = {
          id: selectedDossier.id,
          caseNumber: selectedDossier.caseNumber,
          title: selectedDossier.title
        };
        newData.dossierReference = selectedDossier.caseNumber;
        // Auto-fill client if not already set
        if (!newData.clientId) {
          newData.clientId = selectedDossier.clientId;
          const client = [].find(c => c.id === selectedDossier.clientId);
          if (client) {
            newData.clientName = client.name;
          }
        }
      }
      // Clear case when dossier changes
      newData.caseId = "";
      newData.caseReference = "";
    }

    // ✅ Update the full case object when caseId changes (for all entities)
    if (fieldKey === "caseId") {
      const selectedCase = [].find(c => c.id === parseInt(value));
      if (selectedCase) {
        newData.case = {
          id: selectedCase.id,
          caseNumber: selectedCase.caseNumber,
          title: selectedCase.title
        };
        newData.caseReference = selectedCase.caseNumber;
        // Auto-fill dossier and client if not already set
        if (!newData.dossierId && selectedCase.dossierId) {
          newData.dossierId = selectedCase.dossierId;
          const dossier = [].find(d => d.id === selectedCase.dossierId);
          if (dossier) {
            newData.dossierReference = dossier.caseNumber;
            if (!newData.clientId) {
              newData.clientId = dossier.clientId;
              const client = [].find(c => c.id === dossier.clientId);
              if (client) {
                newData.clientName = client.name;
              }
            }
          }
        }
      }
    }

    setEditedData(newData);
  };

  return (
    <ContentSection
      title={section.title}
      allowOverflow={isEditing}
      actions={
        !isEditing ? (
          <button
            onClick={handleEdit}
            className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors flex items-center gap-2"
          >
            <i className="fas fa-edit"></i>
            Edit
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <button
              onClick={handleCancel}
              className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700/50 text-slate-700 dark:text-slate-200 rounded-lg transition-colors"
            >
              <i className="fas fa-times mr-1"></i>
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? (
                <i className="fas fa-spinner fa-spin"></i>
              ) : (
                <i className="fas fa-save"></i>
              )}
              Save
            </button>
          </div>
        )
      }
    >
      <div className="p-6">
        {/* Description type */}
        {section.type === "description" && (
          <>
            {isEditing ? (
              <textarea
                value={editedData[section.fieldKey] || (typeof section.content === 'function' ? section.content(data) : section.content)}
                onChange={(e) => handleFieldChange(section.fieldKey || 'description', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="4"
              />
            ) : (
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {typeof section.content === 'function' ? section.content(data) : section.content}
              </p>
            )}
          </>
        )}

        {/* Notes type */}
        {section.type === "notes" && (
          <>
            {isEditing ? (
              <textarea
                value={editedData[section.fieldKey || 'notes'] || (typeof section.content === 'function' ? section.content(data) : section.content)}
                onChange={(e) => handleFieldChange(section.fieldKey || 'notes', e.target.value)}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                rows="3"
              />
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {typeof section.content === 'function' ? section.content(data) : section.content}
                </p>
              </div>
            )}
          </>
        )}

        {/* Fields type */}
        {section.fields && (
          <div className={isEditing ? "space-y-6" : "space-y-4"}>
            {section.fields.map((field, fieldIndex) => {
              const fieldKey = field.key || field.label.toLowerCase().replace(/\s+/g, '_');
              const value = typeof field.value === 'function' ? field.value(data) : data[fieldKey];
              const fieldType = field.type || 'text';

              // ✅ Conditional visibility for session form fields (linkType)
              const hasLinkType = "linkType" in (isEditing ? editedData : data);
              const currentLinkType = isEditing ? editedData.linkType : data.linkType;

              // ✅ Conditional visibility for task form fields (parentType)
              const hasParentType = "parentType" in (isEditing ? editedData : data);
              const currentParentType = isEditing ? editedData.parentType : data.parentType;

              // Hide fields based on linkType (sessions)
              if (hasLinkType && fieldKey === "caseId" && currentLinkType !== "case") {
                return null;
              }
              if (hasLinkType && fieldKey === "dossierId" && currentLinkType !== "dossier") {
                return null;
              }

              // Hide fields based on parentType (tasks)
              if (hasParentType && fieldKey === "caseId" && currentParentType !== "case") {
                return null;
              }
              if (hasParentType && fieldKey === "dossierId" && currentParentType !== "dossier") {
                return null;
              }

              if (isEditing && field.editable !== false) {
                // ✅ Determine if field is conditionally required
                const isConditionallyRequired =
                  (hasLinkType && (
                    (fieldKey === "caseId" && currentLinkType === "case") ||
                    (fieldKey === "dossierId" && currentLinkType === "dossier")
                  )) ||
                  (hasParentType && (
                    (fieldKey === "caseId" && currentParentType === "case") ||
                    (fieldKey === "dossierId" && currentParentType === "dossier")
                  ));

                return (
                  <div key={fieldIndex} className="relative">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {field.label}
                      {(field.required || isConditionallyRequired) && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {/* Text, email, tel, number, date inputs */}
                    {(['text', 'email', 'tel', 'number', 'date'].includes(fieldType)) && (
                      <input
                        type={fieldType}
                        value={editedData[fieldKey] || ''}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow"
                      />
                    )}

                    {/* Textarea */}
                    {fieldType === 'textarea' && (
                      <textarea
                        value={editedData[fieldKey] || ''}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                        placeholder={field.placeholder}
                        rows={field.rows || 3}
                        className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow resize-none"
                      />
                    )}

                    {/* Select dropdown - ✅ UNIFIED: Consistent styling */}
                    {(fieldType === 'select' || fieldType === 'searchable-select') && (field.options || field.getOptions) && (() => {
                      // ✅ Support dynamic options based on current edited data
                      const fieldOptions = typeof field.getOptions === 'function'
                        ? field.getOptions(editedData, contextData)
                        : field.options;

                      const useSearchable = fieldType === 'searchable-select' || fieldOptions.length > 10;

                      if (useSearchable) {
                        return (
                          <SearchableSelect
                            value={editedData[fieldKey] || ''}
                            onChange={(newValue) => handleFieldChange(fieldKey, newValue)}
                            options={fieldOptions}
                            placeholder={field.placeholder || "Searching..."}
                            disabled={false}
                            compact={false}
                            allowCreate={field.allowCreate || false}
                            onCreateOption={field.onCreateOption || null}
                            createLabel={field.createLabel || "Add"}
                          />
                        );
                      }

                      // ✅ MODERN/MINIMAL: Professional native select
                      return (
                        <div className="relative">
                          <select
                            value={editedData[fieldKey] || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 appearance-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:shadow"
                          >
                            <option value="">Select...</option>
                            {fieldOptions.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {/* Modern/Minimal: Clean chevron */}
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
                          </div>
                        </div>
                      );
                    })()}

                    {field.helpText && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                );
              }

              // ✅ Support custom rendering for special fields (display mode)
              if (field.customRender) {
                return (
                  <div key={fieldIndex} className="flex items-start gap-3">
                    {field.icon && (
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                        <i className={`${field.icon} text-slate-400 dark:text-slate-500`}></i>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{field.label}</p>
                      {field.customRender(data, contextData)}
                    </div>
                  </div>
                );
              }

              // Display mode
              return (
                <div key={fieldIndex} className="flex items-center gap-3">
                  {field.icon && (
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                      <i className={`${field.icon} text-slate-400 dark:text-slate-500`}></i>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{field.label}</p>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">
                      {field.displayValue ? (typeof field.displayValue === 'function' ? field.displayValue(data, contextData) : field.displayValue) : value || <span className="text-slate-400 dark:text-slate-600">N/A</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName={section.title ? `Edit ${section.title.toLowerCase()}` : "Edit this section"}
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={data?.caseNumber || data?.title || data?.name || ""}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName="edit attachment"
        impactSummary={validationResult?.impactSummary || []}
        entityName={data?.caseNumber || data?.title || data?.name || ""}
      />
    </ContentSection>
  );
}

/**
 * Regular Section - No explicit edit mode (for backwards compatibility)
 */
function RegularSection({ section, data, isEditing, onDataChange, contextData = {} }) {
  const [editedData, setEditedData] = useState(data);

  const handleFieldChange = (fieldKey, value) => {
    let newData = { ...editedData, [fieldKey]: value };

    // Handle special cases
    if (fieldKey === "linkType") {
      if (value === "case") {
        newData.dossierId = "";
      } else if (value === "dossier") {
        newData.caseId = "";
      }
    }

    if (fieldKey === "dossierId") {
      const selectedDossier = [].find(d => d.id === parseInt(value));
      if (selectedDossier) {
        newData.dossier = {
          id: selectedDossier.id,
          caseNumber: selectedDossier.caseNumber,
          title: selectedDossier.title
        };
      }
    }

    if (fieldKey === "caseId") {
      const selectedCase = [].find(c => c.id === parseInt(value));
      if (selectedCase) {
        newData.case = {
          id: selectedCase.id,
          caseNumber: selectedCase.caseNumber,
          title: selectedCase.title
        };
      }
    }

    setEditedData(newData);
    if (onDataChange) {
      onDataChange(newData);
    }
  };

  return (
    <ContentSection title={section.title} allowOverflow={isEditing}>
      <div className="p-6">
        {/* Same rendering logic as before for backwards compatibility */}
        {section.type === "description" && (
          <>
            {isEditing ? (
              <textarea
                value={editedData[section.fieldKey] || (typeof section.content === 'function' ? section.content(editedData) : section.content)}
                onChange={(e) => handleFieldChange(section.fieldKey || 'description', e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                rows="4"
              />
            ) : (
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {typeof section.content === 'function' ? section.content(data) : section.content}
              </p>
            )}
          </>
        )}

        {section.type === "notes" && (
          <>
            {isEditing ? (
              <textarea
                value={editedData[section.fieldKey || 'notes'] || (typeof section.content === 'function' ? section.content(editedData) : section.content)}
                onChange={(e) => handleFieldChange(section.fieldKey || 'notes', e.target.value)}
                className="w-full px-3 py-2 border border-amber-300 dark:border-amber-600 rounded-lg bg-amber-50 dark:bg-amber-900/10 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                rows="3"
              />
            ) : (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap">
                  {typeof section.content === 'function' ? section.content(data) : section.content}
                </p>
              </div>
            )}
          </>
        )}

        {section.fields && (
          <div className={isEditing ? "space-y-6" : "space-y-4"}>
            {section.fields.map((field, fieldIndex) => {
              const fieldKey = field.key || field.label.toLowerCase().replace(/\s+/g, '_');
              const value = typeof field.value === 'function' ? field.value(data) : data[fieldKey];
              const fieldType = field.type || 'text';

              const hasLinkType = "linkType" in editedData;

              if (hasLinkType && fieldKey === "caseId" && editedData.linkType !== "case") {
                return null;
              }
              if (hasLinkType && fieldKey === "dossierId" && editedData.linkType !== "dossier") {
                return null;
              }

              if (isEditing && field.editable !== false) {
                const isConditionallyRequired = hasLinkType && (
                  (fieldKey === "caseId" && editedData.linkType === "case") ||
                  (fieldKey === "dossierId" && editedData.linkType === "dossier")
                );

                return (
                  <div key={fieldIndex} className="relative">
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                      {field.label}
                      {(field.required || isConditionallyRequired) && <span className="text-red-500 ml-1">*</span>}
                    </label>

                    {(['text', 'email', 'tel', 'number', 'date'].includes(fieldType)) && (
                      <input
                        type={fieldType}
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                        placeholder={field.placeholder}
                        className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow"
                      />
                    )}

                    {fieldType === 'textarea' && (
                      <textarea
                        value={value || ''}
                        onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                        placeholder={field.placeholder}
                        rows={field.rows || 3}
                        className="w-full px-3.5 py-2.5 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 hover:border-slate-300 dark:hover:border-slate-600 hover:shadow resize-none"
                      />
                    )}

                    {(fieldType === 'select' || fieldType === 'searchable-select') && field.options && (() => {
                      const useSearchable = fieldType === 'searchable-select' || field.options.length > 10;

                      if (useSearchable) {
                        return (
                          <SearchableSelect
                            value={editedData[fieldKey] || ''}
                            onChange={(newValue) => handleFieldChange(fieldKey, newValue)}
                            options={field.options}
                            placeholder={field.placeholder || "Rechercher..."}
                            disabled={false}
                            compact={false}
                          />
                        );
                      }

                      // ✅ MODERN/MINIMAL: Professional native select
                      return (
                        <div className="relative">
                          <select
                            value={editedData[fieldKey] || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            className="w-full px-3.5 py-2.5 pr-10 border border-slate-200 dark:border-slate-700 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all duration-200 appearance-none cursor-pointer hover:border-slate-300 dark:hover:border-slate-600 hover:shadow"
                          >
                            <option value="">Select...</option>
                            {field.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                          {/* Modern/Minimal: Clean chevron */}
                          <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                            <i className="fas fa-chevron-down text-slate-400 text-xs"></i>
                          </div>
                        </div>
                      );
                    })()}

                    {field.helpText && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                        {field.helpText}
                      </p>
                    )}
                  </div>
                );
              }

              // ✅ Support custom rendering for special fields
              if (field.customRender) {
                return (
                  <div key={fieldIndex} className="flex items-start gap-3">
                    {field.icon && (
                      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                        <i className={`${field.icon} text-slate-400 dark:text-slate-500`}></i>
                      </div>
                    )}
                    <div className="flex-1">
                      <p className="text-xs text-slate-500 dark:text-slate-400 mb-1">{field.label}</p>
                      {field.customRender(data, contextData)}
                    </div>
                  </div>
                );
              }

              return (
                <div key={fieldIndex} className="flex items-center gap-3">
                  {field.icon && (
                    <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center">
                      <i className={`${field.icon} text-slate-400 dark:text-slate-500`}></i>
                    </div>
                  )}
                  <div className="flex-1">
                    <p className="text-xs text-slate-500 dark:text-slate-400">{field.label}</p>
                    <p className="text-sm text-slate-900 dark:text-white font-medium">
                      {field.displayValue ? (typeof field.displayValue === 'function' ? field.displayValue(data, contextData) : field.displayValue) : value || <span className="text-slate-400 dark:text-slate-600">N/A</span>}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </ContentSection>
  );
}
