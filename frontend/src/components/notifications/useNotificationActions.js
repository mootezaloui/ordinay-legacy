import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useNotifications } from "../../contexts/NotificationContext";
import { useConfirm } from "../../contexts/ConfirmContext";
import { useSettings } from "../../contexts/SettingsContext";
import { useData } from "../../contexts/DataContext";
import { useToast } from "../../contexts/ToastContext";
import {
  isTaskDoneStatus,
  isTaskCancelledStatus,
  isSessionCompletedStatus,
  isSessionCancelledStatus,
  isMissionCompletedStatus,
  isMissionCancelledStatus,
} from "./predicates";

/**
 * Extract email addresses from participants array/string
 */
function extractParticipantEmails(participants) {
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
}

/**
 * Hook providing notification action handlers for NotificationCenter
 * Returns all handlers for marking entities as done/cancelled/inactive etc.
 */
export function useNotificationActions() {
  const navigate = useNavigate();
  const { confirm } = useConfirm();
  const { formatDate } = useSettings();
  const { t } = useTranslation("notifications");
  const { showToast } = useToast();
  const {
    clients,
    updateClient,
    dossiers,
    updateDossier,
    tasks,
    updateTask,
    sessions,
    updateSession,
    missions,
    updateMissionStatus,
    financialEntries,
    updateFinancialEntryStatus,
  } = useData();
  const { markAsRead, deleteNotification } = useNotifications();

  const handleNotificationClick = useCallback((notification) => {
    if (!notification.read) {
      markAsRead(notification.id);
    }
    if (notification.link) {
      navigate(notification.link);
    }
  }, [markAsRead, navigate]);

  const handleMarkClientInactive = useCallback(async (notification, event) => {
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
  }, [clients, updateClient, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkDossierOnHold = useCallback(async (notification, event) => {
    event.stopPropagation();

    const dossierId = notification?.entityId;
    if (!dossierId) return;

    const dossier = dossiers.find((item) => item.id === dossierId);
    const dossierNumber =
      notification?.params?.dossierNumber ||
      dossier?.lawsuitNumber ||
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
  }, [dossiers, updateDossier, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkTaskDone = useCallback(async (notification, event) => {
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
  }, [tasks, updateTask, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkTaskCancelled = useCallback(async (notification, event) => {
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
  }, [tasks, updateTask, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkSessionCompleted = useCallback(async (notification, event) => {
    event.stopPropagation();

    const sessionId = notification?.entityId;
    if (!sessionId) return;

    const session = sessions.find((item) => item.id === sessionId);
    const sessionTitle =
      notification?.params?.sessionTitle ||
      notification?.params?.lawsuitNumber ||
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
  }, [sessions, updateSession, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkSessionCancelled = useCallback(async (notification, event) => {
    event.stopPropagation();

    const sessionId = notification?.entityId;
    if (!sessionId) return;

    const session = sessions.find((item) => item.id === sessionId);
    const sessionTitle =
      notification?.params?.sessionTitle ||
      notification?.params?.lawsuitNumber ||
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
  }, [sessions, updateSession, confirm, t, showToast, markAsRead, deleteNotification]);

  const handleMarkMissionCompleted = useCallback(async (notification, event) => {
    event.stopPropagation();

    const missionId = notification?.entityId;
    if (!missionId) return;

    const mission = missions.find((item) => item.id === missionId);
    const missionTitle =
      notification?.params?.missionTitle ||
      mission?.title ||
      mission?.missionNumber ||
      t("center.types.mission");

    if (isMissionCompletedStatus(mission?.status)) {
      showToast(t("center.actions.markMissionCompleted.alreadyCompleted", { missionTitle }), "info");
      return;
    }
    if (isMissionCancelledStatus(mission?.status)) {
      showToast(t("center.actions.markMissionCompleted.alreadyCancelled", { missionTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markMissionCompleted.title"),
      message: t("center.actions.markMissionCompleted.message", { missionTitle }),
      confirmText: t("center.actions.markMissionCompleted.confirm"),
      cancelText: t("center.actions.markMissionCompleted.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateMissionStatus(missionId, "Completed", true);
    if (result?.ok === false) {
      showToast(t("center.actions.markMissionCompleted.failed", { missionTitle }), "error");
      return;
    }

    deleteNotification(notification.id);
    showToast(t("center.actions.markMissionCompleted.success", { missionTitle }), "success");
  }, [missions, updateMissionStatus, confirm, t, showToast, deleteNotification]);

  const handleMarkMissionCancelled = useCallback(async (notification, event) => {
    event.stopPropagation();

    const missionId = notification?.entityId;
    if (!missionId) return;

    const mission = missions.find((item) => item.id === missionId);
    const missionTitle =
      notification?.params?.missionTitle ||
      mission?.title ||
      mission?.missionNumber ||
      t("center.types.mission");

    if (isMissionCancelledStatus(mission?.status)) {
      showToast(t("center.actions.markMissionCancelled.alreadyCancelled", { missionTitle }), "info");
      return;
    }
    if (isMissionCompletedStatus(mission?.status)) {
      showToast(t("center.actions.markMissionCancelled.alreadyCompleted", { missionTitle }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markMissionCancelled.title"),
      message: t("center.actions.markMissionCancelled.message", { missionTitle }),
      confirmText: t("center.actions.markMissionCancelled.confirm"),
      cancelText: t("center.actions.markMissionCancelled.cancel"),
      variant: "warning",
    });

    if (!confirmed) return;

    const result = await updateMissionStatus(missionId, "Cancelled", true);
    if (result?.ok === false) {
      showToast(t("center.actions.markMissionCancelled.failed", { missionTitle }), "error");
      return;
    }

    deleteNotification(notification.id);
    showToast(t("center.actions.markMissionCancelled.success", { missionTitle }), "success");
  }, [missions, updateMissionStatus, confirm, t, showToast, deleteNotification]);

  const handleSendParticipantReminder = useCallback(async (notification, event) => {
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
  }, [sessions, formatDate, confirm, t, showToast, markAsRead]);

  const handleMarkFinancialPaid = useCallback(async (notification, event) => {
    event.stopPropagation();

    const financialEntryId =
      notification?.params?.financialEntryId || notification?.entityId;
    if (!financialEntryId) return;

    const entry = financialEntries.find((item) => item.id === financialEntryId);
    const entryLabel =
      notification?.params?.description ||
      entry?.description ||
      t("center.types.financialEntry");

    if (entry?.status === "paid" || entry?.status === "Paid") {
      showToast(t("center.actions.markFinancialPaid.alreadyPaid", { entryLabel }), "info");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.markFinancialPaid.title"),
      message: t("center.actions.markFinancialPaid.message", { entryLabel }),
      confirmText: t("center.actions.markFinancialPaid.confirm"),
      cancelText: t("center.actions.markFinancialPaid.cancel"),
      variant: "warning",
    });
    if (!confirmed) return;

    const result = await updateFinancialEntryStatus(financialEntryId, "paid", true);
    if (result?.ok === false) {
      showToast(t("center.actions.markFinancialPaid.failed", { entryLabel }), "error");
      return;
    }

    deleteNotification(notification.id);
    showToast(t("center.actions.markFinancialPaid.success", { entryLabel }), "success");
  }, [financialEntries, updateFinancialEntryStatus, confirm, t, showToast, deleteNotification]);

  const handleSendPaymentReminder = useCallback(async (notification, event) => {
    event.stopPropagation();

    const params = notification?.params || {};
    const clientId = params.clientId || params.client_id;
    const client = clients.find((item) => item.id === clientId);
    const clientName = params.clientName || client?.name || t("center.types.client");
    const clientEmail = params.clientEmail || client?.email;

    if (!clientEmail) {
      showToast(t("center.actions.sendPaymentReminder.noEmail", { clientName }), "error");
      return;
    }

    const confirmed = await confirm({
      title: t("center.actions.sendPaymentReminder.title"),
      message: t("center.actions.sendPaymentReminder.message", { clientName }),
      confirmText: t("center.actions.sendPaymentReminder.confirm"),
      cancelText: t("center.actions.sendPaymentReminder.cancel"),
    });
    if (!confirmed) return;

    const subject = t("center.actions.sendPaymentReminder.emailSubject", {
      clientName,
      amount: params.amount,
      dueDate: params.dueDate || params.due_date,
    });
    const body = t("center.actions.sendPaymentReminder.emailBody", {
      clientName,
      amount: params.amount,
      dueDate: params.dueDate || params.due_date,
    });

    const mailto = `mailto:${clientEmail}?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;

    deleteNotification(notification.id);
    showToast(t("center.actions.sendPaymentReminder.success", { clientName }), "success");
  }, [clients, confirm, t, showToast, deleteNotification]);

  return {
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
  };
}

