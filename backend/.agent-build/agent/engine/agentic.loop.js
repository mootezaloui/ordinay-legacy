"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgenticLoop = void 0;
const session_1 = require("../session");
const safety_1 = require("../safety");
const tools_1 = require("../tools");
const types_1 = require("../types");
class AgenticLoop {
    llm;
    registry;
    executor;
    classifier;
    pending;
    permissionGate;
    loopGuard;
    persistence;
    memory;
    constructor(llm, registry, executor, classifier, pending, permissionGate, loopGuard, persistence, memory) {
        this.llm = llm;
        this.registry = registry;
        this.executor = executor;
        this.classifier = classifier;
        this.pending = pending;
        this.permissionGate = permissionGate;
        this.loopGuard = loopGuard;
        this.persistence = persistence;
        this.memory = memory;
    }
    async run(input, session) {
        const startedAt = new Date().toISOString();
        const historyStartIndex = session.history.length;
        session.mode = input.mode;
        const turnType = this.classifier.classify(input, session);
        session.state.lastTurnType = turnType;
        const toolCalls = [];
        const audit = [];
        const warnings = [];
        const stats = { iterations: 0, toolCalls: 0 };
        let output;
        switch (turnType) {
            case types_1.TurnType.CONFIRMATION:
                output = await this.handleConfirmationTurn(input, session, toolCalls, audit, warnings, stats);
                break;
            case types_1.TurnType.REJECTION:
                output = this.handleRejectionTurn(input, session, toolCalls, audit, warnings, stats);
                break;
            case types_1.TurnType.NEW:
            case types_1.TurnType.AMENDMENT:
            default:
                output = await this.handleReasoningTurn(input, session, turnType, toolCalls, audit, warnings, stats);
                break;
        }
        this.persistTurnArtifacts(input, session, output, startedAt, historyStartIndex);
        return output;
    }
    async handleConfirmationTurn(input, session, toolCalls, audit, warnings, stats) {
        const action = this.pending.confirmPending(session);
        const metadata = { confirmedAction: action, loopStats: stats };
        this.appendTurn(session, "user", input.message, types_1.TurnType.CONFIRMATION);
        const tool = this.registry.get(action.toolName);
        if (!tool) {
            const result = {
                ok: false,
                errorCode: "TOOL_NOT_FOUND",
                errorMessage: `Tool "${action.toolName}" is not registered`,
            };
            metadata.confirmedExecutionResult = result;
            const responseText = result.errorMessage;
            this.appendTurn(session, "assistant", responseText, types_1.TurnType.CONFIRMATION);
            this.pushAudit(audit, input, "pending_confirmed_tool_missing", {
                actionId: action.id,
                toolName: action.toolName,
            });
            this.collectAssistantWarnings(responseText, warnings);
            this.touchSession(session, types_1.TurnType.CONFIRMATION);
            return this.buildOutput(input, session, types_1.TurnType.CONFIRMATION, responseText, toolCalls, audit, metadata, warnings);
        }
        const decision = this.permissionGate.evaluate(session.mode, tool);
        if (!decision.allowed) {
            const result = {
                ok: false,
                errorCode: "TOOL_PERMISSION_DENIED",
                errorMessage: decision.reason ?? "Tool is not allowed.",
            };
            metadata.confirmedExecutionResult = result;
            const responseText = `I cannot execute the confirmed action: ${result.errorMessage}.`;
            this.appendTurn(session, "assistant", responseText, types_1.TurnType.CONFIRMATION);
            this.pushAudit(audit, input, "pending_confirmed_denied", {
                actionId: action.id,
                toolName: action.toolName,
                reason: result.errorMessage,
            });
            this.collectAssistantWarnings(responseText, warnings);
            this.touchSession(session, types_1.TurnType.CONFIRMATION);
            return this.buildOutput(input, session, types_1.TurnType.CONFIRMATION, responseText, toolCalls, audit, metadata, warnings);
        }
        if (this.isWritesExecutionBlockedBySafeMode()) {
            const result = {
                ok: false,
                errorCode: "SAFE_MODE_WRITES_DISABLED",
                errorMessage: "Confirmed write execution is disabled by safe mode.",
            };
            metadata.confirmedExecutionResult = result;
            const context = this.createExecutionContext(input, session);
            const record = this.createToolRecord(action.toolName, action.args, context, result, { blockedBySafeMode: true, confirmedActionId: action.id });
            toolCalls.push(record);
            stats.toolCalls += 1;
            const responseText = "Confirmed action blocked: write execution is disabled by safe mode.";
            this.appendTurn(session, "assistant", responseText, types_1.TurnType.CONFIRMATION);
            this.pushAudit(audit, input, "pending_confirmed_blocked_safe_mode", {
                actionId: action.id,
                toolName: action.toolName,
            });
            this.collectAssistantWarnings(responseText, warnings);
            this.touchSession(session, types_1.TurnType.CONFIRMATION);
            return this.buildOutput(input, session, types_1.TurnType.CONFIRMATION, responseText, toolCalls, audit, metadata, warnings);
        }
        const context = this.createExecutionContext(input, session);
        const result = await this.executor.execute(tool, context, action.args);
        metadata.confirmedExecutionResult = result;
        this.collectToolWarnings(result, warnings);
        const record = this.createToolRecord(action.toolName, action.args, context, result, { confirmedActionId: action.id });
        toolCalls.push(record);
        stats.toolCalls += 1;
        this.appendTurn(session, "tool", this.serializeToolMessage(action.toolName, result), types_1.TurnType.CONFIRMATION, [record]);
        const responseText = result.ok
            ? "Confirmed action executed successfully."
            : `Confirmed action failed: ${result.errorMessage ?? "Unknown error."}`;
        this.appendTurn(session, "assistant", responseText, types_1.TurnType.CONFIRMATION);
        this.pushAudit(audit, input, "pending_confirmed_executed", {
            actionId: action.id,
            toolName: action.toolName,
            ok: result.ok,
            errorCode: result.errorCode,
        });
        this.collectAssistantWarnings(responseText, warnings);
        this.touchSession(session, types_1.TurnType.CONFIRMATION);
        return this.buildOutput(input, session, types_1.TurnType.CONFIRMATION, responseText, toolCalls, audit, metadata, warnings);
    }
    handleRejectionTurn(input, session, toolCalls, audit, warnings, stats) {
        const rejectedAction = this.pending.rejectPending(session);
        const metadata = {
            rejectedActionId: rejectedAction.id,
            loopStats: stats,
        };
        this.appendTurn(session, "user", input.message, types_1.TurnType.REJECTION);
        const responseText = "Understood. I canceled the pending action.";
        this.appendTurn(session, "assistant", responseText, types_1.TurnType.REJECTION);
        this.pushAudit(audit, input, "pending_rejected", { actionId: rejectedAction.id });
        this.collectAssistantWarnings(responseText, warnings);
        this.touchSession(session, types_1.TurnType.REJECTION);
        return this.buildOutput(input, session, types_1.TurnType.REJECTION, responseText, toolCalls, audit, metadata, warnings);
    }
    async handleReasoningTurn(input, session, turnType, toolCalls, audit, warnings, stats) {
        const metadata = { loopStats: stats };
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
            const response = await this.loopGuard.wrapTimeout(this.llm.generate({
                messages,
                tools: llmTools,
                metadata: { sessionId: input.sessionId, turnId: input.turnId, iteration },
            }));
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
        return this.buildOutput(input, session, turnType, responseText, toolCalls, audit, metadata, warnings);
    }
    async processToolCalls(llmToolCalls, context) {
        for (const llmToolCall of llmToolCalls) {
            context.stats.toolCalls += 1;
            const toolName = llmToolCall.name;
            const args = this.normalizeArgs(llmToolCall.arguments);
            const callId = llmToolCall.id || this.createId("tool_call");
            const tool = this.registry.get(toolName);
            if (!tool) {
                const result = {
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
            const boundaryFailure = this.validatePermissionBoundary(context.input, context.session, tool.category, decision, toolName);
            if (boundaryFailure) {
                const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), boundaryFailure);
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
                const result = {
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
            if (tool.category === tools_1.ToolCategory.WRITE || tool.category === tools_1.ToolCategory.EXECUTE) {
                const previousPending = context.session.state.pendingAction;
                const replacedPendingActionId = context.turnType === types_1.TurnType.AMENDMENT && previousPending
                    ? previousPending.id
                    : undefined;
                const pendingAction = this.createPendingAction(toolName, args, context.input, tool.category);
                this.pending.setPending(context.session, pendingAction);
                const interceptedResult = {
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
                const record = this.createToolRecord(toolName, args, this.createExecutionContext(context.input, context.session), interceptedResult, {
                    intercepted: true,
                    ...(replacedPendingActionId ? { replacedPendingActionId } : {}),
                });
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
            this.appendTurn(context.session, "tool", this.serializeToolMessage(toolName, result), context.turnType, [record]);
            this.pushAudit(context.audit, context.input, "tool_call_processed", {
                toolName,
                ok: result.ok,
                errorCode: result.errorCode,
            });
        }
        return { stopForConfirmation: false };
    }
    buildInitialMessages(input, session, turnType) {
        if (this.memory?.contextAssembler?.build) {
            try {
                const built = this.memory.contextAssembler.build(session, input);
                const normalized = this.normalizeMemoryMessages(built, input.message);
                if (normalized.length > 0) {
                    return normalized;
                }
            }
            catch (error) {
                const message = error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : String(error || "unknown context assembler error");
                console.warn(`[agent.memory] context assembly fallback: ${message}`);
            }
        }
        const context = (0, session_1.buildContext)(session);
        const messages = [];
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
        if (turnType === types_1.TurnType.AMENDMENT && context.pendingAction) {
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
    createPendingAction(toolName, args, input, category) {
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
    mapRisk(category) {
        switch (category) {
            case tools_1.ToolCategory.READ:
                return "low";
            case tools_1.ToolCategory.WRITE:
            case tools_1.ToolCategory.EXECUTE:
                return "high";
            case tools_1.ToolCategory.PLAN:
            case tools_1.ToolCategory.EXTERNAL:
            default:
                return "medium";
        }
    }
    buildConfirmationMessage(action) {
        return [
            "I prepared a pending action and did not execute it.",
            `Proposed operation: ${action.summary}`,
            "Please confirm to execute or reject to cancel.",
        ].join("\n");
    }
    createExecutionContext(input, session) {
        return {
            sessionId: session.id,
            turnId: input.turnId,
            mode: session.mode,
            userId: input.userId ?? session.userId,
            metadata: input.metadata,
        };
    }
    validatePermissionBoundary(input, session, toolCategory, permissionDecision, toolName) {
        const runtime = this;
        const security = runtime.__security;
        if (!security || typeof security.validatePermissionBoundary !== "function") {
            return null;
        }
        const securityMetadata = isRecord(input.metadata?.security)
            ? input.metadata.security
            : undefined;
        const authScope = securityMetadata && typeof securityMetadata.authScope === "string"
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
        let validation;
        try {
            validation = security.validatePermissionBoundary({
                mode: session.mode,
                authScope,
                toolCategory,
                permissionDecision,
            });
        }
        catch (error) {
            const reason = error instanceof Error && error.message.trim().length > 0
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
        const reason = typeof row?.reason === "string" && row.reason.trim().length > 0
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
    isWritesExecutionBlockedBySafeMode() {
        const operations = this.getOperationsRuntime();
        return Boolean(operations &&
            operations.safeMode &&
            typeof operations.safeMode.isWritesDisabled === "function" &&
            operations.safeMode.isWritesDisabled() === true);
    }
    isSummarizationDisabledBySafeMode() {
        const operations = this.getOperationsRuntime();
        return Boolean(operations &&
            operations.safeMode &&
            typeof operations.safeMode.isSummarizationDisabled === "function" &&
            operations.safeMode.isSummarizationDisabled() === true);
    }
    maybeLogBoundaryCheck(payload) {
        const operations = this.getOperationsRuntime();
        const shouldLog = operations &&
            operations.debugFlags &&
            typeof operations.debugFlags.shouldLogToolBoundaryChecks === "function" &&
            operations.debugFlags.shouldLogToolBoundaryChecks() === true;
        if (shouldLog) {
            console.info("[agent.operations] tool boundary check", payload);
        }
    }
    getOperationsRuntime() {
        const runtime = this;
        if (!runtime.__operations || typeof runtime.__operations !== "object") {
            return null;
        }
        return runtime.__operations;
    }
    createToolRecord(toolName, args, context, result, metadata) {
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
    appendTurn(session, role, message, turnType, toolCalls) {
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
    collectAssistantWarnings(text, warnings) {
        warnings.push(...(0, safety_1.validateAssistantOutput)(text).warnings);
    }
    collectToolWarnings(result, warnings) {
        warnings.push(...(0, safety_1.validateToolExecutionResultShape)(result).warnings);
    }
    pushAudit(audit, input, eventType, data) {
        audit.push({
            id: this.createId("audit"),
            sessionId: input.sessionId,
            turnId: input.turnId,
            eventType,
            timestamp: new Date().toISOString(),
            data,
        });
    }
    buildOutput(input, session, turnType, responseText, toolCalls, audit, metadata, warnings) {
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
    touchSession(session, turnType) {
        if (!this.memory && typeof session.summary === "string") {
            session.summary = (0, session_1.generateSummary)(session);
        }
        session.state.lastTurnType = turnType;
        session.updatedAt = new Date().toISOString();
    }
    toLLMToolSchema(tool) {
        return {
            type: "function",
            function: {
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema ?? { type: "object", properties: {} },
            },
        };
    }
    normalizeArgs(args) {
        if (isRecord(args)) {
            return args;
        }
        return {};
    }
    normalizeMemoryMessages(messages, fallbackUserMessage) {
        if (!Array.isArray(messages)) {
            return [{ role: "user", content: fallbackUserMessage }];
        }
        const normalized = [];
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
    asLLMRole(value) {
        const normalized = String(value || "").trim().toLowerCase();
        if (normalized === "system" ||
            normalized === "user" ||
            normalized === "assistant" ||
            normalized === "tool") {
            return normalized;
        }
        return null;
    }
    trackToolEntities(session, result, toolName, turnId) {
        if (!this.memory?.entityTracker?.trackFromToolResult) {
            return;
        }
        try {
            this.memory.entityTracker.trackFromToolResult(session, result, toolName, turnId);
        }
        catch (error) {
            const message = error instanceof Error && error.message.trim().length > 0
                ? error.message
                : String(error || "unknown entity tracking error");
            console.warn(`[agent.memory] entity tracking skipped: ${message}`);
        }
    }
    serializeToolMessage(toolName, result) {
        return this.safeJsonStringify({ tool: toolName, result });
    }
    truncate(value, maxLength) {
        if (value.length <= maxLength) {
            return value;
        }
        return value.slice(0, maxLength - 3).trimEnd() + "...";
    }
    createId(prefix) {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    }
    safeJsonStringify(value) {
        try {
            return JSON.stringify(value);
        }
        catch {
            return JSON.stringify({ error: "Unable to serialize payload" });
        }
    }
    persistTurnArtifacts(input, session, output, startedAt, historyStartIndex) {
        const persistence = this.persistence;
        Promise.resolve()
            .then(async () => {
            const newHistory = session.history.slice(historyStartIndex);
            if (persistence && typeof persistence.saveTurnSnapshot === "function") {
                await persistence.saveTurnSnapshot(session.id, input.turnId, input, output, startedAt, new Date().toISOString());
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
            await this.runMemoryMaintenance(session, input.turnId, newHistory.map((entry) => entry.turnId));
            if (!persistence) {
                return;
            }
            if (output.pendingAction) {
                await persistence.setPendingAction(session.id, output.pendingAction);
            }
            else {
                await persistence.clearPendingAction(session.id);
            }
            await persistence.saveSession(session);
        })
            .catch((error) => {
            const message = error instanceof Error && error.message.trim().length > 0
                ? error.message
                : String(error || "unknown persistence error");
            console.warn(`[agent.persistence] post-turn persistence failed: ${message}`);
        });
    }
    async runMemoryMaintenance(session, turnId, newTurnIds = []) {
        if (!this.memory) {
            return;
        }
        if (this.isSummarizationDisabledBySafeMode()) {
            const operations = this.getOperationsRuntime();
            const shouldLog = operations?.debugFlags &&
                typeof operations.debugFlags.shouldLogVerboseTurnTrace === "function" &&
                operations.debugFlags.shouldLogVerboseTurnTrace() === true;
            if (shouldLog) {
                console.info("[agent.operations] summary update skipped by safe mode");
            }
        }
        else if (this.memory.summarizer?.maybeUpdateSummary) {
            try {
                await this.memory.summarizer.maybeUpdateSummary(session);
            }
            catch (error) {
                const message = error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : String(error || "unknown summarizer error");
                console.warn(`[agent.memory] summary update skipped: ${message}`);
            }
        }
        if (this.memory.entityTracker?.pruneUnusedEntities) {
            try {
                this.memory.entityTracker.pruneUnusedEntities(session, turnId);
            }
            catch (error) {
                const message = error instanceof Error && error.message.trim().length > 0
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
        const retrievalDisabledBySafeMode = operations?.safeMode &&
            typeof operations.safeMode.isRetrievalDisabled === "function" &&
            operations.safeMode.isRetrievalDisabled() === true;
        if (retrievalDisabledBySafeMode) {
            return;
        }
        if (typeof retrieval.indexSessionArtifacts === "function") {
            try {
                retrieval.indexSessionArtifacts(session);
            }
            catch (error) {
                const message = error instanceof Error && error.message.trim().length > 0
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
                }
                catch (error) {
                    const message = error instanceof Error && error.message.trim().length > 0
                        ? error.message
                        : String(error || "unknown retrieval turn indexing error");
                    console.warn(`[agent.retrieval] turn indexing skipped: ${message}`);
                }
            }
        }
    }
    inferToolNameForHistory(session, turnId) {
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
        }
        catch {
            return undefined;
        }
        return undefined;
    }
}
exports.AgenticLoop = AgenticLoop;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
