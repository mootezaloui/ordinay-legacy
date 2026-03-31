import type { SessionID } from "../types";

export enum ToolCategory {
  READ = "READ",
  WRITE = "WRITE",
  DRAFT = "DRAFT",
  PLAN = "PLAN",
  EXECUTE = "EXECUTE",
  EXTERNAL = "EXTERNAL",
  SYSTEM = "SYSTEM",
}

export interface ToolExecutionContext {
  sessionId: SessionID;
  turnId: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface ToolExecutionResult {
  ok: boolean;
  data?: unknown;
  errorCode?: string;
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

export type ToolHandler = (
  context: ToolExecutionContext,
  args: Record<string, unknown>,
) => Promise<ToolExecutionResult>;

export interface ToolDefinition {
  name: string;
  category: ToolCategory;
  description: string;
  inputSchema?: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  sideEffects?: boolean;
  handler: ToolHandler;
}
