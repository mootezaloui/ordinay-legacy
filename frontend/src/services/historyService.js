/**
 * History / Audit Trail Service
 *
 * Backend-integrated event logging system.
 * Tracks lifecycle events, status changes, and important actions across all entities.
 *
 * Event Types:
 * - lifecycle: création, clôture, réouverture, archivage, suppression
 * - status: changements de statut (En attente → En cours, etc.)
 * - assignment: affectation/réaffectation de tâches, missions
 * - finance: ajout d'avance, dépense, paiement
 * - system: confirmations de règles, blocages résolus
 */

import { apiClient } from "./api/client";
import { i18nInstance } from "../i18n";

/**
 * Event type constants
 */
export const EVENT_TYPES = {
  LIFECYCLE: "lifecycle",
  STATUS: "status",
  ASSIGNMENT: "assignment",
  FINANCE: "finance",
  SYSTEM: "system",
  RELATION: "relation",
};

/**
 * Normalize entity type to match backend format
 */
const normalizeEntityType = (entityType) => {
  const map = {
    financialEntry: "financial_entry",
    financialentry: "financial_entry",
    personalTask: "personal_task",
    personaltask: "personal_task",
  };
  return map[entityType] || entityType.toLowerCase();
};

/**
 * Map backend event data to frontend format
 */
const mapBackendEventToFrontend = (event) => {
  let metadata = {};
  if (event.changed_fields) {
    try {
      metadata =
        typeof event.changed_fields === "string"
          ? JSON.parse(event.changed_fields)
          : event.changed_fields;
    } catch (err) {
      console.warn(
        "[historyService] Failed to parse changed_fields",
        event.changed_fields,
      );
      metadata = {};
    }
  }

  return {
    id: event.id,
    timestamp: event.created_at,
    eventType: event.action || EVENT_TYPES.LIFECYCLE,
    label: event.description || event.action,
    details: event.description,
    metadata,
  };
};

/**
 * Log a history event
 *
 * @param {Object} params
 * @param {string} params.entityType - Type of entity (client, dossier, lawsuit, task, etc.)
 * @param {number|string} params.entityId - Unique ID of the entity
 * @param {string} params.eventType - Type of event (lifecycle, status, assignment, finance, system)
 * @param {string} params.label - Short human-readable title (in French)
 * @param {string} [params.details] - Optional description
 * @param {Object} [params.metadata] - Optional metadata (old/new values, related entities)
 * @param {string} [params.actor] - Optional actor (operator name) who performed the action
 * @returns {Promise<Object>} The created history entry
 */
export const logHistoryEvent = async ({
  entityType,
  entityId,
  eventType,
  label,
  details = null,
  metadata = {},
  actor = null,
}) => {
  if (!entityType || !entityId || !eventType || !label) {
    console.warn(
      "[historyService] Missing required parameters for history event",
    );
    return null;
  }

  try {
    const backendEvent = await apiClient.post("/history", {
      entity_type: normalizeEntityType(entityType),
      entity_id: entityId,
      action: eventType,
      description: details || label,
      changed_fields: Object.keys(metadata).length > 0 ? metadata : null,
      actor: actor,
    });

    return mapBackendEventToFrontend(backendEvent);
  } catch (error) {
    console.error("[historyService] Failed to log history event", error);
    return null;
  }
};

/**
 * Get history for a specific entity
 *
 * @param {string} entityType - Type of entity
 * @param {number|string} entityId - Entity ID
 * @returns {Promise<Array>} Array of history entries, newest first
 */
export const getEntityHistory = async (entityType, entityId) => {
  try {
    const normalizedType = normalizeEntityType(entityType);
    const events = await apiClient.get(
      `/history?entity_type=${normalizedType}&entity_id=${entityId}`,
    );

    // Map backend events to frontend format
    const mappedEvents = events.map(mapBackendEventToFrontend);

    // Return sorted newest first
    return mappedEvents.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp),
    );
  } catch (error) {
    console.error("[historyService] Failed to fetch history", error);
    return [];
  }
};

/**
 * Delete all history for an entity
 *
 * @param {string} entityType
 * @param {number|string} entityId
 * @returns {Promise<number>} Number of deleted entries
 */
export const deleteEntityHistory = async (entityType, entityId) => {
  try {
    const normalizedType = normalizeEntityType(entityType);
    const result = await apiClient.delete(
      `/history/entity?entity_type=${normalizedType}&entity_id=${entityId}`,
    );
    return result.deletedCount || 0;
  } catch (error) {
    console.error("[historyService] Failed to delete entity history", error);
    return 0;
  }
};

/**
 * Clear history for an entity (deprecated, use deleteEntityHistory)
 *
 * @param {string} entityType
 * @param {number|string} entityId
 */
export const clearEntityHistory = async (entityType, entityId) => {
  console.warn(
    "[historyService] clearEntityHistory is deprecated - use deleteEntityHistory instead",
  );
  return deleteEntityHistory(entityType, entityId);
};

/**
 * Helper: Log entity creation
 */
export const logEntityCreation = (
  entityType,
  entityId,
  entityName = null,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: t("detail.history.labels.creation"),
    details: entityName
      ? t("detail.history.labels.entityAdded", { name: entityName })
      : t("detail.history.labels.entityCreated"),
    metadata: { action: "created" },
    actor,
  });
};

/**
 * Helper: Log status change
 */
export const logStatusChange = (
  entityType,
  entityId,
  oldStatus,
  newStatus,
  reason = null,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.STATUS,
    label: t("detail.history.labels.statusChanged", { oldStatus, newStatus }),
    details: reason || null,
    metadata: { oldStatus, newStatus },
    actor,
  });
};

/**
 * Helper: Log assignment/reassignment
 */
export const logAssignment = (
  entityType,
  entityId,
  assignedTo,
  previousAssignee = null,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  const label = previousAssignee
    ? t("detail.history.labels.reassigned", { previousAssignee, assignedTo })
    : t("detail.history.labels.assigned", { assignedTo });

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.ASSIGNMENT,
    label,
    details: previousAssignee
      ? t("detail.history.labels.reassignmentPerformed")
      : t("detail.history.labels.initialAssignment"),
    metadata: { assignedTo, previousAssignee },
    actor,
  });
};

/**
 * Helper: Log closure/reopening
 */
export const logLifecycleChange = (
  entityType,
  entityId,
  action,
  reason = null,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  const labelMap = {
    closed: "detail.history.labels.closed",
    reopened: "detail.history.labels.reopened",
    archived: "detail.history.labels.archived",
    activated: "detail.history.labels.activated",
    reactivated: "detail.history.labels.activated",
    completed: "detail.history.labels.completed",
    cancelled: "detail.history.labels.cancelled",
  };

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: labelMap[action] ? t(labelMap[action]) : action,
    details: reason || null,
    metadata: { action },
    actor,
  });
};

/**
 * Helper: Log financial action
 */
export const logFinancialAction = (
  entityType,
  entityId,
  actionType,
  amount,
  description = null,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  const labelMap = {
    entryAdded: "detail.history.labels.finance.entryAdded",
    entryUpdated: "detail.history.labels.finance.entryUpdated",
    entryDeleted: "detail.history.labels.finance.entryDeleted",
  };

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.FINANCE,
    label: labelMap[actionType] ? t(labelMap[actionType]) : actionType,
    details:
      description || t("detail.history.labels.finance.amount", { amount }),
    metadata: { actionType, amount },
    actor,
  });
};

/**
 * Helper: Log domain rule confirmation
 */
export const logDomainRuleConfirmation = (
  entityType,
  entityId,
  ruleDescription,
  confirmed = true,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.SYSTEM,
    label: confirmed
      ? t("detail.history.labels.domainRule.confirmed")
      : t("detail.history.labels.domainRule.rejected"),
    details: ruleDescription,
    metadata: { confirmed, ruleType: "domain" },
    actor,
  });
};

/**
 * Helper: Log relational impact confirmation
 */
export const logRelationalImpact = (
  entityType,
  entityId,
  impactDescription,
  confirmed = true,
  actor = null,
) => {
  const t = (key, options) => i18nInstance.t(`common:${key}`, options);

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.RELATION,
    label: confirmed
      ? t("detail.history.labels.relationalImpact.confirmed")
      : t("detail.history.labels.relationalImpact.rejected"),
    details: impactDescription,
    metadata: { confirmed, impactType: "relational" },
    actor,
  });
};

/**
 * Get all history entries across all entities (for debugging)
 */
export const getAllHistory = async () => {
  try {
    const events = await apiClient.get("/history");
    return events.map(mapBackendEventToFrontend);
  } catch (error) {
    console.error("[historyService] Failed to fetch all history", error);
    return [];
  }
};

export default {
  logHistoryEvent,
  getEntityHistory,
  deleteEntityHistory,
  clearEntityHistory,
  logEntityCreation,
  logStatusChange,
  logAssignment,
  logLifecycleChange,
  logFinancialAction,
  logDomainRuleConfirmation,
  logRelationalImpact,
  getAllHistory,
  EVENT_TYPES,
};
