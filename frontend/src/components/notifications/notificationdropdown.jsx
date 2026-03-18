import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useTranslation } from "react-i18next";
import { useNotificationListTranslation } from "../../hooks/useNotificationTranslation";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "../ui/sheet";
import {
  formatTimestamp,
  getPriorityColor,
  renderHighlightedMessage,
} from "./formatters";

/**
 * NotificationDropdown (Enhanced with Context)
 * Connected to centralized notification system
 */
export default function NotificationDropdown({ isOpen, onToggle, onClose }) {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
  const { t } = useTranslation("notifications");
  const {
    notifications,
    markAsRead,
    markAllAsRead,
    deleteNotification,
    clearAll
  } = useNotifications();

  const dropdownRef = useRef(null);
  const [isMobile, setIsMobile] = useState(false);

  // Translate notifications on-demand based on active language
  const translatedNotifications = useNotificationListTranslation(notifications);
  const visibleNotifications = translatedNotifications.filter(
    (notification) => notification?.severity !== "error" && notification?.priority !== "error"
  );
  const unreadCount = visibleNotifications.filter((notification) => !notification.read).length;

  // Show only recent 5 notifications in dropdown
  const recentNotifications = visibleNotifications.slice(0, 5);
  const highPriorityNotifications = visibleNotifications.filter((notification) => {
    const value = String(notification.priority || "").toLowerCase();
    return ["urgent", "high", "critical"].includes(value);
  });
  const lowPriorityNotifications = visibleNotifications.filter((notification) => {
    const value = String(notification.priority || "").toLowerCase();
    return !["urgent", "high", "critical"].includes(value);
  });

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
      title: t("dropdown.actions.clearAll.title"),
      message: t("dropdown.actions.clearAll.message"),
      confirmText: t("dropdown.actions.clearAll.confirm"),
      cancelText: t("dropdown.actions.clearAll.cancel"),
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

  useEffect(() => {
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 767px)");
    const handleChange = () => setIsMobile(media.matches);
    handleChange();
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  const mobileContent = (
    <div className="flex h-full flex-col">
      <div className="flex items-start justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
            <i className="fas fa-bell text-white text-sm"></i>
          </div>
          <div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{t("dropdown.title")}</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t("dropdown.unreadCount", { count: unreadCount })}
            </p>
          </div>
        </div>
        <SheetClose className="h-9 w-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
          <i className="fas fa-times"></i>
          <span className="sr-only">{t("dropdown.actions.close", { defaultValue: "Close" })}</span>
        </SheetClose>
      </div>

      <div className="flex-1 overflow-y-auto py-4 space-y-5">
        {highPriorityNotifications.length > 0 && (
          <div className="space-y-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {t("dropdown.priority.urgent", { defaultValue: "Urgent" })}
            </h4>
            {highPriorityNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 shadow-sm ${notification.link ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${getPriorityColor(notification.priority)}`}>
                    <i className={`${notification.icon || "fas fa-bell"} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {notification.title}
                    </p>
                    <p
                      className="text-sm text-slate-600 dark:text-slate-300 mt-1"
                      dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message) }}
                    ></p>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 block">
                      {formatTimestamp(notification.timestamp, { t, formatDate, formatDateTime })}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-3">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {t("dropdown.priority.other", { defaultValue: "Other notifications" })}
          </h4>
          {lowPriorityNotifications.length > 0 ? (
            lowPriorityNotifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => handleNotificationClick(notification)}
                className={`group rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-4 shadow-sm ${notification.link ? "cursor-pointer" : ""}`}
              >
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${getPriorityColor(notification.priority)}`}>
                    <i className={`${notification.icon || "fas fa-bell"} text-lg`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {notification.title}
                    </p>
                    <p
                      className="text-sm text-slate-600 dark:text-slate-300 mt-1"
                      dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message) }}
                    ></p>
                    <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 block">
                      {formatTimestamp(notification.timestamp, { t, formatDate, formatDateTime })}
                    </span>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="py-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {t("dropdown.empty.subtitle")}
            </div>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 divide-x divide-slate-200/70 dark:divide-slate-700/60 border-t border-slate-200/70 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/50">
        <button
          onClick={viewAllNotifications}
          className="px-6 py-3.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors duration-200 flex items-center justify-center gap-2"
        >
          <i className="fas fa-list"></i>
          {t("dropdown.actions.viewAll")}
        </button>
        <button
          onClick={clearNotifications}
          disabled={visibleNotifications.length === 0}
          className="px-6 py-3.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <i className="fas fa-trash"></i>
          {t("dropdown.actions.clear")}
        </button>
      </div>
    </div>
  );

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={toggleDropdown}
        className={`relative p-3 rounded-full border border-transparent hover:border-slate-200/80 dark:hover:border-slate-700/70 hover:bg-white/80 dark:hover:bg-slate-900/60 focus:outline-none focus:ring-2 focus:ring-blue-500/60 transition-all duration-200 ${isOpen ? "bg-white/90 dark:bg-slate-900/70 border-slate-200/80 dark:border-slate-700/70 shadow-sm" : ""
          }`}
        aria-label={t("dropdown.aria")}
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
          <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[20px] h-5 px-1.5 bg-gradient-to-r from-rose-500 to-red-500 text-white text-xs font-bold rounded-full shadow-lg shadow-red-500/30 ring-2 ring-white dark:ring-slate-900">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {!isMobile && (
        <div
          className={`absolute right-0 mt-3 w-[26rem] bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-2xl border border-slate-200/80 dark:border-slate-700/70 overflow-hidden z-50 shadow-2xl ${isOpen ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{
            clipPath: isOpen ? "circle(150% at 90% 0%)" : "circle(0% at 90% 0%)",
            transition: isOpen
              ? "clip-path 420ms cubic-bezier(0.34, 1.3, 0.64, 1)"
              : "clip-path 220ms cubic-bezier(0.4, 0, 1, 1)",
          }}
        >
          <div className="px-5 py-4 bg-slate-50/90 dark:bg-slate-800/70 border-b border-slate-200/70 dark:border-slate-700/60">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-500/25">
                  <i className="fas fa-bell text-white text-sm"></i>
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t("dropdown.title")}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {t("dropdown.unreadCount", { count: unreadCount })}
                  </p>
                </div>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    markAllAsRead();
                  }}
                  className="px-2.5 py-1 text-xs font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-lg hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors"
                  title={t("dropdown.actions.markAll")}
                >
                  {t("dropdown.actions.markAll")}
                </button>
              )}
            </div>
          </div>

          {recentNotifications.length > 0 ? (
            <div className="max-h-[420px] overflow-y-auto scrollbar-default">
              {recentNotifications.map((notification) => (
                <div
                  key={notification.id}
                  onClick={() => handleNotificationClick(notification)}
                  className={`group relative px-5 py-4 border-b border-slate-100/80 dark:border-slate-800/60 hover:bg-slate-100/70 dark:hover:bg-slate-800/60 transition-colors duration-200 ${notification.link ? "cursor-pointer" : ""
                    }`}
                >
                  <div className="flex items-start gap-4">
                    <div className={`flex-shrink-0 w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center ${getPriorityColor(notification.priority)}`}>
                      <i className={`${notification.icon || "fas fa-bell"} text-lg`}></i>
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p className={`font-semibold text-slate-900 dark:text-slate-100 ${!notification.read ? "" : "opacity-75"
                          }`}>
                          {notification.title}
                        </p>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-2 ring-4 ring-blue-500/10"></div>
                        )}
                      </div>
                      <p className={`text-sm text-slate-600 dark:text-slate-300 mt-1 ${!notification.read ? "" : "opacity-75"
                        }`}
                        dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message) }}
                      >
                      </p>
                      <span className="text-xs text-slate-500 dark:text-slate-400 mt-2 block">
                        {formatTimestamp(notification.timestamp, { t, formatDate, formatDateTime })}
                      </span>
                    </div>

                    <div className="flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notification.id);
                        }}
                        className="p-2 hover:bg-red-100 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title={t("dropdown.actions.deleteOne")}
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
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
                <i className="fas fa-bell-slash text-slate-400 dark:text-slate-500 text-2xl"></i>
              </div>
              <p className="text-slate-600 dark:text-slate-400 font-medium">
                {t("dropdown.empty.title")}
              </p>
              <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">
                {t("dropdown.empty.subtitle")}
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 divide-x divide-slate-200/70 dark:divide-slate-700/60 border-t border-slate-200/70 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/50">
            <button
              onClick={viewAllNotifications}
              className="px-6 py-3.5 text-sm font-semibold text-blue-600 dark:text-blue-400 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors duration-200 flex items-center justify-center gap-2"
            >
              <i className="fas fa-list"></i>
              {t("dropdown.actions.viewAll")}
            </button>
            <button
              onClick={clearNotifications}
              disabled={visibleNotifications.length === 0}
              className="px-6 py-3.5 text-sm font-semibold text-red-600 dark:text-red-400 hover:bg-white/80 dark:hover:bg-slate-800/70 transition-colors duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <i className="fas fa-trash"></i>
              {t("dropdown.actions.clear")}
            </button>
          </div>
        </div>
      )}

      {isMobile && (
        <Sheet open={isOpen} onOpenChange={(open) => { if (!open) onClose(); }}>
          <SheetContent side="right" className="w-full sm:max-w-full">
            <SheetHeader>
              <SheetTitle className="sr-only">{t("dropdown.title")}</SheetTitle>
            </SheetHeader>
            {mobileContent}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
