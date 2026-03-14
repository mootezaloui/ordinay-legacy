import type { ILLMProvider, LLMMessage, LLMToolCall } from "../llm";
import {
  buildContext,
  generateSummary,
  type Session,
  type SessionPersistenceBridge,
} from "../session";
import {
  LoopGuard,
  PermissionGate,
  validateAssistantOutput,
  validateToolExecutionResultShape,
} from "../safety";
import {
  ToolCategory,
  type ToolExecutionContext,
  type ToolExecutionResult,
  type ToolRegistry,
} from "../tools";
import type {
  AgentTurnInput,
  AgentTurnOutput,
  AuditRecord,
  PendingAction,
  ToolCallRecord,
  TurnType,
} from "../types";
import { TurnType as TurnTypeEnum } from "../types";
import { PendingManager } from "./pending.manager";
import { ToolExecutor } from "./tool.executor";
import { TurnClassifier } from "./turn.classifier";

interface LoopStats {
  iterations: number;
  toolCalls: number;
}

interface ToolCallProcessingContext {
  input: AgentTurnInput;
  session: Session;
  turnType: TurnType;
  messages: LLMMessage[];
  toolCalls: ToolCallRecord[];
  audit: AuditRecord[];
  warnings: string[];
  stats: LoopStats;
}

interface ToolCallProcessingResult {
  stopForConfirmation: boolean;
  confirmationMessage?: string;
  replacedPendingActionId?: string;
}

export interface AgentMemoryServices {
  contextAssembler?: {
    build(session: Session, input: AgentTurnInput): LLMMessage[];
  };
  entityTracker?: {
    trackFromToolResult(
      session: Session,
      result: ToolExecutionResult,
      toolName: string,
      turnId: string,
    ): unknown;
    pruneUnusedEntities(session: Session, currentTurnId: string): unknown;
  };
  summarizer?: {
    maybeUpdateSummary(session: Session): Promise<boolean | void>;
  };
  retrieval?: {
    isEnabled?: () => boolean;
    indexSessionArtifacts?: (session: Session) => unknown;
    indexTurnArtifacts?: (session: Session, turn: Session["turns"][number]) => unknown;
  };
}

export class AgenticLoop {
  constructor(
    private readonly llm: ILLMProvider,
    private readonly registry: ToolRegistry,
    private readonly executor: ToolExecutor,
    private readonly classifier: TurnClassifier,
    private readonly pending: PendingManager,
    private readonly permissionGate: PermissionGate,
    private readonly loopGuard: LoopGuard,
    private readonly persistence?: SessionPersistenceBridge,
    private readonly memory?: AgentMemoryServices,
  ) {}

  async run(input: AgentTurnInput, session: Session): Promise<AgentTurnOutput> {
    const startedAt = new Date().toISOString();
    const historyStartIndex = session.history.length;
    session.mode = input.mode;
    const turnType = this.classifier.classify(input, session);
    session.state.lastTurnType = turnType;

    const toolCalls: ToolCallRecord[] = [];
    const audit: AuditRecord[] = [];
    const warnings: string[] = [];
    const stats: LoopStats = { iterations: 0, toolCalls: 0 };

    let output: AgentTurnOutput;
    switch (turnType) {
      case TurnTypeEnum.CONFIRMATION:
        output = await this.handleConfirmationTurn(
          input,
          session,
          toolCalls,
          audit,
          warnings,
          stats,
        );
        break;
      case TurnTypeEnum.REJECTION:
        output = this.handleRejectionTurn(input, session, toolCalls, audit, warnings, stats);
        break;
      case TurnTypeEnum.NEW:
      case TurnTypeEnum.AMENDMENT:
      default:
        output = await this.handleReasoningTurn(
          input,
          session,
          turnType,
          toolCalls,
          audit,
          warnings,
          stats,
        );
        break;
    }

    this.persistTurnArtifacts(input, session, output, startedAt, historyStartIndex);
    return output;
  }

  private async handleConfirmationTurn(
    input: AgentTurnInput,
    session: Session,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
  ): Promise<AgentTurnOutput> {
    const action = this.pending.confirmPending(session);
    const metadata: Record<string, unknown> = { confirmedAction: action, loopStats: stats };

    this.appendTurn(session, "user", input.message, TurnTypeEnum.CONFIRMATION);

    const tool = this.registry.get(action.toolName);
    if (!tool) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "TOOL_NOT_FOUND",
        errorMessage: `Tool "${action.toolName}" is not registered`,
      };
      metadata.confirmedExecutionResult = result;
      const responseText = result.errorMessage!;
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_tool_missing", {
        actionId: action.id,
        toolName: action.toolName,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const decision = this.permissionGate.evaluate(session.mode, tool);
    if (!decision.allowed) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "TOOL_PERMISSION_DENIED",
        errorMessage: decision.reason ?? "Tool is not allowed.",
      };
      metadata.confirmedExecutionResult = result;
      const responseText = `I cannot execute the confirmed action: ${result.errorMessage}.`;
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_denied", {
        actionId: action.id,
        toolName: action.toolName,
        reason: result.errorMessage,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    if (this.isWritesExecutionBlockedBySafeMode()) {
      const result: ToolExecutionResult = {
        ok: false,
        errorCode: "SAFE_MODE_WRITES_DISABLED",
        errorMessage: "Confirmed write execution is disabled by safe mode.",
      };
      metadata.confirmedExecutionResult = result;
      const context = this.createExecutionContext(input, session);
      const record = this.createToolRecord(
        action.toolName,
        action.args,
        context,
        result,
        { blockedBySafeMode: true, confirmedActionId: action.id },
      );
      toolCalls.push(record);
      stats.toolCalls += 1;

      const responseText = "Confirmed action blocked: write execution is disabled by safe mode.";
      this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
      this.pushAudit(audit, input, "pending_confirmed_blocked_safe_mode", {
        actionId: action.id,
        toolName: action.toolName,
      });
      this.collectAssistantWarnings(responseText, warnings);
      this.touchSession(session, TurnTypeEnum.CONFIRMATION);
      return this.buildOutput(
        input,
        session,
        TurnTypeEnum.CONFIRMATION,
        responseText,
        toolCalls,
        audit,
        metadata,
        warnings,
      );
    }

    const context = this.createExecutionContext(input, session);
    const result = await this.executor.execute(tool, context, action.args);
    metadata.confirmedExecutionResult = result;
    this.collectToolWarnings(result, warnings);

    const record = this.createToolRecord(
      action.toolName,
      action.args,
      context,
      result,
      { confirmedActionId: action.id },
    );
    toolCalls.push(record);
    stats.toolCalls += 1;

    this.appendTurn(
      session,
      "tool",
      this.serializeToolMessage(action.toolName, result),
      TurnTypeEnum.CONFIRMATION,
      [record],
    );

    const responseText = result.ok
      ? "Confirmed action executed successfully."
      : `Confirmed action failed: ${result.errorMessage ?? "Unknown error."}`;
    this.appendTurn(session, "assistant", responseText, TurnTypeEnum.CONFIRMATION);
    this.pushAudit(audit, input, "pending_confirmed_executed", {
      actionId: action.id,
      toolName: action.toolName,
      ok: result.ok,
      errorCode: result.errorCode,
    });
    this.collectAssistantWarnings(responseText, warnings);

    this.touchSession(session, TurnTypeEnum.CONFIRMATION);
    return this.buildOutput(
      input,
      session,
      TurnTypeEnum.CONFIRMATION,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private handleRejectionTurn(
    input: AgentTurnInput,
    session: Session,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
  ): AgentTurnOutput {
    const rejectedAction = this.pending.rejectPending(session);
    const metadata: Record<string, unknown> = {
      rejectedActionId: rejectedAction.id,
      loopStats: stats,
    };

    this.appendTurn(session, "user", input.message, TurnTypeEnum.REJECTION);
    const responseText = "Understood. I canceled the pending action.";
    this.appendTurn(session, "assistant", responseText, TurnTypeEnum.REJECTION);
    this.pushAudit(audit, input, "pending_rejected", { actionId: rejectedAction.id });
    this.collectAssistantWarnings(responseText, warnings);

    this.touchSession(session, TurnTypeEnum.REJECTION);
    return this.buildOutput(
      input,
      session,
      TurnTypeEnum.REJECTION,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private async handleReasoningTurn(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    warnings: string[],
    stats: LoopStats,
  ): Promise<AgentTurnOutput> {
    const metadata: Record<string, unknown> = { loopStats: stats };
    const messages = this.buildInitialMessages(input, session, turnType);

    this.appendTurn(session, "user", input.message, turnType);
    this.pushAudit(audit, input, "user_turn", { turnType, message: input.message });

    const llmTools = this.llm.supportsTools()
      ? this.registry.list().map((tool) => this.toLLMToolSchema(tool))
      : undefined;

    let responseText = "";
    let iteration = 0;

    while (!responseText) {
      iteration += 1;
      stats.iterations = iteration;
      this.loopGuard.assertIteration(iteration);

      const response = await this.loopGuard.wrapTimeout(
        this.llm.generate({
          messages,
          tools: llmTools,
          metadata: { sessionId: input.sessionId, turnId: input.turnId, iteration },
        }),
      );

      messages.push({ role: "assistant", content: response.text ?? "" });

      if (response.toolCalls.length === 0) {
        responseText = (response.text ?? "").trim() || "I completed your request.";
        break;
      }

      const processed = await this.processToolCalls(response.toolCalls, {
        input,
        session,
        turnType,
        messages,
        toolCalls,
        audit,
        warnings,
        stats,
      });

      if (processed.stopForConfirmation) {
        responseText = processed.confirmationMessage ?? "I prepared a pending action.";
        if (processed.replacedPendingActionId) {
          metadata.replacedPendingActionId = processed.replacedPendingActionId;
        }
      }
    }

    this.appendTurn(session, "assistant", responseText, turnType);
    this.pushAudit(audit, input, "assistant_response", {
      toolCallsCount: toolCalls.length,
      responseText,
    });
    this.collectAssistantWarnings(responseText, warnings);

    this.touchSession(session, turnType);
    return this.buildOutput(
      input,
      session,
      turnType,
      responseText,
      toolCalls,
      audit,
      metadata,
      warnings,
    );
  }

  private async processToolCalls(
    llmToolCalls: LLMToolCall[],
    context: ToolCallProcessingContext,
  ): Promise<ToolCallProcessingResult> {
    for (const llmToolCall of llmToolCalls) {
      context.stats.toolCalls += 1;
      const toolName = llmToolCall.name;
      const args = this.normalizeArgs(llmToolCall.arguments);
      const callId = llmToolCall.id || this.createId("tool_call");

      const tool = this.registry.get(toolName);
      if (!tool) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_NOT_FOUND",
          errorMessage: `Tool "${toolName}" is not registered`,
        };
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_failed", {
          toolName,
          errorCode: result.errorCode,
        });
        continue;
      }

      const decision = this.permissionGate.evaluate(context.session.mode, tool);
      const boundaryFailure = this.validatePermissionBoundary(
        context.input,
        context.session,
        tool.category,
        decision,
        toolName,
      );
      if (boundaryFailure) {
        const record = this.createToolRecord(
          toolName,
          args,
          this.createExecutionContext(context.input, context.session),
          boundaryFailure,
        );
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, boundaryFailure),
        });
        this.pushAudit(context.audit, context.input, "tool_call_security_blocked", {
          toolName,
          errorCode: boundaryFailure.errorCode,
          reason: boundaryFailure.errorMessage,
        });
        continue;
      }
      if (!decision.allowed) {
        const result: ToolExecutionResult = {
          ok: false,
          errorCode: "TOOL_PERMISSION_DENIED",
          errorMessage: decision.reason ?? "Tool is not allowed.",
        };
        const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), result);
        record.id = callId;
        context.toolCalls.push(record);
        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, result),
        });
        this.pushAudit(context.audit, context.input, "tool_call_denied", {
          toolName,
          reason: result.errorMessage,
        });
        continue;
      }

      if (tool.category === ToolCategory.WRITE || tool.category === ToolCategory.EXECUTE) {
        const previousPending = context.session.state.pendingAction;
        const replacedPendingActionId =
          context.turnType === TurnTypeEnum.AMENDMENT && previousPending
            ? previousPending.id
            : undefined;

        const pendingAction = this.createPendingAction(toolName, args, context.input, tool.category);
        this.pending.setPending(context.session, pendingAction);

        const interceptedResult: ToolExecutionResult = {
          ok: true,
          data: {
            status: "pending_confirmation",
            pendingActionId: pendingAction.id,
            tool: toolName,
          },
          metadata: {
            intercepted: true,
            ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
          },
        };

        const record = this.createToolRecord(
          toolName,
          args,
          this.createExecutionContext(context.input, context.session),
          interceptedResult,
          {
            intercepted: true,
            ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
          },
        );
        record.id = callId;
        context.toolCalls.push(record);

        context.messages.push({
          role: "tool",
          name: toolName,
          toolCallId: callId,
          content: this.serializeToolMessage(toolName, interceptedResult),
        });

        this.pushAudit(context.audit, context.input, "pending_action_created", {
          pendingActionId: pendingAction.id,
          toolName,
          replacedPendingActionId,
        });

        return {
          stopForConfirmation: true,
          confirmationMessage: this.buildConfirmationMessage(pendingAction),
          replacedPendingActionId,
        };
      }

      const executionContext = this.createExecutionContext(context.input, context.session);
      const result = await this.executor.execute(tool, executionContext, args);
      this.collectToolWarnings(result, context.warnings);
      if (result.ok) {
        this.trackToolEntities(context.session, result, toolName, context.input.turnId);
      }

      const record = this.createToolRecord(toolName, args, executionContext, result);
      record.id = callId;
      context.toolCalls.push(record);
      context.messages.push({
        role: "tool",
        name: toolName,
        toolCallId: callId,
        content: this.serializeToolMessage(toolName, result),
      });

      this.appendTurn(
        context.session,
        "tool",
        this.serializeToolMessage(toolName, result),
        context.turnType,
        [record],
      );

      this.pushAudit(context.audit, context.input, "tool_call_processed", {
        toolName,
        ok: result.ok,
        errorCode: result.errorCode,
      });
    }

    return { stopForConfirmation: false };
  }

  private buildInitialMessages(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
  ): LLMMessage[] {
    if (this.memory?.contextAssembler?.build) {
      try {
        const built = this.memory.contextAssembler.build(session, input);
        const normalized = this.normalizeMemoryMessages(built, input.message);
        if (normalized.length > 0) {
          return normalized;
        }
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown context assembler error");
        console.warn(`[agent.memory] context assembly fallback: ${message}`);
      }
    }

    const context = buildContext(session);
    const messages: LLMMessage[] = [];

    if (context.summary) {
      messages.push({
        role: "system",
        content: `Conversation summary:\n${context.summary}`,
      });
    }

    for (const turn of context.lastTurns) {
      messages.push({
        role: turn.role,
        content: turn.message,
      });
    }

    if (turnType === TurnTypeEnum.AMENDMENT && context.pendingAction) {
      messages.push({
        role: "system",
        content: [
          "There is a pending action awaiting confirmation.",
          JSON.stringify(context.pendingAction, null, 2),
          "User requested an amendment. Update the same tool proposal with revised args.",
        ].join("\n"),
      });
    }

    messages.push({ role: "user", content: input.message });
    return messages;
  }

  private createPendingAction(
    toolName: string,
    args: Record<string, unknown>,
    input: AgentTurnInput,
    category: ToolCategory,
  ): PendingAction {
    return {
      id: this.createId("pending"),
      toolName,
      summary: `${toolName}(${this.safeJsonStringify(args)})`,
      args,
      createdAt: new Date().toISOString(),
      requestedByTurnId: input.turnId,
      risk: this.mapRisk(category),
    };
  }

  private mapRisk(category: ToolCategory): "low" | "medium" | "high" {
    switch (category) {
      case ToolCategory.READ:
        return "low";
      case ToolCategory.WRITE:
      case ToolCategory.EXECUTE:
        return "high";
      case ToolCategory.PLAN:
      case ToolCategory.EXTERNAL:
      default:
        return "medium";
    }
  }

  private buildConfirmationMessage(action: PendingAction): string {
    return [
      "I prepared a pending action and did not execute it.",
      `Proposed operation: ${action.summary}`,
      "Please confirm to execute or reject to cancel.",
    ].join("\n");
  }

  private createExecutionContext(
    input: AgentTurnInput,
    session: Session,
  ): ToolExecutionContext {
    return {
      sessionId: session.id,
      turnId: input.turnId,
      mode: session.mode,
      userId: input.userId ?? session.userId,
      metadata: input.metadata,
    };
  }

  private validatePermissionBoundary(
    input: AgentTurnInput,
    session: Session,
    toolCategory: ToolCategory,
    permissionDecision: { allowed: boolean; requiresConfirmation: boolean },
    toolName: string,
  ): ToolExecutionResult | null {
    const runtime = this as AgenticLoop & {
      __security?: {
        validatePermissionBoundary?: (params: Record<string, unknown>) => unknown;
      };
    };
    const security = runtime.__security;
    if (!security || typeof security.validatePermissionBoundary !== "function") {
      return null;
    }

    const securityMetadata = isRecord(input.metadata?.security)
      ? input.metadata.security
      : undefined;
    const authScope =
      securityMetadata && typeof securityMetadata.authScope === "string"
        ? securityMetadata.authScope
        : "unknown";
    this.maybeLogBoundaryCheck({
      mode: session.mode,
      authScope,
      toolCategory,
      allowed: permissionDecision.allowed,
      requiresConfirmation: permissionDecision.requiresConfirmation,
      stage: "evaluate",
    });

    let validation: unknown;
    try {
      validation = security.validatePermissionBoundary({
        mode: session.mode,
        authScope,
        toolCategory,
        permissionDecision,
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Permission boundary validation failed.";
      this.maybeLogBoundaryCheck({
        mode: session.mode,
        authScope,
        toolCategory,
        allowed: permissionDecision.allowed,
        requiresConfirmation: permissionDecision.requiresConfirmation,
        stage: "error",
        reason,
      });
      return {
        ok: false,
        errorCode: "SECURITY_PERMISSION_BOUNDARY_VIOLATION",
        errorMessage: reason,
      };
    }

    const row = isRecord(validation) ? validation : null;
    if (row?.valid === true) {
      return null;
    }

    const reason =
      typeof row?.reason === "string" && row.reason.trim().length > 0
        ? row.reason
        : `Permission boundary validation failed for tool "${toolName}".`;
    this.maybeLogBoundaryCheck({
      mode: session.mode,
      authScope,
      toolCategory,
      allowed: permissionDecision.allowed,
      requiresConfirmation: permissionDecision.requiresConfirmation,
      stage: "denied",
      reason,
    });

    return {
      ok: false,
      errorCode: "SECURITY_PERMISSION_BOUNDARY_VIOLATION",
      errorMessage: reason,
    };
  }

  private isWritesExecutionBlockedBySafeMode(): boolean {
    const operations = this.getOperationsRuntime();
    return Boolean(
      operations &&
      operations.safeMode &&
      typeof operations.safeMode.isWritesDisabled === "function" &&
      operations.safeMode.isWritesDisabled() === true,
    );
  }

  private isSummarizationDisabledBySafeMode(): boolean {
    const operations = this.getOperationsRuntime();
    return Boolean(
      operations &&
      operations.safeMode &&
      typeof operations.safeMode.isSummarizationDisabled === "function" &&
      operations.safeMode.isSummarizationDisabled() === true,
    );
  }

  private maybeLogBoundaryCheck(payload: Record<string, unknown>): void {
    const operations = this.getOperationsRuntime();
    const shouldLog =
      operations &&
      operations.debugFlags &&
      typeof operations.debugFlags.shouldLogToolBoundaryChecks === "function" &&
      operations.debugFlags.shouldLogToolBoundaryChecks() === true;
    if (shouldLog) {
      console.info("[agent.operations] tool boundary check", payload);
    }
  }

  private getOperationsRuntime(): {
    safeMode?: {
      isWritesDisabled?: () => boolean;
      isRetrievalDisabled?: () => boolean;
      isSummarizationDisabled?: () => boolean;
    };
    debugFlags?: {
      shouldLogToolBoundaryChecks?: () => boolean;
      shouldLogVerboseTurnTrace?: () => boolean;
    };
  } | null {
    const runtime = this as AgenticLoop & { __operations?: unknown };
    if (!runtime.__operations || typeof runtime.__operations !== "object") {
      return null;
    }
    return runtime.__operations as {
      safeMode?: {
        isWritesDisabled?: () => boolean;
        isRetrievalDisabled?: () => boolean;
        isSummarizationDisabled?: () => boolean;
      };
      debugFlags?: {
        shouldLogToolBoundaryChecks?: () => boolean;
        shouldLogVerboseTurnTrace?: () => boolean;
      };
    };
  }

  private createToolRecord(
    toolName: string,
    args: Record<string, unknown>,
    context: ToolExecutionContext,
    result: ToolExecutionResult,
    metadata?: Record<string, unknown>,
  ): ToolCallRecord {
    return {
      id: this.createId("tool_record"),
      toolName,
      args,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      ok: result.ok,
      errorCode: result.errorCode,
      metadata: metadata ?? result.metadata ?? { turnId: context.turnId },
    };
  }

  private appendTurn(
    session: Session,
    role: "system" | "user" | "assistant" | "tool",
    message: string,
    turnType: TurnType,
    toolCalls?: ToolCallRecord[],
  ): void {
    const createdAt = new Date().toISOString();
    const turnId = this.createId("turn");
    session.turns.push({
      id: turnId,
      role,
      turnType,
      message,
      createdAt,
      toolCalls: toolCalls && toolCalls.length > 0 ? [...toolCalls] : undefined,
    });
    session.history.push({
      turnId,
      role,
      summary: this.truncate(message, 240),
      createdAt,
    });
  }

  private collectAssistantWarnings(text: string, warnings: string[]): void {
    warnings.push(...validateAssistantOutput(text).warnings);
  }

  private collectToolWarnings(result: ToolExecutionResult, warnings: string[]): void {
    warnings.push(...validateToolExecutionResultShape(result).warnings);
  }

  private pushAudit(
    audit: AuditRecord[],
    input: AgentTurnInput,
    eventType: string,
    data: Record<string, unknown>,
  ): void {
    audit.push({
      id: this.createId("audit"),
      sessionId: input.sessionId,
      turnId: input.turnId,
      eventType,
      timestamp: new Date().toISOString(),
      data,
    });
  }

  private buildOutput(
    input: AgentTurnInput,
    session: Session,
    turnType: TurnType,
    responseText: string,
    toolCalls: ToolCallRecord[],
    audit: AuditRecord[],
    metadata: Record<string, unknown>,
    warnings: string[],
  ): AgentTurnOutput {
    return {
      sessionId: session.id,
      turnId: input.turnId,
      turnType,
      responseText,
      pendingAction: session.state.pendingAction,
      toolCalls,
      audit,
      metadata: {
        ...metadata,
        ...(warnings.length > 0 ? { outputWarnings: [...new Set(warnings)] } : {}),
      },
    };
  }

  private touchSession(session: Session, turnType: TurnType): void {
    if (!this.memory && typeof session.summary === "string") {
      session.summary = generateSummary(session);
    }
    session.state.lastTurnType = turnType;
    session.updatedAt = new Date().toISOString();
  }

  private toLLMToolSchema(tool: {
    name: string;
    description: string;
    inputSchema?: Record<string, unknown>;
  }): Record<string, unknown> {
    return {
      type: "function",
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.inputSchema ?? { type: "object", properties: {} },
      },
    };
  }

  private normalizeArgs(args: unknown): Record<string, unknown> {
    if (isRecord(args)) {
      return args;
    }
    return {};
  }

  private normalizeMemoryMessages(
    messages: unknown,
    fallbackUserMessage: string,
  ): LLMMessage[] {
    if (!Array.isArray(messages)) {
      return [{ role: "user", content: fallbackUserMessage }];
    }

    const normalized: LLMMessage[] = [];
    for (const row of messages) {
      if (!isRecord(row)) {
        continue;
      }
      const role = this.asLLMRole(row.role);
      if (!role) {
        continue;
      }
      const content = String(row.content || "").trim();
      if (!content) {
        continue;
      }
      normalized.push({ role, content });
    }

    const hasUserTail = normalized.length > 0 && normalized[normalized.length - 1]?.role === "user";
    if (!hasUserTail) {
      normalized.push({ role: "user", content: fallbackUserMessage });
    }
    return normalized;
  }

  private asLLMRole(value: unknown): LLMMessage["role"] | null {
    const normalized = String(value || "").trim().toLowerCase();
    if (
      normalized === "system" ||
      normalized === "user" ||
      normalized === "assistant" ||
      normalized === "tool"
    ) {
      return normalized;
    }
    return null;
  }

  private trackToolEntities(
    session: Session,
    result: ToolExecutionResult,
    toolName: string,
    turnId: string,
  ): void {
    if (!this.memory?.entityTracker?.trackFromToolResult) {
      return;
    }

    try {
      this.memory.entityTracker.trackFromToolResult(session, result, toolName, turnId);
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown entity tracking error");
      console.warn(`[agent.memory] entity tracking skipped: ${message}`);
    }
  }

  private serializeToolMessage(toolName: string, result: ToolExecutionResult): string {
    return this.safeJsonStringify({ tool: toolName, result });
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return value.slice(0, maxLength - 3).trimEnd() + "...";
  }

  private createId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }

  private safeJsonStringify(value: unknown): string {
    try {
      return JSON.stringify(value);
    } catch {
      return JSON.stringify({ error: "Unable to serialize payload" });
    }
  }

  private persistTurnArtifacts(
    input: AgentTurnInput,
    session: Session,
    output: AgentTurnOutput,
    startedAt: string,
    historyStartIndex: number,
  ): void {
    const persistence = this.persistence;

    Promise.resolve()
      .then(async () => {
        const newHistory = session.history.slice(historyStartIndex);

        if (persistence && typeof persistence.saveTurnSnapshot === "function") {
          await persistence.saveTurnSnapshot(
            session.id,
            input.turnId,
            input as unknown as Record<string, unknown>,
            output as unknown as Record<string, unknown>,
            startedAt,
            new Date().toISOString(),
          );
        }

        if (persistence && typeof persistence.appendHistory === "function") {
          for (const entry of newHistory) {
            const toolName = this.inferToolNameForHistory(session, entry.turnId);
            await persistence.appendHistory(session.id, {
              turnId: entry.turnId,
              role: entry.role,
              summary: entry.summary,
              createdAt: entry.createdAt,
            }, toolName);
          }
        }

        if (persistence && typeof persistence.appendAudit === "function") {
          for (const record of output.audit ?? []) {
            await persistence.appendAudit(record);
          }
        }

        await this.runMemoryMaintenance(
          session,
          input.turnId,
          newHistory.map((entry) => entry.turnId),
        );

        if (!persistence) {
          return;
        }

        if (output.pendingAction) {
          await persistence.setPendingAction(session.id, output.pendingAction);
        } else {
          await persistence.clearPendingAction(session.id);
        }

        await persistence.saveSession(session);
      })
      .catch((error) => {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown persistence error");
        console.warn(`[agent.persistence] post-turn persistence failed: ${message}`);
      });
  }

  private async runMemoryMaintenance(
    session: Session,
    turnId: string,
    newTurnIds: string[] = [],
  ): Promise<void> {
    if (!this.memory) {
      return;
    }

    if (this.isSummarizationDisabledBySafeMode()) {
      const operations = this.getOperationsRuntime();
      const shouldLog =
        operations?.debugFlags &&
        typeof operations.debugFlags.shouldLogVerboseTurnTrace === "function" &&
        operations.debugFlags.shouldLogVerboseTurnTrace() === true;
      if (shouldLog) {
        console.info("[agent.operations] summary update skipped by safe mode");
      }
    } else if (this.memory.summarizer?.maybeUpdateSummary) {
      try {
        await this.memory.summarizer.maybeUpdateSummary(session);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown summarizer error");
        console.warn(`[agent.memory] summary update skipped: ${message}`);
      }
    }

    if (this.memory.entityTracker?.pruneUnusedEntities) {
      try {
        this.memory.entityTracker.pruneUnusedEntities(session, turnId);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown entity prune error");
        console.warn(`[agent.memory] entity prune skipped: ${message}`);
      }
    }

    const retrieval = this.memory.retrieval;
    if (!retrieval || retrieval.isEnabled?.() === false) {
      return;
    }
    const operations = this.getOperationsRuntime();
    const retrievalDisabledBySafeMode =
      operations?.safeMode &&
      typeof operations.safeMode.isRetrievalDisabled === "function" &&
      operations.safeMode.isRetrievalDisabled() === true;
    if (retrievalDisabledBySafeMode) {
      return;
    }

    if (typeof retrieval.indexSessionArtifacts === "function") {
      try {
        retrieval.indexSessionArtifacts(session);
      } catch (error) {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown retrieval indexing error");
        console.warn(`[agent.retrieval] session indexing skipped: ${message}`);
      }
    }

    if (typeof retrieval.indexTurnArtifacts === "function") {
      const targets = newTurnIds.length > 0 ? newTurnIds : [turnId];
      for (const targetTurnId of targets) {
        const turn = session.turns.find((row) => row.id === targetTurnId);
        if (!turn) {
          continue;
        }
        try {
          retrieval.indexTurnArtifacts(session, turn);
        } catch (error) {
          const message =
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error || "unknown retrieval turn indexing error");
          console.warn(`[agent.retrieval] turn indexing skipped: ${message}`);
        }
      }
    }
  }

  private inferToolNameForHistory(
    session: Session,
    turnId: string,
  ): string | undefined {
    const turn = session.turns.find((row) => row.id === turnId);
    if (!turn || turn.role !== "tool") {
      return undefined;
    }

    if (Array.isArray(turn.toolCalls) && turn.toolCalls.length > 0) {
      const toolName = turn.toolCalls[0]?.toolName;
      if (typeof toolName === "string" && toolName.trim().length > 0) {
        return toolName;
      }
    }

    try {
      const parsed = JSON.parse(turn.message);
      if (isRecord(parsed) && typeof parsed.tool === "string" && parsed.tool.trim().length > 0) {
        return parsed.tool;
      }
    } catch {
      return undefined;
    }

    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
