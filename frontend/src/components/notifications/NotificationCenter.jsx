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
import { useData } from "../../contexts/DataContext";
import { useToast } from "../../contexts/ToastContext";

/**
 * NotificationCenter Page
 * Full notification history with filtering and management
 */
export default function NotificationCenter() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate, formatDateTime } = useSettings();
  const { t } = useTranslation("notifications");
  const { showToast } = useToast();
  const { clients, updateClient, dossiers, updateDossier, tasks, updateTask, sessions, updateSession } = useData();
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

  const isClientInactiveNotification = (notification) =>
    notification?.entityType === "client" &&
    (notification?.subType === "inActiveClient" ||
      notification?.template_key === "content.client.inActive");

  const isDossierInactiveNotification = (notification) =>
    notification?.entityType === "dossier" &&
    (notification?.subType === "inactivityReminder" ||
      notification?.template_key === "content.dossier.inactivityReminder");

  const isHearingNotification = (notification) =>
    notification?.entityType === "session" &&
    (
      [
        "upcomingHearing",
        "participantReminder",
        "hearingToday",
        "today",
        "tomorrow",
        "preparation",
      ].includes(notification?.subType) ||
      [
        "content.session.upcomingHearing",
        "content.session.participantReminder",
        "content.session.hearingToday",
        "content.session.today",
        "content.session.todayNoTime",
        "content.session.tomorrow",
        "content.session.preparation",
      ].includes(notification?.template_key)
    );

  const isParticipantReminderNotification = (notification) =>
    notification?.entityType === "session" &&
    (notification?.subType === "participantReminder" ||
      notification?.template_key === "content.session.participantReminder");

  const isTaskDeadlineNotification = (notification) =>
    notification?.entityType === "task" &&
    (
      [
        "overdue",
        "dueToday",
        "upcoming",
        "upcomingDeadline",
        "statusCheck",
      ].includes(notification?.subType) ||
      [
        "content.task.overdue",
        "content.task.dueToday",
        "content.task.upcomingDeadline",
        "content.task.statusCheck",
      ].includes(notification?.template_key)
    );

  const normalizeStatus = (status) =>
    (status || "").toString().trim().toLowerCase();

  const isTaskDoneStatus = (status) =>
    ["done", "completed", "terminee", "termine", "terminée"].includes(normalizeStatus(status));

  const isTaskCancelledStatus = (status) =>
    ["cancelled", "canceled", "annule", "annulee", "annulée"].includes(normalizeStatus(status));

  const isSessionCompletedStatus = (status) =>
    ["completed", "terminee", "termine", "terminée"].includes(normalizeStatus(status));

  const isSessionCancelledStatus = (status) =>
    ["cancelled", "canceled", "annule", "annulee", "annulée"].includes(normalizeStatus(status));

  const extractParticipantEmails = (participants) => {
    const emails = new Set();
    const emailRegex = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;

    const addEmail = (value) => {
      if (!value || typeof value !== "string") return;
      const match = value.match(emailRegex);
      if (match) {
        emails.add(match[0]);
      }
    };

    if (Array.isArray(participants)) {
      participants.forEach((participant) => {
        if (typeof participant === "string") {
          addEmail(participant);
          return;
        }
        if (participant && typeof participant === "object") {
          addEmail(participant.email);
          addEmail(participant.email_address);
          addEmail(participant.emailAddress);
        }
      });
    } else if (typeof participants === "string") {
      addEmail(participants);
    }

    return Array.from(emails);
  };

  const handleMarkClientInactive = async (notification, event) => {
    event.stopPropagation();

    const clientId = notification?.entityId;
    if (!clientId) return;

    const client = clients.find((item) => item.id === clientId);
    const clientName =
      notification?.params?.clientName || client?.name || t("center.types.client");

    if (client?.status === "inActive" || client?.status === "Inactive") {
      showToast(t("center.actions.markInactive.alreadyInactive", { clientName }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markInactive.title"),
      message: t("center.actions.markInactive.message", { clientName }),
      confirmText: t("center.actions.markInactive.confirm"),
      cancelText: t("center.actions.markInactive.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateClient(clientId, { status: "inActive" });
    if (result?.ok === false) {
      showToast(t("center.actions.markInactive.failed", { clientName }), "error");
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(t("center.actions.markInactive.success", { clientName }), "success");
  };

  const handleMarkDossierOnHold = async (notification, event) => {
    event.stopPropagation();

    const dossierId = notification?.entityId;
    if (!dossierId) return;

    const dossier = dossiers.find((item) => item.id === dossierId);
    const dossierNumber =
      notification?.params?.dossierNumber ||
      dossier?.caseNumber ||
      dossier?.reference ||
      dossier?.title ||
      t("center.types.dossier");

    if (dossier?.status === "on_hold") {
      showToast(
        t("center.actions.markDossierOnHold.alreadyOnHold", { dossierNumber }),
        "info"
      );
      return;
    }
    if (dossier?.status === "closed") {
      showToast(
        t("center.actions.markDossierOnHold.alreadyClosed", { dossierNumber }),
        "info"
      );
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markDossierOnHold.title"),
      message: t("center.actions.markDossierOnHold.message", { dossierNumber }),
      confirmText: t("center.actions.markDossierOnHold.confirm"),
      cancelText: t("center.actions.markDossierOnHold.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateDossier(dossierId, { status: "on_hold" });
    if (result?.ok === false) {
      showToast(
        t("center.actions.markDossierOnHold.failed", { dossierNumber }),
        "error"
      );
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(
      t("center.actions.markDossierOnHold.success", { dossierNumber }),
      "success"
    );
  };

  const handleMarkTaskDone = async (notification, event) => {
    event.stopPropagation();

    const taskId = notification?.entityId;
    if (!taskId) return;

    const task = tasks.find((item) => item.id === taskId);
    const taskTitle =
      notification?.params?.taskTitle || task?.title || t("center.types.task");

    if (isTaskDoneStatus(task?.status)) {
      showToast(t("center.actions.markTaskDone.alreadyDone", { taskTitle }), "info");
      return;
    }
    if (isTaskCancelledStatus(task?.status)) {
      showToast(t("center.actions.markTaskDone.alreadyCancelled", { taskTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markTaskDone.title"),
      message: t("center.actions.markTaskDone.message", { taskTitle }),
      confirmText: t("center.actions.markTaskDone.confirm"),
      cancelText: t("center.actions.markTaskDone.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateTask(taskId, {
      status: "done",
      completedAt: new Date().toISOString(),
    });
    if (result?.ok === false) {
      showToast(t("center.actions.markTaskDone.failed", { taskTitle }), "error");
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(t("center.actions.markTaskDone.success", { taskTitle }), "success");
  };

  const handleMarkTaskCancelled = async (notification, event) => {
    event.stopPropagation();

    const taskId = notification?.entityId;
    if (!taskId) return;

    const task = tasks.find((item) => item.id === taskId);
    const taskTitle =
      notification?.params?.taskTitle || task?.title || t("center.types.task");

    if (isTaskCancelledStatus(task?.status)) {
      showToast(t("center.actions.markTaskCancelled.alreadyCancelled", { taskTitle }), "info");
      return;
    }
    if (isTaskDoneStatus(task?.status)) {
      showToast(t("center.actions.markTaskCancelled.alreadyDone", { taskTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markTaskCancelled.title"),
      message: t("center.actions.markTaskCancelled.message", { taskTitle }),
      confirmText: t("center.actions.markTaskCancelled.confirm"),
      cancelText: t("center.actions.markTaskCancelled.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateTask(taskId, { status: "cancelled" });
    if (result?.ok === false) {
      showToast(t("center.actions.markTaskCancelled.failed", { taskTitle }), "error");
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(t("center.actions.markTaskCancelled.success", { taskTitle }), "success");
  };

  const handleMarkSessionCompleted = async (notification, event) => {
    event.stopPropagation();

    const sessionId = notification?.entityId;
    if (!sessionId) return;

    const session = sessions.find((item) => item.id === sessionId);
    const sessionTitle =
      notification?.params?.sessionTitle ||
      notification?.params?.caseNumber ||
      session?.title ||
      t("center.types.session");

    if (isSessionCompletedStatus(session?.status)) {
      showToast(t("center.actions.markSessionCompleted.alreadyCompleted", { sessionTitle }), "info");
      return;
    }
    if (isSessionCancelledStatus(session?.status)) {
      showToast(t("center.actions.markSessionCompleted.alreadyCancelled", { sessionTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markSessionCompleted.title"),
      message: t("center.actions.markSessionCompleted.message", { sessionTitle }),
      confirmText: t("center.actions.markSessionCompleted.confirm"),
      cancelText: t("center.actions.markSessionCompleted.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateSession(sessionId, { status: "completed" });
    if (result?.ok === false) {
      showToast(t("center.actions.markSessionCompleted.failed", { sessionTitle }), "error");
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(t("center.actions.markSessionCompleted.success", { sessionTitle }), "success");
  };

  const handleMarkSessionCancelled = async (notification, event) => {
    event.stopPropagation();

    const sessionId = notification?.entityId;
    if (!sessionId) return;

    const session = sessions.find((item) => item.id === sessionId);
    const sessionTitle =
      notification?.params?.sessionTitle ||
      notification?.params?.caseNumber ||
      session?.title ||
      t("center.types.session");

    if (isSessionCancelledStatus(session?.status)) {
      showToast(t("center.actions.markSessionCancelled.alreadyCancelled", { sessionTitle }), "info");
      return;
    }
    if (isSessionCompletedStatus(session?.status)) {
      showToast(t("center.actions.markSessionCancelled.alreadyCompleted", { sessionTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markSessionCancelled.title"),
      message: t("center.actions.markSessionCancelled.message", { sessionTitle }),
      confirmText: t("center.actions.markSessionCancelled.confirm"),
      cancelText: t("center.actions.markSessionCancelled.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateSession(sessionId, { status: "cancelled" });
    if (result?.ok === false) {
      showToast(t("center.actions.markSessionCancelled.failed", { sessionTitle }), "error");
      return;
    }

    markAsRead(notification.id);
    deleteNotification(notification.id);
    showToast(t("center.actions.markSessionCancelled.success", { sessionTitle }), "success");
  };

  const handleSendParticipantReminder = async (notification, event) => {
    event.stopPropagation();

    const sessionId = notification?.entityId;
    const params = notification?.params || {};
    const session = sessions.find((item) => item.id === sessionId);

    const sessionTitle =
      params.sessionTitle || session?.title || t("center.types.session");
    const scheduledDate =
      params.scheduledDate || session?.scheduled_at || session?.scheduledAt;
    const dateLabel = scheduledDate ? formatDate(scheduledDate) : "";
    const timeLabel = params.time || "";
    const location = params.location || session?.location || "";
    const courtRoom = params.courtRoom || session?.court_room || session?.courtRoom || "";
    const sessionType = params.sessionType || session?.session_type || session?.sessionType || "";
    const participants = params.participants || session?.participants || [];
    const emails = extractParticipantEmails(participants);

    if (emails.length === 0) {
      showToast(
        t("center.actions.sendHearingReminder.noEmails", { sessionTitle }),
        "error"
      );
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.sendHearingReminder.title"),
      message: t("center.actions.sendHearingReminder.message", {
        sessionTitle,
        count: emails.length,
      }),
      confirmText: t("center.actions.sendHearingReminder.confirm"),
      cancelText: t("center.actions.sendHearingReminder.cancel"),
    });
    if (!confirmed) return;

    const subject = t("center.actions.sendHearingReminder.emailSubject", {
      sessionTitle,
      date: dateLabel,
      time: timeLabel,
    });
    const body = t("center.actions.sendHearingReminder.emailBody", {
      sessionTitle,
      date: dateLabel,
      time: timeLabel,
      location,
      courtRoom,
      sessionType,
    });

    const mailto = `mailto:${emails.join(",")}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    showToast(
      t("center.actions.sendHearingReminder.success", { count: emails.length }),
      "success"
    );
    markAsRead(notification.id);
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
              const isClickable = Boolean(notification.link);
              const showMarkInactive = isClientInactiveNotification(notification);
              const showMarkDossierOnHold = isDossierInactiveNotification(notification);
              const showTaskQuickActions = isTaskDeadlineNotification(notification);
              const showHearingQuickActions = isHearingNotification(notification);
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
                        <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: renderHighlightedMessage(notification.message, notification.type) }}></p>
                        <div className="flex items-center gap-3 mt-3">
                          <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${badge.bg} ${badge.text}`}>
                            {badge.label}
                          </span>
                          <span className="text-sm text-slate-500 dark:text-slate-400">
                            {formatTimestamp(notification.timestamp)}
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
