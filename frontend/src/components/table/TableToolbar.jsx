/**
 * TableToolbar.jsx
 * Advanced table controls: search, column visibility, filters, export
 *
 * Architecture note:
 * The column menu dropdown uses createPortal to render to document.body,
 * ensuring it escapes any overflow constraints in the layout hierarchy.
 * This is the standard pattern for floating UI in the app.
 */

import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";

export default function TableToolbar({
  searchQuery = "",
  onSearchChange = () => { },
  columns = [],
  visibleColumns = [],
  onToggleColumn = () => { },
  onResetColumns = () => { },
  onExport = null,
  onImport = null,
  importLabel = null,
  importDisabled = false,
  importTitle = null,
  totalItems = 0,
  filteredItems = 0,
  isFiltering = false,
}) {
  const { t } = useTranslation("common");
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const columnButtonRef = useRef(null);
  const menuRef = useRef(null);
  const resolvedImportLabel = importLabel || t("table.toolbar.import");

  // Compute menu position relative to viewport
  const computeMenuPosition = () => {
    if (!columnButtonRef.current) return null;
    const rect = columnButtonRef.current.getBoundingClientRect();
    const menuWidth = 256; // w-64
    const menuMaxHeight = Math.min(400, window.innerHeight - 200);
    const spaceBelow = window.innerHeight - rect.bottom - 16;
    const spaceAbove = rect.top - 16;

    // Prefer below, but flip above if not enough space
    const placeAbove = spaceBelow < menuMaxHeight && spaceAbove > spaceBelow;

    let left = rect.right - menuWidth;
    // Keep within viewport bounds
    if (left < 8) left = 8;
    if (left + menuWidth > window.innerWidth - 8) {
      left = window.innerWidth - menuWidth - 8;
    }

    const top = placeAbove
      ? rect.top - Math.min(menuMaxHeight, spaceAbove) - 8
      : rect.bottom + 8;

    return { top, left, maxHeight: placeAbove ? spaceAbove : spaceBelow };
  };

  // Update position on scroll/resize while open
  useLayoutEffect(() => {
    if (!showColumnMenu) return;

    const updatePosition = () => {
      const pos = computeMenuPosition();
      if (pos) setMenuPosition(pos);
    };

    updatePosition();

    window.addEventListener("scroll", updatePosition, true);
    window.addEventListener("resize", updatePosition);

    return () => {
      window.removeEventListener("scroll", updatePosition, true);
      window.removeEventListener("resize", updatePosition);
    };
  }, [showColumnMenu]);

  // Close column menu when clicking outside
  useEffect(() => {
    if (!showColumnMenu) return;

    const handleClickOutside = (e) => {
      const isButtonClick = columnButtonRef.current?.contains(e.target);
      const isMenuClick = menuRef.current?.contains(e.target);
      if (!isButtonClick && !isMenuClick) {
        setShowColumnMenu(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showColumnMenu]);

  // Close on Escape key
  useEffect(() => {
    if (!showColumnMenu) return;

    const handleEscape = (e) => {
      if (e.key === "Escape") setShowColumnMenu(false);
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [showColumnMenu]);

  const handleToggleMenu = () => {
    if (!showColumnMenu) {
      const pos = computeMenuPosition();
      setMenuPosition(pos);
    }
    setShowColumnMenu(!showColumnMenu);
  };

  return (
    <div className="px-6 py-4 border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        {/* Left side - Search */}
        <div className="flex-1 max-w-md">
          <div className="relative">
            <input
              type="text"
              placeholder={t("table.searching")}
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              className="w-full pl-10 pr-10 py-2.5 border border-slate-300 dark:border-slate-700/60 rounded-2xl bg-white dark:bg-slate-900/70 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/60 focus:border-transparent transition-all shadow-sm"
            />
            <svg
              className="absolute left-3 top-2.5 w-5 h-5 text-slate-400 dark:text-slate-500"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            {searchQuery && (
              <button
                onClick={() => onSearchChange("")}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          {/* Search results info */}
          {isFiltering && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("table.searchResults", { filtered: filteredItems, total: totalItems })}
            </p>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-2">
          {/* Import button */}
          {onImport && (
            <button
              onClick={onImport}
              disabled={importDisabled}
              title={importTitle || resolvedImportLabel}
              className={`px-4 py-2.5 border rounded-2xl transition-colors flex items-center gap-2 text-sm font-semibold ${importDisabled
                ? "bg-slate-200/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500 cursor-not-allowed"
                : "bg-white dark:bg-slate-900/70 border-slate-300 dark:border-slate-700/60 hover:bg-slate-100 dark:hover:bg-slate-800/70 text-slate-700 dark:text-slate-300 shadow-sm"
                }`}
            >
              {/* Inverted: now using export icon for import */}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {resolvedImportLabel}
            </button>
          )}

          {/* Column visibility */}
          <div className="relative">
            <button
              ref={columnButtonRef}
              onClick={handleToggleMenu}
              className="px-4 py-2.5 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
              </svg>
              {t("table.toolbar.columns")}
              <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 text-xs rounded">
                {visibleColumns.length}/{columns.length}
              </span>
            </button>
          </div>

          {/* Column menu dropdown - rendered via portal to escape overflow constraints */}
          {showColumnMenu && menuPosition && createPortal(
            <div
              ref={menuRef}
              className="fixed w-64 bg-white dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700/60 overflow-hidden"
              style={{
                top: `${menuPosition.top}px`,
                left: `${menuPosition.left}px`,
                maxHeight: `${menuPosition.maxHeight}px`,
                zIndex: 9999,
              }}
            >
              <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-900 dark:text-white">
                    {t("table.toolbar.manageColumns")}
                  </span>
                  <button
                    onClick={onResetColumns}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-500/10 px-2 py-1 rounded-lg transition-colors"
                  >
                    {t("table.toolbar.reset")}
                  </button>
                </div>
              </div>

              <div className="py-2 overflow-y-auto" style={{ maxHeight: `${menuPosition.maxHeight - 100}px` }}>
                {columns.map((column) => (
                  <label
                    key={column.id}
                    className="flex items-center px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800/60 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={visibleColumns.includes(column.id)}
                      onChange={() => onToggleColumn(column.id)}
                      disabled={column.locked}
                      className="w-4 h-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                    />
                    <span className="ml-3 text-sm text-slate-700 dark:text-slate-300">
                      {column.label}
                      {column.locked && (
                        <svg className="inline w-3 h-3 ml-1 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                        </svg>
                      )}
                    </span>
                  </label>
                ))}
              </div>

              <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700/60 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50">
                {t("table.toolbar.reorderHint")}
              </div>
            </div>,
            document.body
          )}

          {/* Export button */}
          {onExport && (
            <button
              onClick={onExport}
              className="px-4 py-2.5 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm"
            >
              {/* Inverted: now using import icon for export */}
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 17v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 9l5-5m0 0l5 5m-5-5v12" />
              </svg>
              {t("table.toolbar.export")}
            </button>
          )}

          {/* Refresh button */}
          <button
            onClick={() => window.location.reload()}
            className="p-2.5 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl hover:bg-slate-100 dark:hover:bg-slate-800/70 transition-colors text-slate-700 dark:text-slate-300 shadow-sm"
            title="Refresh"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
