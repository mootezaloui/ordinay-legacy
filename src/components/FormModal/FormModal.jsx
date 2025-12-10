import { useState, useEffect } from "react";

/**
 * FormModal - Enhanced with searchable-select support
 * ✅ FIXED: Infinite loop issue resolved
 * ✅ UPDATED: Supports searchable-select field type
 * ✅ UPDATED: Handles external formData for dynamic field updates
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
}) {
  const [internalFormData, setInternalFormData] = useState({});
  const [errors, setErrors] = useState({});
  const [initialized, setInitialized] = useState(false);

  // Use external formData if provided, otherwise use internal
  const formData = externalFormData !== undefined ? externalFormData : internalFormData;
  const setFormData = externalOnFormDataChange || setInternalFormData;

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
  }, [isOpen, initialized]); // Only depend on isOpen and initialized flag

  // Reset errors on close
  useEffect(() => {
    if (!isOpen) {
      setErrors({});
      if (!externalOnFormDataChange) {
        // Only reset internal form data if not using external
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

    // ✅ Call field's onChange if it exists
    const field = fields.find(f => f.name === name);
    if (field?.onChange) {
      field.onChange(value, newFormData, setFormData);
    }
  };

  const validateForm = () => {
    const newErrors = {};

    fields.forEach((field) => {
      if (field.required && !formData[field.name]) {
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

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal */}
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="relative w-full max-w-2xl bg-white dark:bg-slate-800 rounded-xl shadow-2xl transform transition-all">
          {/* Header */}
          <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                    {subtitle}
                  </p>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
              >
                <i className="fas fa-times text-slate-500 dark:text-slate-400"></i>
              </button>
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {fields.map((field) => (
                <div
                  key={field.name}
                  className={field.fullWidth ? "md:col-span-2" : ""}
                >
                  <FormField
                    field={field}
                    value={formData[field.name] || ""}
                    onChange={handleChange}
                    error={errors[field.name]}
                    formData={formData}
                  />
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="mt-6 flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={onClose}
                disabled={isLoading}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors disabled:opacity-50"
              >
                {cancelText}
              </button>
              <button
                type="submit"
                disabled={isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
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
          </form>
        </div>
      </div>
    </div>
  );
}

/**
 * FormField - Enhanced with searchable-select support
 * ✅ UPDATED: Renders searchable-select fields
 */
function FormField({ field, value, onChange, error, formData }) {
  const baseInputClass = `w-full px-3 py-2 border rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors ${error
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
            rows={field.rows || 3}
            className={baseInputClass}
          />
        );

      case "select":
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
            {field.options?.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        );

      case "searchable-select":
        // ✅ NEW: Searchable dropdown with datalist
        return (
          <div className="relative">
            <input
              type="text"
              id={field.name}
              value={value}
              onChange={(e) => onChange(field.name, e.target.value)}
              placeholder={field.placeholder}
              required={field.required}
              disabled={field.disabled}
              list={`${field.name}-datalist`}
              className={baseInputClass + " pr-10"}
            />
            <datalist id={`${field.name}-datalist`}>
              {field.options?.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </datalist>
            <i className="fas fa-search absolute right-3 top-3 text-slate-400 pointer-events-none"></i>
          </div>
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
              className="ml-2 text-sm text-slate-700 dark:text-slate-300"
            >
              {field.checkboxLabel || field.label}
            </label>
          </div>
        );

      case "radio":
        return (
          <div className="space-y-2">
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
                  className="ml-2 text-sm text-slate-700 dark:text-slate-300"
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

  return (
    <div>
      {field.type !== "checkbox" && (
        <label
          htmlFor={field.name}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1"
        >
          {field.label}
          {field.required && <span className="text-red-500 ml-1">*</span>}
        </label>
      )}
      {renderInput()}
      {error && (
        <p className="mt-1 text-sm text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      {field.helpText && !error && (
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          {field.helpText}
        </p>
      )}
    </div>
  );
}