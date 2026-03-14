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
  return {
    id: normalizeString(row.id),
    toolName: normalizeString(row.tool_name),
    summary: normalizeString(row.summary),
    args: safeParse(row.args_json, {}),
    createdAt: normalizeDate(row.created_at),
    requestedByTurnId: normalizeNullableText(row.requested_by_turn_id) || undefined,
    risk: normalizeNullableText(row.risk) || undefined,
  };
}

function normalizeMode(mode) {
  const normalized = String(mode || "READ_ONLY").trim().toUpperCase();
  if (["READ_ONLY", "DRAFT", "EXECUTE", "AUTONOMOUS"].includes(normalized)) {
    return normalized;
  }
  return "READ_ONLY";
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
  normalizeMode,
  normalizeRetries,
  normalizeString,
  normalizeNullableText,
  normalizeDate,
  safeJsonStringify,
  safeParse,
  isRecord,
  safeErrorMessage,
};
