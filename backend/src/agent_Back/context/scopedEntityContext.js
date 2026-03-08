"use strict";

const PRONOUN_PATTERNS = [
  /\bit\b/i,
  /\bthis\s+case\b/i,
  /\bthat\s+case\b/i,
  /\bthis\s+lawsuit\b/i,
  /\bthat\s+lawsuit\b/i,
  /\bthis\s+dossier\b/i,
  /\bthat\s+dossier\b/i,
];

const EXPLICIT_ENTITY_PATTERNS = [
  /\b(client|dossier|lawsuit|task|session|mission)\b.{0,24}\b\d+\b/i,
  /\b(client|dossier|lawsuit|task|session|mission)\s+(id|#|number|ref(?:erence)?)\b/i,
];

function toId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function hasPronounReference(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;
  return PRONOUN_PATTERNS.some((pattern) => pattern.test(text));
}

function hasExplicitEntityReference(message = "") {
  const text = String(message || "").trim();
  if (!text) return false;
  return EXPLICIT_ENTITY_PATTERNS.some((pattern) => pattern.test(text));
}

function hasExplicitRequestScope(requestContext = {}) {
  if (!requestContext || typeof requestContext !== "object") return false;
  if (toId(requestContext?.resolvedEntity?.id)) return true;
  const scopeKeys = [
    "clientId",
    "dossierId",
    "lawsuitId",
    "taskId",
    "sessionId",
    "missionId",
    "personalTaskId",
    "financialEntryId",
  ];
  return scopeKeys.some((key) => toId(requestContext?.[key]));
}

function scopeKeyForEntityType(entityType = "") {
  const type = String(entityType || "").toLowerCase();
  const map = {
    client: "clientId",
    dossier: "dossierId",
    lawsuit: "lawsuitId",
    task: "taskId",
    session: "sessionId",
    mission: "missionId",
    personal_task: "personalTaskId",
    financial_entry: "financialEntryId",
  };
  return map[type] || null;
}

function bindLastResolvedEntityToRequestContext({
  userMessage = "",
  requestContext = {},
  lastResolvedEntity = null,
} = {}) {
  const entityType = String(lastResolvedEntity?.type || "").toLowerCase();
  const entityId = toId(lastResolvedEntity?.id);
  if (!entityType || !entityId) {
    return { applied: false, reason: "missing_last_resolved_entity", boundEntity: null };
  }
  if (!hasPronounReference(userMessage)) {
    return { applied: false, reason: "no_pronoun_reference", boundEntity: null };
  }
  if (hasExplicitEntityReference(userMessage)) {
    return { applied: false, reason: "explicit_entity_reference_present", boundEntity: null };
  }
  if (hasExplicitRequestScope(requestContext)) {
    return { applied: false, reason: "request_scope_already_present", boundEntity: null };
  }

  const key = scopeKeyForEntityType(entityType);
  if (key) requestContext[key] = entityId;
  requestContext.resolvedEntity = {
    type: entityType,
    id: entityId,
    label: String(lastResolvedEntity?.label || "").trim() || null,
  };
  requestContext.activeScope = {
    entityType,
    entityId,
    source: "scoped_entity_context",
    confidence: 0.95,
  };

  return {
    applied: true,
    reason: "pronoun_bound_to_last_resolved_entity",
    boundEntity: {
      type: entityType,
      id: entityId,
      label: requestContext.resolvedEntity.label,
    },
  };
}

function pickLabel(node = {}) {
  return (
    String(node?.title || "").trim() ||
    String(node?.name || "").trim() ||
    String(node?.client_name || "").trim() ||
    String(node?.clientName || "").trim() ||
    String(node?.reference || "").trim() ||
    null
  );
}

const CLOSED_STATUS_VALUES = new Set([
  "closed",
  "archived",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
  "dismissed",
  "inactive",
]);

function isOpenLikeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return !CLOSED_STATUS_VALUES.has(normalized);
}

function pickPreferredChildFromChildren(children = {}) {
  const priorities = ["lawsuits", "dossiers", "sessions", "tasks", "missions"];
  for (const category of priorities) {
    const rows = Array.isArray(children?.[category]) ? children[category] : [];
    const openRows = rows.filter((row) => row?.type && toId(row?.id) && isOpenLikeStatus(row?.status));
    const preferred = openRows.length === 1 ? openRows[0] : rows.length === 1 ? rows[0] : null;
    if (preferred?.type && toId(preferred?.id)) {
      return {
        type: String(preferred.type).toLowerCase(),
        id: Number(preferred.id),
        label: pickLabel(preferred),
      };
    }
  }
  return null;
}

function inferFromDirectListResult(toolName = "", result = {}) {
  const normalizedToolName = String(toolName || "").trim();
  const mapping = {
    listDossiers: { key: "dossiers", entityType: "dossier" },
    listDossiersForClient: { key: "dossiers", entityType: "dossier" },
    listLawsuits: { key: "lawsuits", entityType: "lawsuit" },
  };
  const config = mapping[normalizedToolName];
  if (!config) return null;
  const rows = Array.isArray(result?.[config.key]) ? result[config.key] : [];
  const openRows = rows.filter((row) => toId(row?.id) && isOpenLikeStatus(row?.status));
  const preferred = openRows.length === 1 ? openRows[0] : rows.length === 1 ? rows[0] : null;
  if (!preferred) return null;
  return {
    type: config.entityType,
    id: Number(preferred.id),
    label: pickLabel(preferred),
  };
}

function inferLastResolvedFromGraphResult(graphResult = {}, preferredChildCategory = "") {
  const category = String(preferredChildCategory || "").trim();
  if (category) {
    const children = Array.isArray(graphResult?.children?.[category])
      ? graphResult.children[category]
      : [];
    if (children.length === 1 && children[0]?.type && toId(children[0]?.id)) {
      return {
        type: String(children[0].type).toLowerCase(),
        id: Number(children[0].id),
        label: pickLabel(children[0]),
      };
    }
  }

  const preferredChild = pickPreferredChildFromChildren(graphResult?.children || {});
  if (preferredChild) return preferredChild;

  const root = graphResult?.root || null;
  if (root?.type && toId(root?.id)) {
    return {
      type: String(root.type).toLowerCase(),
      id: Number(root.id),
      label: pickLabel(root),
    };
  }
  return null;
}

function inferLastResolvedFromToolExecutions(toolExecutions = []) {
  const list = Array.isArray(toolExecutions) ? toolExecutions : [];
  for (let idx = list.length - 1; idx >= 0; idx -= 1) {
    const row = list[idx];
    const toolName = String(row?.toolName || "");
    const result = row?.result && typeof row.result === "object" ? row.result : null;
    if (!result) continue;
    if (toolName === "getEntityGraph") {
      const include = Array.isArray(row?.input?.include) ? row.input.include : [];
      const category = String(include[0] || "").trim();
      const inferred = inferLastResolvedFromGraphResult(result, category);
      if (inferred) return inferred;
      continue;
    }
    const inferred = inferFromDirectListResult(toolName, result);
    if (inferred) return inferred;
  }
  return null;
}

module.exports = {
  hasPronounReference,
  bindLastResolvedEntityToRequestContext,
  inferLastResolvedFromGraphResult,
  inferLastResolvedFromToolExecutions,
};
