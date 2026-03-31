"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ENABLE_AUDIT_LOGGING = exports.ENABLE_COMPAT_EVENTS = exports.ENABLE_STRICT_VALIDATION = exports.LOOP_GUARD_TIMEOUT_MS = exports.MAX_TOOL_ITERATIONS = void 0;
exports.MAX_TOOL_ITERATIONS = readPositiveInt(process.env.AGENT_MAX_TOOL_ITERATIONS, 15);
exports.LOOP_GUARD_TIMEOUT_MS = readPositiveInt(process.env.AGENT_LOOP_GUARD_TIMEOUT_MS, 90_000);
exports.ENABLE_STRICT_VALIDATION = true;
exports.ENABLE_COMPAT_EVENTS = false;
exports.ENABLE_AUDIT_LOGGING = true;
function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}
