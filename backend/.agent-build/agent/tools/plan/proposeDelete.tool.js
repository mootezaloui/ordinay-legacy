"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposeDeleteTool = void 0;
const entity_schemas_1 = require("./entity.schemas");
const tool_types_1 = require("../tool.types");
const inputSchema = {
    type: "object",
    properties: {
        entityType: {
            type: "string",
            description: "Target entity type to delete.",
        },
        entityId: {
            description: "ID of the target entity (positive number or stable string ID).",
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
    required: ["entityType", "entityId"],
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
        return invalidResult("INVALID_ENTITY_TYPE", "proposeDelete requires a supported entityType.");
    }
    const entityId = (0, entity_schemas_1.normalizeEntityId)(args.entityId);
    if (entityId == null) {
        return invalidResult("INVALID_ENTITY_ID", "proposeDelete requires entityId (positive number or non-empty string).");
    }
    const issues = (0, entity_schemas_1.validateDeleteTarget)(entityType, entityId);
    if (issues.length > 0) {
        return invalidResult("INVALID_DELETE_PROPOSAL", (0, entity_schemas_1.formatValidationIssues)(issues), issues);
    }
    const reason = (0, entity_schemas_1.normalizeReason)(args.reason);
    const operation = {
        operation: "delete",
        entityType,
        entityId,
        ...(reason ? { reason } : {}),
    };
    const preview = (0, entity_schemas_1.normalizePreview)(args.preview) ?? (0, entity_schemas_1.buildDeletePreview)(entityType, entityId);
    const summary = `Delete ${entityType} ${String(entityId)}`;
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
            operation: "delete",
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
exports.proposeDeleteTool = {
    name: "proposeDelete",
    category: tool_types_1.ToolCategory.PLAN,
    description: "Propose deleting an entity. This tool validates and normalizes delete intent " +
        "for confirmation flow. It never writes to the database directly.",
    inputSchema,
    outputSchema,
    sideEffects: false,
    handler,
};
