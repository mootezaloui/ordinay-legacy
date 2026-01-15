/**
 * Date utility functions for notification rules
 */

/**
 * Calculate days difference (negative = past, positive = future)
 */
export function calculateDaysDifference(targetDate, fromDate = new Date()) {
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
export function daysSinceUpdate(entityDate, currentDate = new Date()) {
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
export function daysUntilDate(targetDate, fromDate = new Date()) {
  return calculateDaysDifference(targetDate, fromDate);
}

/**
 * Check if entity was recently accessed/modified
 * (In production, this would check actual user activity logs)
 */
export function wasRecentlyAccessed(entityType, entityId, withinDays = 1) {
  // Placeholder - in production, check actual activity logs
  return false;
}
