/**
 * ContentSection.jsx
 * Content section wrapper
 * Provides consistent card-like container for content blocks
 *
 * Surface composition:
 * - This is the SINGLE source of border-radius for table layouts
 * - overflow-hidden clips all children to the rounded corners
 * - Inner components (Table, Toolbar, Pagination) should NOT have their own radius
 * - Some inline dropdowns (e.g. quick actions) render in-place, so allowOverflow
 *   switches to overflow-visible to prevent clipping.
 */

export default function ContentSection({
  children,
  title,
  actions,
  className = "",
  allowOverflow, // Allow dropdowns/popovers to escape rounded container when needed
  ...rest // Pass through additional props like data-tutorial
}) {
  const overflowClass = allowOverflow ? "overflow-visible" : "overflow-hidden";

  return (
    <div
      className={`content-section bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 ${overflowClass} flex flex-col min-h-0 min-w-0 ${className}`}
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
      {/* min-h-0 is required so nested flex/table scroll regions can shrink on window resize without clipping */}
      <div className="flex flex-col min-h-0 min-w-0">
        {children}
      </div>
    </div>
  );
}
