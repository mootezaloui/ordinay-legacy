/**
 * Notification Generator
 * Automatically generates date-related notifications for tasks, sessions, payments, etc.
 *
 * I18N ARCHITECTURE:
 * - This generator uses the t() function to translate notification content
 * - All titles and messages are internationalized using i18n keys
 * - Dynamic values are passed as interpolation params
 */

import { t } from "../i18n";
import {
  taskNotificationTemplates,
  sessionNotificationTemplates,
  paymentNotificationTemplates,
  missionNotificationTemplates,
  deadlineNotificationTemplates,
  dossierNotificationTemplates,
  domainEventTemplates,
  getRandomTemplate,
  calculateDaysDifference,
  calculateHoursDifference,
  resolveEntityLink,
  getMissionDisplayTitle,
} from "./notificationTemplates";

/**
 * Base notification builder with dedupe-friendly IDs and link resolver
 */
function buildNotification({
  entityType,
  entityId,
  subType,
  priority,
  title,
  message,
  icon,
  timestamp = new Date().toISOString(),
  metadata = {},
  linkContext = {},
  linkOverride = null,
}) {
  const link =
    linkOverride !== null
      ? linkOverride
      : resolveEntityLink(entityType, {
          entityType,
          entityId,
          ...metadata,
          ...linkContext,
        });

  return {
    id: `${entityType || "system"}_${subType || "event"}_${
      entityId || Math.random().toString(16).slice(2)
    }`,
    type: entityType,
    subType,
    priority,
    entityId,
    entityType,
    title,
    message,
    icon,
    timestamp,
    read: false,
    link,
    metadata,
  };
}

/**
 * Generate notifications for tasks
 * Uses i18n keys for title and message translation
 */
export function generateTaskNotifications(tasks) {
  const notifications = [];
  const now = new Date();

  tasks.forEach((task) => {
    if (!task.dueDate || task.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(task.dueDate, now);

    // Overdue tasks
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "overdue",
          priority: "urgent",
          title: t("notifications:content.task.overdue.title", {
            count: daysOverdue,
          }),
          message: t("notifications:content.task.overdue.message", {
            taskTitle: task.title,
            count: daysOverdue,
          }),
          icon: "fas fa-exclamation-circle",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            daysOverdue,
            dueDate: task.dueDate,
          },
        })
      );
    }
    // Due today
    else if (daysLeft === 0) {
      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "dueToday",
          priority: "high",
          title: t("notifications:content.task.dueToday.title"),
          message: t("notifications:content.task.dueToday.message", {
            taskTitle: task.title,
          }),
          icon: "fas fa-clock",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.dueDate,
          },
        })
      );
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "upcoming",
          priority: daysLeft <= 2 ? "high" : "medium",
          title: t("notifications:content.task.upcomingDeadline.title", {
            count: daysLeft,
          }),
          message: t("notifications:content.task.upcomingDeadline.message", {
            taskTitle: task.title,
            count: daysLeft,
          }),
          icon: "fas fa-tasks",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            daysLeft,
            dueDate: task.dueDate,
          },
        })
      );
    }

    // Status check for tasks in progress (every 3 days)
    if (task.status === "En cours" && daysLeft > 0 && daysLeft <= 14) {
      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "statusCheck",
          priority: "info",
          title: t("notifications:content.task.statusCheck.title"),
          message: t("notifications:content.task.statusCheck.message", {
            taskTitle: task.title,
            dueDate: task.dueDate,
          }),
          icon: "fas fa-question-circle",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.dueDate,
          },
        })
      );
    }
  });

  return notifications;
}

/**
 * Generate notifications for sessions
 */
/**
 * Generate notifications for sessions
 * Uses i18n keys for title and message translation
 */
export function generateSessionNotifications(sessions) {
  const notifications = [];
  const now = new Date();

  sessions.forEach((session) => {
    if (!session.date || session.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(session.date, now);
    const sessionTime =
      session.time ||
      t("notifications:content.session.today.messageFallback").split(" ").pop();

    // Session today
    if (daysLeft === 0) {
      notifications.push(
        buildNotification({
          entityType: "session",
          entityId: session.id,
          subType: "today",
          priority: "urgent",
          title: t("notifications:content.session.today.title"),
          message: session.time
            ? t("notifications:content.session.today.message", {
                sessionTitle: session.title,
                time: session.time,
              })
            : t("notifications:content.session.today.messageFallback", {
                sessionTitle: session.title,
              }),
          icon: "fas fa-gavel",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            date: session.date,
            time: session.time,
          },
        })
      );
    }
    // Session tomorrow
    else if (daysLeft === 1) {
      notifications.push(
        buildNotification({
          entityType: "session",
          entityId: session.id,
          subType: "tomorrow",
          priority: "high",
          title: t("notifications:content.session.tomorrow.title"),
          message: t("notifications:content.session.tomorrow.message", {
            sessionTitle: session.title,
          }),
          icon: "fas fa-calendar-day",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            date: session.date,
          },
        })
      );
    }
    // Preparation reminders (2-7 days before)
    else if (daysLeft >= 2 && daysLeft <= 7) {
      notifications.push(
        buildNotification({
          entityType: "session",
          entityId: session.id,
          subType: "preparation",
          priority: daysLeft <= 3 ? "high" : "medium",
          title: t("notifications:content.session.preparation.title"),
          message: t("notifications:content.session.preparation.message", {
            sessionTitle: session.title,
            count: daysLeft,
          }),
          icon: "fas fa-file-signature",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            daysLeft,
            date: session.date,
          },
        })
      );
    }
  });

  return notifications;
}

/**
 * Generate notifications for payments
 * Uses i18n keys for title and message translation
 */
export function generatePaymentNotifications(financialEntries) {
  const notifications = [];
  const now = new Date();

  financialEntries.forEach((entry) => {
    // Only for receivables (Revenus) with payment due dates
    if (entry.type !== "revenue" || !entry.dueDate || entry.status === "Payé")
      return;

    const daysLeft = calculateDaysDifference(entry.dueDate, now);

    const payment = {
      client: entry.clientName || entry.description,
      amount: Math.abs(entry.amount),
      daysLeft: Math.abs(daysLeft),
      daysOverdue: Math.abs(daysLeft),
      dueDate: entry.dueDate,
    };

    // Overdue payments
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      notifications.push(
        buildNotification({
          entityType: "financialEntry",
          entityId: entry.id,
          subType: "overdue",
          priority: "urgent",
          title: t("notifications:content.financial.paymentOverdue.title"),
          message: t("notifications:content.financial.paymentOverdue.message", {
            clientName: payment.client,
            amount: payment.amount,
            count: daysOverdue,
          }),
          icon: "fas fa-exclamation-triangle",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            daysOverdue: payment.daysOverdue,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          },
        })
      );
    }
    // Due today
    else if (daysLeft === 0) {
      notifications.push(
        buildNotification({
          entityType: "financialEntry",
          entityId: entry.id,
          subType: "dueToday",
          priority: "high",
          title: t("notifications:content.financial.paymentDueToday.title"),
          message: t(
            "notifications:content.financial.paymentDueToday.message",
            { clientName: payment.client, amount: payment.amount }
          ),
          icon: "fas fa-money-check-alt",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          },
        })
      );
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      notifications.push(
        buildNotification({
          entityType: "financialEntry",
          entityId: entry.id,
          subType: "upcoming",
          priority: daysLeft <= 2 ? "high" : "medium",
          title: t("notifications:content.financial.paymentReceivable.title"),
          message: t(
            "notifications:content.financial.paymentReceivable.message",
            {
              clientName: payment.client,
              amount: payment.amount,
              count: daysLeft,
            }
          ),
          icon: "fas fa-dollar-sign",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            daysLeft: payment.daysLeft,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            caseId: entry.caseId,
            missionId: entry.missionId,
          },
        })
      );
    }
  });

  return notifications;
}

/**
 * Generate notifications for missions
 * Uses i18n keys for title and message translation
 */
export function generateMissionNotifications(missions) {
  const notifications = [];
  const now = new Date();

  missions.forEach((mission) => {
    if (!mission.scheduledDate || mission.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(mission.scheduledDate, now);
    const missionTitle = getMissionDisplayTitle(mission);

    // Mission today
    if (daysLeft === 0) {
      notifications.push(
        buildNotification({
          entityType: "mission",
          entityId: mission.id,
          subType: "today",
          priority: "high",
          title: t("notifications:content.mission.dueToday.title"),
          message: t("notifications:content.mission.dueToday.message", {
            missionTitle,
          }),
          icon: "fas fa-briefcase",
          timestamp: now.toISOString(),
          linkOverride:
            resolveEntityLink("mission", { missionId: mission.id }) ||
            resolveEntityLink("officer", { officerId: mission.officerId }),
          metadata: {
            missionId: mission.id,
            missionTitle,
            date: mission.scheduledDate,
            officerId: mission.officerId,
          },
        })
      );
    }
    // Upcoming missions (1-5 days)
    else if (daysLeft >= 1 && daysLeft <= 5) {
      notifications.push(
        buildNotification({
          entityType: "mission",
          entityId: mission.id,
          subType: "upcoming",
          priority: "medium",
          title: t("notifications:content.mission.upcoming.title"),
          message: t("notifications:content.mission.upcoming.message", {
            missionTitle,
            count: daysLeft,
          }),
          icon: "fas fa-calendar-alt",
          timestamp: now.toISOString(),
          linkOverride:
            resolveEntityLink("mission", { missionId: mission.id }) ||
            resolveEntityLink("officer", { officerId: mission.officerId }),
          metadata: {
            missionId: mission.id,
            missionTitle,
            daysLeft,
            date: mission.scheduledDate,
            officerId: mission.officerId,
          },
        })
      );
    }

    // Completion check (for completed missions)
    if (mission.status === "Effectuée" && !mission.reportReceived) {
      notifications.push(
        buildNotification({
          entityType: "mission",
          entityId: mission.id,
          subType: "completion",
          priority: "medium",
          title: t("notifications:content.mission.completion.title"),
          message: t("notifications:content.mission.completion.message", {
            missionTitle,
          }),
          icon: "fas fa-check-circle",
          timestamp: now.toISOString(),
          linkOverride:
            resolveEntityLink("mission", { missionId: mission.id }) ||
            resolveEntityLink("officer", { officerId: mission.officerId }),
          metadata: {
            missionId: mission.id,
            missionTitle,
            officerId: mission.officerId,
          },
        })
      );
    }
  });

  return notifications;
}

/**
 * Generate notifications for dossiers
 * Uses i18n keys for title and message translation
 */
export function generateDossierNotifications(dossiers) {
  const notifications = [];
  const now = new Date();

  dossiers.forEach((dossier) => {
    if (
      dossier.status === "Fermé" ||
      dossier.status === "Ferme" ||
      dossier.status === "closed"
    )
      return;

    const dossierNumber =
      dossier.case_number || dossier.caseNumber || dossier.reference;

    // Prochaine Échéance (Next Deadline) notifications
    if (dossier.next_deadline || dossier.nextDeadline) {
      const deadlineDate = dossier.next_deadline || dossier.nextDeadline;
      const daysLeft = calculateDaysDifference(deadlineDate, now);

      // Overdue deadline
      if (daysLeft < 0) {
        const daysOverdue = Math.abs(daysLeft);
        notifications.push(
          buildNotification({
            entityType: "dossier",
            entityId: dossier.id,
            subType: "deadlineOverdue",
            priority: "urgent",
            title: t("notifications:content.dossier.deadlineOverdue.title", {
              count: daysOverdue,
            }),
            message: t(
              "notifications:content.dossier.deadlineOverdue.message",
              { dossierNumber, count: daysOverdue }
            ),
            icon: "fas fa-exclamation-triangle",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              caseNumber: dossierNumber,
              daysOverdue,
              deadline: deadlineDate,
            },
          })
        );
      }
      // Due today
      else if (daysLeft === 0) {
        notifications.push(
          buildNotification({
            entityType: "dossier",
            entityId: dossier.id,
            subType: "deadlineToday",
            priority: "urgent",
            title: t("notifications:content.dossier.deadlineToday.title"),
            message: t("notifications:content.dossier.deadlineToday.message", {
              dossierNumber,
            }),
            icon: "fas fa-clock",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              caseNumber: dossierNumber,
              daysLeft: 0,
              deadline: deadlineDate,
            },
          })
        );
      }
      // Upcoming (1-7 days)
      else if (daysLeft <= 7) {
        const priority = daysLeft <= 2 ? "high" : "medium";
        notifications.push(
          buildNotification({
            entityType: "dossier",
            entityId: dossier.id,
            subType: "deadlineUpcoming",
            priority,
            title: t("notifications:content.dossier.deadlineUpcoming.title", {
              count: daysLeft,
            }),
            message: t(
              "notifications:content.dossier.deadlineUpcoming.message",
              { dossierNumber, count: daysLeft }
            ),
            icon: "fas fa-calendar-alt",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              caseNumber: dossierNumber,
              daysLeft,
              deadline: deadlineDate,
            },
          })
        );
      }
    }

    // Check for dossiers not updated in a while
    if (dossier.lastUpdateDate || dossier.updated_at || dossier.updatedAt) {
      const lastUpdate =
        dossier.lastUpdateDate || dossier.updated_at || dossier.updatedAt;
      const daysSinceUpdate = Math.abs(
        calculateDaysDifference(lastUpdate, now)
      );

      if (daysSinceUpdate >= 7) {
        notifications.push(
          buildNotification({
            entityType: "dossier",
            entityId: dossier.id,
            subType: "statusUpdate",
            priority: daysSinceUpdate >= 14 ? "high" : "medium",
            title: t("notifications:content.dossier.statusUpdateNeeded.title"),
            message: t(
              "notifications:content.dossier.statusUpdateNeeded.message",
              { caseNumber: dossierNumber, count: daysSinceUpdate }
            ),
            icon: "fas fa-folder-open",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              caseNumber: dossierNumber,
              daysSinceUpdate,
            },
          })
        );
      }
    }

    // Review reminder for long-running dossiers
    if (dossier.openDate || dossier.opened_at || dossier.openedAt) {
      const openDate =
        dossier.openDate || dossier.opened_at || dossier.openedAt;
      const daysOpen = Math.abs(calculateDaysDifference(openDate, now));

      if (daysOpen >= 30 && daysOpen % 30 === 0) {
        notifications.push(
          buildNotification({
            entityType: "dossier",
            entityId: dossier.id,
            subType: "review",
            priority: "info",
            title: t("notifications:content.dossier.review.title"),
            message: t("notifications:content.dossier.review.message", {
              caseNumber: dossierNumber,
              count: daysOpen,
            }),
            icon: "fas fa-search",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              caseNumber: dossierNumber,
              daysOpen,
            },
          })
        );
      }
    }
  });

  return notifications;
}

/**
 * Generate all date-related notifications
 */
export function generateAllDateNotifications(data) {
  const allNotifications = [
    ...generateTaskNotifications(data.tasks || []),
    ...generateTaskNotifications(data.personalTasks || []),
    ...generateSessionNotifications(data.sessions || []),
    ...generatePaymentNotifications(data.financialEntries || []),
    ...generateMissionNotifications(data.missions || []),
    ...generateDossierNotifications(data.dossiers || []),
  ];

  // Sort by priority and date
  const priorityOrder = { urgent: 0, high: 1, medium: 2, info: 3 };

  return allNotifications.sort((a, b) => {
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;

    return new Date(b.triggerDate) - new Date(a.triggerDate);
  });
}

/**
 * Filter notifications by date range
 */
export function filterNotificationsByDateRange(
  notifications,
  startDate,
  endDate
) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return notifications.filter((notification) => {
    const triggerDate = new Date(notification.triggerDate);
    return triggerDate >= start && triggerDate <= end;
  });
}

/**
 * Get notifications for today
 */
export function getTodayNotifications(notifications) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  return filterNotificationsByDateRange(notifications, today, tomorrow);
}

/**
 * Get urgent notifications (due today or overdue)
 */
export function getUrgentNotifications(notifications) {
  return notifications.filter(
    (n) =>
      n.priority === "urgent" ||
      n.subType === "overdue" ||
      n.subType === "dueToday" ||
      n.subType === "today"
  );
}

/**
 * Generate notification for a domain event (non date-based)
 * Uses i18n for title and message translation
 */
export function generateDomainEventNotification(eventKey, context = {}) {
  const template = domainEventTemplates[eventKey];
  if (!template) return null;

  const entityType = template.type || context.entityType || context.type;
  const entityId = context.entityId || context[`${entityType}Id`];
  const link = resolveEntityLink(entityType, {
    entityType,
    entityId,
    ...context,
  });

  // Try to use i18n key first, fallback to template if not available
  const i18nTitleKey = `notifications:content.domain.${eventKey}.title`;
  const i18nMessageKey = `notifications:content.domain.${eventKey}.message`;

  let title = t(i18nTitleKey);
  // If translation returns the key itself, use the template
  if (title === i18nTitleKey || title.startsWith("notifications:")) {
    title = template.title;
  }

  let message = t(i18nMessageKey, context);
  // If translation returns the key itself, use the template
  if (message === i18nMessageKey || message.startsWith("notifications:")) {
    message = template.getMessage ? template.getMessage(context) : "";
  }

  return buildNotification({
    entityType,
    entityId,
    subType: eventKey,
    priority: template.priority || "info",
    title,
    message,
    icon: template.icon || "fas fa-bell",
    metadata: { ...context },
    linkOverride: link,
  });
}
