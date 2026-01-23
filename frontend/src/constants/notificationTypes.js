/**
 * Canonical Notification Types
 *
 * These are the authoritative notification type values used throughout the application.
 * Each notification MUST have one of these types.
 * Types are mapped to i18n keys for display: `notifications.types.${type}`
 */

export const NotificationTypes = {
  MISSION: "mission",
  TASK: "task",
  DOSSIER: "dossier",
  CLIENT: "client",
  LAWSUIT: "lawsuit", // Note: stored as 'lawsuit' for DB/code clarity
  HEARING: "session", // Note: stored as 'session' internally
  FINANCIAL: "financialEntry",
  PERSONAL: "personalTask", // Personal tasks
  SYSTEM: "system", // System events, announcements
  APP: "app", // Generic application events
};

/**
 * All valid notification type values (for validation/filtering)
 */
export const VALID_NOTIFICATION_TYPES = Object.values(NotificationTypes);

/**
 * Display-friendly labels for each type (used in UI filters)
 * Note: These are keys only. Actual labels are resolved via i18n at runtime.
 * Never display the raw type values to users.
 */
export const NotificationTypeLabels = {
  [NotificationTypes.MISSION]: "notifications.types.mission",
  [NotificationTypes.TASK]: "notifications.types.task",
  [NotificationTypes.DOSSIER]: "notifications.types.dossier",
  [NotificationTypes.CLIENT]: "notifications.types.client",
  [NotificationTypes.LAWSUIT]: "notifications.types.lawsuit",
  [NotificationTypes.HEARING]: "notifications.types.hearing",
  [NotificationTypes.FINANCIAL]: "notifications.types.financial",
  [NotificationTypes.PERSONAL]: "notifications.types.personal",
  [NotificationTypes.SYSTEM]: "notifications.types.system",
  [NotificationTypes.APP]: "notifications.types.app",
};

/**
 * Validate if a given type is valid
 */
export function isValidNotificationType(type) {
  return VALID_NOTIFICATION_TYPES.includes(type);
}

/**
 * Get i18n key for a notification type
 */
export function getNotificationTypeLabel(type) {
  return NotificationTypeLabels[type] || "notifications.types.system";
}

