import { RuleResult, daysSinceUpdate, getPriorityWeight, getVariantIndexFromText } from "./shared";

export const DossierRules = {
  /**
   * RULE: Dossier Inactivity (7+ Days)
   * Triggers: When dossier hasn't been updated for 7+ days
   * Only applies to active dossiers (not closed/archived)
   */
  inactivityReminder(dossier) {
    // Skip closed/archived dossiers
    if (
      dossier.status === "Ferm├⌐" ||
      dossier.status === "Ferme" ||
      dossier.status === "Clos" ||
      dossier.status === "Archiv├⌐" ||
      dossier.status === "closed"
    ) {
      return new RuleResult(false);
    }

    const lastUpdate = dossier.updated_at || dossier.updatedAt;
    if (!lastUpdate) return new RuleResult(false);

    const daysSinceLastUpdate = daysSinceUpdate(lastUpdate);

    if (daysSinceLastUpdate >= 7) {
      const dossierNumber =
        dossier.lawsuitNumber || dossier.lawsuitNumber || dossier.reference;
      const variantIndex = getVariantIndexFromText(dossier.description);

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
          ...(variantIndex !== null ? { variantIndex } : {}),
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          daysSinceLastUpdate,
          ...(variantIndex !== null ? { variantIndex } : {}),
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
      dossier.status === "Ferm├⌐" ||
      dossier.status === "Ferme" ||
      dossier.status === "Clos" ||
      dossier.status === "Archiv├⌐" ||
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
        dossier.lawsuitNumber || dossier.lawsuitNumber || dossier.reference;
      const variantIndex = getVariantIndexFromText(dossier.description);

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
          ...(variantIndex !== null ? { variantIndex } : {}),
        },
        metadata: {
          dossierId: dossier.id,
          dossierNumber,
          daysSinceLastUpdate,
          priority: dossier.priority,
          reviewThreshold,
          ...(variantIndex !== null ? { variantIndex } : {}),
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Missing Tasks for Dossier
   * Triggers: When a dossier has no active tasks AND no active proc├¿s with tasks
   * Frequency depends on dossier priority:
   * - High priority: every 3 days
   * - Medium priority: every 5 days
   * - Low priority: every 10 days
   * Only applies to open/active dossiers
   */
  missingTasksReminder(dossier, context = {}) {
    const tasks = context.tasks || [];
    const lawsuits = context.lawsuits || [];

    // Skip closed/archived dossiers
    const closedStatuses = ["Clos", "closed", "archived", "Archiv├⌐"];
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

    // Check if any proc├¿s under this dossier has active tasks
    const dossierLawsuits = lawsuits.filter((c) => c.dossier_id === dossierId);
    const hasActiveLawsuitTasks = dossierLawsuits.some((lawsuitItem) => {
      return tasks.some((task) => {
      const belongsToLawsuit = task.lawsuit_id === lawsuitItem.id;
        const activeStatuses = ["todo", "in_progress", "blocked"];
        const isActive = activeStatuses.includes(task.status);

        return belongsToLawsuit && isActive;
      });
    });

    // If has any active tasks (dossier-level or lawsuit-level), no need to remind
    if (hasActiveDossierTasks || hasActiveLawsuitTasks) {
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
      const variantIndex = getVariantIndexFromText(dossier.description);

      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        subType: "missingTasks",
        titleKey: "content.dossier.missingTasks.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
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



