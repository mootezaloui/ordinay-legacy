/**
 * Pagination.jsx
 * Pagination controls for tables
 * Supports page navigation and items per page selection
 */

import { useTranslation } from "react-i18next";

export default function Pagination({
  currentPage = 1,
  totalPages = 1,
  totalItems = 0,
  itemsPerPage = 10,
  onPageChange = () => {},
  onItemsPerPageChange = () => {},
}) {
  const { t } = useTranslation("common");
  const isEmpty = totalItems === 0;
  const pages = [];
  const maxPagesToShow = 5;

  // Calculate page range to display
  let startPage = Math.max(1, currentPage - Math.floor(maxPagesToShow / 2));
  let endPage = Math.min(totalPages, startPage + maxPagesToShow - 1);

  if (endPage - startPage + 1 < maxPagesToShow) {
    startPage = Math.max(1, endPage - maxPagesToShow + 1);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(i);
  }

  const startItem = isEmpty ? 0 : (currentPage - 1) * itemsPerPage + 1;
  const endItem = isEmpty ? 0 : Math.min(currentPage * itemsPerPage, totalItems);

  return (
    <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-900 border-t border-slate-300 dark:border-slate-700 shrink-0">
      {/* Left side - Items info */}
      <div className="flex items-center gap-4">
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {t("table.pagination.showing", {
            from: startItem,
            to: endItem,
            total: totalItems,
          })}
        </p>

        {/* Items per page selector */}
        <select
          value={itemsPerPage}
          onChange={(e) => onItemsPerPageChange(Number(e.target.value))}
          className="px-3 py-1.5 text-sm border border-slate-300 dark:border-slate-700/60 rounded-2xl bg-white dark:bg-slate-900/70 text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-blue-500/60 shadow-sm"
        >
          <option value={5}>{t("table.pagination.perPage", { count: 5 })}</option>
          <option value={10}>{t("table.pagination.perPage", { count: 10 })}</option>
          <option value={25}>{t("table.pagination.perPage", { count: 25 })}</option>
          <option value={50}>{t("table.pagination.perPage", { count: 50 })}</option>
        </select>
      </div>

      {/* Right side - Page navigation */}
      <div className="flex items-center gap-2">
        {/* Previous button */}
        <button
          onClick={() => onPageChange(currentPage - 1)}
          disabled={isEmpty || currentPage === 1}
          className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        {/* Page numbers */}
        {!isEmpty && startPage > 1 && (
          <>
            <button
              onClick={() => onPageChange(1)}
              className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors duration-200 shadow-sm"
            >
              1
            </button>
            {startPage > 2 && (
              <span className="px-2 text-slate-500 dark:text-slate-400">...</span>
            )}
          </>
        )}

        {!isEmpty && pages.map((page) => (
          <button
            key={page}
            onClick={() => onPageChange(page)}
            className={`px-3 py-2 text-sm font-semibold rounded-2xl transition-colors duration-200 ${
              page === currentPage
                ? "bg-blue-600 text-white shadow-sm shadow-blue-500/30"
                : "text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 shadow-sm"
            }`}
          >
            {page}
          </button>
        ))}

        {!isEmpty && endPage < totalPages && (
          <>
            {endPage < totalPages - 1 && (
              <span className="px-2 text-slate-500 dark:text-slate-400">...</span>
            )}
            <button
              onClick={() => onPageChange(totalPages)}
              className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors duration-200 shadow-sm"
            >
              {totalPages}
            </button>
          </>
        )}

        {/* Next button */}
        <button
          onClick={() => onPageChange(currentPage + 1)}
          disabled={isEmpty || currentPage === totalPages || totalPages <= 1}
          className="px-3 py-2 text-sm font-semibold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-200 shadow-sm"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  );
}
