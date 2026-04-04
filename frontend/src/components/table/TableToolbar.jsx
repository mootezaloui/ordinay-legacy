/**
 * TableToolbar.jsx
 * Advanced table controls: search, column visibility, filters, export
 *
 * Architecture note:
 * The column menu dropdown uses createPortal to render to document.body,
 * ensuring it escapes any overflow constraints in the layout hierarchy.
 * This is the standard pattern for floating UI in the app.
 */

import { useState, useRef, useEffect, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import {
  PLACEHOLDER_CONTEXT,
  resolveContextualPlaceholder,
} from "../../utils/fieldPlaceholders";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "../ui/sheet";

export default function TableToolbar({
  searchQuery = "",
  onSearchChange = () => { },
  searchPlaceholder = null,
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
  sortBy = null,
  sortDirection = "asc",
  onSort = null,
  onResetSort = null,
  viewMode = "table",
  onViewModeChange = null,
}) {
  const { t } = useTranslation("common");
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const columnButtonRef = useRef(null);
  const menuRef = useRef(null);
  const navContainerRef = useRef(null);
  const itemsRef = useRef({});
  const indicatorRef = useRef(null);
  const lastIndicatorX = useRef(0);
  const lastIndicatorW = useRef(0);
  const resolvedImportLabel = importLabel || t("table.toolbar.import");
  const resolvedSearchPlaceholder = resolveContextualPlaceholder({
    t,
    placeholder: searchPlaceholder,
    context: PLACEHOLDER_CONTEXT.SEARCH,
  });
  const sortableColumns = columns.filter((column) => column.sortable !== false);
  const showViewToggle = typeof onViewModeChange === "function";

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

  const updateIndicator = useCallback(() => {
    if (!navContainerRef.current || !indicatorRef.current) return;

    const activeBtn = itemsRef.current[viewMode];
    if (!activeBtn) return;

    const containerRect = navContainerRef.current.getBoundingClientRect();
    const btnRect = activeBtn.getBoundingClientRect();

    const x = btnRect.left - containerRect.left;
    const w = btnRect.width;

    indicatorRef.current.animate(
      [
        {
          transform: `translateX(${lastIndicatorX.current}px)`,
          width: `${lastIndicatorW.current}px`,
          opacity: lastIndicatorW.current === 0 ? 0 : 1
        },
        {
          transform: `translateX(${x}px)`,
          width: `${w}px`,
          opacity: 1
        },
      ],
      {
        duration: 350,
        easing: "cubic-bezier(0.34, 1.56, 0.64, 1)",
        fill: "forwards",
      }
    );

    lastIndicatorX.current = x;
    lastIndicatorW.current = w;
  }, [viewMode]);

  useEffect(() => {
    updateIndicator();
    window.addEventListener('resize', updateIndicator);
    return () => window.removeEventListener('resize', updateIndicator);
  }, [updateIndicator]);

  const applyMobileSort = (columnId, direction) => {
    if (!onSort || !columnId) return;
    if (sortBy !== columnId) {
      onSort(columnId);
      if (direction === "desc") {
        onSort(columnId);
      }
      return;
    }
    if (direction === "asc" && sortDirection === "desc") {
      onSort(columnId);
    }
    if (direction === "desc" && sortDirection === "asc") {
      onSort(columnId);
    }
  };

  const searchInput = (
    <div className="relative">
      <input
        type="text"
        placeholder={resolvedSearchPlaceholder}
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
  );

  const viewToggle = showViewToggle ? (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 hidden xl:inline">
        {t("table.toolbar.view", { defaultValue: "View" })}
      </span>
      <div
        ref={navContainerRef}
        className="inline-flex items-center gap-1 rounded-2xl border border-slate-300 dark:border-slate-700/60 bg-white dark:bg-slate-900/70 p-1 shadow-sm relative overflow-hidden"
      >
        {/* Animated Indicator */}
        <div
          ref={indicatorRef}
          className="absolute h-[calc(100%-8px)] rounded-xl bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 shadow-sm pointer-events-none"
          style={{ top: '4px', left: '0' }}
        />

        <button
          type="button"
          ref={(el) => (itemsRef.current["table"] = el)}
          onClick={() => onViewModeChange("table")}
          className={`relative z-10 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-1 ${viewMode === "table"
            ? "text-blue-700 dark:text-blue-300"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
          {t("table.toolbar.viewTable", { defaultValue: "Table" })}
        </button>
        <button
          type="button"
          ref={(el) => (itemsRef.current["grid"] = el)}
          onClick={() => onViewModeChange("grid")}
          className={`relative z-10 px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors duration-200 flex items-center gap-1 ${viewMode === "grid"
            ? "text-blue-700 dark:text-blue-300"
            : "text-slate-600 dark:text-slate-300 hover:bg-slate-100/50 dark:hover:bg-slate-800/40"
            }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
          </svg>
          {t("table.toolbar.viewGrid", { defaultValue: "Grid" })}
        </button>
      </div>
    </div>
  ) : null;

  return (
    <div
      data-table-toolbar="true"
      className="px-4 lg:px-6 py-4 border-b border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0"
    >
      {/* Mobile controls */}
      <div className="flex items-center justify-between gap-3 md:hidden">
        <button
          onClick={() => setMobileFiltersOpen(true)}
          className="px-4 py-2.5 bg-white dark:bg-slate-900/70 border border-slate-300 dark:border-slate-700/60 rounded-2xl flex items-center gap-2 text-sm font-semibold text-slate-700 dark:text-slate-300 shadow-sm"
        >
          <i className="fas fa-sliders-h"></i>
          {t("table.toolbar.filters", { defaultValue: "Filters" })}
        </button>
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {isFiltering
            ? t("table.searchResults", { filtered: filteredItems, total: totalItems })
            : t("table.toolbar.total", { count: totalItems, defaultValue: `${totalItems} items` })}
        </span>
      </div>

      <Sheet open={mobileFiltersOpen} onOpenChange={setMobileFiltersOpen}>
        <SheetContent side="right" className="w-full sm:max-w-full">
          <SheetHeader>
            <SheetTitle>{t("table.toolbar.filters", { defaultValue: "Filters" })}</SheetTitle>
          </SheetHeader>
          <div className="mt-6 space-y-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {t("table.toolbar.search", { defaultValue: "Search" })}
              </label>
              {searchInput}
            </div>

            {showViewToggle && (
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.toolbar.view", { defaultValue: "View" })}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => onViewModeChange("table")}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${viewMode === "table"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      : "border-slate-300 dark:border-slate-700/60 text-slate-600 dark:text-slate-300"
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                    </svg>
                    {t("table.toolbar.viewTable", { defaultValue: "Table" })}
                  </button>
                  <button
                    type="button"
                    onClick={() => onViewModeChange("grid")}
                    className={`px-3 py-2 rounded-xl border text-sm font-semibold flex items-center justify-center gap-2 ${viewMode === "grid"
                      ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                      : "border-slate-300 dark:border-slate-700/60 text-slate-600 dark:text-slate-300"
                      }`}
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4h7v7H4V4zm9 0h7v7h-7V4zM4 13h7v7H4v-7zm9 0h7v7h-7v-7z" />
                    </svg>
                    {t("table.toolbar.viewGrid", { defaultValue: "Grid" })}
                  </button>
                </div>
              </div>
            )}

            {sortableColumns.length > 0 && onSort && (
              <div className="space-y-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {t("table.toolbar.sort", { defaultValue: "Sort" })}
                </label>
                <div className="space-y-3">
                  <select
                    value={sortBy || ""}
                    onChange={(e) => applyMobileSort(e.target.value, sortDirection)}
                    className="w-full rounded-xl border border-slate-300 dark:border-slate-700/60 bg-white dark:bg-slate-900/70 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                  >
                    <option value="">{t("table.toolbar.sortNone", { defaultValue: "None" })}</option>
                    {sortableColumns.map((column) => (
                      <option key={column.id} value={column.id}>
                        {column.label}
                      </option>
                    ))}
                  </select>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => applyMobileSort(sortBy, "asc")}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold ${sortDirection === "asc"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                        : "border-slate-300 dark:border-slate-700/60 text-slate-600 dark:text-slate-300"
                        }`}
                    >
                      {t("table.toolbar.sortAsc", { defaultValue: "Ascending" })}
                    </button>
                    <button
                      type="button"
                      onClick={() => applyMobileSort(sortBy, "desc")}
                      className={`flex-1 px-3 py-2 rounded-xl border text-sm font-semibold ${sortDirection === "desc"
                        ? "border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
                        : "border-slate-300 dark:border-slate-700/60 text-slate-600 dark:text-slate-300"
                        }`}
                    >
                      {t("table.toolbar.sortDesc", { defaultValue: "Descending" })}
                    </button>
                  </div>
                  {onResetSort && (
                    <button
                      type="button"
                      onClick={onResetSort}
                      className="text-sm font-semibold text-blue-600 dark:text-blue-400"
                    >
                      {t("table.toolbar.resetSort", { defaultValue: "Reset sorting" })}
                    </button>
                  )}
                </div>
              </div>
            )}

            {columns.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {t("table.toolbar.columns")}
                  </label>
                  <button
                    onClick={onResetColumns}
                    className="text-xs font-semibold text-blue-600 dark:text-blue-400"
                  >
                    {t("table.toolbar.reset")}
                  </button>
                </div>
                <div className="space-y-2">
                  {columns.map((column) => (
                    <label
                      key={column.id}
                      className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700/60 px-3 py-2 text-sm text-slate-700 dark:text-slate-200"
                    >
                      <input
                        type="checkbox"
                        checked={visibleColumns.includes(column.id)}
                        onChange={() => onToggleColumn(column.id)}
                        disabled={column.locked}
                        className="h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-2 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-700"
                      />
                      <span className="flex-1">
                        {column.label}
                      </span>
                      {column.locked && (
                        <i className="fas fa-lock text-xs text-slate-400"></i>
                      )}
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 gap-3">
              {onImport && (
                <button
                  onClick={onImport}
                  disabled={importDisabled}
                  className={`w-full px-4 py-2.5 border rounded-xl transition-colors text-sm font-semibold ${importDisabled
                    ? "bg-slate-200/70 dark:bg-slate-800/60 border-slate-200 dark:border-slate-700 text-slate-400 dark:text-slate-500"
                    : "bg-white dark:bg-slate-900/70 border-slate-300 dark:border-slate-700/60 text-slate-700 dark:text-slate-300"
                    }`}
                >
                  {resolvedImportLabel}
                </button>
              )}
              {onExport && (
                <button
                  onClick={onExport}
                  className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-700/60 rounded-xl text-sm font-semibold text-slate-700 dark:text-slate-300"
                >
                  {t("table.toolbar.export")}
                </button>
              )}
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Desktop controls */}
      <div className="hidden md:flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        {/* Left side - Search */}
        <div className="w-full lg:flex-1 lg:max-w-md min-w-0">
          {searchInput}

          {/* Search results info */}
          {isFiltering && (
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
              {t("table.searchResults", { filtered: filteredItems, total: totalItems })}
            </p>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto lg:justify-end">
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

          {viewToggle}

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
              className="fixed w-64 bg-white dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl shadow-2xl border border-slate-300 dark:border-slate-700/60 overflow-hidden animate-dropdown-reveal-in"
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

        </div>
      </div>
    </div>
  );
}
