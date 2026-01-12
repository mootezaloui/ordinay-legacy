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
  clients: [],
  financialEntries: [],
};

const loadEntities = (context = {}) => {
  entities = {
    tasks: context.entities?.tasks || context.tasks || [],
    sessions: context.entities?.sessions || context.sessions || [],
    missions: context.entities?.missions || context.missions || [],
    dossiers: context.entities?.dossiers || context.dossiers || [],
    cases: context.entities?.cases || context.cases || [],
    clients: context.entities?.clients || context.clients || [],
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
 * Calculate days until a target date (alias for calculateDaysDifference)
 * Positive = future, Negative = past
 */
function daysUntilDate(targetDate, fromDate = new Date()) {
  return calculateDaysDifference(targetDate, fromDate);
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
 * Notification history tracker (in-memory cache)
 * Maps ruleId to last sent timestamp
 */
const notificationHistory = new Map();

/**
 * Anti-spam: Check if notification was recently sent
 * Uses in-memory cache to track recent notifications
 */
function wasNotificationRecentlySent(ruleId, entityId, withinHours = 24) {
  const key = `${ruleId}_${entityId}`;
  const lastSent = notificationHistory.get(key);

  if (!lastSent) {
    return false;
  }

  const hoursSinceLastSent = (Date.now() - lastSent) / (1000 * 60 * 60);
  return hoursSinceLastSent < withinHours;
}

/**
 * Mark notification as sent (for deduplication)
 */
function markNotificationSent(ruleId, entityId) {
  const key = `${ruleId}_${entityId}`;
  notificationHistory.set(key, Date.now());

  // Clean up old entries (older than 7 days) to prevent memory leak
  if (notificationHistory.size > 1000) {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    for (const [k, timestamp] of notificationHistory.entries()) {
      if (timestamp < weekAgo) {
        notificationHistory.delete(k);
      }
    }
  }
}

/**
 * Clear notification history (for testing)
 */
function clearNotificationHistory() {
  notificationHistory.clear();
}

// ============================================
// RULE EVALUATION FRAMEWORK
// ============================================

/**
 * Rule result structure
 * NOW RETURNS I18N KEYS + PARAMS INSTEAD OF TRANSLATED STRINGS
 */
class RuleResult {
  constructor(shouldNotify = false, config = {}) {
    this.shouldNotify = shouldNotify;
    this.priority = config.priority || "medium";
    this.frequency = config.frequency || "once"; // once, daily, urgent
    this.subType = config.subType || "reminder";
    this.metadata = config.metadata || {};

    // NEW: i18n keys and params instead of hardcoded strings
    this.titleKey = config.titleKey || "";
    this.titleParams = config.titleParams || {};
    this.messageKey = config.messageKey || "";
    this.messageParams = config.messageParams || {};

    // DEPRECATED: Keep for backward compatibility during migration
    this.title = config.title || "";
    this.message = config.message || "";
  }
}

// ============================================
// 1️⃣ TASK-BASED INTELLIGENCE RULES
// ============================================

export const TaskRules = {
  /**
   * RULE: Overdue Task Reminders
   * Triggers: When task is past due date
   * Shows clear overdue status with days count
   */
  overdueReminder(task) {
    const dueDate = task.due_date || task.dueDate;
    if (
      !dueDate ||
      task.status === "Terminée" ||
      task.status === "Completed" ||
      task.status === "done"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      const priorityWeight = getPriorityWeight(task.priority);

      return new RuleResult(true, {
        priority: "urgent",
        frequency: daysOverdue <= 3 ? "daily" : "once",
        subType: "overdue",
        titleKey: "content.task.overdue.title",
        titleParams: { count: daysOverdue },
        messageKey: "content.task.overdue.message",
        messageParams: { taskTitle: task.title, count: daysOverdue },
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysOverdue,
          priority: task.priority,
          priorityWeight,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Upcoming Deadline Reminders
   * Triggers: At 7, 3, and 1 day(s) before due date
   * Priority-aware notifications
   *
   * EDGE CASE HANDLING: If task was created recently (e.g., created today with deadline tomorrow),
   * only send notifications for reminder days that haven't been "missed".
   * For example, if created today with deadline in 2 days, don't send the "7 days before" notification.
   */
  upcomingDeadline(task) {
    const dueDate = task.due_date || task.dueDate;
    if (
      !dueDate ||
      task.status === "Terminée" ||
      task.status === "Completed" ||
      task.status === "done"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);
    const priorityWeight = getPriorityWeight(task.priority);
    const reminderDays = [7, 3, 1];

    if (reminderDays.includes(daysLeft)) {
      // Edge case: Check if task was created recently
      // Only send notification if enough time has passed since creation
      const createdDate = task.created_at || task.createdAt;
      if (createdDate) {
        const daysSinceCreation = daysSinceUpdate(createdDate);
        const totalDaysUntilDeadline = daysLeft + daysSinceCreation;

        // If the reminder day (7, 3, or 1) is greater than total days since creation,
        // it means this reminder was "missed" because the task was created too close to deadline
        if (daysLeft > totalDaysUntilDeadline) {
          return new RuleResult(false);
        }
      }

      // Determine priority level based on days left and task priority
      let notificationPriority = "medium";
      if (daysLeft === 1) {
        notificationPriority = priorityWeight >= 3 ? "urgent" : "high";
      } else if (daysLeft === 3) {
        notificationPriority = priorityWeight >= 3 ? "high" : "medium";
      }

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.task.upcomingDeadline.title",
        titleParams: { count: daysLeft },
        messageKey: "content.task.upcomingDeadline.message",
        messageParams: { taskTitle: task.title, count: daysLeft },
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysLeft,
          priority: task.priority,
          priorityWeight,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 1.5️⃣ PERSONAL TASK RULES
// ============================================

export const PersonalTaskRules = {
  /**
   * RULE: Upcoming Personal Task Deadline Reminders
   * Triggers: At 7, 3, and 1 day(s) before due date
   * Priority-aware notifications based on personal task priority
   *
   * EDGE CASE HANDLING: If task was created recently, only send valid reminders
   */
  upcomingDeadline(personalTask) {
    const dueDate = personalTask.due_date || personalTask.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Skip completed/cancelled tasks
    const completedStatuses = ["done", "cancelled", "Terminée"];
    if (completedStatuses.includes(personalTask.status)) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);
    const priorityWeight = getPriorityWeight(personalTask.priority);
    const reminderDays = [7, 3, 1];

    if (reminderDays.includes(daysLeft)) {
      // Edge case: Check if task was created recently
      const createdDate = personalTask.created_at || personalTask.createdAt;
      if (createdDate) {
        const daysSinceCreation = daysSinceUpdate(createdDate);
        const totalDaysUntilDeadline = daysLeft + daysSinceCreation;

        // Skip "missed" reminders
        if (daysLeft > totalDaysUntilDeadline) {
          return new RuleResult(false);
        }
      }

      // Determine priority level based on days left and task priority
      let notificationPriority = "medium";
      if (daysLeft === 1) {
        notificationPriority = priorityWeight >= 3 ? "urgent" : "high";
      } else if (daysLeft === 3) {
        notificationPriority = priorityWeight >= 3 ? "high" : "medium";
      }

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.personalTask.upcomingDeadline.title",
        titleParams: { count: daysLeft },
        messageKey: "content.personalTask.upcomingDeadline.message",
        messageParams: { taskTitle: personalTask.title, count: daysLeft },
        metadata: {
          taskId: personalTask.id,
          taskTitle: personalTask.title,
          daysLeft,
          priority: personalTask.priority,
          priorityWeight,
          category: personalTask.category,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Post-Deadline Task Completion Reminder
   * Triggers: 1+ days after deadline if task is not marked as done
   * Asks user if the task was completed
   * Priority-aware reminders
   */
  completionReminder(personalTask) {
    const dueDate = personalTask.due_date || personalTask.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Skip completed/cancelled tasks
    const completedStatuses = ["done", "cancelled", "Terminée"];
    if (completedStatuses.includes(personalTask.status)) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);

    // Check if deadline has passed (1+ day ago)
    if (daysLeft < -1) {
      const daysPastDeadline = Math.abs(daysLeft);
      const priorityWeight = getPriorityWeight(personalTask.priority);

      // Frequency based on how long it's been overdue and priority
      let frequency = "once";
      if (daysPastDeadline <= 7) {
        frequency = priorityWeight >= 3 ? "daily" : "once"; // High priority gets daily reminders
      } else {
        frequency = "weekly"; // After a week, reduce to weekly
      }

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency,
        subType: "completionReminder",
        titleKey: "content.personalTask.completionReminder.title",
        titleParams: {},
        messageKey: "content.personalTask.completionReminder.message",
        messageParams: {
          taskTitle: personalTask.title,
          count: daysPastDeadline,
        },
        metadata: {
          taskId: personalTask.id,
          taskTitle: personalTask.title,
          daysPastDeadline,
          priority: personalTask.priority,
          priorityWeight,
          category: personalTask.category,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 2️⃣ SESSION/AUDIENCE LIFECYCLE RULES
// ============================================

/**
 * Resolve the correct entity reference for a session/hearing
 * Returns an object with: { reference, entityType, entityId, label }
 *
 * Resolution rules:
 * 1. If session has case_id → look up case, return case reference/title + "procès"
 * 2. Else if session has dossier_id → look up dossier, return dossier reference + "dossier"
 * 3. Else if session has title → use session title + "audience"
 * 4. Else → return null (will display as "Audience")
 */
function resolveSessionEntity(session, entities) {
  const cases = entities.cases || [];
  const dossiers = entities.dossiers || [];

  // Priority 1: Case (procès)
  if (session.case_id) {
    const parentCase = cases.find(c => c.id === session.case_id);
    if (parentCase) {
      const reference = parentCase.case_number || parentCase.reference || parentCase.reference_number || parentCase.title || `Procès #${parentCase.id}`;
      return {
        reference,
        entityType: 'case',
        entityId: parentCase.id,
        label: 'procès'
      };
    }
  }

  // Priority 2: Dossier
  if (session.dossier_id) {
    const parentDossier = dossiers.find(d => d.id === session.dossier_id);
    if (parentDossier) {
      const reference = parentDossier.reference || parentDossier.court_reference || parentDossier.title || `Dossier #${parentDossier.id}`;
      return {
        reference,
        entityType: 'dossier',
        entityId: parentDossier.id,
        label: 'dossier'
      };
    }
  }

  // Priority 3: Session title
  if (session.title && session.title.trim().length > 0) {
    return {
      reference: session.title,
      entityType: 'session',
      entityId: session.id,
      label: 'audience'
    };
  }

  // Priority 4: No reference (unlinked)
  return {
    reference: 'Audience',
    entityType: 'session',
    entityId: session.id,
    label: ''
  };
}

export const SessionRules = {
  /**
   * RULE: Upcoming Hearing/Audience Reminders
   * Triggers: At 7, 3, and 1 day(s) before scheduled hearing
   * Hearings are CRITICAL - missing one has serious legal consequences
   * Priority inherited from parent dossier
   *
   * EDGE CASE HANDLING: If hearing was scheduled recently, only send valid reminders
   */
  upcomingHearing(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Skip if not a hearing/audience
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if cancelled or completed
    if (
      session.status === "cancelled" ||
      session.status === "Annulee" ||
      session.status === "completed" ||
      session.status === "Terminee"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(scheduledDate);
    const reminderDays = [7, 3, 1];

    if (reminderDays.includes(daysLeft)) {
      // Edge case: Check if hearing was scheduled recently
      const createdDate = session.created_at || session.createdAt;
      if (createdDate) {
        const daysSinceCreation = daysSinceUpdate(createdDate);
        const totalDaysUntilHearing = daysLeft + daysSinceCreation;

        // Skip "missed" reminders
        if (daysLeft > totalDaysUntilHearing) {
          return new RuleResult(false);
        }
      }

      // Get parent dossier/case to inherit priority
      const dossiers = entities.dossiers || [];
      const cases = entities.cases || [];

      let priority = "Moyenne";
      let parentDossier = null;

      // Try to find parent via case first
      if (session.case_id) {
        const parentCase = cases.find((c) => c.id === session.case_id);
        if (parentCase && parentCase.dossier_id) {
          parentDossier = dossiers.find((d) => d.id === parentCase.dossier_id);
        }
      }

      // Or directly via dossier_id
      if (!parentDossier && session.dossier_id) {
        parentDossier = dossiers.find((d) => d.id === session.dossier_id);
      }

      if (parentDossier) {
        priority = parentDossier.priority || "Moyenne";
      }

      const priorityWeight = getPriorityWeight(priority);

      // Determine priority based on days left AND dossier priority
      // Hearings are always critical, but urgency increases with proximity
      let notificationPriority = "high";
      if (daysLeft === 1) {
        notificationPriority = "urgent"; // Always urgent 1 day before
      } else if (daysLeft === 3) {
        notificationPriority = priorityWeight >= 3 ? "urgent" : "high"; // High priority dossiers get urgent
      } else if (daysLeft === 7) {
        notificationPriority = priorityWeight >= 3 ? "high" : "medium"; // High priority gets high, others medium
      }

      // Resolve the correct entity (case/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : 'Audience';
      const entityLabel = entityInfo ? entityInfo.label : '';

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingHearing",
        entityType: entityInfo?.entityType || 'session',
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.upcomingHearing.title",
        titleParams: { count: daysLeft },
        messageKey: session.location
          ? "content.session.upcomingHearing.messageWithLocation"
          : "content.session.upcomingHearing.messageNoLocation",
        messageParams: {
          caseNumber: entityReference,
          entityLabel: entityLabel,
          count: daysLeft,
          location: session.location,
        },
        metadata: {
          sessionId: session.id,
          caseNumber: entityReference,
          entityLabel: entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          daysLeft,
          location: session.location,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Hearing Today
   * Triggers: Morning reminder on day of hearing
   * ALWAYS notify - this is critical
   */
  hearingToday(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Skip if not a hearing/audience
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if cancelled or completed
    if (
      session.status === "cancelled" ||
      session.status === "Annulee" ||
      session.status === "completed" ||
      session.status === "Terminee"
    ) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(scheduledDate);

    if (daysLeft === 0) {
      // Resolve the correct entity (case/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : 'Audience';
      const entityLabel = entityInfo ? entityInfo.label : '';

      // Extract time if available
      const time = scheduledDate.includes("T")
        ? scheduledDate.split("T")[1].substring(0, 5)
        : "l'heure prévue";

      return new RuleResult(true, {
        priority: "urgent",
        frequency: "once",
        subType: "hearingToday",
        entityType: entityInfo?.entityType || 'session',
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.hearingToday.title",
        titleParams: {},
        messageKey: session.location
          ? "content.session.hearingToday.messageWithLocation"
          : "content.session.hearingToday.message",
        messageParams: {
          caseNumber: entityReference,
          entityLabel: entityLabel,
          time,
          location: session.location
        },
        metadata: {
          sessionId: session.id,
          caseNumber: entityReference,
          entityLabel: entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          time,
          location: session.location,
          daysLeft: 0,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Post-Hearing Outcome Reminder
   * Triggers: 1 day after a hearing that hasn't been updated with an outcome
   * Prompts user to document what happened during the hearing
   * Priority inherited from parent dossier
   */
  hearingOutcomeReminder(session) {
    const scheduledDate = session.scheduled_at || session.scheduledAt;
    if (!scheduledDate) return new RuleResult(false);

    // Only check hearings/audiences
    const isHearing =
      session.session_type === "hearing" ||
      session.session_type === "Audience" ||
      session.sessionType === "hearing" ||
      session.sessionType === "Audience";

    if (!isHearing) return new RuleResult(false);

    // Skip if already completed or cancelled
    if (
      session.status === "completed" ||
      session.status === "Terminee" ||
      session.status === "cancelled" ||
      session.status === "Annulee"
    ) {
      return new RuleResult(false);
    }

    // Skip if outcome is already documented
    if (session.outcome && session.outcome.trim().length > 0) {
      return new RuleResult(false);
    }

    // Check if hearing date has passed (1+ day ago)
    const daysLeft = calculateDaysDifference(scheduledDate);

    if (daysLeft < -1) {
      // Hearing was more than 1 day ago and still no outcome
      const daysSinceHearing = Math.abs(daysLeft);

      // Get parent dossier/case to inherit priority
      const dossiers = entities.dossiers || [];
      const cases = entities.cases || [];

      let priority = "Moyenne";
      let parentDossier = null;

      // Try to find parent via case first
      if (session.case_id) {
        const parentCase = cases.find((c) => c.id === session.case_id);
        if (parentCase && parentCase.dossier_id) {
          parentDossier = dossiers.find((d) => d.id === parentCase.dossier_id);
        }
      }

      // Or directly via dossier_id
      if (!parentDossier && session.dossier_id) {
        parentDossier = dossiers.find((d) => d.id === session.dossier_id);
      }

      if (parentDossier) {
        priority = parentDossier.priority || "Moyenne";
      }

      const priorityWeight = getPriorityWeight(priority);

      // Resolve the correct entity (case/dossier/session)
      const entityInfo = resolveSessionEntity(session, entities);
      const entityReference = entityInfo ? entityInfo.reference : 'Audience';
      const entityLabel = entityInfo ? entityInfo.label : '';

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency: daysSinceHearing <= 7 ? "once" : "weekly",
        subType: "hearingOutcome",
        entityType: entityInfo?.entityType || 'session',
        entityId: entityInfo?.entityId || session.id,
        titleKey: "content.session.hearingOutcome.title",
        titleParams: {},
        messageKey: "content.session.hearingOutcome.message",
        messageParams: {
          caseNumber: entityReference,
          entityLabel: entityLabel,
          count: daysSinceHearing
        },
        metadata: {
          sessionId: session.id,
          caseNumber: entityReference,
          entityLabel: entityLabel,
          entityType: entityInfo?.entityType,
          entityId: entityInfo?.entityId,
          scheduledDate,
          daysSinceHearing,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 3️⃣ CASE/PROCÈS MANAGEMENT RULES
// ============================================

export const CaseRules = {
  /**
   * RULE: Missing Hearing/Audience Reminder
   * Triggers: When a procès has no upcoming hearings scheduled
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to active/open cases
   */
  missingHearingReminder(caseItem, context = {}) {
    const sessions = context.sessions || [];
    const dossiers = entities.dossiers || [];

    // Skip closed/suspended cases
    const closedStatuses = ["Clos", "closed", "Suspendu", "on_hold"];
    if (closedStatuses.includes(caseItem.status)) {
      return new RuleResult(false);
    }

    // Check if case has any upcoming hearings
    const caseId = caseItem.id;
    const hasUpcomingHearings = sessions.some((session) => {
      const belongsToCase = session.case_id === caseId;
      const isHearing =
        session.session_type === "hearing" ||
        session.session_type === "Audience";
      const isNotCancelled =
        session.status !== "cancelled" && session.status !== "Annulee";

      // Check if session is in the future
      const sessionDate = new Date(session.scheduled_at);
      const isFuture = sessionDate > new Date();

      return belongsToCase && isHearing && isNotCancelled && isFuture;
    });

    // If has upcoming hearings, no need to remind
    if (hasUpcomingHearings) {
      return new RuleResult(false);
    }

    // Check last reminder time to avoid spamming
    const openedDate = caseItem.opened_at || caseItem.created_at;
    if (!openedDate) return new RuleResult(false);

    const daysSinceOpened = daysSinceUpdate(openedDate);

    // Don't send reminder for very new cases (give at least 2 days)
    if (daysSinceOpened < 2) {
      return new RuleResult(false);
    }

    // Inherit priority from parent dossier (cases don't have their own priority)
    const parentDossier = dossiers.find((d) => d.id === caseItem.dossier_id);
    const priority = parentDossier?.priority || "Medium";
    const priorityWeight = getPriorityWeight(priority);

    let reminderIntervalDays;
    let priorityLabel;

    // Pass priority as normalized keys for translation in scheduler
    if (priorityWeight >= 3) {
      reminderIntervalDays = 3; // Every 3 days for high priority
      priorityLabel = "high";
    } else if (priorityWeight === 2) {
      reminderIntervalDays = 5; // Every 5 days for medium priority
      priorityLabel = "medium";
    } else {
      reminderIntervalDays = 10; // Every 10 days for low priority
      priorityLabel = "low";
    }

    // Check if enough time has passed since case opened (use modulo to trigger periodically)
    const shouldRemind = daysSinceOpened % reminderIntervalDays === 0;

    if (shouldRemind) {
      const caseTitle =
        caseItem.title || caseItem.case_number || caseItem.reference;

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingHearing",
        titleKey: "content.case.missingHearing.title",
        titleParams: {},
        messageKey: "content.case.missingHearing.message",
        messageParams: { caseTitle, priority: priorityLabel },
        metadata: {
          caseNumber: caseItem.case_number || caseItem.reference,
          caseTitle,
          priority: priorityLabel,
          dossierId: parentDossier?.id,
          daysSinceOpened,
          reminderInterval: reminderIntervalDays,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Status Update Reminder
   * Triggers: When a procès has completed activities (hearings/tasks) but hasn't been updated recently
   * Suggests checking if the case status should be updated (e.g., verdict reached, case closed)
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 7 days
   * - Medium priority: every 14 days
   * - Low priority: every 21 days
   */
  statusUpdateReminder(caseItem, context = {}) {
    const sessions = context.sessions || [];
    const tasks = context.tasks || [];
    const dossiers = entities.dossiers || [];

    // Skip closed cases - they don't need status updates
    const closedStatuses = ["Clos", "closed"];
    if (closedStatuses.includes(caseItem.status)) {
      return new RuleResult(false);
    }

    // Check for completed hearings for this case
    const completedHearings = sessions.filter((session) => {
      const belongsToCase = session.case_id === caseItem.id;
      const isHearing =
        session.session_type === "hearing" ||
        session.session_type === "Audience";
      const isCompleted =
        session.status === "completed" || session.status === "Terminee";
      return belongsToCase && isHearing && isCompleted;
    });

    // Check for completed tasks for this case
    const completedTasks = tasks.filter((task) => {
      const belongsToCase = task.case_id === caseItem.id;
      const isCompleted =
        task.status === "Terminée" || task.status === "completed";
      return belongsToCase && isCompleted;
    });

    // Only remind if there's been some activity (at least 1 completed hearing or 2 completed tasks)
    const hasSignificantActivity =
      completedHearings.length >= 1 || completedTasks.length >= 2;

    if (!hasSignificantActivity) {
      return new RuleResult(false);
    }

    // Check when the case was last updated
    const lastUpdate = caseItem.updated_at || caseItem.updatedAt;
    if (!lastUpdate) return new RuleResult(false);

    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    // Inherit priority from parent dossier (cases don't have their own priority)
    const parentDossier = dossiers.find((d) => d.id === caseItem.dossier_id);
    const priority = parentDossier?.priority || "Moyenne";
    const priorityWeight = getPriorityWeight(priority);

    let reminderIntervalDays;

    if (priorityWeight >= 3) {
      reminderIntervalDays = 7; // Weekly for high priority
    } else if (priorityWeight === 2) {
      reminderIntervalDays = 14; // Bi-weekly for medium priority
    } else {
      reminderIntervalDays = 21; // Every 3 weeks for low priority
    }

    // Only remind if enough time has passed since last update
    if (daysSinceLastUpdate >= reminderIntervalDays) {
      const caseTitle =
        caseItem.title || caseItem.case_number || caseItem.reference;

      // Build activity summary - keep for backward compatibility
      // The rendering component will use completedHearings/completedTasks counts
      // to build the localized summary using the hearingsCompleted/tasksCompleted keys
      let activitySummary = "";
      if (completedHearings.length > 0) {
        activitySummary += `${completedHearings.length} hearing(s) completed`;
      }
      if (completedTasks.length > 0) {
        if (activitySummary) activitySummary += " and ";
        activitySummary += `${completedTasks.length} task(s) completed`;
      }

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "statusUpdate",
        titleKey: "content.case.statusUpdate.title",
        titleParams: {},
        messageKey: "content.case.statusUpdate.message",
        messageParams: {
          caseTitle,
          activitySummary, // Temp fallback - rendering should build from counts
          completedHearings: completedHearings.length,
          completedTasks: completedTasks.length,
        },
        metadata: {
          caseNumber: caseItem.case_number || caseItem.reference,
          caseTitle,
          completedHearings: completedHearings.length,
          completedTasks: completedTasks.length,
          currentStatus: caseItem.status,
          daysSinceUpdate: daysSinceLastUpdate,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Missing Tasks for Procès
   * Triggers: When a procès has no active tasks associated
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to active/open cases
   */
  missingTasksReminder(caseItem, context = {}) {
    const tasks = context.tasks || [];
    const dossiers = entities.dossiers || [];

    // Skip closed/suspended cases
    const closedStatuses = ["Clos", "closed", "Suspendu", "on_hold"];
    if (closedStatuses.includes(caseItem.status)) {
      return new RuleResult(false);
    }

    // Check if case has any active tasks
    // Active = not done, not cancelled
    const caseId = caseItem.id;
    const hasActiveTasks = tasks.some((task) => {
      const belongsToCase = task.case_id === caseId;
      const activeStatuses = ["todo", "in_progress", "blocked"];
      const isActive = activeStatuses.includes(task.status);

      return belongsToCase && isActive;
    });

    // If has active tasks, no need to remind
    if (hasActiveTasks) {
      return new RuleResult(false);
    }

    // Check when case was opened
    const openedDate = caseItem.opened_at || caseItem.created_at;
    if (!openedDate) return new RuleResult(false);

    const daysSinceOpened = daysSinceUpdate(openedDate);

    // Don't send reminder for very new cases (give at least 2 days to add tasks)
    if (daysSinceOpened < 2) {
      return new RuleResult(false);
    }

    // Inherit priority from parent dossier
    const parentDossier = dossiers.find((d) => d.id === caseItem.dossier_id);
    const priority = parentDossier?.priority || "Moyenne";
    const priorityWeight = getPriorityWeight(priority);

    let reminderIntervalDays;
    let priorityLabel;

    if (priorityWeight >= 3) {
      reminderIntervalDays = 3; // Every 3 days for high priority
      priorityLabel = "high";
    } else if (priorityWeight === 2) {
      reminderIntervalDays = 5; // Every 5 days for medium priority
      priorityLabel = "medium";
    } else {
      reminderIntervalDays = 10; // Every 10 days for low priority
      priorityLabel = "low";
    }

    // Check if enough time has passed (periodic reminder)
    const shouldRemind = daysSinceOpened % reminderIntervalDays === 0;

    if (shouldRemind) {
      const caseTitle =
        caseItem.title || caseItem.case_number || caseItem.reference;

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingTasks",
        titleKey: "content.case.missingTasks.title",
        titleParams: {},
        messageKey: "content.case.missingTasks.message",
        messageParams: { caseTitle, priority: priorityLabel },
        metadata: {
          caseNumber: caseItem.case_number || caseItem.reference,
          caseTitle,
          priority: priorityLabel,
          dossierId: parentDossier?.id,
          daysSinceOpened,
          reminderInterval: reminderIntervalDays,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 4️⃣ MISSION (HUISSIER) WORKFLOW RULES
// ============================================

export const MissionRules = {
  /**
   * RULE: Upcoming Mission Deadline
   * Triggers: 7, 3, 1 days before due_date
   * Priority-aware urgency based on mission's own priority field
   */
  upcomingDeadline(mission) {
    const dueDate = mission.due_date || mission.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Skip completed or cancelled missions
    if (mission.status === "Terminee" || mission.status === "Annulee") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const priorityWeight = getPriorityWeight(mission.priority);
    const reminderDays = [7, 3, 1];

    // Edge case: Don't trigger "missed" reminders for recently created missions
    const createdDate = mission.created_at || mission.createdAt;
    if (createdDate) {
      const daysSinceCreation = daysSinceUpdate(createdDate);
      const totalDaysUntilDeadline = daysLeft + daysSinceCreation;

      // If this reminder day was before the mission was created, skip it
      if (daysLeft > totalDaysUntilDeadline) {
        return new RuleResult(false);
      }
    }

    if (reminderDays.includes(daysLeft)) {
      // Pass priority as a key for translation in scheduler
      // The scheduler will translate using t('notifications:content.priority.{key}')
      const priorityLabel =
        priorityWeight >= 3 ? "high" : priorityWeight === 2 ? "medium" : "low";

      // Priority-aware notification urgency
      let notificationPriority = "medium";
      if (daysLeft === 1) {
        notificationPriority = priorityWeight >= 3 ? "urgent" : "high";
      } else if (daysLeft === 3) {
        notificationPriority = priorityWeight >= 3 ? "high" : "medium";
      } else if (daysLeft === 7) {
        notificationPriority = priorityWeight >= 2 ? "medium" : "low";
      }

      const missionTitle =
        mission.title || mission.description || mission.reference || "Mission";

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.mission.upcomingDeadline.title",
        titleParams: { count: daysLeft },
        messageKey: "content.mission.upcomingDeadline.message",
        messageParams: {
          missionTitle,
          priority: priorityLabel,
          count: daysLeft,
          dueDate: dueDate, // Pass raw ISO date - will be formatted at render time
        },
        metadata: {
          missionId: mission.id,
          dueDate,
          daysLeft,
          priority: mission.priority,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Mission Completion Reminder
   * Triggers: 1+ days after due_date if mission status is not "Terminee"
   * Asks if the huissier has finished the task
   * Priority-based frequency: high priority = daily, others = weekly after 7 days
   */
  completionReminder(mission) {
    const dueDate = mission.due_date || mission.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Only trigger for missions that are not completed or cancelled
    if (mission.status === "Terminee" || mission.status === "Annulee") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const priorityWeight = getPriorityWeight(mission.priority);

    // Trigger only if deadline has passed (1+ days overdue)
    if (daysLeft < -1) {
      const daysPastDeadline = Math.abs(daysLeft);
      const missionTitle =
        mission.title || mission.description || mission.reference || "Mission";

      // Priority-based frequency
      let frequency = "once";
      if (daysPastDeadline <= 7) {
        // First week: daily for high priority, once for others
        frequency = priorityWeight >= 3 ? "daily" : "once";
      } else {
        // After a week: weekly reminders
        frequency = "weekly";
      }

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency,
        subType: "completionReminder",
        titleKey: "content.mission.completionReminder.title",
        titleParams: {},
        messageKey: "content.mission.completionReminder.message",
        messageParams: {
          missionTitle,
          count: daysPastDeadline,
        },
        metadata: {
          missionId: mission.id,
          dueDate,
          daysPastDeadline,
          priority: mission.priority,
          status: mission.status,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 4.5️⃣ FINANCIAL & PAYMENT RULES
// ============================================

export const FinancialRules = {
  /**
   * RULE: Upcoming Payment Due Date Reminder
   * Triggers: 7, 3, 1 days before due_date
   * Applies to unpaid income/revenue entries (client payments expected)
   */
  upcomingPaymentReminder(financialEntry) {
    const dueDate = financialEntry.due_date || financialEntry.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Only for income/revenue entries (payments we expect to receive)
    const isPaymentExpected =
      financialEntry.entry_type === "income" ||
      financialEntry.entry_type === "revenue";

    if (!isPaymentExpected) return new RuleResult(false);

    // Skip if already paid or voided
    if (financialEntry.status === "paid" || financialEntry.status === "void") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const reminderDays = [7, 3, 1];

    // Edge case: Don't trigger "missed" reminders for recently created entries
    const createdDate = financialEntry.created_at || financialEntry.createdAt;
    if (createdDate) {
      const daysSinceCreation = daysSinceUpdate(createdDate);
      const totalDaysUntilDueDate = daysLeft + daysSinceCreation;

      // Skip "missed" reminders
      if (daysLeft > totalDaysUntilDueDate) {
        return new RuleResult(false);
      }
    }

    if (reminderDays.includes(daysLeft)) {
      // Look up parent entities to get context
      const clients = entities.clients || [];
      const dossiers = entities.dossiers || [];
      const cases = entities.cases || [];

      let clientName = "Client";
      let contextInfo = "";

      // Try to get client directly
      if (financialEntry.client_id) {
        const client = clients.find((c) => c.id === financialEntry.client_id);
        if (client) {
          clientName = client.name;
        }
      }

      // Try to get dossier context
      if (financialEntry.dossier_id) {
        const dossier = dossiers.find(
          (d) => d.id === financialEntry.dossier_id
        );
        if (dossier) {
          contextInfo = ` - Dossier: ${
            dossier.case_number || dossier.reference
          }`;
          // If no client found yet, get from dossier
          if (clientName === "Client" && dossier.client_id) {
            const client = clients.find((c) => c.id === dossier.client_id);
            if (client) clientName = client.name;
          }
        }
      }

      // Try to get case context
      if (financialEntry.case_id) {
        const caseItem = cases.find((c) => c.id === financialEntry.case_id);
        if (caseItem) {
          contextInfo = ` - Procès: ${
            caseItem.case_number || caseItem.reference
          }`;
          // Get dossier from case to find client
          if (clientName === "Client" && caseItem.dossier_id) {
            const dossier = dossiers.find((d) => d.id === caseItem.dossier_id);
            if (dossier && dossier.client_id) {
              const client = clients.find((c) => c.id === dossier.client_id);
              if (client) clientName = client.name;
            }
          }
        }
      }

      const amount = financialEntry.amount || 0;
      const currency = financialEntry.currency || "TND";

      // Determine priority based on proximity
      let notificationPriority = "medium";
      if (daysLeft === 1) {
        notificationPriority = "high";
      } else if (daysLeft === 3) {
        notificationPriority = "medium";
      }

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingPayment",
        titleKey: "content.financial.upcomingPayment.title",
        titleParams: { count: daysLeft },
        messageKey: financialEntry.description
          ? "content.financial.upcomingPayment.messageWithDescription"
          : "content.financial.upcomingPayment.message",
        messageParams: {
          amount,
          currency,
          clientName,
          contextInfo,
          count: daysLeft,
          description: financialEntry.description || "",
        },
        metadata: {
          financialEntryId: financialEntry.id,
          clientName,
          amount,
          currency,
          dueDate,
          daysLeft,
          entryType: financialEntry.entry_type,
          dossierId: financialEntry.dossier_id,
          caseId: financialEntry.case_id,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Overdue Payment Reminder
   * Triggers: 1, 3, 7, 14 days after due_date if payment not received
   * Multiple reminders to follow up on late payments
   */
  overduePaymentReminder(financialEntry) {
    const dueDate = financialEntry.due_date || financialEntry.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Only for income/revenue entries (payments we expect to receive)
    const isPaymentExpected =
      financialEntry.entry_type === "income" ||
      financialEntry.entry_type === "revenue";

    if (!isPaymentExpected) return new RuleResult(false);

    // Skip if already paid or voided
    if (financialEntry.status === "paid" || financialEntry.status === "void") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    const overdueReminderDays = [1, 3, 7, 14]; // Days after due date to remind

    // Check if payment is overdue
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);

      // Only send reminder on specific days
      if (overdueReminderDays.includes(daysOverdue)) {
        // Look up parent entities to get context
        const clients = entities.clients || [];
        const dossiers = entities.dossiers || [];
        const cases = entities.cases || [];

        let clientName = "Client";
        let contextInfo = "";

        // Try to get client directly
        if (financialEntry.client_id) {
          const client = clients.find((c) => c.id === financialEntry.client_id);
          if (client) {
            clientName = client.name;
          }
        }

        // Try to get dossier context
        if (financialEntry.dossier_id) {
          const dossier = dossiers.find(
            (d) => d.id === financialEntry.dossier_id
          );
          if (dossier) {
            contextInfo = ` - Dossier: ${
              dossier.case_number || dossier.reference
            }`;
            // If no client found yet, get from dossier
            if (clientName === "Client" && dossier.client_id) {
              const client = clients.find((c) => c.id === dossier.client_id);
              if (client) clientName = client.name;
            }
          }
        }

        // Try to get case context
        if (financialEntry.case_id) {
          const caseItem = cases.find((c) => c.id === financialEntry.case_id);
          if (caseItem) {
            contextInfo = ` - Procès: ${
              caseItem.case_number || caseItem.reference
            }`;
            // Get dossier from case to find client
            if (clientName === "Client" && caseItem.dossier_id) {
              const dossier = dossiers.find(
                (d) => d.id === caseItem.dossier_id
              );
              if (dossier && dossier.client_id) {
                const client = clients.find((c) => c.id === dossier.client_id);
                if (client) clientName = client.name;
              }
            }
          }
        }

        const amount = financialEntry.amount || 0;
        const currency = financialEntry.currency || "TND";

        // Escalating priority based on how long it's overdue
        let notificationPriority = "high";
        if (daysOverdue >= 7) {
          notificationPriority = "urgent"; // Very overdue
        }

        return new RuleResult(true, {
          priority: notificationPriority,
          frequency: "once",
          subType: "overduePayment",
          titleKey: "content.financial.overduePayment.title",
          titleParams: { count: daysOverdue },
          messageKey: "content.financial.overduePayment.message",
          messageParams: {
            amount,
            currency,
            clientName,
            contextInfo,
            count: daysOverdue,
          },
          metadata: {
            financialEntryId: financialEntry.id,
            clientName,
            amount,
            currency,
            dueDate,
            daysOverdue,
            entryType: financialEntry.entry_type,
            dossierId: financialEntry.dossier_id,
            caseId: financialEntry.case_id,
          },
        });
      }
    }

    return new RuleResult(false);
  },
};

// ============================================
// 5️⃣ DOSSIER MANAGEMENT RULES
// ============================================

export const DossierRules = {
  /**
   * RULE: Dossier Inactivity (7+ Days)
   * Triggers: When dossier hasn't been updated for 7+ days
   * Only applies to active dossiers (not closed/archived)
   */
  inactivityReminder(dossier) {
    // Skip closed/archived dossiers
    if (
      dossier.status === "Fermé" ||
      dossier.status === "Ferme" ||
      dossier.status === "Clos" ||
      dossier.status === "Archivé" ||
      dossier.status === "closed"
    ) {
      return new RuleResult(false);
    }

    const lastUpdate = dossier.updated_at || dossier.updatedAt;
    if (!lastUpdate) return new RuleResult(false);

    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    if (daysSinceLastUpdate >= 7) {
      const dossierNumber =
        dossier.case_number || dossier.caseNumber || dossier.reference;

      return new RuleResult(true, {
        priority: "medium",
        frequency: "once",
        subType: "inactivityReminder",
        titleKey: "content.dossier.inactivityReminder.title",
        titleParams: { count: daysSinceLastUpdate },
        messageKey: "content.dossier.inactivityReminder.message",
        messageParams: {
          dossierNumber,
          count: daysSinceLastUpdate,
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          daysSinceLastUpdate,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Dossier Review Reminder
   * Triggers: Based on priority - High: 7 days, Medium: 15 days, Low: 30 days
   * Suggests periodic review to ensure nothing is missed
   */
  reviewReminder(dossier) {
    // Skip closed/archived dossiers
    if (
      dossier.status === "Fermé" ||
      dossier.status === "Ferme" ||
      dossier.status === "Clos" ||
      dossier.status === "Archivé" ||
      dossier.status === "closed"
    ) {
      return new RuleResult(false);
    }

    const lastUpdate = dossier.updated_at || dossier.updatedAt;
    if (!lastUpdate) return new RuleResult(false);

    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);
    const priorityWeight = getPriorityWeight(dossier.priority);

    // Review thresholds based on priority
    const reviewThreshold =
      priorityWeight >= 3
        ? 7 // High priority: review every 7 days
        : priorityWeight === 2
        ? 15 // Medium priority: review every 15 days
        : 30; // Low priority: review every 30 days

    if (daysSinceLastUpdate >= reviewThreshold) {
      // Pass priority as a key for translation in scheduler
      const priorityLabel =
        priorityWeight >= 3 ? "high" : priorityWeight === 2 ? "medium" : "low";

      const dossierNumber =
        dossier.case_number || dossier.caseNumber || dossier.reference;

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency: "once",
        subType: "reviewReminder",
        titleKey: "content.dossier.reviewReminder.title",
        titleParams: { priority: priorityLabel },
        messageKey: "content.dossier.reviewReminder.message",
        messageParams: {
          dossierNumber,
          priority: priorityLabel,
          count: daysSinceLastUpdate,
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          daysSinceLastUpdate,
          priority: dossier.priority,
          reviewThreshold,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Prochaine Échéance (Next Deadline)
   * Triggers: Notifications for upcoming deadlines
   * - Overdue: Immediate notification
   * - Due today: Morning reminder
   * - Due in 1-3 days: Daily reminders
   * - Due in 7 days: Single reminder
   *
   * EDGE CASE HANDLING:
   * 1. If deadline was set recently, only send notifications for reminder days that haven't been "missed"
   * 2. DUPLICATE PREVENTION: If any task exists with the same deadline, skip this notification
   *    (task notifications are more specific and actionable)
   */
  nextDeadline(dossier) {
    const deadlineDate = dossier.next_deadline || dossier.nextDeadline;
    if (!deadlineDate) return new RuleResult(false);

    // Guard against invalid deadline values that would break date math
    const dossierDeadlineDate = new Date(deadlineDate);
    if (Number.isNaN(dossierDeadlineDate.getTime())) {
      return new RuleResult(false);
    }

    // DUPLICATE PREVENTION: Check if any task has the same deadline
    const tasks = entities.tasks || [];
    const hasTaskWithSameDeadline = tasks.some((task) => {
      // Check if task belongs to this dossier
      const taskBelongsToDossier =
        task.dossier_id === dossier.id || task.dossierId === dossier.id;

      if (!taskBelongsToDossier) return false;

      // Check if task is active (not completed/cancelled)
      const isActiveTask =
        task.status !== "Terminée" &&
        task.status !== "Completed" &&
        task.status !== "done" &&
        task.status !== "cancelled";

      if (!isActiveTask) return false;

      // Check if task has the same deadline (compare dates)
      const taskDeadline = task.due_date || task.dueDate;
      if (!taskDeadline) return false;

      const taskDeadlineDate = new Date(taskDeadline);
      if (Number.isNaN(taskDeadlineDate.getTime())) return false;

      // Normalize dates to compare (remove time component)
      const dossierDeadlineNormalized = dossierDeadlineDate
        .toISOString()
        .split("T")[0];
      const taskDeadlineNormalized = taskDeadlineDate
        .toISOString()
        .split("T")[0];

      return dossierDeadlineNormalized === taskDeadlineNormalized;
    });

    // If a task exists with the same deadline, skip dossier notification
    // (task notification is more specific and provides better context)
    if (hasTaskWithSameDeadline) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(deadlineDate);

    // Overdue deadline - always notify
    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      const dossierNumber =
        dossier.case_number || dossier.caseNumber || dossier.reference;

      return new RuleResult(true, {
        priority: "urgent",
        frequency: daysOverdue <= 3 ? "daily" : "once",
        subType: "deadlineOverdue",
        titleKey: "content.dossier.deadlineOverdue.title",
        titleParams: { count: daysOverdue },
        messageKey: "content.dossier.deadlineOverdue.message",
        messageParams: {
          dossierNumber,
          count: daysOverdue,
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          deadline: deadlineDate,
          daysOverdue,
        },
      });
    }

    // Due today - always notify
    if (daysLeft === 0) {
      const dossierNumber =
        dossier.case_number || dossier.caseNumber || dossier.reference;

      return new RuleResult(true, {
        priority: "urgent",
        frequency: "once",
        subType: "deadlineToday",
        titleKey: "content.dossier.deadlineToday.title",
        titleParams: {},
        messageKey: "content.dossier.deadlineToday.message",
        messageParams: {
          dossierNumber,
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          deadline: deadlineDate,
          daysLeft: 0,
        },
      });
    }

    // Edge case check: For upcoming deadlines, verify the deadline wasn't just set
    const lastUpdate = dossier.updated_at || dossier.updatedAt;
    if (lastUpdate && daysLeft > 0) {
      const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);
      const totalDaysUntilDeadline = daysLeft + daysSinceLastUpdate;

      // Due in 1-3 days (daily reminders)
      if (daysLeft >= 1 && daysLeft <= 3) {
        // Only send if the deadline existed long enough for this reminder to be valid
        if (daysLeft > totalDaysUntilDeadline) {
          return new RuleResult(false);
        }

        const dossierNumber =
          dossier.case_number || dossier.caseNumber || dossier.reference;

        return new RuleResult(true, {
          priority: "high",
          frequency: "daily",
          subType: "deadlineUpcoming",
          titleKey: "content.dossier.deadlineUpcoming.title",
          titleParams: { count: daysLeft },
          messageKey: "content.dossier.deadlineUpcoming.message",
          messageParams: {
            dossierNumber,
            count: daysLeft,
          },
          metadata: {
            dossierId: dossier.id,
            dossierNumber,
            deadline: deadlineDate,
            daysLeft,
          },
        });
      }

      // Due in 7 days (single reminder)
      if (daysLeft === 7) {
        // Only send if the deadline existed long enough (at least 7 days)
        if (totalDaysUntilDeadline < 7) {
          return new RuleResult(false);
        }

        const dossierNumber =
          dossier.case_number || dossier.caseNumber || dossier.reference;

        return new RuleResult(true, {
          priority: "medium",
          frequency: "once",
          subType: "deadlineWeek",
          titleKey: "content.dossier.deadlineWeek.title",
          titleParams: {},
          messageKey: "content.dossier.deadlineWeek.message",
          messageParams: {
            dossierNumber,
          },
          metadata: {
            dossierId: dossier.id,
            dossierNumber,
            deadline: deadlineDate,
            daysLeft: 7,
          },
        });
      }
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Missing Tasks for Dossier
   * Triggers: When a dossier has no active tasks AND no active procès with tasks
   * Frequency depends on dossier priority:
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to open/active dossiers
   */
  missingTasksReminder(dossier, context = {}) {
    const tasks = context.tasks || [];
    const cases = context.cases || [];

    // Skip closed/archived dossiers
    const closedStatuses = ["Clos", "closed", "archived", "Archivé"];
    if (closedStatuses.includes(dossier.status)) {
      return new RuleResult(false);
    }

    const dossierId = dossier.id;

    // Check if dossier has any active tasks directly attached
    const hasActiveDossierTasks = tasks.some((task) => {
      const belongsToDossier = task.dossier_id === dossierId;
      const activeStatuses = ["todo", "in_progress", "blocked"];
      const isActive = activeStatuses.includes(task.status);

      return belongsToDossier && isActive;
    });

    // Check if any procès under this dossier has active tasks
    const dossierCases = cases.filter((c) => c.dossier_id === dossierId);
    const hasActiveCaseTasks = dossierCases.some((caseItem) => {
      return tasks.some((task) => {
        const belongsToCase = task.case_id === caseItem.id;
        const activeStatuses = ["todo", "in_progress", "blocked"];
        const isActive = activeStatuses.includes(task.status);

        return belongsToCase && isActive;
      });
    });

    // If has any active tasks (dossier-level or case-level), no need to remind
    if (hasActiveDossierTasks || hasActiveCaseTasks) {
      return new RuleResult(false);
    }

    // Check when dossier was created
    const createdDate = dossier.created_at || dossier.createdAt;
    if (!createdDate) return new RuleResult(false);

    const daysSinceCreated = daysSinceUpdate(createdDate);

    // Don't send reminder for very new dossiers (give at least 2 days)
    if (daysSinceCreated < 2) {
      return new RuleResult(false);
    }

    // Use dossier's own priority
    const priority = dossier.priority || "Moyenne";
    const priorityWeight = getPriorityWeight(priority);

    let reminderIntervalDays;
    let priorityLabel;

    if (priorityWeight >= 3) {
      reminderIntervalDays = 3; // Every 3 days for high priority
      priorityLabel = "high";
    } else if (priorityWeight === 2) {
      reminderIntervalDays = 5; // Every 5 days for medium priority
      priorityLabel = "medium";
    } else {
      reminderIntervalDays = 10; // Every 10 days for low priority
      priorityLabel = "low";
    }

    // Check if enough time has passed (periodic reminder)
    const shouldRemind = daysSinceCreated % reminderIntervalDays === 0;

    if (shouldRemind) {
      const dossierNumber =
        dossier.reference ||
        dossier.reference_number ||
        dossier.dossier_number ||
        dossier.court_reference ||
        `Dossier #${dossier.id}`;

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingTasks",
        titleKey: "content.dossier.missingTasks.title",
        titleParams: {},
        messageKey: "content.dossier.missingTasks.message",
        messageParams: { dossierNumber, priority: priorityLabel },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          priority: priorityLabel,
          daysSinceCreated,
          reminderInterval: reminderIntervalDays,
        },
      });
    }

    return new RuleResult(false);
  },
};

// ============================================
// 6️⃣ CLIENT ACTIVITY & ENGAGEMENT RULES
// ============================================

export const ClientRules = {
  /**
   * RULE: Client inActive (60+ Days)
   * Triggers: When client hasn't had ANY activity for 60+ days
   * Checks: dossier updates, tasks, sessions, payments
   */
  inActiveClient(client, context = {}) {
    if (!client.updated_at && !client.updatedAt) {
      return new RuleResult(false);
    }

    const lastUpdate = client.updated_at || client.updatedAt;
    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    // Only check active clients
    const isActive = client.status === "Active" || client.status === "active";
    if (!isActive) {
      return new RuleResult(false);
    }

    if (daysSinceLastUpdate >= 60) {
      // Check if client has any recent activity across all entities
      const clientId = client.id;
      const dossiers = entities.dossiers || [];
      const tasks = entities.tasks || [];
      const sessions = entities.sessions || [];
      const financialEntries = entities.financialEntries || [];

      // Find any recent activity related to this client
      const hasRecentDossierActivity = dossiers.some((d) => {
        if (d.client_id !== clientId && d.clientId !== clientId) return false;
        const dossierDays = daysSinceUpdate(d.updated_at || d.updatedAt);
        return dossierDays < 60;
      });

      const hasRecentTaskActivity = tasks.some((t) => {
        const relatedDossier = dossiers.find(
          (d) =>
            (d.id === t.dossier_id || d.id === t.dossierId) &&
            (d.client_id === clientId || d.clientId === clientId)
        );
        if (!relatedDossier) return false;
        const taskDays = daysSinceUpdate(t.updated_at || t.updatedAt);
        return taskDays < 60;
      });

      const hasRecentSessionActivity = sessions.some((s) => {
        const relatedDossier = dossiers.find(
          (d) =>
            (d.id === s.dossier_id || d.id === s.dossierId) &&
            (d.client_id === clientId || d.clientId === clientId)
        );
        if (!relatedDossier) return false;
        const sessionDays = daysSinceUpdate(s.updated_at || s.updatedAt);
        return sessionDays < 60;
      });

      const hasRecentFinancialActivity = financialEntries.some((f) => {
        if (f.client_id !== clientId && f.clientId !== clientId) return false;
        const financialDays = daysSinceUpdate(f.updated_at || f.updatedAt);
        return financialDays < 60;
      });

      // If no recent activity found, trigger notification
      if (
        !hasRecentDossierActivity &&
        !hasRecentTaskActivity &&
        !hasRecentSessionActivity &&
        !hasRecentFinancialActivity
      ) {
        return new RuleResult(true, {
          priority: "medium",
          frequency: "once",
          subType: "inActiveClient",
          titleKey: "content.client.inActive.title",
          titleParams: { count: daysSinceLastUpdate },
          messageKey: "content.client.inActive.message",
          messageParams: {
            clientName: client.name,
            count: daysSinceLastUpdate,
          },
          metadata: {
            clientId: client.id,
            clientName: client.name,
            daysSinceLastUpdate,
            suggestAction: "mark_inactive",
          },
        });
      }
    }

    return new RuleResult(false);
  },
};

// ============================================
// 6️⃣ SYSTEM-LEVEL SMART NUDGES (DISABLED)
// ============================================

export const SystemRules = {};

// ============================================
// RULE REGISTRY & EXECUTOR
// ============================================

/**
 * Central Rule Registry
 * All rules organized by entity type
 */
export const RuleRegistry = {
  task: TaskRules,
  personalTask: PersonalTaskRules,
  session: SessionRules,
  case: CaseRules,
  mission: MissionRules,
  financial: FinancialRules,
  dossier: DossierRules,
  client: ClientRules,
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
          // Mark as sent to prevent duplicates
          markNotificationSent(ruleId, entity.id);
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
  const personalTasks = entities.personalTasks || [];
  const sessions = entities.sessions || [];
  const cases = entities.cases || [];
  const missions = entities.missions || [];
  const financialEntries = entities.financialEntries || [];
  const dossiers = entities.dossiers || [];
  const clients = entities.clients || [];

  // Evaluate task rules (overdue, upcoming deadlines)
  tasks.forEach((task) => {
    const taskNotifications = evaluateEntityRules("task", task, context);
    allNotifications.push(...taskNotifications);
  });

  // Evaluate personal task rules (upcoming deadlines, completion reminders)
  personalTasks.forEach((personalTask) => {
    const personalTaskNotifications = evaluateEntityRules(
      "personalTask",
      personalTask,
      context
    );
    allNotifications.push(...personalTaskNotifications);
  });

  // Evaluate session rules (upcoming hearings, hearing today)
  sessions.forEach((session) => {
    const sessionNotifications = evaluateEntityRules(
      "session",
      session,
      context
    );
    allNotifications.push(...sessionNotifications);
  });

  // Evaluate case/procès rules (missing hearings, status updates)
  cases.forEach((caseItem) => {
    const caseNotifications = evaluateEntityRules("case", caseItem, context);
    allNotifications.push(...caseNotifications);
  });

  // Evaluate mission rules (upcoming deadlines, completion reminders)
  missions.forEach((mission) => {
    const missionNotifications = evaluateEntityRules(
      "mission",
      mission,
      context
    );
    allNotifications.push(...missionNotifications);
  });

  // Evaluate financial rules (upcoming payments, overdue payments)
  financialEntries.forEach((financialEntry) => {
    const financialNotifications = evaluateEntityRules(
      "financial",
      financialEntry,
      context
    );
    allNotifications.push(...financialNotifications);
  });

  // Evaluate dossier rules (inactivity, review, deadline)
  dossiers.forEach((dossier) => {
    const dossierNotifications = evaluateEntityRules(
      "dossier",
      dossier,
      context
    );
    allNotifications.push(...dossierNotifications);
  });

  // Evaluate client rules (60-day inactivity)
  clients.forEach((client) => {
    const clientNotifications = evaluateEntityRules("client", client, context);
    allNotifications.push(...clientNotifications);
  });

  return allNotifications;
}

/**
 * Export rule evaluation for external use
 */
export default {
  TaskRules,
  PersonalTaskRules,
  SessionRules,
  CaseRules,
  MissionRules,
  FinancialRules,
  DossierRules,
  ClientRules,
  SystemRules,
  RuleRegistry,
  evaluateEntityRules,
  evaluateAllRules,
  markNotificationSent,
  clearNotificationHistory,
};
