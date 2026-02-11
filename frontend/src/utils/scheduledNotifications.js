/**
 * Scheduled Notifications Data
 * Mock data for scheduled date-related notifications
 * In production, this would be stored in a database with actual scheduling logic
 */

/**
 * Notification Schedule Configuration
 * Defines when notifications should be triggered
 */
export const notificationScheduleRules = {
  tasks: {
    // Check task deadlines
    checkTimes: ["09:00", "14:00"], // Check twice daily
    triggers: [
      { type: "overdue", condition: "daysAfter", value: 0 },
      { type: "dueToday", condition: "daysUntil", value: 0 },
      { type: "upcoming", condition: "daysUntil", value: [1, 2, 3, 7] },
      { type: "statusCheck", condition: "inProgress", checkEvery: 3 }, // Every 3 days
    ],
  },

  sessions: {
    // Check session dates
    checkTimes: ["08:00", "18:00"], // Morning and evening
    triggers: [
      { type: "today", condition: "daysUntil", value: 0 },
      { type: "tomorrow", condition: "daysUntil", value: 1 },
      { type: "preparation", condition: "daysUntil", value: [2, 3, 5, 7] },
    ],
  },

  payments: {
    // Check payment due dates
    checkTimes: ["10:00", "16:00"],
    triggers: [
      { type: "overdue", condition: "daysAfter", value: [1, 3, 7, 14] }, // Multiple reminders
      { type: "dueToday", condition: "daysUntil", value: 0 },
      { type: "upcoming", condition: "daysUntil", value: [1, 3, 7] },
    ],
  },

  missions: {
    // Check mission dates
    checkTimes: ["09:00"],
    triggers: [
      { type: "today", condition: "daysUntil", value: 0 },
      { type: "upcoming", condition: "daysUntil", value: [1, 2, 3, 5] },
      { type: "completion", condition: "completed", checkAfter: 1 }, // 1 day after completion
    ],
  },

  dossiers: {
    // Check dossier status
    checkTimes: ["17:00"], // End of day
    triggers: [
      {
        type: "statusUpdate",
        condition: "daysWithoutUpdate",
        value: [7, 14, 30],
      },
      { type: "review", condition: "daysOpen", value: [30, 60, 90] },
    ],
  },
};

/**
 * Get notification schedule for a specific entity type and date
 * This simulates what a cron job or scheduler would do
 */
export function getScheduledNotificationsForDate(
  entityType,
  date = new Date(),
) {
  const schedule = notificationScheduleRules[entityType];
  if (!schedule) return [];

  const currentTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

  // Check if current time matches any check time
  const shouldCheck = schedule.checkTimes.some((checkTime) => {
    const [checkHour, checkMinute] = checkTime.split(":").map(Number);
    const [currentHour, currentMinute] = currentTime.split(":").map(Number);

    // Allow 5 minute window
    return (
      Math.abs(checkHour - currentHour) === 0 &&
      Math.abs(checkMinute - currentMinute) <= 5
    );
  });

  if (!shouldCheck) return [];

  return schedule.triggers;
}

/**
 * Scheduled notifications are now managed by the backend.
 * This function is kept for backward compatibility but returns an empty array.
 * Use the notification scheduler service with real backend data instead.
 */
export function getSimulatedScheduledNotifications() {
  // Mock data removed - notifications are now generated from real backend data
  return [];
}

/**
 * Mark notification as sent
 */
export function markNotificationAsSent(notificationId) {
  // In production, this would update the database
}

/**
 * Get pending notifications (not yet sent)
 */
export function getPendingNotifications(scheduledNotifications) {
  return scheduledNotifications.filter((n) => !n.sent);
}

/**
 * Get notifications due now
 */
export function getNotificationsDueNow(
  scheduledNotifications,
  currentTime = new Date(),
) {
  const now = currentTime.toISOString();
  const currentDateTimeStr = now.split(".")[0]; // Remove milliseconds

  return scheduledNotifications.filter((n) => {
    if (n.sent) return false;

    const scheduledDateTime = new Date(n.scheduledFor.replace(" ", "T"))
      .toISOString()
      .split(".")[0];
    return scheduledDateTime <= currentDateTimeStr;
  });
}

/**
 * Notification frequency settings
 * User preferences for how often they want to be reminded
 */
export const notificationFrequencySettings = {
  tasks: {
    enabled: true,
    overdueReminders: true, // Reminders for overdue tasks
    upcomingReminders: true, // Reminders before deadline
    reminderDays: [1, 3, 7], // Days before deadline to notify
  },

  personalTasks: {
    enabled: true,
    upcomingReminders: true, // Reminders before deadline
    completionReminders: true, // Reminders after deadline for update
    reminderDays: [1, 3, 7], // Days before deadline to notify
  },

  sessions: {
    enabled: true,
    preparationReminders: true,
    reminderDays: [1, 3, 7], // Days before session
    dayOfReminder: true,
  },

  payments: {
    enabled: true,
    overdueReminders: true,
    reminderDays: [1, 3, 7], // Days before due date
    overdueReminderFrequency: [1, 3, 7, 14], // Days after overdue
  },

  missions: {
    enabled: true,
    upcomingReminders: true, // Reminders before deadline
    completionReminders: true, // Reminders after deadline to verify if mission accomplished
    reminderDays: [1, 3, 7], // Days before deadline to notify
  },

  dossiers: {
    enabled: true,
    inactivityReminder: true,
    inactivityDays: 7, // Notify if no update for 7+ days
    reviewReminder: true,
    reviewIntervalHigh: 7, // High priority: review every 7 days
    reviewIntervalMedium: 15, // Medium priority: review every 15 days
    reviewIntervalLow: 30, // Low priority: review every 30 days
    deadlineReminders: true, // For next_deadline field (next deadline)
  },

  clients: {
    enabled: true,
    inactivityReminder: true,
    inactivityDays: 60, // Notify if no activity for 60+ days
  },

  // Client email notification preferences
  // Controls when the "Notify client?" prompt appears after actions
  clientEmails: {
    enabled: true, // Global toggle for all client email prompts
    dossiers: true, // Dossier events (create, status change, deadline)
    lawsuits: true, // Lawsuit events (create, status change, hearing)
    sessions: true, // Session events (schedule, reschedule, cancel)
    financial: true, // Financial entry events
  },
};

/**
 * Get user notification preferences
 * In production, this would be fetched from user settings
 */
const NOTIFICATION_PREF_KEY = "ordinay_notification_prefs";

const mergePreferences = (base, override) => {
  if (!override) return base;
  const merged = { ...base };
  Object.keys(override).forEach((key) => {
    const nextVal = override[key];
    if (nextVal && typeof nextVal === "object" && !Array.isArray(nextVal)) {
      merged[key] = { ...(base[key] || {}), ...nextVal };
    } else {
      merged[key] = nextVal;
    }
  });
  return merged;
};

export function getNotificationPreferences(userId = "default") {
  // userId is unused in the mock implementation
  if (typeof window === "undefined") return notificationFrequencySettings;

  try {
    const raw = window.localStorage.getItem(NOTIFICATION_PREF_KEY);
    if (!raw) return notificationFrequencySettings;
    const parsed = JSON.parse(raw);
    return mergePreferences(notificationFrequencySettings, parsed);
  } catch (error) {
    console.warn("[scheduledNotifications] Failed to load preferences", error);
    return notificationFrequencySettings;
  }
}

/**
 * Update notification preferences
 */
export function updateNotificationPreferences(userId, preferences) {
  // userId is unused in the mock implementation
  const merged = mergePreferences(notificationFrequencySettings, preferences);
  try {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(
        NOTIFICATION_PREF_KEY,
        JSON.stringify(merged),
      );
    }
  } catch (error) {
    console.warn(
      "[scheduledNotifications] Failed to persist preferences",
      error,
    );
  }
  return merged;
}
