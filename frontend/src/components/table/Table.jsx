/**
 * Table.jsx
 * Main table wrapper component
 * Provides responsive table structure with proper styling
 */

export default function Table({ children, className = "" }) {
  return (
    <div className="w-full overflow-x-auto rounded-2xl border border-slate-200/70 dark:border-slate-700/60 bg-white/85 dark:bg-slate-900/75 shadow-sm">
      <table className={`w-full table-fixed border-collapse ${className}`}>
        {children}
      </table>
    </div>
  );
}
