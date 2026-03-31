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
  const preview = normalizePlanPreview(value.preview);
  if (preview) {
    normalized.preview = preview;
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

  if (Object.keys(normalized).length === 0) {
    return null;
  }
  return normalized;
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
