/**
 * INTELLIGENT NOTIFICATION RULES ENGINE
 *
 * This is the brain of the notification system.
 * Rules decide WHEN to notify based on:
 * - Entity type & state
 * - Priority level
 * - Time elapsed/remaining
 * - User activity
 * - Frequency limits (anti-spam)
 *
 * Philosophy: Think like a legal assistant, not a cron job.
 */

// Live entities are provided by callers (scheduler/context) via a context object.
let entities = {
  tasks: [],
  sessions: [],
  missions: [],
  dossiers: [],
  cases: [],
  financialEntries: [],
};

const loadEntities = (context = {}) => {
  entities = {
    tasks: context.entities?.tasks || context.tasks || [],
    sessions: context.entities?.sessions || context.sessions || [],
    missions: context.entities?.missions || context.missions || [],
    dossiers: context.entities?.dossiers || context.dossiers || [],
    cases: context.entities?.cases || context.cases || [],
    financialEntries:
      context.entities?.financialEntries || context.financialEntries || [],
  };
};

const getAllMissions = () => entities.missions || [];

// ============================================
// CORE UTILITIES
// ============================================

/**
 * Calculate days difference (negative = past, positive = future)
 */
function calculateDaysDifference(targetDate, fromDate = new Date()) {
  const target = new Date(targetDate);
  const from = new Date(fromDate);
  target.setHours(0, 0, 0, 0);
  from.setHours(0, 0, 0, 0);
  const diffTime = target - from;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Calculate days since last update
 */
function daysSinceUpdate(entityDate, currentDate = new Date()) {
  const entity = new Date(entityDate);
  const current = new Date(currentDate);
  entity.setHours(0, 0, 0, 0);
  current.setHours(0, 0, 0, 0);
  const diffTime = current - entity;
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Check if entity was recently accessed/modified
 * (In production, this would check actual user activity logs)
 */
function wasRecentlyAccessed(entityType, entityId, withinDays = 1) {
  // Placeholder - in production, check actual activity logs
  return false;
}

/**
 * Get priority weight (for frequency calculation)
 */
function getPriorityWeight(priority) {
  const weights = {
    Haute: 3,
    High: 3,
    Urgent: 3,
    Moyenne: 2,
    Medium: 2,
    Normale: 2,
    Basse: 1,
    Low: 1,
  };
  return weights[priority] || 1;
}

/**
 * Anti-spam: Check if notification was recently sent
 * (In production, this would check notification history)
 */
function wasNotificationRecentlySent(ruleId, entityId, withinHours = 24) {
  // Placeholder - in production, check notification history database
  // For now, we'll assume false to allow initial implementation
  return false;
}

// ============================================
// RULE EVALUATION FRAMEWORK
// ============================================

/**
 * Rule result structure
 */
class RuleResult {
  constructor(shouldNotify = false, config = {}) {
    this.shouldNotify = shouldNotify;
    this.priority = config.priority || "medium";
    this.frequency = config.frequency || "once"; // once, daily, urgent
    this.title = config.title || "";
    this.message = config.message || "";
    this.subType = config.subType || "reminder";
    this.metadata = config.metadata || {};
  }
}

// ============================================
// 1️⃣ TASK-BASED INTELLIGENCE RULES
// ============================================

export const TaskRules = {
  /**
   * RULE: High Priority Task - Upcoming Deadline
   * Triggers: Daily reminders in last 3 days before due date
   */
  highPriorityUpcoming(task) {
    if (!task.dueDate || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(task.dueDate);
    const isHighPriority = getPriorityWeight(task.priority) >= 3;

    if (isHighPriority && daysLeft >= 0 && daysLeft <= 3) {
      return new RuleResult(true, {
        priority: "high",
        frequency: "daily",
        subType: "upcoming",
        title: `Échéance Critique - ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        message: `La tâche haute priorité "${
          task.title
        }" arrive à échéance dans ${daysLeft} jour${
          daysLeft > 1 ? "s" : ""
        }. Action requise.`,
        metadata: { daysLeft, taskPriority: task.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Medium Priority Task - Moderate Reminders
   * Triggers: Reminders at 7 days, 3 days, 1 day
   */
  mediumPriorityUpcoming(task) {
    if (!task.dueDate || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(task.dueDate);
    const isMediumPriority = getPriorityWeight(task.priority) === 2;
    const reminderDays = [7, 3, 1];

    if (isMediumPriority && reminderDays.includes(daysLeft)) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "upcoming",
        title: `Rappel de Tâche - ${daysLeft} jour${daysLeft > 1 ? "s" : ""}`,
        message: `La tâche "${
          task.title
        }" doit être terminée dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`,
        metadata: { daysLeft, taskPriority: task.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Low Priority Task - Single Reminder
   * Triggers: One reminder at 1 day before
   */
  lowPriorityUpcoming(task) {
    if (!task.dueDate || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(task.dueDate);
    const isLowPriority = getPriorityWeight(task.priority) === 1;

    if (isLowPriority && daysLeft === 1) {
      return new RuleResult(true, {
        priority: "low",
        frequency: "once",
        subType: "upcoming",
        title: "Rappel de Tâche",
        message: `La tâche "${task.title}" est prévue pour demain.`,
        metadata: { daysLeft, taskPriority: task.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Task Due Today
   * Triggers: Morning reminder for all non-completed tasks due today
   */
  dueToday(task) {
    if (!task.dueDate || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(task.dueDate);

    if (daysLeft === 0) {
      return new RuleResult(true, {
        priority: "high",
        frequency: "once",
        subType: "dueToday",
        title: "Échéance Aujourd'hui",
        message: `La tâche "${task.title}" doit être terminée aujourd'hui.`,
        metadata: { daysLeft: 0, taskPriority: task.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Overdue Task - Escalating Reminders
   * Triggers: Increasing urgency based on days overdue
   */
  overdue(task) {
    if (!task.dueDate || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(task.dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      const priorityWeight = getPriorityWeight(task.priority);

      // Escalation thresholds based on priority
      const shouldEscalate =
        (priorityWeight >= 3 && daysOverdue >= 1) || // High priority: immediate
        (priorityWeight === 2 && daysOverdue >= 2) || // Medium: after 2 days
        (priorityWeight === 1 && daysOverdue >= 7); // Low: after 1 week

      if (shouldEscalate) {
        return new RuleResult(true, {
          priority: "urgent",
          frequency: daysOverdue <= 3 ? "daily" : "once",
          subType: "overdue",
          title: `RETARD - ${daysOverdue} jour${daysOverdue > 1 ? "s" : ""}`,
          message: `La tâche "${
            task.title
          }" est en retard de ${daysOverdue} jour${
            daysOverdue > 1 ? "s" : ""
          }. Merci de la finaliser ou mettre à jour son statut.`,
          metadata: { daysOverdue, taskPriority: task.priority },
        });
      }
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Inactive Task - No Status Update
   * Triggers: If task hasn't been updated for N days (based on priority)
   */
  inactiveTask(task) {
    if (!task.updatedAt || task.status === "Terminée") {
      return new RuleResult(false);
    }

    const daysSinceLastUpdate = daysSinceUpdate(task.updatedAt);
    const priorityWeight = getPriorityWeight(task.priority);

    // Inactivity thresholds based on priority
    const inactivityThreshold =
      priorityWeight >= 3
        ? 3 // High: 3 days
        : priorityWeight === 2
        ? 7 // Medium: 7 days
        : 14; // Low: 14 days

    if (daysSinceLastUpdate >= inactivityThreshold) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "statusCheck",
        title: "Vérification de Statut",
        message: `La tâche "${task.title}" n'a pas été mise à jour depuis ${daysSinceLastUpdate} jours. Est-elle toujours pertinente ?`,
        metadata: { daysSinceLastUpdate, taskPriority: task.priority },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 2️⃣ SESSION/AUDIENCE LIFECYCLE RULES
// ============================================

export const SessionRules = {
  /**
   * RULE: Session Tomorrow
   * Triggers: Evening reminder for session next day
   */
  sessionTomorrow(session) {
    if (!session.date) return new RuleResult(false);

    const daysLeft = calculateDaysDifference(session.date);

    if (daysLeft === 1) {
      const sessionType = session.caseId ? "procès" : "dossier";
      return new RuleResult(true, {
        priority: "high",
        frequency: "once",
        subType: "tomorrow",
        title: "Audience Demain",
        message: `L'audience pour ${sessionType} "${
          session.caseNumber || session.dossierNumber
        }" est prévue demain à ${session.time || "l'heure prévue"}.`,
        metadata: { daysLeft: 1, sessionType },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Session Today
   * Triggers: Morning reminder on day of session
   */
  sessionToday(session) {
    if (!session.date) return new RuleResult(false);

    const daysLeft = calculateDaysDifference(session.date);

    if (daysLeft === 0) {
      return new RuleResult(true, {
        priority: "urgent",
        frequency: "once",
        subType: "today",
        title: "Audience Aujourd'hui",
        message: `Audience aujourd'hui à ${
          session.time || "l'heure prévue"
        } - ${session.subject || "Audience programmée"}`,
        metadata: { daysLeft: 0, time: session.time },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Session Preparation
   * Triggers: Reminders at 7, 3, 2 days before
   */
  sessionPreparation(session) {
    if (!session.date) return new RuleResult(false);

    const daysLeft = calculateDaysDifference(session.date);
    const preparationDays = [7, 3, 2];

    if (preparationDays.includes(daysLeft)) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "preparation",
        title: `Préparation Audience - ${daysLeft} jours`,
        message: `L'audience du ${session.date} approche. Pensez à préparer le dossier et vérifier les pièces.`,
        metadata: { daysLeft, preparationPhase: true },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Session Status Not Updated After Event
   * Triggers: If session date passed but status not updated
   */
  sessionStatusNotUpdated(session) {
    if (!session.date) return new RuleResult(false);

    const daysLeft = calculateDaysDifference(session.date);
    const daysPassed = Math.abs(daysLeft);

    // Check if session passed but status still pending/scheduled
    const isPastSession = daysLeft < 0;
    const needsUpdate =
      session.status !== "Terminée" && session.status !== "Annulée";

    if (isPastSession && needsUpdate && daysPassed >= 1 && daysPassed <= 7) {
      return new RuleResult(true, {
        priority: "high",
        frequency: daysPassed <= 2 ? "daily" : "once",
        subType: "statusUpdate",
        title: "Mise à Jour Requise",
        message: `L'audience du ${session.date} est passée. Merci de mettre à jour le statut et d'ajouter le compte rendu.`,
        metadata: { daysPassed, needsStatusUpdate: true },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Postponed Session Follow-up
   * Triggers: If session was postponed, remind to reschedule
   */
  postponedSessionFollowup(session) {
    if (session.status !== "Reportée" && session.status !== "Postponed") {
      return new RuleResult(false);
    }

    const daysSincePostponed = session.updatedAt
      ? daysSinceUpdate(session.updatedAt)
      : 0;

    if (daysSincePostponed >= 2) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "postponed",
        title: "Audience Reportée",
        message: `L'audience "${session.subject}" a été reportée. Avez-vous fixé une nouvelle date ?`,
        metadata: { daysSincePostponed, status: session.status },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 3️⃣ MISSION (HUISSIER) WORKFLOW RULES
// ============================================

export const MissionRules = {
  /**
   * RULE: Mission Assigned
   * Triggers: When mission is newly assigned
   */
  missionAssigned(mission) {
    if (!mission.assignDate) return new RuleResult(false);

    const daysSinceAssignment = daysSinceUpdate(mission.assignDate);

    if (daysSinceAssignment === 0) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "assigned",
        title: "Nouvelle Mission",
        message: `Mission "${mission.title}" assignée à l'huissier ${
          mission.officerName || "désigné"
        }.`,
        metadata: { assignmentDate: mission.assignDate },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Due Today
   * Triggers: Reminder on due date
   */
  missionDueToday(mission) {
    if (
      !mission.dueDate ||
      mission.status === "Terminée" ||
      mission.status === "Annulée"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(mission.dueDate);

    if (daysLeft === 0) {
      const isHighPriority =
        mission.priority === "Haute" || mission.priority === "High";
      return new RuleResult(true, {
        priority: isHighPriority ? "urgent" : "high",
        frequency: "once",
        subType: "dueToday",
        title: "Mission Échéance Aujourd'hui",
        message: `La mission "${mission.title}" doit être exécutée aujourd'hui.`,
        metadata: { daysLeft: 0, missionPriority: mission.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Upcoming (High Priority)
   * Triggers: Daily reminders for high priority missions
   */
  missionUpcoming(mission) {
    if (
      !mission.dueDate ||
      mission.status === "Terminée" ||
      mission.status === "Annulée"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(mission.dueDate);
    const isHighPriority =
      mission.priority === "Haute" || mission.priority === "High";

    if (isHighPriority && daysLeft > 0 && daysLeft <= 3) {
      return new RuleResult(true, {
        priority: "high",
        frequency: "daily",
        subType: "upcoming",
        title: `Mission Prioritaire - ${daysLeft} jour${
          daysLeft > 1 ? "s" : ""
        }`,
        message: `La mission "${
          mission.title
        }" doit être réalisée dans ${daysLeft} jour${daysLeft > 1 ? "s" : ""}.`,
        metadata: { daysLeft, missionPriority: mission.priority },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Completed - Documents Check
   * Triggers: After mission marked complete, check if documents uploaded
   */
  missionCompletedDocumentsCheck(mission) {
    if (mission.status !== "Terminée") {
      return new RuleResult(false);
    }

    const hasDocuments = mission.documents && mission.documents.length > 0;
    const daysSinceCompletion = mission.updatedAt
      ? daysSinceUpdate(mission.updatedAt)
      : 0;

    // Check after 1 day if no documents
    if (!hasDocuments && daysSinceCompletion >= 1 && daysSinceCompletion <= 7) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "documentsCheck",
        title: "Documents Mission",
        message: `La mission "${mission.title}" est terminée. Les documents justificatifs ont-ils été récupérés et archivés ?`,
        metadata: { daysSinceCompletion, hasDocuments: false },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Overdue
   * Triggers: If mission past due date
   */
  missionOverdue(mission) {
    if (
      !mission.dueDate ||
      mission.status === "Terminée" ||
      mission.status === "Annulée"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(mission.dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      return new RuleResult(true, {
        priority: "urgent",
        frequency: daysOverdue <= 3 ? "daily" : "once",
        subType: "overdue",
        title: `Mission en Retard - ${daysOverdue} jour${
          daysOverdue > 1 ? "s" : ""
        }`,
        message: `La mission "${
          mission.title
        }" est en retard de ${daysOverdue} jour${
          daysOverdue > 1 ? "s" : ""
        }. Vérifier le statut avec l'huissier.`,
        metadata: { daysOverdue },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Reassigned (Audit Trail)
   * Triggers: Informational when mission changes officer
   */
  missionReassigned(mission, previousOfficerId) {
    if (!previousOfficerId || mission.officerId === previousOfficerId) {
      return new RuleResult(false);
    }

    return new RuleResult(true, {
      priority: "low",
      frequency: "once",
      subType: "reassigned",
      title: "Mission Réassignée",
      message: `La mission "${mission.title}" a été réassignée à un nouvel huissier.`,
      metadata: { previousOfficerId, newOfficerId: mission.officerId },
    });
  },
};

// ============================================
// 4️⃣ FINANCIAL & ADMINISTRATIVE RULES
// ============================================

export const FinancialRules = {
  /**
   * RULE: Client Advance Received
   * Triggers: Confirmation when advance payment recorded
   */
  advanceReceived(entry) {
    if (
      entry.type !== "revenue" ||
      entry.category !== "advance" ||
      entry.status !== "paid"
    ) {
      return new RuleResult(false);
    }

    const daysSincePayment = entry.date ? daysSinceUpdate(entry.date) : 999;

    if (daysSincePayment === 0) {
      return new RuleResult(true, {
        priority: "low",
        frequency: "once",
        subType: "advanceReceived",
        title: "Avance Reçue",
        message: `Avance de ${entry.amount} ${entry.currency} reçue pour ${
          entry.clientName || "client"
        }.`,
        metadata: {
          amount: entry.amount,
          currency: entry.currency,
          clientName: entry.clientName,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Payment Overdue
   * Triggers: When payment is past due date
   */
  paymentOverdue(entry) {
    if (
      !entry.dueDate ||
      entry.status === "paid" ||
      entry.status === "void"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(entry.dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      // Rate-limited reminders: at 1, 7, 14, 30 days
      const reminderDays = [1, 7, 14, 30];

      if (reminderDays.includes(daysOverdue)) {
        return new RuleResult(true, {
          priority: daysOverdue >= 7 ? "urgent" : "high",
          frequency: "once",
          subType: "paymentOverdue",
          title: `Paiement en Retard - ${daysOverdue} jour${
            daysOverdue > 1 ? "s" : ""
          }`,
          message: `Paiement de ${entry.amount} ${entry.currency} pour ${
            entry.clientName || "client"
          } en retard de ${daysOverdue} jour${daysOverdue > 1 ? "s" : ""}.`,
          metadata: {
            daysOverdue,
            amount: entry.amount,
            clientName: entry.clientName,
          },
        });
      }
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Payment Due Today
   * Triggers: Reminder on payment due date
   */
  paymentDueToday(entry) {
    if (
      !entry.dueDate ||
      entry.status === "paid" ||
      entry.status === "void"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(entry.dueDate);

    if (daysLeft === 0) {
      return new RuleResult(true, {
        priority: "high",
        frequency: "once",
        subType: "paymentDueToday",
        title: "Paiement Dû Aujourd'hui",
        message: `Paiement de ${entry.amount} ${
          entry.currency
        } attendu aujourd'hui - ${entry.clientName || "Client"}.`,
        metadata: { amount: entry.amount, clientName: entry.clientName },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Payment Upcoming
   * Triggers: Reminder 3 days before payment due
   */
  paymentUpcoming(entry) {
    if (
      !entry.dueDate ||
      entry.status === "paid" ||
      entry.status === "void"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(entry.dueDate);

    if (daysLeft === 3) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "paymentUpcoming",
        title: "Paiement à Venir - 3 jours",
        message: `Paiement de ${entry.amount} ${
          entry.currency
        } attendu dans 3 jours - ${entry.clientName || "Client"}.`,
        metadata: { daysLeft: 3, amount: entry.amount },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Expense Without Reimbursement
   * Triggers: If expense added but not marked as reimbursed after N days
   */
  expenseNotReimbursed(entry) {
    if (entry.type !== "expense" || entry.scope !== "internal") {
      return new RuleResult(false);
    }

    const daysSinceExpense = entry.date ? daysSinceUpdate(entry.date) : 0;
    const isNotPaid = entry.status !== "paid";

    if (isNotPaid && daysSinceExpense >= 7) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "expenseNotReimbursed",
        title: "Dépense Non Remboursée",
        message: `Dépense de ${entry.amount} ${entry.currency} (${entry.description}) non remboursée depuis ${daysSinceExpense} jours.`,
        metadata: { daysSinceExpense, amount: entry.amount },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Client Balance Negative
   * Triggers: When client owes money (rate-limited)
   */
  clientBalanceOverdue(clientId, balance) {
    if (balance >= 0) return new RuleResult(false);

    const amountOwed = Math.abs(balance);

    // Only notify if amount is significant (> 100)
    if (amountOwed > 100) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "weekly", // Rate-limited to weekly
        subType: "balanceOverdue",
        title: "Solde Client Négatif",
        message: `Le client a un solde impayé de ${amountOwed.toFixed(
          2
        )} TND. Relance recommandée.`,
        metadata: { clientId, balance, amountOwed },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 5️⃣ SYSTEM-LEVEL SMART NUDGES
// ============================================

export const SystemRules = {
  /**
   * RULE: Daily Activity Nudge
   * Triggers: If no dossier updates today (checked at end of day)
   */
  noDossierUpdatesToday(allDossiers, currentDate = new Date()) {
    const today = currentDate.toISOString().split("T")[0];

    const updatedToday = allDossiers.some((dossier) => {
      const lastUpdate = dossier.updatedAt || dossier.createdAt;
      return lastUpdate && lastUpdate.startsWith(today);
    });

    if (!updatedToday) {
      const currentHour = currentDate.getHours();

      // Only trigger after 3 PM
      if (currentHour >= 15) {
        return new RuleResult(true, {
          priority: "low",
          frequency: "once",
          subType: "noDossierUpdates",
          title: "Activité du Jour",
          message:
            "Aucun dossier n'a été mis à jour aujourd'hui. Tout va bien ?",
          metadata: { date: today },
        });
      }
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Multiple Deadlines Approaching
   * Triggers: When several tasks are due within 2 days
   */
  multipleDeadlinesApproaching(tasks) {
    const upcomingTasks = tasks.filter((task) => {
      if (!task.dueDate || task.status === "Terminée") return false;
      const daysLeft = calculateDaysDifference(task.dueDate);
      return daysLeft >= 0 && daysLeft <= 2;
    });

    if (upcomingTasks.length >= 3) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "multipleDeadlines",
        title: "Plusieurs Échéances Proches",
        message: `${upcomingTasks.length} tâches arrivent à échéance dans les 2 prochains jours. Planification recommandée.`,
        metadata: {
          taskCount: upcomingTasks.length,
          tasks: upcomingTasks.map((t) => t.id),
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Missions Pending Follow-up
   * Triggers: When multiple missions completed but not fully processed
   */
  missionsPendingFollowup(missions) {
    const pendingFollowup = missions.filter((mission) => {
      if (mission.status !== "Terminée") return false;

      const hasDocuments = mission.documents && mission.documents.length > 0;
      const hasFinancialEntry =
        mission.financialEntries && mission.financialEntries.length > 0;
      const daysSinceCompletion = mission.updatedAt
        ? daysSinceUpdate(mission.updatedAt)
        : 0;

      return (!hasDocuments || !hasFinancialEntry) && daysSinceCompletion >= 2;
    });

    if (pendingFollowup.length >= 2) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "pendingFollowup",
        title: "Missions Non Finalisées",
        message: `${pendingFollowup.length} missions terminées nécessitent un suivi (documents ou frais manquants).`,
        metadata: {
          missionCount: pendingFollowup.length,
          missions: pendingFollowup.map((m) => m.id),
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Overdue Items Summary
   * Triggers: Weekly summary of all overdue items
   */
  weeklyOverdueSummary(tasks, sessions, missions, currentDate = new Date()) {
    const dayOfWeek = currentDate.getDay();

    // Only trigger on Mondays (1)
    if (dayOfWeek !== 1) {
      return new RuleResult(false);
    }

    const overdueTasks = tasks.filter((task) => {
      if (!task.dueDate || task.status === "Terminée") return false;
      return calculateDaysDifference(task.dueDate) < 0;
    });

    const overdueMissions = missions.filter((mission) => {
      if (!mission.dueDate || mission.status === "Terminée") return false;
      return calculateDaysDifference(mission.dueDate) < 0;
    });

    const overdueCount = overdueTasks.length + overdueMissions.length;

    if (overdueCount > 0) {
      return new RuleResult(true, {
        priority: "medium",
        frequency: "weekly",
        subType: "overdueSummary",
        title: "Résumé Hebdomadaire",
        message: `${overdueCount} élément${
          overdueCount > 1 ? "s" : ""
        } en retard : ${overdueTasks.length} tâche${
          overdueTasks.length > 1 ? "s" : ""
        }, ${overdueMissions.length} mission${
          overdueMissions.length > 1 ? "s" : ""
        }.`,
        metadata: {
          overdueTasks: overdueTasks.length,
          overdueMissions: overdueMissions.length,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Inactive Dossiers Check
   * Triggers: Monthly reminder for dossiers not updated in 30+ days
   */
  inactiveDossiersCheck(dossiers) {
    const inactiveDossiers = dossiers.filter((dossier) => {
      if (
        dossier.status === "Fermé" ||
        dossier.status === "Clos" ||
        dossier.status === "Archivé"
      ) {
        return false;
      }

      const daysSinceLastUpdate = dossier.updatedAt
        ? daysSinceUpdate(dossier.updatedAt)
        : 999;
      return daysSinceLastUpdate >= 30;
    });

    if (inactiveDossiers.length > 0) {
      return new RuleResult(true, {
        priority: "low",
        frequency: "monthly",
        subType: "inactiveDossiers",
        title: "Dossiers Inactifs",
        message: `${inactiveDossiers.length} dossier${
          inactiveDossiers.length > 1 ? "s" : ""
        } n'${
          inactiveDossiers.length > 1 ? "ont" : "a"
        } pas été mis à jour depuis 30+ jours.`,
        metadata: {
          dossierCount: inactiveDossiers.length,
          dossiers: inactiveDossiers.map((d) => d.id),
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// RULE REGISTRY & EXECUTOR
// ============================================

/**
 * Central Rule Registry
 * All rules organized by entity type
 */
export const RuleRegistry = {
  task: TaskRules,
  session: SessionRules,
  mission: MissionRules,
  financial: FinancialRules,
  system: SystemRules,
};

/**
 * Execute all rules for a given entity
 * Returns array of notifications that should be triggered
 */
export function evaluateEntityRules(entityType, entity, context = {}) {
  loadEntities(context);
  const rules = RuleRegistry[entityType];
  if (!rules) return [];

  const notifications = [];

  // Execute each rule for this entity
  Object.keys(rules).forEach((ruleName) => {
    const rule = rules[ruleName];

    try {
      const result = rule(entity, context);

      if (result.shouldNotify) {
        // Check anti-spam: was this notification recently sent?
        const ruleId = `${entityType}_${ruleName}_${entity.id || "system"}`;
        if (!wasNotificationRecentlySent(ruleId, entity.id)) {
          notifications.push({
            ruleId,
            ruleName,
            entityType,
            entityId: entity.id,
            ...result,
          });
        }
      }
    } catch (error) {
      console.error(
        `Error evaluating rule ${ruleName} for ${entityType}:`,
        error
      );
    }
  });

  return notifications;
}

/**
 * Evaluate all rules across all entities
 * This is called by the scheduler periodically
 */
export function evaluateAllRules(currentDate = new Date(), context = {}) {
  loadEntities(context);
  const allNotifications = [];

  const tasks = entities.tasks || [];
  const sessions = entities.sessions || [];
  const missions = getAllMissions();
  const financialEntries = entities.financialEntries || [];
  const dossiers = entities.dossiers || [];

  tasks.forEach((task) => {
    const taskNotifications = evaluateEntityRules("task", task, context);
    allNotifications.push(...taskNotifications);
  });

  sessions.forEach((session) => {
    const sessionNotifications = evaluateEntityRules("session", session, context);
    allNotifications.push(...sessionNotifications);
  });

  missions.forEach((mission) => {
    const missionNotifications = evaluateEntityRules("mission", mission, context);
    allNotifications.push(...missionNotifications);
  });

  financialEntries.forEach((entry) => {
    const financialNotifications = evaluateEntityRules("financial", entry, context);
    allNotifications.push(...financialNotifications);
  });

  // Daily activity check
  const noDossierUpdates = SystemRules.noDossierUpdatesToday(
    dossiers,
    currentDate
  );
  if (noDossierUpdates.shouldNotify) {
    allNotifications.push({
      ruleId: "system_noDossierUpdates",
      ruleName: "noDossierUpdatesToday",
      entityType: "system",
      ...noDossierUpdates,
    });
  }

  // Multiple deadlines
  const multipleDeadlines = SystemRules.multipleDeadlinesApproaching(tasks);
  if (multipleDeadlines.shouldNotify) {
    allNotifications.push({
      ruleId: "system_multipleDeadlines",
      ruleName: "multipleDeadlinesApproaching",
      entityType: "system",
      ...multipleDeadlines,
    });
  }

  // Missions pending followup
  const missionsPending = SystemRules.missionsPendingFollowup(missions);
  if (missionsPending.shouldNotify) {
    allNotifications.push({
      ruleId: "system_missionsPending",
      ruleName: "missionsPendingFollowup",
      entityType: "system",
      ...missionsPending,
    });
  }

  // Weekly summary
  const weeklySummary = SystemRules.weeklyOverdueSummary(
    tasks,
    sessions,
    missions,
    currentDate
  );
  if (weeklySummary.shouldNotify) {
    allNotifications.push({
      ruleId: "system_weeklySummary",
      ruleName: "weeklyOverdueSummary",
      entityType: "system",
      ...weeklySummary,
    });
  }

  // Inactive dossiers
  const inactiveDossiers = SystemRules.inactiveDossiersCheck(dossiers);
  if (inactiveDossiers.shouldNotify) {
    allNotifications.push({
      ruleId: "system_inactiveDossiers",
      ruleName: "inactiveDossiersCheck",
      entityType: "system",
      ...inactiveDossiers,
    });
  }

  return allNotifications;
}

/**
 * Export rule evaluation for external use
 */
export default {
  TaskRules,
  SessionRules,
  MissionRules,
  FinancialRules,
  SystemRules,
  RuleRegistry,
  evaluateEntityRules,
  evaluateAllRules,
};
