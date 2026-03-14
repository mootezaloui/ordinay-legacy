import type { PermissionGate } from "../safety";
import { validateToolInput, validateToolOutput } from "../tools";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
} from "../tools";

export class ToolExecutor {
  constructor(private readonly permissionGate?: PermissionGate) {}

  async execute(
    tool: ToolDefinition,
    context: ToolExecutionContext,
    args: Record<string, unknown>,
  ): Promise<ToolExecutionResult> {
    if (this.permissionGate) {
      const decision = this.permissionGate.evaluate(context.mode, tool);
      if (!decision.allowed) {
        return {
          ok: false,
          errorCode: "TOOL_PERMISSION_DENIED",
          errorMessage: decision.reason ?? "Tool is not allowed.",
        };
      }
    }

    if (!validateToolInput(tool.inputSchema, args)) {
      return {
        ok: false,
        errorCode: "INVALID_TOOL_INPUT",
        errorMessage: `Input validation failed for tool "${tool.name}"`,
      };
    }

    try {
      const rawResult = await tool.handler(context, args);
      const normalized = normalizeToolResult(rawResult);

      if (!normalized.ok) {
        return normalized;
      }

      if (!validateToolOutput(tool.outputSchema, normalized.data)) {
        return {
          ok: false,
          errorCode: "INVALID_TOOL_OUTPUT",
          errorMessage: `Output validation failed for tool "${tool.name}"`,
        };
      }

      return normalized;
    } catch (error) {
      return normalizeFailure(error, "TOOL_RUNTIME_ERROR", tool.name);
    }
  }
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
        typeof result.errorCode === "string" ? result.errorCode : "TOOL_EXECUTION_FAILED",
      errorMessage:
        typeof result.errorMessage === "string"
          ? result.errorMessage
          : "Tool execution failed",
      metadata: isRecord(result.metadata) ? result.metadata : undefined,
    };
  }

  if (isRecord(result) && Object.prototype.hasOwnProperty.call(result, "error")) {
    return normalizeFailure(result.error, "TOOL_EXECUTION_FAILED");
  }

  return {
    ok: true,
    data: result,
  };
}

function normalizeFailure(
  error: unknown,
  fallbackCode: string,
  toolName?: string,
): ToolExecutionResult {
  if (isRecord(error)) {
    return {
      ok: false,
      errorCode: typeof error.code === "string" ? error.code : fallbackCode,
      errorMessage:
        typeof error.message === "string"
          ? error.message
          : `Tool execution failed${toolName ? ` for "${toolName}"` : ""}`,
      metadata: { details: error },
    };
  }

  if (error instanceof Error) {
    return {
      ok: false,
      errorCode: fallbackCode,
      errorMessage:
        error.message || `Tool execution failed${toolName ? ` for "${toolName}"` : ""}`,
      metadata: { details: { name: error.name } },
    };
  }

  return {
    ok: false,
    errorCode: fallbackCode,
    errorMessage: `Tool execution failed${toolName ? ` for "${toolName}"` : ""}`,
    metadata: { details: { raw: error } },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
