import SkeletonPulse from "./SkeletonPulse";

/**
 * DetailSkeleton — Skeleton for entity detail views.
 * Mirrors: page header, info banner, quick actions bar, stats, tabs, and overview content.
 */
const DetailSkeleton = () => (
  <div className="space-y-6">
    {/* Page Header — icon + title + subtitle + action buttons */}
    <div className="mb-6 sm:mb-8">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <SkeletonPulse className="h-12 w-12 rounded-lg" />
          <div>
            <SkeletonPulse className="h-8 w-56 mb-2" />
            <SkeletonPulse className="h-4 w-32" />
          </div>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <SkeletonPulse className="h-10 w-24 rounded-lg" />
          <SkeletonPulse className="h-10 w-40 rounded-lg" />
          <SkeletonPulse className="h-10 w-24 rounded-lg" />
        </div>
      </div>
    </div>

    {/* Info Banner (renderHeader) — title + badges + 4 InfoCards */}
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div>
            <SkeletonPulse className="h-7 w-48 mb-3" />
            <div className="flex items-center gap-2">
              <SkeletonPulse className="h-4 w-4 rounded" />
              <SkeletonPulse className="h-4 w-32" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <SkeletonPulse className="h-7 w-28 rounded-full" />
            <SkeletonPulse className="h-7 w-20 rounded-full" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-700/30">
              <SkeletonPulse className="h-8 w-8 rounded-lg" />
              <div>
                <SkeletonPulse className="h-3 w-20 mb-1.5" />
                <SkeletonPulse className="h-4 w-28" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Quick Actions Bar — ContentSection with title + dropdown grid */}
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <SkeletonPulse className="h-5 w-28" />
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {[0, 1, 2].map((i) => (
            <div key={i}>
              <SkeletonPulse className="h-3.5 w-16 mb-2" />
              <SkeletonPulse className="h-10 w-full rounded-lg" />
            </div>
          ))}
        </div>
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
              <SkeletonPulse className="h-7 w-12 mb-1" />
              <SkeletonPulse className="h-3.5 w-20" />
            </div>
          </div>
        </div>
      ))}
    </div>

    {/* Tab Strip */}
    <div className="hidden md:block border-b border-slate-200 dark:border-slate-700 overflow-x-hidden">
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="flex items-center gap-2 px-4 py-3 border-b-2 border-transparent">
            <SkeletonPulse className="h-4 w-4" />
            <SkeletonPulse className="h-4 w-16" />
            {i < 4 && <SkeletonPulse className="h-5 w-6 rounded-full" />}
          </div>
        ))}
      </div>
    </div>

    {/* Content Area — Two-column overview sections */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* General Information section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <SkeletonPulse className="h-5 w-40" />
          <SkeletonPulse className="h-4 w-12" />
        </div>
        <div className="p-6 space-y-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <SkeletonPulse className="h-4 w-4 mt-0.5" />
              <div>
                <SkeletonPulse className="h-3 w-24 mb-2" />
                <SkeletonPulse className="h-5 w-44" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Description section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <SkeletonPulse className="h-5 w-40" />
          <SkeletonPulse className="h-4 w-12" />
        </div>
        <div className="p-6 space-y-3">
          <SkeletonPulse className="h-3 w-24 mb-2" />
          <SkeletonPulse className="h-4 w-full" />
          <SkeletonPulse className="h-4 w-5/6" />
          <SkeletonPulse className="h-4 w-3/4" />
        </div>
      </div>
    </div>
  </div>
);

export default DetailSkeleton;
