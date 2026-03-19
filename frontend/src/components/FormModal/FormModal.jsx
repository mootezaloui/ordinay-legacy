import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
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
import {
  PLACEHOLDER_CONTEXT,
  resolveContextualPlaceholder,
} from "../../utils/fieldPlaceholders";

const interpolateCurrency = (value, currency) => {
  if (typeof value !== "string") return value;
  return value.replaceAll("{{currency}}", currency || "");
};

/**
 * FormModal - Enhanced with improved responsive design and domain rule validation
 */
export default function FormModal({
  isOpen,
  onClose,
  onSubmit,
  title,
  subtitle,
  fields = [],
  initialData = null,
  submitText = null,
  cancelText = null,
  isLoading = false,
  formData: externalFormData,
  onFormDataChange: externalOnFormDataChange,
  size = "auto",
  compact = false,
  entityType = null,
  entityId = null,
  editingEntity = null,
  entities = null,
}) {
  const [internalFormData, setInternalFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [initialized, setInitialized] = useState(false);
  const { notify } = useNotifications();
  const { t } = useTranslation(["common", "domain"]);
  const { formatCurrency, currencyDisplay, notificationPrefs } = useSettings();
  useBodyScrollLock(isOpen);

  const [blockerModalOpen, setBlockerModalOpen] = useState(false);
  const [confirmImpactModalOpen, setConfirmImpactModalOpen] = useState(false);
  const [validationResult, setValidationResult] = useState(null);
  const [pendingFormData, setPendingFormData] = useState(null);

  const [notificationPrompt, setNotificationPrompt] = useState({
    isOpen: false,
    eventType: null,
    eventData: null,
  });

  const formData = externalFormData !== undefined ? externalFormData : internalFormData;
  const setFormData = externalOnFormDataChange || setInternalFormData;

  const getModalSize = () => {
    if (size !== "auto") {
      const sizeClasses = {
        sm: "md:max-w-md",
        md: "md:max-w-2xl",
        lg: "md:max-w-4xl",
        xl: "md:max-w-6xl",
      };
      return sizeClasses[size] || "md:max-w-2xl";
    }
    const fieldCount = fields.length;
    const hasTextarea = fields.some(f => f.type === "textarea");
    if (fieldCount <= 4 && !hasTextarea) return "md:max-w-md";
    if (fieldCount <= 8) return "md:max-w-2xl";
    if (fieldCount <= 12) return "md:max-w-4xl";
    return "md:max-w-5xl";
  };

  const getColumnLayout = () => {
    const fieldCount = fields.filter(f => !f.fullWidth).length;
    if (fieldCount > 12) return "xl:grid-cols-3";
    return "";
  };

  useEffect(() => {
    if (isOpen && !initialized) {
      const defaults = {};
      fields.forEach((field) => {
        defaults[field.name] = field.defaultValue || "";
      });
      if (externalFormData !== undefined && Object.keys(externalFormData).length > 0) {
        setInitialized(true);
        return;
      }
      const mergedInitial = initialData ? { ...defaults, ...initialData } : defaults;
      setFormData(mergedInitial);
      setInitialized(true);
    }
    if (!isOpen && initialized) {
      setInitialized(false);
    }
  }, [isOpen, initialized]);

  useEffect(() => {
    if (!isOpen) {
      setErrors({});
      if (!externalOnFormDataChange) {
        setInternalFormData({});
      }
    }
  }, [isOpen, externalOnFormDataChange]);

  const handleChange = (name, value) => {
    const newFormData = { ...formData, [name]: value };
    setFormData(newFormData);
    if (errors[name]) {
      setErrors((prev) => ({ ...prev, [name]: null }));
    }
    const field = fields.find(f => f.name === name);
    if (field?.onChange) {
      field.onChange(value, newFormData, setFormData, field.allOptions);
    }
  };

  const validateForm = () => {
    const newErrors = {};
    const hasLinkTypeField = fields.some(f => f.name === "linkType");
    fields.forEach((field) => {
      if (field.hideIf && typeof field.hideIf === 'function' && field.hideIf(formData)) return;
      if (hasLinkTypeField && field.name === "lawsuitId" && formData.linkType !== "lawsuit") return;
      if (hasLinkTypeField && field.name === "dossierId" && formData.linkType !== "dossier") return;
      const isConditionallyRequired = hasLinkTypeField && (
        (field.name === "lawsuitId" && formData.linkType === "lawsuit") ||
        (field.name === "dossierId" && formData.linkType === "dossier")
      );
      if ((field.required || isConditionallyRequired) && !formData[field.name]) {
        newErrors[field.name] = `${interpolateCurrency(field.label, currencyDisplay)} est requis`;
      }
      if (field.validate) {
        const error = field.validate(formData[field.name], formData);
        if (error) newErrors[field.name] = error;
      }
    });
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) {
      notify.warning({
        title: t("dialog.form.validation.required.title", { ns: "common" }),
        message: t("dialog.form.validation.required.message", { ns: "common" }),
        context: "form",
      });
      return;
    }
    const referenceFieldMapping = { dossier: "lawsuitNumber", lawsuit: "lawsuitNumber", mission: "missionNumber" };
    if (entityType && referenceFieldMapping[entityType]) {
      const referenceField = referenceFieldMapping[entityType];
      let reference = formData[referenceField];
      if (!reference || reference.trim() === "") {
        reference = generateEntityReference(entityType, entities);
        formData[referenceField] = reference;
      } else {
        reference = normalizeReference(reference, entityType);
        formData[referenceField] = reference;
        const formatMeta = getReferenceFormat(entityType);
        const isValidFormat = isReferenceFormatValid(entityType, reference, { allowCustomPrefix: true });
        if (!isValidFormat) {
          notify.error({ title: "Invalid Reference Format", message: "Invalid reference format", context: "form" });
          return;
        }
      }
      const isUnique = isReferenceUnique(entityType, reference, entityId, entities);
      if (!isUnique) {
        notify.error({ title: "Reference already used", message: getDuplicateReferenceError(entityType, reference), context: "form" });
        return;
      }
    }
    if (entityType) {
      const isEditMode = editingEntity && entityId;
      const result = canPerformAction(entityType, isEditMode ? entityId : null, isEditMode ? 'edit' : 'add', { data: editingEntity || formData, newData: formData, entities });
      if (!result.allowed) {
        setValidationResult(result);
        setBlockerModalOpen(true);
        return;
      }
      if (result.requiresConfirmation) {
        setValidationResult(result);
        setPendingFormData(formData);
        setConfirmImpactModalOpen(true);
        return;
      }
    }
    await handleSuccessfulSubmission(formData);
  };

  const handleSuccessfulSubmission = async (submittedFormData) => {
    try { await onSubmit(submittedFormData); } catch (error) { return; }
    const isEditMode = entityId && editingEntity;
    const isCreateMode = !entityId;
    if (entityType && (isEditMode || isCreateMode)) {
      const notificationCheck = shouldPromptClientNotification(entityType, isEditMode ? 'edit' : 'create', isEditMode ? { data: editingEntity, newData: submittedFormData } : { data: submittedFormData }, entities, notificationPrefs);
      if (notificationCheck?.shouldPrompt) {
        if (!isEditMode) { setPendingNotification(notificationCheck); onClose(); return; }
        setNotificationPrompt({ isOpen: true, eventType: notificationCheck.eventType, eventData: notificationCheck.eventData });
        return;
      }
    }
    onClose();
  };

  const handleConfirmImpact = () => {
    setConfirmImpactModalOpen(false);
    void handleSuccessfulSubmission(pendingFormData);
    setPendingFormData(null);
  };

  const handleSendNotification = async () => {
    const { eventType, eventData } = notificationPrompt;
    await sendClientNotification(eventType, eventData, { channels: ['email'] });
    setNotificationPrompt({ isOpen: false, eventType: null, eventData: null });
    onClose();
  };

  if (!isOpen) return null;

  const modalSizeClass = getModalSize();
  const columnLayoutClass = getColumnLayout();
  const spacingClass = compact ? "gap-3" : "gap-5";
  const paddingClass = compact ? "p-4" : "p-6";
  const submitLabel = submitText || t("actions.save", { ns: "common" });
  const cancelLabel = cancelText || t("actions.cancel", { ns: "common" });

  const modalContent = (
    <div
      className="fixed inset-0 z-[9999] overflow-hidden animate-in fade-in duration-300"
      style={{
        paddingTop: 'var(--titlebar-height, 0px)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
      }}
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900/50 via-slate-800/40 to-slate-900/50 dark:from-black/60 dark:via-slate-900/50 dark:to-black/60" onClick={onClose} />
      <div className="relative flex h-full items-stretch md:items-center justify-center p-0 md:p-6 overflow-hidden">
        <div className={`relative w-full h-full md:h-auto ${modalSizeClass} bg-white dark:bg-slate-900 rounded-none md:rounded-2xl transform transition-all flex flex-col animate-in zoom-in-95 slide-in-from-bottom-4 duration-300 overflow-hidden md:max-h-[calc(100vh-var(--titlebar-height)-48px)]`} style={{ boxShadow: '0 24px 48px -12px rgba(0, 0, 0, 0.25)' }}>
          <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-blue-500/50 to-transparent z-10" />
          <div className={`${compact ? 'px-5 py-4' : 'px-6 py-5'} border-b border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50`}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-slate-900 dark:text-white truncate`}>{title}</h2>
                {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5 truncate">{subtitle}</p>}
              </div>
              <button onClick={onClose} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-all text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"><i className="fas fa-times"></i></button>
            </div>
          </div>
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className={`${paddingClass} modal-scroll-stable overflow-y-auto overscroll-contain flex-1`}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${columnLayoutClass} ${spacingClass}`}>
                {fields.map((field) => {
                  if (field.hideIf && typeof field.hideIf === 'function' && field.hideIf(formData)) return null;
                  const hasLinkTypeField = fields.some(f => f.name === "linkType");
                  if (hasLinkTypeField && field.name === "lawsuitId" && formData.linkType !== "lawsuit") return null;
                  if (hasLinkTypeField && field.name === "dossierId" && formData.linkType !== "dossier") return null;
                  return (
                    <div key={field.name} className={field.fullWidth ? `md:col-span-2 ${columnLayoutClass ? "xl:col-span-3" : ""}` : ""}>
                      <FormField field={field} value={formData[field.name] || ""} onChange={handleChange} error={errors[field.name]} formData={formData} compact={compact} entityType={entityType} />
                    </div>
                  );
                })}
              </div>
            </div>
            <div className={`${compact ? 'px-5 py-4' : 'px-6 py-5'} border-t border-slate-200 dark:border-slate-800 flex-shrink-0 bg-slate-50/50 dark:bg-slate-800/50`}>
              <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-3">
                <button type="button" onClick={onClose} disabled={isLoading} className={`${compact ? 'px-4 py-2 text-sm' : 'px-5 py-2.5'} w-full sm:w-auto border-2 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl font-semibold transition-all disabled:opacity-50`}>{cancelLabel}</button>
                <button type="submit" disabled={isLoading} className={`${compact ? 'px-4 py-2 text-sm' : 'px-5 py-2.5'} w-full sm:w-auto bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600 text-white rounded-xl font-semibold transition-all disabled:opacity-50 flex items-center gap-2 justify-center sm:min-w-[140px] shadow-lg shadow-blue-500/25`}>
                  {isLoading ? <LoadingScreen variant="minimal" message="" /> : <><i className="fas fa-save" />{submitLabel}</>}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <BlockerModal isOpen={blockerModalOpen} onClose={() => setBlockerModalOpen(false)} actionName={editingEntity ? t("actions.edit", { ns: "common" }) : t("actions.save", { ns: "common" })} blockers={validationResult?.blockers || []} warnings={validationResult?.warnings || []} entityName={editingEntity?.title || editingEntity?.name || editingEntity?.lawsuitNumber || ""} />
      <ConfirmImpactModal isOpen={confirmImpactModalOpen} onClose={() => { setConfirmImpactModalOpen(false); setPendingFormData(null); }} onConfirm={handleConfirmImpact} actionName={t("impact.actions.changeLink", { ns: "domain" })} impactSummary={validationResult?.impactSummary || []} entityName={editingEntity?.title || editingEntity?.name || editingEntity?.lawsuitNumber || ""} />
      <ClientNotificationPrompt isOpen={notificationPrompt.isOpen} onClose={() => { setNotificationPrompt({ isOpen: false, eventType: null, eventData: null }); onClose(); }} onConfirm={handleSendNotification} eventType={notificationPrompt.eventType} eventData={notificationPrompt.eventData} />
    </div>
  );

  return createPortal(modalContent, document.body);
}

function FormField({ field, value, onChange, error, formData, compact = false, entityType = null }) {
  const { t } = useTranslation(["common", "domain", "missions"]);
  const { currencyDisplay } = useSettings();
  const resolvedLabel = interpolateCurrency(field.label, currencyDisplay);
  const resolvedPlaceholder = interpolateCurrency(field.placeholder, currencyDisplay);
  const baseInputClass = `w-full ${compact ? 'px-3 py-1.5 text-sm' : 'px-3.5 py-2.5'} border-2 rounded-lg shadow-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 transition-all duration-200 ${error ? "border-red-400 dark:border-red-500 focus:border-red-500 focus:ring-red-500/30" : "border-slate-300 dark:border-slate-600 hover:border-slate-400 dark:hover:border-slate-500"}`;
  const isReadOnly = field.type === "readonly" || field.disabled;

  const renderInput = () => {
    if (isReadOnly) return <ReadOnlyField label={resolvedLabel} value={field.displayValue ? (typeof field.displayValue === "function" ? field.displayValue(formData, value) : field.displayValue) : value} compact={compact} />;
    
    switch (field.type) {
      case "text":
      case "email":
      case "tel":
      case "number":
      case "date":
      case "time":
        return <input type={field.type} id={field.name} value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={resolvedPlaceholder} required={field.required} disabled={field.disabled} className={baseInputClass} />;
      case "textarea":
        return <textarea id={field.name} value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={resolvedPlaceholder} required={field.required} disabled={field.disabled} rows={field.rows || (compact ? 2 : 3)} className={baseInputClass} />;
      case "select":
      case "searchable-select":
        const fieldOptions = field.getOptions ? field.getOptions(formData) : (field.options || []);
        return <SearchableSelect value={value} onChange={(newValue) => onChange(field.name, newValue)} options={fieldOptions} placeholder={resolvedPlaceholder} disabled={field.disabled} error={error} compact={compact} isLoading={field.isLoading} />;
      case "checkbox":
        return (
          <div className="flex items-center">
            <input type="checkbox" id={field.name} checked={!!value} onChange={(e) => onChange(field.name, e.target.checked)} disabled={field.disabled} className="w-4 h-4 text-blue-600 border-slate-300 rounded" />
            <label htmlFor={field.name} className={`ml-2 ${compact ? 'text-xs' : 'text-sm'} text-slate-700 dark:text-slate-300`}>{field.checkboxLabel || resolvedLabel}</label>
          </div>
        );
      case "inline-status":
        return <InlineStatusSelector value={value} onChange={(newValue) => onChange(field.name, newValue)} statusOptions={field.statusOptions || field.options} />;
      case "inline-priority":
        return <InlinePrioritySelector value={value} onChange={(newValue) => onChange(field.name, newValue)} entityType={entityType} />;
      default:
        return <input type="text" id={field.name} value={value} onChange={(e) => onChange(field.name, e.target.value)} placeholder={resolvedPlaceholder} className={baseInputClass} />;
    }
  };

  const hasLinkType = "linkType" in formData;
  const isConditionallyRequired = hasLinkType && ((field.name === "lawsuitId" && formData.linkType === "lawsuit") || (field.name === "dossierId" && formData.linkType === "dossier"));

  return (
    <div className="space-y-1.5">
      {!isReadOnly && field.type !== "checkbox" && (
        <label htmlFor={field.name} className={`block font-semibold text-slate-700 dark:text-slate-200 ${compact ? 'text-xs' : 'text-sm'}`}>
          {resolvedLabel}
          {(field.required || isConditionallyRequired) && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {renderInput()}
      {error && <p className={`${compact ? 'text-xs' : 'text-sm'} text-red-600 font-medium`}>{error}</p>}
    </div>
  );
}
