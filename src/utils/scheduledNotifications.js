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
      { type: "statusUpdate", condition: "daysWithoutUpdate", value: [7, 14, 30] },
      { type: "review", condition: "daysOpen", value: [30, 60, 90] },
    ],
  },
};

/**
 * Get notification schedule for a specific entity type and date
 * This simulates what a cron job or scheduler would do
 */
export function getScheduledNotificationsForDate(entityType, date = new Date()) {
  const schedule = notificationScheduleRules[entityType];
  if (!schedule) return [];

  const currentTime = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

  // Check if current time matches any check time
  const shouldCheck = schedule.checkTimes.some(checkTime => {
    const [checkHour, checkMinute] = checkTime.split(':').map(Number);
    const [currentHour, currentMinute] = currentTime.split(':').map(Number);

    // Allow 5 minute window
    return Math.abs(checkHour - currentHour) === 0 &&
           Math.abs(checkMinute - currentMinute) <= 5;
  });

  if (!shouldCheck) return [];

  return schedule.triggers;
}

/**
 * Simulated scheduled notifications
 * In production, these would be generated dynamically based on the rules above
 */
export function getSimulatedScheduledNotifications() {
  const now = new Date();
  const today = now.toISOString().split('T')[0];

  // Calculate dates
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const in3Days = new Date(now);
  in3Days.setDate(in3Days.getDate() + 3);

  const in7Days = new Date(now);
  in7Days.setDate(in7Days.getDate() + 7);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);

  return [
    // TASK: Due today
    {
      id: "notif_task_1",
      entityType: "task",
      entityId: 1,
      scheduledFor: `${today} 09:00`,
      type: "task",
      subType: "dueToday",
      priority: "high",
      sent: false,
    },

    // TASK: Upcoming in 3 days
    {
      id: "notif_task_2",
      entityType: "task",
      entityId: 4,
      scheduledFor: `${today} 09:00`,
      type: "task",
      subType: "upcoming",
      priority: "medium",
      sent: false,
    },

    // SESSION: Tomorrow
    {
      id: "notif_session_1",
      entityType: "session",
      entityId: 1,
      scheduledFor: `${today} 18:00`,
      type: "session",
      subType: "tomorrow",
      priority: "high",
      sent: false,
    },

    // PAYMENT: Overdue
    {
      id: "notif_payment_1",
      entityType: "financialEntry",
      entityId: 1,
      scheduledFor: `${today} 10:00`,
      type: "payment",
      subType: "overdue",
      priority: "urgent",
      sent: false,
    },

    // PAYMENT: Due in 3 days
    {
      id: "notif_payment_2",
      entityType: "financialEntry",
      entityId: 2,
      scheduledFor: `${today} 10:00`,
      type: "payment",
      subType: "upcoming",
      priority: "medium",
      sent: false,
    },

    // MISSION: Today
    {
      id: "notif_mission_1",
      entityType: "mission",
      entityId: 1,
      scheduledFor: `${today} 09:00`,
      type: "mission",
      subType: "today",
      priority: "high",
      sent: false,
    },

    // DOSSIER: Status update needed
    {
      id: "notif_dossier_1",
      entityType: "dossier",
      entityId: 1,
      scheduledFor: `${today} 17:00`,
      type: "dossier",
      subType: "statusUpdate",
      priority: "medium",
      sent: false,
    },
  ];
}

/**
 * Mark notification as sent
 */
export function markNotificationAsSent(notificationId) {
  // In production, this would update the database
  console.log(`Notification ${notificationId} marked as sent`);
}

/**
 * Get pending notifications (not yet sent)
 */
export function getPendingNotifications(scheduledNotifications) {
  return scheduledNotifications.filter(n => !n.sent);
}

/**
 * Get notifications due now
 */
export function getNotificationsDueNow(scheduledNotifications, currentTime = new Date()) {
  const now = currentTime.toISOString();
  const currentDateTimeStr = now.split('.')[0]; // Remove milliseconds

  return scheduledNotifications.filter(n => {
    if (n.sent) return false;

    const scheduledDateTime = new Date(n.scheduledFor.replace(' ', 'T')).toISOString().split('.')[0];
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
    urgentOnly: false, // If true, only urgent notifications
    beforeDeadline: [1, 3, 7], // Days before deadline to notify
    overdueReminders: true,
    statusCheckFrequency: 3, // Days
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
    reminderDays: [1, 2, 5],
    completionCheck: true,
  },

  dossiers: {
    enabled: true,
    inactivityReminder: true,
    inactivityDays: 7,
    reviewReminder: true,
    reviewInterval: 30, // Days
  },
};

/**
 * Get user notification preferences
 * In production, this would be fetched from user settings
 */
const NOTIFICATION_PREF_KEY = "organia_notification_prefs";

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
      window.localStorage.setItem(NOTIFICATION_PREF_KEY, JSON.stringify(merged));
    }
  } catch (error) {
    console.warn("[scheduledNotifications] Failed to persist preferences", error);
  }
  return merged;
}
