/**
 * TableCell.jsx
 * Individual table cell component
 * Supports text alignment and truncation
 *
 * Styling architecture:
 * - Fixed minimum height ensures consistent row geometry
 * - truncate: true = clip with ellipsis (default for text)
 * - truncate: false = allow content to flow naturally (for interactive elements)
 * - adaptive: true = allow cell to grow naturally for content (pair with truncate=false)
 */

export default function TableCell({
  children,
  align = "left",
  truncate = true,
  adaptive = false,
  columnId,
  mobileLabel,
  mobileRole,
  mobileHidden = false,
  mobilePriority,
  className = "",
}) {
  const isActionsColumn = columnId === "actions" || mobileRole === "actions";
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  // Cells must remain shrink-safe in table layouts.
  // `adaptive` only changes content layout behavior, not shrink eligibility.
  const sizeClass = "min-w-0";
  const adaptiveContentClass = adaptive ? "max-w-full" : "";
  const shouldTruncate = truncate && !isActionsColumn;

  const content = shouldTruncate ? (
    <div
      className={`block ${sizeClass} ${adaptiveContentClass} break-words whitespace-normal lg:overflow-hidden lg:text-ellipsis lg:whitespace-nowrap`}
    >
      {children}
    </div>
  ) : (
    <div
      className={`flex items-center gap-2 ${isActionsColumn ? "flex-nowrap" : "flex-wrap"} ${sizeClass} ${adaptiveContentClass}`}
    >
      {children}
    </div>
  );

  return (
    <td
      data-column-id={columnId}
      data-mobile-label={mobileLabel}
      data-mobile-role={mobileRole}
      data-mobile-hidden={mobileHidden ? "true" : "false"}
      data-mobile-priority={mobilePriority}
      className={`min-w-0 px-4 lg:px-6 py-3.5 lg:py-4 text-[13px] lg:text-sm text-slate-700 dark:text-slate-100 min-h-12 lg:min-h-14 align-middle ${alignClass} ${className}`}
    >
      {content}
    </td>
  );
}
