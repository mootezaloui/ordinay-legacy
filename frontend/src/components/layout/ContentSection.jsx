/**
 * ContentSection.jsx
 * Content section wrapper
 * Provides consistent card-like container for content blocks
 *
 * Surface composition:
 * - This is the SINGLE source of border-radius for table layouts
 * - overflow-hidden clips all children to the rounded corners
 * - Inner components (Table, Toolbar, Pagination) should NOT have their own radius
 * - Dropdowns/popovers use portals to document.body, so overflow-hidden is safe
 */

export default function ContentSection({
  children,
  title,
  actions,
  className = "",
  allowOverflow, // Destructure to prevent passing to DOM (legacy prop, now always overflow-hidden)
  ...rest // Pass through additional props like data-tutorial
}) {
  return (
    <div
      className={`bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden ${className}`}
      {...rest}
    >
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