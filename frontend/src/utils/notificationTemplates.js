/**
 * Notification Templates & Helpers
 * Provides structured templates for date reminders AND domain events
 */

import { formatCurrency } from "./currency";

/**
 * Link resolver for entity destinations
 */
export function resolveEntityLink(entityType, context = {}) {
  const map = {
    client: (ctx) =>
      ctx.clientId
        ? `/clients/${ctx.clientId}`
        : ctx.entityId
        ? `/clients/${ctx.entityId}`
        : null,
    dossier: (ctx) =>
      ctx.dossierId
        ? `/dossiers/${ctx.dossierId}`
        : ctx.entityId
        ? `/dossiers/${ctx.entityId}`
        : null,
    lawsuit: (ctx) =>
      ctx.lawsuitId
        ? `/lawsuits/${ctx.lawsuitId}`
        : ctx.entityId
        ? `/lawsuits/${ctx.entityId}`
        : null,
    task: (ctx) =>
      ctx.taskId
        ? `/tasks/${ctx.taskId}`
        : ctx.entityId
        ? `/tasks/${ctx.entityId}`
        : null,
    personalTask: (ctx) =>
      ctx.taskId
        ? `/personal-tasks/${ctx.taskId}`
        : ctx.personalTaskId
        ? `/personal-tasks/${ctx.personalTaskId}`
        : ctx.entityId
        ? `/personal-tasks/${ctx.entityId}`
        : null,
    session: (ctx) =>
      ctx.sessionId
        ? `/sessions/${ctx.sessionId}`
        : ctx.entityId
        ? `/sessions/${ctx.entityId}`
        : null,
    mission: (ctx) =>
      ctx.missionId
        ? `/missions/${ctx.missionId}`
        : ctx.entityId
        ? `/missions/${ctx.entityId}`
        : null,
    officer: (ctx) =>
      ctx.officerId
        ? `/officers/${ctx.officerId}`
        : ctx.entityId
        ? `/officers/${ctx.entityId}`
        : null,
    financialEntry: (ctx) => {
      const entryId = ctx.financialEntryId ?? ctx.entityId;
      if (entryId) return `/accounting/${entryId}`;
      if (ctx.dossierId) return `/dossiers/${ctx.dossierId}`;
      if (ctx.lawsuitId) return `/lawsuits/${ctx.lawsuitId}`;
      if (ctx.clientId) return `/clients/${ctx.clientId}`;
      if (ctx.missionId) return `/missions/${ctx.missionId}`;
      return null;
    },
  };

  const resolver = map[entityType];
  return resolver ? resolver(context) : null;
}

export function getMissionDisplayTitle(mission = {}) {
  return (
    mission.title ||
    mission.description ||
    mission.reference ||
    mission.missionNumber ||
    "Mission"
  );
}

/**
 * TASK NOTIFICATIONS - 6 varieties (date-based)
 */
export const taskNotificationTemplates = {
  // Before deadline
  upcoming: [
    {
      title: "Task Reminder",
      getMessage: (task, daysLeft) =>
        `The task "${task.title}" is due in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }. Have you started?`,
    },
    {
      title: "Upcoming Task",
      getMessage: (task, daysLeft) =>
        `Don't forget: "${task.title}" must be completed in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }.`,
    },
  ],

  // Due today
  dueToday: [
    {
      title: "Due Today",
      getMessage: (task) =>
        `The task "${task.title}" must be completed today. Have you finished?`,
    },
    {
      title: "Action Required",
      getMessage: (task) =>
        `"${task.title}" - The deadline is today! What is your progress?`,
    },
  ],

  // Overdue
  overdue: [
    {
      title: "Task Overdue",
      getMessage: (task, daysOverdue) =>
        `"${task.title}" is overdue by ${daysOverdue} day${
          daysOverdue > 1 ? "s" : ""
        }. Can you finalize it?`,
    },
    {
      title: "Attention - Overdue",
      getMessage: (task, daysOverdue) =>
        `The task "${
          task.title
        }" should have been completed ${daysOverdue} day${
          daysOverdue > 1 ? "s" : ""
        } ago.`,
    },
  ],

  // Status check
  statusCheck: [
    {
      title: "Task Follow-up",
      getMessage: (task) =>
        `Have you completed the task "${task.title}"? Deadline: ${task.dueDate}`,
    },
    {
      title: "Progress Check",
      getMessage: (task) =>
        `Where are you with "${task.title}"? Deadline: ${task.dueDate}`,
    },
  ],
};

/**
 * SESSION NOTIFICATIONS - 6 varieties (date-based)
 */
export const sessionNotificationTemplates = {
  // Before session
  preparation: [
    {
      title: "Session Preparation",
      getMessage: (session, daysLeft) =>
        `Session "${session.title}" in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }. Have you prepared your pleading?`,
    },
    {
      title: "Upcoming Hearing",
      getMessage: (session, daysLeft) =>
        `The hearing "${session.title}" is in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }. Have you prepared your arguments?`,
    },
    {
      title: "Preparation Reminder",
      getMessage: (session, daysLeft) =>
        `Session "${session.title}" on ${session.date}. Have you gathered all necessary documents?`,
    },
  ],

  // Day before
  tomorrow: [
    {
      title: "Session Tomorrow",
      getMessage: (session) =>
        `The hearing "${session.title}" takes place tomorrow. Are you ready?`,
    },
    {
      title: "Final Check",
      getMessage: (session) =>
        `Session tomorrow: "${session.title}". Have you checked all the files?`,
    },
  ],

  // Same day
  today: [
    {
      title: "Session Today",
      getMessage: (session) =>
        `Hearing "${session.title}" today at ${
          session.time || "the scheduled time"
        }. Good luck!`,
    },
  ],
};

/**
 * PAYMENT NOTIFICATIONS - 6 varieties (date-based)
 */
export const paymentNotificationTemplates = {
  // Due soon
  upcoming: [
    {
      title: "Payment Receivable",
      getMessage: (payment) =>
        `The payment from ${payment.client} (${formatCurrency(payment.amount)}) is due in ${
          payment.daysLeft
        } day${payment.daysLeft > 1 ? "s" : ""}.`,
    },
    {
      title: "Payment Due",
      getMessage: (payment) =>
        `${payment.client} must pay you ${formatCurrency(payment.amount)} in ${
          payment.daysLeft
        } day${payment.daysLeft > 1 ? "s" : ""}. Have you sent a reminder?`,
    },
  ],

  // Due today
  dueToday: [
    {
      title: "Payment Due Today",
      getMessage: (payment) =>
        `${payment.client} must pay you ${formatCurrency(payment.amount)} today. Have you received the payment?`,
    },
    {
      title: "Payment Due",
      getMessage: (payment) =>
        `Payment expected from ${payment.client}: ${formatCurrency(payment.amount)}. Have they paid?`,
    },
  ],

  // Overdue
  overdue: [
    {
      title: "Payment Overdue",
      getMessage: (payment) =>
        `${payment.client} has a payment overdue by ${payment.daysOverdue} day${
          payment.daysOverdue > 1 ? "s" : ""
        } (${formatCurrency(payment.amount)}). Contacted?`,
    },
    {
      title: "Follow-up Required",
      getMessage: (payment) =>
        `The payment from ${payment.client} (${formatCurrency(payment.amount)}) is overdue. Have you sent a follow-up?`,
    },
  ],
};

/**
 * MISSION NOTIFICATIONS (date-based for Huissiers)
 */
export const missionNotificationTemplates = {
  upcoming: [
    {
      title: "Upcoming Mission",
      getMessage: (mission, daysLeft) => {
        const title = getMissionDisplayTitle(mission);
        return `Mission "${title}" scheduled in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }. Is everything ready?`;
      },
    },
    {
      title: "Mission Reminder",
      getMessage: (mission, daysLeft) => {
        const title = getMissionDisplayTitle(mission);
        return `Mission "${title}" on ${mission.date}. Have you prepared the documents?`;
      },
    },
  ],

  dueToday: [
    {
      title: "Mission Today",
      getMessage: (mission) => {
        const title = getMissionDisplayTitle(mission);
        return `Mission "${title}" today. Confirmed with the bailiff?`;
      },
    },
  ],

  completion: [
    {
      title: "Mission Follow-up",
      getMessage: (mission) => {
        const title = getMissionDisplayTitle(mission);
        return `Mission "${title}" completed? Have you received the bailiff's report?`;
      },
    },
  ],
};

/**
 * DEADLINE NOTIFICATIONS (General)
 */
export const deadlineNotificationTemplates = {
  urgent: [
    {
      title: "Critical Deadline",
      getMessage: (item, hours) =>
        `URGENT: "${item.title}" - Only ${hours} hour${
          hours > 1 ? "s" : ""
        } left!`,
    },
  ],

  approaching: [
    {
      title: "Approaching Deadline",
      getMessage: (item, daysLeft) =>
        `"${item.title}" must be finalized in ${daysLeft} day${
          daysLeft > 1 ? "s" : ""
        }.`,
    },
    {
      title: "Deadline Approaching",
      getMessage: (item, daysLeft) =>
        `Attention: ${daysLeft} day${daysLeft > 1 ? "s" : ""} remaining for "${
          item.title
        }".`,
    },
  ],

  missed: [
    {
      title: "Deadline Exceeded",
      getMessage: (item, daysOverdue) =>
        `"${item.title}" has exceeded its deadline by ${daysOverdue} day${
          daysOverdue > 1 ? "s" : ""
        }.`,
    },
  ],
};

/**
 * DOSSIER NOTIFICATIONS
 */
export const dossierNotificationTemplates = {
  statusUpdate: [
    {
      title: "Update Required",
      getMessage: (dossier) =>
        `The Dossier ${dossier.lawsuitNumber} has not been updated for ${dossier.daysSinceUpdate} days. Any news?`,
    },
  ],

  review: [
    {
      title: "Dossier Review",
      getMessage: (dossier) =>
        `The Dossier ${dossier.lawsuitNumber} has been open for ${dossier.daysOpen} days. Is everything progressing well?`,
    },
  ],
};

/**
 * DOMAIN EVENT TEMPLATES (immediate events)
 */
export const domainEventTemplates = {
  // Lifecycle
  clientArchived: {
    type: "client",
    priority: "warning",
    icon: "fas fa-box-archive",
    title: "Client archived",
    getMessage: (ctx) =>
      `The client ${
        ctx.name || ctx.entityName || "unknown"
      } has been archived.`,
  },
  clientReactivated: {
    type: "client",
    priority: "success",
    icon: "fas fa-user-check",
    title: "Client reactivated",
    getMessage: (ctx) =>
      `The client ${
        ctx.name || ctx.entityName || "unknown"
      } has been reactivated.`,
  },
  dossierClosed: {
    type: "dossier",
    priority: "info",
    icon: "fas fa-folder-minus",
    title: "Dossier closed",
    getMessage: (ctx) =>
      `The Dossier ${
        ctx.lawsuitNumber || ctx.entityName || ctx.entityId
      } has been closed.`,
  },
  dossierReopened: {
    type: "dossier",
    priority: "success",
    icon: "fas fa-folder-open",
    title: "Dossier reopened",
    getMessage: (ctx) =>
      `The Dossier ${
        ctx.lawsuitNumber || ctx.entityName || ctx.entityId
      } has been reopened.`,
  },
  lawsuitClosed: {
    type: "lawsuit",
    priority: "info",
    icon: "fas fa-gavel",
    title: "Lawsuit closed",
    getMessage: (ctx) =>
      `The lawsuit ${
        ctx.lawsuitNumber || ctx.entityName || ctx.entityId
      } has been closed.`,
  },
  lawsuitReopened: {
    type: "lawsuit",
    priority: "success",
    icon: "fas fa-gavel",
    title: "Lawsuit reopened",
    getMessage: (ctx) =>
      `The lawsuit ${
        ctx.lawsuitNumber || ctx.entityName || ctx.entityId
      } has been reopened.`,
  },

  // Tasks
  taskAssigned: {
    type: "task",
    priority: "info",
    icon: "fas fa-user-check",
    title: "Task assigned",
    getMessage: (ctx) =>
      `The task "${ctx.title}" has been assigned to ${ctx.assignee || "you"}.`,
  },
  taskStatusChanged: {
    type: "task",
    priority: "info",
    icon: "fas fa-arrows-rotate",
    title: "Task status updated",
    getMessage: (ctx) =>
      `The task "${ctx.title}" has changed to "${ctx.status}".`,
  },
  taskOverdue: {
    type: "task",
    priority: "urgent",
    icon: "fas fa-exclamation-circle",
    title: "Task overdue",
    getMessage: (ctx) =>
      `The task "${ctx.title}" has been overdue for ${
        ctx.daysOverdue || 0
      } day(s).`,
  },
  taskDueSoon: {
    type: "task",
    priority: "high",
    icon: "fas fa-clock",
    title: "Task deadline approaching",
    getMessage: (ctx) => `The task "${ctx.title}" is due on ${ctx.dueDate}.`,
  },

  // Sessions
  sessionScheduled: {
    type: "session",
    priority: "info",
    icon: "fas fa-calendar-plus",
    title: "Hearing scheduled",
    getMessage: (ctx) =>
      `Hearing "${ctx.title}" scheduled on ${ctx.date} at ${
        ctx.time || "time to be confirmed"
      }.`,
  },
  sessionUpcoming24h: {
    type: "session",
    priority: "high",
    icon: "fas fa-bell",
    title: "Hearing in 24 hours",
    getMessage: (ctx) =>
      `Hearing "${ctx.title}" in 24 hours. Final preparation required.`,
  },
  sessionUpcoming1h: {
    type: "session",
    priority: "urgent",
    icon: "fas fa-hourglass-half",
    title: "Imminent hearing",
    getMessage: (ctx) => `Hearing "${ctx.title}" in 1 hour.`,
  },
  sessionCompleted: {
    type: "session",
    priority: "success",
    icon: "fas fa-check-circle",
    title: "Hearing completed",
    getMessage: (ctx) => `Hearing "${ctx.title}" is marked completed.`,
  },

  // Financial
  expenseAdded: {
    type: "financial",
    priority: "info",
    icon: "fas fa-receipt",
    title: "Expense added",
    getMessage: (ctx) =>
      `New expense ${ctx.amount ? formatCurrency(ctx.amount) : ""} recorded${
        ctx.category ? ` (${ctx.category})` : ""
      }.`,
  },
  clientAdvanceReceived: {
    type: "financial",
    priority: "success",
    icon: "fas fa-hand-holding-usd",
    title: "Client advance received",
    getMessage: (ctx) =>
      `Advance received from ${ctx.clientName || "client"} (${
        ctx.amount ? formatCurrency(ctx.amount) : ""
      }).`,
  },
  clientBalanceOverdue: {
    type: "financial",
    priority: "warning",
    icon: "fas fa-exclamation-triangle",
    title: "Client balance overdue",
    getMessage: (ctx) =>
      `The balance of ${ctx.clientName || "client"} is overdue for payment.`,
  },
  financialValidated: {
    type: "financial",
    priority: "info",
    icon: "fas fa-check",
    title: "Entry validated",
    getMessage: (ctx) =>
      `The entry "${ctx.description || ctx.entryId}" is validated.`,
  },
  financialPaid: {
    type: "financial",
    priority: "success",
    icon: "fas fa-check-double",
    title: "Payment confirmed",
    getMessage: (ctx) =>
      `The payment for "${ctx.description || ctx.entryId}" is marked paid.`,
  },

  // Missions / Officers
  missionAssigned: {
    type: "mission",
    priority: "info",
    icon: "fas fa-user-tag",
    title: "Mission assigned",
    getMessage: (ctx) => {
      const title = getMissionDisplayTitle(ctx);
      return `The mission "${title}" has been assigned to ${
        ctx.officerName || "a bailiff"
      }.`;
    },
  },
  missionReassigned: {
    type: "mission",
    priority: "warning",
    icon: "fas fa-people-arrows",
    title: "Mission reassigned",
    getMessage: (ctx) => {
      const title = getMissionDisplayTitle(ctx);
      return `The mission "${title}" is transferred from ${
        ctx.oldOfficer || "previous bailiff"
      } to ${ctx.newOfficer || "new bailiff"}.`;
    },
  },
  missionOverdue: {
    type: "mission",
    priority: "high",
    icon: "fas fa-exclamation-circle",
    title: "Mission overdue",
    getMessage: (ctx) => {
      const title = getMissionDisplayTitle(ctx);
      return `The mission "${title}" is overdue.${
        ctx.daysOverdue ? ` (${ctx.daysOverdue} day(s))` : ""
      }`;
    },
  },

  // System / Integrity
  actionBlocked: {
    type: "system",
    priority: "info",
    icon: "fas fa-shield-alt",
    title: "Action blocked",
    getMessage: (ctx) => ctx.reason || "Action blocked by business rules.",
  },
  impactConfirmed: {
    type: "system",
    priority: "info",
    icon: "fas fa-check-circle",
    title: "Relational impact confirmed",
    getMessage: (ctx) =>
      ctx.summary || "Modification confirmed after impact warning.",
  },
};

/**
 * Helper function to get random template
 */
export function getRandomTemplate(templates) {
  if (Array.isArray(templates)) {
    return templates[Math.floor(Math.random() * templates.length)];
  }
  return templates;
}

/**
 * Calculate days difference
 */
export function calculateDaysDifference(date1, date2 = new Date()) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d1.getTime() - d2.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return diffDays;
}

/**
 * Calculate hours difference
 */
export function calculateHoursDifference(date1, date2 = new Date()) {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  const diffTime = d1.getTime() - d2.getTime();
  const diffHours = Math.ceil(diffTime / (1000 * 60 * 60));
  return diffHours;
}




