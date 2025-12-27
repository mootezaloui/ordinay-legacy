import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import ContentSection from "../layout/ContentSection";

/**
 * NotificationCenter Page
 * Full notification history with filtering and management
 */
export default function NotificationCenter() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
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

  const filteredNotifications = notifications.filter((notification) => {
    if (filter === "unread" && notification.read) return false;
    if (filter === "read" && !notification.read) return false;

    if (typeFilter !== "all" && notification.type !== typeFilter) return false;

    return true;
  });

  const notificationTypes = [...new Set(notifications.map((n) => n.type))];

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
    } else if (diffDays < 7) {
      return `${date.toLocaleDateString("fr-FR", { weekday: "long" })} · ${formatDateTime(date)}`;
    }
    return formatDateTime(date);
  };

  const getPriorityBadge = (priority) => {
    const badges = {
      urgent: {
        bg: "bg-red-100 dark:bg-red-900/30",
        text: "text-red-700 dark:text-red-400",
        label: "Urgent",
      },
      high: {
        bg: "bg-orange-100 dark:bg-orange-900/30",
        text: "text-orange-700 dark:text-orange-400",
        label: "Haute",
      },
      success: {
        bg: "bg-green-100 dark:bg-green-900/30",
        text: "text-green-700 dark:text-green-400",
        label: "Succès",
      },
      info: {
        bg: "bg-blue-100 dark:bg-blue-900/30",
        text: "text-blue-700 dark:text-blue-400",
        label: "Info",
      },
    };
    return badges[priority] || badges.info;
  };

  const getIconBackground = (priority) =>
    priority === "urgent"
      ? "bg-red-100 dark:bg-red-900/30"
      : "bg-blue-100 dark:bg-blue-900/30";

  return (
    <PageLayout>
      <PageHeader
        title="Notification Center"
        subtitle={`${notifications.length} notification${notifications.length > 1 ? "s" : ""} in total · ${unreadCount} unread${unreadCount > 1 ? "s" : ""}`}
        icon="fas fa-bell"
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                Mark all as read
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (await confirm({
                    title: "Delete all notifications",
                    message: "This action will permanently delete all notifications.",
                    confirmText: "Delete",
                    cancelText: "Cancel",
                    variant: "danger",
                  })) {
                    clearAll();
                  }
                }}
                className="px-4 py-2 border border-red-300 dark:border-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 text-red-700 dark:text-red-300 rounded-lg font-medium transition-colors"
              >
                Clear all
              </button>
            )}
          </div>
        }
      />

      <ContentSection>
        <div className="p-6 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Status:</span>
              {["all", "unread", "read"].map((value) => (
                <button
                  key={value}
                  onClick={() => setFilter(value)}
                  className={`px-3 py-1.5 rounded-full text-sm border ${filter === value
                      ? "bg-blue-600 text-white border-blue-600"
                      : "border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300"
                    }`}
                >
                  {value === "all" ? "All" : value === "unread" ? "Unread" : "Read"}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Type:</span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800 text-sm"
              >
                <option value="all">All</option>
                {notificationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="divide-y divide-slate-200 dark:divide-slate-700">
            {filteredNotifications.length === 0 && (
              <p className="text-sm text-slate-500 dark:text-slate-400 py-6 text-center">
                No notifications to display
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
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{notification.message}</p>
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
                              View Details
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
                          title="Delete"
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
