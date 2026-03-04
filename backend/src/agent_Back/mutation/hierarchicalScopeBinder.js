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

function resolveScopeFromEntity(entityType, entityId) {
  const normalizedType = normalizeEntityType(entityType);
  const id = toId(entityId);
  if (!normalizedType || !id) return { lawsuitId: null, dossierId: null };

  if (normalizedType === "lawsuit") {
    return {
      lawsuitId: id,
      dossierId: resolveDossierIdForLawsuit(id),
    };
  }
  if (normalizedType === "dossier") {
    return {
      lawsuitId: null,
      dossierId: id,
    };
  }

  const tableByType = {
    task: "tasks",
    session: "sessions",
    mission: "missions",
    financial_entry: "financial_entries",
  };
  const table = tableByType[normalizedType];
  if (!table) return { lawsuitId: null, dossierId: null };

  const row = db
    .prepare(`SELECT lawsuit_id, dossier_id FROM ${table} WHERE id = ? LIMIT 1`)
    .get(id);
  const lawsuitId = toId(row?.lawsuit_id);
  const dossierId = toId(row?.dossier_id) || (lawsuitId ? resolveDossierIdForLawsuit(lawsuitId) : null);
  return { lawsuitId, dossierId };
}

function readScope(activeScope = {}) {
  const scope = activeScope && typeof activeScope === "object" ? activeScope : {};
  const resolvedType = normalizeEntityType(scope?.resolvedEntity?.type || scope?.activeScope?.entityType);
  const resolvedId = toId(scope?.resolvedEntity?.id || scope?.activeScope?.entityId);
  const resolvedScope = resolveScopeFromEntity(resolvedType, resolvedId);
  const lawsuitId = toId(scope?.lawsuitId) || resolvedScope.lawsuitId || null;
  const dossierId = toId(scope?.dossierId) || resolvedScope.dossierId || null;
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

function listLawsuitsByDossier(dossierId) {
  const id = toId(dossierId);
  if (!id) return [];
  return db
    .prepare(
      `SELECT id, COALESCE(title, '') AS title, COALESCE(reference, '') AS reference
       FROM lawsuits
       WHERE deleted_at IS NULL AND dossier_id = ?
       ORDER BY COALESCE(updated_at, created_at, id) DESC`,
    )
    .all(id)
    .map((row) => ({
      id: Number(row.id),
      title: String(row?.title || "").trim(),
      reference: String(row?.reference || "").trim(),
    }))
    .filter((row) => Number.isInteger(row.id) && row.id > 0);
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
      reference: String(row?.reference || "").trim() || null,
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
      reference: String(row?.reference || "").trim() || null,
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
    delete prepared.dossier_id;
    return { status: "ready", preparedPayload: prepared, resolutionSource: "explicit_parent" };
  }

  if (explicitDossier) {
    prepared.dossier_id = explicitDossier;
    delete prepared.lawsuit_id;
    return { status: "ready", preparedPayload: prepared, resolutionSource: "explicit_parent" };
  }

  if (scope.lawsuitId) {
    prepared.lawsuit_id = scope.lawsuitId;
    delete prepared.dossier_id;
    return {
      status: "ready",
      preparedPayload: prepared,
      resolutionSource: "active_lawsuit_scope",
    };
  }

  if (scope.dossierId) {
    const lawsuits = listLawsuitsByDossier(scope.dossierId);
    if (lawsuits.length > 1) {
      return {
        status: "ambiguous_parent_selection",
        preparedPayload: prepared,
        missingParentFields: ["lawsuit_id"],
        parentSelection: {
          mode: "select_lawsuit",
          options: lawsuits.map((row, index) => ({
            id: `lawsuit-${row.id}-${index}`,
            entityType: "lawsuit",
            entityId: row.id,
            reference: row.reference || null,
            label:
              [row.reference, row.title].filter(Boolean).join(" - ") ||
              `Lawsuit #${row.id}`,
            intent: "RESOLVE_CONTEXT_AND_CONTINUE",
          })),
        },
        resolutionSource: "active_dossier_scope_ambiguous",
      };
    }
    prepared.dossier_id = scope.dossierId;
    delete prepared.lawsuit_id;
    return {
      status: "ready",
      preparedPayload: prepared,
      resolutionSource: "active_dossier_scope",
    };
  }

  return {
    status: "needs_parent_input",
    preparedPayload: prepared,
    missingParentFields: ["linked_record"],
    parentSelection: {
      mode: "select_parent_record",
      options: buildParentSelectionOptions(),
    },
    resolutionSource: "no_scope_parent",
  };
}

function bindLawsuitParent(payload, scope) {
  const prepared = payload;
  const dossierId = toId(prepared?.dossier_id) || scope.dossierId;
  if (dossierId) {
    prepared.dossier_id = dossierId;
    return {
      status: "ready",
      preparedPayload: prepared,
      resolutionSource: "resolved_dossier_parent",
    };
  }
  return {
    status: "needs_parent_input",
    preparedPayload: prepared,
    missingParentFields: ["linked_record"],
    parentSelection: {
      mode: "select_parent_record",
      options: buildParentSelectionOptions().filter((row) => row.entityType === "dossier"),
    },
    resolutionSource: "no_dossier_parent",
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
    resolutionSource: "not_applicable",
  };
}

module.exports = {
  applyHierarchicalScopeBinding,
};
