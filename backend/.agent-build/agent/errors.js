"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoopGuardError = exports.ValidationError = exports.PermissionError = exports.ToolExecutionError = exports.SessionError = exports.AgentError = void 0;
class AgentError extends Error {
    code;
    cause;
    details;
    constructor(message, options = {}) {
        super(message);
        this.name = "AgentError";
        this.code = options.code ?? "AGENT_ERROR";
        this.cause = options.cause;
        this.details = options.details;
    }
}
exports.AgentError = AgentError;
class SessionError extends AgentError {
    constructor(message = "Session operation failed", options = {}) {
        super(message, { ...options, code: "SESSION_ERROR" });
        this.name = "SessionError";
    }
}
exports.SessionError = SessionError;
class ToolExecutionError extends AgentError {
    constructor(message = "Tool execution failed", options = {}) {
        super(message, { ...options, code: "TOOL_EXECUTION_ERROR" });
        this.name = "ToolExecutionError";
    }
}
exports.ToolExecutionError = ToolExecutionError;
class PermissionError extends AgentError {
    constructor(message = "Operation is not permitted", options = {}) {
        super(message, { ...options, code: "PERMISSION_ERROR" });
        this.name = "PermissionError";
    }
}
exports.PermissionError = PermissionError;
class ValidationError extends AgentError {
    constructor(message = "Validation failed", options = {}) {
        super(message, { ...options, code: "VALIDATION_ERROR" });
        this.name = "ValidationError";
    }
}
exports.ValidationError = ValidationError;
class LoopGuardError extends AgentError {
    constructor(message = "Loop guard limit exceeded", options = {}) {
        super(message, { ...options, code: "LOOP_GUARD_ERROR" });
        this.name = "LoopGuardError";
    }
}
exports.LoopGuardError = LoopGuardError;
