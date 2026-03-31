"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PermissionGate = void 0;
const tools_1 = require("../tools");
const LEGACY_MODE_SCOPE = {
    READ_ONLY: "read",
    DRAFT: "draft",
    EXECUTE: "execute",
    AUTONOMOUS: "execute",
};
const SCOPE_ALLOWED_CATEGORIES = {
    unknown: new Set([
        tools_1.ToolCategory.READ,
        tools_1.ToolCategory.EXTERNAL,
        tools_1.ToolCategory.DRAFT,
        tools_1.ToolCategory.PLAN,
        tools_1.ToolCategory.SYSTEM,
    ]),
    read: new Set([tools_1.ToolCategory.READ, tools_1.ToolCategory.EXTERNAL]),
    draft: new Set([
        tools_1.ToolCategory.READ,
        tools_1.ToolCategory.EXTERNAL,
        tools_1.ToolCategory.DRAFT,
        tools_1.ToolCategory.SYSTEM,
    ]),
    execute: new Set([
        tools_1.ToolCategory.READ,
        tools_1.ToolCategory.EXTERNAL,
        tools_1.ToolCategory.DRAFT,
        tools_1.ToolCategory.PLAN,
        tools_1.ToolCategory.WRITE,
        tools_1.ToolCategory.EXECUTE,
        tools_1.ToolCategory.SYSTEM,
    ]),
    admin: new Set([
        tools_1.ToolCategory.READ,
        tools_1.ToolCategory.EXTERNAL,
        tools_1.ToolCategory.DRAFT,
        tools_1.ToolCategory.PLAN,
        tools_1.ToolCategory.WRITE,
        tools_1.ToolCategory.EXECUTE,
        tools_1.ToolCategory.SYSTEM,
    ]),
};
class PermissionGate {
    evaluate(scopeOrContext, tool) {
        const scope = this.resolveScope(scopeOrContext);
        if (!scope) {
            return this.deny("unknown", tool, "Unknown auth scope");
        }
        const allowedCategories = SCOPE_ALLOWED_CATEGORIES[scope];
        if (!allowedCategories) {
            return this.deny(scope, tool, "Unknown auth scope");
        }
        if (!allowedCategories.has(tool.category)) {
            return this.deny(scope, tool, `Tool category "${tool.category}" is blocked for scope "${scope}"`);
        }
        const requiresConfirmation = tool.category === tools_1.ToolCategory.WRITE || tool.category === tools_1.ToolCategory.EXECUTE;
        return {
            allowed: true,
            requiresConfirmation,
        };
    }
    resolveScope(value) {
        if (typeof value === "string") {
            return this.normalizeScope(value) ?? this.mapLegacyModeToScope(value);
        }
        const row = isRecord(value) ? value : null;
        if (!row) {
            return "unknown";
        }
        const fromScope = this.normalizeScope(row.authScope);
        if (fromScope) {
            return fromScope;
        }
        const fromMode = this.mapLegacyModeToScope(row.mode);
        if (fromMode) {
            return fromMode;
        }
        return "unknown";
    }
    mapLegacyModeToScope(mode) {
        const normalized = String(mode || "").trim().toUpperCase();
        if (Object.prototype.hasOwnProperty.call(LEGACY_MODE_SCOPE, normalized)) {
            return LEGACY_MODE_SCOPE[normalized];
        }
        return null;
    }
    normalizeScope(scope) {
        const normalized = String(scope || "").trim().toLowerCase();
        if (normalized === "unknown" ||
            normalized === "read" ||
            normalized === "draft" ||
            normalized === "execute" ||
            normalized === "admin") {
            return normalized;
        }
        switch (normalized) {
            case "reader":
            case "readonly":
            case "read_only":
                return "read";
            case "writer":
            case "editor":
            case "guided":
                return "draft";
            case "operator":
                return "execute";
            default:
                return null;
        }
    }
    deny(scope, tool, reason) {
        return {
            allowed: false,
            requiresConfirmation: false,
            reason: `${reason}. Tool "${tool.name}" (${tool.category}) is blocked for scope "${scope}".`,
        };
    }
}
exports.PermissionGate = PermissionGate;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
