"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAgentV2Runtime = void 0;
exports.createAgentV2StreamHandler = createAgentV2StreamHandler;
const node_path_1 = __importDefault(require("node:path"));
const types_1 = require("../types");
const stream_emitter_1 = require("./stream.emitter");
const runtime_factory_1 = require("./runtime.factory");
Object.defineProperty(exports, "createAgentV2Runtime", { enumerable: true, get: function () { return runtime_factory_1.createAgentV2Runtime; } });
const TEXT_CHUNK_SIZE = 200;
const PERFORMANCE_SNAPSHOT_EVENT_TYPE = "performance_snapshot";
const MODELESS_CONTRACT_RUNTIME_MODE = "EXECUTE";
let cachedMutationEventsBuilder;
function createAgentV2StreamHandler(runtime) {
    return async function handleAgentV2Stream(req, res) {
        const emitter = new stream_emitter_1.StreamEmitter(res);
        try {
            const security = getSecurity(runtime);
            const parsed = parseInputWithSecurity(req, security);
            if (!parsed.ok) {
                emitter.emit({ type: "error", message: parsed.message });
                emitter.emit({ type: "done" });
                emitter.close();
                return;
            }
            let input = parsed.input;
            console.info("[AGENT_V2_STREAM_TURN_START]", safeDiagnosticJson({
                sessionId: input.sessionId,
                turnId: input.turnId,
                modelPreference: typeof (toRecord(input.metadata)?.modelPreference) === "string"
                    ? String(toRecord(input.metadata).modelPreference)
                    : undefined,
                requestSource: typeof (toRecord(input.metadata)?.requestSource) === "string"
                    ? String(toRecord(input.metadata).requestSource)
                    : undefined,
                requestTriggerId: typeof (toRecord(input.metadata)?.requestTriggerId) === "string"
                    ? String(toRecord(input.metadata).requestTriggerId)
                    : undefined,
                messagePreview: truncateForDiagnostics(input.message, 140),
            }));
            const rateLimit = evaluateRateLimit(security, req, input);
            if (!rateLimit.allowed) {
                const message = asNonEmptyString(rateLimit.reason) ?? "Rate limit exceeded. Please retry shortly.";
                emitter.emit({ type: "error", message });
                emitter.emit({ type: "done" });
                emitter.close();
                return;
            }
            const authResult = evaluateAuthScope(security, req, input);
            if (!authResult.allowed) {
                const message = asNonEmptyString(authResult.reason) ?? "Not authorized for requested action.";
                emitter.emit({ type: "error", message });
                emitter.emit({ type: "done" });
                emitter.close();
                return;
            }
            input = attachSecurityMetadata(input, {
                authScope: authResult.scope || "unknown",
                rateLimit,
            });
            if (isAgentV2Disabled(runtime)) {
                emitter.emit({
                    type: "error",
                    message: "Agent v2 stream is temporarily disabled by operator safe mode.",
                });
                emitter.emit({ type: "done" });
                emitter.close();
                return;
            }
            input = clampModeBySafeMode(runtime, input);
            const session = await getOrCreateSession(runtime, input);
            try {
                runtime.retrieval?.indexSessionArtifacts?.(session);
            }
            catch (_ixErr) {
                /* non-fatal – retrieval index warm-up */
            }
            runtime.grounding?.beginTurn?.(input.turnId);
            let deliveredLiveText = false;
            let deliveredDraftArtifact = false;
            let deliveredPlanArtifact = false;
            let deliveredPlanExecutedArtifact = false;
            let deliveredPlanRejectedArtifact = false;
            let deliveredSuggestionArtifact = false;
            const uxPreflight = evaluateUxPreflight(runtime, input, session);
            if (uxPreflight.handled) {
                console.info("[AGENT_V2_UX_PREFLIGHT_HANDLED]", safeDiagnosticJson({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    action: uxPreflight.action,
                    responsePreview: truncateForDiagnostics(uxPreflight.responseText || "", 180),
                }));
            }
            else {
                const uxDecision = toRecord(uxPreflight.metadata)?.uxDecision;
                console.info("[AGENT_V2_UX_PREFLIGHT_PASSTHROUGH]", safeDiagnosticJson({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    action: asString(toRecord(uxDecision)?.action) ?? "proceed",
                    reason: truncateForDiagnostics(asString(toRecord(uxDecision)?.reason) || "", 180),
                }));
            }
            const loopOutput = uxPreflight.handled
                ? buildUxHandledOutput(input, session, uxPreflight)
                : mergePreflightMetadata(await runtime.loop.run(input, session, {
                    onTextDelta: (delta) => {
                        if (typeof delta !== "string" || delta.length === 0) {
                            return;
                        }
                        deliveredLiveText = true;
                        emitter.emit({ type: "text_delta", delta });
                    },
                    onDraftArtifact: (artifact) => {
                        deliveredDraftArtifact = true;
                        console.info("[DRAFT_TRACE_SSE_EMIT_DRAFT_ARTIFACT]", safeDiagnosticJson({
                            sessionId: input.sessionId,
                            turnId: input.turnId,
                            draftType: artifact?.draftType,
                            title: artifact?.title,
                            version: artifact?.version,
                            sectionCount: Array.isArray(artifact?.sections) ? artifact.sections.length : 0,
                        }));
                        emitter.emit({ type: "draft_artifact", artifact });
                    },
                    onPlanArtifact: (artifact) => {
                        deliveredPlanArtifact = true;
                        emitter.emit({ type: "plan_artifact", artifact });
                    },
                    onPlanExecuted: (artifact) => {
                        deliveredPlanExecutedArtifact = true;
                        emitter.emit({ type: "plan_executed", artifact });
                    },
                    onPlanRejected: (artifact) => {
                        deliveredPlanRejectedArtifact = true;
                        emitter.emit({ type: "plan_rejected", artifact });
                    },
                    onSuggestionArtifact: (artifact) => {
                        deliveredSuggestionArtifact = true;
                        emitter.emit({ type: "suggestion_artifact", artifact });
                    },
                }), uxPreflight.metadata);
            const output = applyGroundingPostprocess(runtime, input, session, loopOutput);
            runtime.sessionStore.updateSession(session);
            schedulePerformanceSnapshot(runtime, input, output);
            console.info("[AGENT_V2_STREAM_TURN_END]", safeDiagnosticJson({
                sessionId: input.sessionId,
                turnId: input.turnId,
                turnType: output.turnType,
                toolCallsCount: Array.isArray(output.toolCalls) ? output.toolCalls.length : 0,
                pendingAction: Boolean(output.pendingAction),
                responseLength: String(output.responseText || "").length,
            }));
            if (input.mode === "DRAFT") {
                const draftToolCalls = (output.toolCalls || []).filter((call) => String(call?.toolName || "").trim() === "generateDraft").length;
                console.info("[DRAFT_TRACE_TURN_SUMMARY]", safeDiagnosticJson({
                    sessionId: input.sessionId,
                    turnId: input.turnId,
                    draftToolCalls,
                    totalToolCalls: Array.isArray(output.toolCalls) ? output.toolCalls.length : 0,
                    responseLength: String(output.responseText || "").length,
                }));
            }
            if (!deliveredDraftArtifact) {
                const fallbackDraftArtifact = extractDraftArtifactFromOutput(output);
                if (fallbackDraftArtifact) {
                    deliveredDraftArtifact = true;
                    console.info("[DRAFT_TRACE_SSE_EMIT_DRAFT_ARTIFACT_FALLBACK]", safeDiagnosticJson({
                        sessionId: input.sessionId,
                        turnId: input.turnId,
                        draftType: fallbackDraftArtifact.draftType,
                        title: fallbackDraftArtifact.title,
                        version: fallbackDraftArtifact.version,
                        sectionCount: Array.isArray(fallbackDraftArtifact.sections)
                            ? fallbackDraftArtifact.sections.length
                            : 0,
                    }));
                    emitter.emit({ type: "draft_artifact", artifact: fallbackDraftArtifact });
                }
            }
            if (!deliveredPlanArtifact) {
                const fallbackPlanArtifact = extractPlanArtifactFromOutput(output);
                if (fallbackPlanArtifact) {
                    deliveredPlanArtifact = true;
                    emitter.emit({ type: "plan_artifact", artifact: fallbackPlanArtifact });
                }
            }
            if (!deliveredPlanExecutedArtifact) {
                const fallbackPlanExecutedArtifact = extractPlanExecutedArtifactFromOutput(output);
                if (fallbackPlanExecutedArtifact) {
                    deliveredPlanExecutedArtifact = true;
                    emitter.emit({ type: "plan_executed", artifact: fallbackPlanExecutedArtifact });
                }
            }
            if (!deliveredPlanRejectedArtifact) {
                const fallbackPlanRejectedArtifact = extractPlanRejectedArtifactFromOutput(output);
                if (fallbackPlanRejectedArtifact) {
                    deliveredPlanRejectedArtifact = true;
                    emitter.emit({ type: "plan_rejected", artifact: fallbackPlanRejectedArtifact });
                }
            }
            if (!deliveredSuggestionArtifact) {
                const fallbackSuggestionArtifact = extractSuggestionArtifactFromOutput(output);
                if (fallbackSuggestionArtifact) {
                    deliveredSuggestionArtifact = true;
                    emitter.emit({ type: "suggestion_artifact", artifact: fallbackSuggestionArtifact });
                }
            }
            emitOutput(emitter, output, deliveredLiveText);
            emitEntityMutationSuccessEvents(emitter, input, output);
            const disambiguation = detectDisambiguation(uxPreflight, output, session, input);
            if (disambiguation) {
                emitter.emit({ type: "disambiguation", payload: disambiguation });
            }
            emitter.emit({ type: "done" });
            emitter.close();
        }
        catch (error) {
            console.warn("[AGENT_V2_STREAM_ERROR]", safeDiagnosticJson({
                message: error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : String(error || "Agent v2 stream failed"),
            }));
            emitter.emit({
                type: "error",
                message: error instanceof Error && error.message.trim().length > 0
                    ? error.message
                    : "Agent v2 stream failed",
            });
            emitter.emit({ type: "done" });
            emitter.close();
        }
    };
}
function parseInputWithSecurity(req, security) {
    const payload = req?.body;
    if (!security || typeof security.sanitizeAgentInput !== "function") {
        return parseInput(payload);
    }
    try {
        const sanitized = security.sanitizeAgentInput(payload);
        if (!sanitized || sanitized.ok !== true || !toRecord(sanitized.value)) {
            const error = toRecord(sanitized?.error);
            return {
                ok: false,
                message: asString(error?.message) ?? "Invalid request payload.",
            };
        }
        return parseInput(sanitized.value);
    }
    catch (error) {
        return {
            ok: false,
            message: error instanceof Error && error.message.trim().length > 0
                ? error.message
                : "Input sanitization failed.",
        };
    }
}
function evaluateRateLimit(security, req, input) {
    if (!security || typeof security.checkRateLimit !== "function") {
        return { allowed: true, remaining: 0, resetAt: 0 };
    }
    const user = getRequestUser(req);
    const context = {
        userId: normalizeRequestUserId(user, input?.userId),
        sessionId: asString(input?.sessionId) ?? undefined,
        ip: getRequestIp(req),
    };
    const key = typeof security.resolveRateLimitKey === "function"
        ? security.resolveRateLimitKey(context)
        : undefined;
    try {
        const result = security.checkRateLimit({ ...context, key });
        const row = toRecord(result);
        if (!row || (row.allowed !== true && row.allowed !== false)) {
            return {
                allowed: false,
                remaining: 0,
                resetAt: Date.now() + 60_000,
                reason: "Rate limiter produced an invalid decision.",
            };
        }
        const remaining = Number(row.remaining);
        const resetAt = Number(row.resetAt);
        return {
            allowed: row.allowed === true,
            remaining: Number.isFinite(remaining) ? remaining : 0,
            resetAt: Number.isFinite(resetAt) ? resetAt : Date.now() + 60_000,
            reason: asString(row.reason) ?? undefined,
        };
    }
    catch (error) {
        return {
            allowed: false,
            remaining: 0,
            resetAt: Date.now() + 60_000,
            reason: error instanceof Error && error.message.trim().length > 0
                ? error.message
                : "Rate limiter check failed.",
        };
    }
}
function evaluateAuthScope(security, req, input) {
    if (!security || typeof security.evaluateAuthScope !== "function") {
        return { allowed: true, scope: "unknown" };
    }
    const user = getRequestUser(req);
    const requestedAction = resolveRequestedAction(input);
    const result = security.evaluateAuthScope({
        user,
        requestedAction,
    });
    const row = toRecord(result);
    if (!row || (row.allowed !== true && row.allowed !== false)) {
        return {
            allowed: false,
            scope: "unknown",
            reason: "Auth scope evaluator produced an invalid decision.",
        };
    }
    return {
        allowed: row.allowed === true,
        scope: asString(row.scope) ?? "unknown",
        reason: asString(row.reason) ?? undefined,
    };
}
function resolveRequestedAction(input) {
    const metadata = toRecord(input?.metadata);
    const securityMetadata = toRecord(metadata?.security);
    return (asString(securityMetadata?.requestedAction) ??
        asString(metadata?.requestedAction) ??
        undefined);
}
function attachSecurityMetadata(input, securityContext) {
    const metadata = toRecord(input?.metadata) ? { ...input.metadata } : {};
    const existing = (toRecord(metadata.security) ?? {});
    metadata.security = {
        ...existing,
        ...securityContext,
    };
    return {
        ...input,
        metadata,
    };
}
function getSecurity(runtime) {
    const candidate = runtime?.security;
    if (candidate && typeof candidate === "object") {
        return candidate;
    }
    return null;
}
function getRequestUser(req) {
    const user = req?.user;
    return toRecord(user) ?? null;
}
function normalizeRequestUserId(user, fallbackUserId) {
    const fromUser = asString(user?.id) || asString(user?.userId) || asString(user?.sub);
    if (fromUser) {
        return fromUser;
    }
    return asString(fallbackUserId) ?? undefined;
}
function getRequestIp(req) {
    const xForwardedFor = req?.headers?.["x-forwarded-for"];
    if (typeof xForwardedFor === "string" && xForwardedFor.trim().length > 0) {
        return xForwardedFor.split(",")[0]?.trim();
    }
    return asString(req?.ip) || asString(req?.socket?.remoteAddress) || undefined;
}
function emitOutput(emitter, output, deliveredLiveText) {
    if (!deliveredLiveText && output.responseText && output.responseText.trim().length > 0) {
        for (const chunk of splitText(output.responseText, TEXT_CHUNK_SIZE)) {
            emitter.emit({ type: "text_delta", delta: chunk });
        }
    }
    for (const call of output.toolCalls ?? []) {
        emitter.emit({ type: "tool_start", toolName: call.toolName });
        emitter.emit({ type: "tool_result", toolName: call.toolName, ok: Boolean(call.ok) });
    }
    if (output.pendingAction) {
        emitter.emit({ type: "pending", actionSummary: output.pendingAction.summary });
    }
    const confirmedResult = toRecord(output.metadata?.confirmedExecutionResult);
    if (confirmedResult) {
        const confirmedAction = toRecord(output.metadata?.confirmedAction);
        const summary = asString(confirmedAction?.summary) ?? "Confirmed action";
        emitter.emit({
            type: "confirmed",
            actionSummary: summary,
            ok: confirmedResult.ok === true,
        });
    }
}
function extractDraftArtifactFromOutput(output) {
    const metadata = toRecord(output?.metadata);
    const artifact = toRecord(metadata?.draftArtifact);
    if (!artifact) {
        return null;
    }
    const draftType = asString(artifact.draftType);
    const title = asString(artifact.title);
    const generatedAt = asString(artifact.generatedAt);
    const sections = Array.isArray(artifact.sections) ? artifact.sections : null;
    const layout = toRecord(artifact.layout);
    const versionRaw = Number(artifact.version);
    if (!draftType ||
        !title ||
        !generatedAt ||
        !sections ||
        !layout ||
        !Number.isFinite(versionRaw) ||
        versionRaw <= 0) {
        return null;
    }
    return artifact;
}
function extractPlanArtifactFromOutput(output) {
    const metadata = toRecord(output?.metadata);
    const artifact = toRecord(metadata?.planArtifact);
    if (!artifact) {
        return null;
    }
    const pendingActionId = asString(artifact.pendingActionId);
    const summary = asString(artifact.summary);
    const operation = toRecord(artifact.operation);
    if (!pendingActionId || !summary || !operation) {
        return null;
    }
    const operationType = asString(operation.operation);
    const entityType = asString(operation.entityType);
    if ((operationType !== "create" && operationType !== "update" && operationType !== "delete") ||
        !entityType) {
        return null;
    }
    return artifact;
}
function extractPlanExecutedArtifactFromOutput(output) {
    const metadata = toRecord(output?.metadata);
    const artifact = toRecord(metadata?.planExecutedArtifact);
    if (!artifact) {
        return null;
    }
    const pendingActionId = asString(artifact.pendingActionId);
    if (!pendingActionId) {
        return null;
    }
    if (artifact.ok !== true && artifact.ok !== false) {
        return null;
    }
    return artifact;
}
function extractPlanRejectedArtifactFromOutput(output) {
    const metadata = toRecord(output?.metadata);
    const artifact = toRecord(metadata?.planRejectedArtifact);
    if (!artifact) {
        return null;
    }
    const pendingActionId = asString(artifact.pendingActionId);
    if (!pendingActionId) {
        return null;
    }
    return artifact;
}
function extractSuggestionArtifactFromOutput(output) {
    const metadata = toRecord(output?.metadata);
    const artifact = toRecord(metadata?.suggestionArtifact);
    if (!artifact) {
        return null;
    }
    const actionType = asString(artifact.actionType);
    const targetType = asString(artifact.targetType);
    const title = asString(artifact.title);
    const reason = asString(artifact.reason);
    if (!actionType || !targetType || !title || !reason) {
        return null;
    }
    return artifact;
}
function parseInput(payload) {
    const body = toRecord(payload);
    if (!body) {
        return { ok: false, message: "Invalid payload: expected JSON object body." };
    }
    const sessionId = asNonEmptyString(body.sessionId);
    const turnId = asNonEmptyString(body.turnId);
    const message = asNonEmptyString(body.message);
    const legacyMode = normalizeRuntimeMode(body.mode);
    const metadata = toRecord(body.metadata);
    const userId = asString(body.userId);
    if (!sessionId) {
        return { ok: false, message: "Invalid payload: sessionId is required." };
    }
    if (!turnId) {
        return { ok: false, message: "Invalid payload: turnId is required." };
    }
    if (!message) {
        return { ok: false, message: "Invalid payload: message is required." };
    }
    return {
        ok: true,
        input: {
            sessionId,
            turnId,
            message,
            mode: legacyMode ?? MODELESS_CONTRACT_RUNTIME_MODE,
            userId: userId || undefined,
            metadata: metadata ?? undefined,
        },
    };
}
function evaluateUxPreflight(runtime, input, session) {
    if (session.state.pendingAction) {
        return { handled: false };
    }
    const evaluator = runtime.ux?.evaluatePreLoop;
    if (typeof evaluator !== "function") {
        return { handled: false };
    }
    const retrievalContext = buildRetrievalContext(runtime, input, session);
    try {
        const raw = evaluator({
            input,
            session,
            retrievalContext,
            activeEntities: session.activeEntities,
            pendingAction: session.state.pendingAction,
        });
        return normalizeUxPreflightResult(raw);
    }
    catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown ux preflight error");
        console.warn(`[agent.ux] pre-loop evaluation skipped: ${message}`);
        return { handled: false };
    }
}
function buildRetrievalContext(runtime, input, session) {
    if (isRetrievalDisabled(runtime)) {
        maybeLogRetrievalDecision(runtime, "retrieval context skipped by safe mode");
        return { text: "", matches: [] };
    }
    const retrieval = runtime.retrieval;
    if (!retrieval || typeof retrieval.buildRetrievalContext !== "function") {
        maybeLogRetrievalDecision(runtime, "retrieval context unavailable for UX preflight");
        return { text: "", matches: [] };
    }
    if (typeof retrieval.isEnabled === "function" && retrieval.isEnabled() === false) {
        maybeLogRetrievalDecision(runtime, "retrieval runtime disabled for UX preflight");
        return { text: "", matches: [] };
    }
    try {
        return retrieval.buildRetrievalContext({ session, input });
    }
    catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown retrieval context error");
        console.warn(`[agent.ux] retrieval context unavailable for preflight: ${message}`);
        maybeLogRetrievalDecision(runtime, `retrieval context failed for UX preflight: ${message}`);
        return { text: "", matches: [] };
    }
}
function normalizeUxPreflightResult(value) {
    const row = toRecord(value);
    if (!row) {
        return { handled: false };
    }
    return {
        handled: row.handled === true,
        action: asString(row.action) ?? undefined,
        responseText: asString(row.responseText) ?? undefined,
        metadata: toRecord(row.metadata) ?? undefined,
    };
}
function buildUxHandledOutput(input, session, preflight) {
    const responseText = (preflight.responseText || "Please provide more details to continue.").trim();
    const turnType = types_1.TurnType.NEW;
    appendSessionTurn(session, "user", input.message, turnType);
    appendSessionTurn(session, "assistant", responseText, turnType);
    session.state.lastTurnType = turnType;
    session.updatedAt = new Date().toISOString();
    const audit = [
        createAuditRecord(input, "ux_preflight_handled", {
            action: preflight.action ?? "ask",
            reason: asString(preflight.metadata?.uxDecision && toRecord(preflight.metadata.uxDecision)?.reason) ?? "",
        }),
    ];
    return {
        sessionId: session.id,
        turnId: input.turnId,
        turnType,
        responseText,
        pendingAction: session.state.pendingAction,
        toolCalls: [],
        audit,
        metadata: {
            ...(toRecord(preflight.metadata) ?? {}),
        },
    };
}
function mergePreflightMetadata(output, preflightMetadata) {
    if (!preflightMetadata) {
        return output;
    }
    return {
        ...output,
        metadata: {
            ...(toRecord(output.metadata) ?? {}),
            ...preflightMetadata,
        },
    };
}
function appendSessionTurn(session, role, message, turnType) {
    const createdAt = new Date().toISOString();
    const turnId = createLocalId("turn");
    const text = String(message || "").trim();
    session.turns.push({
        id: turnId,
        role,
        turnType,
        message: text,
        createdAt,
    });
    session.history.push({
        turnId,
        role,
        summary: truncate(text, 240),
        createdAt,
    });
}
function createAuditRecord(input, eventType, data) {
    return {
        id: createLocalId("audit"),
        sessionId: input.sessionId,
        turnId: input.turnId,
        eventType,
        timestamp: new Date().toISOString(),
        data,
    };
}
function truncate(value, maxLength) {
    if (value.length <= maxLength) {
        return value;
    }
    return value.slice(0, maxLength - 3).trimEnd() + "...";
}
function createLocalId(prefix) {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}
function schedulePerformanceSnapshot(runtime, input, output) {
    const performance = runtime.performance;
    if (!performance || typeof performance.recordTurnAndMaybeSnapshot !== "function") {
        return;
    }
    const metrics = buildSingleTurnMetrics(output);
    const activeStats = {
        sessionCacheSize: typeof runtime.sessionStore.getCacheStats === "function"
            ? Number(runtime.sessionStore.getCacheStats().size || 0)
            : 0,
    };
    let snapshot = null;
    try {
        snapshot = performance.recordTurnAndMaybeSnapshot({ metrics, activeStats }) ?? null;
        if (typeof performance.maybeTrimCaches === "function") {
            performance.maybeTrimCaches();
        }
    }
    catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown performance error");
        console.warn(`[agent.performance] snapshot scheduling skipped: ${message}`);
        return;
    }
    if (!snapshot || typeof runtime.repository?.appendAudit !== "function") {
        return;
    }
    const record = createAuditRecord(input, PERFORMANCE_SNAPSHOT_EVENT_TYPE, snapshot);
    Promise.resolve()
        .then(async () => {
        await runtime.repository.appendAudit(record);
    })
        .catch((error) => {
        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown persistence error");
        console.warn(`[agent.performance] performance snapshot audit append failed: ${message}`);
    });
}
function buildSingleTurnMetrics(output) {
    const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
    const toolCallsFailed = toolCalls.filter((call) => call?.ok !== true).length;
    const retrievalSources = Array.isArray(output.metadata?.sources)
        ? output.metadata.sources.filter((row) => toRecord(row)?.type === "retrieval")
        : [];
    return {
        counters: {
            turnsTotal: 1,
            turnsSucceeded: 1,
            turnsFailed: 0,
            toolCallsTotal: toolCalls.length,
            toolCallsFailed,
            retrievalHits: retrievalSources.length > 0 ? 1 : 0,
            retrievalMisses: retrievalSources.length > 0 ? 0 : 1,
        },
        rates: {},
    };
}
function applyGroundingPostprocess(runtime, input, session, output) {
    if (isGroundingDisabled(runtime)) {
        maybeLogGroundingDecision(runtime, "grounding post-process skipped by safe mode");
        return output;
    }
    const grounding = runtime.grounding;
    if (!grounding) {
        return output;
    }
    try {
        grounding.registerSummary?.({
            turnId: input.turnId,
            sessionId: session.id,
            summary: String(session.summary || ""),
        });
        grounding.registerToolOutputs?.({
            turnId: input.turnId,
            toolCalls: output.toolCalls ?? [],
        });
        const sources = grounding.getTurnSources?.(input.turnId) ?? [];
        const researchMode = grounding.isResearchMode?.(input) === true;
        const showCitations = grounding.resolveShowCitations?.(input) === true;
        const citationMode = grounding.resolveCitationMode?.(input) ?? "footnote";
        const citations = grounding.buildCitations?.({
            sources,
            mode: citationMode,
        }) ?? { mode: citationMode, entries: [], markers: {}, text: "" };
        const lowSourceDensity = grounding.computeLowSourceDensity?.(sources) ??
            ((Array.isArray(sources) ? sources.length : 0) < 2);
        const metadata = {
            ...(toRecord(output.metadata) ?? {}),
            sources,
            citations,
            grounding: {
                researchMode,
                citationMode,
                sourceCount: Array.isArray(sources) ? sources.length : 0,
                lowSourceDensity,
                sectionSourceIds: grounding.getTurnSectionSourceIds?.(input.turnId) ?? {},
            },
        };
        let responseText = output.responseText;
        const shouldAppendCitations = grounding.shouldAppendCitations?.({
            researchMode,
            showCitations,
        }) ?? false;
        if (shouldAppendCitations && typeof citations.text === "string" && citations.text.trim()) {
            responseText = appendText(responseText, citations.text);
        }
        const shouldShowLowSourceDisclaimer = grounding.shouldShowLowSourceDisclaimer?.({
            lowSourceDensity,
            researchMode,
            showCitations,
        }) ?? false;
        if (shouldShowLowSourceDisclaimer) {
            const disclaimer = grounding.getLowSourceDensityDisclaimer?.() ??
                "Evidence coverage is limited for this answer. Please verify critical facts before relying on them.";
            responseText = appendText(responseText, `\n\n${disclaimer}`);
        }
        return {
            ...output,
            responseText,
            metadata,
        };
    }
    catch (error) {
        const message = error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown grounding error");
        console.warn(`[agent.grounding] output postprocess skipped: ${message}`);
        return output;
    }
}
function isAgentV2Disabled(runtime) {
    return Boolean(runtime.operations?.safeMode?.isAgentV2Disabled &&
        runtime.operations.safeMode.isAgentV2Disabled() === true);
}
function isRetrievalDisabled(runtime) {
    return Boolean(runtime.operations?.safeMode?.isRetrievalDisabled &&
        runtime.operations.safeMode.isRetrievalDisabled() === true);
}
function isGroundingDisabled(runtime) {
    return Boolean(runtime.operations?.safeMode?.isGroundingDisabled &&
        runtime.operations.safeMode.isGroundingDisabled() === true);
}
function clampModeBySafeMode(runtime, input) {
    const shouldClamp = runtime.operations?.safeMode?.isAgentV2ReadOnlyForced &&
        runtime.operations.safeMode.isAgentV2ReadOnlyForced() === true;
    if (!shouldClamp || input.mode === "READ_ONLY") {
        return input;
    }
    const metadata = toRecord(input.metadata)
        ? { ...input.metadata }
        : {};
    const safeModeMeta = toRecord(metadata.safeMode)
        ? { ...metadata.safeMode }
        : {};
    metadata.safeMode = {
        ...safeModeMeta,
        modeClampedToReadOnly: true,
        originalMode: input.mode,
    };
    return {
        ...input,
        mode: "READ_ONLY",
        metadata,
    };
}
function maybeLogRetrievalDecision(runtime, message) {
    if (runtime.operations?.debugFlags?.shouldLogRetrievalDecisions &&
        runtime.operations.debugFlags.shouldLogRetrievalDecisions() === true) {
        console.info(`[agent.operations] ${message}`);
    }
}
function maybeLogGroundingDecision(runtime, message) {
    if (runtime.operations?.debugFlags?.shouldLogVerboseTurnTrace &&
        runtime.operations.debugFlags.shouldLogVerboseTurnTrace() === true) {
        console.info(`[agent.operations] ${message}`);
    }
}
function appendText(base, suffix) {
    const left = String(base || "").trimEnd();
    const right = String(suffix || "").trim();
    if (!right) {
        return left;
    }
    if (!left) {
        return right;
    }
    return `${left}\n${right}`;
}
async function getOrCreateSession(runtime, input) {
    const existing = await runtime.sessionStore.getOrLoadSession(input.sessionId);
    if (existing) {
        return existing;
    }
    return runtime.sessionStore.createSession({
        sessionId: input.sessionId,
        userId: input.userId,
    });
}
function splitText(text, chunkSize) {
    const value = text.trim();
    const chunks = [];
    for (let index = 0; index < value.length; index += chunkSize) {
        chunks.push(value.slice(index, index + chunkSize));
    }
    return chunks.length > 0 ? chunks : [value];
}
function asString(value) {
    return typeof value === "string" ? value : null;
}
function coerceNumber(value) {
    const parsed = Number(value);
    if (Number.isFinite(parsed))
        return parsed;
    return undefined;
}
function asNonEmptyString(value) {
    const text = asString(value)?.trim();
    return text || null;
}
function normalizeRuntimeMode(value) {
    const normalized = String(value || "").trim().toUpperCase();
    if (normalized === "READ_ONLY")
        return "READ_ONLY";
    if (normalized === "DRAFT")
        return "DRAFT";
    if (normalized === "EXECUTE")
        return "EXECUTE";
    if (normalized === "AUTONOMOUS")
        return "AUTONOMOUS";
    return null;
}
function toRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return null;
    }
    return value;
}
function truncateForDiagnostics(value, maxLength) {
    const normalized = String(value || "").replace(/\s+/g, " ").trim();
    if (normalized.length <= maxLength) {
        return normalized;
    }
    return `${normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`;
}
function safeDiagnosticJson(value) {
    try {
        return JSON.stringify(value);
    }
    catch {
        return JSON.stringify({ error: "Unable to serialize diagnostic payload." });
    }
}
const MAX_DISAMBIGUATION_CANDIDATES = 5;
const AGGREGATE_SELECTION_PATTERN = /\b(all|every|latest|recent|multiple|several|many|unpaid|overdue|open invoices?|all invoices?)\b/i;
function detectDisambiguation(uxPreflight, output, session, input) {
    const uxDecision = toRecord(uxPreflight.metadata?.uxDecision);
    const draftAmbiguity = extractDraftAmbiguityFromToolCalls(output.toolCalls);
    const uxAllowsDisambiguation = uxDecision && uxDecision.action === "proceed_with_ambiguity";
    if (!uxAllowsDisambiguation && draftAmbiguity.candidates.length < 2) {
        return null;
    }
    const toolCallCount = Array.isArray(output.toolCalls) ? output.toolCalls.length : 0;
    if (toolCallCount === 0 && draftAmbiguity.candidates.length < 2) {
        return null;
    }
    const decisionCandidates = normalizeDisambiguationCandidates(uxDecision?.ambiguityCandidates);
    const draftCandidates = normalizeDisambiguationCandidates(draftAmbiguity.candidates);
    const sessionCandidates = normalizeSessionDisambiguationCandidates(session.activeEntities);
    const candidatePool = decisionCandidates.length > 0
        ? decisionCandidates
        : draftCandidates.length > 0
            ? draftCandidates
            : sessionCandidates;
    if (candidatePool.length < 2) {
        return null;
    }
    const byType = new Map();
    for (const candidate of candidatePool) {
        if (!candidate.entityType) {
            continue;
        }
        const list = byType.get(candidate.entityType) || [];
        list.push(candidate);
        byType.set(candidate.entityType, list);
    }
    let disambiguationType = "";
    let disambiguationCandidates = [];
    for (const [type, typeEntities] of byType) {
        if (typeEntities.length > 1 && typeEntities.length > disambiguationCandidates.length) {
            disambiguationType = type;
            disambiguationCandidates = typeEntities;
        }
    }
    if (disambiguationCandidates.length < 2) {
        return null;
    }
    const capped = disambiguationCandidates.slice(0, MAX_DISAMBIGUATION_CANDIDATES);
    const entityTypePlural = disambiguationType.endsWith("s") ? disambiguationType : `${disambiguationType}s`;
    const selectionPolicy = buildDisambiguationSelectionPolicy(input.message, draftAmbiguity.selectionMode);
    const actions = buildDisambiguationActions(selectionPolicy);
    return {
        type: "context_suggestion",
        message: `I found ${disambiguationCandidates.length} ${entityTypePlural}. Which one did you mean?`,
        entityType: disambiguationType,
        reason: "multiple_matches",
        originalMessage: input.message,
        suggestions: capped.map((candidate, index) => buildDisambiguationSuggestion(candidate, disambiguationType, index)),
        timestamp: new Date().toISOString(),
        confidence: 0.7,
        allowManualInput: true,
        manualInputHint: "Or provide more details to narrow your search.",
        selectionPolicy,
        actions,
        source: decisionCandidates.length > 0
            ? "ux_candidates"
            : draftCandidates.length > 0
                ? "draft_guard"
                : "session_entities",
    };
}
function extractDraftAmbiguityFromToolCalls(value) {
    const rows = Array.isArray(value) ? value : [];
    for (let i = rows.length - 1; i >= 0; i -= 1) {
        const call = toRecord(rows[i]);
        if (!call) {
            continue;
        }
        const toolName = asString(call.toolName);
        const errorCode = asString(call.errorCode);
        if (toolName !== "generateDraft" || errorCode !== "DRAFT_AMBIGUOUS_TARGET") {
            continue;
        }
        const metadata = toRecord(call.metadata);
        const candidates = Array.isArray(metadata?.candidates) ? metadata.candidates : [];
        const selectionRaw = asString(metadata?.selectionMode);
        const selectionMode = selectionRaw === "single" || selectionRaw === "multi" ? selectionRaw : null;
        return { candidates, selectionMode };
    }
    return { candidates: [], selectionMode: null };
}
function normalizeDisambiguationCandidates(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows
        .map((row) => {
        const candidate = toRecord(row);
        if (!candidate) {
            return null;
        }
        const entityType = normalizeDisambiguationEntityType(candidate.type ?? candidate.entityType);
        const entityId = candidate.id ?? candidate.entityId;
        if (!entityType || (typeof entityId !== "number" && typeof entityId !== "string")) {
            return null;
        }
        const label = asString(candidate.label) ||
            asString(candidate.name) ||
            asString(candidate.title) ||
            asString(candidate.reference) ||
            `${entityType} ${String(entityId)}`;
        return {
            entityType,
            entityId,
            label,
            subtitle: asString(candidate.reference) || null,
            metadata: {
                ...(asString(candidate.sourceTool)
                    ? { source: asString(candidate.sourceTool) }
                    : asString(toRecord(candidate.metadata)?.source)
                        ? { source: asString(toRecord(candidate.metadata)?.source) }
                        : {}),
                ...(asString(toRecord(candidate.metadata)?.status)
                    ? { status: asString(toRecord(candidate.metadata)?.status) }
                    : {}),
                ...(asString(toRecord(candidate.metadata)?.reference)
                    ? { reference: asString(toRecord(candidate.metadata)?.reference) }
                    : {}),
            },
        };
    })
        .filter((row) => Boolean(row));
}
function normalizeSessionDisambiguationCandidates(value) {
    const rows = Array.isArray(value) ? value : [];
    return rows
        .map((row) => {
        const entity = toRecord(row);
        if (!entity) {
            return null;
        }
        const entityType = normalizeDisambiguationEntityType(entity.type);
        const entityId = entity.id;
        if (!entityType || (typeof entityId !== "number" && typeof entityId !== "string")) {
            return null;
        }
        const label = asString(entity.label) ||
            asString(entity.name) ||
            asString(entity.title) ||
            asString(entity.reference) ||
            `${entityType} ${String(entityId)}`;
        const metadata = {};
        if (asString(entity.sourceTool)) {
            metadata.source = asString(entity.sourceTool);
        }
        if (asString(entity.status)) {
            metadata.status = asString(entity.status);
        }
        if (asString(entity.reference)) {
            metadata.reference = asString(entity.reference);
        }
        const scope = {};
        const numericId = Number(entityId);
        if (Number.isFinite(numericId) && numericId > 0) {
            applyScopedEntityId(scope, entityType, numericId);
        }
        if (entity.client_id || entity.clientId) {
            scope.clientId = Number(entity.client_id ?? entity.clientId);
        }
        return {
            entityType,
            entityId,
            label,
            subtitle: asString(entity.reference) || null,
            metadata,
            scope,
        };
    })
        .filter((row) => Boolean(row));
}
function normalizeDisambiguationEntityType(value) {
    const raw = String(value || "").trim().toLowerCase().replace(/\s+/g, "_");
    if (!raw) {
        return "";
    }
    if (raw === "invoice" || raw === "invoices" || raw === "financial" || raw === "financial_entries") {
        return "financial_entry";
    }
    if (raw === "personal-task" || raw === "personaltask" || raw === "personal_tasks") {
        return "personal_task";
    }
    if (raw === "documents") {
        return "document";
    }
    if (raw === "clients") {
        return "client";
    }
    if (raw === "dossiers") {
        return "dossier";
    }
    if (raw === "lawsuits") {
        return "lawsuit";
    }
    if (raw === "sessions") {
        return "session";
    }
    if (raw === "tasks") {
        return "task";
    }
    if (raw === "missions") {
        return "mission";
    }
    if (raw === "notifications") {
        return "notification";
    }
    if (raw === "officers") {
        return "officer";
    }
    return raw;
}
function buildDisambiguationSuggestion(candidate, disambiguationType, index) {
    const scope = { ...(toRecord(candidate.scope) ?? {}) };
    const numericId = Number(candidate.entityId);
    if (Number.isFinite(numericId) && numericId > 0) {
        applyScopedEntityId(scope, disambiguationType, numericId);
    }
    return {
        id: `disamb_${index}_${String(candidate.entityId)}`,
        entityType: disambiguationType,
        entityId: candidate.entityId,
        label: candidate.label,
        subtitle: candidate.subtitle ?? null,
        metadata: toRecord(candidate.metadata) ?? {},
        intent: "RESOLVE_CONTEXT_AND_CONTINUE",
        scope,
    };
}
function applyScopedEntityId(scope, entityType, numericId) {
    switch (entityType) {
        case "client":
            scope.clientId = numericId;
            break;
        case "dossier":
            scope.dossierId = numericId;
            break;
        case "lawsuit":
            scope.lawsuitId = numericId;
            break;
        case "session":
            scope.sessionId = numericId;
            break;
        case "task":
            scope.taskId = numericId;
            break;
        case "mission":
            scope.missionId = numericId;
            break;
        case "personal_task":
            scope.personalTaskId = numericId;
            break;
        case "financial_entry":
            scope.financialEntryId = numericId;
            break;
        default:
            break;
    }
}
function resolveMutationEventsBuilder() {
    if (cachedMutationEventsBuilder !== undefined) {
        return cachedMutationEventsBuilder;
    }
    const candidates = [
        "../../realtime/entityMutationEvents",
        node_path_1.default.resolve(process.cwd(), "src/realtime/entityMutationEvents"),
        node_path_1.default.resolve(process.cwd(), "backend/src/realtime/entityMutationEvents"),
    ];
    for (const candidate of candidates) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const moduleValue = require(candidate);
            if (typeof moduleValue?.buildMutationEventsFromExecution === "function") {
                cachedMutationEventsBuilder = moduleValue
                    .buildMutationEventsFromExecution;
                return cachedMutationEventsBuilder;
            }
        }
        catch {
            continue;
        }
    }
    cachedMutationEventsBuilder = null;
    return null;
}
function emitEntityMutationSuccessEvents(emitter, input, output) {
    const metadata = toRecord(output.metadata);
    const confirmedAction = toRecord(metadata?.confirmedAction);
    const confirmedExecution = toRecord(metadata?.confirmedExecutionResult);
    if (!confirmedAction || !confirmedExecution) {
        return;
    }
    const proposal = buildMutationProposalShape(confirmedAction);
    if (!proposal) {
        return;
    }
    const buildMutationEventsFromExecution = resolveMutationEventsBuilder();
    if (typeof buildMutationEventsFromExecution !== "function") {
        return;
    }
    const resultData = toRecord(confirmedExecution.data) ?? {};
    const executionEnvelope = {
        executedActions: [
            {
                actionType: proposal.actionType,
                params: proposal.params,
                result: {
                    ...resultData,
                    ok: confirmedExecution.ok === true,
                },
            },
        ],
    };
    const events = buildMutationEventsFromExecution({
        proposal,
        executionResult: executionEnvelope,
        sessionId: input.sessionId,
        source: "agent",
    });
    for (const event of events) {
        if (!event || typeof event !== "object")
            continue;
        emitter.emit({
            type: "entity_mutation_success",
            event: event,
        });
    }
}
function buildMutationProposalShape(confirmedAction) {
    const plan = toRecord(confirmedAction.plan);
    if (plan) {
        const diagnostics = toRecord(plan.diagnostics);
        const linkResolution = toRecord(diagnostics?.linkResolution);
        const linkResolutionStatus = asString(linkResolution?.status);
        const linkResolutionSourceTrace = resolveLinkResolutionSourceTrace(linkResolution);
        const rootOperation = toRecord(plan.rootOperation) ||
            toRecord(plan.operation) ||
            null;
        const params = rootOperation
            ? {
                entityType: asString(rootOperation.entityType) ?? undefined,
                entityId: coerceNumber(rootOperation.entityId),
                ...(toRecord(rootOperation.payload) ? { payload: toRecord(rootOperation.payload) } : {}),
                ...(toRecord(rootOperation.changes) ? { changes: toRecord(rootOperation.changes) } : {}),
                ...(linkResolutionStatus ? { linkResolutionStatus } : {}),
                ...(linkResolutionSourceTrace ? { linkResolutionSourceTrace } : {}),
            }
            : {};
        const workflowSteps = Array.isArray(plan.workflowSteps) ? plan.workflowSteps : [];
        if (workflowSteps.length > 0) {
            return {
                actionType: "EXECUTE_MUTATION_WORKFLOW",
                params,
            };
        }
        const rootOp = asString(rootOperation?.operation)?.toLowerCase() || "";
        return {
            actionType: rootOp === "create"
                ? "CREATE_ENTITY"
                : rootOp === "delete"
                    ? "DELETE_ENTITY"
                    : "UPDATE_ENTITY",
            params,
        };
    }
    const toolName = asString(confirmedAction.toolName)?.toLowerCase() || "";
    const args = toRecord(confirmedAction.args) || {};
    if (toolName === "proposecreate") {
        return { actionType: "CREATE_ENTITY", params: args };
    }
    if (toolName === "proposedelete") {
        return { actionType: "DELETE_ENTITY", params: args };
    }
    if (toolName === "attachtoentity") {
        return { actionType: "ATTACH_TO_ENTITY", params: args };
    }
    if (toolName === "proposeupdate" || toolName === "proposeupsert") {
        return { actionType: "UPDATE_ENTITY", params: args };
    }
    return null;
}
function resolveLinkResolutionSourceTrace(linkResolution) {
    if (!linkResolution)
        return undefined;
    const source = asString(linkResolution.source);
    const status = asString(linkResolution.status);
    if (source === "payload") {
        return "explicit";
    }
    if (source === "active_entities") {
        return "fallback";
    }
    if (source === "draft_context") {
        return "resolved";
    }
    if (status === "resolved") {
        return "resolved";
    }
    return undefined;
}
function buildDisambiguationSelectionPolicy(message, preferredMode) {
    const normalized = String(message || "").toLowerCase();
    const isAggregate = AGGREGATE_SELECTION_PATTERN.test(normalized);
    const mode = preferredMode === "multi" || preferredMode === "single"
        ? preferredMode
        : isAggregate
            ? "multi"
            : "single";
    return {
        mode,
        allowAll: true,
        allowNone: true,
        maxChoices: MAX_DISAMBIGUATION_CANDIDATES,
    };
}
function buildDisambiguationActions(selectionPolicy) {
    const mode = asString(selectionPolicy.mode) === "multi" ? "multi" : "single";
    const allowAll = selectionPolicy.allowAll === true;
    const allowNone = selectionPolicy.allowNone === true;
    const actions = [
        {
            id: mode === "multi" ? "use_selected_multi" : "use_selected_single",
            label: mode === "multi" ? "Continue with selected" : "Continue with selection",
            decision: mode,
        },
    ];
    if (allowAll) {
        actions.push({ id: "use_all", label: "Use all matches", decision: "all" });
    }
    if (allowNone) {
        actions.push({ id: "use_none", label: "None of these", decision: "none" });
    }
    return actions;
}
