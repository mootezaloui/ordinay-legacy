/**
 * History / Audit Trail Service
 *
 * Frontend-only, append-only event logging system.
 * Tracks lifecycle events, status changes, and important actions across all entities.
 *
 * Event Types:
 * - lifecycle: création, clôture, réouverture, archivage, suppression
 * - status: changements de statut (En attente → En cours, etc.)
 * - assignment: affectation/réaffectation de tâches, missions
 * - finance: ajout d'avance, dépense, paiement
 * - system: confirmations de règles, blocages résolus
 */

// In-memory storage with localStorage persistence
// Structure: { entityType: { entityId: [events...] } }
const HISTORY_STORAGE_KEY = "lawyer-app:history";

const loadHistoryStore = () => {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(HISTORY_STORAGE_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (error) {
    console.warn("[historyService] Failed to load history from storage", error);
    return {};
  }
};

const persistHistoryStore = (store) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(store));
  } catch (error) {
    console.warn("[historyService] Failed to persist history to storage", error);
  }
};

const historyStore = loadHistoryStore();

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
 * Initialize history for an entity type if not exists
 */
const initEntityType = (entityType) => {
  if (!historyStore[entityType]) {
    historyStore[entityType] = {};
  }
};

/**
 * Initialize history for a specific entity if not exists
 */
const initEntity = (entityType, entityId) => {
  initEntityType(entityType);
  if (!historyStore[entityType][entityId]) {
    historyStore[entityType][entityId] = [];
  }
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
 * @returns {Object} The created history entry
 */
export const logHistoryEvent = ({
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

  initEntity(entityType, entityId);

  const historyEntry = {
    id: `${entityType}-${entityId}-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`,
    timestamp: new Date().toISOString(),
    eventType,
    label,
    details,
    metadata,
  };

  historyStore[entityType][entityId].push(historyEntry);
  persistHistoryStore(historyStore);

  return historyEntry;
};

/**
 * Get history for a specific entity
 *
 * @param {string} entityType - Type of entity
 * @param {number|string} entityId - Entity ID
 * @returns {Array} Array of history entries, newest first
 */
export const getEntityHistory = (entityType, entityId) => {
  initEntity(entityType, entityId);

  // Return a copy, sorted newest first
  return [...historyStore[entityType][entityId]].sort(
    (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
  );
};

/**
 * Clear history for an entity (use sparingly, mainly for testing)
 *
 * @param {string} entityType
 * @param {number|string} entityId
 */
export const clearEntityHistory = (entityType, entityId) => {
  if (historyStore[entityType] && historyStore[entityType][entityId]) {
    historyStore[entityType][entityId] = [];
    persistHistoryStore(historyStore);
  }
};

/**
 * Helper: Log entity creation
 */
export const logEntityCreation = (entityType, entityId, entityName = null) => {
  return logHistoryEvent({
    entityType,
    entityId,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: "Création",
    details: entityName ? `${entityName} a été créé(e)` : "Entité créée",
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
      ? "Réaffectation effectuée"
      : "Affectation initiale",
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
    closed: "Clôture",
    reopened: "Réouverture",
    archived: "Archivage",
    reactivated: "Réactivation",
    deleted: "Suppression",
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
    advance: "Avance reçue",
    payment: "Paiement effectué",
    expense: "Dépense ajoutée",
    invoice: "Facture générée",
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
    label: confirmed ? "Confirmation de règle acceptée" : "Règle bloquée",
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
      ? "Impact relationnel confirmé"
      : "Modification relationnelle annulée",
    details: impactDescription,
    metadata: { confirmed, impactType: "relational" },
  });
};

/**
 * Get all history entries across all entities (for debugging)
 */
export const getAllHistory = () => {
  return historyStore;
};

export default {
  logHistoryEvent,
  getEntityHistory,
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
