/**
 * TableRow.jsx
 * Individual table row component
 * Supports hover effects, click handlers, and visual emphasis for intelligent ordering
 *
 * Styling architecture:
 * - Hover only changes background color (no layout shifts)
 * - transition-colors ensures smooth visual changes without geometry changes
 *
 * Emphasis levels (for domain-aware visual hierarchy):
 * - 'prominent': Urgent/important items (full opacity, accent border)
 * - 'normal': Standard active items (default styling)
 * - 'subdued': Completed/inactive items (reduced opacity)
 * - 'archived': Cancelled/very old items (very reduced opacity, italic)
 */

import { memo } from "react";
import { buildCardCellsFromChildren, collectIconActions } from "./cardUtils";
import CardActionMenu from "./CardActionMenu";

const TableRow = memo(function TableRow({
  children,
  onClick,
  hoverable = true,
  emphasis = "normal",
  className = "",
}) {
  // Hover only affects background color - no padding/margin/border changes
  const hoverClass = hoverable
    ? "hover:bg-slate-100/70 dark:hover:bg-slate-800/60"
    : "";

  const cursorClass = onClick ? "cursor-pointer" : "";

  // Map emphasis to CSS class (defined in index.css)
  const emphasisClass = emphasis ? `table-row-${emphasis}` : "";

  const mobileCells = buildCardCellsFromChildren(children);

  const actionCell = mobileCells.find((cell) => cell.role === "actions");
  const actionItems = actionCell ? collectIconActions(actionCell.content) : [];

  const visibleCells = mobileCells.filter((cell) => !cell.hidden);
  const primaryCell =
    visibleCells.find((cell) => cell.role === "primary") || visibleCells[0];
  const statusCell = visibleCells.find((cell) => cell.role === "status");
  const metaCell = visibleCells.find((cell) => cell.role === "meta");

  const detailCells = visibleCells
    .filter((cell) => !["primary", "status", "meta"].includes(cell.role))
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4);

  const mobileCard = (
    <div
      onClick={onClick}
      className={`w-full rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900 shadow-sm transition-all duration-200 hover:shadow-lg overflow-hidden relative ${cursorClass} ${className}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="pointer-events-none absolute inset-0 hidden dark:hidden bg-gradient-to-b from-white/80 via-white/20 to-transparent" />
      {/* Top accent strip for prominent items */}
      {emphasis === "prominent" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
      )}

      {/* Primary section with better hierarchy */}
      <div className="p-5 pb-4 bg-white dark:bg-transparent">
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex-1 overflow-hidden">
            {/* Larger, more prominent title */}
            {primaryCell && (
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white leading-tight mb-1.5 break-words overflow-wrap-anywhere">
                {primaryCell.content}
              </h3>
            )}

            {/* Meta info - inline, subtle */}
            {metaCell && (
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium break-words overflow-wrap-anywhere">
                {metaCell.label}: <span className="text-slate-600 dark:text-slate-300 font-mono">{metaCell.content}</span>
              </p>
            )}
          </div>

          {/* Larger touch target for actions */}
          {actionItems.length > 0 && <CardActionMenu actions={actionItems} />}
        </div>

        {/* Status - prominent placement below title */}
        {statusCell && (
          <div className="inline-flex">{statusCell.content}</div>
        )}
      </div>

      {/* Details section - separated with background tint */}
      {detailCells.length > 0 && (
        <div className="bg-white/90 dark:bg-slate-800/30 px-5 py-4 space-y-3 border-t border-slate-300/70 dark:border-slate-700/60">
          {detailCells.map((cell) => (
            <div
              key={cell.key}
              className="flex items-start gap-4"
            >
              {/* Quieter, sentence-case labels */}
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0">
                {cell.label}
              </span>
              {/* Emphasized values */}
              <span className="text-sm text-slate-900 dark:text-white text-right font-medium break-words overflow-wrap-anywhere flex-1">
                {cell.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <>
      <tr
        onClick={onClick}
        className={`hidden md:table-row bg-transparent transition-colors duration-150 ${hoverClass} ${cursorClass} ${emphasisClass} ${className}`}
      >
        {children}
      </tr>
      <tr className="md:hidden">
        <td colSpan={999} className="px-4 py-2">
          {mobileCard}
        </td>
      </tr>
    </>
  );
});

export default TableRow;
