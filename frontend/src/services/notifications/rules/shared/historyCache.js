/**
 * Notification history tracker (in-memory cache)
 * Maps ruleId to last sent timestamp
 */
const notificationHistory = new Map();

/**
 * Anti-spam: Check if notification was recently sent
 * Uses in-memory cache to track recent notifications
 */
export function wasNotificationRecentlySent(ruleId, entityId, withinHours = 24) {
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
export function markNotificationSent(ruleId, entityId) {
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
export function clearNotificationHistory() {
  notificationHistory.clear();
}
