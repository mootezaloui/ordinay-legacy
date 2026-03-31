import type { PlanOperation } from "../../types";
import {
  buildUpdatePreview,
  formatValidationIssues,
  normalizeEntityId,
  normalizeEntityType,
  normalizePreview,
  normalizeReason,
  normalizeUpdateChangesInput,
  validateUpdateChanges,
  type ValidationIssue,
} from "./entity.schemas";
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from "../tool.types";

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
      description:
        "Patch object for the update. Supports { field: value } and { field: { from, to } } shapes.",
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

async function handler(
  _context: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const entityType = normalizeEntityType(args.entityType);
  if (!entityType) {
    return invalidResult(
      "INVALID_ENTITY_TYPE",
      "proposeUpdate requires a supported entityType.",
    );
  }

  const entityId = normalizeEntityId(args.entityId);
  if (entityId == null) {
    return invalidResult(
      "INVALID_ENTITY_ID",
      "proposeUpdate requires entityId (positive number or non-empty string).",
    );
  }

  const normalizedChanges = normalizeUpdateChangesInput(args.changes);
  if (!normalizedChanges) {
    return invalidResult(
      "INVALID_UPDATE_CHANGES",
      "proposeUpdate requires changes as a non-empty object.",
    );
  }

  const issues = validateUpdateChanges(entityType, normalizedChanges.changes);
  if (issues.length > 0) {
    return invalidResult(
      "INVALID_UPDATE_PROPOSAL",
      formatValidationIssues(issues),
      issues,
    );
  }

  const reason = normalizeReason(args.reason);
  const operation: PlanOperation = {
    operation: "update",
    entityType,
    entityId,
    changes: normalizedChanges.changes,
    ...(reason ? { reason } : {}),
  };

  const preview =
    normalizePreview(args.preview) ??
    buildUpdatePreview(entityType, normalizedChanges.fields);
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

function invalidResult(
  errorCode: string,
  errorMessage: string,
  issues?: ValidationIssue[],
): ToolExecutionResult {
  return {
    ok: false,
    errorCode,
    errorMessage,
    metadata: issues && issues.length > 0 ? { issues } : undefined,
  };
}

function buildUpdateSummary(
  entityType: string,
  entityId: number | string,
  changes: Record<string, unknown>,
): string {
  const keys = Object.keys(changes);
  const suffix =
    keys.length > 0 ? ` (${keys.length} field${keys.length > 1 ? "s" : ""})` : "";
  return `Update ${entityType} ${String(entityId)}${suffix}`;
}

export const proposeUpdateTool: ToolDefinition = {
  name: "proposeUpdate",
  category: ToolCategory.PLAN,
  description:
    "Propose updating an existing entity. This tool validates and normalizes update intent " +
    "for confirmation flow. It never writes to the database directly.",
  inputSchema,
  outputSchema,
  sideEffects: false,
  handler,
};
