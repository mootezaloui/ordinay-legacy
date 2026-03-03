"use strict";

const { isGlobalSafeIntent } = require("./intentExecution.contract");

const LIST_INTENT_TO_CATEGORY = Object.freeze({
  LIST_CLIENTS: "clients",
  LIST_DOSSIERS: "dossiers",
  LIST_LAWSUITS: "lawsuits",
  LIST_TASKS: "tasks",
  LIST_PERSONAL_TASKS: "personal_tasks",
  LIST_OVERDUE_TASKS: "tasks",
  LIST_MISSIONS: "missions",
  LIST_SESSIONS: "sessions",
  LIST_UPCOMING_SESSIONS: "sessions",
  LIST_OFFICERS: "officers",
  LIST_DOCUMENTS: "documents",
  LIST_NOTIFICATIONS: "notifications",
  LIST_HISTORY_EVENTS: "history",
  LIST_FINANCIAL_ENTRIES: "financial_entries",
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

const DIRECT_LIST_TOOL_BY_INTENT = Object.freeze({
  LIST_CLIENTS: "listClients",
  LIST_DOSSIERS: "listDossiers",
  LIST_LAWSUITS: "listLawsuits",
  LIST_TASKS: "listTasks",
  LIST_PERSONAL_TASKS: "listPersonalTasks",
  LIST_OVERDUE_TASKS: "listTasks",
  LIST_SESSIONS: "listSessions",
  LIST_UPCOMING_SESSIONS: "listSessions",
  LIST_MISSIONS: "listMissions",
  LIST_OFFICERS: "listOfficers",
  LIST_DOCUMENTS: "listDocuments",
  LIST_NOTIFICATIONS: "listNotifications",
  LIST_HISTORY_EVENTS: "listHistoryEvents",
  LIST_FINANCIAL_ENTRIES: "listFinancialEntries",
});

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

function buildReadPlan({ intent, queryIR = null, requestContext = {}, activeScope = null } = {}) {
  const intentName = String(
    queryIR?.intent?.name || intent?.intent || intent || "",
  )
    .trim()
    .toUpperCase();
  const listCategory = LIST_INTENT_TO_CATEGORY[intentName];
  if (!listCategory) return null;

  const directToolName = DIRECT_LIST_TOOL_BY_INTENT[intentName] || null;
  const intentFilters =
    queryIR?.filters && typeof queryIR.filters === "object"
      ? queryIR.filters
      : intent?.filters && typeof intent.filters === "object"
        ? intent.filters
        : {};

  const scope = resolveScope(activeScope, requestContext);
  const buildDirectPlan = () => {
    if (!(isGlobalSafeIntent(intentName) && directToolName)) return null;
    const toolInput = { limit: 50 };
    if (intentName === "LIST_CLIENTS") {
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_DOSSIERS") {
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
      if (toPositiveInteger(requestContext?.clientId)) {
        toolInput.clientId = toPositiveInteger(requestContext.clientId);
      }
    } else if (intentName === "LIST_LAWSUITS") {
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
      if (toPositiveInteger(requestContext?.dossierId)) {
        toolInput.dossierId = toPositiveInteger(requestContext.dossierId);
      }
    } else if (intentName === "LIST_TASKS") {
      const status = String(intentFilters.status || "").trim();
      const priority = String(intentFilters.priority || "").trim();
      const query = String(intentFilters.query || "").trim();
      if (status) toolInput.status = status;
      if (priority) toolInput.priority = priority;
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_OVERDUE_TASKS") {
      toolInput.overdue = true;
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_PERSONAL_TASKS") {
      const status = String(intentFilters.status || "").trim();
      const query = String(intentFilters.query || "").trim();
      if (status) toolInput.status = status;
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_SESSIONS") {
      const timeframe = String(intentFilters.timeframe || "").trim();
      if (timeframe) toolInput.timeframe = timeframe;
    } else if (intentName === "LIST_UPCOMING_SESSIONS") {
      toolInput.timeframe = "upcoming";
    } else if (intentName === "LIST_OFFICERS") {
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_DOCUMENTS") {
      const query = String(intentFilters.query || "").trim();
      if (query) toolInput.query = query;
    } else if (intentName === "LIST_NOTIFICATIONS") {
      const status = String(intentFilters.status || "").trim();
      if (status) toolInput.status = status;
    } else if (intentName === "LIST_FINANCIAL_ENTRIES") {
      const paymentStatus = String(intentFilters.paymentStatus || "").trim();
      if (paymentStatus) toolInput.paymentStatus = paymentStatus;
    }
    return {
      toolName: directToolName,
      toolInput,
      renderHint: {
        listCategory,
      },
      executionMode: "direct",
    };
  };

  if (!scope) {
    const directPlan = buildDirectPlan();
    if (directPlan) return directPlan;
    return null;
  }

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

  if (!entityType || !entityId) {
    const directPlan = buildDirectPlan();
    if (directPlan) return directPlan;
    return null;
  }

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
    executionMode: "graph",
  };
}

module.exports = {
  LIST_INTENT_TO_CATEGORY,
  buildReadPlan,
};
