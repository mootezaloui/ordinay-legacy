"use strict";

const { normalizeEntityType } = require("../mutation/mutation.entityTypeResolver");
const { getCompatibleParentTypes } = require("./scopeDomainRelations");

function toId(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

const SCOPE_KEY_BY_ENTITY_TYPE = Object.freeze({
  client: "clientId",
  dossier: "dossierId",
  lawsuit: "lawsuitId",
  task: "taskId",
  personal_task: "personalTaskId",
  session: "sessionId",
  mission: "missionId",
  officer: "officerId",
  financial_entry: "financialEntryId",
  document: "documentId",
  notification: "notificationId",
  history_event: "historyEventId",
  note: "noteId",
});

const LIST_CONFIG_BY_ENTITY_TYPE = Object.freeze({
  dossier: {
    toolName: "listDossiersForClient",
    resultKey: "dossiers",
    parentFilters: ["clientId"],
    promptLabel: "dossier",
  },
  lawsuit: {
    toolName: "listLawsuits",
    resultKey: "lawsuits",
    parentFilters: ["dossierId"],
    promptLabel: "lawsuit",
  },
  task: {
    toolName: "listTasks",
    resultKey: "tasks",
    parentFilters: ["lawsuitId", "dossierId"],
    promptLabel: "task",
  },
  session: {
    toolName: "listSessions",
    resultKey: "sessions",
    parentFilters: ["lawsuitId", "dossierId"],
    promptLabel: "session",
  },
  mission: {
    toolName: "listMissions",
    resultKey: "missions",
    parentFilters: ["lawsuitId", "dossierId"],
    promptLabel: "mission",
  },
  financial_entry: {
    toolName: "listFinancialEntries",
    resultKey: "financialEntries",
    parentFilters: ["lawsuitId", "dossierId", "missionId", "taskId", "personalTaskId", "clientId"],
    promptLabel: "financial entry",
  },
  document: {
    toolName: "listDocuments",
    resultKey: "documents",
    parentFilters: [
      "financialEntryId",
      "personalTaskId",
      "sessionId",
      "taskId",
      "missionId",
      "lawsuitId",
      "dossierId",
      "clientId",
      "officerId",
    ],
    promptLabel: "document",
  },
  personal_task: {
    toolName: "listPersonalTasks",
    resultKey: "personalTasks",
    parentFilters: [],
    promptLabel: "personal task",
  },
  officer: {
    toolName: "listOfficers",
    resultKey: "officers",
    parentFilters: [],
    promptLabel: "officer",
  },
  notification: {
    toolName: "listNotifications",
    resultKey: "notifications",
    parentFilters: [],
    promptLabel: "notification",
  },
  history_event: {
    toolName: "listHistoryEvents",
    resultKey: "historyEvents",
    parentFilters: [],
    promptLabel: "history event",
  },
});

const CLOSED_STATUS_VALUES = new Set([
  "closed",
  "archived",
  "cancelled",
  "canceled",
  "completed",
  "resolved",
  "dismissed",
  "inactive",
  "done",
  "paid",
  "void",
]);

function isOpenLikeStatus(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return true;
  return !CLOSED_STATUS_VALUES.has(normalized);
}

function labelForRow(row = {}, entityType = "record") {
  return (
    String(row?.title || "").trim() ||
    String(row?.name || "").trim() ||
    String(row?.reference || "").trim() ||
    String(row?.lawsuit_number || "").trim() ||
    String(row?.label || "").trim() ||
    `${entityType} #${row?.id || "?"}`
  );
}

function buildSuggestion(entityType, row = {}) {
  const entityId = toId(row?.id);
  if (!entityType || !entityId) return null;
  return {
    entityType,
    entityId,
    label: labelForRow(row, entityType),
    reference: String(row?.reference || row?.lawsuit_number || "").trim() || null,
  };
}

function buildGroundedScope(entityType, entityId, extra = {}) {
  const groundedScope = {
    entityType,
    entityId,
    clientId: toId(extra.clientId),
    dossierId: toId(extra.dossierId),
    lawsuitId: toId(extra.lawsuitId),
    taskId: toId(extra.taskId),
    personalTaskId: toId(extra.personalTaskId),
    sessionId: toId(extra.sessionId),
    missionId: toId(extra.missionId),
    officerId: toId(extra.officerId),
    financialEntryId: toId(extra.financialEntryId),
    documentId: toId(extra.documentId),
    notificationId: toId(extra.notificationId),
    historyEventId: toId(extra.historyEventId),
    noteId: toId(extra.noteId),
    source: String(extra.source || "live_grounding"),
    resolvedFrom: String(extra.resolvedFrom || "live_data"),
  };
  const scopeKey = SCOPE_KEY_BY_ENTITY_TYPE[entityType];
  if (scopeKey && !groundedScope[scopeKey]) groundedScope[scopeKey] = entityId;
  return groundedScope;
}

function buildResolvedSingle(entityType, entityId, extra = {}) {
  return {
    status: "resolved_single",
    groundedScope: buildGroundedScope(entityType, entityId, extra),
    message: String(extra.message || "").trim() || null,
    candidates: [],
    reason: String(extra.reason || "unique_live_scope"),
  };
}

function buildResolvedMultiple(entityType, candidates = [], extra = {}) {
  return {
    status: "resolved_multiple",
    groundedScope: null,
    message: String(extra.message || "").trim() || null,
    candidates: (Array.isArray(candidates) ? candidates : []).filter(Boolean),
    reason: String(extra.reason || "multiple_live_candidates"),
    entityType,
    parentScope:
      extra.parentScope && typeof extra.parentScope === "object" ? { ...extra.parentScope } : null,
  };
}

function buildResolvedNone(entityType, extra = {}) {
  return {
    status: "resolved_none",
    groundedScope: null,
    message: String(extra.message || "").trim() || null,
    candidates: [],
    reason: String(extra.reason || "no_live_candidate"),
    entityType,
    parentScope:
      extra.parentScope && typeof extra.parentScope === "object" ? { ...extra.parentScope } : null,
  };
}

function shouldGround(decision = null) {
  const operation = String(decision?.goal?.intendedOperation || "").toLowerCase();
  const primaryRoute = String(decision?.primaryRoute?.mode || "").toUpperCase();
  return (
    primaryRoute === "GOAL_FIRST" ||
    primaryRoute === "CLARIFY" ||
    operation === "create" ||
    operation === "update" ||
    operation === "link"
  );
}

function mergeScopeHints(requestContext = {}) {
  const merged = {};
  for (const [entityType, scopeKey] of Object.entries(SCOPE_KEY_BY_ENTITY_TYPE)) {
    const directId = toId(requestContext?.[scopeKey]);
    const resolvedId =
      normalizeEntityType(requestContext?.resolvedEntity?.type) === entityType
        ? toId(requestContext?.resolvedEntity?.id)
        : null;
    if (directId) merged[scopeKey] = directId;
    else if (resolvedId) merged[scopeKey] = resolvedId;
  }
  return merged;
}

function filterPreferredRows(entityType, rows = []) {
  const list = Array.isArray(rows) ? rows.filter((row) => toId(row?.id)) : [];
  if (entityType === "financial_entry") {
    const unpaid = list.filter((row) => !row?.paid_at && isOpenLikeStatus(row?.status));
    return unpaid.length > 0 ? unpaid : list;
  }
  return list.filter((row) => isOpenLikeStatus(row?.status)).length > 0
    ? list.filter((row) => isOpenLikeStatus(row?.status))
    : list;
}

function exactScopeForTarget(targetEntityType, scopeHints = {}) {
  const scopeKey = SCOPE_KEY_BY_ENTITY_TYPE[targetEntityType];
  const targetId = scopeKey ? toId(scopeHints?.[scopeKey]) : null;
  if (!targetEntityType || !targetId) return null;
  return buildResolvedSingle(targetEntityType, targetId, {
    ...scopeHints,
    resolvedFrom: `${targetEntityType}_scope_hint`,
  });
}

function buildParentPrompt(entityType, parentScope = null) {
  const entityLabel = String(LIST_CONFIG_BY_ENTITY_TYPE[entityType]?.promptLabel || entityType || "record");
  if (parentScope?.entityType && parentScope?.entityId) {
    return `I could not find a current ${entityLabel} under ${parentScope.entityType} ${labelForRow(parentScope, parentScope.entityType)}.`;
  }
  return `I could not find the current ${entityLabel}. Which record should I use to continue?`;
}

async function listCandidatesForTarget({
  targetEntityType,
  scopeHints = {},
  readTool,
} = {}) {
  const config = LIST_CONFIG_BY_ENTITY_TYPE[targetEntityType];
  if (!config || typeof readTool !== "function") return null;
  const toolInput = { limit: 20 };
  for (const filterKey of config.parentFilters) {
    const value = toId(scopeHints?.[filterKey]);
    if (value) {
      toolInput[filterKey] = value;
      break;
    }
  }
  if (config.parentFilters.length > 0 && Object.keys(toolInput).length === 1) {
    return null;
  }
  const result = await readTool(config.toolName, toolInput);
  const rows = filterPreferredRows(
    targetEntityType,
    Array.isArray(result?.[config.resultKey]) ? result[config.resultKey] : [],
  );
  return {
    rows,
    toolInput,
  };
}

async function resolveParentScope({
  entityType,
  operation,
  scopeHints = {},
  readTool,
  visited = new Set(),
} = {}) {
  const compatibleParents = getCompatibleParentTypes({
    childEntityType: entityType,
    operation,
  });
  for (const parentType of compatibleParents) {
    const marker = `${entityType}:${parentType}`;
    if (visited.has(marker)) continue;
    visited.add(marker);
    const resolved = await resolveEntityScope({
      targetEntityType: parentType,
      operation: "update",
      scopeHints,
      readTool,
      visited,
    });
    if (resolved?.status === "resolved_single") return resolved;
    if (resolved?.status === "resolved_multiple") return resolved;
  }
  for (const parentType of compatibleParents) {
    const direct = exactScopeForTarget(parentType, scopeHints);
    if (direct) return direct;
  }
  return null;
}

async function resolveEntityScope({
  targetEntityType,
  operation,
  scopeHints = {},
  readTool,
  visited = new Set(),
} = {}) {
  const exact = exactScopeForTarget(targetEntityType, scopeHints);
  if (exact) return exact;

  const listed = await listCandidatesForTarget({
    targetEntityType,
    scopeHints,
    readTool,
  });
  if (listed) {
    if (listed.rows.length === 1) {
      return buildResolvedSingle(targetEntityType, Number(listed.rows[0].id), {
        ...scopeHints,
        resolvedFrom: `single_${targetEntityType}_from_live_list`,
      });
    }
    if (listed.rows.length > 1) {
      return buildResolvedMultiple(
        targetEntityType,
        listed.rows.map((row) => buildSuggestion(targetEntityType, row)),
        {
          reason: `multiple_${targetEntityType}_candidates`,
          message: `I found multiple current ${LIST_CONFIG_BY_ENTITY_TYPE[targetEntityType]?.promptLabel || targetEntityType}s. Which one should I use?`,
        },
      );
    }
  }

  if (operation === "create") {
    const parentResolution = await resolveParentScope({
      entityType: targetEntityType,
      operation,
      scopeHints,
      readTool,
      visited,
    });
    if (parentResolution?.status === "resolved_single") {
      return buildResolvedSingle(
        parentResolution.groundedScope.entityType,
        parentResolution.groundedScope.entityId,
        {
          ...scopeHints,
          ...parentResolution.groundedScope,
          resolvedFrom: `parent_scope_for_create_${targetEntityType}`,
          message: parentResolution.message || null,
        },
      );
    }
    if (parentResolution?.status === "resolved_multiple") {
      return parentResolution;
    }
    if (parentResolution?.status === "resolved_none") {
      return parentResolution;
    }
  } else {
    const parentResolution = await resolveParentScope({
      entityType: targetEntityType,
      operation: "create",
      scopeHints,
      readTool,
      visited,
    });
    if (parentResolution?.status === "resolved_single") {
      return buildResolvedNone(targetEntityType, {
        reason: `no_${targetEntityType}_under_parent_scope`,
        message: `I do not see a current ${LIST_CONFIG_BY_ENTITY_TYPE[targetEntityType]?.promptLabel || targetEntityType} yet. Should I prepare a new one under the current ${parentResolution.groundedScope.entityType}?`,
        parentScope: parentResolution.groundedScope,
      });
    }
    if (parentResolution?.status === "resolved_multiple") {
      return parentResolution;
    }
  }

  return buildResolvedNone(targetEntityType, {
    reason: `no_live_${targetEntityType}_candidate`,
    message: buildParentPrompt(targetEntityType),
  });
}

async function groundCurrentMatter({
  readTool,
  requestContext = {},
  decision = null,
} = {}) {
  if (typeof readTool !== "function") {
    return { status: "skipped", reason: "read_tool_unavailable" };
  }
  if (!shouldGround(decision)) {
    return { status: "skipped", reason: "non_action_turn" };
  }

  const operation = String(decision?.goal?.intendedOperation || "").toLowerCase();
  const targetEntityType = normalizeEntityType(decision?.goal?.targetEntityType || "");
  if (!targetEntityType) {
    return { status: "skipped", reason: "target_entity_type_missing" };
  }

  const scopeHints = mergeScopeHints(requestContext);
  const resolved = await resolveEntityScope({
    targetEntityType,
    operation,
    scopeHints,
    readTool,
  });
  if (resolved?.status === "resolved_none" && resolved?.parentScope) {
    resolved.message =
      resolved.message ||
      `I could not find a current ${targetEntityType} and need to know whether to create one under the active ${resolved.parentScope.entityType}.`;
  }
  return resolved || { status: "skipped", reason: "no_resolution" };
}

module.exports = {
  groundCurrentMatter,
  isOpenLikeStatus,
};
