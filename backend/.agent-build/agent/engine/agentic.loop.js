"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgenticLoop = void 0;
const session_1 = require("../session");
const safety_1 = require("../safety");
const tools_1 = require("../tools");
const types_1 = require("../types");
const READ_POLICY_INSTRUCTIONS = [
    "DATA ACCESS POLICY",
    "",
    "The system manages structured legal practice data stored in the database.",
    "",
    "When a user question references any of the following:",
    "",
    "- client",
    "- dossier",
    "- lawsuit",
    "- task",
    "- document",
    "- financial entry",
    "- notification",
    "- history event",
    "- workload",
    "- cases",
    "- deadlines",
    "- sessions",
    "",
    "the information must be retrieved using READ tools.",
    "",
    "Never infer database state without retrieving it.",
    "",
    "If a question refers to database records, the agent must use READ tools before producing the final answer.",
    "",
    "Questions about general legal knowledge, concepts, or explanations do not require tools.",
    "",
    "This rule guides tool usage but does not enforce it programmatically.",
    "",
    "GRAPH TRAVERSAL GUIDELINES",
    "",
    "Entity relationships in the system:",
    "",
    "Client -> Dossiers -> Lawsuits -> Tasks/Sessions",
    "Dossier -> Tasks / Sessions / Documents",
    "Lawsuit -> Sessions",
    "Document -> History",
    "",
    "Recommended traversal depths:",
    "",
    "- Client workload queries: depth 2-3",
    "- Dossier context queries: depth 1-2",
    "- Document history queries: depth 1",
    "",
    "Avoid shallow traversal when the user asks about workload, cases, or related activity.",
    "",
    "PRESENTATION QUALITY GUIDELINES",
    "",
    "Use the format (table, bullets, or concise prose) that is most readable for the current answer.",
    "Keep one consistent date/time style in a response and prefer explicit UTC labels for database-derived timestamps.",
    "Do not output raw JSON, tool payload wrappers, or stream-event fragments in user-facing text.",
    "Keep sections compact and non-redundant; avoid repeating the same fact in multiple sections.",
    "If data is partial or uncertain, state that clearly instead of filling gaps with assumptions.",
].join("\n");
const DATABASE_ENTITY_QUERY_PATTERN = /\b(client|clients|dossier|dossiers|case|cases|task|tasks|document|documents|workload|lawsuit|lawsuits|session|sessions|financial|history|deadline|deadlines|notification|notifications)\b/i;
const WORKLOAD_OR_CASES_QUERY_PATTERN = /\b(work\s*-?\s*load|workload|cases?|matters?)\b/i;
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
        const readCounters = this.createReadObservabilityCounters();
        let output;
        try {
            switch (turnType) {
                case types_1.TurnType.CONFIRMATION:
                    output = await this.handleConfirmationTurn(input, session, toolCalls, audit, warnings, stats, readCounters);
                    break;
                case types_1.TurnType.REJECTION:
                    output = this.handleRejectionTurn(input, session, toolCalls, audit, warnings, stats);
                    break;
                case types_1.TurnType.NEW:
                case types_1.TurnType.AMENDMENT:
                default:
                    output = await this.handleReasoningTurn(input, session, turnType, toolCalls, audit, warnings, stats, readCounters);
                    break;
            }
        }
        finally {
            this.logReadObservabilitySummary(readCounters);
        }
        this.persistTurnArtifacts(input, session, output, startedAt, historyStartIndex);
        return output;
    }
    async handleConfirmationTurn(input, session, toolCalls, audit, warnings, stats, readCounters) {
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
        if (tool.category === tools_1.ToolCategory.READ) {
            this.trackReadToolResult(result, readCounters);
        }
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
    async handleReasoningTurn(input, session, turnType, toolCalls, audit, warnings, stats, readCounters) {
        const metadata = { loopStats: stats };
        const messages = this.buildInitialMessages(input, session, turnType);
        this.appendTurn(session, "user", input.message, turnType);
        this.pushAudit(audit, input, "user_turn", { turnType, message: input.message });
        const llmTools = this.llm.supportsTools()
            ? this.registry.list().map((tool) => this.toLLMToolSchema(tool))
            : undefined;
        let responseText = "";
        let iteration = 0;
        let invalidToolCallRecoveryAttempts = 0;
        let emptyFinalizationRecoveryAttempts = 0;
        let coverageRecoveryAttempts = 0;
        while (!responseText) {
            iteration += 1;
            stats.iterations = iteration;
            this.loopGuard.assertIteration(iteration);
            const response = await this.loopGuard.wrapTimeout(this.llm.generate({
                messages,
                tools: llmTools,
                metadata: { sessionId: input.sessionId, turnId: input.turnId, iteration },
            }), () => {
                console.warn("[AGENT_LOOP_TIMEOUT]", {
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    iteration,
                    toolCallsSoFar: toolCalls.length,
                    messagePreview: input.message.slice(0, 200),
                });
            });
            messages.push({ role: "assistant", content: response.text ?? "" });
            if (response.toolCalls.length === 0) {
                const candidateText = (response.text ?? "").trim();
                if (candidateText) {
                    const coverage = this.analyzeEntityCoverageForWorkloadQuery(input.mode, input.message, toolCalls);
                    if (coverage.hasGap && coverageRecoveryAttempts < 2) {
                        coverageRecoveryAttempts += 1;
                        readCounters.READ_WARNINGS += 1;
                        console.warn("[READ_ENTITY_COVERAGE_GAP]", this.safeJsonStringify({
                            sessionId: input.sessionId,
                            turnId: input.turnId,
                            iteration,
                            attempts: coverageRecoveryAttempts,
                            expectedTools: coverage.expectedTools,
                            executedTools: coverage.executedTools,
                            missingTools: coverage.missingTools,
                        }));
                        messages.push({
                            role: "system",
                            content: this.buildCoverageRecoveryInstruction(input.message, coverage.missingTools),
                        });
                        continue;
                    }
                    if (this.isLikelyPlaceholderCompletion(candidateText) &&
                        stats.toolCalls > 0 &&
                        emptyFinalizationRecoveryAttempts < 2) {
                        emptyFinalizationRecoveryAttempts += 1;
                        messages.push({
                            role: "system",
                            content: this.buildFinalizationRecoveryInstruction(input.message),
                        });
                        continue;
                    }
                    responseText = candidateText;
                    break;
                }
                if (stats.toolCalls > 0 && emptyFinalizationRecoveryAttempts < 2) {
                    emptyFinalizationRecoveryAttempts += 1;
                    messages.push({
                        role: "system",
                        content: this.buildFinalizationRecoveryInstruction(input.message),
                    });
                    continue;
                }
                responseText =
                    stats.toolCalls > 0
                        ? "I retrieved data but could not generate a final response text. Please retry."
                        : "I could not generate a valid response. Please retry.";
                warnings.push("Model returned empty final text.");
                break;
            }
            let validToolCalls = response.toolCalls.filter((toolCall) => typeof toolCall?.name === "string" && this.registry.get(toolCall.name));
            let invalidToolCalls = response.toolCalls.filter((toolCall) => !(typeof toolCall?.name === "string" && this.registry.get(toolCall.name)));
            if (invalidToolCalls.length > 0) {
                const recoveredCalls = this.recoverInvalidToolCalls(invalidToolCalls, input, iteration);
                if (recoveredCalls.length > 0) {
                    validToolCalls = validToolCalls.concat(recoveredCalls);
                    const recoveredIds = new Set(recoveredCalls.map((call) => call.id));
                    invalidToolCalls = invalidToolCalls.filter((call) => !recoveredIds.has(call.id));
                }
            }
            if (invalidToolCalls.length > 0) {
                console.warn("[LLM_TOOL_CALLS_INVALID]", this.safeJsonStringify({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    iteration,
                    invalidCount: invalidToolCalls.length,
                    invalidNames: invalidToolCalls.map((toolCall) => toolCall?.name || "unknown"),
                }));
            }
            if (validToolCalls.length === 0) {
                const candidateText = (response.text ?? "").trim();
                const rejectCandidateText = this.shouldRejectMalformedCandidateText({
                    candidateText,
                    userMessage: input.message,
                    invalidToolCalls,
                    toolCallsSoFar: stats.toolCalls,
                });
                if (candidateText && !rejectCandidateText) {
                    const coverage = this.analyzeEntityCoverageForWorkloadQuery(input.mode, input.message, toolCalls);
                    if (coverage.hasGap && coverageRecoveryAttempts < 2) {
                        coverageRecoveryAttempts += 1;
                        readCounters.READ_WARNINGS += 1;
                        console.warn("[READ_ENTITY_COVERAGE_GAP]", this.safeJsonStringify({
                            sessionId: input.sessionId,
                            turnId: input.turnId,
                            iteration,
                            attempts: coverageRecoveryAttempts,
                            expectedTools: coverage.expectedTools,
                            executedTools: coverage.executedTools,
                            missingTools: coverage.missingTools,
                        }));
                        messages.push({
                            role: "system",
                            content: this.buildCoverageRecoveryInstruction(input.message, coverage.missingTools),
                        });
                        continue;
                    }
                    responseText = candidateText;
                    warnings.push("Model returned malformed tool calls before final response.");
                    break;
                }
                invalidToolCallRecoveryAttempts += 1;
                messages.push({
                    role: "system",
                    content: this.buildToolCallRecoveryInstruction(invalidToolCalls, input.message),
                });
                if (invalidToolCallRecoveryAttempts >= 4) {
                    responseText =
                        "I could not process malformed tool-call output from the model. Please retry.";
                    warnings.push("Model repeatedly returned malformed tool calls without valid executable tools.");
                    break;
                }
                continue;
            }
            const processed = await this.processToolCalls(validToolCalls, {
                input,
                session,
                turnType,
                messages,
                toolCalls,
                audit,
                warnings,
                stats,
                readCounters,
            });
            if (processed.stopForConfirmation) {
                responseText = processed.confirmationMessage ?? "I prepared a pending action.";
                if (processed.replacedPendingActionId) {
                    metadata.replacedPendingActionId = processed.replacedPendingActionId;
                }
            }
        }
        this.logNoToolReadWarningIfNeeded(input.message, toolCalls.length, readCounters);
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
            console.info("[LLM_TOOL_CALL_RAW]", this.safeJsonStringify({
                sessionId: context.input.sessionId,
                turnId: context.input.turnId,
                toolCallId: llmToolCall.id || null,
                toolName,
                rawArguments: llmToolCall.arguments,
            }));
            const args = this.normalizeArgs(llmToolCall.arguments);
            if (isRecord(args) && "tool" in args && "result" in args) {
                console.warn("[LLM_TOOL_ARGS_WRAPPED_RESULT]", this.safeJsonStringify({
                    sessionId: context.input.sessionId,
                    turnId: context.input.turnId,
                    toolName,
                    argKeys: Object.keys(args),
                }));
            }
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
            this.collectPreExecutionReadDiagnostics(tool.name, args, context.readCounters);
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
            if (tool.category === tools_1.ToolCategory.READ) {
                this.trackReadToolResult(result, context.readCounters);
            }
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
        messages.push({
            role: "system",
            content: READ_POLICY_INSTRUCTIONS,
        });
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
    createReadObservabilityCounters() {
        return {
            READ_TOOL_CALL_COUNT: 0,
            READ_EMPTY_RESULTS: 0,
            READ_WARNINGS: 0,
            GRAPH_WARNINGS: 0,
            STATUS_WARNINGS: 0,
        };
    }
    logReadObservabilitySummary(counters) {
        console.info("[READ_OBSERVABILITY_SUMMARY]", {
            READ_TOOL_CALL_COUNT: counters.READ_TOOL_CALL_COUNT,
            READ_EMPTY_RESULTS: counters.READ_EMPTY_RESULTS,
            READ_WARNINGS: counters.READ_WARNINGS,
            GRAPH_WARNINGS: counters.GRAPH_WARNINGS,
            STATUS_WARNINGS: counters.STATUS_WARNINGS,
        });
    }
    collectPreExecutionReadDiagnostics(toolName, args, counters) {
        if (this.hasInvalidStatusForTool(toolName, args.status)) {
            counters.STATUS_WARNINGS += 1;
        }
        if (toolName === "getEntityGraph" && this.isShallowGraphDepthRequest(args.depth)) {
            counters.GRAPH_WARNINGS += 1;
        }
    }
    hasInvalidStatusForTool(toolName, status) {
        if (typeof status !== "string" || status.trim().length === 0) {
            return false;
        }
        const normalized = status.trim().toLowerCase();
        const allowedStatusesByTool = {
            listDossiers: new Set(["open", "closed", "active", "archived", "pending"]),
            listTasks: new Set([
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
            ]),
            listSessions: new Set([
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
            ]),
            listNotifications: new Set([
                "unread",
                "read",
                "archived",
                "pending",
                "open",
                "closed",
                "active",
            ]),
        };
        const allowed = allowedStatusesByTool[toolName];
        if (!allowed) {
            return false;
        }
        return !allowed.has(normalized);
    }
    isShallowGraphDepthRequest(depth) {
        return Number(depth ?? 1) <= 1;
    }
    trackReadToolResult(result, counters) {
        counters.READ_TOOL_CALL_COUNT += 1;
        const resultCount = this.estimateResultCount(result);
        if (resultCount === 0) {
            counters.READ_EMPTY_RESULTS += 1;
        }
    }
    estimateResultCount(result) {
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
            const arrayCounts = values
                .filter((value) => Array.isArray(value))
                .map((value) => value.length);
            if (arrayCounts.length > 0) {
                return arrayCounts.reduce((sum, value) => sum + value, 0);
            }
            const objectValues = values.filter((value) => isRecord(value));
            if (objectValues.length > 0) {
                return objectValues.length;
            }
            return Object.keys(data).length > 0 ? 1 : 0;
        }
        return data === null || data === undefined ? 0 : 1;
    }
    logNoToolReadWarningIfNeeded(userMessage, toolCallsCount, counters) {
        if (toolCallsCount > 0) {
            return;
        }
        if (!DATABASE_ENTITY_QUERY_PATTERN.test(String(userMessage || ""))) {
            return;
        }
        counters.READ_WARNINGS += 1;
        const normalized = String(userMessage || "").replace(/\s+/g, " ").trim();
        console.warn(`[READ_WARNING] No tools were called for a database-related question.\nuser_message: "${normalized}"`);
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
    buildToolCallRecoveryInstruction(invalidToolCalls, userMessage) {
        const invalidNames = invalidToolCalls
            .map((toolCall) => String(toolCall?.name || "").trim())
            .filter((name) => name.length > 0);
        const allowedToolNames = this.registry
            .list()
            .map((tool) => tool.name)
            .slice(0, 60);
        const workloadQuestion = /\b(workload|cases|case|matters|dossiers|lawsuits|deadlines|sessions|tasks)\b/i.test(userMessage);
        return [
            "TOOL-CALL FORMAT CORRECTION",
            "Your previous tool call(s) used invalid tool names.",
            invalidNames.length > 0 ? `Invalid names: ${invalidNames.join(", ")}` : "Invalid names: unknown",
            "If more data is needed, call only registered tools by exact name.",
            "If no additional data is needed, provide the final assistant answer now.",
            workloadQuestion
                ? "For workload/cases requests, prefer valid READ tools such as listDossiers, listLawsuits, listTasks, listSessions, listMissions, listDocuments, or getEntityGraph."
                : "Prefer direct READ tools with valid arguments when more DB data is needed.",
            `Registered tools: ${allowedToolNames.join(", ")}`,
        ].join("\n");
    }
    buildFinalizationRecoveryInstruction(userMessage) {
        return [
            "FINAL RESPONSE REQUIRED",
            "You have already retrieved data using tools.",
            "Do not call additional tools unless strictly necessary.",
            "Now provide a complete user-facing answer based on the retrieved tool results in context.",
            "Do not output raw JSON or tool payload wrappers.",
            `Original user request: ${userMessage}`,
        ].join("\n");
    }
    shouldRejectMalformedCandidateText(params) {
        const candidate = params.candidateText.trim();
        if (!candidate) {
            return true;
        }
        if (this.isLikelyPlaceholderCompletion(candidate)) {
            return true;
        }
        const hasInvalidToolCalls = Array.isArray(params.invalidToolCalls) && params.invalidToolCalls.length > 0;
        if (!hasInvalidToolCalls) {
            return false;
        }
        const isDbQuery = DATABASE_ENTITY_QUERY_PATTERN.test(params.userMessage);
        if (!isDbQuery) {
            return false;
        }
        // Require stronger final text when malformed tool calls occurred on DB-driven turns.
        if (params.toolCallsSoFar <= 1 && candidate.length < 140) {
            return true;
        }
        return false;
    }
    isLikelyPlaceholderCompletion(text) {
        const normalized = text.trim().toLowerCase();
        return (normalized === "i completed your request." ||
            normalized === "i completed your request" ||
            normalized === "done." ||
            normalized === "done" ||
            normalized.includes("malformed tool-call output"));
    }
    analyzeEntityCoverageForWorkloadQuery(mode, userMessage, toolCalls) {
        const normalizedMessage = String(userMessage || "");
        if (mode !== "READ_ONLY" || !WORKLOAD_OR_CASES_QUERY_PATTERN.test(normalizedMessage)) {
            return {
                hasGap: false,
                expectedTools: [],
                executedTools: [],
                missingTools: [],
            };
        }
        const executed = new Set((toolCalls || [])
            .map((call) => String(call?.toolName || "").trim())
            .filter((name) => name.length > 0));
        // A successful graph query can satisfy relational workload coverage in one call.
        if (executed.has("getEntityGraph")) {
            return {
                hasGap: false,
                expectedTools: ["getEntityGraph"],
                executedTools: Array.from(executed),
                missingTools: [],
            };
        }
        const expected = new Set(["listDossiers", "listLawsuits", "listTasks"]);
        if (/\b(session|sessions|hearing|hearings|meeting|meetings)\b/i.test(normalizedMessage)) {
            expected.add("listSessions");
        }
        if (/\bmission|missions\b/i.test(normalizedMessage)) {
            expected.add("listMissions");
        }
        if (/\bdocument|documents\b/i.test(normalizedMessage)) {
            expected.add("listDocuments");
        }
        if (/\b(invoice|invoices|financial|finance|billing)\b/i.test(normalizedMessage)) {
            expected.add("listFinancialEntries");
        }
        const expectedTools = Array.from(expected);
        const missingTools = expectedTools.filter((name) => !executed.has(name));
        return {
            hasGap: missingTools.length > 0,
            expectedTools,
            executedTools: Array.from(executed),
            missingTools,
        };
    }
    buildCoverageRecoveryInstruction(userMessage, missingTools) {
        const missing = (missingTools || []).filter((name) => typeof name === "string" && name.trim().length > 0);
        return [
            "ENTITY COVERAGE CHECK",
            "The previous draft appears to have partial workload/case coverage.",
            missing.length > 0
                ? `Before finalizing, retrieve missing entities using valid tools: ${missing.join(", ")}`
                : "Before finalizing, ensure workload/case entities are fully covered with valid READ tools.",
            "Use only registered tool names and valid argument objects.",
            `Original user request: ${userMessage}`,
        ].join("\n");
    }
    recoverInvalidToolCalls(invalidToolCalls, input, iteration) {
        const recovered = [];
        for (const toolCall of invalidToolCalls) {
            const args = this.normalizeArgs(toolCall.arguments);
            const argKeys = Object.keys(args);
            if (argKeys.length === 0) {
                continue;
            }
            const candidates = this.rankToolCandidatesByArgKeys(argKeys);
            if (candidates.length === 0) {
                continue;
            }
            const top = candidates[0];
            const runnerUp = candidates[1];
            const highConfidence = top.overlap >= 2 &&
                top.score >= 2 &&
                (!runnerUp || top.score - runnerUp.score >= 1);
            if (!highConfidence) {
                continue;
            }
            const recoveredCall = {
                id: toolCall.id,
                name: top.name,
                arguments: args,
            };
            recovered.push(recoveredCall);
            console.warn("[LLM_TOOL_CALL_RECOVERED_BY_SCHEMA]", this.safeJsonStringify({
                sessionId: input.sessionId,
                turnId: input.turnId,
                iteration,
                originalName: toolCall.name,
                recoveredName: top.name,
                argKeys,
                confidenceScore: top.score,
            }));
        }
        return recovered;
    }
    rankToolCandidatesByArgKeys(argKeys) {
        if (!Array.isArray(argKeys) || argKeys.length === 0) {
            return [];
        }
        const normalizedArgKeys = argKeys
            .map((key) => String(key || "").trim())
            .filter((key) => key.length > 0);
        if (normalizedArgKeys.length === 0) {
            return [];
        }
        const candidates = [];
        for (const tool of this.registry.list()) {
            const schema = isRecord(tool.inputSchema) ? tool.inputSchema : null;
            const properties = schema && isRecord(schema.properties) ? schema.properties : null;
            if (!properties) {
                continue;
            }
            const propertyKeys = new Set(Object.keys(properties));
            if (propertyKeys.size === 0) {
                continue;
            }
            let overlap = 0;
            for (const key of normalizedArgKeys) {
                if (propertyKeys.has(key)) {
                    overlap += 1;
                }
            }
            if (overlap === 0) {
                continue;
            }
            const extra = normalizedArgKeys.length - overlap;
            const score = overlap - extra * 0.35;
            candidates.push({
                name: tool.name,
                overlap,
                extra,
                score,
            });
        }
        candidates.sort((a, b) => {
            if (b.score !== a.score)
                return b.score - a.score;
            if (b.overlap !== a.overlap)
                return b.overlap - a.overlap;
            return a.extra - b.extra;
        });
        return candidates;
    }
}
exports.AgenticLoop = AgenticLoop;
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
