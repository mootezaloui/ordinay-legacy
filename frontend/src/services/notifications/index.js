/**
 * Notifications Module
 *
 * Centralized notification services for the application.
 *
 * Directory structure:
 * - rules/        Rule-based notification generation
 * - scheduler/    Scheduling and deduplication
 * - api.js        API calls for notifications (coming in Step 6)
 * - mappers.js    Data transformation (coming in Step 6)
 */

// Re-export rules module
export * from "./rules";
export { default as notificationRules } from "./rules";

// Re-export scheduler module
export * from "./scheduler";

// Re-export mappers
export * from "./mappers";
