/**
 * AdvancedTableHeader.jsx
 * Table header with sorting and drag-and-drop reordering
 */

import { useState } from "react";

export default function AdvancedTableHeader({
  columns = [],
  sortBy = null,
  sortDirection = "asc",
  onSort = () => { },
  onReorder = () => { },
  enableReorder = true,
  tableId = null,
}) {
  const [draggedIndex, setDraggedIndex] = useState(null);

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

  const getColumnStyle = (column) => {
    const style = {};
    if (column.width) style.width = `${column.width}px`;
    if (column.minWidth) style.minWidth = `${column.minWidth}px`;
    if (column.maxWidth) style.maxWidth = `${column.maxWidth}px`;
    return style;
  };

  return (
    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
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
            onClick={() => column.sortable !== false && onSort(column.id)}
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
          </th>
        ))}
      </tr>
    </thead>
  );
}
