/**
 * Notification Generator
 * Automatically generates date-related notifications for tasks, sessions, payments, etc.
 */

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
} from './notificationTemplates';

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
  const link = linkOverride !== null ? linkOverride : resolveEntityLink(entityType, { entityType, entityId, ...metadata, ...linkContext });

  return {
    id: `${entityType || 'system'}_${subType || 'event'}_${entityId || Math.random().toString(16).slice(2)}`,
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
 */
export function generateTaskNotifications(tasks) {
  const notifications = [];
  const now = new Date();

  tasks.forEach(task => {
    if (!task.dueDate || task.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(task.dueDate, now);

    // Overdue tasks
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      const template = getRandomTemplate(taskNotificationTemplates.overdue);

      notifications.push(buildNotification({
        entityType: "task",
        entityId: task.id,
        subType: "overdue",
        priority: "urgent",
        title: template.title,
        message: template.getMessage(task, daysOverdue),
        icon: "fas fa-exclamation-circle",
        timestamp: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysOverdue,
          dueDate: task.dueDate,
        },
      }));
    }
    // Due today
    else if (daysLeft === 0) {
      const template = getRandomTemplate(taskNotificationTemplates.dueToday);

      notifications.push(buildNotification({
        entityType: "task",
        entityId: task.id,
        subType: "dueToday",
        priority: "high",
        title: template.title,
        message: template.getMessage(task),
        icon: "fas fa-clock",
        timestamp: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          dueDate: task.dueDate,
        },
      }));
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      const template = getRandomTemplate(taskNotificationTemplates.upcoming);

      notifications.push(buildNotification({
        entityType: "task",
        entityId: task.id,
        subType: "upcoming",
        priority: daysLeft <= 2 ? "high" : "medium",
        title: template.title,
        message: template.getMessage(task, daysLeft),
        icon: "fas fa-tasks",
        timestamp: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysLeft,
          dueDate: task.dueDate,
        },
      }));
    }

    // Status check for tasks in progress (every 3 days)
    if (task.status === "En cours" && daysLeft > 0 && daysLeft <= 14) {
      const template = getRandomTemplate(taskNotificationTemplates.statusCheck);

      notifications.push(buildNotification({
        entityType: "task",
        entityId: task.id,
        subType: "statusCheck",
        priority: "info",
        title: template.title,
        message: template.getMessage(task),
        icon: "fas fa-question-circle",
        timestamp: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          dueDate: task.dueDate,
        },
      }));
    }
  });

  return notifications;
}

/**
 * Generate notifications for sessions
 */
export function generateSessionNotifications(sessions) {
  const notifications = [];
  const now = new Date();

  sessions.forEach(session => {
    if (!session.date || session.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(session.date, now);

    // Session today
    if (daysLeft === 0) {
      const template = getRandomTemplate(sessionNotificationTemplates.today);

      notifications.push(buildNotification({
        entityType: "session",
        entityId: session.id,
        subType: "today",
        priority: "urgent",
        title: template.title,
        message: template.getMessage(session),
        icon: "fas fa-gavel",
        timestamp: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          date: session.date,
          time: session.time,
        },
      }));
    }
    // Session tomorrow
    else if (daysLeft === 1) {
      const template = getRandomTemplate(sessionNotificationTemplates.tomorrow);

      notifications.push(buildNotification({
        entityType: "session",
        entityId: session.id,
        subType: "tomorrow",
        priority: "high",
        title: template.title,
        message: template.getMessage(session),
        icon: "fas fa-calendar-day",
        timestamp: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          date: session.date,
        },
      }));
    }
    // Preparation reminders (2-7 days before)
    else if (daysLeft >= 2 && daysLeft <= 7) {
      const template = getRandomTemplate(sessionNotificationTemplates.preparation);

      notifications.push(buildNotification({
        entityType: "session",
        entityId: session.id,
        subType: "preparation",
        priority: daysLeft <= 3 ? "high" : "medium",
        title: template.title,
        message: template.getMessage(session, daysLeft),
        icon: "fas fa-file-signature",
        timestamp: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          daysLeft,
          date: session.date,
        },
      }));
    }
  });

  return notifications;
}

/**
 * Generate notifications for payments
 */
export function generatePaymentNotifications(financialEntries) {
  const notifications = [];
  const now = new Date();

  financialEntries.forEach(entry => {
    // Only for receivables (Revenus) with payment due dates
    if (entry.type !== "revenue" || !entry.dueDate || entry.status === "Payé") return;

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
      const template = getRandomTemplate(paymentNotificationTemplates.overdue);

      notifications.push(buildNotification({
        entityType: "financialEntry",
        entityId: entry.id,
        subType: "overdue",
        priority: "urgent",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-exclamation-triangle",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("financialEntry", { entityId: entry.id, clientId: entry.clientId, dossierId: entry.dossierId, caseId: entry.caseId, missionId: entry.missionId }),
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
      }));
    }
    // Due today
    else if (daysLeft === 0) {
      const template = getRandomTemplate(paymentNotificationTemplates.dueToday);

      notifications.push(buildNotification({
        entityType: "financialEntry",
        entityId: entry.id,
        subType: "dueToday",
        priority: "high",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-money-check-alt",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("financialEntry", { entityId: entry.id, clientId: entry.clientId, dossierId: entry.dossierId, caseId: entry.caseId, missionId: entry.missionId }),
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
      }));
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      const template = getRandomTemplate(paymentNotificationTemplates.upcoming);

      notifications.push(buildNotification({
        entityType: "financialEntry",
        entityId: entry.id,
        subType: "upcoming",
        priority: daysLeft <= 2 ? "high" : "medium",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-dollar-sign",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("financialEntry", { entityId: entry.id, clientId: entry.clientId, dossierId: entry.dossierId, caseId: entry.caseId, missionId: entry.missionId }),
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
      }));
    }
  });

  return notifications;
}

/**
 * Generate notifications for missions
 */
export function generateMissionNotifications(missions) {
  const notifications = [];
  const now = new Date();

  missions.forEach(mission => {
    if (!mission.scheduledDate || mission.status === "Terminée") return;

    const daysLeft = calculateDaysDifference(mission.scheduledDate, now);

    // Mission today
    if (daysLeft === 0) {
      const template = getRandomTemplate(missionNotificationTemplates.dueToday);

      notifications.push(buildNotification({
        entityType: "mission",
        entityId: mission.id,
        subType: "today",
        priority: "high",
        title: template.title,
        message: template.getMessage(mission),
        icon: "fas fa-briefcase",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("mission", { missionId: mission.id }) || resolveEntityLink("officer", { officerId: mission.officerId }),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
          date: mission.scheduledDate,
          officerId: mission.officerId,
        },
      }));
    }
    // Upcoming missions (1-5 days)
    else if (daysLeft >= 1 && daysLeft <= 5) {
      const template = getRandomTemplate(missionNotificationTemplates.upcoming);

      notifications.push(buildNotification({
        entityType: "mission",
        entityId: mission.id,
        subType: "upcoming",
        priority: "medium",
        title: template.title,
        message: template.getMessage(mission, daysLeft),
        icon: "fas fa-calendar-alt",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("mission", { missionId: mission.id }) || resolveEntityLink("officer", { officerId: mission.officerId }),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
          daysLeft,
          date: mission.scheduledDate,
          officerId: mission.officerId,
        },
      }));
    }

    // Completion check (for completed missions)
    if (mission.status === "Effectuée" && !mission.reportReceived) {
      const template = getRandomTemplate(missionNotificationTemplates.completion);

      notifications.push(buildNotification({
        entityType: "mission",
        entityId: mission.id,
        subType: "completion",
        priority: "medium",
        title: template.title,
        message: template.getMessage(mission),
        icon: "fas fa-check-circle",
        timestamp: now.toISOString(),
        linkOverride: resolveEntityLink("mission", { missionId: mission.id }) || resolveEntityLink("officer", { officerId: mission.officerId }),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
          officerId: mission.officerId,
        },
      }));
    }
  });

  return notifications;
}

/**
 * Generate notifications for dossiers
 */
export function generateDossierNotifications(dossiers) {
  const notifications = [];
  const now = new Date();

  dossiers.forEach(dossier => {
    if (dossier.status === "Fermé" || dossier.status === "Ferme" || dossier.status === "closed") return;

    // Prochaine Échéance (Next Deadline) notifications
    if (dossier.next_deadline || dossier.nextDeadline) {
      const deadlineDate = dossier.next_deadline || dossier.nextDeadline;
      const daysLeft = calculateDaysDifference(deadlineDate, now);

      // Overdue deadline
      if (daysLeft < 0) {
        const daysOverdue = Math.abs(daysLeft);
        notifications.push(buildNotification({
          entityType: "dossier",
          entityId: dossier.id,
          subType: "deadlineOverdue",
          priority: "urgent",
          title: "Échéance Dépassée",
          message: `L'échéance du dossier ${dossier.case_number || dossier.caseNumber || dossier.reference} est dépassée de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}.`,
          icon: "fas fa-exclamation-triangle",
          timestamp: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.case_number || dossier.caseNumber,
            daysOverdue,
            deadline: deadlineDate,
          },
        }));
      }
      // Due today
      else if (daysLeft === 0) {
        notifications.push(buildNotification({
          entityType: "dossier",
          entityId: dossier.id,
          subType: "deadlineToday",
          priority: "urgent",
          title: "Échéance Aujourd'hui",
          message: `L'échéance du dossier ${dossier.case_number || dossier.caseNumber || dossier.reference} est aujourd'hui.`,
          icon: "fas fa-clock",
          timestamp: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.case_number || dossier.caseNumber,
            daysLeft: 0,
            deadline: deadlineDate,
          },
        }));
      }
      // Upcoming (1-7 days)
      else if (daysLeft <= 7) {
        const priority = daysLeft <= 2 ? "high" : "medium";
        notifications.push(buildNotification({
          entityType: "dossier",
          entityId: dossier.id,
          subType: "deadlineUpcoming",
          priority,
          title: `Échéance dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}`,
          message: `L'échéance du dossier ${dossier.case_number || dossier.caseNumber || dossier.reference} arrive dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
          icon: "fas fa-calendar-alt",
          timestamp: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.case_number || dossier.caseNumber,
            daysLeft,
            deadline: deadlineDate,
          },
        }));
      }
    }

    // Check for dossiers not updated in a while
    if (dossier.lastUpdateDate || dossier.updated_at || dossier.updatedAt) {
      const lastUpdate = dossier.lastUpdateDate || dossier.updated_at || dossier.updatedAt;
      const daysSinceUpdate = Math.abs(calculateDaysDifference(lastUpdate, now));

      if (daysSinceUpdate >= 7) {
        const template = getRandomTemplate(dossierNotificationTemplates.statusUpdate);

        notifications.push(buildNotification({
          entityType: "dossier",
          entityId: dossier.id,
          subType: "statusUpdate",
          priority: daysSinceUpdate >= 14 ? "high" : "medium",
          title: template.title,
          message: template.getMessage({ ...dossier, daysSinceUpdate }),
          icon: "fas fa-folder-open",
          timestamp: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.case_number || dossier.caseNumber,
            daysSinceUpdate,
          },
        }));
      }
    }

    // Review reminder for long-running dossiers
    if (dossier.openDate || dossier.opened_at || dossier.openedAt) {
      const openDate = dossier.openDate || dossier.opened_at || dossier.openedAt;
      const daysOpen = Math.abs(calculateDaysDifference(openDate, now));

      if (daysOpen >= 30 && daysOpen % 30 === 0) {
        const template = getRandomTemplate(dossierNotificationTemplates.review);

        notifications.push(buildNotification({
          entityType: "dossier",
          entityId: dossier.id,
          subType: "review",
          priority: "info",
          title: template.title,
          message: template.getMessage({ ...dossier, daysOpen }),
          icon: "fas fa-search",
          timestamp: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.case_number || dossier.caseNumber,
            daysOpen,
          },
        }));
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
export function filterNotificationsByDateRange(notifications, startDate, endDate) {
  const start = new Date(startDate);
  const end = new Date(endDate);

  return notifications.filter(notification => {
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
  return notifications.filter(n =>
    n.priority === "urgent" ||
    n.subType === "overdue" ||
    n.subType === "dueToday" ||
    n.subType === "today"
  );
}

/**
 * Generate notification for a domain event (non date-based)
 */
export function generateDomainEventNotification(eventKey, context = {}) {
  const template = domainEventTemplates[eventKey];
  if (!template) return null;

  const entityType = template.type || context.entityType || context.type;
  const entityId = context.entityId || context[`${entityType}Id`];
  const link = resolveEntityLink(entityType, { entityType, entityId, ...context });

  return buildNotification({
    entityType,
    entityId,
    subType: eventKey,
    priority: template.priority || "info",
    title: template.title,
    message: template.getMessage ? template.getMessage(context) : "",
    icon: template.icon || "fas fa-bell",
    metadata: { ...context },
    linkOverride: link,
  });
}
