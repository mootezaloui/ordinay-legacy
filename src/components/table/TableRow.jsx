/**
 * TableRow.jsx
 * Individual table row component
 * Supports hover effects and click handlers
 */

export default function TableRow({
  children,
  onClick,
  hoverable = true,
  className = ""
}) {
  const hoverClass = hoverable ? "hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors duration-150" : "";
  const cursorClass = onClick ? "cursor-pointer" : "";

  return (
    <tr
      onClick={onClick}
      className={`${hoverClass} ${cursorClass} ${className}`}
    >
      {children}
    </tr>
  );
}