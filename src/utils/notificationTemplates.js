/**
 * Notification Templates & Helpers
 * Provides structured templates for date reminders AND domain events
 */

/**
 * Link resolver for entity destinations
 */
export function resolveEntityLink(entityType, context = {}) {
  const map = {
    client: (ctx) => ctx.clientId ? `/clients/${ctx.clientId}` : ctx.entityId ? `/clients/${ctx.entityId}` : null,
    dossier: (ctx) => ctx.dossierId ? `/dossiers/${ctx.dossierId}` : ctx.entityId ? `/dossiers/${ctx.entityId}` : null,
    case: (ctx) => ctx.caseId ? `/cases/${ctx.caseId}` : ctx.entityId ? `/cases/${ctx.entityId}` : null,
    task: (ctx) => ctx.taskId ? `/tasks/${ctx.taskId}` : ctx.entityId ? `/tasks/${ctx.entityId}` : null,
    session: (ctx) => ctx.sessionId ? `/sessions/${ctx.sessionId}` : ctx.entityId ? `/sessions/${ctx.entityId}` : null,
    mission: (ctx) => ctx.missionId ? `/missions/${ctx.missionId}` : ctx.entityId ? `/missions/${ctx.entityId}` : null,
    officer: (ctx) => ctx.officerId ? `/officers/${ctx.officerId}` : ctx.entityId ? `/officers/${ctx.entityId}` : null,
    financialEntry: (ctx) => {
      if (ctx.dossierId) return `/dossiers/${ctx.dossierId}`;
      if (ctx.caseId) return `/cases/${ctx.caseId}`;
      if (ctx.clientId) return `/clients/${ctx.clientId}`;
      if (ctx.missionId) return `/missions/${ctx.missionId}`;
      return ctx.entityId ? `/accounting` : null;
    },
  };

  const resolver = map[entityType];
  return resolver ? resolver(context) : null;
}

/**
 * TASK NOTIFICATIONS - 6 varieties (date-based)
 */
export const taskNotificationTemplates = {
  // Before deadline
  upcoming: [
    {
      title: "Rappel de Tâche",
      getMessage: (task, daysLeft) =>
        `La tâche "${task.title}" arrive à échéance dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Avez-vous commencé ?`,
    },
    {
      title: "Tâche à Venir",
      getMessage: (task, daysLeft) =>
        `N'oubliez pas : "${task.title}" doit être terminée dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
    },
  ],

  // Due today
  dueToday: [
    {
      title: "Échéance Aujourd'hui",
      getMessage: (task) =>
        `La tâche "${task.title}" doit être terminée aujourd'hui. Avez-vous fini ?`,
    },
    {
      title: "Action Requise",
      getMessage: (task) =>
        `"${task.title}" - L'échéance est aujourd'hui ! Quel est votre avancement ?`,
    },
  ],

  // Overdue
  overdue: [
    {
      title: "Tâche en Retard",
      getMessage: (task, daysOverdue) =>
        `"${task.title}" est en retard de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}. Pouvez-vous la finaliser ?`,
    },
    {
      title: "Attention - Retard",
      getMessage: (task, daysOverdue) =>
        `La tâche "${task.title}" devait être terminée il y a ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}.`,
    },
  ],

  // Status check
  statusCheck: [
    {
      title: "Suivi de Tâche",
      getMessage: (task) =>
        `Avez-vous terminé la tâche "${task.title}" ? Échéance : ${task.dueDate}`,
    },
    {
      title: "Point d'Avancement",
      getMessage: (task) =>
        `Où en êtes-vous avec "${task.title}" ? Deadline : ${task.dueDate}`,
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
      title: "Préparation de Séance",
      getMessage: (session, daysLeft) =>
        `Séance "${session.title}" dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Avez-vous préparé votre plaidoirie ?`,
    },
    {
      title: "Audience Prochaine",
      getMessage: (session, daysLeft) =>
        `L'audience "${session.title}" est dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Avez-vous préparé votre argumentaire ?`,
    },
    {
      title: "Rappel de Préparation",
      getMessage: (session, daysLeft) =>
        `Séance "${session.title}" le ${session.date}. Avez-vous rassemblé tous les documents nécessaires ?`,
    },
  ],

  // Day before
  tomorrow: [
    {
      title: "Séance Demain",
      getMessage: (session) =>
        `L'audience "${session.title}" a lieu demain. Êtes-vous prêt(e) ?`,
    },
    {
      title: "Dernière Vérification",
      getMessage: (session) =>
        `Séance demain : "${session.title}". Avez-vous vérifié tous les dossiers ?`,
    },
  ],

  // Same day
  today: [
    {
      title: "Séance Aujourd'hui",
      getMessage: (session) =>
        `Audience "${session.title}" aujourd'hui à ${session.time || 'l\'heure prévue'}. Bon courage !`,
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
      title: "Paiement à Recevoir",
      getMessage: (payment) =>
        `Le paiement de ${payment.client} (${payment.amount} TND) arrive à échéance dans ${payment.daysLeft} jour${payment.daysLeft > 1 ? 's' : ''}.`,
    },
    {
      title: "Échéance de Paiement",
      getMessage: (payment) =>
        `${payment.client} doit vous payer ${payment.amount} TND dans ${payment.daysLeft} jour${payment.daysLeft > 1 ? 's' : ''}. Avez-vous envoyé un rappel ?`,
    },
  ],

  // Due today
  dueToday: [
    {
      title: "Paiement Dû Aujourd'hui",
      getMessage: (payment) =>
        `${payment.client} doit vous payer ${payment.amount} TND aujourd'hui. Avez-vous reçu le paiement ?`,
    },
    {
      title: "Échéance de Paiement",
      getMessage: (payment) =>
        `Paiement attendu de ${payment.client} : ${payment.amount} TND. A-t-il/elle payé ?`,
    },
  ],

  // Overdue
  overdue: [
    {
      title: "Paiement en Retard",
      getMessage: (payment) =>
        `${payment.client} a un paiement en retard de ${payment.daysOverdue} jour${payment.daysOverdue > 1 ? 's' : ''} (${payment.amount} TND). Contacté(e) ?`,
    },
    {
      title: "Relance Nécessaire",
      getMessage: (payment) =>
        `Le paiement de ${payment.client} (${payment.amount} TND) est en retard. Avez-vous envoyé une relance ?`,
    },
  ],
};

/**
 * MISSION NOTIFICATIONS (date-based for Huissiers)
 */
export const missionNotificationTemplates = {
  upcoming: [
    {
      title: "Mission Prochaine",
      getMessage: (mission, daysLeft) =>
        `Mission "${mission.title}" prévue dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}. Tout est prêt ?`,
    },
    {
      title: "Rappel de Mission",
      getMessage: (mission, daysLeft) =>
        `Mission "${mission.title}" le ${mission.date}. Avez-vous préparé les documents ?`,
    },
  ],

  dueToday: [
    {
      title: "Mission Aujourd'hui",
      getMessage: (mission) =>
        `Mission "${mission.title}" aujourd'hui. Confirmé avec l'huissier ?`,
    },
  ],

  completion: [
    {
      title: "Suivi de Mission",
      getMessage: (mission) =>
        `Mission "${mission.title}" terminée ? Avez-vous reçu le rapport de l'huissier ?`,
    },
  ],
};

/**
 * DEADLINE NOTIFICATIONS (General)
 */
export const deadlineNotificationTemplates = {
  urgent: [
    {
      title: "Échéance Critique",
      getMessage: (item, hours) =>
        `URGENT : "${item.title}" - Plus que ${hours} heure${hours > 1 ? 's' : ''} !`,
    },
  ],

  approaching: [
    {
      title: "Échéance Approchante",
      getMessage: (item, daysLeft) =>
        `"${item.title}" doit être finalisé dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}.`,
    },
    {
      title: "Date Limite Proche",
      getMessage: (item, daysLeft) =>
        `Attention : Il reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} pour "${item.title}".`,
    },
  ],

  missed: [
    {
      title: "Échéance Dépassée",
      getMessage: (item, daysOverdue) =>
        `"${item.title}" a dépassé son échéance de ${daysOverdue} jour${daysOverdue > 1 ? 's' : ''}.`,
    },
  ],
};

/**
 * DOSSIER NOTIFICATIONS
 */
export const dossierNotificationTemplates = {
  statusUpdate: [
    {
      title: "Mise à Jour Nécessaire",
      getMessage: (dossier) =>
        `Le dossier ${dossier.caseNumber} n'a pas été mis à jour depuis ${dossier.daysSinceUpdate} jours. Des nouvelles ?`,
    },
  ],

  review: [
    {
      title: "Revue de Dossier",
      getMessage: (dossier) =>
        `Le dossier ${dossier.caseNumber} est ouvert depuis ${dossier.daysOpen} jours. Tout avance bien ?`,
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
    title: "Client archivé",
    getMessage: (ctx) => `Le client ${ctx.name || ctx.entityName || "inconnu"} a été archivé.`,
  },
  clientReactivated: {
    type: "client",
    priority: "success",
    icon: "fas fa-user-check",
    title: "Client réactivé",
    getMessage: (ctx) => `Le client ${ctx.name || ctx.entityName || "inconnu"} a été réactivé.`,
  },
  dossierClosed: {
    type: "dossier",
    priority: "info",
    icon: "fas fa-folder-minus",
    title: "Dossier fermé",
    getMessage: (ctx) => `Le dossier ${ctx.caseNumber || ctx.entityName || ctx.entityId} a été fermé.`,
  },
  dossierReopened: {
    type: "dossier",
    priority: "success",
    icon: "fas fa-folder-open",
    title: "Dossier rouvert",
    getMessage: (ctx) => `Le dossier ${ctx.caseNumber || ctx.entityName || ctx.entityId} a été rouvert.`,
  },
  caseClosed: {
    type: "case",
    priority: "info",
    icon: "fas fa-gavel",
    title: "Procès clos",
    getMessage: (ctx) => `Le procès ${ctx.caseNumber || ctx.entityName || ctx.entityId} a été clos.`,
  },
  caseReopened: {
    type: "case",
    priority: "success",
    icon: "fas fa-gavel",
    title: "Procès rouvert",
    getMessage: (ctx) => `Le procès ${ctx.caseNumber || ctx.entityName || ctx.entityId} a été rouvert.`,
  },

  // Tasks
  taskAssigned: {
    type: "task",
    priority: "info",
    icon: "fas fa-user-check",
    title: "Tâche assignée",
    getMessage: (ctx) => `La tâche "${ctx.title}" a été assignée à ${ctx.assignee || "vous"}.`,
  },
  taskStatusChanged: {
    type: "task",
    priority: "info",
    icon: "fas fa-arrows-rotate",
    title: "Statut de tâche mis à jour",
    getMessage: (ctx) => `La tâche "${ctx.title}" est passée à "${ctx.status}".`,
  },
  taskOverdue: {
    type: "task",
    priority: "urgent",
    icon: "fas fa-exclamation-circle",
    title: "Tâche en retard",
    getMessage: (ctx) => `La tâche "${ctx.title}" est en retard depuis ${ctx.daysOverdue || 0} jour(s).`,
  },
  taskDueSoon: {
    type: "task",
    priority: "high",
    icon: "fas fa-clock",
    title: "Tâche à échéance proche",
    getMessage: (ctx) => `La tâche "${ctx.title}" arrive à échéance le ${ctx.dueDate}.`,
  },

  // Sessions
  sessionScheduled: {
    type: "session",
    priority: "info",
    icon: "fas fa-calendar-plus",
    title: "Audience programmée",
    getMessage: (ctx) => `Audience "${ctx.title}" programmée le ${ctx.date} à ${ctx.time || "heure à confirmer"}.`,
  },
  sessionUpcoming24h: {
    type: "session",
    priority: "high",
    icon: "fas fa-bell",
    title: "Audience dans 24h",
    getMessage: (ctx) => `Audience "${ctx.title}" dans 24h. Préparation finale requise.`,
  },
  sessionUpcoming1h: {
    type: "session",
    priority: "urgent",
    icon: "fas fa-hourglass-half",
    title: "Audience imminente",
    getMessage: (ctx) => `Audience "${ctx.title}" dans 1 heure.`,
  },
  sessionCompleted: {
    type: "session",
    priority: "success",
    icon: "fas fa-check-circle",
    title: "Audience terminée",
    getMessage: (ctx) => `Audience "${ctx.title}" est marquée terminée.`,
  },

  // Financial
  expenseAdded: {
    type: "financial",
    priority: "info",
    icon: "fas fa-receipt",
    title: "Dépense ajoutée",
    getMessage: (ctx) => `Nouvelle dépense ${ctx.amount ? `${ctx.amount} TND` : ""} enregistrée${ctx.category ? ` (${ctx.category})` : ""}.`,
  },
  clientAdvanceReceived: {
    type: "financial",
    priority: "success",
    icon: "fas fa-hand-holding-usd",
    title: "Avance client reçue",
    getMessage: (ctx) => `Avance reçue de ${ctx.clientName || "client"} (${ctx.amount || ""} TND).`,
  },
  clientBalanceOverdue: {
    type: "financial",
    priority: "warning",
    icon: "fas fa-exclamation-triangle",
    title: "Solde client en retard",
    getMessage: (ctx) => `Le solde de ${ctx.clientName || "client"} est en retard de paiement.`,
  },
  financialValidated: {
    type: "financial",
    priority: "info",
    icon: "fas fa-check",
    title: "Écriture validée",
    getMessage: (ctx) => `L'écriture "${ctx.description || ctx.entryId}" est validée.`,
  },
  financialPaid: {
    type: "financial",
    priority: "success",
    icon: "fas fa-check-double",
    title: "Paiement confirmé",
    getMessage: (ctx) => `Le paiement pour "${ctx.description || ctx.entryId}" est marqué payé.`,
  },

  // Missions / Officers
  missionAssigned: {
    type: "mission",
    priority: "info",
    icon: "fas fa-user-tag",
    title: "Mission assignée",
    getMessage: (ctx) => `La mission "${ctx.title}" a été assignée à ${ctx.officerName || "un huissier"}.`,
  },
  missionReassigned: {
    type: "mission",
    priority: "warning",
    icon: "fas fa-people-arrows",
    title: "Mission réassignée",
    getMessage: (ctx) => `La mission "${ctx.title}" passe de ${ctx.oldOfficer || "ancien huissier"} à ${ctx.newOfficer || "nouvel huissier"}.`,
  },
  missionOverdue: {
    type: "mission",
    priority: "high",
    icon: "fas fa-exclamation-circle",
    title: "Mission en retard",
    getMessage: (ctx) => `La mission "${ctx.title}" est en retard.${ctx.daysOverdue ? ` (${ctx.daysOverdue} jour(s))` : ""}`,
  },

  // System / Integrity
  actionBlocked: {
    type: "system",
    priority: "info",
    icon: "fas fa-shield-alt",
    title: "Action bloquée",
    getMessage: (ctx) => ctx.reason || "Action bloquée par les règles métier.",
  },
  impactConfirmed: {
    type: "system",
    priority: "info",
    icon: "fas fa-check-circle",
    title: "Impact relationnel confirmé",
    getMessage: (ctx) => ctx.summary || "Modification confirmée après avertissement d'impact.",
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
