/**
 * PageHeader.jsx
 * Page header with title, subtitle, and action buttons
 * Used at the top of each screen
 */

export default function PageHeader({ 
  title, 
  subtitle, 
  actions,
  icon 
}) {
  return (
    <div className="mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left side - Title and subtitle */}
        <div className="flex items-center gap-3">
          {icon && (
            <div className="p-3 bg-blue-100 dark:bg-blue-900/20 rounded-lg">
              <i className={`${icon} text-blue-600 dark:text-blue-400 text-xl`}></i>
            </div>
          )}
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 dark:text-white">
              {title}
            </h1>
            {subtitle && (
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                {subtitle}
              </p>
            )}
          </div>
        </div>

        {/* Right side - Actions */}
        {actions && (
          <div className="flex items-center gap-3">
            {actions}
          </div>
        )}
      </div>
    </div>
  );
}