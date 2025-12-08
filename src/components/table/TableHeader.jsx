/**
 * TableHeader.jsx
 * Renders table header with column names
 * Supports sortable columns (for future implementation)
 */

export default function TableHeader({ columns = [], sortable = false }) {
  return (
    <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
      <tr>
        {columns.map((column, index) => (
          <th
            key={index}
            className="px-6 py-3 text-left text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider"
          >
            <div className="flex items-center gap-2">
              {column}
              {sortable && (
                <svg
                  className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                  />
                </svg>
              )}
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}