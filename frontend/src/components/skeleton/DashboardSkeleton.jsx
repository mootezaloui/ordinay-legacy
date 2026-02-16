import SkeletonPulse from "./SkeletonPulse";

/**
 * DashboardSkeleton — Skeleton for the dashboard screen.
 * Mirrors: hero greeting, stat cards, activity feed, upcoming events, task list.
 */
const DashboardSkeleton = () => (
  <div className="space-y-8">
    {/* Hero Greeting */}
    <div className="mb-8">
      <SkeletonPulse className="h-3 w-24 mb-3" />
      <SkeletonPulse className="h-9 w-72 mb-2" />
      <SkeletonPulse className="h-5 w-56" />
    </div>

    {/* Stats Grid */}
    <div>
      <SkeletonPulse className="h-3 w-20 mb-4" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {[0, 1, 2, 3].map((i) => (
          <div
            key={i}
            className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6"
          >
            <SkeletonPulse className="h-4 w-24 mb-3" />
            <SkeletonPulse className="h-8 w-16 mb-2" />
            <SkeletonPulse className="h-3 w-28" />
          </div>
        ))}
      </div>
    </div>

    {/* Two-Column: Activity Feed + Upcoming Events */}
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {/* Activity Feed */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <SkeletonPulse className="h-4 w-32 mb-4" />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-start gap-3">
              <SkeletonPulse className="h-8 w-8 rounded-full flex-shrink-0" />
              <div className="flex-1">
                <SkeletonPulse className="h-4 w-3/4 mb-2" />
                <SkeletonPulse className="h-3 w-1/2" />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Upcoming Events */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <SkeletonPulse className="h-4 w-36 mb-4" />
        <div className="space-y-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3">
              <SkeletonPulse className="h-10 w-10 rounded-lg flex-shrink-0" />
              <div className="flex-1">
                <SkeletonPulse className="h-4 w-2/3 mb-2" />
                <SkeletonPulse className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>

    {/* Task List */}
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
      <SkeletonPulse className="h-4 w-28 mb-4" />
      <div className="space-y-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-center gap-4 py-2">
            <SkeletonPulse className="h-5 w-5 rounded flex-shrink-0" />
            <SkeletonPulse className="h-4 w-1/3" />
            <SkeletonPulse className="h-4 w-20 ml-auto" />
          </div>
        ))}
      </div>
    </div>
  </div>
);

export default DashboardSkeleton;
