import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";

/**
 * ActivityFeed Component
 * Displays recent activities with icons, timestamps, and user info
 */
export default function ActivityFeed({ activities, maxItems = 5 }) {
  const { formatDate } = useSettings();
  const { t } = useTranslation("common");

  const getActivityIcon = (type) => {
    const icons = {
      client: { icon: "fas fa-user-plus", color: "blue" },
      dossier: { icon: "fas fa-folder-open", color: "purple" },
      task: { icon: "fas fa-tasks", color: "amber" },
      session: { icon: "fas fa-calendar-check", color: "green" },
      document: { icon: "fas fa-file-upload", color: "indigo" },
      payment: { icon: "fas fa-dollar-sign", color: "emerald" },
      meeting: { icon: "fas fa-handshake", color: "cyan" },
      lawsuit: { icon: "fas fa-gavel", color: "rose" },
      default: { icon: "fas fa-bell", color: "slate" },
    };
    return icons[type] || icons.default;
  };

  const formatTimeAgo = (dateString) => {
    if (!dateString) return "";
    const date = new Date(dateString);
    if (Number.isNaN(date.getTime())) return "";
    const now = new Date();
    const diffMs = now - date;
    if (diffMs < 0) return formatDate(date);
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return t("detail.history.time.justNow");
    if (diffMins < 60) return t("detail.history.time.minutesAgo", { count: diffMins });
    if (diffHours < 24) return t("detail.history.time.hoursAgo", { count: diffHours });
    if (diffDays < 7) return t("detail.history.time.daysAgo", { count: diffDays });
    return formatDate(date);
  };

  const displayedActivities = activities.slice(0, maxItems);

  return (
    <div className="space-y-4">
      {displayedActivities.map((activity, index) => {
        const { icon, color } = getActivityIcon(activity.type);
        const isLast = index === displayedActivities.length - 1;

        return (
          <div
            key={activity.id}
            className={`flex items-start gap-4 ${!isLast ? "pb-4 border-b border-slate-200/70 dark:border-slate-700/60" : ""
              }`}
          >
            {/* Icon */}
            <div className={`flex-shrink-0 w-10 h-10 rounded-2xl bg-${color}-100/80 dark:bg-${color}-900/25 flex items-center justify-center ring-1 ring-slate-200/60 dark:ring-slate-700/60`}>
              <i className={`${icon} text-${color}-600 dark:text-${color}-400 text-sm`}></i>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white">
                {activity.title}
              </p>
              {activity.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-1">
                  {activity.description}
                </p>
              )}
              <div className="flex items-center gap-2 mt-1">
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatTimeAgo(activity.timestamp)}
                </p>
                {activity.user && (
                  <>
                    <span className="text-xs text-slate-400">·</span>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {activity.user}
                    </p>
                  </>
                )}
              </div>
            </div>

            {/* Action button (optional) */}
            {activity.onClick && (
              <button
                onClick={activity.onClick}
                className="flex-shrink-0 p-2 hover:bg-slate-100/80 dark:hover:bg-slate-800/60 rounded-lg transition-colors"
              >
                <i className="fas fa-chevron-right text-slate-400 text-xs"></i>
              </button>
            )}
          </div>
        );
      })}

      {activities.length === 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
            <i className="fas fa-inbox text-slate-400 text-xl"></i>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.recentActivity.empty")}
          </p>
        </div>
      )}
    </div>
  );
}
