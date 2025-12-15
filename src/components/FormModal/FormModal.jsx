import { useState, useEffect } from "react";
import SearchableSelect from "./SearchableSelect";

/**
 * FormModal - Enhanced with improved responsive design
 * ✅ Adaptive width based on screen size
 * ✅ Better spacing to minimize scrolling
 * ✅ Compact layout options
 * ✅ Smart grid layout based on field count
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
}) {
  const [internalFormData, setInternalFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [initialized, setInitialized] = useState(false);

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
      if (initialData) {
        setFormData(initialData);
      } else {
        // Set default values from fields
        const defaults = {};
        fields.forEach((field) => {
          defaults[field.name] = field.defaultValue || "";
        });
        setFormData(defaults);
      }
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
      field.onChange(value, newFormData, setFormData);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    // Check if this form has a linkType field (session form specific)
    const hasLinkTypeField = fields.some(f => f.name === "linkType");

    fields.forEach((field) => {
      // Skip validation for conditionally hidden fields
      if (hasLinkTypeField && field.name === "caseId" && formData.linkType !== "case") {
        return;
      }
      if (hasLinkTypeField && field.name === "dossierId" && formData.linkType !== "dossier") {
        return;
      }

      // Make caseId/dossierId required based on linkType
      const isConditionallyRequired = hasLinkTypeField && (
        (field.name === "caseId" && formData.linkType === "case") ||
        (field.name === "dossierId" && formData.linkType === "dossier")
      );

      if ((field.required || isConditionallyRequired) && !formData[field.name]) {
        newErrors[field.name] = `${field.label} est requis`;
      }

      // Custom validation
      if (field.validate && formData[field.name]) {
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

    if (validateForm()) {
      onSubmit(formData);
    }
  };

  if (!isOpen) return null;

  const modalSizeClass = getModalSize();
  const columnLayoutClass = getColumnLayout();
  const spacingClass = compact ? "gap-3" : "gap-4";
  const paddingClass = compact ? "p-4" : "p-6";

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal - Optimized positioning */}
      <div className="flex min-h-screen items-center justify-center p-2 sm:p-4">
        <div className={`relative w-full ${modalSizeClass} bg-white dark:bg-slate-800 rounded-xl shadow-2xl transform transition-all my-4 max-h-[95vh] flex flex-col`}>
          {/* Header - Fixed */}
          <div className={`${compact ? 'px-4 py-3' : 'px-6 py-4'} border-b border-slate-200 dark:border-slate-700 flex-shrink-0`}>
            <div className="flex items-center justify-between">
              <div className="flex-1 min-w-0 pr-4">
                <h2 className={`${compact ? 'text-lg' : 'text-xl'} font-bold text-slate-900 dark:text-white truncate`}>
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors flex-shrink-0"
                title="Fermer"
              >
                <i className="fas fa-times text-slate-500 dark:text-slate-400"></i>
              </button>
            </div>
          </div>

          {/* Form - Scrollable */}
          <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
            <div className={`${paddingClass} overflow-y-auto flex-1`}>
              <div className={`grid grid-cols-1 md:grid-cols-2 ${columnLayoutClass} ${spacingClass}`}>
                {fields.map((field) => {
                  // ✅ Check hideIf function for conditional visibility
                  if (field.hideIf && typeof field.hideIf === 'function' && field.hideIf(formData)) {
                    return null;
                  }

                  // Legacy: Conditional visibility for session form fields
                  const hasLinkTypeField = fields.some(f => f.name === "linkType");

                  if (hasLinkTypeField && field.name === "caseId" && formData.linkType !== "case") {
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
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Actions - Fixed at bottom */}
            <div className={`${compact ? 'px-4 py-3' : 'px-6 py-4'} border-t border-slate-200 dark:border-slate-700 flex-shrink-0`}>
              <div className="flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={onClose}
                  disabled={isLoading}
                  className={`${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50`}
                >
                  {cancelText}
                </button>
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`${compact ? 'px-3 py-1.5 text-sm' : 'px-4 py-2'} bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2`}
                >
                  {isLoading ? (
                    <>
                      <i className="fas fa-spinner fa-spin"></i>
                      Enregistrement...
                    </>
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
    </div>
  );
}

/**
 * FormField - Compact & responsive design
 */
function FormField({ field, value, onChange, error, formData, compact = false }) {
  const baseInputClass = `w-full ${compact ? 'px-2.5 py-1.5 text-sm' : 'px-3 py-2'} border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${error
      ? "border-red-500 dark:border-red-500"
      : "border-slate-300 dark:border-slate-600"
    }`;

  const renderInput = () => {
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
            placeholder={field.placeholder}
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
            placeholder={field.placeholder}
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
              placeholder={field.placeholder || "Rechercher..."}
              disabled={field.disabled}
              error={error}
              compact={compact}
            />
          );
        }

        return (
          <select
            id={field.name}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            required={field.required}
            disabled={field.disabled}
            className={baseInputClass}
          >
            <option value="">Sélectionner...</option>
            {fieldOptions?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "searchable-select":
        // Compute options from getOptions function if it exists, otherwise use static options
        const searchableOptions = field.getOptions 
          ? field.getOptions(formData, field.allOptions)
          : (field.options || []);
        return (
          <SearchableSelect
            value={value}
            onChange={(newValue) => onChange(field.name, newValue)}
            options={searchableOptions}
            placeholder={field.placeholder || "Rechercher..."}
            disabled={field.disabled}
            error={error}
            compact={compact}
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
              {field.checkboxLabel || field.label}
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

      case "file":
        return (
          <input
            type="file"
            id={field.name}
            onChange={(e) => onChange(field.name, e.target.files[0])}
            accept={field.accept}
            disabled={field.disabled}
            className={baseInputClass}
          />
        );

      default:
        return (
          <input
            type="text"
            id={field.name}
            value={value}
            onChange={(e) => onChange(field.name, e.target.value)}
            placeholder={field.placeholder}
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
    (field.name === "caseId" && formData.linkType === "case") ||
    (field.name === "dossierId" && formData.linkType === "dossier")
  );

  return (
    <div>
      {field.type !== "checkbox" && (
        <label
          htmlFor={field.name}
          className={`block ${compact ? 'text-xs' : 'text-sm'} font-medium text-slate-700 dark:text-slate-300 ${compact ? 'mb-0.5' : 'mb-1'}`}
        >
          {field.label}
          {(field.required || isConditionallyRequired) && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {renderInput()}
      {error && (
        <p className={`${compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'} text-red-600 dark:text-red-400`}>
          {error}
        </p>
      )}
      {field.helpText && !error && (
        <p className={`${compact ? 'mt-0.5 text-xs' : 'mt-1 text-sm'} text-slate-500 dark:text-slate-400`}>
          {field.helpText}
        </p>
      )}
    </div>
  );
}