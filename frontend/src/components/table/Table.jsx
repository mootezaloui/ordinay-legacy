/**
 * Table.jsx
 * Main table wrapper component
 * Provides responsive table structure with proper styling
 *
 * Surface composition:
 * - Table lives inside ContentSection which provides the card styling (border, radius, shadow)
 * - Table itself has NO border-radius - it inherits from parent container
 * - This ensures one unified surface, not nested cards
 *
 * Layout:
 * - Outer div provides background color
 * - Inner scroll container isolates horizontal scroll to table content
 * - Column min-widths set in AdvancedTableHeader prevent collapse
 */

export default function Table({ children, className = "" }) {
  return (
    <div className="w-full bg-white dark:bg-slate-900">
      {/* Scroll container - only the table scrolls, not the entire content section */}
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse table-fixed lg:table-auto ${className}`}>
          {children}
        </table>
      </div>
    </div>
  );
}
