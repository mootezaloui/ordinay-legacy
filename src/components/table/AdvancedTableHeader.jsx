/**
 * AdvancedTableHeader.jsx
 * Table header with sorting, drag-and-drop reordering and column resizing
 */

import { useEffect, useMemo, useRef, useState } from "react";

const DEFAULT_MIN_WIDTH = 120;
const DEFAULT_START_WIDTH = 180;

const isBrowser = typeof window !== "undefined";

const loadStoredWidths = (key) => {
  if (!isBrowser || !key) return {};
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    console.warn("Failed to load stored column widths", error);
    return {};
  }
};

const saveStoredWidths = (key, widths) => {
  if (!isBrowser || !key) return;
  try {
    window.localStorage.setItem(key, JSON.stringify(widths));
  } catch (error) {
    console.warn("Failed to persist column widths", error);
  }
};

export default function AdvancedTableHeader({
  columns = [],
  sortBy = null,
  sortDirection = "asc",
  onSort = () => { },
  onReorder = () => { },
  enableReorder = true,
  tableId = null,
}) {
  const headerRef = useRef(null);
  const [draggedIndex, setDraggedIndex] = useState(null);
  const [containerWidth, setContainerWidth] = useState(null);
  const storageKey = useMemo(() => {
    const columnSignature = columns.map((col) => col.id).join("|");
    const base = tableId || (isBrowser ? window.location.pathname : "default");
    return `advanced-table-widths:${base}:${columnSignature}`;
  }, [columns, tableId]);

  const getDefaultWidth = (column) =>
    column.initialWidth || column.minWidth || DEFAULT_START_WIDTH;

  const [columnWidths, setColumnWidths] = useState(() => {
    const stored = loadStoredWidths(storageKey);
    return columns.reduce((acc, column) => {
      const storedWidth = stored[column.id];
      acc[column.id] = storedWidth || getDefaultWidth(column);
      return acc;
    }, {});
  });
  const [resizing, setResizing] = useState(null);

  const measureContainer = () => {
    if (!isBrowser) return;
    const node = headerRef.current;
    const tableEl = node?.closest("table");
    const parent = tableEl?.parentElement;
    const width = parent?.getBoundingClientRect().width;
    if (width && width !== containerWidth) {
      setContainerWidth(width);
    }
  };

  const handleDragStart = (e, index) => {
    if (!enableReorder) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    if (!enableReorder) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, dropIndex) => {
    if (!enableReorder || draggedIndex === null) return;
    e.preventDefault();

    if (draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  useEffect(() => {
    const stored = loadStoredWidths(storageKey);

    setColumnWidths((prev) => {
      const next = {};
      const currentIds = columns.map((c) => c.id);

      columns.forEach((column) => {
        const storedWidth = stored[column.id];
        const previousWidth = prev[column.id];
        next[column.id] = storedWidth || previousWidth || getDefaultWidth(column);
      });

      // If no change, return prev to avoid extra renders
      const unchanged =
        currentIds.length === Object.keys(prev).length &&
        currentIds.every((id) => prev[id] === next[id]);

      return unchanged ? prev : next;
    });
  }, [columns, storageKey]);

  useEffect(() => {
    saveStoredWidths(storageKey, columnWidths);
  }, [storageKey, columnWidths]);

  useEffect(() => {
    measureContainer();
    if (!isBrowser) return undefined;
    window.addEventListener("resize", measureContainer);
    return () => window.removeEventListener("resize", measureContainer);
  }, []);

  // Keep total widths within container on load if possible
  useEffect(() => {
    if (!containerWidth) return;
    setColumnWidths((prev) => {
      const widths = columns.map((col) => prev[col.id] || getDefaultWidth(col));
      const mins = columns.map((col) => col.minWidth || DEFAULT_MIN_WIDTH);
      const total = widths.reduce((s, w) => s + w, 0);
      const minTotal = mins.reduce((s, w) => s + w, 0);
      if (total <= containerWidth || containerWidth <= minTotal) return prev;

      const scale = containerWidth / total;
      const scaled = widths.map((w, i) => Math.max(mins[i], Math.floor(w * scale)));
      let diff = containerWidth - scaled.reduce((s, w) => s + w, 0);
      if (diff !== 0 && scaled.length > 0) {
        scaled[scaled.length - 1] = scaled[scaled.length - 1] + diff;
      }
      const next = {};
      columns.forEach((col, i) => {
        next[col.id] = scaled[i];
      });
      return next;
    });
  }, [containerWidth, columns]);

  useEffect(() => {
    if (!resizing) return undefined;

    const handleMouseMove = (event) => {
      const delta = event.clientX - resizing.startX;
      let desiredWidth = resizing.startWidth + delta;

      desiredWidth = Math.max(resizing.minWidth, desiredWidth);
      if (resizing.maxWidth) {
        desiredWidth = Math.min(resizing.maxWidth, desiredWidth);
      }

      setColumnWidths((prev) => {
        const otherTotal = columns.reduce((sum, col) => {
          if (col.id === resizing.columnId) return sum;
          const width = prev[col.id] || getDefaultWidth(col);
          return sum + width;
        }, 0);

        const liveContainer = headerRef.current?.closest("table")?.parentElement?.getBoundingClientRect().width;
        const limit = liveContainer || resizing.containerWidth || containerWidth;
        const maxAllowed = limit
          ? Math.max(resizing.minWidth, limit - otherTotal)
          : desiredWidth;

        const bounded = Math.max(resizing.minWidth, maxAllowed || resizing.minWidth);
        const nextWidth = Math.min(desiredWidth, bounded);

        if (prev[resizing.columnId] === nextWidth) return prev;
        return { ...prev, [resizing.columnId]: nextWidth };
      });
    };

    const handleMouseUp = () => {
      setResizing(null);
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
  }, [resizing]);

  const startResize = (event, column) => {
    event.stopPropagation();
    event.preventDefault();

    const th = event.currentTarget.closest("th");
    const currentWidth = th?.getBoundingClientRect().width;
    const tableEl = th?.closest("table");
    const containerWidth = tableEl?.parentElement?.getBoundingClientRect().width;
    const minWidth = column.minWidth || DEFAULT_MIN_WIDTH;
    const maxWidth = column.maxWidth || null;

    setResizing({
      columnId: column.id,
      startX: event.clientX,
      startWidth: currentWidth || columnWidths[column.id] || getDefaultWidth(column),
      minWidth,
      maxWidth,
      containerWidth: containerWidth || null,
    });
  };

  const getColumnStyle = (column) => {
    const width = columnWidths[column.id] || getDefaultWidth(column);
    const minWidth = column.minWidth || DEFAULT_MIN_WIDTH;
    const style = {
      minWidth: `${minWidth}px`,
    };

    if (width) {
      style.width = `${width}px`;
    }

    if (column.maxWidth) {
      style.maxWidth = `${column.maxWidth}px`;
    }

    return style;
  };

  return (
    <thead ref={headerRef} className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <tr>
        {columns.map((column, index) => (
          <th
            key={column.id}
            draggable={enableReorder && !column.locked}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={handleDragOver}
            onDrop={(e) => handleDrop(e, index)}
            onDragEnd={handleDragEnd}
            style={getColumnStyle(column)}
            className={`relative group px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider ${column.sortable !== false ? "cursor-pointer select-none" : ""
              } ${draggedIndex === index ? "opacity-50" : ""} ${enableReorder && !column.locked ? "hover:bg-slate-100 dark:hover:bg-slate-700" : ""
              } transition-colors`}
            onClick={() => column.sortable !== false && !resizing && onSort(column.id)}
          >
            <div className="flex items-center gap-2 min-w-0">
              {/* Drag handle */}
              {enableReorder && !column.locked && (
                <svg className="w-4 h-4 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                </svg>
              )}

              {/* Column label */}
              <span className="flex-1 overflow-hidden text-ellipsis whitespace-nowrap">
                {column.label}
              </span>

              {/* Sort indicator */}
              {column.sortable !== false && (
                <div className="flex flex-col">
                  {sortBy === column.id ? (
                    sortDirection === "asc" ? (
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M14.707 12.707a1 1 0 01-1.414 0L10 9.414l-3.293 3.293a1 1 0 01-1.414-1.414l4-4a1 1 0 011.414 0l4 4a1 1 0 010 1.414z" clipRule="evenodd" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )
                  ) : (
                    <svg className="w-4 h-4 text-slate-300 dark:text-slate-600 opacity-0 group-hover:opacity-100" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                    </svg>
                  )}
                </div>
              )}
            </div>

            {/* Resize handle */}
            <div
              role="separator"
              aria-orientation="vertical"
              aria-label={`Resize ${column.label}`}
              onMouseDown={(event) => startResize(event, column)}
              className="absolute right-0 top-0 h-full w-3 cursor-col-resize select-none"
            >
              <span className="absolute right-1 top-1/2 h-6 w-px -translate-y-1/2 bg-slate-300 group-hover:bg-slate-400 dark:bg-slate-600"></span>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}