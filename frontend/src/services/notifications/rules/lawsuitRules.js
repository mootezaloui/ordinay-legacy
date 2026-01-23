import { RuleResult, daysSinceUpdate, getPriorityWeight, getVariantIndexFromText } from "./shared";
import { entities } from "./shared/entityLoader";

export const LawsuitRules = {
  /**
   * RULE: Missing Hearing/Audience Reminder
   * Triggers: When a proc├¿s has no upcoming hearings scheduled
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to active/open lawsuits
   */
  missingHearingReminder(lawsuitItem, context = {}) {
    const sessions = context.sessions || [];
    const dossiers = entities.dossiers || [];

    // Skip closed/suspended lawsuits
    const closedStatuses = ["Clos", "closed", "Suspendu", "on_hold"];
    if (closedStatuses.includes(lawsuitItem.status)) {
      return new RuleResult(false);
    }

    // Check if lawsuit has any upcoming hearings
    const lawsuitId = lawsuitItem.id;
    const hasUpcomingHearings = sessions.some((session) => {
      const belongsToLawsuit = session.lawsuit_id === lawsuitId;
      const isHearing =
        session.session_type === "hearing" ||
        session.session_type === "Audience";
      const isNotCancelled =
        session.status !== "cancelled" && session.status !== "Annulee";

      // Check if session is in the future
      const sessionDate = new Date(session.scheduled_at);
      const isFuture = sessionDate > new Date();

      return belongsToLawsuit && isHearing && isNotCancelled && isFuture;
    });

    // If has upcoming hearings, no need to remind
    if (hasUpcomingHearings) {
      return new RuleResult(false);
    }

    // Check last reminder time to avoid spamming
    const openedDate = lawsuitItem.opened_at || lawsuitItem.created_at;
    if (!openedDate) return new RuleResult(false);

    const daysSinceOpened = daysSinceUpdate(openedDate);

    // Don't send reminder for very new lawsuits (give at least 2 days)
    if (daysSinceOpened < 2) {
      return new RuleResult(false);
    }

    // Inherit priority from parent dossier (lawsuits don't have their own priority)
    const parentDossier = dossiers.find((d) => d.id === lawsuitItem.dossier_id);
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

    // Check if enough time has passed since lawsuit opened (use modulo to trigger periodically)
    const shouldRemind = daysSinceOpened % reminderIntervalDays === 0;

    if (shouldRemind) {
      const lawsuitTitle =
        lawsuitItem.title || lawsuitItem.lawsuitNumber || lawsuitItem.reference;
      const variantIndex = getVariantIndexFromText(lawsuitItem.description);

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingHearing",
        titleKey: "content.lawsuit.missingHearing.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: "content.lawsuit.missingHearing.message",
        messageParams: { lawsuitTitle, priority: priorityLabel },
        metadata: {
          lawsuitNumber: lawsuitItem.lawsuitNumber || lawsuitItem.reference,
          lawsuitTitle,
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
   * Triggers: When a proc├¿s has completed activities (hearings/tasks) but hasn't been updated recently
   * Suggests checking if the lawsuit status should be updated (e.g., verdict reached, lawsuit closed)
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 7 days
   * - Medium priority: every 14 days
   * - Low priority: every 21 days
   */
  statusUpdateReminder(lawsuitItem, context = {}) {
    const sessions = context.sessions || [];
    const tasks = context.tasks || [];
    const dossiers = entities.dossiers || [];

    // Skip closed lawsuits - they don't need status updates
    const closedStatuses = ["Clos", "closed"];
    if (closedStatuses.includes(lawsuitItem.status)) {
      return new RuleResult(false);
    }

    // Check for completed hearings for this lawsuit
    const completedHearings = sessions.filter((session) => {
      const belongsToLawsuit = session.lawsuit_id === lawsuitItem.id;
      const isHearing =
        session.session_type === "hearing" ||
        session.session_type === "Audience";
      const isCompleted =
        session.status === "completed" || session.status === "Terminee";
      return belongsToLawsuit && isHearing && isCompleted;
    });

    // Check for completed tasks for this lawsuit
    const completedTasks = tasks.filter((task) => {
      const belongsToLawsuit = task.lawsuit_id === lawsuitItem.id;
      const isCompleted =
        task.status === "Termin├⌐e" || task.status === "completed";
      return belongsToLawsuit && isCompleted;
    });

    // Only remind if there's been some activity (at least 1 completed hearing or 2 completed tasks)
    const hasSignificantActivity =
      completedHearings.length >= 1 || completedTasks.length >= 2;

    if (!hasSignificantActivity) {
      return new RuleResult(false);
    }

    // Check when the lawsuit was last updated
    const lastUpdate = lawsuitItem.updated_at || lawsuitItem.updatedAt;
    if (!lastUpdate) return new RuleResult(false);

    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    // Inherit priority from parent dossier (lawsuits don't have their own priority)
    const parentDossier = dossiers.find((d) => d.id === lawsuitItem.dossier_id);
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
      const lawsuitTitle =
        lawsuitItem.title || lawsuitItem.lawsuitNumber || lawsuitItem.reference;
      const variantIndex = getVariantIndexFromText(lawsuitItem.description);

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
        titleKey: "content.lawsuit.statusUpdate.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: "content.lawsuit.statusUpdate.message",
        messageParams: {
          lawsuitTitle,
          activitySummary, // Temp fallback - rendering should build from counts
          completedHearings: completedHearings.length,
          completedTasks: completedTasks.length,
        },
        metadata: {
          lawsuitNumber: lawsuitItem.lawsuitNumber || lawsuitItem.reference,
          lawsuitTitle,
          completedHearings: completedHearings.length,
          completedTasks: completedTasks.length,
          currentStatus: lawsuitItem.status,
          daysSinceUpdate: daysSinceLastUpdate,
          dossierId: parentDossier?.id,
          dossierPriority: priority,
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Missing Tasks for Proc├¿s
   * Triggers: When a proc├¿s has no active tasks associated
   * Frequency depends on priority (inherited from parent dossier):
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to active/open lawsuits
   */
  missingTasksReminder(lawsuitItem, context = {}) {
    const tasks = context.tasks || [];
    const dossiers = entities.dossiers || [];

    // Skip closed/suspended lawsuits
    const closedStatuses = ["Clos", "closed", "Suspendu", "on_hold"];
    if (closedStatuses.includes(lawsuitItem.status)) {
      return new RuleResult(false);
    }

    // Check if lawsuit has any active tasks
    // Active = not done, not cancelled
    const lawsuitId = lawsuitItem.id;
    const hasActiveTasks = tasks.some((task) => {
      const belongsToLawsuit = task.lawsuit_id === lawsuitId;
      const activeStatuses = ["todo", "in_progress", "blocked"];
      const isActive = activeStatuses.includes(task.status);

      return belongsToLawsuit && isActive;
    });

    // If has active tasks, no need to remind
    if (hasActiveTasks) {
      return new RuleResult(false);
    }

    // Check when lawsuit was opened
    const openedDate = lawsuitItem.opened_at || lawsuitItem.created_at;
    if (!openedDate) return new RuleResult(false);

    const daysSinceOpened = daysSinceUpdate(openedDate);

    // Don't send reminder for very new lawsuits (give at least 2 days to add tasks)
    if (daysSinceOpened < 2) {
      return new RuleResult(false);
    }

    // Inherit priority from parent dossier
    const parentDossier = dossiers.find((d) => d.id === lawsuitItem.dossier_id);
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
      const lawsuitTitle =
        lawsuitItem.title || lawsuitItem.lawsuitNumber || lawsuitItem.reference;
      const variantIndex = getVariantIndexFromText(lawsuitItem.description);

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingTasks",
        titleKey: "content.lawsuit.missingTasks.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: "content.lawsuit.missingTasks.message",
        messageParams: { lawsuitTitle, priority: priorityLabel },
        metadata: {
          lawsuitNumber: lawsuitItem.lawsuitNumber || lawsuitItem.reference,
          lawsuitTitle,
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




