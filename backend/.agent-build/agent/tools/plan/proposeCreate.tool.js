"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.proposeCreateTool = void 0;
const entity_schemas_1 = require("./entity.schemas");
const tool_types_1 = require("../tool.types");
const inputSchema = {
    type: "object",
    properties: {
        entityType: {
            type: "string",
            description: "Target entity type to create (client, dossier, lawsuit, task, ...).",
        },
        payload: {
            type: "object",
            description: "Fields to persist for the new entity.",
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
    required: ["entityType", "payload"],
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
        return invalidResult("INVALID_ENTITY_TYPE", "proposeCreate requires a supported entityType.");
    }
    const payload = (0, entity_schemas_1.normalizePayload)(args.payload);
    if (!payload) {
        return invalidResult("INVALID_CREATE_PAYLOAD", "proposeCreate requires payload as a non-empty object.");
    }
    const issues = (0, entity_schemas_1.validateCreatePayload)(entityType, payload);
    if (issues.length > 0) {
        return invalidResult("INVALID_CREATE_PROPOSAL", (0, entity_schemas_1.formatValidationIssues)(issues), issues);
    }
    const reason = (0, entity_schemas_1.normalizeReason)(args.reason);
    const operation = {
        operation: "create",
        entityType,
        payload,
        ...(reason ? { reason } : {}),
    };
    const preview = (0, entity_schemas_1.normalizePreview)(args.preview) ?? (0, entity_schemas_1.buildCreatePreview)(entityType, payload);
    const summary = buildCreateSummary(entityType, payload);
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
            operation: "create",
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
function buildCreateSummary(entityType, payload) {
    const headline = pickHeadline(payload, ["name", "title", "reference", "subject"]);
    if (headline) {
        return `Create ${entityType}: ${headline}`;
    }
    return `Create ${entityType}`;
}
function pickHeadline(payload, preferredKeys) {
    for (const key of preferredKeys) {
        if (!Object.prototype.hasOwnProperty.call(payload, key)) {
            continue;
        }
        const text = toDisplayText(payload[key]);
        if (text) {
            return text;
        }
    }
    for (const value of Object.values(payload)) {
        const text = toDisplayText(value);
        if (text) {
            return text;
        }
    }
    return null;
}
function toDisplayText(value) {
    if (typeof value === "string") {
        const trimmed = value.trim();
        return trimmed || null;
    }
    if (typeof value === "number" || typeof value === "boolean") {
        return String(value);
    }
    return null;
}
exports.proposeCreateTool = {
    name: "proposeCreate",
    category: tool_types_1.ToolCategory.PLAN,
    description: "Propose creating a new entity. This tool validates and normalizes create intent " +
        "for confirmation flow. It never writes to the database directly.",
    inputSchema,
    outputSchema,
    sideEffects: false,
    handler,
};
