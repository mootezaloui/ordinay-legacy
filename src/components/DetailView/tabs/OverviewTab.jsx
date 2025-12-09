import { useState } from "react";
import ContentSection from "../../layout/ContentSection";

/**
 * Overview Tab - Displays general information
 * Configurable via entity config with full edit support
 */
export default function OverviewTab({ data, config, isEditing, onDataChange }) {
  const [editedData, setEditedData] = useState(data);

  if (!config.overviewSections) {
    return (
      <div className="p-6 text-center text-slate-600 dark:text-slate-400">
        No overview configuration found
      </div>
    );
  }

  const handleFieldChange = (fieldKey, value) => {
    const newData = { ...editedData, [fieldKey]: value };
    setEditedData(newData);
    // Notify parent component of changes
    if (onDataChange) {
      onDataChange(newData);
    }
  };

  return (
    <div className={`grid grid-cols-1 ${config.overviewSections.length > 1 ? 'lg:grid-cols-2' : ''} gap-6`}>
      {config.overviewSections.map((section, index) => (
        <ContentSection key={index} title={section.title}>
          <div className="p-6">
            {/* Description type */}
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
                    {typeof section.content === 'function' ? section.content(editedData) : section.content}
                  </p>
                )}
              </>
            )}

            {/* Notes type */}
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
                      {typeof section.content === 'function' ? section.content(editedData) : section.content}
                    </p>
                  </div>
                )}
              </>
            )}

            {/* Fields type */}
            {section.fields && (
              <div className="space-y-4">
                {section.fields.map((field, fieldIndex) => {
                  const fieldKey = field.key || field.label.toLowerCase().replace(/\s+/g, '_');
                  const value = typeof field.value === 'function' ? field.value(editedData) : editedData[fieldKey];
                  const fieldType = field.type || 'text';
                  
                  if (isEditing && field.editable !== false) {
                    return (
                      <div key={fieldIndex}>
                        <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                          {field.label}
                          {field.required && <span className="text-red-500 ml-1">*</span>}
                        </label>
                        
                        {/* Text, email, tel, number inputs */}
                        {(['text', 'email', 'tel', 'number', 'date'].includes(fieldType)) && (
                          <input
                            type={fieldType}
                            value={value || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            placeholder={field.placeholder}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        
                        {/* Textarea */}
                        {fieldType === 'textarea' && (
                          <textarea
                            value={value || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            placeholder={field.placeholder}
                            rows={field.rows || 3}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          />
                        )}
                        
                        {/* Select dropdown */}
                        {fieldType === 'select' && field.options && (
                          <select
                            value={value || ''}
                            onChange={(e) => handleFieldChange(fieldKey, e.target.value)}
                            className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Sélectionner...</option>
                            {field.options.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        )}
                        
                        {field.helpText && (
                          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                            {field.helpText}
                          </p>
                        )}
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
                          {value || <span className="text-slate-400 dark:text-slate-600">N/A</span>}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </ContentSection>
      ))}
    </div>
  );
}