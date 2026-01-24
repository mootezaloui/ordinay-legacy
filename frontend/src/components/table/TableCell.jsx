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
    <div className={`block ${sizeClass} overflow-hidden text-ellipsis whitespace-nowrap`}>
      {children}
    </div>
  ) : (
    <div className={`flex items-center flex-wrap gap-2 ${sizeClass}`}>
      {children}
    </div>
  );

  return (
    <td
      className={`px-6 py-4 text-sm text-slate-800 dark:text-slate-100 h-14 ${alignClass} ${className}`}
    >
      {content}
    </td>
  );
}
