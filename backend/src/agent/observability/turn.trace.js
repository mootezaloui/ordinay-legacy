"use strict";

function buildTurnTrace({
  input,
  output,
  latency,
  uxDecision,
  retrievalStats,
  toolStats,
  failure,
} = {}) {
  const sessionId = normalizeOptionalString(
    input && input.sessionId || output && output.sessionId,
  );
  const turnId = normalizeOptionalString(
    input && input.turnId || output && output.turnId,
  );
  const toolCalls = Array.isArray(output && output.toolCalls) ? output.toolCalls : [];
  const outputMetadata = toRecord(output && output.metadata) || {};
  const grounding = toRecord(outputMetadata.grounding) || {};

  return {
    schemaVersion: "v1",
    generatedAt: new Date().toISOString(),
    sessionId,
    turnId,
    mode: normalizeOptionalString(input && input.mode),
    turnType: normalizeOptionalString(output && output.turnType),
    outcome: failure ? "failed" : "succeeded",
    response: {
      responseChars: String(output && output.responseText || "").length,
      toolCallsTotal: toolCalls.length,
      toolCallsFailed: toolCalls.filter((call) => call && call.ok !== true).length,
      pendingPresent: Boolean(output && output.pendingAction),
    },
    decisions: {
      uxDecision: normalizeUxDecision(uxDecision),
      retrieval: normalizeRetrievalStats(retrievalStats),
      grounding: {
        citationMode: normalizeOptionalString(grounding.citationMode),
        lowSourceDensity: grounding.lowSourceDensity === true,
        sourceCount: normalizeNumber(grounding.sourceCount),
      },
    },
    toolStats: normalizeToolStats(toolStats),
    latency: normalizeLatency(latency),
    failure: normalizeFailure(failure),
  };
}

function normalizeUxDecision(value) {
  const row = toRecord(value) || {};
  return {
    action: normalizeOptionalString(row.action),
    posture: normalizeOptionalString(row.posture),
    ambiguityKind: normalizeOptionalString(row.ambiguityKind),
    ambiguityConfidence: normalizeOptionalString(row.ambiguityConfidence),
    workflowType: normalizeOptionalString(row.workflowType),
    reason: normalizeOptionalString(row.reason),
  };
}

function normalizeRetrievalStats(value) {
  const row = toRecord(value) || {};
  return {
    hit: row.hit === true,
    sourceCount: normalizeNumber(row.sourceCount),
    retrievedChunkCount: normalizeNumber(row.retrievedChunkCount),
  };
}

function normalizeToolStats(value) {
  const row = toRecord(value) || {};
  const byCodeInput = toRecord(row.failedByCode) || {};
  const failedByCode = {};
  for (const code of Object.keys(byCodeInput).sort()) {
    failedByCode[code] = normalizeNumber(byCodeInput[code]);
  }
  return {
    executed: normalizeNumber(row.executed),
    failed: normalizeNumber(row.failed),
    failedByCode,
  };
}

function normalizeLatency(value) {
  if (!value || typeof value.snapshot !== "function") {
    return { durationsMs: {}, counts: {}, openSpans: {} };
  }
  const snapshot = value.snapshot();
  return {
    durationsMs: toNumberMap(snapshot && snapshot.durationsMs),
    counts: toNumberMap(snapshot && snapshot.counts),
    openSpans: toNumberMap(snapshot && snapshot.openSpans),
  };
}

function normalizeFailure(value) {
  const row = toRecord(value);
  if (!row) {
    return null;
  }
  return {
    type: normalizeOptionalString(row.type),
    code: normalizeOptionalString(row.code),
    retryable: row.retryable === true,
    severity: normalizeOptionalString(row.severity),
    message: normalizeOptionalString(row.message),
  };
}

function toNumberMap(value) {
  const row = toRecord(value) || {};
  const output = {};
  for (const key of Object.keys(row).sort()) {
    output[key] = normalizeNumber(row[key]);
  }
  return output;
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function normalizeNumber(value) {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
}

function toRecord(value) {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value;
}

module.exports = {
  buildTurnTrace,
};
