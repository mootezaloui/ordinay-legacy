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
        event.changed_fields
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
 * @param {string} params.entityType - Type of entity (client, dossier, case, task, etc.)
 * @param {number|string} params.entityId - Unique ID of the entity
 * @param {string} params.eventType - Type of event (lifecycle, status, assignment, finance, system)
 * @param {string} params.label - Short human-readable title (in French)
 * @param {string} [params.details] - Optional description
 * @param {Object} [params.metadata] - Optional metadata (old/new values, related entities)
 * @returns {Promise<Object>} The created history entry
 */
export const logHistoryEvent = async ({
  entityType,
  entityId,
  eventType,
  label,
  details = null,
  metadata = {},
}) => {
  if (!entityType || !entityId || !eventType || !label) {
    console.warn(
      "[historyService] Missing required parameters for history event"
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
      `/history?entity_type=${normalizedType}&entity_id=${entityId}`
    );

    // Map backend events to frontend format
    const mappedEvents = events.map(mapBackendEventToFrontend);

    // Return sorted newest first
    return mappedEvents.sort(
      (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
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
      `/history/entity?entity_type=${normalizedType}&entity_id=${entityId}`
    );
    console.log(
      `[historyService] Deleted ${
        result.deletedCount || 0
      } history entries for ${entityType} ${entityId}`
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
    "[historyService] clearEntityHistory is deprecated - use deleteEntityHistory instead"
  );
  return deleteEntityHistory(entityType, entityId);
};

/**
 * Helper: Log entity creation
 */
export const logEntityCreation = (entityType, entityId, entityName = null) => {
  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: "Creation",
    details: entityName ? `${entityName} was added` : "Entity created",
    metadata: { action: "created" },
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
  reason = null
) => {
  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.STATUS,
    label: `Statut modifié : ${oldStatus} → ${newStatus}`,
    details: reason || null,
    metadata: { oldStatus, newStatus },
  });
};

/**
 * Helper: Log assignment/reassignment
 */
export const logAssignment = (
  entityType,
  entityId,
  assignedTo,
  previousAssignee = null
) => {
  const label = previousAssignee
    ? `Réaffecté(e) : ${previousAssignee} → ${assignedTo}`
    : `Affecté(e) à ${assignedTo}`;

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.ASSIGNMENT,
    label,
    details: previousAssignee
      ? "Reassignment performed"
      : "Initial assignment performed",
    metadata: { assignedTo, previousAssignee },
  });
};

/**
 * Helper: Log closure/reopening
 */
export const logLifecycleChange = (
  entityType,
  entityId,
  action,
  reason = null
) => {
  const labels = {
    closed: "Closure",
    reopened: "Reopening",
    archived: "Archiving",
    reactivated: "Reactivation",
    deleted: "Deletion",
  };

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: labels[action] || action,
    details: reason || null,
    metadata: { action },
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
  description = null
) => {
  const labels = {
    advance: "Advance received",
    payment: "Payment made",
    expense: "Expense added",
    invoice: "Invoice generated",
  };

  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.FINANCE,
    label: labels[actionType] || actionType,
    details: description || `Montant : ${amount} TND`,
    metadata: { actionType, amount },
  });
};

/**
 * Helper: Log domain rule confirmation
 */
export const logDomainRuleConfirmation = (
  entityType,
  entityId,
  ruleDescription,
  confirmed = true
) => {
  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.SYSTEM,
    label: confirmed ? "Domain rule confirmed" : "Domain rule blocked",
    details: ruleDescription,
    metadata: { confirmed, ruleType: "domain" },
  });
};

/**
 * Helper: Log relational impact confirmation
 */
export const logRelationalImpact = (
  entityType,
  entityId,
  impactDescription,
  confirmed = true
) => {
  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.RELATION,
    label: confirmed
      ? "Relational impact confirmed"
      : "Relational modification cancelled",
    details: impactDescription,
    metadata: { confirmed, impactType: "relational" },
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
