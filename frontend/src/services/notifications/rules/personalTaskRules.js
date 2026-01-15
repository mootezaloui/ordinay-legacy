import { RuleResult, calculateDaysDifference, daysSinceUpdate, getPriorityWeight, getVariantIndexFromText } from "./shared";

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
    const completedStatuses = ["done", "cancelled", "Termin├⌐e"];
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

      const variantIndex = getVariantIndexFromText(personalTask.description);
      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.personalTask.upcomingDeadline.title",
        titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
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
    const completedStatuses = ["done", "cancelled", "Termin├⌐e"];
    if (completedStatuses.includes(personalTask.status)) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);

    // Check if deadline has passed (1+ day ago)
    if (daysLeft < 0) {
      const daysPastDeadline = Math.abs(daysLeft);
      const priorityWeight = getPriorityWeight(personalTask.priority);

      // Frequency based on how long it's been overdue and priority
      let frequency = "once";
      if (daysPastDeadline <= 7) {
        frequency = priorityWeight >= 3 ? "daily" : "once"; // High priority gets daily reminders
      } else {
        frequency = "weekly"; // After a week, reduce to weekly
      }

      const variantIndex = getVariantIndexFromText(personalTask.description);
      return new RuleResult(true, {
        priority: priorityWeight >= 3 ? "high" : "medium",
        frequency,
        subType: "completionReminder",
        titleKey: "content.personalTask.completionReminder.title",
        titleParams: variantIndex !== null ? { variantIndex } : {},
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
