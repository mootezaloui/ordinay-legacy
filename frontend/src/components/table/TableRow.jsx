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

export default function TableRow({
  children,
  onClick,
  hoverable = true,
  emphasis = 'normal',
  className = ""
}) {
  // Hover only affects background color - no padding/margin/border changes
  const hoverClass = hoverable
    ? "hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
    : "";

  const cursorClass = onClick ? "cursor-pointer" : "";

  // Map emphasis to CSS class (defined in index.css)
  const emphasisClass = emphasis ? `table-row-${emphasis}` : '';

  return (
    <tr
      onClick={onClick}
      className={`bg-transparent transition-colors duration-150 ${hoverClass} ${cursorClass} ${emphasisClass} ${className}`}
    >
      {children}
    </tr>
  );
}
