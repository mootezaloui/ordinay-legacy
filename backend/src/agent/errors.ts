export interface AgentErrorOptions {
  code?: string;
  cause?: unknown;
  details?: Record<string, unknown>;
}

export class AgentError extends Error {
  public readonly code: string;
  public readonly cause?: unknown;
  public readonly details?: Record<string, unknown>;

  constructor(message: string, options: AgentErrorOptions = {}) {
    super(message);
    this.name = "AgentError";
    this.code = options.code ?? "AGENT_ERROR";
    this.cause = options.cause;
    this.details = options.details;
  }
}

export class SessionError extends AgentError {
  constructor(message = "Session operation failed", options: AgentErrorOptions = {}) {
    super(message, { ...options, code: "SESSION_ERROR" });
    this.name = "SessionError";
  }
}

export class ToolExecutionError extends AgentError {
  constructor(message = "Tool execution failed", options: AgentErrorOptions = {}) {
    super(message, { ...options, code: "TOOL_EXECUTION_ERROR" });
    this.name = "ToolExecutionError";
  }
}

export class PermissionError extends AgentError {
  constructor(message = "Operation is not permitted", options: AgentErrorOptions = {}) {
    super(message, { ...options, code: "PERMISSION_ERROR" });
    this.name = "PermissionError";
  }
}

export class ValidationError extends AgentError {
  constructor(message = "Validation failed", options: AgentErrorOptions = {}) {
    super(message, { ...options, code: "VALIDATION_ERROR" });
    this.name = "ValidationError";
  }
}

export class LoopGuardError extends AgentError {
  constructor(message = "Loop guard limit exceeded", options: AgentErrorOptions = {}) {
    super(message, { ...options, code: "LOOP_GUARD_ERROR" });
    this.name = "LoopGuardError";
  }
}
