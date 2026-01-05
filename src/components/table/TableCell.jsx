/**
 * TableCell.jsx
 * Individual table cell component
 * Supports text alignment and truncation
 */

export default function TableCell({
  children,
  align = "left",
  truncate = true,
  className = "",
}) {
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right",
  }[align];

  const content = truncate ? (
    <div className="block min-w-0 overflow-hidden text-ellipsis whitespace-nowrap">
      {children}
    </div>
  ) : (
    children
  );

  return (
    <td
      className={`px-6 py-4 text-sm text-slate-900 dark:text-slate-100 ${alignClass} ${className}`}
    >
      {content}
    </td>
  );
}