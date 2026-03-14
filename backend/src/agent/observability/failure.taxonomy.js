"use strict";

const FAILURE_TYPES = Object.freeze([
  "validation",
  "permission",
  "tool_missing",
  "tool_execution",
  "llm",
  "timeout",
  "retrieval",
  "memory",
  "unknown",
]);

const CODE_MAP = Object.freeze({
  TOOL_PERMISSION_DENIED: { type: "permission", retryable: false, severity: "medium" },
  TOOL_NOT_FOUND: { type: "tool_missing", retryable: false, severity: "high" },
  INVALID_TOOL_INPUT: { type: "validation", retryable: false, severity: "medium" },
  INVALID_TOOL_OUTPUT: { type: "validation", retryable: false, severity: "medium" },
  INVALID_REQUEST_PAYLOAD: { type: "validation", retryable: false, severity: "low" },
  LOOP_GUARD_TIMEOUT: { type: "timeout", retryable: true, severity: "high" },
  LOOP_GUARD_ITERATION_LIMIT: { type: "timeout", retryable: true, severity: "high" },
  LOOP_TIMEOUT: { type: "timeout", retryable: true, severity: "high" },
  LOOP_GUARD_ERROR: { type: "timeout", retryable: true, severity: "high" },
  RETRIEVAL_ERROR: { type: "retrieval", retryable: true, severity: "medium" },
  MEMORY_ERROR: { type: "memory", retryable: true, severity: "medium" },
  TOOL_RUNTIME_ERROR: { type: "tool_execution", retryable: false, severity: "medium" },
  TOOL_EXECUTION_FAILED: { type: "tool_execution", retryable: false, severity: "medium" },
  LLM_ERROR: { type: "llm", retryable: true, severity: "high" },
  OPENAI_ERROR: { type: "llm", retryable: true, severity: "high" },
  PROVIDER_ERROR: { type: "llm", retryable: true, severity: "high" },
  TIMEOUT: { type: "timeout", retryable: true, severity: "high" },
});

function classifyFailure(errorOrResult, context = {}) {
  const payload = normalizePayload(errorOrResult);
  const stage = normalizeText(context.stage);
  const subsystem = normalizeText(context.subsystem);
  const rawMessage = normalizeMessage(payload.message, payload.errorMessage);
  const inferredCode =
    normalizeCode(payload.code) ||
    normalizeCode(payload.errorCode) ||
    inferCode(rawMessage, stage, subsystem);
  const code = inferredCode || "UNKNOWN_FAILURE";
  const mapped = CODE_MAP[code] || inferFromContext(code, rawMessage, stage, subsystem);

  return {
    type: mapped.type,
    code,
    retryable: mapped.retryable,
    severity: mapped.severity,
    message: rawMessage || "Unknown runtime failure.",
  };
}

function inferFromContext(code, message, stage, subsystem) {
  if (isTimeoutSignal(code, message, stage)) {
    return { type: "timeout", retryable: true, severity: "high" };
  }
  if (isRetrievalSignal(code, message, stage, subsystem)) {
    return { type: "retrieval", retryable: true, severity: "medium" };
  }
  if (isMemorySignal(code, message, stage, subsystem)) {
    return { type: "memory", retryable: true, severity: "medium" };
  }
  if (isValidationSignal(code, message, stage)) {
    return { type: "validation", retryable: false, severity: "medium" };
  }
  if (isLLMSignal(code, message, stage, subsystem)) {
    return { type: "llm", retryable: true, severity: "high" };
  }
  if (isToolSignal(code, message, stage, subsystem)) {
    return { type: "tool_execution", retryable: false, severity: "medium" };
  }
  return { type: "unknown", retryable: false, severity: "medium" };
}

function inferCode(message, stage, subsystem) {
  const text = normalizeText(message);
  if (!text && !stage && !subsystem) {
    return "";
  }

  if (text.includes("permission denied") || text.includes("not allowed")) {
    return "TOOL_PERMISSION_DENIED";
  }
  if (text.includes("not registered") || text.includes("tool not found")) {
    return "TOOL_NOT_FOUND";
  }
  if (text.includes("validation")) {
    return "VALIDATION_ERROR";
  }
  if (text.includes("timeout") || stage.includes("timeout") || stage.includes("loop")) {
    return "LOOP_TIMEOUT";
  }
  if (stage.includes("retrieval") || subsystem.includes("retrieval") || text.includes("retrieval")) {
    return "RETRIEVAL_ERROR";
  }
  if (stage.includes("memory") || subsystem.includes("memory") || text.includes("summar")) {
    return "MEMORY_ERROR";
  }
  if (stage.includes("llm") || subsystem.includes("llm") || text.includes("openai")) {
    return "LLM_ERROR";
  }
  if (stage.includes("tool") || subsystem.includes("tool")) {
    return "TOOL_RUNTIME_ERROR";
  }
  return "";
}

function isTimeoutSignal(code, message, stage) {
  const text = normalizeText(`${code} ${message} ${stage}`);
  return text.includes("timeout") || text.includes("loop_guard") || text.includes("iteration");
}

function isRetrievalSignal(code, message, stage, subsystem) {
  const text = normalizeText(`${code} ${message} ${stage} ${subsystem}`);
  return text.includes("retrieval");
}

function isMemorySignal(code, message, stage, subsystem) {
  const text = normalizeText(`${code} ${message} ${stage} ${subsystem}`);
  return text.includes("memory") || text.includes("summary") || text.includes("summarizer");
}

function isValidationSignal(code, message, stage) {
  const text = normalizeText(`${code} ${message} ${stage}`);
  return text.includes("validation") || text.includes("invalid");
}

function isLLMSignal(code, message, stage, subsystem) {
  const text = normalizeText(`${code} ${message} ${stage} ${subsystem}`);
  return text.includes("llm") || text.includes("openai") || text.includes("provider");
}

function isToolSignal(code, message, stage, subsystem) {
  const text = normalizeText(`${code} ${message} ${stage} ${subsystem}`);
  return text.includes("tool");
}

function normalizePayload(value) {
  if (value instanceof Error) {
    return {
      code: normalizeOptionalString(value.code),
      message: normalizeOptionalString(value.message),
      errorCode: "",
      errorMessage: "",
    };
  }
  if (!isRecord(value)) {
    return {
      code: "",
      message: normalizeOptionalString(value),
      errorCode: "",
      errorMessage: "",
    };
  }
  return {
    code: normalizeOptionalString(value.code),
    message: normalizeOptionalString(value.message),
    errorCode: normalizeOptionalString(value.errorCode),
    errorMessage: normalizeOptionalString(value.errorMessage),
  };
}

function normalizeCode(value) {
  const normalized = normalizeOptionalString(value).toUpperCase();
  return normalized.replace(/[^A-Z0-9_]+/g, "_");
}

function normalizeMessage(primary, fallback) {
  const message = normalizeOptionalString(primary) || normalizeOptionalString(fallback);
  return message || "Unknown runtime failure.";
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function normalizeOptionalString(value) {
  const text = String(value || "").trim();
  return text || "";
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

module.exports = {
  FAILURE_TYPES,
  classifyFailure,
};
