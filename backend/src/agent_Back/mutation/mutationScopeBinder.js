"use strict";

const db = require("../../db/connection");

const SCOPE_ORDER_DEEPEST = Object.freeze([
  "task",
  "session",
  "mission",
  "lawsuit",
  "dossier",
  "client",
]);

const TABLE_BY_ENTITY = Object.freeze({
  client: "clients",
  dossier: "dossiers",
  lawsuit: "lawsuits",
  task: "tasks",
  session: "sessions",
  mission: "missions",
});

function toId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clonePayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch {
    return { ...payload };
  }
}

function normalizeEntityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "case") return "lawsuit";
  return normalized;
}

function readScopeIds(activeScope = {}) {
  const scope = activeScope && typeof activeScope === "object" ? activeScope : {};
  const ids = {
    client: toId(scope.clientId),
    dossier: toId(scope.dossierId),
    lawsuit: toId(scope.lawsuitId),
    task: toId(scope.taskId),
    session: toId(scope.sessionId),
    mission: toId(scope.missionId),
  };

  const resolvedType = normalizeEntityType(scope?.resolvedEntity?.type);
  const resolvedId = toId(scope?.resolvedEntity?.id);
  if (resolvedType && resolvedId && Object.prototype.hasOwnProperty.call(ids, resolvedType)) {
    ids[resolvedType] = ids[resolvedType] || resolvedId;
  }

  const activeType = normalizeEntityType(scope?.activeScope?.entityType || scope?.entityType);
  const activeId = toId(scope?.activeScope?.entityId || scope?.entityId);
  if (activeType && activeId && Object.prototype.hasOwnProperty.call(ids, activeType)) {
    ids[activeType] = ids[activeType] || activeId;
  }

  return ids;
}

function hydrateParentIds(ids) {
  const hydrated = { ...ids };

  if (hydrated.task && (!hydrated.lawsuit || !hydrated.dossier)) {
    const row = db
      .prepare("SELECT lawsuit_id, dossier_id FROM tasks WHERE id = ? LIMIT 1")
      .get(hydrated.task);
    if (row) {
      hydrated.lawsuit = hydrated.lawsuit || toId(row.lawsuit_id);
      hydrated.dossier = hydrated.dossier || toId(row.dossier_id);
    }
  }

  if (hydrated.session && (!hydrated.lawsuit || !hydrated.dossier)) {
    const row = db
      .prepare("SELECT lawsuit_id, dossier_id FROM sessions WHERE id = ? LIMIT 1")
      .get(hydrated.session);
    if (row) {
      hydrated.lawsuit = hydrated.lawsuit || toId(row.lawsuit_id);
      hydrated.dossier = hydrated.dossier || toId(row.dossier_id);
    }
  }

  if (hydrated.mission && (!hydrated.lawsuit || !hydrated.dossier)) {
    const row = db
      .prepare("SELECT lawsuit_id, dossier_id FROM missions WHERE id = ? LIMIT 1")
      .get(hydrated.mission);
    if (row) {
      hydrated.lawsuit = hydrated.lawsuit || toId(row.lawsuit_id);
      hydrated.dossier = hydrated.dossier || toId(row.dossier_id);
    }
  }

  if (hydrated.lawsuit && !hydrated.dossier) {
    const row = db
      .prepare("SELECT dossier_id FROM lawsuits WHERE id = ? LIMIT 1")
      .get(hydrated.lawsuit);
    hydrated.dossier = hydrated.dossier || toId(row?.dossier_id);
  }

  if (hydrated.dossier && !hydrated.client) {
    const row = db
      .prepare("SELECT client_id FROM dossiers WHERE id = ? LIMIT 1")
      .get(hydrated.dossier);
    hydrated.client = hydrated.client || toId(row?.client_id);
  }

  return hydrated;
}

function pushBound(boundFromScope, field, value) {
  if (value === null || value === undefined) return;
  boundFromScope.push({ field, value });
}

function bindTaskLike(payload, ids, boundFromScope) {
  const hasDossier = toId(payload.dossier_id);
  const hasLawsuit = toId(payload.lawsuit_id);
  if (hasDossier || hasLawsuit) return [];

  if (ids.lawsuit) {
    payload.lawsuit_id = ids.lawsuit;
    pushBound(boundFromScope, "lawsuit_id", ids.lawsuit);
    return [];
  }
  if (ids.dossier) {
    payload.dossier_id = ids.dossier;
    pushBound(boundFromScope, "dossier_id", ids.dossier);
    return [];
  }
  return ["dossier_or_lawsuit_reference"];
}

function bindLawsuit(payload, ids, boundFromScope) {
  if (toId(payload.dossier_id)) return [];
  if (ids.dossier) {
    payload.dossier_id = ids.dossier;
    pushBound(boundFromScope, "dossier_id", ids.dossier);
    return [];
  }
  return ["dossier_reference"];
}

function bindDocumentAttach(payload, ids, boundFromScope) {
  const target = payload?.target && typeof payload.target === "object" ? payload.target : null;
  const targetType = normalizeEntityType(target?.type);
  const targetId = toId(target?.id);
  if (targetType && targetId) return [];

  for (const type of SCOPE_ORDER_DEEPEST) {
    if (!ids[type]) continue;
    payload.target = { type, id: ids[type] };
    pushBound(boundFromScope, "target", { type, id: ids[type] });
    return [];
  }

  return ["target_reference"];
}

function bindMutationScope({ entityType, payload, activeScope } = {}) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const boundPayload = clonePayload(payload);
  const boundFromScope = [];
  const ids = hydrateParentIds(readScopeIds(activeScope));
  let missingRequired = [];

  if (normalizedEntityType === "task") {
    missingRequired = bindTaskLike(boundPayload, ids, boundFromScope);
  } else if (normalizedEntityType === "lawsuit") {
    missingRequired = bindLawsuit(boundPayload, ids, boundFromScope);
  } else if (normalizedEntityType === "mission" || normalizedEntityType === "session") {
    missingRequired = bindTaskLike(boundPayload, ids, boundFromScope);
  } else if (normalizedEntityType === "document_attach") {
    missingRequired = bindDocumentAttach(boundPayload, ids, boundFromScope);
  }

  return {
    boundPayload,
    missingRequired: Array.from(new Set(missingRequired)),
    boundFromScope,
  };
}

function resolveEntityDisplayLabel(entityType, entityId) {
  const type = normalizeEntityType(entityType);
  const id = toId(entityId);
  const table = TABLE_BY_ENTITY[type];
  if (!table || !id) return null;
  const row = db.prepare(`SELECT * FROM ${table} WHERE id = ? LIMIT 1`).get(id);
  if (!row) return null;

  if (type === "client") {
    const name = String(row.name || "").trim();
    return name ? `Client: ${name}` : "Client";
  }
  if (type === "dossier") {
    const ref = String(row.reference || "").trim();
    const title = String(row.title || "").trim();
    if (ref && title) return `Dossier: ${ref} (${title})`;
    if (ref) return `Dossier: ${ref}`;
    if (title) return `Dossier: ${title}`;
    return "Dossier";
  }
  if (type === "lawsuit") {
    const ref = String(row.reference || row.lawsuit_number || "").trim();
    const title = String(row.title || "").trim();
    if (ref && title) return `Lawsuit: ${ref} (${title})`;
    if (ref) return `Lawsuit: ${ref}`;
    if (title) return `Lawsuit: ${title}`;
    return "Lawsuit";
  }
  if (type === "task") return `Task: ${String(row.title || "").trim() || "Task"}`;
  if (type === "session") return `Session: ${String(row.title || row.session_type || "").trim() || "Session"}`;
  if (type === "mission") return `Mission: ${String(row.title || row.reference || "").trim() || "Mission"}`;
  return null;
}

function resolveBoundFromScopeLabels(boundFromScope = []) {
  const labels = [];
  for (const item of Array.isArray(boundFromScope) ? boundFromScope : []) {
    const field = String(item?.field || "");
    if (field === "target" && item?.value?.type && item?.value?.id) {
      const label = resolveEntityDisplayLabel(item.value.type, item.value.id);
      if (label) labels.push(label);
      continue;
    }
    if (/_id$/i.test(field)) {
      const type = normalizeEntityType(field.replace(/_id$/i, ""));
      const label = resolveEntityDisplayLabel(type, item?.value);
      if (label) labels.push(label);
    }
  }
  return labels;
}

module.exports = {
  bindMutationScope,
  resolveBoundFromScopeLabels,
};

