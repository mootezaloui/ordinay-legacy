import type { Session } from "../session";
import {
  AgentMode,
  TurnType,
  type AgentTurnInput,
  type AgentTurnOutput,
} from "../types";
import { StreamEmitter } from "./stream.emitter";
import { createAgentV2Runtime, type AgentV2Runtime } from "./runtime.factory";

const TEXT_CHUNK_SIZE = 200;
const PERFORMANCE_SNAPSHOT_EVENT_TYPE = "performance_snapshot";

interface RequestLike {
  body?: unknown;
  headers?: Record<string, unknown>;
  ip?: string;
  user?: unknown;
  socket?: { remoteAddress?: string };
}

interface ResponseLike {
  setHeader(name: string, value: string): void;
  write(chunk: string): boolean;
  end(): void;
  flushHeaders?: () => void;
  flush?: () => void;
  socket?: { setNoDelay?: (enable?: boolean) => void };
  headersSent?: boolean;
  writableEnded?: boolean;
}

interface UxPreflightResult {
  handled: boolean;
  action?: string;
  responseText?: string;
  metadata?: Record<string, unknown>;
}

interface SecurityRuntimeLike {
  sanitizeAgentInput?: (rawInput: unknown) => unknown;
  resolveRateLimitKey?: (context?: Record<string, unknown>) => string;
  checkRateLimit?: (context?: Record<string, unknown>) => Record<string, unknown>;
  evaluateAuthScope?: (params?: Record<string, unknown>) => Record<string, unknown>;
}

interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  resetAt: number;
  reason?: string;
}

interface AuthScopeDecision {
  allowed: boolean;
  scope: string;
  reason?: string;
}

export { createAgentV2Runtime };

export function createAgentV2StreamHandler(runtime: AgentV2Runtime) {
  return async function handleAgentV2Stream(
    req: RequestLike,
    res: ResponseLike,
  ): Promise<void> {
    const emitter = new StreamEmitter(res);

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
      console.info(
        "[AGENT_V2_STREAM_TURN_START]",
        safeDiagnosticJson({
          sessionId: input.sessionId,
          turnId: input.turnId,
          mode: input.mode,
          messagePreview: truncateForDiagnostics(input.message, 140),
        }),
      );

      const rateLimit = evaluateRateLimit(security, req, input);
      if (!rateLimit.allowed) {
        const message =
          asNonEmptyString(rateLimit.reason) ?? "Rate limit exceeded. Please retry shortly.";
        emitter.emit({ type: "error", message });
        emitter.emit({ type: "done" });
        emitter.close();
        return;
      }

      const authResult = evaluateAuthScope(security, req, input);
      if (!authResult.allowed) {
        const message = asNonEmptyString(authResult.reason) ?? "Not authorized for requested mode.";
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
      } catch (_ixErr) {
        /* non-fatal – retrieval index warm-up */
      }
      runtime.grounding?.beginTurn?.(input.turnId);
      let deliveredLiveText = false;
      const uxPreflight = evaluateUxPreflight(runtime, input, session);
      const loopOutput = uxPreflight.handled
        ? buildUxHandledOutput(input, session, uxPreflight)
        : mergePreflightMetadata(
            await runtime.loop.run(input, session, {
              onTextDelta: (delta: string) => {
                if (typeof delta !== "string" || delta.length === 0) {
                  return;
                }
                deliveredLiveText = true;
                emitter.emit({ type: "text_delta", delta });
              },
            }),
            uxPreflight.metadata,
          );
      const output = applyGroundingPostprocess(runtime, input, session, loopOutput);
      runtime.sessionStore.updateSession(session);
      schedulePerformanceSnapshot(runtime, input, output);
      console.info(
        "[AGENT_V2_STREAM_TURN_END]",
        safeDiagnosticJson({
          sessionId: input.sessionId,
          turnId: input.turnId,
          turnType: output.turnType,
          toolCallsCount: Array.isArray(output.toolCalls) ? output.toolCalls.length : 0,
          pendingAction: Boolean(output.pendingAction),
          responseLength: String(output.responseText || "").length,
        }),
      );

      emitOutput(emitter, output, deliveredLiveText);

      const disambiguation = detectDisambiguation(uxPreflight, output, session, input);
      if (disambiguation) {
        emitter.emit({ type: "disambiguation", payload: disambiguation });
      }

      emitter.emit({ type: "done" });
      emitter.close();
    } catch (error) {
      console.warn(
        "[AGENT_V2_STREAM_ERROR]",
        safeDiagnosticJson({
          message:
            error instanceof Error && error.message.trim().length > 0
              ? error.message
              : String(error || "Agent v2 stream failed"),
        }),
      );
      emitter.emit({
        type: "error",
        message:
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : "Agent v2 stream failed",
      });
      emitter.emit({ type: "done" });
      emitter.close();
    }
  };
}

function parseInputWithSecurity(
  req: RequestLike,
  security: SecurityRuntimeLike | null,
):
  | { ok: true; input: AgentTurnInput }
  | { ok: false; message: string } {
  const payload = req?.body;
  if (!security || typeof security.sanitizeAgentInput !== "function") {
    return parseInput(payload);
  }

  try {
    const sanitized = security.sanitizeAgentInput(payload) as
      | { ok?: boolean; value?: unknown; error?: unknown }
      | undefined;
    if (!sanitized || sanitized.ok !== true || !toRecord(sanitized.value)) {
      const error = toRecord(sanitized?.error);
      return {
        ok: false,
        message: asString(error?.message) ?? "Invalid request payload.",
      };
    }
    return parseInput(sanitized.value);
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Input sanitization failed.",
    };
  }
}

function evaluateRateLimit(
  security: SecurityRuntimeLike | null,
  req: RequestLike,
  input: AgentTurnInput,
): RateLimitDecision {
  if (!security || typeof security.checkRateLimit !== "function") {
    return { allowed: true, remaining: 0, resetAt: 0 };
  }

  const user = getRequestUser(req);
  const context = {
    userId: normalizeRequestUserId(user, input?.userId),
    sessionId: asString(input?.sessionId) ?? undefined,
    ip: getRequestIp(req),
  };
  const key =
    typeof security.resolveRateLimitKey === "function"
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
  } catch (error) {
    return {
      allowed: false,
      remaining: 0,
      resetAt: Date.now() + 60_000,
      reason:
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : "Rate limiter check failed.",
    };
  }
}

function evaluateAuthScope(
  security: SecurityRuntimeLike | null,
  req: RequestLike,
  input: AgentTurnInput,
): AuthScopeDecision {
  if (!security || typeof security.evaluateAuthScope !== "function") {
    if (input.mode === AgentMode.READ_ONLY) {
      return { allowed: true, scope: "unknown" };
    }
    return {
      allowed: false,
      scope: "unknown",
      reason: "Missing auth context only allows READ_ONLY mode.",
    };
  }

  const user = getRequestUser(req);
  const requestedAction =
    input.mode === AgentMode.READ_ONLY
      ? "read"
      : input.mode === AgentMode.DRAFT
      ? "draft"
      : "execute";

  const result = security.evaluateAuthScope({
    user,
    mode: input.mode,
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

function attachSecurityMetadata(
  input: AgentTurnInput,
  securityContext: Record<string, unknown>,
): AgentTurnInput {
  const metadata = toRecord(input?.metadata) ? { ...input.metadata } : {};
  const existing = (toRecord(metadata.security) ?? {}) as Record<string, unknown>;
  metadata.security = {
    ...existing,
    ...securityContext,
  };
  return {
    ...input,
    metadata,
  };
}

function getSecurity(runtime: AgentV2Runtime): SecurityRuntimeLike | null {
  const candidate = (runtime as AgentV2Runtime & { security?: unknown })?.security;
  if (candidate && typeof candidate === "object") {
    return candidate as SecurityRuntimeLike;
  }
  return null;
}

function getRequestUser(req: RequestLike): Record<string, unknown> | null {
  const user = req?.user;
  return toRecord(user) ?? null;
}

function normalizeRequestUserId(
  user: Record<string, unknown> | null,
  fallbackUserId: unknown,
): string | undefined {
  const fromUser = asString(user?.id) || asString(user?.userId) || asString(user?.sub);
  if (fromUser) {
    return fromUser;
  }
  return asString(fallbackUserId) ?? undefined;
}

function getRequestIp(req: RequestLike): string | undefined {
  const xForwardedFor = req?.headers?.["x-forwarded-for"];
  if (typeof xForwardedFor === "string" && xForwardedFor.trim().length > 0) {
    return xForwardedFor.split(",")[0]?.trim();
  }
  return asString(req?.ip) || asString(req?.socket?.remoteAddress) || undefined;
}

function emitOutput(
  emitter: StreamEmitter,
  output: AgentTurnOutput,
  deliveredLiveText: boolean,
): void {
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

function parseInput(payload: unknown):
  | { ok: true; input: AgentTurnInput }
  | { ok: false; message: string } {
  const body = toRecord(payload);
  if (!body) {
    return { ok: false, message: "Invalid payload: expected JSON object body." };
  }

  const sessionId = asNonEmptyString(body.sessionId);
  const turnId = asNonEmptyString(body.turnId);
  const message = asNonEmptyString(body.message);
  const mode = normalizeAgentMode(body.mode);
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
  if (!mode) {
    return { ok: false, message: "Invalid payload: mode is required and must be valid." };
  }

  return {
    ok: true,
    input: {
      sessionId,
      turnId,
      message,
      mode,
      userId: userId || undefined,
      metadata: metadata ?? undefined,
    },
  };
}

function evaluateUxPreflight(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
  session: Session,
): UxPreflightResult {
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
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error || "unknown ux preflight error");
    console.warn(`[agent.ux] pre-loop evaluation skipped: ${message}`);
    return { handled: false };
  }
}

function buildRetrievalContext(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
  session: Session,
): unknown {
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
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error || "unknown retrieval context error");
    console.warn(`[agent.ux] retrieval context unavailable for preflight: ${message}`);
    maybeLogRetrievalDecision(runtime, `retrieval context failed for UX preflight: ${message}`);
    return { text: "", matches: [] };
  }
}

function normalizeUxPreflightResult(value: unknown): UxPreflightResult {
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

function buildUxHandledOutput(
  input: AgentTurnInput,
  session: Session,
  preflight: UxPreflightResult,
): AgentTurnOutput {
  const responseText = (preflight.responseText || "Please provide more details to continue.").trim();
  const turnType = TurnType.NEW;

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

function mergePreflightMetadata(
  output: AgentTurnOutput,
  preflightMetadata?: Record<string, unknown>,
): AgentTurnOutput {
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

function appendSessionTurn(
  session: Session,
  role: "user" | "assistant",
  message: string,
  turnType: TurnType,
): void {
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

function createAuditRecord(
  input: AgentTurnInput,
  eventType: string,
  data: Record<string, unknown>,
) {
  return {
    id: createLocalId("audit"),
    sessionId: input.sessionId,
    turnId: input.turnId,
    eventType,
    timestamp: new Date().toISOString(),
    data,
  };
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }
  return value.slice(0, maxLength - 3).trimEnd() + "...";
}

function createLocalId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function schedulePerformanceSnapshot(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
  output: AgentTurnOutput,
): void {
  const performance = runtime.performance;
  if (!performance || typeof performance.recordTurnAndMaybeSnapshot !== "function") {
    return;
  }

  const metrics = buildSingleTurnMetrics(output);
  const activeStats = {
    sessionCacheSize:
      typeof runtime.sessionStore.getCacheStats === "function"
        ? Number(runtime.sessionStore.getCacheStats().size || 0)
        : 0,
  };

  let snapshot: Record<string, unknown> | null = null;
  try {
    snapshot = performance.recordTurnAndMaybeSnapshot({ metrics, activeStats }) ?? null;
    if (typeof performance.maybeTrimCaches === "function") {
      performance.maybeTrimCaches();
    }
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
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
      await runtime.repository!.appendAudit!(record);
    })
    .catch((error) => {
      const message =
        error instanceof Error && error.message.trim().length > 0
          ? error.message
          : String(error || "unknown persistence error");
      console.warn(`[agent.performance] performance snapshot audit append failed: ${message}`);
    });
}

function buildSingleTurnMetrics(output: AgentTurnOutput): Record<string, unknown> {
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

function applyGroundingPostprocess(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
  session: Session,
  output: AgentTurnOutput,
): AgentTurnOutput {
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
    const citations =
      grounding.buildCitations?.({
        sources,
        mode: citationMode,
      }) ?? { mode: citationMode, entries: [], markers: {}, text: "" };

    const lowSourceDensity =
      grounding.computeLowSourceDensity?.(sources) ??
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
    const shouldAppendCitations =
      grounding.shouldAppendCitations?.({
        researchMode,
        showCitations,
      }) ?? false;

    if (shouldAppendCitations && typeof citations.text === "string" && citations.text.trim()) {
      responseText = appendText(responseText, citations.text);
    }

    const shouldShowLowSourceDisclaimer =
      grounding.shouldShowLowSourceDisclaimer?.({
        lowSourceDensity,
        researchMode,
        showCitations,
      }) ?? false;

    if (shouldShowLowSourceDisclaimer) {
      const disclaimer =
        grounding.getLowSourceDensityDisclaimer?.() ??
        "Evidence coverage is limited for this answer. Please verify critical facts before relying on them.";
      responseText = appendText(responseText, `\n\n${disclaimer}`);
    }

    return {
      ...output,
      responseText,
      metadata,
    };
  } catch (error) {
    const message =
      error instanceof Error && error.message.trim().length > 0
        ? error.message
        : String(error || "unknown grounding error");
    console.warn(`[agent.grounding] output postprocess skipped: ${message}`);
    return output;
  }
}

function isAgentV2Disabled(runtime: AgentV2Runtime): boolean {
  return Boolean(
    runtime.operations?.safeMode?.isAgentV2Disabled &&
    runtime.operations.safeMode.isAgentV2Disabled() === true,
  );
}

function isRetrievalDisabled(runtime: AgentV2Runtime): boolean {
  return Boolean(
    runtime.operations?.safeMode?.isRetrievalDisabled &&
    runtime.operations.safeMode.isRetrievalDisabled() === true,
  );
}

function isGroundingDisabled(runtime: AgentV2Runtime): boolean {
  return Boolean(
    runtime.operations?.safeMode?.isGroundingDisabled &&
    runtime.operations.safeMode.isGroundingDisabled() === true,
  );
}

function clampModeBySafeMode(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
): AgentTurnInput {
  const shouldClamp =
    runtime.operations?.safeMode?.isAgentV2ReadOnlyForced &&
    runtime.operations.safeMode.isAgentV2ReadOnlyForced() === true;
  if (!shouldClamp || input.mode === AgentMode.READ_ONLY) {
    return input;
  }

  const metadata: Record<string, unknown> = toRecord(input.metadata)
    ? { ...(input.metadata as Record<string, unknown>) }
    : {};
  const safeModeMeta = toRecord(metadata.safeMode)
    ? { ...(metadata.safeMode as Record<string, unknown>) }
    : {};
  metadata.safeMode = {
    ...safeModeMeta,
    modeClampedToReadOnly: true,
    originalMode: input.mode,
  };

  return {
    ...input,
    mode: AgentMode.READ_ONLY,
    metadata,
  };
}

function maybeLogRetrievalDecision(runtime: AgentV2Runtime, message: string): void {
  if (
    runtime.operations?.debugFlags?.shouldLogRetrievalDecisions &&
    runtime.operations.debugFlags.shouldLogRetrievalDecisions() === true
  ) {
    console.info(`[agent.operations] ${message}`);
  }
}

function maybeLogGroundingDecision(runtime: AgentV2Runtime, message: string): void {
  if (
    runtime.operations?.debugFlags?.shouldLogVerboseTurnTrace &&
    runtime.operations.debugFlags.shouldLogVerboseTurnTrace() === true
  ) {
    console.info(`[agent.operations] ${message}`);
  }
}

function appendText(base: string, suffix: string): string {
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

async function getOrCreateSession(
  runtime: AgentV2Runtime,
  input: AgentTurnInput,
): Promise<Session> {
  const existing = await runtime.sessionStore.getOrLoadSession(input.sessionId);
  if (existing) {
    return existing;
  }
  return runtime.sessionStore.createSession({
    sessionId: input.sessionId,
    userId: input.userId,
    mode: input.mode,
  });
}

function normalizeAgentMode(value: unknown): AgentMode | null {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim().toUpperCase();
  switch (normalized) {
    case AgentMode.READ_ONLY:
      return AgentMode.READ_ONLY;
    case AgentMode.DRAFT:
      return AgentMode.DRAFT;
    case AgentMode.EXECUTE:
      return AgentMode.EXECUTE;
    case AgentMode.AUTONOMOUS:
      return AgentMode.AUTONOMOUS;
    default:
      return null;
  }
}

function splitText(text: string, chunkSize: number): string[] {
  const value = text.trim();
  const chunks: string[] = [];
  for (let index = 0; index < value.length; index += chunkSize) {
    chunks.push(value.slice(index, index + chunkSize));
  }
  return chunks.length > 0 ? chunks : [value];
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function asNonEmptyString(value: unknown): string | null {
  const text = asString(value)?.trim();
  return text || null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function truncateForDiagnostics(value: string, maxLength: number): string {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, Math.max(maxLength - 3, 1)).trimEnd()}...`;
}

function safeDiagnosticJson(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Unable to serialize diagnostic payload." });
  }
}

const MAX_DISAMBIGUATION_CANDIDATES = 5;

function detectDisambiguation(
  uxPreflight: UxPreflightResult,
  output: AgentTurnOutput,
  session: Session,
  input: AgentTurnInput,
): Record<string, unknown> | null {
  const uxDecision = toRecord(uxPreflight.metadata?.uxDecision);
  if (!uxDecision || uxDecision.action !== "proceed_with_ambiguity") {
    return null;
  }

  const toolCallCount = Array.isArray(output.toolCalls) ? output.toolCalls.length : 0;
  if (toolCallCount === 0) {
    return null;
  }

  const entities = Array.isArray(session.activeEntities) ? session.activeEntities : [];
  if (entities.length < 2) {
    return null;
  }

  const byType = new Map<string, Array<Record<string, unknown>>>();
  for (const entity of entities) {
    const type = String(entity?.type || "").trim().toLowerCase();
    if (!type) {
      continue;
    }
    const list = byType.get(type) || [];
    list.push(entity as unknown as Record<string, unknown>);
    byType.set(type, list);
  }

  let disambiguationType = "";
  let disambiguationEntities: Array<Record<string, unknown>> = [];
  for (const [type, typeEntities] of byType) {
    if (typeEntities.length > 1 && typeEntities.length > disambiguationEntities.length) {
      disambiguationType = type;
      disambiguationEntities = typeEntities;
    }
  }

  if (disambiguationEntities.length < 2) {
    return null;
  }

  const capped = disambiguationEntities.slice(0, MAX_DISAMBIGUATION_CANDIDATES);
  const entityTypePlural =
    disambiguationType.endsWith("s") ? disambiguationType : `${disambiguationType}s`;

  return {
    type: "context_suggestion",
    message: `I found ${disambiguationEntities.length} ${entityTypePlural}. Which one did you mean?`,
    entityType: disambiguationType,
    reason: "multiple_matches",
    originalMessage: input.message,
    suggestions: capped.map((entity, index) => {
      const entityId = entity.id ?? entity[`${disambiguationType}_id`] ?? index;
      const label =
        asString(entity.label) ||
        asString(entity.name) ||
        asString(entity.title) ||
        asString(entity.reference) ||
        `${disambiguationType} ${entityId}`;

      const scope: Record<string, unknown> = {};
      scope[`${disambiguationType}Id`] = entityId;
      if (entity.client_id || entity.clientId) {
        scope.clientId = entity.client_id ?? entity.clientId;
      }

      const metadata: Record<string, unknown> = {};
      if (entity.status) {
        metadata.status = String(entity.status);
      }
      if (entity.reference) {
        metadata.reference = String(entity.reference);
      }
      if (entity.sourceTool) {
        metadata.source = String(entity.sourceTool);
      }

      return {
        id: `disamb_${index}_${String(entityId)}`,
        entityType: disambiguationType,
        entityId,
        label,
        subtitle: asString(entity.reference) || null,
        metadata,
        intent: "RESOLVE_CONTEXT_AND_CONTINUE",
        scope,
      };
    }),
    timestamp: new Date().toISOString(),
    confidence: 0.7,
    allowManualInput: true,
    manualInputHint: "Or provide more details to narrow your search.",
  };
}
