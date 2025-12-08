/**
 * TableCell.jsx
 * Individual table cell component
 * Supports text alignment and truncation
 */

export default function TableCell({ 
  children, 
  align = "left", 
  truncate = false,
  className = "" 
}) {
  const alignClass = {
    left: "text-left",
    center: "text-center",
    right: "text-right"
  }[align];

  const truncateClass = truncate ? "truncate max-w-xs" : "";

  return (
    <td className={`px-6 py-4 whitespace-nowrap text-sm text-slate-900 dark:text-slate-100 ${alignClass} ${truncateClass} ${className}`}>
      {children}
    </td>
  );
}