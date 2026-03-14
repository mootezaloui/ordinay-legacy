"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adaptLegacyTool = adaptLegacyTool;
const errors_1 = require("../errors");
const tool_enrichments_1 = require("./tool.enrichments");
const tool_types_1 = require("./tool.types");
function adaptLegacyTool(legacyTool) {
    const parsed = parseLegacyTool(legacyTool);
    const category = normalizeLegacyCategory(parsed.category, parsed.name);
    const sideEffects = typeof parsed.sideEffects === "boolean"
        ? parsed.sideEffects
        : (0, tool_enrichments_1.inferSideEffects)(category);
    return {
        name: parsed.name,
        category,
        description: parsed.description || `Legacy tool: ${parsed.name}`,
        inputSchema: parsed.inputSchema,
        outputSchema: parsed.outputSchema,
        sideEffects,
        handler: wrapLegacyHandler(parsed.handler),
    };
}
function parseLegacyTool(legacyTool) {
    if (!isRecord(legacyTool)) {
        throw new errors_1.ValidationError("Legacy tool must be an object");
    }
    const name = String(legacyTool.name ?? "").trim();
    if (!name) {
        throw new errors_1.ValidationError("Legacy tool must include a non-empty name");
    }
    const rawHandler = resolveHandler(legacyTool);
    if (!rawHandler) {
        throw new errors_1.ValidationError(`Legacy tool "${name}" must include a handler`);
    }
    return {
        name,
        description: typeof legacyTool.description === "string" ? legacyTool.description : undefined,
        category: typeof legacyTool.category === "string" ? legacyTool.category : undefined,
        inputSchema: isRecord(legacyTool.inputSchema) ? legacyTool.inputSchema : undefined,
        outputSchema: isRecord(legacyTool.outputSchema) ? legacyTool.outputSchema : undefined,
        handler: rawHandler,
        sideEffects: typeof legacyTool.sideEffects === "boolean" ? legacyTool.sideEffects : undefined,
    };
}
function resolveHandler(tool) {
    if (typeof tool.handler === "function") {
        return tool.handler;
    }
    if (typeof tool.execute === "function") {
        return tool.execute;
    }
    return null;
}
function normalizeLegacyCategory(rawCategory, toolName) {
    const normalized = String(rawCategory ?? "").trim().toUpperCase();
    switch (normalized) {
        case "READ":
            return tool_types_1.ToolCategory.READ;
        case "WRITE":
            return tool_types_1.ToolCategory.WRITE;
        case "PLAN":
            return tool_types_1.ToolCategory.PLAN;
        case "EXECUTE":
            return tool_types_1.ToolCategory.EXECUTE;
        case "EXTERNAL":
            return tool_types_1.ToolCategory.EXTERNAL;
        case "DRAFT":
            return tool_types_1.ToolCategory.WRITE;
        case "RESEARCH":
            return tool_types_1.ToolCategory.EXTERNAL;
        default:
            return (0, tool_enrichments_1.inferToolCategory)(toolName);
    }
}
function wrapLegacyHandler(legacyHandler) {
    return async (context, args) => {
        try {
            const rawResult = legacyHandler.length >= 2
                ? await legacyHandler(args, context)
                : await legacyHandler(args);
            return normalizeToolResult(rawResult);
        }
        catch (error) {
            return normalizeFailure(error);
        }
    };
}
function normalizeToolResult(result) {
    if (isRecord(result) && typeof result.ok === "boolean") {
        if (result.ok) {
            return {
                ok: true,
                data: Object.prototype.hasOwnProperty.call(result, "data")
                    ? result.data
                    : result,
                metadata: isRecord(result.metadata) ? result.metadata : undefined,
            };
        }
        return {
            ok: false,
            errorCode: typeof result.errorCode === "string" ? result.errorCode : "LEGACY_TOOL_ERROR",
            errorMessage: typeof result.errorMessage === "string"
                ? result.errorMessage
                : "Legacy tool error",
            metadata: isRecord(result.metadata) ? result.metadata : undefined,
        };
    }
    if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, "error")) {
        return normalizeFailure(result.error);
    }
    return { ok: true, data: result };
}
function normalizeFailure(error) {
    if (isRecord(error)) {
        return {
            ok: false,
            errorCode: typeof error.code === "string" ? error.code : "LEGACY_TOOL_ERROR",
            errorMessage: typeof error.message === "string" ? error.message : "Legacy tool error",
            metadata: { details: error },
        };
    }
    if (error instanceof Error) {
        return {
            ok: false,
            errorCode: "LEGACY_TOOL_ERROR",
            errorMessage: error.message || "Legacy tool error",
            metadata: { details: { name: error.name } },
        };
    }
    return {
        ok: false,
        errorCode: "LEGACY_TOOL_ERROR",
        errorMessage: "Legacy tool error",
        metadata: { details: { raw: error } },
    };
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
