import SkeletonPulse from "./SkeletonPulse";

/**
 * DetailSkeleton — Skeleton for entity detail views.
 * Mirrors: page header, quick actions bar, tabs, and overview fields.
 */
const DetailSkeleton = () => (
  <div className="space-y-6">
    {/* Quick Actions Bar */}
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
      <div className="flex flex-wrap gap-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-2">
            <SkeletonPulse className="h-4 w-16" />
            <SkeletonPulse className="h-8 w-28 rounded-md" />
          </div>
        ))}
      </div>
    </div>

    {/* Stats Cards */}
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {[0, 1, 2, 3].map((i) => (
        <div
          key={i}
          className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-center gap-3">
            <SkeletonPulse className="h-12 w-12 rounded-lg" />
            <div>
              <SkeletonPulse className="h-6 w-12 mb-1" />
              <SkeletonPulse className="h-3 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Tab Strip */}
    <div className="hidden md:block border-b border-slate-200 dark:border-slate-700">
      <div className="flex gap-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <SkeletonPulse key={i} className="h-10 w-24 rounded-t-md" />
        ))}
      </div>
    </div>

    {/* Content Area — Overview Fields */}
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i}>
            <SkeletonPulse className="h-3 w-24 mb-2" />
            <SkeletonPulse className="h-5 w-48" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DetailSkeleton;
