"use strict";

/**
 * Deterministic storage resolver for generated documents.
 *
 * Rules:
 * - Source of truth is resolved active scope object (no text parsing).
 * - storageHint=inherit => pick deepest available scope.
 * - storageHint=explicit entity => pick exactly that scope level.
 * - Missing required scope => STORAGE_SCOPE_MISSING.
 */

const StorageHint = Object.freeze({
  INHERIT: "inherit",
  CLIENT: "client",
  DOSSIER: "dossier",
  LAWSUIT: "lawsuit",
  FINANCIAL_ENTRY: "financial_entry",
  MISSION: "mission",
  SESSION: "session",
  TASK: "task",
});

const STORAGE_PRIORITY = Object.freeze([
  StorageHint.TASK,
  StorageHint.SESSION,
  StorageHint.MISSION,
  StorageHint.FINANCIAL_ENTRY,
  StorageHint.LAWSUIT,
  StorageHint.DOSSIER,
  StorageHint.CLIENT,
]);

const ENTITY_TO_SCOPE_KEY = Object.freeze({
  client: "clientId",
  dossier: "dossierId",
  lawsuit: "lawsuitId",
  financial_entry: "financialEntryId",
  mission: "missionId",
  session: "sessionId",
  task: "taskId",
});

const SCOPE_KEY_ALIASES = Object.freeze({
  client_id: "clientId",
  dossier_id: "dossierId",
  lawsuit_id: "lawsuitId",
  financial_entry_id: "financialEntryId",
  mission_id: "missionId",
  session_id: "sessionId",
  task_id: "taskId",
  personal_task_id: "personalTaskId",
  officer_id: "officerId",
  entity_type: "entityType",
  entity_id: "entityId",
});

function toNumberId(value) {
  const id = Number(value);
  if (!Number.isInteger(id) || id <= 0) return null;
  return id;
}

function normalizeStorageHint(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) return null;
  if (Object.values(StorageHint).includes(value)) return value;
  return null;
}

function normalizeActiveScope(input = {}) {
  const source =
    input && typeof input === "object" && !Array.isArray(input) ? input : {};
  const normalized = {};

  for (const [rawKey, rawValue] of Object.entries(source)) {
    const key = SCOPE_KEY_ALIASES[rawKey] || rawKey;
    normalized[key] = rawValue;
  }

  const resolved = {
    clientId: toNumberId(normalized.clientId),
    dossierId: toNumberId(normalized.dossierId),
    lawsuitId: toNumberId(normalized.lawsuitId),
    financialEntryId: toNumberId(normalized.financialEntryId),
    missionId: toNumberId(normalized.missionId),
    sessionId: toNumberId(normalized.sessionId),
    taskId: toNumberId(normalized.taskId),
    entityType: String(normalized.entityType || "").trim().toLowerCase() || null,
    entityId: toNumberId(normalized.entityId),
  };

  if (resolved.entityType && resolved.entityId) {
    const scopeKey = ENTITY_TO_SCOPE_KEY[resolved.entityType];
    if (scopeKey && !resolved[scopeKey]) {
      resolved[scopeKey] = resolved.entityId;
    }
  }

  return resolved;
}

function storageMissingError(message = "Storage scope is missing.") {
  const err = new Error(message);
  err.code = "STORAGE_SCOPE_MISSING";
  err.status = 409;
  return err;
}

function resolveStorageTarget({ activeScope, storageHint = StorageHint.INHERIT } = {}) {
  const normalizedScope = normalizeActiveScope(activeScope);
  const normalizedHint = normalizeStorageHint(storageHint) || StorageHint.INHERIT;

  if (normalizedHint !== StorageHint.INHERIT) {
    const key = ENTITY_TO_SCOPE_KEY[normalizedHint];
    const id = key ? toNumberId(normalizedScope[key]) : null;
    if (!id) {
      throw storageMissingError(
        `Storage hint "${normalizedHint}" is set, but matching scope is not resolved.`,
      );
    }
    return {
      entityType: normalizedHint,
      entityId: id,
      resolutionMode: "hint",
    };
  }

  for (const entityType of STORAGE_PRIORITY) {
    const key = ENTITY_TO_SCOPE_KEY[entityType];
    const id = toNumberId(normalizedScope[key]);
    if (id) {
      return {
        entityType,
        entityId: id,
        resolutionMode: "inherit",
      };
    }
  }

  throw storageMissingError("No resolved active scope is available for document storage.");
}

module.exports = {
  StorageHint,
  STORAGE_PRIORITY,
  ENTITY_TO_SCOPE_KEY,
  normalizeStorageHint,
  normalizeActiveScope,
  resolveStorageTarget,
};

