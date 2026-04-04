/**
 * Notification Generator
 * Automatically generates date-related notifications for tasks, sessions, payments, etc.
 *
 * I18N ARCHITECTURE (CORRECTED):
 * - This generator stores template_key + params (language-neutral)
 * - NO translation at generation time
 * - UI components translate on-demand using active language
 * - Language changes trigger ZERO backend writes
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
  getMissionDisplayTitle,
} from "./notificationTemplates";
import { filterOperationalEntities } from "./importState";
import { formatCurrency, getStoredCurrency } from "./currency";

/**
 * Base notification builder with dedupe-friendly IDs and link resolver
 * CORRECTED: Stores template_key + params instead of translated title/message
 */
function buildNotification({
  entityType,
  entityId,
  subType,
  priority,
  template_key,
  params,
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
    template_key,
    params,
    icon,
    timestamp,
    read: false,
    link,
    metadata,
  };
}

/**
 * Generate notifications for tasks
 * CORRECTED: Stores template_key + params (no translation)
 */
export function generateTaskNotifications(tasks, context = {}) {
  const notifications = [];
  const now = new Date();
  const operationalTasks = filterOperationalEntities(tasks);

  const isTaskClosedStatus = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return [
      "done",
      "completed",
      "cancelled",
      "canceled",
      "terminee",
      "termine",
    ].includes(normalized);
  };
  const resolveSessionParent = (session) => {
    if (session.dossier) {
      return { parentType: "dossier", parentReference: session.dossier };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    return null;
  };

  const isTaskInProgress = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return ["in_progress", "in progress", "en cours"].includes(normalized);
  };

  const resolveTaskParent = (task) => {
    if (task.dossier) {
      return { parentType: "dossier", parentReference: task.dossier };
    }
    if (task.lawsuit) {
      return { parentType: "lawsuit", parentReference: task.lawsuit };
    }

    const dossiers = context.dossiers || [];
    const lawsuits = context.lawsuits || [];
    const dossierId = task.dossier_id ?? task.dossierId;
    const lawsuitId = task.lawsuit_id ?? task.lawsuitId;

    if (lawsuitId) {
      const parentLawsuit = lawsuits.find((item) => item.id === lawsuitId);
      if (parentLawsuit) {
        return {
          parentType: "lawsuit",
          parentReference:
            parentLawsuit.lawsuitNumber ||
            parentLawsuit.reference ||
            parentLawsuit.title ||
            `Lawsuit #${parentLawsuit.id}`,
        };
      }
    }

    if (dossierId) {
      const parentDossier = dossiers.find((item) => item.id === dossierId);
      if (parentDossier) {
        return {
          parentType: "dossier",
          parentReference:
            parentDossier.lawsuitNumber ||
            parentDossier.reference ||
            parentDossier.title ||
            `Dossier #${parentDossier.id}`,
        };
      }
    }

    return null;
  };

  operationalTasks.forEach((task) => {
    const dueDate = task.due_date || task.dueDate;
    if (!dueDate || isTaskClosedStatus(task.status)) return;

    const daysLeft = calculateDaysDifference(dueDate, now);
    const parentInfo = resolveTaskParent(task);

    // Overdue tasks
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "overdue",
          priority: "urgent",
          template_key: "content.task.overdue",
          params: { taskTitle: task.title, count: daysOverdue, ...(parentInfo || {}) },
          icon: "fas fa-exclamation-circle",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            daysOverdue,
            dueDate: dueDate,
            ...(parentInfo || {}),
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
          template_key: "content.task.dueToday",
          params: { taskTitle: task.title, ...(parentInfo || {}) },
          icon: "fas fa-clock",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            dueDate: dueDate,
            ...(parentInfo || {}),
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
          template_key: "content.task.upcomingDeadline",
          params: { taskTitle: task.title, count: daysLeft, ...(parentInfo || {}) },
          icon: "fas fa-tasks",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            daysLeft,
            dueDate: dueDate,
            ...(parentInfo || {}),
          },
        })
      );
    }

    // Status check for tasks in progress (every 3 days)
    if (isTaskInProgress(task.status) && daysLeft > 0 && daysLeft <= 14) {
      notifications.push(
        buildNotification({
          entityType: "task",
          entityId: task.id,
          subType: "statusCheck",
          priority: "info",
          template_key: "content.task.statusCheck",
          params: { taskTitle: task.title, dueDate: task.dueDate, ...(parentInfo || {}) },
          icon: "fas fa-question-circle",
          timestamp: now.toISOString(),
          metadata: {
            taskId: task.id,
            taskTitle: task.title,
            dueDate: task.dueDate,
            ...(parentInfo || {}),
          },
        })
      );
    }
  });

  return notifications;
}

/**
 * Generate notifications for sessions
 * CORRECTED: Stores template_key + params (no translation)
 */
export function generateSessionNotifications(sessions) {
  const notifications = [];
  const now = new Date();
  const operationalSessions = filterOperationalEntities(sessions);

  const isTaskClosedStatus = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return [
      "done",
      "completed",
      "cancelled",
      "canceled",
      "terminee",
      "termine",
    ].includes(normalized);
  };

  const resolveSessionParent = (session) => {
    if (session.dossier) {
      return { parentType: "dossier", parentReference: session.dossier };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    return null;
  };

  operationalSessions.forEach((session) => {
    if (!session.date || session.status === "TerminＦ") return;

    const daysLeft = calculateDaysDifference(session.date, now);
    const parentInfo = resolveSessionParent(session);

    // Session today
    if (daysLeft === 0) {
      notifications.push(
        buildNotification({
          entityType: "session",
          entityId: session.id,
          subType: "today",
          priority: "urgent",
          template_key: session.time
            ? "content.session.today"
            : "content.session.todayNoTime",
          params: { sessionTitle: session.title, time: session.time, ...(parentInfo || {}) },
          icon: "fas fa-gavel",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            date: session.date,
            time: session.time,
            ...(parentInfo || {}),
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
          template_key: "content.session.tomorrow",
          params: { sessionTitle: session.title, ...(parentInfo || {}) },
          icon: "fas fa-calendar-day",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            date: session.date,
            ...(parentInfo || {}),
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
          template_key: "content.session.preparation",
          params: { sessionTitle: session.title, count: daysLeft, ...(parentInfo || {}) },
          icon: "fas fa-file-signature",
          timestamp: now.toISOString(),
          metadata: {
            sessionId: session.id,
            sessionTitle: session.title,
            daysLeft,
            date: session.date,
            ...(parentInfo || {}),
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
  const operationalEntries = filterOperationalEntities(financialEntries);

  const isTaskClosedStatus = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return [
      "done",
      "completed",
      "cancelled",
      "canceled",
      "terminee",
      "termine",
    ].includes(normalized);
  };
  const resolveSessionParent = (session) => {
    if (session.dossier) {
      return { parentType: "dossier", parentReference: session.dossier };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    return null;
  };

  operationalEntries.forEach((entry) => {
    // Only for receivables (Revenus) with payment due dates
    if (entry.type !== "revenue" || !entry.dueDate || entry.status === "Payé")
      return;

    const daysLeft = calculateDaysDifference(entry.dueDate, now);

    const formattedAmount = formatCurrency(Math.abs(entry.amount));
    const currency = getStoredCurrency();
    const payment = {
      client: entry.clientName || entry.description,
      amount: formattedAmount,
      currency,
      daysLeft: Math.abs(daysLeft),
      daysOverdue: Math.abs(daysLeft),
      dueDate: entry.dueDate,
      parentType: entry.dossierReference ? "dossier" : entry.lawsuitReference ? "lawsuit" : null,
      parentReference: entry.dossierReference || entry.lawsuitReference || "",
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
          template_key: "content.financial.paymentOverdue",
          params: {
            clientName: payment.client,
            amount: payment.amount,
            count: daysOverdue,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
          },
          icon: "fas fa-exclamation-triangle",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            currency: payment.currency,
            daysOverdue: payment.daysOverdue,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
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
          template_key: "content.financial.paymentDueToday",
          params: {
            clientName: payment.client,
            amount: payment.amount,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
          },
          icon: "fas fa-money-check-alt",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            currency: payment.currency,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
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
          template_key: "content.financial.paymentReceivable",
          params: {
            clientName: payment.client,
            amount: payment.amount,
            count: daysLeft,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
          },
          icon: "fas fa-dollar-sign",
          timestamp: now.toISOString(),
          linkOverride: resolveEntityLink("financialEntry", {
            entityId: entry.id,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
          }),
          metadata: {
            entryId: entry.id,
            client: payment.client,
            amount: payment.amount,
            currency: payment.currency,
            daysLeft: payment.daysLeft,
            dueDate: entry.dueDate,
            clientId: entry.clientId,
            dossierId: entry.dossierId,
            lawsuitId: entry.lawsuitId,
            missionId: entry.missionId,
            parentType: payment.parentType,
            parentReference: payment.parentReference,
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
  const operationalMissions = filterOperationalEntities(missions);

  const isTaskClosedStatus = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return [
      "done",
      "completed",
      "cancelled",
      "canceled",
      "terminee",
      "termine",
    ].includes(normalized);
  };
  const resolveSessionParent = (session) => {
    if (session.dossier) {
      return { parentType: "dossier", parentReference: session.dossier };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    return null;
  };

  operationalMissions.forEach((mission) => {
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
          template_key: "content.mission.dueToday",
          params: { missionTitle },
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
          template_key: "content.mission.upcoming",
          params: { missionTitle, count: daysLeft },
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
          template_key: "content.mission.completion",
          params: { missionTitle },
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
  const operationalDossiers = filterOperationalEntities(dossiers);

  const isTaskClosedStatus = (status) => {
    const normalized = (status || "").toString().trim().toLowerCase();
    return [
      "done",
      "completed",
      "cancelled",
      "canceled",
      "terminee",
      "termine",
    ].includes(normalized);
  };
  const resolveSessionParent = (session) => {
    if (session.dossier) {
      return { parentType: "dossier", parentReference: session.dossier };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    if (session.lawsuit) {
      return { parentType: "lawsuit", parentReference: session.lawsuit };
    }
    return null;
  };

  operationalDossiers.forEach((dossier) => {
    if (
      dossier.status === "Fermé" ||
      dossier.status === "Ferme" ||
      dossier.status === "closed"
    )
      return;

    const dossierNumber = dossier.lawsuitNumber || dossier.reference;

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
            template_key: "content.dossier.statusUpdateNeeded",
            params: { lawsuitNumber: dossierNumber, count: daysSinceUpdate },
            icon: "fas fa-folder-open",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              lawsuitNumber: dossierNumber,
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
            template_key: "content.dossier.generalReview",
            params: { lawsuitNumber: dossierNumber, count: daysOpen },
            icon: "fas fa-search",
            timestamp: now.toISOString(),
            metadata: {
              dossierId: dossier.id,
              lawsuitNumber: dossierNumber,
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
    ...generateTaskNotifications(data.tasks || [], {
      dossiers: data.dossiers || [],
      lawsuits: data.lawsuits || [],
    }),
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

  // Use template_key for i18n translation at render time
  const templateKey = `content.domain.${eventKey}`;

  return buildNotification({
    entityType,
    entityId,
    subType: eventKey,
    priority: template.priority || "info",
    template_key: templateKey,
    params: context,
    icon: template.icon || "fas fa-bell",
    metadata: { ...context },
    linkOverride: link,
  });
}









