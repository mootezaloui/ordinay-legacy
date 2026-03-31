"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposeUpdateTool = void 0;
const entity_schemas_1 = require("./entity.schemas");
const tool_types_1 = require("../tool.types");
const inputSchema = {
    type: "object",
    properties: {
        entityType: {
            type: "string",
            description: "Target entity type to update.",
        },
        entityId: {
            description: "ID of the target entity (positive number or stable string ID).",
        },
        changes: {
            type: "object",
            description: "Patch object for the update. Supports { field: value } and { field: { from, to } } shapes.",
        },
        reason: {
            type: "string",
            description: "Optional short reason shown to the user in confirmation preview.",
        },
        preview: {
            type: "object",
            description: "Optional explicit preview object. If omitted, backend generates one.",
        },
    },
    required: ["entityType", "entityId", "changes"],
    additionalProperties: false,
};
const outputSchema = {
    type: "object",
    properties: {
        proposal: {
            type: "object",
            description: "Normalized plan proposal payload used by pending confirmation flow.",
        },
    },
    required: ["proposal"],
    additionalProperties: false,
};
async function handler(_context, args) {
    const entityType = (0, entity_schemas_1.normalizeEntityType)(args.entityType);
    if (!entityType) {
        return invalidResult("INVALID_ENTITY_TYPE", "proposeUpdate requires a supported entityType.");
    }
    const entityId = (0, entity_schemas_1.normalizeEntityId)(args.entityId);
    if (entityId == null) {
        return invalidResult("INVALID_ENTITY_ID", "proposeUpdate requires entityId (positive number or non-empty string).");
    }
    const normalizedChanges = (0, entity_schemas_1.normalizeUpdateChangesInput)(args.changes);
    if (!normalizedChanges) {
        return invalidResult("INVALID_UPDATE_CHANGES", "proposeUpdate requires changes as a non-empty object.");
    }
    const issues = (0, entity_schemas_1.validateUpdateChanges)(entityType, normalizedChanges.changes);
    if (issues.length > 0) {
        return invalidResult("INVALID_UPDATE_PROPOSAL", (0, entity_schemas_1.formatValidationIssues)(issues), issues);
    }
    const reason = (0, entity_schemas_1.normalizeReason)(args.reason);
    const operation = {
        operation: "update",
        entityType,
        entityId,
        changes: normalizedChanges.changes,
        ...(reason ? { reason } : {}),
    };
    const preview = (0, entity_schemas_1.normalizePreview)(args.preview) ??
        (0, entity_schemas_1.buildUpdatePreview)(entityType, normalizedChanges.fields);
    const summary = buildUpdateSummary(entityType, entityId, normalizedChanges.changes);
    return {
        ok: true,
        data: {
            proposal: {
                operation,
                summary,
                ...(preview ? { preview } : {}),
            },
        },
        metadata: {
            category: "PLAN",
            operation: "update",
            entityType,
        },
    };
}
function invalidResult(errorCode, errorMessage, issues) {
    return {
        ok: false,
        errorCode,
        errorMessage,
        metadata: issues && issues.length > 0 ? { issues } : undefined,
    };
}
function buildUpdateSummary(entityType, entityId, changes) {
    const keys = Object.keys(changes);
    const suffix = keys.length > 0 ? ` (${keys.length} field${keys.length > 1 ? "s" : ""})` : "";
    return `Update ${entityType} ${String(entityId)}${suffix}`;
}
exports.proposeUpdateTool = {
    name: "proposeUpdate",
    category: tool_types_1.ToolCategory.PLAN,
    description: "Propose updating an existing entity. This tool validates and normalizes update intent " +
        "for confirmation flow. It never writes to the database directly.",
    inputSchema,
    outputSchema,
    sideEffects: false,
    handler,
};
