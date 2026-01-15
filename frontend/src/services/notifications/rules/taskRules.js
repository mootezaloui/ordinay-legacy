import { RuleResult, calculateDaysDifference, daysSinceUpdate, getPriorityWeight, getVariantIndexFromText, isTaskClosedStatus, resolveTaskParent } from "./shared";

export const TaskRules = {
  /**
   * RULE: Overdue Task Reminders
   * Triggers: When task is past due date
   * Shows clear overdue status with days count
   */
  overdueReminder(task) {
    const dueDate = task.due_date || task.dueDate;
    if (!dueDate || isTaskClosedStatus(task.status)) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);

    if (daysLeft < 0) {
      const daysOverdue = Math.abs(daysLeft);
      const priorityWeight = getPriorityWeight(task.priority);
      const parentInfo = resolveTaskParent(task);
      const variantIndex = getVariantIndexFromText(task.description);

      return new RuleResult(true, {
        priority: "urgent",
        frequency: daysOverdue <= 3 ? "daily" : "once",
        subType: "overdue",
        titleKey: "content.task.overdue.title",
        titleParams: variantIndex !== null ? { count: daysOverdue, variantIndex } : { count: daysOverdue },
        messageKey: "content.task.overdue.message",
        messageParams: {
          taskTitle: task.title,
          count: daysOverdue,
          ...(parentInfo || {}),
        },
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysOverdue,
          priority: task.priority,
          priorityWeight,
          ...(parentInfo || {}),
        },
      });
    }

    return new RuleResult(false);
  },

  /**
   * RULE: Due Today Reminder
   * Triggers: When task is due today
   */
  dueToday(task) {
    const dueDate = task.due_date || task.dueDate;
    if (!dueDate || isTaskClosedStatus(task.status)) {
      return new RuleResult(false);
    }

    const daysLeft = calculateDaysDifference(dueDate);
    if (daysLeft !== 0) {
      return new RuleResult(false);
    }

    const parentInfo = resolveTaskParent(task);
    const variantIndex = getVariantIndexFromText(task.description);

    return new RuleResult(true, {
      priority: "high",
      frequency: "once",
      subType: "dueToday",
      titleKey: "content.task.dueToday.title",
      titleParams: variantIndex !== null ? { variantIndex } : {},
      messageKey: "content.task.dueToday.message",
      messageParams: {
        taskTitle: task.title,
        ...(parentInfo || {}),
      },
      metadata: {
        taskId: task.id,
        taskTitle: task.title,
        dueDate,
        ...(parentInfo || {}),
      },
    });
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
    if (!dueDate || isTaskClosedStatus(task.status)) {
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

      const parentInfo = resolveTaskParent(task);
      const variantIndex = getVariantIndexFromText(task.description);
      return new RuleResult(true, {
        priority: notificationPriority,
        frequency: "once",
        subType: "upcomingDeadline",
        titleKey: "content.task.upcomingDeadline.title",
        titleParams:
          variantIndex !== null ? { count: daysLeft, variantIndex } : { count: daysLeft },
        messageKey: "content.task.upcomingDeadline.message",
        messageParams: {
          taskTitle: task.title,
          count: daysLeft,
          ...(variantIndex !== null ? { variantIndex } : {}),
          ...(parentInfo || {}),
        },
        metadata: {
          taskId: task.id,
          taskTitle: task.title,
          daysLeft,
          priority: task.priority,
          priorityWeight,
          ...(parentInfo || {}),
        },
      });
    }

    return new RuleResult(false);
  },
};
