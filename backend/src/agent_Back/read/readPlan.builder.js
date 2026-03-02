"use strict";

const LIST_INTENT_TO_CATEGORY = Object.freeze({
  LIST_DOSSIERS: "dossiers",
  LIST_LAWSUITS: "lawsuits",
  LIST_TASKS: "tasks",
  LIST_OVERDUE_TASKS: "tasks",
  LIST_MISSIONS: "missions",
  LIST_SESSIONS: "sessions",
  LIST_UPCOMING_SESSIONS: "sessions",
  LIST_DOCUMENTS: "documents",
});

const CATEGORY_ALLOWED_ON_DOSSIER = new Set([
  "lawsuits",
  "tasks",
  "missions",
  "sessions",
  "documents",
]);

const CATEGORY_ALLOWED_ON_LAWSUIT = new Set([
  "tasks",
  "missions",
  "sessions",
  "documents",
]);

const CATEGORY_REQUIRES_CLIENT_DEPTH_TWO = new Set([
  "lawsuits",
  "tasks",
  "missions",
  "sessions",
]);

function toPositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeEntityType(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "case") return "lawsuit";
  return normalized;
}

function resolveScope(activeScope = null, requestContext = {}) {
  const activeType = normalizeEntityType(activeScope?.entityType);
  const activeId = toPositiveInteger(activeScope?.entityId);
  if (activeType && activeId) {
    return { entityType: activeType, entityId: activeId };
  }

  const resolvedType = normalizeEntityType(requestContext?.resolvedEntity?.type);
  const resolvedId = toPositiveInteger(requestContext?.resolvedEntity?.id);
  if (resolvedType && resolvedId) {
    return { entityType: resolvedType, entityId: resolvedId };
  }

  if (toPositiveInteger(requestContext?.lawsuitId)) {
    return { entityType: "lawsuit", entityId: toPositiveInteger(requestContext.lawsuitId) };
  }
  if (toPositiveInteger(requestContext?.dossierId)) {
    return { entityType: "dossier", entityId: toPositiveInteger(requestContext.dossierId) };
  }
  if (toPositiveInteger(requestContext?.clientId)) {
    return { entityType: "client", entityId: toPositiveInteger(requestContext.clientId) };
  }
  return null;
}

function buildReadPlan({ intent, requestContext = {}, activeScope = null } = {}) {
  const intentName = String(intent?.intent || intent || "").trim().toUpperCase();
  const listCategory = LIST_INTENT_TO_CATEGORY[intentName];
  if (!listCategory) return null;

  const scope = resolveScope(activeScope, requestContext);
  if (!scope) return null;

  let entityType = null;
  let entityId = null;
  let depth = 1;

  if (scope.entityType === "lawsuit" && CATEGORY_ALLOWED_ON_LAWSUIT.has(listCategory)) {
    entityType = "lawsuit";
    entityId = scope.entityId;
  } else if (
    scope.entityType === "dossier" &&
    CATEGORY_ALLOWED_ON_DOSSIER.has(listCategory)
  ) {
    entityType = "dossier";
    entityId = scope.entityId;
  } else if (scope.entityType === "client") {
    entityType = "client";
    entityId = scope.entityId;
    if (CATEGORY_REQUIRES_CLIENT_DEPTH_TWO.has(listCategory)) {
      depth = 2;
    }
  }

  if (!entityType || !entityId) return null;

  return {
    toolName: "getEntityGraph",
    toolInput: {
      entityType,
      entityId,
      depth,
      include: [listCategory],
    },
    renderHint: {
      listCategory,
    },
  };
}

module.exports = {
  LIST_INTENT_TO_CATEGORY,
  buildReadPlan,
};

