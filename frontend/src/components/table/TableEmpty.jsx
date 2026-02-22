/**
 * TableEmpty.jsx
 * Empty state component for tables
 * Shows when no data is available
 *
 * Styling architecture:
 * - Fixed minimum height ensures table doesn't collapse when empty
 * - Transparent background inherits from table container
 * - No hover effects to prevent visual instability
 */

import { useTranslation } from "react-i18next";

export default function TableEmpty({
  icon = "inbox",
  message = null,
  action,
  compact = false,
}) {
  const { t } = useTranslation("common");

  // Use default i18n message if no message provided
  const displayMessage = message || t("table.empty");

  const icons = {
    inbox: (
      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
      </svg>
    ),
    users: (
      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
      </svg>
    ),
    folder: (
      <svg className="w-12 h-12 text-slate-300 dark:text-slate-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z" />
      </svg>
    ),
  };

  const layoutClass = compact
    ? "min-h-[140px] py-8 px-6"
    : "min-h-[200px] py-12 px-6";

  return (
    <div className={`${layoutClass} flex flex-col items-center justify-center text-center bg-slate-50/80 dark:bg-slate-900/60 border border-dashed border-slate-300 dark:border-slate-700 rounded-2xl`}>
      <div className="mb-4">
        {icons[icon] || icons.inbox}
      </div>
      <p className="text-sm text-slate-600 dark:text-slate-400 max-w-md">
        {displayMessage}
      </p>
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
