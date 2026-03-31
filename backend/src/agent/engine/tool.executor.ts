import type { PermissionGate } from "../safety";
import { ToolCategory, validateToolInput, validateToolOutput } from "../tools";
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
    const startedAt = Date.now();
    let result: ToolExecutionResult;

    if (this.permissionGate) {
      const decision = this.permissionGate.evaluate(
        { authScope: resolveAuthScope(context) },
        tool,
      );
      if (!decision.allowed) {
        result = {
          ok: false,
          errorCode: "TOOL_PERMISSION_DENIED",
          errorMessage: decision.reason ?? "Tool is not allowed.",
        };
        return this.finalizeExecution(tool, args, result, startedAt);
      }
    }

    if (!validateToolInput(tool.inputSchema, args)) {
      result = {
        ok: false,
        errorCode: "INVALID_TOOL_INPUT",
        errorMessage: `Input validation failed for tool "${tool.name}"`,
      };
      return this.finalizeExecution(tool, args, result, startedAt);
    }

    try {
      const rawResult = await tool.handler(context, args);
      const normalized = normalizeToolResult(rawResult);

      if (!normalized.ok) {
        result = normalized;
        return this.finalizeExecution(tool, args, result, startedAt);
      }

      if (!validateToolOutput(tool.outputSchema, normalized.data)) {
        result = {
          ok: false,
          errorCode: "INVALID_TOOL_OUTPUT",
          errorMessage: `Output validation failed for tool "${tool.name}"`,
        };
        return this.finalizeExecution(tool, args, result, startedAt);
      }

      result = normalized;
      return this.finalizeExecution(tool, args, result, startedAt);
    } catch (error) {
      result = normalizeFailure(error, "TOOL_RUNTIME_ERROR", tool.name);
      return this.finalizeExecution(tool, args, result, startedAt);
    }
  }

  private finalizeExecution(
    tool: ToolDefinition,
    args: Record<string, unknown>,
    result: ToolExecutionResult,
    startedAt: number,
  ): ToolExecutionResult {
    if (tool.category === ToolCategory.READ) {
      this.logReadToolCall(tool.name, args, result, Date.now() - startedAt);
    }
    if (tool.category === ToolCategory.DRAFT) {
      this.logDraftToolCall(tool.name, result, Date.now() - startedAt);
    }
    return result;
  }

  private logReadToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: ToolExecutionResult,
    executionMs: number,
  ): void {
    const resultCount = estimateResultCount(result);
    const payload = {
      tool: toolName,
      args,
      result_count: resultCount,
      execution_ms: executionMs,
    };

    console.info("[READ_TOOL_CALL]", safeStringify(payload));
    if (resultCount === 0) {
      console.warn(
        "[READ_EMPTY_RESULT]",
        safeStringify({
          tool: toolName,
          args,
        }),
      );
    }
  }

  private logDraftToolCall(
    toolName: string,
    result: ToolExecutionResult,
    executionMs: number,
  ): void {
    const draftType =
      isRecord(result.data) && isRecord((result.data as Record<string, unknown>).artifact)
        ? ((result.data as Record<string, unknown>).artifact as Record<string, unknown>).draftType
        : "unknown";
    console.info(
      "[DRAFT_TOOL_CALL]",
      safeStringify({ tool: toolName, draftType, ok: result.ok, execution_ms: executionMs }),
    );
  }
}

function resolveAuthScope(context: ToolExecutionContext): string {
  if (!isRecord(context.metadata)) {
    return "unknown";
  }
  const security = isRecord(context.metadata.security) ? context.metadata.security : null;
  return (
    security && typeof security.authScope === "string"
      ? String(security.authScope).trim()
      : "unknown"
  ) || "unknown";
}

function estimateResultCount(result: ToolExecutionResult): number {
  if (!result.ok) {
    return 0;
  }

  const data = result.data;
  if (Array.isArray(data)) {
    return data.length;
  }

  if (isRecord(data)) {
    if (typeof data.count === "number" && Number.isFinite(data.count) && data.count >= 0) {
      return Math.floor(data.count);
    }

    const values = Object.values(data);
    const arrays = values.filter((value) => Array.isArray(value));
    if (arrays.length > 0) {
      return arrays.reduce((total, value) => total + (value as unknown[]).length, 0);
    }

    const nestedObjects = values.filter((value) => isRecord(value));
    if (nestedObjects.length > 0) {
      return nestedObjects.length;
    }

    return Object.keys(data).length > 0 ? 1 : 0;
  }

  return data === null || data === undefined ? 0 : 1;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Unable to serialize diagnostic payload" });
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
