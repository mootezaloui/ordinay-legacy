import { memo } from "react";
import { collectIconActions } from "./cardUtils";
import CardActionMenu from "./CardActionMenu";

const getEmphasisClass = (emphasis) => {
  switch (emphasis) {
    case "prominent":
      return "border-l-4 border-amber-500 dark:border-amber-400";
    case "subdued":
      return "opacity-70";
    case "archived":
      return "opacity-50 italic";
    default:
      return "";
  }
};

const EntityCard = memo(function EntityCard({
  cells = [],
  onClick,
  emphasis = "normal",
  className = "",
}) {
  const cursorClass = onClick ? "cursor-pointer" : "";
  const emphasisClass = getEmphasisClass(emphasis);

  const actionCell = cells.find((cell) => cell.role === "actions");
  const actionItems = actionCell ? collectIconActions(actionCell.content) : [];

  const visibleCells = cells.filter((cell) => !cell.hidden);
  const primaryCell =
    visibleCells.find((cell) => cell.role === "primary") || visibleCells[0];
  const statusCell = visibleCells.find((cell) => cell.role === "status");
  const metaCell = visibleCells.find((cell) => cell.role === "meta");

  const detailCells = visibleCells
    .filter((cell) => !["primary", "status", "meta"].includes(cell.role) && cell.content != null)
    .sort((a, b) => a.priority - b.priority)
    .slice(0, 4);

  return (
    <div
      onClick={onClick}
      onKeyDown={(event) => {
        if (!onClick) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={`w-full rounded-2xl border border-slate-300/80 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900 shadow-sm transition-all duration-200 hover:shadow-lg overflow-hidden relative flex flex-col ${cursorClass} ${emphasisClass} ${className}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="pointer-events-none absolute inset-0 hidden dark:hidden bg-gradient-to-b from-white/80 via-white/20 to-transparent" />
      {/* Top accent strip for prominent items */}
      {emphasis === "prominent" && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-amber-500 to-orange-500" />
      )}

      {/* Primary section with better hierarchy */}
      <div className="p-5 sm:p-6 pb-4 bg-white dark:bg-transparent flex-1">
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
        <div className="bg-white/90 dark:bg-slate-800/30 px-5 sm:px-6 py-4 space-y-3 border-t border-slate-300/70 dark:border-slate-700/60">
          {detailCells.map((cell) => (
            <div
              key={cell.key}
              className="flex items-start gap-4"
            >
              {/* Quieter, sentence-case labels */}
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400 shrink-0 w-20">
                {cell.label}
              </span>
              {/* Emphasized values */}
              <span className="text-sm text-slate-900 dark:text-white text-left font-medium break-words overflow-wrap-anywhere flex-1">
                {cell.content}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
});

export default EntityCard;
