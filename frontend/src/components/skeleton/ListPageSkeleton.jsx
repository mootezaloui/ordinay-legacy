import SkeletonPulse from "./SkeletonPulse";

/**
 * ListPageSkeleton — Skeleton for list/table screens.
 * Mirrors: 4 stat cards + toolbar + table rows.
 */
const ListPageSkeleton = () => (
  <>
    {/* Stat Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6"
        >
          <SkeletonPulse className="h-4 w-20 mb-3" />
          <SkeletonPulse className="h-8 w-16 mb-2" />
          <SkeletonPulse className="h-3 w-24" />
        </div>
      ))}
    </div>

    {/* Content Section — Toolbar + Table */}
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700">
      {/* Toolbar */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <SkeletonPulse className="h-9 w-64 rounded-md" />
        <SkeletonPulse className="h-9 w-9 rounded-md" />
        <SkeletonPulse className="h-9 w-9 rounded-md" />
      </div>
      {/* Table Header */}
      <div className="px-4 pt-4 pb-2 flex items-center gap-4 border-b border-slate-100 dark:border-slate-700/50">
        <SkeletonPulse className="h-3 w-1/4" />
        <SkeletonPulse className="h-3 w-1/6" />
        <SkeletonPulse className="h-3 w-1/5" />
        <SkeletonPulse className="h-3 w-1/6" />
        <SkeletonPulse className="h-3 w-16" />
      </div>
      {/* Table Rows */}
      <div className="p-4 space-y-4">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex items-center gap-4">
            <SkeletonPulse className="h-4 w-1/4" />
            <SkeletonPulse className="h-4 w-1/6" />
            <SkeletonPulse className="h-4 w-1/5" />
            <SkeletonPulse className="h-4 w-1/6" />
            <SkeletonPulse className="h-4 w-16" />
          </div>
        ))}
      </div>
    </div>
  </>
);

export default ListPageSkeleton;
