import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";

/**
 * NotificationDropdown (Enhanced with Context)
 * Connected to centralized notification system
 */
export default function NotificationDropdown({ isOpen, onToggle, onClose }) {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
  const {
    notifications,
    unreadCount,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotifications();

  const dropdownRef = useRef(null);

  // Show only recent 5 notifications in dropdown
  const recentNotifications = notifications.slice(0, 5);

  const toggleDropdown = (e) => {
    e.stopPropagation();
    onToggle();
  };

  const handleNotificationClick = (notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }

    if (notification.link) {
      onClose();
      navigate(notification.link);
    }
  };

  const clearNotifications = async () => {
    if (await confirm({
      title: "Delete notifications",
      message: "Are you sure you want to delete all notifications?",
      confirmText: "Delete all",
      cancelText: "Cancel",
      variant: "danger"
    })) {
      clearAll();
      onClose();
    }
  };

  const viewAllNotifications = () => {
    onClose();
    navigate("/notifications");
  };

  const handleClickOutside = (event) => {
    if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
      onClose();
    }
  };

  const formatTimestamp = (timestamp) => {
    // SQLite CURRENT_TIMESTAMP returns UTC format: "YYYY-MM-DD HH:MM:SS"
    // Add 'Z' to indicate UTC timezone for correct parsing
    const timestampStr = timestamp.includes('T') ? timestamp : timestamp.replace(' ', 'T') + 'Z';
    const date = new Date(timestampStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins} min ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return formatDateTime(date);
  };

  const getPriorityColor = (priority) => {
    const colors = {
      urgent: "text-red-600 dark:text-red-400",
      high: "text-orange-600 dark:text-orange-400",
      success: "text-green-600 dark:text-green-400",
      warning: "text-amber-600 dark:text-amber-400",
      error: "text-red-600 dark:text-red-400",
      info: "text-blue-600 dark:text-blue-400",
    };
    return colors[priority] || colors.info;
  };

  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={`relative p-3 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-all duration-200 ${isOpen ? "bg-slate-100 dark:bg-slate-800" : ""
          }`}
        aria-label="Notifications"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-6 w-6 transition-colors duration-200 ${isOpen
            ? "text-blue-600 dark:text-blue-400"
            : "text-slate-600 dark:text-slate-200"
            }`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V4a2 2 0 10-4 0v1.341A6.002 6.002 0 006 11v3.159c0 .417-.162.82-.405 1.113L4 17h5m6 0a3 3 0 11-6 0m6 0H9"
          />
        </svg>

        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-red-500 text-white text-xs font-bold rounded-full shadow-lg animate-pulse">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-3 w-96 bg-white dark:bg-slate-800 rounded-xl shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden z-50">
          <div className="px-6 py-4 bg-gradient-to-r from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">Notifications</h3>
              <div className="flex items-center gap-2">
                <span className="text-sm text-blue-100 dark:text-blue-200">
                  {unreadCount} Unread {unreadCount > 1 ? "s" : ""}
                </span>
                {unreadCount > 0 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      markAllAsRead();
                    }}
                    className="text-xs text-white hover:text-blue-100 underline"
                    title="Mark all as read"
                  >
                    Mark all as read
                  </button>
                )}
              </div>
            </div>
          </div>

          {recentNotifications.length > 0 ? (
            <div className="max-h-[400px] overflow-y-auto scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
              {recentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group relative px-6 py-4 border-b border-slate-100 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 ${notification.link ? "cursor-pointer" : ""
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 ${getPriorityColor(notification.priority)}`}>
                      <i className={`${notification.icon || "fas fa-bell"} text-xl`}></i>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-semibold text-slate-900 dark:text-slate-100 ${!notification.read ? "" : "opacity-75"
                          }`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2"></div>
                        )}
                      </div>
                      <p className={`text-sm text-slate-600 dark:text-slate-300 mt-1 ${!notification.read ? "" : "opacity-75"
                        }`}>
                        {notification.message}
                      </p>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 block">
                        {formatTimestamp(notification.timestamp)}
                      </span>
                    </div>

                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Delete notification"
                      >
                        <i className="fas fa-times text-red-600 dark:text-red-400 text-sm"></i>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="py-12 px-6 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 mb-4">
                <i className="fas fa-bell-slash text-slate-400 dark:text-slate-500 text-2xl"></i>
              </div>
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                No notifications
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                You're all caught up!
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-slate-700 border-t border-slate-200 dark:border-slate-700">
            <button
              onClick={viewAllNotifications}
              className="px-6 py-4 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <i className="fas fa-list"></i>
              View all
            </button>
            <button
              onClick={clearNotifications}
              disabled={notifications.length === 0}
              className="px-6 py-4 text-sm font-medium text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash"></i>
              Clear all
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
