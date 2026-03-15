"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_AGENT_MODE = exports.ENABLE_AUDIT_LOGGING = exports.ENABLE_COMPAT_EVENTS = exports.ENABLE_STRICT_VALIDATION = exports.LOOP_GUARD_TIMEOUT_MS = exports.MAX_TOOL_ITERATIONS = void 0;
const types_1 = require("./types");
exports.MAX_TOOL_ITERATIONS = readPositiveInt(process.env.AGENT_MAX_TOOL_ITERATIONS, 15);
exports.LOOP_GUARD_TIMEOUT_MS = readPositiveInt(process.env.AGENT_LOOP_GUARD_TIMEOUT_MS, 90_000);
exports.ENABLE_STRICT_VALIDATION = true;
exports.ENABLE_COMPAT_EVENTS = true;
exports.ENABLE_AUDIT_LOGGING = true;
exports.DEFAULT_AGENT_MODE = types_1.AgentMode.READ_ONLY;
function readPositiveInt(value, fallback) {
    const parsed = Number.parseInt(String(value ?? ""), 10);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }
    return parsed;
}
