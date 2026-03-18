import { ValidationError } from "../errors";
import { inferSideEffects, inferToolCategory } from "./tool.enrichments";
import {
  ToolCategory,
  type ToolDefinition,
  type ToolExecutionContext,
  type ToolExecutionResult,
} from "./tool.types";

type LegacyHandler =
  | ((args: Record<string, unknown>) => unknown | Promise<unknown>)
  | ((
      args: Record<string, unknown>,
      context: ToolExecutionContext,
    ) => unknown | Promise<unknown>);

interface LegacyToolShape {
  name: string;
  description?: string;
  category?: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  handler: LegacyHandler;
  sideEffects?: boolean;
}

export function adaptLegacyTool(legacyTool: unknown): ToolDefinition {
  const parsed = parseLegacyTool(legacyTool);
  const category = normalizeLegacyCategory(parsed.category, parsed.name);
  const sideEffects =
    typeof parsed.sideEffects === "boolean"
      ? parsed.sideEffects
      : inferSideEffects(category);

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

function parseLegacyTool(legacyTool: unknown): LegacyToolShape {
  if (!isRecord(legacyTool)) {
    throw new ValidationError("Legacy tool must be an object");
  }

  const name = String(legacyTool.name ?? "").trim();
  if (!name) {
    throw new ValidationError("Legacy tool must include a non-empty name");
  }

  const rawHandler = resolveHandler(legacyTool);
  if (!rawHandler) {
    throw new ValidationError(`Legacy tool "${name}" must include a handler`);
  }

  return {
    name,
    description:
      typeof legacyTool.description === "string" ? legacyTool.description : undefined,
    category: typeof legacyTool.category === "string" ? legacyTool.category : undefined,
    inputSchema: isRecord(legacyTool.inputSchema) ? legacyTool.inputSchema : undefined,
    outputSchema: isRecord(legacyTool.outputSchema) ? legacyTool.outputSchema : undefined,
    handler: rawHandler,
    sideEffects:
      typeof legacyTool.sideEffects === "boolean" ? legacyTool.sideEffects : undefined,
  };
}

function resolveHandler(tool: Record<string, unknown>): LegacyHandler | null {
  if (typeof tool.handler === "function") {
    return tool.handler as LegacyHandler;
  }
  if (typeof tool.execute === "function") {
    return tool.execute as LegacyHandler;
  }
  return null;
}

function normalizeLegacyCategory(
  rawCategory: string | undefined,
  toolName: string,
): ToolCategory {
  const normalized = String(rawCategory ?? "").trim().toUpperCase();
  switch (normalized) {
    case "READ":
      return ToolCategory.READ;
    case "WRITE":
      return ToolCategory.WRITE;
    case "PLAN":
      return ToolCategory.PLAN;
    case "EXECUTE":
      return ToolCategory.EXECUTE;
    case "EXTERNAL":
      return ToolCategory.EXTERNAL;
    case "DRAFT":
      return ToolCategory.DRAFT;
    case "RESEARCH":
      return ToolCategory.EXTERNAL;
    default:
      return inferToolCategory(toolName);
  }
}

function wrapLegacyHandler(legacyHandler: LegacyHandler) {
  return async (
    context: ToolExecutionContext,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> => {
    try {
      const rawResult =
        legacyHandler.length >= 2
          ? await (
              legacyHandler as (
                legacyArgs: Record<string, unknown>,
                legacyContext: ToolExecutionContext,
              ) => unknown
            )(args, context)
          : await (
              legacyHandler as (legacyArgs: Record<string, unknown>) => unknown
            )(args);

      return normalizeToolResult(rawResult);
    } catch (error) {
      return normalizeFailure(error);
    }
  };
}

function normalizeToolResult(result: unknown): ToolExecutionResult {
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
      errorCode:
        typeof result.errorCode === "string" ? result.errorCode : "LEGACY_TOOL_ERROR",
      errorMessage:
        typeof result.errorMessage === "string"
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

function normalizeFailure(error: unknown): ToolExecutionResult {
  if (isRecord(error)) {
    return {
      ok: false,
      errorCode: typeof error.code === "string" ? error.code : "LEGACY_TOOL_ERROR",
      errorMessage:
        typeof error.message === "string" ? error.message : "Legacy tool error",
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
