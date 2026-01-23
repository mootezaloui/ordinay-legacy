import { useState, useEffect } from "react";
import SearchableSelect from "./SearchableSelect";
import InlineStatusSelector from "../InlineSelectors/InlineStatusSelector";
import InlinePrioritySelector from "../InlineSelectors/InlinePrioritySelector";
import LoadingScreen from "../loading/LoadingScreen";
import { useNotifications } from "../../contexts/NotificationContext";
import BlockerModal from "../ui/BlockerModal";
import ConfirmImpactModal from "../ui/ConfirmImpactModal";
import ClientNotificationPrompt from "../ui/ClientNotificationPrompt";
import { canPerformAction } from "../../services/domainRules";
import ReadOnlyField from "./ReadOnlyField";
import {
  generateEntityReference,
  isReferenceUnique,
  getDuplicateReferenceError,
  normalizeReference,
  isReferenceFormatValid,
  getReferenceFormat,
} from "../../utils/referenceUtils";
import {
  shouldPromptClientNotification,
  sendClientNotification,
  setPendingNotification,
} from "../../services/clientCommunication";
import { useTranslation } from "react-i18next";
import { useSettings } from "../../contexts/SettingsContext";
import useBodyScrollLock from "../../hooks/useBodyScrollLock";
import { formatCurrency } from "../../utils/currency";

const interpolateCurrency = (value, currency) => {
  if (typeof value !== "string") return value;
  return value.replaceAll("{{currency}}", currency || "");
};

/**
 * FormModal - Enhanced with improved responsive design and domain rule validation
 * ✅ Adaptive width based on screen size
 * ✅ Better spacing to minimize scrolling
 * ✅ Compact layout options
 * ✅ Smart grid layout based on field count
 * ✅ DOMAIN RULE VALIDATION - Enforces business rules and prevents integrity violations
 * ✅ RELATIONAL-IMPACT CONFIRMATIONS - Requires user confirmation for structural changes
 *
 * CRITICAL SECURITY:
 * - Pass entityType, entityId, and editingEntity props for EDIT mode validation
 * - FormModal will automatically validate edits through canPerformAction()
 * - Blocked actions show BlockerModal with clear explanations
 * - Relational changes show ConfirmImpactModal requiring explicit confirmation
 */
export default function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  subtitle,
  fields = [],
  initialData = null,
  submitText = "Enregistrer",
  cancelText = "Annuler",
  isLoading = false,
  // ✅ Optional external formData control
  formData: externalFormData,
  onFormDataChange: externalOnFormDataChange,
  // ✅ NEW: Layout options
  size = "auto", // 'sm' | 'md' | 'lg' | 'xl' | 'auto'
  compact = false, // Compact spacing
  // ✅ NEW: Domain rule validation (CRITICAL for integrity)
  entityType = null, // Entity type for validation (e.g., 'dossier', 'lawsuit', 'task')
  entityId = null, // Entity ID for edit mode validation
  editingEntity = null, // Current entity data for edit mode
  entities = null, // Entities data for domain rule validation { clients, dossiers, lawsuits, etc. }
}) {
  const [internalFormData, setInternalFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [initialized, setInitialized] = useState(false);
  const { notify } = useNotifications();
  const { t } = useTranslation(["common", "domain"]);
  const { formatCurrency, currency } = useSettings();
  useBodyScrollLock(isOpen);

  // ✅ Domain rule validation state
  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingFormData, setPendingFormData] = useState(null);

  // 📧 Client Notification State
  const [notificationPrompt, setNotificationPrompt] = useState({
    isOpen: false,
    eventType: null,
    eventData: null,
  });

  // Use external formData if provided, otherwise use internal
  const formData = externalFormData !== undefined ? externalFormData : internalFormData;
  const setFormData = externalOnFormDataChange || setInternalFormData;

  // ✅ Determine optimal modal size
  const getModalSize = () => {
    if (size !== "auto") {
      const sizeClasses = {
        sm: "max-w-md",
        md: "max-w-2xl",
        lg: "max-w-4xl",
        xl: "max-w-6xl",
      };
      return sizeClasses[size] || "max-w-2xl";
    }

    // Auto-size based on field count and types
    const fieldCount = fields.length;
    const hasTextarea = fields.some(f => f.type === "textarea");
    const hasFullWidth = fields.some(f => f.fullWidth);

    if (fieldCount <= 4 && !hasTextarea) return "max-w-md";
    if (fieldCount <= 8) return "max-w-2xl";
    if (fieldCount <= 12) return "max-w-4xl";
    return "max-w-5xl";
  };

  // ✅ Determine optimal column layout
  const getColumnLayout = () => {
    const fieldCount = fields.filter(f => !f.fullWidth).length;

    // For screens >= 1280px (xl), use 3 columns if we have many fields
    if (fieldCount > 12) return "xl:grid-cols-3";
    return ""; // Default 2 columns on md+
  };

  // Initialize form data only once when modal opens
  useEffect(() => {
    if (isOpen && !initialized) {
      // Build defaults from field.defaultValue
      const defaults = {};
      fields.forEach((field) => {
        defaults[field.name] = field.defaultValue || "";
      });

      // If using external formData and it already has values, keep them
      if (externalFormData !== undefined && Object.keys(externalFormData).length > 0) {
        setInitialized(true);
        return;
      }

      // Merge defaults with initialData (so defaults still apply when we pass prefill context)
      const mergedInitial = initialData ? { ...defaults, ...initialData } : defaults;
      setFormData(mergedInitial);
      setInitialized(true);
    }

    // Reset initialized flag when modal closes
    if (!isOpen && initialized) {
      setInitialized(false);
    }
  }, [isOpen, initialized]);

  // Reset errors on close
  useEffect(() => {
    if (!isOpen) {
      setErrors({});
      if (!externalOnFormDataChange) {
        setInternalFormData({});
      }
    }
  }, [isOpen, externalOnFormDataChange]);

  const handleChange = (name, value) => {
    const newFormData = {
      ...formData,
      [name]: value,
    };
    setFormData(newFormData);

    // Clear error for this field
    if (errors[name]) {
      setErrors((prev) => ({
        ...prev,
        [name]: null,
      }));
    }

    // Call field's onChange if it exists
    const field = fields.find(f => f.name === name);
    if (field?.onChange) {
      field.onChange(value, newFormData, setFormData, field.allOptions);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Check if this form has a linkType field (session form specific)
    const hasLinkTypeField = fields.some(f => f.name === "linkType");

    fields.forEach((field) => {
      // Skip validation for conditionally hidden fields
      if (field.hideIf && typeof field.hideIf === 'function' && field.hideIf(formData)) {
        return;
      }
      if (hasLinkTypeField && field.name === "lawsuitId" && formData.linkType !== "lawsuit") {
        return;
      }
      if (hasLinkTypeField && field.name === "dossierId" && formData.linkType !== "dossier") {
        return;
      }

      // Make lawsuitId/dossierId required based on linkType
      const isConditionallyRequired = hasLinkTypeField && (
        (field.name === "lawsuitId" && formData.linkType === "lawsuit") ||
        (field.name === "dossierId" && formData.linkType === "dossier")
      );

      if ((field.required || isConditionallyRequired) && !formData[field.name]) {
        newErrors[field.name] = `${resolveCurrencyString(field.label)} est requis`;
      }

      // Custom validation
      if (field.validate) {
        const error = field.validate(formData[field.name], formData);
        if (error) {
          newErrors[field.name] = error;
        }
      }
    });

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    // Step 1: Field validation (required fields, custom validators)
    if (!validateForm()) {
      notify.warning({
        title: t("dialog.form.validation.required.title", { ns: "common" }),
        message: t("dialog.form.validation.required.message", { ns: "common" }),
        context: "form",
      });
      return;
    }

    // Step 1.5: Reference validation & auto-generation (CRITICAL - ensures uniqueness)
    const referenceFieldMapping = {
      dossier: "lawsuitNumber",
      lawsuit: "lawsuitNumber",
      mission: "missionNumber",
    };

    if (entityType && referenceFieldMapping[entityType]) {
      const referenceField = referenceFieldMapping[entityType];
      let reference = formData[referenceField];

      // Auto-generate if empty
      if (!reference || reference.trim() === "") {
        reference = generateEntityReference(entityType, entities);
        formData[referenceField] = reference;
        console.log(`✅ Auto-generated reference for ${entityType}:`, reference);
      } else {
        // Normalize user input (uppercase + trim)
        reference = normalizeReference(reference, entityType);
        formData[referenceField] = reference;

        // Validate format after normalization
        const formatMeta = getReferenceFormat(entityType);
        const usesStandardPrefix = formatMeta?.prefix
          ? reference.startsWith(`${formatMeta.prefix}-`)
          : false;
        const isValidFormat = isReferenceFormatValid(entityType, reference, {
          allowCustomPrefix: true,
        });

        if (!isValidFormat) {
          const standardExample = formatMeta?.example || "REF-2025-001";
          const standardFormat = formatMeta?.format || "PREFIX-YYYY-XXX";
          const errorMessage = usesStandardPrefix
            ? `Invalid format. Expected: ${standardFormat} (e.g., ${standardExample})`
            : `Invalid reference. Use your own format (letters/numbers/separators) or the standard ${standardFormat} (e.g., ${standardExample}).`;

          notify.error({
            title: "Invalid Reference Format",
            message: errorMessage,
            context: "form",
          });

          // Set error on the field
          setErrors({
            ...errors,
            [referenceField]: errorMessage,
          });

          return;
        }
      }

      // Validate uniqueness (excluding current entity in edit mode)
      const isUnique = isReferenceUnique(entityType, reference, entityId, entities);

      if (!isUnique) {
        const errorMessage = getDuplicateReferenceError(entityType, reference);

        notify.error({
          title: "Reference already used",
          message: errorMessage,
          context: "form",
        });

        // Set error on the field
        setErrors({
          ...errors,
          [referenceField]: errorMessage,
        });

        return;
      }
    }

    // Step 2: Domain rule validation (CRITICAL - prevents integrity violations)
    if (entityType) {
      const isEditMode = editingEntity && entityId;
      const action = isEditMode ? 'edit' : 'add';
      const context = isEditMode
        ? { data: editingEntity, newData: formData, entities }
        : { data: formData, newData: formData, entities };

      const result = canPerformAction(entityType, isEditMode ? entityId : null, action, context);

      if (!result.allowed) {
        // BLOCKED: Show blocker modal
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }

      // Phase 2.5: Check for relational-impact changes
      if (result.requiresConfirmation) {
        // REQUIRES CONFIRMATION: Show impact modal
        setValidationResult(result);
        setPendingFormData(formData);
        setConfirmImpactModalOpen(true);
        return;
      }
    }

    // Step 3: Proceed with submission
    handleSuccessfulSubmission(formData);
  };

  // Handle confirmed relational-impact changes
  const handleConfirmImpact = () => {
    setConfirmImpactModalOpen(false);
    handleSuccessfulSubmission(pendingFormData);
    setPendingFormData(null);
  };

  /**
   * 📧 Handle successful form submission + client notification check
   */
  const handleSuccessfulSubmission = (submittedFormData) => {
    // First, call the parent's onSubmit
    onSubmit(submittedFormData);

    // Then check if client notification should be prompted
    // Only for EDIT mode (entityId exists) or CREATE mode for specific entities
    const isEditMode = entityId && editingEntity;
    const isCreateMode = !entityId;

    if (entityType && (isEditMode || isCreateMode)) {
      const action = isEditMode ? 'edit' : 'create';
      const context = isEditMode
        ? { data: editingEntity, newData: submittedFormData }
        : { data: submittedFormData };

      const notificationCheck = shouldPromptClientNotification(
        entityType,
        action,
        context,
        entities
      );

      if (notificationCheck?.shouldPrompt) {
        // For creates (which may navigate immediately), defer the prompt to the destination by stashing it
        if (action === 'create') {
          setPendingNotification(notificationCheck);
          onClose();
          return;
        }
        // For edits, show prompt immediately
        setNotificationPrompt({
          isOpen: true,
          eventType: notificationCheck.eventType,
          eventData: notificationCheck.eventData,
        });
        return; // Don't close modal yet
      }
    }

    // No notification needed, close modal
    onClose();
  };

  /**
   * 📧 Handle sending client notification
   */
  const handleSendNotification = async () => {
    const { eventType, eventData } = notificationPrompt;

    try {
      const result = await sendClientNotification(eventType, eventData, {
        channels: ['email'], // MVP: email only
      });

      if (result.success) {
        console.log('✅ Client notification sent successfully');
      } else {
        console.error('❌ Failed to send client notification');
      }
    } catch (error) {
      console.error('Error sending client notification:', error);
    }

    setPendingNotification(null); // clear any stashed notification
    // Close prompt and modal
    setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
    onClose();
  };

  /**
   * 📧 Handle closing notification prompt without sending
   */
  const handleCloseNotificationPrompt = () => {
    console.log('ℹ️ User chose not to notify client');
    setPendingNotification(null); // clear any stashed notification
    setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
    onClose();
  };

  if (!isOpen) return null;

  const modalSizeClass = getModalSize();
  const columnLayoutClass = getColumnLayout();
  const spacingClass = compact ? "gap-3" : "gap-5";
  const paddingClass = compact ? "p-4" : "p-6";
  const resolveCurrencyString = (value) => interpolateCurrency(value, currency);

  return (
    <div
      className="fixed inset-0 z-50 overflow-hidden animate-in fade-in duration-300"
      style={{
        paddingTop: 'var(--titlebar-height, 0px)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-800/40 to-slate-900/50 dark:from-black/60 dark:via-slate-900/50 dark:to-black/60"
        onClick={onClose}
      />

      {/* Modal - Optimized positioning */}
      <div className="relative flex h-full items-center justify-center p-4 sm:p-6 overflow-hidden">
        <div
          className={`relative w-full ${modalSizeClass} bg-white dark:bg-slate-900 rounded-2xl transform transition-all flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden`}
          style={{
            maxHeight: 'calc(100vh - var(--titlebar-height, 0px) - 48px)',
            boxShadow: '0 0 0 1px rgba(148, 163, 184, 0.1), 0 24px 48px -12px rgba(0, 0, 0, 0.25), 0 12px 24px -8px rgba(0, 0, 0, 0.15)',
          }}
        >
          {/* Top accent line */}
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent z-10" />

          {/* Header - Fixed */}
          <div className={`${compact ? 'px-5 py-4' : 'px-6 py-5'} border-b border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50`}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-slate-900 dark:text-white truncate`}>
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all flex-shrink-0 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
                title={t("actions.close", { ns: "common" })}
              >
                <i className="fas fa-times"></i>
              </button>
            </div>
          </div>

          {/* Form - Scrollable */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className={`${paddingClass} overflow-y-auto overscroll-contain flex-1`}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${columnLayoutClass} ${spacingClass}`}>
                {fields.map((field) => {
                  // ✅ Check hideIf function for conditional visibility
                  if (field.hideIf && typeof field.hideIf === 'function' && field.hideIf(formData)) {
                    return null;
                  }

                  // Legacy: Conditional visibility for session form fields
                  const hasLinkTypeField = fields.some(f => f.name === "linkType");

                  if (hasLinkTypeField && field.name === "lawsuitId" && formData.linkType !== "lawsuit") {
                    return null;
                  }
                  if (hasLinkTypeField && field.name === "dossierId" && formData.linkType !== "dossier") {
                    return null;
                  }

                  // ✅ Smart column spanning
                  let colSpanClass = "";
                  if (field.fullWidth) {
                    colSpanClass = "md:col-span-2";
                    if (columnLayoutClass) colSpanClass += " xl:col-span-3";
                  }

                  return (
                    <div
                      key={field.name}
                      className={colSpanClass}
                    >
                      <FormField
                        field={field}
                        value={formData[field.name] || ""}
                        onChange={handleChange}
                        error={errors[field.name]}
                        formData={formData}
                        compact={compact}
                        entityType={entityType}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions - Fixed at bottom */}
            <div className={`${compact ? 'px-5 py-4' : 'px-6 py-5'} border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50`}>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className={`${compact ? 'px-4 py-2 text-sm' : 'px-5 py-2.5'} border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 hover:border-slate-300 dark:hover:border-slate-600 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-all disabled:opacity-50`}
                >
                  {cancelText}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`${compact ? 'px-4 py-2 text-sm' : 'px-5 py-2.5'} bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center gap-2 justify-center min-w-[140px] shadow-lg shadow-blue-500/25`}
                >
                  {isLoading ? (
                    <LoadingScreen variant="minimal" message="" />
                  ) : (
                    <>
                      <i className="fas fa-save"></i>
                      {submitText}
                    </>
                  )}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Domain Rule Validation Modals */}
      <BlockerModal
        isOpen={blockerModalOpen}
        onClose={() => setBlockerModalOpen(false)}
        actionName={
          editingEntity
            ? t("actions.edit", { ns: "common" })
            : t("actions.save", { ns: "common" })
        }
        blockers={validationResult?.blockers || []}
        warnings={validationResult?.warnings || []}
        entityName={editingEntity?.title || editingEntity?.name || editingEntity?.lawsuitNumber || ""}
      />

      <ConfirmImpactModal
        isOpen={confirmImpactModalOpen}
        onClose={() => {
          setConfirmImpactModalOpen(false);
          setPendingFormData(null);
        }}
        onConfirm={handleConfirmImpact}
        actionName={t("impact.actions.changeLink", { ns: "domain" })}
        impactSummary={validationResult?.impactSummary || []}
        entityName={editingEntity?.title || editingEntity?.name || editingEntity?.lawsuitNumber || ""}
      />

      {/* 📧 Client Notification Prompt */}
      <ClientNotificationPrompt
        isOpen={notificationPrompt.isOpen}
        onClose={handleCloseNotificationPrompt}
        onConfirm={handleSendNotification}
        eventType={notificationPrompt.eventType}
        eventData={notificationPrompt.eventData}
      />
    </div>
  );
}

/**
 * FormField - Compact & responsive design
 */
function FormField({ field, value, onChange, error, formData, compact = false, entityType = null }) {
  const { t } = useTranslation(["common", "domain"]);
  const { currency } = useSettings();
  const resolvedLabel = interpolateCurrency(field.label, currency);
  const resolvedPlaceholder = interpolateCurrency(field.placeholder, currency);
  const resolvedHelpText = interpolateCurrency(field.helpText, currency);
  const resolvedCheckboxLabel = interpolateCurrency(field.checkboxLabel, currency);
  const baseInputClass = `w-full ${compact ? 'px-3 py-1.5 text-sm' : 'px-3.5 py-2.5'} border-2 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 ${error
    ? "border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-red-500/30"
    : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500 hover:shadow-md"
    }`;
  const isReadOnly = field.type === "readonly" || field.disabled;

  const resolveDisplayValue = () => {
    if (field.displayValue) {
      return typeof field.displayValue === "function"
        ? field.displayValue(formData, value)
        : field.displayValue;
    }

    if (field.formatValue) {
      return field.formatValue(value, formData);
    }

    const options = field.getOptions
      ? field.getOptions(formData, field.allOptions)
      : field.options;

    if (options && options.length) {
      const findLabel = (val) => {
        const match = options.find((opt) => `${opt.value}` === `${val}`);
        return match ? match.label : val;
      };

      if (Array.isArray(value)) {
        return value.map((v) => findLabel(v)).filter(Boolean).join(", ");
      }

      const optionLabel = findLabel(value);
      if (optionLabel !== undefined && optionLabel !== null) {
        return optionLabel;
      }
    }

    if (Array.isArray(value)) {
      return value.filter((v) => v !== undefined && v !== null && v !== "").join(", ");
    }

    if (typeof value === "boolean") {
      return value ? "Yes" : "No";
    }

    return value;
  };

  const renderInput = () => {
    if (isReadOnly) {
      const displayValue = resolveDisplayValue();
      return (
        <ReadOnlyField
          label={resolvedLabel}
          value={displayValue}
          hint={resolvedHelpText}
          icon={field.icon}
          compact={compact}
          placeholder={resolvedPlaceholder || t("form.placeholder.notProvided", { ns: "common" })}
        />
      );
    }

    switch (field.type) {
      case "text":
      case "email":
      case "tel":
      case "number":
      case "date":
      case "time":
        return (
          <input
            type={field.type}
            id={field.name}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={resolvedPlaceholder}
            required={field.required}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );

      case "textarea":
        return (
          <textarea
            id={field.name}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={resolvedPlaceholder}
            required={field.required}
            disabled={field.disabled}
            rows={field.rows || (compact ? 2 : 3)}
            className={baseInputClass}
          />
        );

      case "select":
        // Compute options from getOptions function if it exists, otherwise use static options
        const fieldOptions = field.getOptions
          ? field.getOptions(formData)
          : (field.options || []);

        // Use SearchableSelect for dropdowns with many options (>10)
        const useSearchable = fieldOptions && fieldOptions.length > 2;

        if (useSearchable) {
          return (
            <SearchableSelect
              value={value}
              onChange={(newValue) => onChange(field.name, newValue)}
              options={fieldOptions}
              placeholder={resolvedPlaceholder || t("form.select.default")}
              disabled={field.disabled}
              error={error}
              compact={compact}
            />
          );
        }

        // ✅ MODERN/MINIMAL: Professional native select
        return (
          <div className="relative">
            <select
              id={field.name}
              value={value}
              onChange={(e) => onChange(field.name, e.target.value)}
              required={field.required}
              disabled={field.disabled}
              className={`${baseInputClass} appearance-none cursor-pointer pr-10 ${field.disabled ? 'bg-slate-50 dark:bg-slate-800 opacity-50' : ''}`}
            >
              <option value="">{resolvedPlaceholder || t("form.select.default")}</option>
              {fieldOptions?.map((option) => (
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

      case "searchable-select":
        // Compute options from getOptions function if it exists, otherwise use static options
        const searchableOptions = field.getOptions
          ? field.getOptions(formData, field.allOptions)
          : (field.options || []);

        // Handle create option callback
        const handleCreateOption = async (newOptionName) => {
          if (field.onCreateOption) {
            try {
              await field.onCreateOption(newOptionName);
              // Refresh the form to show the new option
              const updatedOptions = field.getOptions
                ? field.getOptions(formData, field.allOptions)
                : (field.options || []);
              // Auto-select the newly created option
              onChange(field.name, newOptionName);
            } catch (error) {
              console.error('Failed to create option:', error);
            }
          }
        };

        return (
          <SearchableSelect
            value={value}
            onChange={(newValue) => onChange(field.name, newValue)}
            options={searchableOptions}
            placeholder={resolvedPlaceholder || t("form.select.searching")}
            disabled={field.disabled}
            error={error}
            compact={compact}
            allowCreate={field.allowCreate || false}
            onCreateOption={handleCreateOption}
            createLabel={field.createLabel || "Add"}
            placement={field.placement || "bottom"}
          />
        );

      case "checkbox":
        return (
          <div className="flex items-center">
            <input
              type="checkbox"
              id={field.name}
              checked={value}
              onChange={(e) => onChange(field.name, e.target.checked)}
              disabled={field.disabled}
              className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-600 rounded focus:ring-blue-500"
            />
            <label
              htmlFor={field.name}
              className={`ml-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-700 dark:text-slate-300`}
            >
              {resolvedCheckboxLabel || resolvedLabel}
            </label>
          </div>
        );

      case "radio":
        return (
          <div className={compact ? "space-y-1" : "space-y-2"}>
            {field.options?.map((option) => (
              <div key={option.value} className="flex items-center">
                <input
                  type="radio"
                  id={`${field.name}-${option.value}`}
                  name={field.name}
                  value={option.value}
                  checked={value === option.value}
                  onChange={(e) => onChange(field.name, e.target.value)}
                  disabled={field.disabled}
                  className="w-4 h-4 text-blue-600 border-slate-300 dark:border-slate-600 focus:ring-blue-500"
                />
                <label
                  htmlFor={`${field.name}-${option.value}`}
                  className={`ml-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-700 dark:text-slate-300`}
                >
                  {option.label}
                </label>
              </div>
            ))}
          </div>
        );

      case "inline-status":
        return (
          <InlineStatusSelector
            value={value}
            onChange={(newValue) => onChange(field.name, newValue)}
            statusOptions={field.statusOptions || field.options}
          />
        );

      case "inline-priority":
        return (
          <InlinePrioritySelector
            value={value}
            onChange={(newValue) => onChange(field.name, newValue)}
            entityType={entityType}
          />
        );

      case "file":
        const selectedFiles = value ? (Array.isArray(value) ? value : [value]) : [];
        const isMultiple = field.multiple;

        const handleFileChange = (e) => {
          const files = Array.from(e.target.files || []);
          if (files.length > 0) {
            onChange(field.name, isMultiple ? files : files[0]);
          }
        };

        const handleFileDrop = (e) => {
          e.preventDefault();
          e.stopPropagation();
          const files = Array.from(e.dataTransfer?.files || []);
          if (files.length > 0) {
            onChange(field.name, isMultiple ? files : files[0]);
          }
        };

        const removeFile = (index) => {
          if (isMultiple) {
            const newFiles = selectedFiles.filter((_, i) => i !== index);
            onChange(field.name, newFiles.length > 0 ? newFiles : null);
          } else {
            onChange(field.name, null);
          }
        };

        return (
          <div className="space-y-3">
            {/* Drag & Drop Upload Zone */}
            <div
              onDragEnter={(e) => e.preventDefault()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleFileDrop}
              className="border-2 border-dashed border-slate-300 dark:border-slate-600 hover:border-blue-400 dark:hover:border-blue-500 rounded-lg p-6 text-center transition-all"
            >
              <div className="flex items-center justify-center gap-4">
                <i className="fas fa-cloud-upload-alt text-slate-400 text-2xl"></i>
                <div className="text-left">
                  <p className="text-sm text-slate-700 dark:text-slate-300">
                    {t("form.upload.dropPrompt", { ns: "common" })}
                  </p>
                  <label className="text-sm text-blue-600 dark:text-blue-400 hover:underline cursor-pointer">
                    {t("form.upload.browse", { ns: "common" })}
                    <input
                      type="file"
                      id={field.name}
                      onChange={handleFileChange}
                      accept={field.accept}
                      multiple={isMultiple}
                      disabled={field.disabled}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>
              {field.accept && (
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-3">
                  {field.accept.split(',').map(ext => ext.replace('.', '').toUpperCase()).join(', ')}
                </p>
              )}
            </div>

            {/* Selected Files List */}
            {selectedFiles.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  {selectedFiles.length} file{selectedFiles.length > 1 ? 's' : ''} selected
                </p>
                {selectedFiles.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700"
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <i className="fas fa-file text-blue-600 dark:text-blue-400"></i>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                          {file.name || file}
                        </p>
                        {file.size && (
                          <p className="text-xs text-slate-500 dark:text-slate-400">
                            {(file.size / 1024).toFixed(1)} KB
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors flex-shrink-0"
                      title="Delete"
                    >
                      <i className="fas fa-times text-red-600 dark:text-red-400 text-sm"></i>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

      case "financial-entries":
        const entries = Array.isArray(value) ? value : [];

        const addEntry = () => {
          const newEntry = {
            id: Date.now(),
            amount: "",
            date: new Date().toISOString().split("T")[0],
            description: "",
            status: "confirmed"
          };
          onChange(field.name, [...entries, newEntry]);
        };

        const removeEntry = (entryId) => {
          onChange(field.name, entries.filter(e => e.id !== entryId));
        };

        const updateEntry = (entryId, fieldName, fieldValue) => {
          onChange(
            field.name,
            entries.map(e => e.id === entryId ? { ...e, [fieldName]: fieldValue } : e)
          );
        };

        // Calculate total
        const totalAmount = entries.reduce((sum, e) => sum + parseFloat(e.amount || 0), 0);

        return (
          <div className="space-y-4">
            {/* Header with summary */}
            <div className="flex items-center justify-between p-3 bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-900/20 dark:to-orange-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-amber-600 dark:bg-amber-700 flex items-center justify-center">
                  <i className="fas fa-coins text-white"></i>
                </div>
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">
                    Bailiff Fees
                  </p>
                  <p className="text-xs text-slate-600 dark:text-slate-400">
                    {entries.length} {entries.length === 1 ? 'entry' : 'entries'} • Total: {formatCurrency(totalAmount)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={addEntry}
                className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 dark:bg-amber-700 dark:hover:bg-amber-600 text-white rounded-lg font-medium transition-colors text-sm inline-flex items-center gap-2 shadow-sm"
              >
                <i className="fas fa-plus text-xs"></i>
                Add
              </button>
            </div>

            {/* Entries list */}
            {entries.length > 0 ? (
              <div className="space-y-3 max-h-96 overflow-y-auto pr-1">
                {entries.map((entry, index) => (
                  <div
                    key={entry.id}
                    className="relative p-4 bg-white dark:bg-slate-800 rounded-lg border-2 border-slate-200 dark:border-slate-700 hover:border-amber-300 dark:hover:border-amber-700 transition-colors shadow-sm"
                  >
                    {/* Entry header */}
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                          <span className="text-xs font-bold text-amber-700 dark:text-amber-400">
                            #{index + 1}
                          </span>
                        </div>
                        <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
                          Frais {index + 1}
                        </h4>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${entry.status === 'paid'
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : entry.status === 'confirmed'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-300'
                          }`}>
                          {entry.status === 'paid' ? 'Paid' : entry.status === 'confirmed' ? 'Confirmed' : 'Draft'}
                        </span>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeEntry(entry.id)}
                        className="p-1.5 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete this fee"
                      >
                        <i className="fas fa-trash text-red-600 dark:text-red-400 text-sm"></i>
                      </button>
                    </div>

                    {/* Entry fields */}
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            <i className="fas fa-money-bill-wave mr-1 text-green-600 dark:text-green-400"></i>
                            Amount ({currency}) *
                          </label>
                          <input
                            type="number"
                            value={entry.amount}
                            onChange={(e) => updateEntry(entry.id, "amount", e.target.value)}
                            placeholder="0.00"
                            min="0"
                            step="0.01"
                            className="w-full px-3 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-amber-500 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-900/50 outline-none transition-colors text-sm font-semibold"
                            required
                          />
                        </div>

                        <div>
                          <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                            <i className="fas fa-calendar mr-1 text-blue-600 dark:text-blue-400"></i>
                            Date *
                          </label>
                          <input
                            type="date"
                            value={entry.date}
                            onChange={(e) => updateEntry(entry.id, "date", e.target.value)}
                            className="w-full px-3 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-amber-500 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-900/50 outline-none transition-colors text-sm"
                            required
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          <i className="fas fa-flag mr-1 text-purple-600 dark:text-purple-400"></i>
                          Status *
                        </label>
                        <InlineStatusSelector
                          value={entry.status}
                          onChange={(newValue) => updateEntry(entry.id, "status", newValue)}
                          statusOptions={[
                            { value: "draft", label: "Draft", color: "slate" },
                            { value: "confirmed", label: "Confirmed", color: "blue" },
                            { value: "paid", label: "Paid", color: "green" }
                          ]}
                          entityType="financialEntry"
                          size="sm"
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5">
                          <i className="fas fa-align-left mr-1 text-slate-600 dark:text-slate-400"></i>
                          Description *
                        </label>
                        <textarea
                          value={entry.description}
                          onChange={(e) => updateEntry(entry.id, "description", e.target.value)}
                          placeholder="Ex: Service fees, travel expenses..."
                          rows={2}
                          className="w-full px-3 py-2 border-2 border-slate-200 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:border-amber-500 dark:focus:border-amber-500 focus:ring-2 focus:ring-amber-200 dark:focus:ring-amber-900/50 outline-none transition-colors text-sm resize-none"
                          required
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700">
                <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                  <i className="fas fa-coins text-2xl text-amber-600 dark:text-amber-400"></i>
                </div>
                <p className="text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">
                  No fees added yet.
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-500">
                  Click "Add" to save the fees for this mission
                </p>
              </div>
            )}
          </div>
        );

      case "readonly":
        const displayText = typeof field.displayValue === 'function'
          ? field.displayValue(formData, value)
          : (field.displayValue || value || "-");
        return (
          <div className={`px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg ${compact ? 'text-xs' : 'text-sm'} text-slate-900 dark:text-white font-medium`}>
            {displayText}
          </div>
        );

      default:
        return (
          <input
            type="text"
            id={field.name}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={resolvedPlaceholder}
            required={field.required}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );
    }
  };

  // Determine if field is conditionally required
  const hasLinkType = "linkType" in formData;
  const isConditionallyRequired = hasLinkType && (
    (field.name === "lawsuitId" && formData.linkType === "lawsuit") ||
    (field.name === "dossierId" && formData.linkType === "dossier")
  );

  return (
    <div>
      {!isReadOnly && field.type !== "checkbox" && field.type !== "financial-entries" && (
        <label
          htmlFor={field.name}
          className={`block font-semibold text-slate-700 dark:text-slate-200 ${compact ? 'text-xs mb-2' : 'text-sm mb-2.5'}`}
        >
          {resolvedLabel}
          {(field.required || isConditionallyRequired) && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {field.type === "financial-entries" && (
        <div className={compact ? 'mb-2' : 'mb-3'}>
          <label className={`block font-semibold text-slate-700 dark:text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
            {resolvedLabel}
          </label>
        </div>
      )}
      {renderInput()}
      {!isReadOnly && error && (
        <p className={`${compact ? 'mt-1.5 text-xs' : 'mt-2 text-sm'} text-red-600 dark:text-red-400 font-medium`}>
          <i className="fas fa-exclamation-circle mr-1"></i>
          {error}
        </p>
      )}
      {!isReadOnly && resolvedHelpText && !error && (
        <p className={`${compact ? 'mt-1 text-xs' : 'mt-2 text-xs'} text-slate-500 dark:text-slate-400`}>
          {resolvedHelpText}
        </p>
      )}
    </div>
  );
}




