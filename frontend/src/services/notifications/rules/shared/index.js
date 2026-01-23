/**
 * Shared utilities for notification rules
 */

export { calculateDaysDifference, daysSinceUpdate, daysUntilDate, wasRecentlyAccessed } from "./dateHelpers";
export { getPriorityWeight } from "./priorityHelpers";
export { RuleResult } from "./RuleResult";
export { wasNotificationRecentlySent, markNotificationSent, clearNotificationHistory } from "./historyCache";
export { loadEntities, getEntities, getAllMissions, getAllDossiers, getAllLawsuits, getAllTasks, getAllPersonalTasks, getAllSessions, getAllClients, getAllOfficers, getAllFinancialEntries } from "./entityLoader";
export { getVariantIndexFromText, isTaskClosedStatus, resolveTaskParent, resolveSessionEntity, getSessionTime, buildFinancialParentContexts } from "./parentResolvers";
