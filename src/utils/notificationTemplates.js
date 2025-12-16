/**
 * Notification Templates for Date-Related Reminders
 * Provides variety in notification messages for different events
 */

/**
 * TASK NOTIFICATIONS - 6 varieties
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
 * SESSION NOTIFICATIONS - 6 varieties
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
 * PAYMENT NOTIFICATIONS - 6 varieties
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
 * MISSION NOTIFICATIONS (for Huissiers)
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
