import { RuleResult, daysUntilDate, daysSinceUpdate, getPriorityWeight } from "./shared";

const getMissionVariantIndex = (mission = {}) => {
  const rawReference = mission.reference || mission.missionNumber || "";
  if (typeof rawReference === "string") {
    const match = rawReference.match(/VARIANT:(\d+)/i);
    if (match) return Number(match[1]);
  }
  return Number.isFinite(Number(mission.variantIndex))
    ? Number(mission.variantIndex)
    : null;
};

export const MissionRules = {
  /**
   * RULE: Mission Due Today
   * Triggers: same-day due_date
   */
  dueToday(mission) {
    const dueDate = mission.due_date || mission.dueDate;
    if (!dueDate) return new RuleResult(false);

    // Skip completed or cancelled missions
    if (mission.status === "Terminee" || mission.status === "Annulee") {
      return new RuleResult(false);
    }

    const daysLeft = daysUntilDate(dueDate);
    if (daysLeft !== 0) return new RuleResult(false);

    const priorityWeight = getPriorityWeight(mission.priority);
    const missionTitle =
      mission.title || mission.description || mission.reference || "Mission";
    const variantIndex = getMissionVariantIndex(mission);

    return new RuleResult(true, {
      priority: priorityWeight >= 3 ? "urgent" : "high",
      frequency: "once",
      subType: "dueToday",
      titleKey: "content.mission.dueToday.title",
      titleParams: variantIndex !== null ? { variantIndex } : {},
      messageKey: "content.mission.dueToday.message",
      messageParams:
        variantIndex !== null ? { missionTitle, variantIndex } : { missionTitle },
      metadata: {
        missionId: mission.id,
        dueDate,
        daysLeft,
        priority: mission.priority,
      },
    });
  },

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
      const variantIndex = getMissionVariantIndex(mission);

      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.mission.upcomingDeadline.title",
        titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
        messageKey: "content.mission.upcomingDeadline.message",
        messageParams: {
          missionTitle,
          priority: priorityLabel,
          count: daysLeft,
          dueDate: dueDate, // Pass raw ISO date - will be formatted at render time
          ...(variantIndex !== null ? { variantIndex } : {}),
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
      const variantIndex = getMissionVariantIndex(mission);

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
        titleParams: variantIndex !== null ? { variantIndex } : {},
        messageKey: "content.mission.completionReminder.message",
        messageParams: {
          missionTitle,
          count: daysPastDeadline,
          ...(variantIndex !== null ? { variantIndex } : {}),
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
