import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
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

  // Apply filters
  const filteredNotifications = notifications.filter((notification) => {
    // Read/unread filter
    if (filter === "unread" && notification.read) return false;
    if (filter === "read" && !notification.read) return false;

    // Type filter
    if (typeFilter !== "all" && notification.type !== typeFilter) return false;

    return true;
  });

  // Get notification types for filter
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
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffHours < 24) {
      return date.toLocaleTimeString("fr-FR", {
        hour: "2-digit",
        minute: "2-digit",
      });
    } else if (diffDays < 7) {
      return date.toLocaleDateString("fr-FR", {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
      });
    } else {
      return date.toLocaleDateString("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    }
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

  return (
    <PageLayout>
      <PageHeader
        title="Centre de Notifications"
        subtitle={`${notifications.length} notification${
          notifications.length > 1 ? "s" : ""
        } au total • ${unreadCount} non lue${unreadCount > 1 ? "s" : ""}`}
        icon="fas fa-bell"
        actions={
          <div className="flex items-center gap-3">
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="px-4 py-2 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-colors"
              >
                <i className="fas fa-check-double mr-2"></i>
                Tout marquer comme lu
              </button>
            )}
            {notifications.length > 0 && (
              <button
                onClick={async () => {
                  if (await confirm({
                    title: "Supprimer les notifications",
                    message: "Êtes-vous sûr de vouloir supprimer toutes les notifications ?",
                    confirmText: "Supprimer tout",
                    cancelText: "Annuler",
                    variant: "danger"
                  })) {
                    clearAll();
                  }
                }}
                className="px-4 py-2 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/20 text-red-600 dark:text-red-400 rounded-lg font-medium transition-colors"
              >
                <i className="fas fa-trash mr-2"></i>
                Tout supprimer
              </button>
            )}
          </div>
        }
      />

      <ContentSection>
        {/* Filters */}
        <div className="p-6 border-b border-slate-200 dark:border-slate-700">
          <div className="flex flex-wrap items-center gap-4">
            {/* Read Status Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Statut:
              </span>
              <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
                {["all", "unread", "read"].map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                      filter === f
                        ? "bg-white dark:bg-slate-600 text-blue-600 dark:text-blue-400 shadow-sm"
                        : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
                    }`}
                  >
                    {f === "all"
                      ? "Toutes"
                      : f === "unread"
                      ? "Non lues"
                      : "Lues"}
                  </button>
                ))}
              </div>
            </div>

            {/* Type Filter */}
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                Type:
              </span>
              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-1 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-600 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">Tous les types</option>
                {notificationTypes.map((type) => (
                  <option key={type} value={type}>
                    {type.charAt(0).toUpperCase() + type.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Results count */}
            <div className="ml-auto text-sm text-slate-500 dark:text-slate-400">
              {filteredNotifications.length} notification
              {filteredNotifications.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>

        {/* Notifications List */}
        <div className="divide-y divide-slate-200 dark:divide-slate-700">
          {filteredNotifications.length > 0 ? (
            filteredNotifications.map((notification) => {
              const priorityBadge = getPriorityBadge(notification.priority);

              return (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group p-6 transition-colors ${
                    notification.link
                      ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                      : ""
                  } ${!notification.read ? "bg-blue-50/30 dark:bg-blue-900/5" : ""}`}
                >
                  <div className="flex items-start gap-4">
                    {/* Icon */}
                    <div
                      className={`flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center ${
                        !notification.read
                          ? "bg-blue-100 dark:bg-blue-900/30"
                          : "bg-slate-100 dark:bg-slate-700"
                      }`}
                    >
                      <i
                        className={`${notification.icon || "fas fa-bell"} ${
                          !notification.read
                            ? "text-blue-600 dark:text-blue-400"
                            : "text-slate-500 dark:text-slate-400"
                        }`}
                      ></i>
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <h3
                          className={`font-semibold text-slate-900 dark:text-white ${
                            !notification.read ? "" : "opacity-75"
                          }`}
                        >
                          {notification.title}
                        </h3>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          {/* Priority Badge */}
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${priorityBadge.bg} ${priorityBadge.text}`}
                          >
                            {priorityBadge.label}
                          </span>
                          {/* Unread Indicator */}
                          {!notification.read && (
                            <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                          )}
                        </div>
                      </div>

                      <p
                        className={`text-sm text-slate-600 dark:text-slate-400 mb-2 ${
                          !notification.read ? "" : "opacity-75"
                        }`}
                      >
                        {notification.message}
                      </p>

                      <div className="flex items-center gap-4">
                        <span className="text-xs text-slate-500 dark:text-slate-500">
                          <i className="fas fa-clock mr-1"></i>
                          {formatTimestamp(notification.timestamp)}
                        </span>
                        {notification.type && (
                          <span className="text-xs text-slate-500 dark:text-slate-500">
                            <i className="fas fa-tag mr-1"></i>
                            {notification.type}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-2">
                      {!notification.read && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            markAsRead(notification.id);
                          }}
                          className="p-2 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="Marquer comme lu"
                        >
                          <i className="fas fa-check text-blue-600 dark:text-blue-400"></i>
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Supprimer"
                      >
                        <i className="fas fa-trash text-red-600 dark:text-red-400"></i>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="py-16 px-6 text-center">
              <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-slate-100 dark:bg-slate-800 mb-4">
                <i className="fas fa-bell-slash text-slate-400 dark:text-slate-600 text-3xl"></i>
              </div>
              <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-2">
                Aucune notification
              </h3>
              <p className="text-sm text-slate-600 dark:text-slate-400">
                {filter !== "all" || typeFilter !== "all"
                  ? "Aucune notification ne correspond aux filtres sélectionnés."
                  : "Vous n'avez aucune notification pour le moment."}
              </p>
            </div>
          )}
        </div>
      </ContentSection>
    </PageLayout>
  );
}
