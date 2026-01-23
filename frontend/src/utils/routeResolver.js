/**
 * Route Resolver Utility
 *
 * Centralized route resolution for entity detail views.
 * Used for automatic navigation after entity creation.
 *
 * IMPORTANT: Do NOT hardcode routes in components.
 * Always use this resolver for consistency.
 */

/**
 * Resolves the detail view route for a given entity type and ID
 *
 * @param {string} entityType - The type of entity (client, dossier, lawsuit, etc.)
 * @param {number|string} entityId - The ID of the entity
 * @returns {string|null} - The route path, or null if entity type is not supported
 */
export function resolveDetailRoute(entityType, entityId) {
  if (!entityType || !entityId) {
    return null;
  }

  const routeMap = {
    client: `/clients/${entityId}`,
    dossier: `/dossiers/${entityId}`,
    lawsuit: `/lawsuits/${entityId}`,
    task: `/tasks/${entityId}`,
    session: `/sessions/${entityId}`,
    mission: `/missions/${entityId}`,
    officer: `/officers/${entityId}`,
    personalTask: `/personal-tasks/${entityId}`,
    financialEntry: `/accounting/${entityId}`,
  };

  return routeMap[entityType] || null;
}

/**
 * Checks if an entity type supports detail view navigation
 *
 * @param {string} entityType - The type of entity
 * @returns {boolean} - True if detail view is supported
 */
export function supportsDetailView(entityType) {
  const supportedTypes = [
    "client",
    "dossier",
    "lawsuit",
    "task",
    "session",
    "mission",
    "officer",
    "personalTask",
    "financialEntry",
  ];

  return supportedTypes.includes(entityType);
}


