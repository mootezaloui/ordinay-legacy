/**
 * TableRow.jsx
 * Individual table row component
 * Supports hover effects, click handlers, and visual emphasis for intelligent ordering
 * 
 * Emphasis levels (for domain-aware visual hierarchy):
 * - 'prominent': Urgent/important items (full opacity, accent border)
 * - 'normal': Standard active items (default styling)
 * - 'subdued': Completed/inactive items (reduced opacity)
 * - 'archived': Cancelled/very old items (very reduced opacity, italic)
 */

export default function TableRow({
  children,
  onClick,
  hoverable = true,
  emphasis = 'normal',
  className = ""
}) {
  const hoverClass = hoverable ? "hover:bg-slate-50/80 dark:hover:bg-slate-800/60 transition-colors duration-150" : "";
  const cursorClass = onClick ? "cursor-pointer" : "";

  // Map emphasis to CSS class
  const emphasisClass = emphasis ? `table-row-${emphasis}` : '';

  return (
    <tr
      onClick={onClick}
      className={`${hoverClass} ${cursorClass} ${emphasisClass} ${className}`}
    >
      {children}
    </tr>
  );
}
