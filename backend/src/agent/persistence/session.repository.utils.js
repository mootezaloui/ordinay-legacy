"use strict";

function rebuildConversationTurns(turnRows) {
  const result = [];

  for (const row of turnRows) {
    const input = safeParse(row.input_json, {});
    const output = safeParse(row.output_json, {});
    const turnId = normalizeString(row.id);
    const createdAt = normalizeDate(row.created_at);

    if (!turnId) continue;

    result.push({
      id: `${turnId}_user`,
      role: "user",
      turnType: output.turnType || "NEW",
      message: normalizeString(input.message),
      createdAt,
    });

    const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    for (let i = 0; i < toolCalls.length; i += 1) {
      const call = toolCalls[i] || {};
      const toolName = normalizeString(call.toolName) || "unknown_tool";
      result.push({
        id: `${turnId}_tool_${i}`,
        role: "tool",
        turnType: output.turnType || "NEW",
        message: safeJsonStringify({
          tool: toolName,
          result: {
            ok: call.ok === true,
            errorCode: call.errorCode || undefined,
          },
        }),
        createdAt: normalizeDate(call.finishedAt || call.startedAt || createdAt),
      });
    }

    result.push({
      id: `${turnId}_assistant`,
      role: "assistant",
      turnType: output.turnType || "NEW",
      message: normalizeString(output.responseText),
      createdAt: normalizeDate(row.completed_at || row.created_at),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    });
  }

  return result;
}

function rebuildHistoryEntry(row, index) {
  const parsed = safeParse(row.content, {});
  return {
    turnId:
      normalizeString(parsed.turnId) || `history_${index + 1}_${Date.now()}`,
    role: normalizeRole(row.role),
    summary: normalizeString(parsed.summary || row.content),
    createdAt: normalizeDate(row.created_at),
  };
}

function rebuildPendingAction(row) {
  const decoded = decodePendingActionArgs(row.args_json);
  return {
    id: normalizeString(row.id),
    toolName: normalizeString(row.tool_name),
    summary: normalizeString(row.summary),
    args: decoded.args,
    plan: decoded.plan,
    createdAt: normalizeDate(row.created_at),
    requestedByTurnId: normalizeNullableText(row.requested_by_turn_id) || undefined,
    risk: normalizePendingRisk(row.risk),
  };
}

function decodePendingActionArgs(value) {
  const parsed = safeParse(value, {});
  if (isRecord(parsed) && parsed.__pending_v2 === true) {
    return {
      args: isRecord(parsed.args) ? parsed.args : {},
      plan: normalizePendingActionPlan(parsed.plan) || undefined,
    };
  }
  return {
    args: isRecord(parsed) ? parsed : {},
    plan: undefined,
  };
}

function serializePendingActionArgs(action) {
  const args = isRecord(action?.args) ? action.args : {};
  const plan = normalizePendingActionPlan(action?.plan);
  if (!plan) {
    return safeJsonStringify(args);
  }
  return safeJsonStringify({
    __pending_v2: true,
    version: 2,
    args,
    plan,
  });
}

function normalizePendingActionPlan(value) {
  if (!isRecord(value)) {
    return null;
  }
  const operation = normalizePlanOperation(value.operation);
  if (!operation) {
    return null;
  }
  const normalized = { operation };
  const rootOperation = normalizePlanOperation(value.rootOperation);
  if (rootOperation) {
    normalized.rootOperation = rootOperation;
  }
  const preview = normalizePlanPreview(value.preview);
  if (preview) {
    normalized.preview = preview;
  }
  const uiPreview = normalizePlanPreview(value.uiPreview);
  if (uiPreview) {
    normalized.uiPreview = uiPreview;
  }
  const workflowSteps = normalizeWorkflowSteps(value.workflowSteps);
  if (workflowSteps.length > 0) {
    normalized.workflowSteps = workflowSteps;
  }
  const diagnostics = normalizePlanDiagnostics(value.diagnostics);
  if (diagnostics) {
    normalized.diagnostics = diagnostics;
  }
  return normalized;
}

function normalizePlanOperation(value) {
  if (!isRecord(value)) {
    return null;
  }
  const operation = normalizeString(value.operation).toLowerCase();
  if (!["create", "update", "delete"].includes(operation)) {
    return null;
  }
  const entityType = normalizeString(value.entityType);
  if (!entityType) {
    return null;
  }

  const normalized = {
    operation,
    entityType,
  };

  if (
    typeof value.entityId === "number" ||
    typeof value.entityId === "string"
  ) {
    normalized.entityId = value.entityId;
  }
  if (isRecord(value.payload)) {
    normalized.payload = value.payload;
  }
  if (isRecord(value.changes)) {
    normalized.changes = value.changes;
  }
  const reason = normalizeNullableText(value.reason);
  if (reason) {
    normalized.reason = reason;
  }
  return normalized;
}

function normalizePlanPreview(value) {
  if (!isRecord(value)) {
    return null;
  }
  const normalized = {};
  const title = normalizeNullableText(value.title);
  const subtitle = normalizeNullableText(value.subtitle);
  const fields = normalizePlanPreviewFields(value.fields);
  const warnings = normalizeWarnings(value.warnings);

  if (title) normalized.title = title;
  if (subtitle) normalized.subtitle = subtitle;
  if (fields.length > 0) normalized.fields = fields;
  if (warnings.length > 0) normalized.warnings = warnings;
  const scope = normalizeNullableText(value.scope);
  if (scope) normalized.scope = scope;
  const root = normalizePlanPreviewRoot(value.root);
  if (root) normalized.root = root;
  const primaryChanges = normalizePlanPreviewChanges(value.primaryChanges);
  if (primaryChanges.length > 0) normalized.primaryChanges = primaryChanges;
  const cascadeSummary = normalizePlanPreviewCascadeSummary(value.cascadeSummary);
  if (cascadeSummary.length > 0) normalized.cascadeSummary = cascadeSummary;
  const effects = normalizeWarnings(value.effects);
  if (effects.length > 0) normalized.effects = effects;
  const reversibility = normalizeNullableText(value.reversibility);
  if (reversibility) normalized.reversibility = reversibility;
  const decisions = normalizeWorkflowDecisionOptions(value.decisions);
  if (decisions.length > 0) normalized.decisions = decisions;
  const linking = normalizePlanPreviewLinking(value.linking);
  if (linking) normalized.linking = linking;

  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
}

function normalizePlanPreviewLinking(value) {
  if (!isRecord(value)) return null;
  const normalized = {};
  const status = normalizeString(value.status).toLowerCase();
  if (!["unchanged", "resolved", "ambiguous", "unresolved"].includes(status)) {
    return null;
  }
  normalized.status = status;
  const source = normalizeNullableText(value.source);
  if (source) normalized.source = source;
  if (typeof value.userSpecified === "boolean") {
    normalized.userSpecified = value.userSpecified;
  }
  const resolutionLabel = normalizeNullableText(value.resolutionLabel);
  if (resolutionLabel) normalized.resolutionLabel = resolutionLabel;
  if (isRecord(value.target)) {
    const entityType = normalizeString(value.target.entityType);
    const entityId = value.target.entityId;
    if (entityType && (typeof entityId === "number" || typeof entityId === "string")) {
      const target = { entityType, entityId };
      const label = normalizeNullableText(value.target.label);
      if (label) target.label = label;
      const field = normalizeNullableText(value.target.field);
      if (field) target.field = field;
      normalized.target = target;
    }
  }
  const candidates = normalizeLinkResolutionCandidates(value.ambiguousCandidates);
  if (candidates.length > 0) {
    normalized.ambiguousCandidates = candidates;
  }
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeWorkflowSteps(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const steps = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const id = normalizeString(row.id);
    const actionType = normalizeString(row.actionType);
    const operation = normalizeString(row.operation).toLowerCase();
    const entityType = normalizeString(row.entityType);
    if (!id || !actionType || !entityType) continue;
    if (!["create", "update", "delete"].includes(operation)) continue;
    const step = {
      id,
      actionType,
      operation,
      entityType,
    };
    if (typeof row.entityId === "number" || typeof row.entityId === "string") {
      step.entityId = row.entityId;
    }
    if (isRecord(row.payload)) step.payload = row.payload;
    if (isRecord(row.changes)) step.changes = row.changes;
    const reason = normalizeNullableText(row.reason);
    if (reason) step.reason = reason;
    if (Array.isArray(row.dependsOn)) {
      const dependsOn = row.dependsOn.map((item) => normalizeString(item)).filter(Boolean);
      if (dependsOn.length > 0) step.dependsOn = dependsOn;
    }
    steps.push(step);
  }
  return steps;
}

function normalizePlanDiagnostics(value) {
  if (!isRecord(value)) return null;
  const normalized = {};
  const plannerVersion = normalizeNullableText(value.plannerVersion);
  if (plannerVersion) normalized.plannerVersion = plannerVersion;
  const analyzedAt = normalizeNullableText(value.analyzedAt);
  if (analyzedAt) normalized.analyzedAt = analyzedAt;
  if (isRecord(value.blockerCounts)) normalized.blockerCounts = value.blockerCounts;
  const linkResolution = normalizeLinkResolutionDiagnostic(value.linkResolution);
  if (linkResolution) normalized.linkResolution = linkResolution;
  const notes = normalizeWarnings(value.notes);
  if (notes.length > 0) normalized.notes = notes;
  if (typeof value.requiresUserDecision === "boolean") {
    normalized.requiresUserDecision = value.requiresUserDecision;
  }
  const decisionPrompt = normalizeNullableText(value.decisionPrompt);
  if (decisionPrompt) normalized.decisionPrompt = decisionPrompt;
  const decisionOptions = normalizeWorkflowDecisionOptions(value.decisionOptions);
  if (decisionOptions.length > 0) normalized.decisionOptions = decisionOptions;
  return Object.keys(normalized).length > 0 ? normalized : null;
}

function normalizeWorkflowDecisionOptions(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((row) => {
      if (!isRecord(row)) return null;
      const key = normalizeString(row.key);
      const title = normalizeString(row.title);
      const description = normalizeString(row.description);
      if (!key || !title || !description) return null;
      return { key, title, description };
    })
    .filter(Boolean);
}

function normalizeLinkResolutionDiagnostic(value) {
  if (!isRecord(value)) return null;
  const status = normalizeString(value.status).toLowerCase();
  if (!["unchanged", "resolved", "ambiguous", "unresolved"].includes(status)) {
    return null;
  }
  const normalized = { status };
  const reason = normalizeNullableText(value.reason);
  if (reason) normalized.reason = reason;
  const source = normalizeNullableText(value.source);
  if (source) normalized.source = source;
  const field = normalizeNullableText(value.field);
  if (field) normalized.field = field;
  const entityType = normalizeNullableText(value.entityType);
  if (entityType) normalized.entityType = entityType;
  if (typeof value.entityId === "number" || typeof value.entityId === "string") {
    normalized.entityId = value.entityId;
  }
  const message = normalizeNullableText(value.message);
  if (message) normalized.message = message;
  const candidates = normalizeLinkResolutionCandidates(value.candidates);
  if (candidates.length > 0) {
    normalized.candidates = candidates;
  }
  return normalized;
}

function normalizeLinkResolutionCandidates(value) {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const entityType = normalizeString(row.entityType);
    if (!entityType) continue;
    if (typeof row.entityId !== "number" && typeof row.entityId !== "string") continue;
    const candidate = {
      entityType,
      entityId: row.entityId,
    };
    const label = normalizeNullableText(row.label);
    if (label) candidate.label = label;
    const source = normalizeNullableText(row.source);
    if (source) candidate.source = source;
    rows.push(candidate);
  }
  return rows.slice(0, 20);
}

function normalizePlanPreviewRoot(value) {
  if (!isRecord(value)) return null;
  const root = {};
  const type = normalizeNullableText(value.type);
  if (type) root.type = type;
  if (typeof value.id === "number" || value.id === null) root.id = value.id;
  if (typeof value.id === "string" && value.id.trim()) {
    const parsed = Number.parseInt(value.id.trim(), 10);
    root.id = Number.isFinite(parsed) ? parsed : null;
  }
  const label = normalizeNullableText(value.label);
  if (label) root.label = label;
  const operation = normalizeNullableText(value.operation);
  if (operation) root.operation = operation;
  return Object.keys(root).length > 0 ? root : null;
}

function normalizePlanPreviewChanges(value) {
  if (!Array.isArray(value)) return [];
  const changes = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const field = normalizeString(row.field);
    const entityType = normalizeString(row.entityType);
    if (!field || !entityType) continue;
    const next = { field, entityType };
    if (typeof row.entityId === "number" || row.entityId === null) next.entityId = row.entityId;
    if (typeof row.entityId === "string" && row.entityId.trim()) {
      const parsed = Number.parseInt(row.entityId.trim(), 10);
      next.entityId = Number.isFinite(parsed) ? parsed : null;
    }
    const entityLabel = normalizeNullableText(row.entityLabel);
    if (entityLabel) next.entityLabel = entityLabel;
    if (Object.prototype.hasOwnProperty.call(row, "from")) next.from = row.from;
    if (Object.prototype.hasOwnProperty.call(row, "to")) next.to = row.to;
    changes.push(next);
  }
  return changes;
}

function normalizePlanPreviewCascadeSummary(value) {
  if (!Array.isArray(value)) return [];
  const rows = [];
  for (const row of value) {
    if (!isRecord(row)) continue;
    const entityType = normalizeString(row.entityType);
    const totalCount = Number(row.totalCount);
    if (!entityType || !Number.isFinite(totalCount) || totalCount < 0) continue;
    const next = { entityType, totalCount };
    if (Array.isArray(row.changedFields)) {
      const changedFields = row.changedFields.map((item) => normalizeString(item)).filter(Boolean);
      if (changedFields.length > 0) next.changedFields = changedFields;
    }
    const examples = normalizePlanPreviewChanges(row.examples);
    if (examples.length > 0) next.examples = examples;
    rows.push(next);
  }
  return rows;
}

function normalizePlanPreviewFields(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  const fields = [];
  for (const row of value) {
    if (!isRecord(row)) {
      continue;
    }
    const key = normalizeString(row.key);
    if (!key) {
      continue;
    }
    const normalized = { key };
    if (Object.prototype.hasOwnProperty.call(row, "from")) {
      normalized.from = row.from;
    }
    if (Object.prototype.hasOwnProperty.call(row, "to")) {
      normalized.to = row.to;
    }
    fields.push(normalized);
  }
  return fields;
}

function normalizeWarnings(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeString(entry))
    .filter(Boolean)
    .slice(0, 50);
}

function normalizePendingRisk(value) {
  const normalized = normalizeString(value).toLowerCase();
  if (normalized === "low" || normalized === "medium" || normalized === "high") {
    return normalized;
  }
  return undefined;
}

function normalizeRole(role) {
  const normalized = String(role || "").trim().toLowerCase();
  if (["system", "user", "assistant", "tool"].includes(normalized)) {
    return normalized;
  }
  return "assistant";
}

function normalizeRetries(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  if (Number.isFinite(parsed) && parsed >= 0) {
    return parsed;
  }
  return fallback;
}

function normalizeString(value) {
  return String(value || "").trim();
}

function normalizeNullableText(value) {
  const text = normalizeString(value);
  return text || null;
}

function normalizeDate(value) {
  const text = normalizeString(value);
  if (text) return text;
  return new Date().toISOString();
}

function safeJsonStringify(value) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return JSON.stringify({});
  }
}

function safeParse(value, fallback) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    const parsed = JSON.parse(value);
    return parsed == null ? fallback : parsed;
  } catch {
    return fallback;
  }
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function safeErrorMessage(error) {
  if (error && typeof error === "object" && typeof error.message === "string") {
    return error.message;
  }
  return String(error || "unknown error");
}

module.exports = {
  rebuildConversationTurns,
  rebuildHistoryEntry,
  rebuildPendingAction,
  serializePendingActionArgs,
  normalizeRetries,
  normalizeString,
  normalizeNullableText,
  normalizeDate,
  safeJsonStringify,
  safeParse,
  isRecord,
  safeErrorMessage,
};
