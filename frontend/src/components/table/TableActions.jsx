/**
 * TableActions.jsx
 * Action buttons for table rows (edit, delete, view, etc.)
 * Provides consistent styling for action buttons
 */

export default function TableActions({
  children,
  className = "",
  mobileHidden = true
}) {
  const baseClass = mobileHidden ? "hidden md:flex" : "flex";

  return (
    <div data-table-actions className={`${baseClass} items-center gap-2 ${className}`}>
      {children}
    </div>
  );
}

/**
 * IconButton - Helper component for action buttons
 */
export function IconButton({
  icon,
  onClick,
  variant = "default",
  title = ""
}) {
  const variants = {
    default: "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400",
    edit: "text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400",
    delete: "text-slate-600 dark:text-slate-400 hover:text-red-600 dark:hover:text-red-400",
    view: "text-slate-600 dark:text-slate-400 hover:text-green-600 dark:hover:text-green-400",
  };

  const icons = {
    edit: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    ),
    delete: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
      </svg>
    ),
    view: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
      </svg>
    ),
    more: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
      </svg>
    ),
  };

  return (
    <button
      onClick={onClick}
      title={title}
      data-table-action-button
      className={`p-2 rounded-xl transition-colors duration-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 ${variants[variant]}`}
    >
      {icons[icon] || icons.more}
    </button>
  );
}
