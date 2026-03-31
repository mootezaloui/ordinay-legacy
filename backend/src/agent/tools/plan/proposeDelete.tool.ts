import type { PlanOperation } from "../../types";
import {
  buildDeletePreview,
  formatValidationIssues,
  normalizeEntityId,
  normalizeEntityType,
  normalizePreview,
  normalizeReason,
  validateDeleteTarget,
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

async function handler(
  _context: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const entityType = normalizeEntityType(args.entityType);
  if (!entityType) {
    return invalidResult(
      "INVALID_ENTITY_TYPE",
      "proposeDelete requires a supported entityType.",
    );
  }

  const entityId = normalizeEntityId(args.entityId);
  if (entityId == null) {
    return invalidResult(
      "INVALID_ENTITY_ID",
      "proposeDelete requires entityId (positive number or non-empty string).",
    );
  }

  const issues = validateDeleteTarget(entityType, entityId);
  if (issues.length > 0) {
    return invalidResult(
      "INVALID_DELETE_PROPOSAL",
      formatValidationIssues(issues),
      issues,
    );
  }

  const reason = normalizeReason(args.reason);
  const operation: PlanOperation = {
    operation: "delete",
    entityType,
    entityId,
    ...(reason ? { reason } : {}),
  };

  const preview = normalizePreview(args.preview) ?? buildDeletePreview(entityType, entityId);
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

export const proposeDeleteTool: ToolDefinition = {
  name: "proposeDelete",
  category: ToolCategory.PLAN,
  description:
    "Propose deleting an entity. This tool validates and normalizes delete intent " +
    "for confirmation flow. It never writes to the database directly.",
  inputSchema,
  outputSchema,
  sideEffects: false,
  handler,
};
