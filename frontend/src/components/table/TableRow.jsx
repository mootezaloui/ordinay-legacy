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

import { Children, isValidElement } from "react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "../ui/dropdown-menu";
import { IconButton } from "./TableActions";

const inferMobileRole = (columnId = "") => {
  const id = String(columnId).toLowerCase();
  if (!id) return "detail";
  if (id === "actions" || id.includes("action")) return "actions";
  if (["name", "title", "label", "reference", "number", "lawsuitnumber", "missionnumber"].includes(id)) {
    return "primary";
  }
  if (id.includes("status") || id.includes("state")) return "status";
  if (id.includes("priority")) return "status";
  if (
    id.includes("date") ||
    id.includes("time") ||
    id.includes("due") ||
    id.includes("next") ||
    id.includes("created") ||
    id.includes("updated")
  ) {
    return "meta";
  }
  return "detail";
};

const collectIconActions = (node, actions = []) => {
  Children.forEach(node, (child) => {
    if (!isValidElement(child)) return;
    if (child.type === IconButton) {
      actions.push(child.props);
      return;
    }
    if (child.props?.children) {
      collectIconActions(child.props.children, actions);
    }
  });
  return actions;
};

export default function TableRow({
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

  const mobileEmphasisClass = {
    prominent: "border-l-4 border-amber-500",
    subdued: "opacity-70",
    archived: "opacity-50 italic",
    normal: "",
  }[emphasis] || "";

  const cells = Children.toArray(children).filter(isValidElement);
  const mobileCells = cells.map((cell, index) => {
    const {
      columnId,
      mobileLabel,
      mobileRole,
      mobileHidden,
      mobilePriority,
    } = cell.props || {};
    const resolvedColumnId = columnId || `column-${index}`;
    const role = mobileRole || inferMobileRole(resolvedColumnId);
    const hidden = Boolean(mobileHidden) || role === "actions";

    return {
      key: cell.key ?? resolvedColumnId,
      columnId: resolvedColumnId,
      label: mobileLabel || resolvedColumnId,
      role,
      hidden,
      priority:
        typeof mobilePriority === "number" ? mobilePriority : Number.POSITIVE_INFINITY,
      content: cell.props?.children,
    };
  });

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
      className={`w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 shadow-sm transition-colors duration-150 ${cursorClass} ${mobileEmphasisClass} ${className}`}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          {primaryCell && (
            <div className="text-base font-semibold text-slate-900 dark:text-white break-words">
              {primaryCell.content}
            </div>
          )}
          {metaCell && (
            <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="uppercase tracking-wide font-semibold">
                {metaCell.label}
              </span>
              <span className="text-slate-700 dark:text-slate-200">
                {metaCell.content}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-start gap-2">
          {statusCell && (
            <div className="shrink-0">{statusCell.content}</div>
          )}
          {actionItems.length > 0 && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  className="h-9 w-9 rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 flex items-center justify-center"
                  aria-label="More actions"
                >
                  <i className="fas fa-ellipsis-h text-sm"></i>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                {actionItems.map((action, idx) => {
                  const label = action.title || action.icon || "Action";
                  const isDestructive = action.variant === "delete" || action.icon === "delete";
                  return (
                    <DropdownMenuItem
                      key={`${label}-${idx}`}
                      className={isDestructive ? "text-red-600 focus:text-red-600" : ""}
                      onSelect={(event) => {
                        event.preventDefault();
                        if (typeof action.onClick === "function") {
                          action.onClick({ stopPropagation: () => {} });
                        }
                      }}
                    >
                      {label}
                    </DropdownMenuItem>
                  );
                })}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {detailCells.length > 0 && (
        <div className="mt-3 space-y-2">
          {detailCells.map((cell) => (
            <div
              key={cell.key}
              className="flex items-start justify-between gap-4 text-sm"
            >
              <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {cell.label}
              </span>
              <span className="text-slate-700 dark:text-slate-200 text-right break-words">
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
}
