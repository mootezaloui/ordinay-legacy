import ContentSection from "../../layout/ContentSection";

/**
 * Overview Tab - Displays general information
 * Configurable via entity config
 */
export default function OverviewTab({ data, config, isEditing }) {
  if (!config.overviewSections) {
    return (
      <div className="p-6 text-center text-slate-600 dark:text-slate-400">
        No overview configuration found
      </div>
    );
  }

  return (
    <div className={`grid grid-cols-1 ${config.overviewSections.length > 1 ? 'lg:grid-cols-2' : ''} gap-6`}>
      {config.overviewSections.map((section, index) => (
        <ContentSection key={index} title={section.title}>
          <div className="p-6">
            {/* Description type */}
            {section.type === "description" && (
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed">
                {typeof section.content === 'function' ? section.content(data) : section.content}
              </p>
            )}

            {/* Notes type */}
            {section.type === "notes" && (
              <div className="p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {typeof section.content === 'function' ? section.content(data) : section.content}
                </p>
              </div>
            )}

            {/* Fields type */}
            {section.fields && (
              <div className="space-y-4">
                {section.fields.map((field, fieldIndex) => {
                  const value = typeof field.value === 'function' ? field.value(data) : field.value;
                  
                  if (isEditing && field.editable !== false) {
                    return (
                      <div key={fieldIndex}>
                        <label className="block text-xs text-slate-500 dark:text-slate-400 mb-1">
                          {field.label}
                        </label>
                        <input
                          type="text"
                          defaultValue={value}
                          className="w-full px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                      </div>
                    );
                  }
                  
                  return (
                    <div key={fieldIndex} className="flex items-center gap-3">
                      {field.icon && <i className={`${field.icon} text-slate-400 w-5`}></i>}
                      <div className="flex-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">{field.label}</p>
                        <p className="text-sm text-slate-900 dark:text-white">{value || 'N/A'}</p>
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