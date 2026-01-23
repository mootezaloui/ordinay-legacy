/**
 * Deduplication helpers for notification scheduler
 * Used to create stable dedupe keys for notifications
 */

/**
 * Resolve entity ID from metadata (supports multiple entity types)
 */
export function resolveEntityId(metadata = {}, fallbackId = null) {
  return (
    metadata.taskId ??
    metadata.personalTaskId ??
    metadata.sessionId ??
    metadata.missionId ??
    metadata.financialEntryId ??
    metadata.dossierId ??
    metadata.lawsuitId ??
    fallbackId
  );
}

/**
 * Generate a stable dedupe key for notification deduplication
 * Keys are entity-type specific to prevent duplicate notifications
 */
export function getStableDedupeKey(entityType, subType, entityId, metadata = {}) {
  const resolvedId = resolveEntityId(metadata, entityId);
  if (resolvedId === undefined || resolvedId === null) return null;

  const type = (entityType || "").toLowerCase();
  if (type === "task" || type === "personaltask") {
    return `TASK_DEADLINE:${resolvedId}`;
  }
  if (type === "mission") {
    return `MISSION_DEADLINE:${resolvedId}`;
  }
  if (type === "session" || type === "lawsuit" || type === "dossier") {
    const sessionId = metadata.sessionId || resolvedId;
    if (!sessionId) return null;
    const scheduledAt =
      metadata.scheduledDate ||
      metadata.scheduled_at ||
      metadata.date ||
      metadata.sessionDate ||
      "";
    const normalizedSubType = subType || metadata.subType || "";
    return `HEARING_DATE:${sessionId}:${normalizedSubType}:${scheduledAt}`;
  }
  if (type === "financial" || type === "payment" || type === "financial_entry" || type === "financialentry") {
    return `PAYMENT_STATUS:${resolvedId}`;
  }
  return null;
}


