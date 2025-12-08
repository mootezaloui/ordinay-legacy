/**
 * ContentSection.jsx
 * Content section wrapper
 * Provides consistent card-like container for content blocks
 */

export default function ContentSection({ 
  children, 
  title,
  actions,
  className = "" 
}) {
  return (
    <div className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}>
      {/* Optional section header */}
      {(title || actions) && (
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          {title && (
            <h2 className="text-lg font-semibold text-slate-800 dark:text-white">
              {title}
            </h2>
          )}
          {actions && (
            <div className="flex items-center gap-2">
              {actions}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div>
        {children}
      </div>
    </div>
  );
}