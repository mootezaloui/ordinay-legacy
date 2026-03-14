"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferToolCategory = inferToolCategory;
exports.inferRiskLevel = inferRiskLevel;
exports.inferSideEffects = inferSideEffects;
const tool_types_1 = require("./tool.types");
const READ_HINTS = ["get", "list", "search", "find", "fetch", "read"];
const WRITE_HINTS = ["create", "update", "delete", "set", "save", "add", "edit"];
const PLAN_HINTS = ["plan", "draft", "prepare", "propose"];
const EXECUTE_HINTS = ["execute", "commit", "confirm", "apply", "run"];
const EXTERNAL_HINTS = ["research", "web", "external", "api", "scrape"];
function inferToolCategory(toolName) {
    const normalized = String(toolName ?? "").trim().toLowerCase();
    if (!normalized) {
        return tool_types_1.ToolCategory.READ;
    }
    if (matchesHint(normalized, EXTERNAL_HINTS)) {
        return tool_types_1.ToolCategory.EXTERNAL;
    }
    if (matchesHint(normalized, EXECUTE_HINTS)) {
        return tool_types_1.ToolCategory.EXECUTE;
    }
    if (matchesHint(normalized, PLAN_HINTS)) {
        return tool_types_1.ToolCategory.PLAN;
    }
    if (matchesHint(normalized, WRITE_HINTS)) {
        return tool_types_1.ToolCategory.WRITE;
    }
    if (matchesHint(normalized, READ_HINTS)) {
        return tool_types_1.ToolCategory.READ;
    }
    return tool_types_1.ToolCategory.READ;
}
function inferRiskLevel(category) {
    switch (category) {
        case tool_types_1.ToolCategory.READ:
            return "low";
        case tool_types_1.ToolCategory.WRITE:
            return "medium";
        case tool_types_1.ToolCategory.EXECUTE:
            return "high";
        case tool_types_1.ToolCategory.EXTERNAL:
            return "medium";
        case tool_types_1.ToolCategory.PLAN:
            return "medium";
        default:
            return "medium";
    }
}
function inferSideEffects(category) {
    switch (category) {
        case tool_types_1.ToolCategory.WRITE:
        case tool_types_1.ToolCategory.EXECUTE:
            return true;
        case tool_types_1.ToolCategory.READ:
        case tool_types_1.ToolCategory.PLAN:
        case tool_types_1.ToolCategory.EXTERNAL:
        default:
            return false;
    }
}
function matchesHint(value, hints) {
    return hints.some((hint) => value.includes(hint));
}
