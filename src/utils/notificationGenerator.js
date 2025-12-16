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
  getRandomTemplate,
  calculateDaysDifference,
  calculateHoursDifference,
} from './notificationTemplates';

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

      notifications.push({
        type: "task",
        subType: "overdue",
        priority: "urgent",
        entityId: task.id,
        entityType: "task",
        title: template.title,
        message: template.getMessage(task, daysOverdue),
        icon: "fas fa-exclamation-circle",
        link: `/tasks/${task.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysOverdue,
          dueDate: task.dueDate,
        },
      });
    }
    // Due today
    else if (daysLeft === 0) {
      const template = getRandomTemplate(taskNotificationTemplates.dueToday);

      notifications.push({
        type: "task",
        subType: "dueToday",
        priority: "high",
        entityId: task.id,
        entityType: "task",
        title: template.title,
        message: template.getMessage(task),
        icon: "fas fa-clock",
        link: `/tasks/${task.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          dueDate: task.dueDate,
        },
      });
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      const template = getRandomTemplate(taskNotificationTemplates.upcoming);

      notifications.push({
        type: "task",
        subType: "upcoming",
        priority: daysLeft <= 2 ? "high" : "medium",
        entityId: task.id,
        entityType: "task",
        title: template.title,
        message: template.getMessage(task, daysLeft),
        icon: "fas fa-tasks",
        link: `/tasks/${task.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysLeft,
          dueDate: task.dueDate,
        },
      });
    }

    // Status check for tasks in progress (every 3 days)
    if (task.status === "En cours" && daysLeft > 0 && daysLeft <= 14) {
      const template = getRandomTemplate(taskNotificationTemplates.statusCheck);

      notifications.push({
        type: "task",
        subType: "statusCheck",
        priority: "info",
        entityId: task.id,
        entityType: "task",
        title: template.title,
        message: template.getMessage(task),
        icon: "fas fa-question-circle",
        link: `/tasks/${task.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          dueDate: task.dueDate,
        },
      });
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

      notifications.push({
        type: "session",
        subType: "today",
        priority: "urgent",
        entityId: session.id,
        entityType: "session",
        title: template.title,
        message: template.getMessage(session),
        icon: "fas fa-gavel",
        link: `/sessions/${session.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          date: session.date,
          time: session.time,
        },
      });
    }
    // Session tomorrow
    else if (daysLeft === 1) {
      const template = getRandomTemplate(sessionNotificationTemplates.tomorrow);

      notifications.push({
        type: "session",
        subType: "tomorrow",
        priority: "high",
        entityId: session.id,
        entityType: "session",
        title: template.title,
        message: template.getMessage(session),
        icon: "fas fa-calendar-day",
        link: `/sessions/${session.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          date: session.date,
        },
      });
    }
    // Preparation reminders (2-7 days before)
    else if (daysLeft >= 2 && daysLeft <= 7) {
      const template = getRandomTemplate(sessionNotificationTemplates.preparation);

      notifications.push({
        type: "session",
        subType: "preparation",
        priority: daysLeft <= 3 ? "high" : "medium",
        entityId: session.id,
        entityType: "session",
        title: template.title,
        message: template.getMessage(session, daysLeft),
        icon: "fas fa-file-signature",
        link: `/sessions/${session.id}`,
        triggerDate: now.toISOString(),
        metadata: {
          sessionId: session.id,
          sessionTitle: session.title,
          daysLeft,
          date: session.date,
        },
      });
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

      notifications.push({
        type: "payment",
        subType: "overdue",
        priority: "urgent",
        entityId: entry.id,
        entityType: "financialEntry",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-exclamation-triangle",
        link: "/accounting",
        triggerDate: now.toISOString(),
        metadata: {
          entryId: entry.id,
          client: payment.client,
          amount: payment.amount,
          daysOverdue: payment.daysOverdue,
          dueDate: entry.dueDate,
        },
      });
    }
    // Due today
    else if (daysLeft === 0) {
      const template = getRandomTemplate(paymentNotificationTemplates.dueToday);

      notifications.push({
        type: "payment",
        subType: "dueToday",
        priority: "high",
        entityId: entry.id,
        entityType: "financialEntry",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-money-check-alt",
        link: "/accounting",
        triggerDate: now.toISOString(),
        metadata: {
          entryId: entry.id,
          client: payment.client,
          amount: payment.amount,
          dueDate: entry.dueDate,
        },
      });
    }
    // Upcoming (1-7 days)
    else if (daysLeft <= 7) {
      const template = getRandomTemplate(paymentNotificationTemplates.upcoming);

      notifications.push({
        type: "payment",
        subType: "upcoming",
        priority: daysLeft <= 2 ? "high" : "medium",
        entityId: entry.id,
        entityType: "financialEntry",
        title: template.title,
        message: template.getMessage(payment),
        icon: "fas fa-dollar-sign",
        link: "/accounting",
        triggerDate: now.toISOString(),
        metadata: {
          entryId: entry.id,
          client: payment.client,
          amount: payment.amount,
          daysLeft: payment.daysLeft,
          dueDate: entry.dueDate,
        },
      });
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

      notifications.push({
        type: "mission",
        subType: "today",
        priority: "high",
        entityId: mission.id,
        entityType: "mission",
        title: template.title,
        message: template.getMessage(mission),
        icon: "fas fa-briefcase",
        link: `/officers/${mission.officerId}`,
        triggerDate: now.toISOString(),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
          date: mission.scheduledDate,
        },
      });
    }
    // Upcoming missions (1-5 days)
    else if (daysLeft >= 1 && daysLeft <= 5) {
      const template = getRandomTemplate(missionNotificationTemplates.upcoming);

      notifications.push({
        type: "mission",
        subType: "upcoming",
        priority: "medium",
        entityId: mission.id,
        entityType: "mission",
        title: template.title,
        message: template.getMessage(mission, daysLeft),
        icon: "fas fa-calendar-alt",
        link: `/officers/${mission.officerId}`,
        triggerDate: now.toISOString(),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
          daysLeft,
          date: mission.scheduledDate,
        },
      });
    }

    // Completion check (for completed missions)
    if (mission.status === "Effectuée" && !mission.reportReceived) {
      const template = getRandomTemplate(missionNotificationTemplates.completion);

      notifications.push({
        type: "mission",
        subType: "completion",
        priority: "medium",
        entityId: mission.id,
        entityType: "mission",
        title: template.title,
        message: template.getMessage(mission),
        icon: "fas fa-check-circle",
        link: `/officers/${mission.officerId}`,
        triggerDate: now.toISOString(),
        metadata: {
          missionId: mission.id,
          missionTitle: mission.title,
        },
      });
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
    if (dossier.status === "Fermé") return;

    // Check for dossiers not updated in a while
    if (dossier.lastUpdateDate) {
      const daysSinceUpdate = Math.abs(calculateDaysDifference(dossier.lastUpdateDate, now));

      if (daysSinceUpdate >= 7) {
        const template = getRandomTemplate(dossierNotificationTemplates.statusUpdate);

        notifications.push({
          type: "dossier",
          subType: "statusUpdate",
          priority: daysSinceUpdate >= 14 ? "high" : "medium",
          entityId: dossier.id,
          entityType: "dossier",
          title: template.title,
          message: template.getMessage({ ...dossier, daysSinceUpdate }),
          icon: "fas fa-folder-open",
          link: `/dossiers/${dossier.id}`,
          triggerDate: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.caseNumber,
            daysSinceUpdate,
          },
        });
      }
    }

    // Review reminder for long-running dossiers
    if (dossier.openDate) {
      const daysOpen = Math.abs(calculateDaysDifference(dossier.openDate, now));

      if (daysOpen >= 30 && daysOpen % 30 === 0) {
        const template = getRandomTemplate(dossierNotificationTemplates.review);

        notifications.push({
          type: "dossier",
          subType: "review",
          priority: "info",
          entityId: dossier.id,
          entityType: "dossier",
          title: template.title,
          message: template.getMessage({ ...dossier, daysOpen }),
          icon: "fas fa-search",
          link: `/dossiers/${dossier.id}`,
          triggerDate: now.toISOString(),
          metadata: {
            dossierId: dossier.id,
            caseNumber: dossier.caseNumber,
            daysOpen,
          },
        });
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
