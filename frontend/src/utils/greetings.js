/**
 * Greeting message utility
 * Generates contextual greeting messages based on time of day
 */

const MORNING_START = 5;
const AFTERNOON_START = 12;
const EVENING_START = 18;

/**
 * Get current time period (morning, afternoon, evening)
 */
export function getTimePeriod() {
  const hour = new Date().getHours();

  if (hour >= MORNING_START && hour < AFTERNOON_START) {
    return 'morning';
  } else if (hour >= AFTERNOON_START && hour < EVENING_START) {
    return 'afternoon';
  } else {
    return 'evening';
  }
}

/**
 * Get greeting message key based on time and context
 * @param {string} userName - User's name (optional)
 * @param {string} period - Time period override (optional)
 * @returns {string} Translation key for the greeting
 */
export function getGreetingKey(userName, period = null) {
  const timePeriod = period || getTimePeriod();

  // If no userName, use simpler greeting
  if (!userName) {
    return `dashboard.greeting.${timePeriod}.default`;
  }

  return `dashboard.greeting.${timePeriod}.withName`;
}

/**
 * Get session-aware context message
 * Returns a subtle continuation message for afternoon/evening visits
 */
export function getContextMessage() {
  const period = getTimePeriod();

  // Only show context for afternoon/evening
  if (period === 'afternoon' || period === 'evening') {
    return `dashboard.context.${period}`;
  }

  return null;
}
