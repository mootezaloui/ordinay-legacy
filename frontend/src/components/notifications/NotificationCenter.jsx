import { useState } from "react";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";
import PageLayout from "../layout/PageLayout";
import PageHeader from "../layout/PageHeader";
import ContentSection from "../layout/ContentSection";
import { useTranslation } from "react-i18next";
import { NotificationTypes, VALID_NOTIFICATION_TYPES } from "../../constants/notificationTypes";
import { useNotificationListTranslation } from "../../hooks/useNotificationTranslation";
import {
  formatTimestampExtended,
  getPriorityBadge,
  getIconBackground,
  renderHighlightedMessage,
} from "./formatters";
import {
  isClientInactiveNotification,
  isDossierInactiveNotification,
  isHearingNotification,
  isParticipantReminderNotification,
  isTaskDeadlineNotification,
  isMissionNotification,
  isFinancialNotification,
  isReceivableFinancialNotification,
} from "./predicates";
import { useNotificationActions } from "./useNotificationActions";

/**
 * NotificationCenter Page
 * Full notification history with filtering and management
 */
export default function NotificationCenter() {
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
  const { t } = useTranslation("notifications");
  const {
    notifications,
    markAllAsRead,
    deleteNotification,
    clearAll,
  } = useNotifications();
  const {
    handleNotificationClick,
    handleMarkClientInactive,
    handleMarkDossierOnHold,
    handleMarkTaskDone,
    handleMarkTaskCancelled,
    handleMarkSessionCompleted,
    handleMarkSessionCancelled,
    handleMarkMissionCompleted,
    handleMarkMissionCancelled,
    handleMarkFinancialPaid,
    handleSendPaymentReminder,
    handleSendParticipantReminder,
  } = useNotificationActions();

  const [filter, setFilter] = useState("all"); // all, unread, read
  const [typeFilter, setTypeFilter] = useState("all"); // all, task, deadline, hearing, etc.

  // Translate notifications on-demand based on active language
  const translatedNotifications = useNotificationListTranslation(notifications);
  const visibleNotifications = translatedNotifications.filter(
    (notification) => notification?.severity !== "error" && notification?.priority !== "error"
  );
  const unreadCount = visibleNotifications.filter((notification) => !notification.read).length;

  const filteredNotifications = visibleNotifications.filter((notification) => {
    if (filter === "unread" && notification.read) return false;
    if (filter === "read" && !notification.read) return false;

    if (typeFilter !== "all" && notification.type !== typeFilter) return false;

    return true;
  });

  // Use all defined notification types for the filter dropdown
  // Show types that have notifications, plus all defined types
  const typesInData = new Set(visibleNotifications.map((n) => n.type));
  const allAvailableTypes = Array.from(new Set([
    ...typesInData,
    ...VALID_NOTIFICATION_TYPES
  ])).sort();

  return (
    <PageLayout>
      <PageHeader
        title={t("center.title")}
        subtitle={t("center.subtitle", { total: visibleNotifications.length, unread: unreadCount })}
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
            {visibleNotifications.length > 0 && (
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
              const badge = getPriorityBadge(notification.priority, t);
              const isClickable = Boolean(notification.link);
              const showMarkInactive = isClientInactiveNotification(notification);
              const showMarkDossierOnHold = isDossierInactiveNotification(notification);
              const showTaskQuickActions = isTaskDeadlineNotification(notification);
              const showHearingQuickActions = isHearingNotification(notification);
              const showMissionQuickActions = isMissionNotification(notification);
              const showFinancialQuickActions = isFinancialNotification(notification);
              const showPaymentReminder = isReceivableFinancialNotification(notification);
              const showParticipantReminder = isParticipantReminderNotification(notification);
              return (
                <div
                  key={notification.id}
                  onClick={isClickable ? () => handleNotificationClick(notification) : undefined}
                  className={`py-6 flex items-start gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 px-3 rounded-lg transition-colors ${isClickable ? "cursor-pointer" : ""}`}
                >
                  <div className={`w-12 h-12 rounded-full ${getIconBackground(notification.priority)} flex items-center justify-center flex-shrink-0`}>
                    <i className={`${notification.icon || "fas fa-bell"} ${badge.text} text-xl`}></i>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 space-y-2">
                        <p className="text-base font-semibold text-slate-900 dark:text-white leading-snug">{notification.title}</p>
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message) }}></p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            {formatTimestampExtended(notification.timestamp, { t, formatDate, formatDateTime })}
                          </span>
                          {showMarkInactive && (
                            <button
                              onClick={(event) => handleMarkClientInactive(notification, event)}
                              className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
                            >
                              {t("center.actions.markInactive.label")}
                            </button>
                          )}
                          {showMarkDossierOnHold && (
                            <button
                              onClick={(event) => handleMarkDossierOnHold(notification, event)}
                              className="text-sm font-medium text-amber-700 dark:text-amber-300 hover:underline"
                            >
                              {t("center.actions.markDossierOnHold.label")}
                            </button>
                          )}
                          {showTaskQuickActions && (
                            <>
                              <button
                                onClick={(event) => handleMarkTaskDone(notification, event)}
                                className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                              >
                                {t("center.actions.markTaskDone.label")}
                              </button>
                              <button
                                onClick={(event) => handleMarkTaskCancelled(notification, event)}
                                className="text-sm font-medium text-rose-700 dark:text-rose-300 hover:underline"
                              >
                                {t("center.actions.markTaskCancelled.label")}
                              </button>
                            </>
                          )}
                          {showHearingQuickActions && (
                            <>
                              <button
                                onClick={(event) => handleMarkSessionCompleted(notification, event)}
                                className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                              >
                                {t("center.actions.markSessionCompleted.label")}
                              </button>
                              <button
                                onClick={(event) => handleMarkSessionCancelled(notification, event)}
                                className="text-sm font-medium text-rose-700 dark:text-rose-300 hover:underline"
                              >
                                {t("center.actions.markSessionCancelled.label")}
                              </button>
                            </>
                          )}
                          {showMissionQuickActions && (
                            <>
                              <button
                                onClick={(event) => handleMarkMissionCompleted(notification, event)}
                                className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                              >
                                {t("center.actions.markMissionCompleted.label")}
                              </button>
                              <button
                                onClick={(event) => handleMarkMissionCancelled(notification, event)}
                                className="text-sm font-medium text-rose-700 dark:text-rose-300 hover:underline"
                              >
                                {t("center.actions.markMissionCancelled.label")}
                              </button>
                            </>
                          )}
                          {showFinancialQuickActions && (
                            <>
                              <button
                                onClick={(event) => handleMarkFinancialPaid(notification, event)}
                                className="text-sm font-medium text-emerald-700 dark:text-emerald-300 hover:underline"
                              >
                                {t("center.actions.markFinancialPaid.label")}
                              </button>
                              {showPaymentReminder && (
                                <button
                                  onClick={(event) => handleSendPaymentReminder(notification, event)}
                                  className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline"
                                >
                                  {t("center.actions.sendPaymentReminder.label")}
                                </button>
                              )}
                            </>
                          )}
                          {showParticipantReminder && (
                            <button
                              onClick={(event) => handleSendParticipantReminder(notification, event)}
                              className="text-sm font-medium text-blue-700 dark:text-blue-300 hover:underline"
                            >
                              {t("center.actions.sendHearingReminder.label")}
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {!notification.read && (
                          <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        )}
                        <button
                          onClick={(event) => {
                            event.stopPropagation();
                            deleteNotification(notification.id);
                          }}
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
