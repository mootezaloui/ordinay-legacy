import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import ContentSection from "../layout/ContentSection";
import { useTranslation } from "react-i18next";
import { NotificationTypes, VALID_NOTIFICATION_TYPES } from "../../constants/notificationTypes";
import { useNotificationListTranslation } from "../../hooks/useNotificationTranslation";

/**
 * NotificationCenter Page
 * Full notification history with filtering and management
 */
export default function NotificationCenter() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
  const { t } = useTranslation("notifications");
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();

  const [filter, setFilter] = useState("all"); // all, unread, read
  const [typeFilter, setTypeFilter] = useState("all"); // all, task, deadline, hearing, etc.

  // Translate notifications on-demand based on active language
  const translatedNotifications = useNotificationListTranslation(notifications);

  const filteredNotifications = translatedNotifications.filter((notification) => {
    if (filter === "unread" && notification.read) return false;
    if (filter === "read" && !notification.read) return false;

    if (typeFilter !== "all" && notification.type !== typeFilter) return false;

    return true;
  });

  // Use all defined notification types for the filter dropdown
  // Show types that have notifications, plus all defined types
  const typesInData = new Set(notifications.map((n) => n.type));
  const allAvailableTypes = Array.from(new Set([
    ...typesInData,
    ...VALID_NOTIFICATION_TYPES
  ])).sort();

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  };

  const formatTimestamp = (timestamp) => {
    // SQLite CURRENT_TIMESTAMP returns UTC format: "YYYY-MM-DD HH:MM:SS"
    // Add 'Z' to indicate UTC timezone for correct parsing
    const timestampStr = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const date = new Date(timestampStr);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) {
      return formatDateTime(date);
    }
    if (diffDays < 7) {
      return t("center.time.dateAndTime", { date: formatDate(date), time: formatDateTime(date) });
    }
    return formatDate(date);
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      urgent: {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        label: t("center.priority.urgent"),
      },
      high: {
        bg: "bg-orange-100 dark:bg-orange-900/30",
        text: "text-orange-700 dark:text-orange-400",
        label: t("center.priority.high"),
      },
      success: {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        label: t("center.priority.success"),
      },
      info: {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-700 dark:text-blue-400",
        label: t("center.priority.info"),
      },
    };
    return badges[priority] || badges.info;
  };

  const getIconBackground = (priority) =>
    priority === "urgent"
      ? "bg-red-100 dark:bg-red-900/30"
      : "bg-blue-100 dark:bg-blue-900/30";

  /**
   * Parse and highlight ALL scan-critical data in notification messages
   * Covers: titles, names, dates, times, amounts, locations, durations, priorities, status, case numbers
   * Visual hierarchy: instant data extraction without reading full text
   */
  const renderHighlightedMessage = (message) => {
    if (!message) return message;

    let result = message;

    // Order matters: more specific patterns first to avoid conflicts
    const patterns = [
      // === ENTITY NAMES / TITLES (in quotes) ===
      {
        regex: /"([^"]+)"/g,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-slate-900 dark:text-white"><span>📌</span>"$1"</span>'
      },

      // === PRIORITY (FR + EN) ===
      {
        regex: /priorité\s+([A-Za-zÀ-ÿ]+)/gi,
        replacement: 'priorité <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
      },
      {
        regex: /Priority:\s*([A-Za-z]+)/gi,
        replacement: 'Priority: <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
      },
      {
        regex: /Priorité\s*:\s*([A-Za-zÀ-ÿ]+)/gi,
        replacement: 'Priorité : <span class="inline-flex items-center gap-0.5 font-semibold text-amber-600 dark:text-amber-400"><span>⚡</span>$1</span>'
      },

      // === LOCATION (FR + EN) ===
      {
        regex: /Lieu\s*:\s*([^\n.]+)/gi,
        replacement: 'Lieu : <span class="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"><span>📍</span>$1</span>'
      },
      {
        regex: /Location:\s*([^\n.]+)/gi,
        replacement: 'Location: <span class="inline-flex items-center gap-0.5 font-semibold text-emerald-600 dark:text-emerald-400"><span>📍</span>$1</span>'
      },

      // === TIMES (à HH:MM / at HH:MM) ===
      {
        regex: /\bà\s+(\d{1,2}[h:]\d{2})/gi,
        replacement: 'à <span class="inline-flex items-center gap-0.5 font-semibold text-violet-600 dark:text-violet-400"><span>⏰</span>$1</span>'
      },
      {
        regex: /\bat\s+(\d{1,2}:\d{2}(?:\s*[AP]M)?)/gi,
        replacement: 'at <span class="inline-flex items-center gap-0.5 font-semibold text-violet-600 dark:text-violet-400"><span>⏰</span>$1</span>'
      },

      // === DATES ===
      // Dates in parentheses (dd/mm/yyyy)
      {
        regex: /\((\d{2}\/\d{2}\/\d{4})\)/g,
        replacement: '(<span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$1</span>)'
      },
      // "le dd/mm/yyyy" or "on dd/mm/yyyy"
      {
        regex: /\b(le|on)\s+(\d{2}\/\d{2}\/\d{4})/gi,
        replacement: '$1 <span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$2</span>'
      },
      // Standalone dates dd/mm/yyyy (not already wrapped)
      {
        regex: /(?<![>\/])(\b\d{2}\/\d{2}\/\d{4}\b)(?![<])/g,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-blue-600 dark:text-blue-400"><span>📅</span>$1</span>'
      },

      // === DURATION / COUNTDOWN (FR + EN) ===
      // "dans X jour(s)" / "in X day(s)"
      {
        regex: /dans\s+(\d+)\s+(jour|jours|heure|heures)/gi,
        replacement: 'dans <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
      },
      {
        regex: /in\s+(\d+)\s+(day|days|hour|hours)/gi,
        replacement: 'in <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
      },
      // "il y a X jour(s)" / "X day(s) ago"
      {
        regex: /il y a\s+(\d+)\s+(jour|jours)/gi,
        replacement: 'il y a <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
      },
      {
        regex: /(\d+)\s+(day|days)\s+ago/gi,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span> ago'
      },
      // "depuis X jour(s)"
      {
        regex: /depuis\s+(\d+)\s+(jour|jours)/gi,
        replacement: 'depuis <span class="inline-flex items-center gap-0.5 font-semibold text-orange-600 dark:text-orange-400"><span>⏳</span>$1 $2</span>'
      },

      // === AMOUNTS / MONEY ===
      // Amount + TND/EUR/USD
      {
        regex: /(\d[\d\s.,]*)\s*(TND|EUR|USD|€|\$|£)/gi,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"><span>💰</span>$1 $2</span>'
      },
      // Currency symbol first (€50, $100)
      {
        regex: /([€$£])\s?(\d[\d\s.,]*)/g,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-rose-600 dark:text-rose-400"><span>💰</span>$1$2</span>'
      },

      // === STATUS KEYWORDS (FR + EN) ===
      {
        regex: /\b(en retard|overdue|urgent|URGENT)\b/gi,
        replacement: '<span class="inline-flex items-center gap-0.5 font-bold text-red-600 dark:text-red-400"><span>🔴</span>$1</span>'
      },
      {
        regex: /\b(aujourd'hui|today|demain|tomorrow)\b/gi,
        replacement: '<span class="inline-flex items-center gap-0.5 font-semibold text-red-500 dark:text-red-400"><span>📆</span>$1</span>'
      },

      // === CASE/DOSSIER NUMBERS ===
      {
        regex: /dossier\s+([A-Z0-9\-\/]+)/gi,
        replacement: 'dossier <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$1</span>'
      },
      {
        regex: /\baffaire\s+([A-Z0-9\-\/]+)/gi,
        replacement: 'affaire <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$1</span>'
      },
      {
        regex: /case\s+([A-Z0-9\-\/]+)/gi,
        replacement: 'case <span class="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><span>📁</span>$1</span>'
      }
    ];

    patterns.forEach(({ regex, replacement }) => {
      result = result.replace(regex, replacement);
    });

    return result;
  };

  return (
    <PageLayout>
      <PageHeader
        title={t("center.title")}
        subtitle={t("center.subtitle", { total: notifications.length, unread: unreadCount })}
        icon="fas fa-bell"
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                {t("center.actions.markAll")}
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (await confirm({
                    title: t("center.actions.clearAll.title"),
                    message: t("center.actions.clearAll.message"),
                    confirmText: t("center.actions.clearAll.confirm"),
                    cancelText: t("center.actions.clearAll.cancel"),
                    variant: "danger",
                  })) {
                    clearAll();
                  }
                }}
                className="px-4 py-2 border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg font-medium transition-colors"
              >
                {t("center.actions.clearAll.label")}
              </button>
            )}
          </div>
        }
      />

      <ContentSection>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("center.filters.status.label")}</span>
              {["all", "unread", "read"].map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${filter === value
                    ? "bg-blue-600 text-white border-blue-600"
                    : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                    }`}
                >
                  {value === "all"
                    ? t("center.filters.status.options.all")
                    : value === "unread"
                      ? t("center.filters.status.options.unread")
                      : t("center.filters.status.options.read")}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{t("center.filters.type.label")}</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">{t("center.filters.type.options.all")}</option>
                {allAvailableTypes.map((type) => (
                  <option key={type} value={type}>
                    {t(`center.types.${type}`, { defaultValue: type })}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredNotifications.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                {t("center.empty")}
              </p>
            )}
            {filteredNotifications.map((notification) => {
              const badge = getPriorityBadge(notification.priority);
              return (
                <div
                  key={notification.id}
                  className="py-4 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 rounded-lg transition-colors"
                >
                  <div className={`w-10 h-10 rounded-full ${getIconBackground(notification.priority)} flex items-center justify-center`}>
                    <i className={`${notification.icon || "fas fa-bell"} ${badge.text} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-semibold text-slate-900 dark:text-white">{notification.title}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1" dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message, notification.type) }}></p>
                        <div className="flex items-center gap-2 mt-2">
                          <span className={`text-[11px] px-2 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            {formatTimestamp(notification.timestamp)}
                          </span>
                          {notification.link && (
                            <button
                              onClick={() => handleNotificationClick(notification)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                            >
                              {t("center.actions.viewDetails")}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                        <button
                          onClick={() => deleteNotification(notification.id)}
                          className="text-slate-400 hover:text-red-500 transition-colors"
                          title={t("center.actions.delete")}
                        >
                          <i className="fas fa-times"></i>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </ContentSection>
    </PageLayout>
  );
}
