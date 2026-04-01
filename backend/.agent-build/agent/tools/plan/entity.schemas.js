"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizeEntityType = normalizeEntityType;
exports.normalizeEntityId = normalizeEntityId;
exports.normalizeReason = normalizeReason;
exports.normalizePreview = normalizePreview;
exports.normalizePayload = normalizePayload;
exports.normalizeUpdateChangesInput = normalizeUpdateChangesInput;
exports.validateCreatePayload = validateCreatePayload;
exports.validateUpdateChanges = validateUpdateChanges;
exports.validateDeleteTarget = validateDeleteTarget;
exports.buildCreatePreview = buildCreatePreview;
exports.buildUpdatePreview = buildUpdatePreview;
exports.buildDeletePreview = buildDeletePreview;
exports.formatValidationIssues = formatValidationIssues;
const ENTITY_RULES = {
    client: {
        requiredOnCreate: [["name"]],
        enumFields: {
            status: ["active", "inactive", "archived", "pending", "open", "closed"],
        },
    },
    dossier: {
        requiredOnCreate: [["title"]],
        enumFields: {
            status: ["open", "closed", "active", "archived", "pending"],
        },
    },
    lawsuit: {
        requiredOnCreate: [["dossier_id", "dossierId"]],
        enumFields: {
            status: ["open", "closed", "active", "archived", "pending"],
        },
    },
    task: {
        requiredOnCreate: [["title"]],
        enumFields: {
            status: [
                "todo",
                "in_progress",
                "blocked",
                "done",
                "cancelled",
                "open",
                "closed",
                "active",
                "archived",
                "pending",
            ],
            priority: ["low", "medium", "normal", "high", "urgent", "critical"],
        },
    },
    personal_task: {
        requiredOnCreate: [["title"]],
        enumFields: {
            status: ["todo", "in_progress", "blocked", "done", "cancelled", "pending"],
            priority: ["low", "medium", "normal", "high", "urgent", "critical"],
        },
    },
    mission: {
        requiredOnCreate: [["title"]],
        enumFields: {
            status: ["open", "closed", "active", "archived", "pending", "completed", "cancelled"],
        },
    },
    session: {
        requiredOnCreate: [["type"]],
        enumFields: {
            status: [
                "scheduled",
                "completed",
                "cancelled",
                "rescheduled",
                "no_show",
                "open",
                "closed",
                "active",
                "archived",
                "pending",
            ],
        },
    },
    document: {
        requiredOnCreate: [["title"]],
        enumFields: {
            status: ["draft", "generated", "archived", "pending"],
        },
    },
    officer: {
        requiredOnCreate: [["name"]],
        enumFields: {
            status: ["active", "inactive", "archived", "pending"],
        },
    },
    notification: {
        requiredOnCreate: [["message"]],
        enumFields: {
            status: ["unread", "read", "archived", "pending", "open", "closed", "active"],
        },
    },
    financial_entry: {
        requiredOnCreate: [["amount"]],
        enumFields: {
            status: ["pending", "paid", "overdue", "cancelled", "open", "closed", "active", "archived"],
        },
    },
    history_event: {
        requiredOnCreate: [["summary", "description", "title"]],
    },
};
const ENTITY_TYPE_ALIASES = {
    clients: "client",
    dossiers: "dossier",
    lawsuits: "lawsuit",
    tasks: "task",
    personal_tasks: "personal_task",
    personaltask: "personal_task",
    personaltasks: "personal_task",
    missions: "mission",
    sessions: "session",
    documents: "document",
    officers: "officer",
    notifications: "notification",
    financial_entries: "financial_entry",
    financialentry: "financial_entry",
    financialentries: "financial_entry",
    history_events: "history_event",
    historyevent: "history_event",
    historyevents: "history_event",
};
const MAX_PREVIEW_FIELDS = 12;
const MAX_PREVIEW_WARNINGS = 20;
const LINK_GROUP_DOSSIER = ["dossier_id", "dossierId"];
const LINK_GROUP_LAWSUIT = ["lawsuit_id", "lawsuitId"];
const LINK_GROUP_CLIENT = ["client_id", "clientId"];
const LINK_GROUP_MISSION = ["mission_id", "missionId"];
const LINK_GROUP_TASK = ["task_id", "taskId"];
const LINK_GROUP_SESSION = ["session_id", "sessionId"];
const LINK_GROUP_PERSONAL_TASK = ["personal_task_id", "personalTaskId"];
const LINK_GROUP_FINANCIAL_ENTRY = ["financial_entry_id", "financialEntryId"];
const LINK_GROUP_OFFICER = ["officer_id", "officerId"];
const CASE_PARENT_LINK_GROUPS = [LINK_GROUP_DOSSIER, LINK_GROUP_LAWSUIT];
const DOCUMENT_PARENT_LINK_GROUPS = [
    LINK_GROUP_CLIENT,
    LINK_GROUP_DOSSIER,
    LINK_GROUP_LAWSUIT,
    LINK_GROUP_MISSION,
    LINK_GROUP_TASK,
    LINK_GROUP_SESSION,
    LINK_GROUP_PERSONAL_TASK,
    LINK_GROUP_FINANCIAL_ENTRY,
    LINK_GROUP_OFFICER,
];
const DOCUMENT_STORAGE_SOURCE_GROUPS = [
    ["file_path", "filePath"],
    [
        "generation_uid",
        "generationUid",
        "generation_id",
        "generationId",
        "source_generation_uid",
        "sourceGenerationUid",
        "document_generation_uid",
        "documentGenerationUid",
        "preview_uid",
        "previewUid",
        "document_preview_uid",
        "documentPreviewUid",
    ],
];
function normalizeEntityType(value) {
    const raw = String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, "_");
    if (!raw) {
        return null;
    }
    const canonical = ENTITY_TYPE_ALIASES[raw] || raw;
    if (ENTITY_RULES[canonical]) {
        return canonical;
    }
    if (canonical.endsWith("s")) {
        const singular = canonical.slice(0, -1);
        if (ENTITY_RULES[singular]) {
            return singular;
        }
    }
    return null;
}
function normalizeEntityId(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed) {
            return null;
        }
        if (/^\d+$/.test(trimmed)) {
            const parsed = Number.parseInt(trimmed, 10);
            if (Number.isFinite(parsed) && parsed > 0) {
                return parsed;
            }
        }
        return trimmed;
    }
    return null;
}
function normalizeReason(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
function normalizePreview(value) {
    if (!isRecord(value)) {
        return undefined;
    }
    const preview = {};
    const title = asTrimmedString(value.title);
    if (title) {
        preview.title = title;
    }
    const subtitle = asTrimmedString(value.subtitle);
    if (subtitle) {
        preview.subtitle = subtitle;
    }
    const fields = normalizePreviewFields(value.fields);
    if (fields.length > 0) {
        preview.fields = fields;
    }
    const warnings = normalizeWarnings(value.warnings);
    if (warnings.length > 0) {
        preview.warnings = warnings;
    }
    return Object.keys(preview).length > 0 ? preview : undefined;
}
function normalizePayload(value) {
    if (!isRecord(value)) {
        return null;
    }
    return { ...value };
}
function normalizeUpdateChangesInput(value) {
    if (!isRecord(value)) {
        return null;
    }
    const changes = {};
    const fields = [];
    for (const [rawKey, rawValue] of Object.entries(value)) {
        const key = String(rawKey || "").trim();
        if (!key) {
            continue;
        }
        if (isRecord(rawValue) && Object.prototype.hasOwnProperty.call(rawValue, "to")) {
            const to = rawValue.to;
            changes[key] = to;
            const field = { key, to };
            if (Object.prototype.hasOwnProperty.call(rawValue, "from")) {
                field.from = rawValue.from;
            }
            fields.push(field);
            continue;
        }
        changes[key] = rawValue;
        fields.push({ key, to: rawValue });
    }
    if (Object.keys(changes).length === 0) {
        return null;
    }
    return { changes, fields: fields.slice(0, MAX_PREVIEW_FIELDS) };
}
function validateCreatePayload(entityType, payload) {
    const issues = [];
    const rule = ENTITY_RULES[entityType];
    if (!rule) {
        issues.push({
            path: "entityType",
            code: "UNKNOWN_ENTITY_TYPE",
            message: `Unsupported entity type "${entityType}"`,
        });
        return issues;
    }
    if (Object.keys(payload).length === 0) {
        issues.push({
            path: "payload",
            code: "EMPTY_PAYLOAD",
            message: "Create payload must include at least one field.",
        });
        return issues;
    }
    const keyMap = buildNormalizedKeyMap(payload);
    for (const group of rule.requiredOnCreate) {
        const hasAny = group.some((field) => {
            const matched = keyMap.get(normalizeFieldKey(field));
            return hasPresentValue(matched);
        });
        if (!hasAny) {
            issues.push({
                path: "payload",
                code: "MISSING_REQUIRED_FIELD",
                message: `Missing required field: one of [${group.join(", ")}].`,
            });
        }
    }
    issues.push(...validateEnumFields(entityType, payload));
    issues.push(...validateCreateLinkingConstraints(entityType, keyMap));
    return issues;
}
function validateUpdateChanges(entityType, changes) {
    const issues = [];
    const rule = ENTITY_RULES[entityType];
    if (!rule) {
        issues.push({
            path: "entityType",
            code: "UNKNOWN_ENTITY_TYPE",
            message: `Unsupported entity type "${entityType}"`,
        });
        return issues;
    }
    if (Object.keys(changes).length === 0) {
        issues.push({
            path: "changes",
            code: "EMPTY_CHANGES",
            message: "Update changes must include at least one field.",
        });
        return issues;
    }
    issues.push(...validateEnumFields(entityType, changes));
    return issues;
}
function validateDeleteTarget(entityType, entityId) {
    const issues = [];
    if (!ENTITY_RULES[entityType]) {
        issues.push({
            path: "entityType",
            code: "UNKNOWN_ENTITY_TYPE",
            message: `Unsupported entity type "${entityType}"`,
        });
    }
    if (typeof entityId === "number") {
        if (!Number.isFinite(entityId) || entityId <= 0) {
            issues.push({
                path: "entityId",
                code: "INVALID_ENTITY_ID",
                message: "entityId must be a positive number.",
            });
        }
    }
    else if (typeof entityId === "string") {
        if (entityId.trim().length === 0) {
            issues.push({
                path: "entityId",
                code: "INVALID_ENTITY_ID",
                message: "entityId must be a non-empty string.",
            });
        }
    }
    return issues;
}
function buildCreatePreview(entityType, payload) {
    const fields = Object.entries(payload)
        .filter(([key]) => String(key || "").trim().length > 0)
        .slice(0, MAX_PREVIEW_FIELDS)
        .map(([key, to]) => ({ key, to }));
    if (fields.length === 0) {
        return undefined;
    }
    return {
        title: `Create ${entityType}`,
        fields,
    };
}
function buildUpdatePreview(entityType, fields) {
    if (!Array.isArray(fields) || fields.length === 0) {
        return undefined;
    }
    return {
        title: `Update ${entityType}`,
        fields: fields.slice(0, MAX_PREVIEW_FIELDS),
    };
}
function buildDeletePreview(entityType, entityId) {
    return {
        title: `Delete ${entityType}`,
        subtitle: `Target ID: ${String(entityId)}`,
    };
}
function formatValidationIssues(issues) {
    if (!Array.isArray(issues) || issues.length === 0) {
        return "Validation failed.";
    }
    return issues.map((issue) => `${issue.path}: ${issue.message}`).join(" ");
}
function validateEnumFields(entityType, payload) {
    const issues = [];
    const rule = ENTITY_RULES[entityType];
    const enumFields = rule?.enumFields;
    if (!enumFields) {
        return issues;
    }
    const keyMap = buildNormalizedKeyMap(payload);
    for (const [fieldName, allowedValues] of Object.entries(enumFields)) {
        const value = keyMap.get(normalizeFieldKey(fieldName));
        if (!hasPresentValue(value)) {
            continue;
        }
        if (typeof value !== "string") {
            issues.push({
                path: fieldName,
                code: "INVALID_ENUM_TYPE",
                message: `Field "${fieldName}" must be a string.`,
            });
            continue;
        }
        const normalized = value.trim().toLowerCase();
        if (!allowedValues.includes(normalized)) {
            issues.push({
                path: fieldName,
                code: "INVALID_ENUM_VALUE",
                message: `Invalid value "${value}" for field "${fieldName}". Allowed: ${allowedValues.join(", ")}.`,
            });
        }
    }
    return issues;
}
function validateCreateLinkingConstraints(entityType, keyMap) {
    if (entityType === "task" || entityType === "session" || entityType === "mission") {
        return validateExactlyOneGroupPresent({
            keyMap,
            groups: CASE_PARENT_LINK_GROUPS,
            path: "payload",
            code: "INVALID_PARENT_LINK_SCOPE",
            message: `Create ${entityType} requires exactly one parent reference: ` +
                "provide either dossier_id (or dossierId) or lawsuit_id (or lawsuitId).",
        });
    }
    if (entityType === "document") {
        const issues = [];
        issues.push(...validateExactlyOneGroupPresent({
            keyMap,
            groups: DOCUMENT_PARENT_LINK_GROUPS,
            path: "payload",
            code: "INVALID_DOCUMENT_PARENT_LINK",
            message: "Create document requires exactly one parent reference " +
                "(client/dossier/lawsuit/mission/task/session/personal_task/financial_entry/officer).",
        }));
        if (!hasAnyGroupPresent(keyMap, DOCUMENT_STORAGE_SOURCE_GROUPS)) {
            issues.push({
                path: "payload",
                code: "MISSING_DOCUMENT_STORAGE_SOURCE",
                message: "Create document requires file_path (or filePath) " +
                    "or a generation source token (for example generation_uid).",
            });
        }
        return issues;
    }
    return [];
}
function validateExactlyOneGroupPresent(params) {
    const presentCount = countPresentGroups(params.keyMap, params.groups);
    if (presentCount === 1) {
        return [];
    }
    return [
        {
            path: params.path,
            code: params.code,
            message: params.message,
        },
    ];
}
function countPresentGroups(keyMap, groups) {
    let count = 0;
    for (const group of groups) {
        if (hasGroupPresent(keyMap, group)) {
            count += 1;
        }
    }
    return count;
}
function hasAnyGroupPresent(keyMap, groups) {
    return groups.some((group) => hasGroupPresent(keyMap, group));
}
function hasGroupPresent(keyMap, group) {
    return group.some((field) => hasPresentValue(keyMap.get(normalizeFieldKey(field))));
}
function normalizePreviewFields(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    const fields = [];
    for (const row of value) {
        if (!isRecord(row)) {
            continue;
        }
        const key = asTrimmedString(row.key);
        if (!key) {
            continue;
        }
        const field = { key };
        if (Object.prototype.hasOwnProperty.call(row, "from")) {
            field.from = row.from;
        }
        if (Object.prototype.hasOwnProperty.call(row, "to")) {
            field.to = row.to;
        }
        fields.push(field);
        if (fields.length >= MAX_PREVIEW_FIELDS) {
            break;
        }
    }
    return fields;
}
function normalizeWarnings(value) {
    if (!Array.isArray(value)) {
        return [];
    }
    return value
        .map((row) => asTrimmedString(row))
        .filter((row) => Boolean(row))
        .slice(0, MAX_PREVIEW_WARNINGS);
}
function buildNormalizedKeyMap(record) {
    const map = new Map();
    for (const [key, value] of Object.entries(record)) {
        const normalized = normalizeFieldKey(key);
        if (!normalized || map.has(normalized)) {
            continue;
        }
        map.set(normalized, value);
    }
    return map;
}
function normalizeFieldKey(value) {
    return String(value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "");
}
function hasPresentValue(value) {
    if (value === null || value === undefined) {
        return false;
    }
    if (typeof value === "string") {
        return value.trim().length > 0;
    }
    return true;
}
function asTrimmedString(value) {
    if (typeof value !== "string") {
        return undefined;
    }
    const trimmed = value.trim();
    return trimmed || undefined;
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
