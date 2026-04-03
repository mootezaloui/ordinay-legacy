import type {
  SuggestionArtifact,
  SuggestionArtifactAction,
  SuggestionArtifactDomain,
  SuggestionArtifactTrigger,
} from "../../types";
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from "../tool.types";

const inputSchema = {
  type: "object",
  properties: {
    domain: {
      type: "string",
      enum: ["draft", "execute"],
      description: "Suggestion domain. Use draft for document guidance, execute for mutation guidance.",
    },
    actionType: {
      type: "string",
      enum: ["draft", "create", "update", "delete"],
      description:
        "Suggested follow-up action type. draft is valid only for domain=draft. " +
        "create/update/delete are valid only for domain=execute.",
    },
    trigger: {
      type: "string",
      enum: ["implicit_intent", "proactive_context"],
      description: "Why this suggestion is emitted.",
    },
    targetType: {
      type: "string",
      description: "Suggested target type (for example client_letter, dossier, task, lawsuit).",
    },
    title: {
      type: "string",
      description: "User-facing suggestion title.",
    },
    reason: {
      type: "string",
      description: "Contextual reason grounded in current turn/session data.",
    },
    linkedEntityType: {
      type: "string",
      description: "Optional linked entity type (client, dossier, lawsuit, task, ...).",
    },
    linkedEntityId: {
      description: "Optional linked entity id (number or stable string id).",
    },
    prefillData: {
      type: "object",
      description: "Required prefill payload to make the suggestion immediately actionable.",
    },
  },
  required: ["domain", "actionType", "targetType", "title", "reason", "prefillData"],
  additionalProperties: false,
};

const outputSchema = {
  type: "object",
  properties: {
    artifact: {
      type: "object",
      description: "Normalized suggestion artifact payload.",
    },
  },
  required: ["artifact"],
  additionalProperties: false,
};

const GENERIC_PHRASES = [
  "suggested action",
  "next step",
  "follow up",
  "follow-up",
  "do something",
  "handle this",
  "as needed",
  "if needed",
  "something",
  "anything",
];

async function handler(
  _context: ToolExecutionContext,
  args: Record<string, unknown>,
): Promise<ToolExecutionResult> {
  const domain = parseDomain(args.domain);
  if (!domain) {
    return invalidResult(
      "INVALID_SUGGESTION_DOMAIN",
      "suggestAction requires domain=draft or domain=execute.",
    );
  }

  const actionType = parseActionType(args.actionType);
  if (!actionType) {
    return invalidResult(
      "INVALID_SUGGESTION_ACTION",
      "suggestAction requires actionType=draft|create|update|delete.",
    );
  }

  if (!isActionCompatibleWithDomain(domain, actionType)) {
    return invalidResult(
      "SUGGESTION_DOMAIN_ACTION_MISMATCH",
      `actionType "${actionType}" is not valid for domain "${domain}".`,
    );
  }

  const targetType = asNonEmptyString(args.targetType);
  if (!targetType) {
    return invalidResult(
      "INVALID_SUGGESTION_TARGET",
      "suggestAction requires targetType as a non-empty string.",
    );
  }

  const title = asNonEmptyString(args.title);
  if (!title || title.length < 6) {
    return invalidResult(
      "INVALID_SUGGESTION_TITLE",
      "suggestAction requires a specific title (minimum 6 characters).",
    );
  }

  const reason = asNonEmptyString(args.reason);
  if (!reason || reason.length < 14) {
    return invalidResult(
      "INVALID_SUGGESTION_REASON",
      "suggestAction requires a contextual reason (minimum 14 characters).",
    );
  }

  const titleSpecificityIssue = findGenericPhrase(title);
  if (titleSpecificityIssue) {
    return invalidResult(
      "SUGGESTION_TOO_GENERIC",
      `Suggestion title is too generic (${titleSpecificityIssue}).`,
    );
  }

  const reasonSpecificityIssue = findGenericPhrase(reason);
  if (reasonSpecificityIssue) {
    return invalidResult(
      "SUGGESTION_TOO_GENERIC",
      `Suggestion reason is too generic (${reasonSpecificityIssue}).`,
    );
  }

  const prefillData = asRecord(args.prefillData);
  if (!prefillData || Object.keys(prefillData).length === 0) {
    return invalidResult(
      "INVALID_SUGGESTION_PREFILL",
      "suggestAction requires prefillData as a non-empty object.",
    );
  }

  const prefillIssue = validatePrefillByDomain(domain, prefillData);
  if (prefillIssue) {
    return invalidResult("INVALID_SUGGESTION_PREFILL", prefillIssue);
  }

  const trigger = parseTrigger(args.trigger) ?? "proactive_context";
  const linkedEntityType = asNonEmptyString(args.linkedEntityType) ?? undefined;
  const linkedEntityId = coerceEntityId(args.linkedEntityId);

  const artifact: SuggestionArtifact = {
    version: "v1",
    domain,
    trigger,
    actionType,
    targetType,
    title,
    reason,
    ...(linkedEntityType ? { linkedEntityType } : {}),
    ...(typeof linkedEntityId !== "undefined" ? { linkedEntityId } : {}),
    prefillData,
  };

  return {
    ok: true,
    data: { artifact },
    metadata: {
      category: "SYSTEM",
      domain,
      actionType,
      targetType,
    },
  };
}

function invalidResult(errorCode: string, errorMessage: string): ToolExecutionResult {
  return {
    ok: false,
    errorCode,
    errorMessage,
  };
}

function parseDomain(value: unknown): SuggestionArtifactDomain | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "execute") return "execute";
  return null;
}

function parseActionType(value: unknown): SuggestionArtifactAction | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "create") return "create";
  if (normalized === "update") return "update";
  if (normalized === "delete") return "delete";
  return null;
}

function parseTrigger(value: unknown): SuggestionArtifactTrigger | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "implicit_intent") return "implicit_intent";
  if (normalized === "proactive_context") return "proactive_context";
  return null;
}

function isActionCompatibleWithDomain(
  domain: SuggestionArtifactDomain,
  actionType: SuggestionArtifactAction,
): boolean {
  if (domain === "draft") {
    return actionType === "draft";
  }
  return actionType === "create" || actionType === "update" || actionType === "delete";
}

function validatePrefillByDomain(
  domain: SuggestionArtifactDomain,
  prefillData: Record<string, unknown>,
): string | null {
  if (domain === "draft") {
    const hasDocumentType =
      asNonEmptyString(prefillData.draftType) || asNonEmptyString(prefillData.documentType);
    const hasDraftIntent =
      asNonEmptyString(prefillData.purpose) ||
      asNonEmptyString(prefillData.tone) ||
      asNonEmptyString(prefillData.language);
    if (!hasDocumentType) {
      return "Draft suggestions must include prefillData.draftType or prefillData.documentType.";
    }
    if (!hasDraftIntent) {
      return "Draft suggestions must include contextual prefill such as purpose, tone, or language.";
    }
    return null;
  }

  const hasOperation = asNonEmptyString(prefillData.operation);
  const hasEntityType = asNonEmptyString(prefillData.entityType);
  const hasMutationPayload = asRecord(prefillData.payload) || asRecord(prefillData.changes);
  if (!hasOperation) {
    return "Execute suggestions must include prefillData.operation.";
  }
  if (!hasEntityType) {
    return "Execute suggestions must include prefillData.entityType.";
  }
  if (!hasMutationPayload) {
    return "Execute suggestions must include prefillData.payload or prefillData.changes.";
  }
  return null;
}

function findGenericPhrase(text: string): string | null {
  const normalized = text.trim().toLowerCase();
  for (const phrase of GENERIC_PHRASES) {
    if (normalized.includes(phrase)) {
      return phrase;
    }
  }
  return null;
}

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function coerceEntityId(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = asNonEmptyString(value);
  return text ?? undefined;
}

export const suggestActionTool: ToolDefinition = {
  name: "suggestAction",
  category: ToolCategory.SYSTEM,
  description:
    "Produce a contextual, non-mutating suggestion artifact for either draft or execute flow. " +
    "This tool never creates pending actions and never writes to the database.",
  inputSchema,
  outputSchema,
  sideEffects: false,
  handler,
};

