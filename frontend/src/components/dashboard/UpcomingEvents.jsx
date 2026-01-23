import { useNavigate } from "react-router-dom";
import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";

/**
 * UpcomingEvents Component
 * Displays upcoming sessions, deadlines, and hearings
 */
export default function UpcomingEvents({ events, maxItems = 5 }) {
  const navigate = useNavigate();
  const { formatDate, formatDateTime } = useSettings();
  const { t } = useTranslation("common");

  const getEventColor = (type) => {
    const colors = {
      session: { bg: "bg-blue-50 dark:bg-blue-900/10", badge: "bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300" },
      hearing: { bg: "bg-purple-50 dark:bg-purple-900/10", badge: "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300" },
      deadline: { bg: "bg-amber-50 dark:bg-amber-900/10", badge: "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300" },
      meeting: { bg: "bg-green-50 dark:bg-green-900/10", badge: "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300" },
      default: { bg: "bg-slate-50 dark:bg-slate-800", badge: "bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-300" },
    };
    return colors[type] || colors.default;
  };

  const getTimeUntil = (dateString) => {
    const eventDate = new Date(dateString);
    const now = new Date();
    const diffMs = eventDate - now;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMs < 0) {
      return { label: t("dashboard.upcomingEvents.time.passed"), isUrgent: false };
    }
    if (diffHours < 1) {
      return { label: t("dashboard.upcomingEvents.time.soon"), isUrgent: true };
    }
    if (diffHours < 24) {
      return { label: t("dashboard.upcomingEvents.time.inHours", { count: diffHours }), isUrgent: true };
    }
    if (diffDays < 7) {
      return { label: t("dashboard.upcomingEvents.time.inDays", { count: diffDays }), isUrgent: false };
    }

    return { label: formatDate(eventDate), isUrgent: false };
  };

  const displayedEvents = events.slice(0, maxItems);

  return (
    <div className="space-y-3">
      {displayedEvents.map((event) => {
        const colors = getEventColor(event.type);
        const { label: timeUntil, isUrgent } = getTimeUntil(event.date);

        return (
          <div
            key={event.id}
            onClick={() => event.link && navigate(event.link)}
            className={`flex items-center justify-between p-4 ${colors.bg} rounded-2xl border border-slate-200 dark:border-slate-700 ${event.link ? "cursor-pointer hover:shadow-md" : ""
              } transition-all`}
          >
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-900 dark:text-white truncate">
                {event.title}
              </p>
              <div className="flex items-center gap-2 mt-1">
                <i className="fas fa-clock text-xs text-slate-500 dark:text-slate-400"></i>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {formatDateTime(event.date)}
                </p>
              </div>
              {event.location && (
                <div className="flex items-center gap-2 mt-1">
                  <i className="fas fa-map-marker-alt text-xs text-slate-500 dark:text-slate-400"></i>
                  <p className="text-xs text-slate-600 dark:text-slate-400 truncate">
                    {event.location}
                  </p>
                </div>
              )}
            </div>

            <span
              className={`px-3 py-1 text-xs font-semibold ${colors.badge} rounded-full whitespace-nowrap ml-3 ${isUrgent ? "animate-pulse" : ""
                }`}
            >
              {timeUntil}
            </span>
          </div>
        );
      })}

      {events.length === 0 && (
        <div className="text-center py-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-800 mb-3">
            <i className="fas fa-calendar-check text-slate-400 text-xl"></i>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {t("dashboard.upcomingEvents.empty")}
          </p>
        </div>
      )}
    </div>
  );
}
