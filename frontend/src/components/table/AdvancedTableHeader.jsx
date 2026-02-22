/**
 * AdvancedTableHeader.jsx
 * Table header with sorting and drag-and-drop reordering
 *
 * Styling architecture:
 * - Fixed height ensures consistent header geometry across all states
 * - When isEmpty=true: shows only column labels (muted), no icons
 * - When isEmpty=false: shows drag handles and sort indicators
 * - Uses block display for labels to maintain column width in table-fixed layout
 */

import { useState } from "react";

export default function AdvancedTableHeader({
  columns = [],
  sortBy = null,
  sortDirection = "asc",
  onSort = () => { },
  onReorder = () => { },
  enableReorder = true,
  isEmpty = false,
  tableId = null,
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (e, index) => {
    if (!enableReorder || isEmpty) return;
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e) => {
    if (!enableReorder || isEmpty) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e, dropIndex) => {
    if (!enableReorder || isEmpty || draggedIndex === null) return;
    e.preventDefault();

    if (draggedIndex !== dropIndex) {
      onReorder(draggedIndex, dropIndex);
    }
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  const getColumnStyle = (column) => {
    const style = {};
    if (column.width) style.width = `${column.width}px`;
    if (column.minWidth) style.minWidth = `${column.minWidth}px`;
    if (column.maxWidth) style.maxWidth = `${column.maxWidth}px`;
    return style;
  };

  // Empty table view uses a dedicated empty-state card; hiding the header avoids
  // extra table geometry/spacing artifacts in Chromium when no rows exist.
  if (isEmpty) {
    return null;
  }

  return (
    <thead className="hidden sm:table-header-group bg-slate-100/70 dark:bg-slate-800 border-b border-slate-300 dark:border-slate-700">
      <tr>
        {columns.map((column, index) => {
          const isSorted = sortBy === column.id;
          const isSortable = column.sortable !== false;
          const canDrag = enableReorder && !column.locked;
          const isDragging = draggedIndex === index;

          // When empty, disable all interactions
          const isInteractive = !isEmpty;

          return (
            <th
              key={column.id}
              draggable={canDrag && isInteractive}
              onDragStart={(e) => handleDragStart(e, index)}
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, index)}
              onDragEnd={handleDragEnd}
              style={getColumnStyle(column)}
            className={`
                min-h-10 px-4 py-2.5 align-middle text-left text-[10px] font-semibold uppercase tracking-wider leading-tight
                transition-colors duration-150
                ${isEmpty
                  ? "text-slate-400 dark:text-slate-500"
                  : "text-slate-600 dark:text-slate-300"
                }
                ${isSortable && isInteractive ? "cursor-pointer select-none hover:bg-slate-200/60 dark:hover:bg-slate-700/50" : ""}
                ${isDragging ? "opacity-50" : ""}
                ${canDrag && isInteractive ? "hover:bg-slate-200/60 dark:hover:bg-slate-700/50" : ""}
              `}
              onClick={() => isSortable && isInteractive && onSort(column.id)}
            >
              <div className="flex min-w-0 items-center gap-2 min-h-5">
                {/* Drag handle */}
                {canDrag && (
                  <svg
                    className="w-4 h-4 flex-shrink-0 text-slate-400 dark:text-slate-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8h16M4 16h16" />
                  </svg>
                )}

                {/* Column label - no truncation to preserve readability */}
                <span className="flex-1 min-w-0 max-w-full break-words whitespace-normal leading-tight line-clamp-2">
                  {column.label}
                </span>

                {/* Sort indicator */}
                {isSortable && (
                  <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center">
                    {isSorted ? (
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
                      <svg className="w-3 h-3 text-slate-400 dark:text-slate-600" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    )}
                  </span>
                )}
              </div>
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
