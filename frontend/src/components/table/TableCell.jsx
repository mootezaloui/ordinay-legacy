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
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  // For adaptive cells: don't apply min-w-0 which forces shrinking
  // This allows flex children to size naturally
  const sizeClass = adaptive ? "" : "min-w-0";

  const content = truncate ? (
    <div
      className={`block ${sizeClass} break-words whitespace-normal lg:overflow-hidden lg:text-ellipsis lg:whitespace-nowrap`}
    >
      {children}
    </div>
  ) : (
    <div className={`flex items-center flex-wrap gap-2 ${sizeClass}`}>
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
      className={`px-4 lg:px-6 py-3.5 lg:py-4 text-[13px] lg:text-sm text-slate-700 dark:text-slate-100 h-12 lg:h-14 ${alignClass} ${className}`}
    >
      {content}
    </td>
  );
}
