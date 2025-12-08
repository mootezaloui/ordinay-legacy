/**
 * Table.jsx
 * Main table wrapper component
 * Provides responsive table structure with proper styling
 */

export default function Table({ children, className = "" }) {
  return (
    <div className="w-full overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-700">
      <table className={`w-full border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}