"use strict";

const db = require("../../db/connection");

const CASCADE_SCOPE_ENTITIES = new Set(["task", "session", "mission", "financial_entry"]);

function toId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function clonePayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return {};
  try {
    return JSON.parse(JSON.stringify(payload));
  } catch (_) {
    return { ...payload };
  }
}

function normalizeEntityType(value = "") {
  return String(value || "").trim().toLowerCase();
}

function readScope(activeScope = {}) {
  const scope = activeScope && typeof activeScope === "object" ? activeScope : {};
  const resolvedType = normalizeEntityType(scope?.resolvedEntity?.type || scope?.activeScope?.entityType);
  const resolvedId = toId(scope?.resolvedEntity?.id || scope?.activeScope?.entityId);
  const lawsuitId = toId(scope?.lawsuitId) || (resolvedType === "lawsuit" ? resolvedId : null);
  const dossierId = toId(scope?.dossierId) || (resolvedType === "dossier" ? resolvedId : null);
  return { lawsuitId, dossierId };
}

function resolveDossierIdForLawsuit(lawsuitId) {
  const id = toId(lawsuitId);
  if (!id) return null;
  const row = db
    .prepare("SELECT dossier_id FROM lawsuits WHERE id = ? LIMIT 1")
    .get(id);
  return toId(row?.dossier_id);
}

function buildParentSelectionOptions() {
  const lawsuitRows = db
    .prepare(
      `SELECT id, COALESCE(title, '') AS title, COALESCE(reference, '') AS reference
       FROM lawsuits
       WHERE deleted_at IS NULL
       ORDER BY COALESCE(updated_at, created_at, id) DESC
       LIMIT 10`,
    )
    .all();
  const dossierRows = db
    .prepare(
      `SELECT id, COALESCE(title, '') AS title, COALESCE(reference, '') AS reference
       FROM dossiers
       WHERE deleted_at IS NULL
       ORDER BY COALESCE(updated_at, created_at, id) DESC
       LIMIT 10`,
    )
    .all();

  const options = [];
  for (const row of lawsuitRows) {
    const label = [String(row?.reference || "").trim(), String(row?.title || "").trim()]
      .filter(Boolean)
      .join(" - ");
    options.push({
      entityType: "lawsuit",
      id: Number(row.id),
      label: label || `Lawsuit ${row.id}`,
    });
  }
  for (const row of dossierRows) {
    const label = [String(row?.reference || "").trim(), String(row?.title || "").trim()]
      .filter(Boolean)
      .join(" - ");
    options.push({
      entityType: "dossier",
      id: Number(row.id),
      label: label || `Dossier ${row.id}`,
    });
  }
  return options;
}

function bindTaskLikeParents(payload, scope) {
  const prepared = payload;
  const explicitLawsuit = toId(prepared?.lawsuit_id);
  const explicitDossier = toId(prepared?.dossier_id);

  if (explicitLawsuit) {
    prepared.lawsuit_id = explicitLawsuit;
    const derivedDossier = explicitDossier || scope.dossierId || resolveDossierIdForLawsuit(explicitLawsuit);
    if (derivedDossier) prepared.dossier_id = derivedDossier;
    return { status: "ready", preparedPayload: prepared };
  }

  if (explicitDossier) {
    prepared.dossier_id = explicitDossier;
    delete prepared.lawsuit_id;
    return { status: "ready", preparedPayload: prepared };
  }

  if (scope.lawsuitId) {
    prepared.lawsuit_id = scope.lawsuitId;
    const derivedDossier = scope.dossierId || resolveDossierIdForLawsuit(scope.lawsuitId);
    if (derivedDossier) prepared.dossier_id = derivedDossier;
    return { status: "ready", preparedPayload: prepared };
  }

  if (scope.dossierId) {
    prepared.dossier_id = scope.dossierId;
    delete prepared.lawsuit_id;
    return { status: "ready", preparedPayload: prepared };
  }

  return {
    status: "needs_parent_input",
    preparedPayload: prepared,
    missingParentFields: ["linked_record"],
    parentSelection: {
      mode: "select_parent_record",
      options: buildParentSelectionOptions(),
    },
  };
}

function bindLawsuitParent(payload, scope) {
  const prepared = payload;
  const dossierId = toId(prepared?.dossier_id) || scope.dossierId;
  if (dossierId) {
    prepared.dossier_id = dossierId;
    return { status: "ready", preparedPayload: prepared };
  }
  return {
    status: "needs_parent_input",
    preparedPayload: prepared,
    missingParentFields: ["linked_record"],
    parentSelection: {
      mode: "select_parent_record",
      options: buildParentSelectionOptions().filter((row) => row.entityType === "dossier"),
    },
  };
}

function applyHierarchicalScopeBinding({ entityType, payload, activeScope } = {}) {
  const normalizedEntityType = normalizeEntityType(entityType);
  const preparedPayload = clonePayload(payload);
  const scope = readScope(activeScope);

  if (CASCADE_SCOPE_ENTITIES.has(normalizedEntityType)) {
    return bindTaskLikeParents(preparedPayload, scope);
  }
  if (normalizedEntityType === "lawsuit") {
    return bindLawsuitParent(preparedPayload, scope);
  }

  return {
    status: "ready",
    preparedPayload,
  };
}

module.exports = {
  applyHierarchicalScopeBinding,
};
