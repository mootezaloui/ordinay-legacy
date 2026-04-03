import path from "node:path";
import type { Session } from "../session";
import {
  type AgentTurnInput,
  type AgentTurnOutput,
} from "../types";
import type {
  DraftArtifact,
  PlanArtifact,
  PlanExecutedArtifact,
  PlanRejectedArtifact,
  SuggestionArtifact,
} from "../types";
import { StreamEmitter, type StreamEvent } from "./stream.emitter";
import { createAgentV2Runtime, type AgentV2Runtime } from "./runtime.factory";

const TEXT_CHUNK_SIZE = 200;
const PERFORMANCE_SNAPSHOT_EVENT_TYPE = "performance_snapshot";
const UX_PREFLIGHT_BYPASS_REASON =
  "UX preflight bypassed: message routed directly to the agentic loop.";
type RuntimeMode = "READ_ONLY" | "DRAFT" | "EXECUTE" | "AUTONOMOUS";
type RuntimeTurnInput = AgentTurnInput & { mode: RuntimeMode };
const MODELESS_CONTRACT_RUNTIME_MODE: RuntimeMode = "EXECUTE";
type MutationEventsBuilder = (payload?: Record<string, unknown>) => Array<Record<string, unknown>>;
let cachedMutationEventsBuilder: MutationEventsBuilder | null | undefined;

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
          modelPreference:
            typeof (toRecord(input.metadata)?.modelPreference) === "string"
              ? String((toRecord(input.metadata) as Record<string, unknown>).modelPreference)
              : undefined,
          requestSource:
            typeof (toRecord(input.metadata)?.requestSource) === "string"
              ? String((toRecord(input.metadata) as Record<string, unknown>).requestSource)
              : undefined,
          requestTriggerId:
            typeof (toRecord(input.metadata)?.requestTriggerId) === "string"
              ? String((toRecord(input.metadata) as Record<string, unknown>).requestTriggerId)
              : undefined,
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
      } catch (_ixErr) {
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
      const uxDecision = toRecord(uxPreflight.metadata)?.uxDecision;
      console.info(
        "[AGENT_V2_UX_PREFLIGHT_BYPASSED]",
        safeDiagnosticJson({
          sessionId: input.sessionId,
          turnId: input.turnId,
          action: asString(toRecord(uxDecision)?.action) ?? "proceed",
          reason: truncateForDiagnostics(asString(toRecord(uxDecision)?.reason) || "", 180),
        }),
      );

      const loopOutput = mergePreflightMetadata(
        await runtime.loop.run(input, session, {
          onTextDelta: (delta: string) => {
            if (typeof delta !== "string" || delta.length === 0) {
              return;
            }
            deliveredLiveText = true;
            emitter.emit({ type: "text_delta", delta });
          },
          onDraftArtifact: (artifact) => {
            deliveredDraftArtifact = true;
            console.info(
              "[DRAFT_TRACE_SSE_EMIT_DRAFT_ARTIFACT]",
              safeDiagnosticJson({
                sessionId: input.sessionId,
                turnId: input.turnId,
                draftType: artifact?.draftType,
                title: artifact?.title,
                version: artifact?.version,
                sectionCount: Array.isArray(artifact?.sections) ? artifact.sections.length : 0,
              }),
            );
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
            console.info(
              "[AGENT_SUGGESTION_SSE_EMIT]",
              safeDiagnosticJson({
                sessionId: input.sessionId,
                turnId: input.turnId,
                source: "loop_callback",
                domain: artifact?.domain,
                actionType: artifact?.actionType,
                targetType: artifact?.targetType,
              }),
            );
            emitter.emit({ type: "suggestion_artifact", artifact });
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
      if (input.mode === "DRAFT") {
        const draftToolCalls = (output.toolCalls || []).filter(
          (call) => String(call?.toolName || "").trim() === "generateDraft",
        ).length;
        console.info(
          "[DRAFT_TRACE_TURN_SUMMARY]",
          safeDiagnosticJson({
            sessionId: input.sessionId,
            turnId: input.turnId,
            draftToolCalls,
            totalToolCalls: Array.isArray(output.toolCalls) ? output.toolCalls.length : 0,
            responseLength: String(output.responseText || "").length,
          }),
        );
      }
      if (!deliveredDraftArtifact) {
        const fallbackDraftArtifact = extractDraftArtifactFromOutput(output);
        if (fallbackDraftArtifact) {
          deliveredDraftArtifact = true;
          console.info(
            "[DRAFT_TRACE_SSE_EMIT_DRAFT_ARTIFACT_FALLBACK]",
            safeDiagnosticJson({
              sessionId: input.sessionId,
              turnId: input.turnId,
              draftType: fallbackDraftArtifact.draftType,
              title: fallbackDraftArtifact.title,
              version: fallbackDraftArtifact.version,
              sectionCount: Array.isArray(fallbackDraftArtifact.sections)
                ? fallbackDraftArtifact.sections.length
                : 0,
            }),
          );
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
          console.info(
            "[AGENT_SUGGESTION_SSE_EMIT]",
            safeDiagnosticJson({
              sessionId: input.sessionId,
              turnId: input.turnId,
              source: "output_metadata_fallback",
              domain: fallbackSuggestionArtifact.domain,
              actionType: fallbackSuggestionArtifact.actionType,
              targetType: fallbackSuggestionArtifact.targetType,
            }),
          );
          emitter.emit({ type: "suggestion_artifact", artifact: fallbackSuggestionArtifact });
        }
      }

      emitOutput(emitter, output, deliveredLiveText);
      const webSearchArtifactEvent = buildWebSearchArtifactEvent(input, output);
      if (webSearchArtifactEvent) {
        emitter.emit(webSearchArtifactEvent);
      }
      emitEntityMutationSuccessEvents(emitter, input, output);

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
  | { ok: true; input: RuntimeTurnInput }
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
  input: RuntimeTurnInput,
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
  input: RuntimeTurnInput,
): AuthScopeDecision {
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

function resolveRequestedAction(input: RuntimeTurnInput): string | undefined {
  const metadata = toRecord(input?.metadata);
  const securityMetadata = toRecord(metadata?.security);
  return (
    asString(securityMetadata?.requestedAction) ??
    asString(metadata?.requestedAction) ??
    undefined
  );
}

function attachSecurityMetadata(
  input: RuntimeTurnInput,
  securityContext: Record<string, unknown>,
): RuntimeTurnInput {
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

function buildWebSearchArtifactEvent(
  input: AgentTurnInput,
  output: AgentTurnOutput,
): Extract<StreamEvent, { type: "artifact" }> | null {
  const toolCalls = Array.isArray(output.toolCalls) ? output.toolCalls : [];
  let sawWebSearchCall = false;
  let lastWebSearchCallMetadataKeys: string[] = [];
  for (let index = toolCalls.length - 1; index >= 0; index -= 1) {
    const call = toolCalls[index];
    if (!call || call.ok !== true || String(call.toolName || "").trim() !== "mcpWebSearch") {
      continue;
    }
    sawWebSearchCall = true;
    const metadata = toRecord(call.metadata);
    lastWebSearchCallMetadataKeys = metadata ? Object.keys(metadata) : [];
    const result =
      toRecord(metadata?.webSearchResult) ??
      toRecord(metadata?.result) ??
      toRecord(metadata?.data) ??
      (looksLikeWebSearchResult(metadata) ? metadata : null);
    if (!result) {
      continue;
    }
    const artifact = toWebSearchArtifactOutput(input, result);
    if (!artifact) {
      continue;
    }
    console.info(
      "[AGENT_WEBSEARCH_SSE_EMIT]",
      safeDiagnosticJson({
        sessionId: input.sessionId,
        turnId: input.turnId,
        source: "tool_call_metadata",
        resultCount: coerceNumber(artifact.resultCount) ?? 0,
        status: asString(artifact.status) ?? "complete",
      }),
    );
    return {
      type: "artifact",
      output: artifact,
      intent: "WEB_SEARCH",
      visibility: "visible",
      interactionMode: "operational",
    };
  }
  if (sawWebSearchCall) {
    console.warn(
      "[AGENT_WEBSEARCH_SSE_MISSING_ARTIFACT]",
      safeDiagnosticJson({
        sessionId: input.sessionId,
        turnId: input.turnId,
        reason: "websearch_tool_call_found_but_result_metadata_not_extractable",
        metadataKeys: lastWebSearchCallMetadataKeys,
      }),
    );
  }
  return null;
}

function looksLikeWebSearchResult(value: Record<string, unknown> | null): boolean {
  if (!value) return false;
  const hasQuery = asNonEmptyString(value.query) !== null;
  const hasResults = Array.isArray(value.results);
  const hasStatus = asNonEmptyString(value.status) !== null;
  const hasProvider = asNonEmptyString(value.provider) !== null;
  return hasResults || (hasQuery && (hasStatus || hasProvider));
}

function toWebSearchArtifactOutput(
  input: AgentTurnInput,
  result: Record<string, unknown>,
): Record<string, unknown> | null {
  const query = asNonEmptyString(result.query) ?? asNonEmptyString(input.message) ?? "";
  if (!query) {
    return null;
  }

  const status = normalizeWebSearchStatus(result.status);
  const reason = asNonEmptyString(result.reason);
  const parsedResults = normalizeWebSearchItems(result.results);
  const triggeredBy = normalizeWebSearchTrigger(toRecord(input.metadata)?.webSearchTrigger);
  const provider = asNonEmptyString(result.provider) ?? "langsearch";
  const message = buildWebSearchStatusMessage(status, reason, parsedResults.length);
  const sourceRows = parsedResults.map((item) => ({
    sourceType: "web",
    reference: item.url,
    note: item.source || item.title,
  }));

  return {
    type: "web_search_results",
    query,
    searchIntent: "WEB_SEARCH",
    triggeredBy,
    provider,
    results: parsedResults,
    resultCount: parsedResults.length,
    message,
    sources: sourceRows,
    timestamp: new Date().toISOString(),
    status,
    aiSummary: null,
    source: "agent_v2_langsearch",
    requires_validation: true,
  };
}

function normalizeWebSearchStatus(value: unknown): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (
    normalized === "complete" ||
    normalized === "rate_limited" ||
    normalized === "error" ||
    normalized === "unavailable"
  ) {
    return normalized;
  }
  return "complete";
}

function normalizeWebSearchTrigger(
  value: unknown,
): "explicit_language" | "button" | "user_confirmed" {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "button") {
    return "button";
  }
  if (normalized === "user_confirmed") {
    return "user_confirmed";
  }
  return "explicit_language";
}

function normalizeWebSearchItems(value: unknown): Array<Record<string, unknown>> {
  const list = Array.isArray(value) ? value : [];
  const normalized: Array<Record<string, unknown>> = [];
  for (let index = 0; index < list.length; index += 1) {
    const item = toRecord(list[index]);
    if (!item) continue;
    const url = asNonEmptyString(item.url);
    if (!url) continue;
    normalized.push({
      id: asNonEmptyString(item.id) ?? String(index + 1),
      title: asNonEmptyString(item.title) ?? "Untitled result",
      snippet: asNonEmptyString(item.snippet) ?? "",
      url,
      source: asNonEmptyString(item.source) ?? null,
      publishedDate:
        asNonEmptyString(item.publishedDate) ??
        asNonEmptyString(item.datePublished) ??
        null,
    });
  }
  return normalized;
}

function buildWebSearchStatusMessage(
  status: string,
  reason: string | null,
  resultCount: number,
): string | null {
  if (status === "complete") {
    if (resultCount === 0) {
      return "No external results found for this query.";
    }
    return null;
  }
  if (status === "rate_limited") {
    return "External search is currently rate-limited. Please retry shortly.";
  }
  if (status === "error") {
    if (reason === "invalid_api_key") {
      return "External search is misconfigured. Check the LangSearch API key.";
    }
    return "External search failed.";
  }
  return "External search provider is unavailable right now.";
}

function extractDraftArtifactFromOutput(output: AgentTurnOutput): DraftArtifact | null {
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
  if (
    !draftType ||
    !title ||
    !generatedAt ||
    !sections ||
    !layout ||
    !Number.isFinite(versionRaw) ||
    versionRaw <= 0
  ) {
    return null;
  }

  return artifact as unknown as DraftArtifact;
}

function extractPlanArtifactFromOutput(output: AgentTurnOutput): PlanArtifact | null {
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
  if (
    (operationType !== "create" && operationType !== "update" && operationType !== "delete") ||
    !entityType
  ) {
    return null;
  }

  return artifact as unknown as PlanArtifact;
}

function extractPlanExecutedArtifactFromOutput(
  output: AgentTurnOutput,
): PlanExecutedArtifact | null {
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

  return artifact as unknown as PlanExecutedArtifact;
}

function extractPlanRejectedArtifactFromOutput(
  output: AgentTurnOutput,
): PlanRejectedArtifact | null {
  const metadata = toRecord(output?.metadata);
  const artifact = toRecord(metadata?.planRejectedArtifact);
  if (!artifact) {
    return null;
  }
  const pendingActionId = asString(artifact.pendingActionId);
  if (!pendingActionId) {
    return null;
  }
  return artifact as unknown as PlanRejectedArtifact;
}

function extractSuggestionArtifactFromOutput(output: AgentTurnOutput): SuggestionArtifact | null {
  const metadata = toRecord(output?.metadata);
  const artifact = toRecord(metadata?.suggestionArtifact);
  if (!artifact) {
    return null;
  }
  const actionType = parseSuggestionActionType(artifact.actionType);
  const targetType = asNonEmptyString(artifact.targetType);
  const title = asNonEmptyString(artifact.title);
  const reason = asNonEmptyString(artifact.reason);
  if (!actionType || !targetType || !title || !reason) {
    return null;
  }
  const normalizedDomain = normalizeSuggestionDomain(
    parseSuggestionDomain(artifact.domain),
    actionType,
  );
  const normalizedTrigger =
    parseSuggestionTrigger(artifact.trigger) ?? "proactive_context";
  const linkedEntityType = asNonEmptyString(artifact.linkedEntityType) ?? undefined;
  const linkedEntityId = coerceSuggestionEntityId(artifact.linkedEntityId);
  const prefillData = toRecord(artifact.prefillData) ?? {};

  return {
    version: "v1",
    domain: normalizedDomain,
    trigger: normalizedTrigger,
    actionType,
    targetType,
    title,
    reason,
    ...(linkedEntityType ? { linkedEntityType } : {}),
    ...(typeof linkedEntityId !== "undefined" ? { linkedEntityId } : {}),
    prefillData,
  };
}

function parseSuggestionActionType(
  value: unknown,
): SuggestionArtifact["actionType"] | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "create") return "create";
  if (normalized === "update") return "update";
  if (normalized === "delete") return "delete";
  return null;
}

function parseSuggestionDomain(
  value: unknown,
): SuggestionArtifact["domain"] | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "draft") return "draft";
  if (normalized === "execute") return "execute";
  return null;
}

function parseSuggestionTrigger(
  value: unknown,
): SuggestionArtifact["trigger"] | null {
  const normalized = asNonEmptyString(value)?.toLowerCase();
  if (normalized === "implicit_intent") return "implicit_intent";
  if (normalized === "proactive_context") return "proactive_context";
  return null;
}

function normalizeSuggestionDomain(
  domain: SuggestionArtifact["domain"] | null,
  actionType: SuggestionArtifact["actionType"],
): SuggestionArtifact["domain"] {
  const inferred: SuggestionArtifact["domain"] =
    actionType === "draft" ? "draft" : "execute";
  if (!domain) {
    return inferred;
  }
  if (actionType === "draft" && domain !== "draft") {
    return inferred;
  }
  if (actionType !== "draft" && domain !== "execute") {
    return inferred;
  }
  return domain;
}

function coerceSuggestionEntityId(value: unknown): number | string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  const text = asNonEmptyString(value);
  return text ?? undefined;
}

function parseInput(payload: unknown):
  | { ok: true; input: RuntimeTurnInput }
  | { ok: false; message: string } {
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

function evaluateUxPreflight(
  _runtime: AgentV2Runtime,
  _input: RuntimeTurnInput,
  _session: Session,
): UxPreflightResult {
  return {
    handled: false,
    action: "proceed",
    metadata: {
      uxDecision: {
        action: "proceed",
        posture: "direct_answer",
        ambiguityKind: "none",
        ambiguityConfidence: "low",
        workflowType: "none",
        reason: UX_PREFLIGHT_BYPASS_REASON,
      },
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
  input: RuntimeTurnInput,
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

function isGroundingDisabled(runtime: AgentV2Runtime): boolean {
  return Boolean(
    runtime.operations?.safeMode?.isGroundingDisabled &&
    runtime.operations.safeMode.isGroundingDisabled() === true,
  );
}

function clampModeBySafeMode(
  runtime: AgentV2Runtime,
  input: RuntimeTurnInput,
): RuntimeTurnInput {
  const shouldClamp =
    runtime.operations?.safeMode?.isAgentV2ReadOnlyForced &&
    runtime.operations.safeMode.isAgentV2ReadOnlyForced() === true;
  if (!shouldClamp || input.mode === "READ_ONLY") {
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
    mode: "READ_ONLY",
    metadata,
  };
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
  input: RuntimeTurnInput,
): Promise<Session> {
  const existing = await runtime.sessionStore.getOrLoadSession(input.sessionId);
  if (existing) {
    return existing;
  }
  return runtime.sessionStore.createSession({
    sessionId: input.sessionId,
    userId: input.userId,
  });
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

function coerceNumber(value: unknown): number | undefined {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  return undefined;
}

function asNonEmptyString(value: unknown): string | null {
  const text = asString(value)?.trim();
  return text || null;
}

function normalizeRuntimeMode(value: unknown): RuntimeMode | null {
  const normalized = String(value || "").trim().toUpperCase();
  if (normalized === "READ_ONLY") return "READ_ONLY";
  if (normalized === "DRAFT") return "DRAFT";
  if (normalized === "EXECUTE") return "EXECUTE";
  if (normalized === "AUTONOMOUS") return "AUTONOMOUS";
  return null;
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
const AGGREGATE_SELECTION_PATTERN =
  /\b(all|every|latest|recent|multiple|several|many|unpaid|overdue|open invoices?|all invoices?)\b/i;

function detectDisambiguation(
  uxPreflight: UxPreflightResult,
  output: AgentTurnOutput,
  session: Session,
  input: RuntimeTurnInput,
): Record<string, unknown> | null {
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
  const candidatePool =
    decisionCandidates.length > 0
      ? decisionCandidates
      : draftCandidates.length > 0
      ? draftCandidates
      : sessionCandidates;
  if (candidatePool.length < 2) {
    return null;
  }

  const byType = new Map<string, DisambiguationCandidate[]>();
  for (const candidate of candidatePool) {
    if (!candidate.entityType) {
      continue;
    }
    const list = byType.get(candidate.entityType) || [];
    list.push(candidate);
    byType.set(candidate.entityType, list);
  }

  let disambiguationType = "";
  let disambiguationCandidates: DisambiguationCandidate[] = [];
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
  const entityTypePlural =
    disambiguationType.endsWith("s") ? disambiguationType : `${disambiguationType}s`;
  const selectionPolicy = buildDisambiguationSelectionPolicy(
    input.message,
    draftAmbiguity.selectionMode,
  );
  const actions = buildDisambiguationActions(selectionPolicy);

  return {
    type: "context_suggestion",
    message: `I found ${disambiguationCandidates.length} ${entityTypePlural}. Which one did you mean?`,
    entityType: disambiguationType,
    reason: "multiple_matches",
    originalMessage: input.message,
    suggestions: capped.map((candidate, index) =>
      buildDisambiguationSuggestion(candidate, disambiguationType, index),
    ),
    timestamp: new Date().toISOString(),
    confidence: 0.7,
    allowManualInput: true,
    manualInputHint: "Or provide more details to narrow your search.",
    selectionPolicy,
    actions,
    source:
      decisionCandidates.length > 0
        ? "ux_candidates"
        : draftCandidates.length > 0
        ? "draft_guard"
        : "session_entities",
  };
}

function extractDraftAmbiguityFromToolCalls(
  value: unknown,
): { candidates: unknown[]; selectionMode: "single" | "multi" | null } {
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
    const selectionMode =
      selectionRaw === "single" || selectionRaw === "multi" ? selectionRaw : null;
    return { candidates, selectionMode };
  }
  return { candidates: [], selectionMode: null };
}

interface DisambiguationCandidate {
  entityType: string;
  entityId: string | number;
  label: string;
  subtitle?: string | null;
  metadata?: Record<string, unknown>;
  scope?: Record<string, unknown>;
}

function normalizeDisambiguationCandidates(value: unknown): DisambiguationCandidate[] {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((row) => {
      const candidate = toRecord(row);
      if (!candidate) {
        return null;
      }
      const entityType = normalizeDisambiguationEntityType(
        candidate.type ?? candidate.entityType,
      );
      const entityId = candidate.id ?? candidate.entityId;
      if (!entityType || (typeof entityId !== "number" && typeof entityId !== "string")) {
        return null;
      }
      const label =
        asString(candidate.label) ||
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
      } as DisambiguationCandidate;
    })
    .filter((row): row is DisambiguationCandidate => Boolean(row));
}

function normalizeSessionDisambiguationCandidates(value: unknown): DisambiguationCandidate[] {
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
      const label =
        asString(entity.label) ||
        asString(entity.name) ||
        asString(entity.title) ||
        asString(entity.reference) ||
        `${entityType} ${String(entityId)}`;
      const metadata: Record<string, unknown> = {};
      if (asString(entity.sourceTool)) {
        metadata.source = asString(entity.sourceTool);
      }
      if (asString(entity.status)) {
        metadata.status = asString(entity.status);
      }
      if (asString(entity.reference)) {
        metadata.reference = asString(entity.reference);
      }
      const scope: Record<string, unknown> = {};
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
      } as DisambiguationCandidate;
    })
    .filter((row): row is DisambiguationCandidate => Boolean(row));
}

function normalizeDisambiguationEntityType(value: unknown): string {
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

function buildDisambiguationSuggestion(
  candidate: DisambiguationCandidate,
  disambiguationType: string,
  index: number,
): Record<string, unknown> {
  const scope: Record<string, unknown> = { ...(toRecord(candidate.scope) ?? {}) };
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

function applyScopedEntityId(scope: Record<string, unknown>, entityType: string, numericId: number): void {
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

function resolveMutationEventsBuilder(): MutationEventsBuilder | null {
  if (cachedMutationEventsBuilder !== undefined) {
    return cachedMutationEventsBuilder;
  }

  const candidates = [
    "../../realtime/entityMutationEvents",
    path.resolve(process.cwd(), "src/realtime/entityMutationEvents"),
    path.resolve(process.cwd(), "backend/src/realtime/entityMutationEvents"),
  ];

  for (const candidate of candidates) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const moduleValue = require(candidate) as {
        buildMutationEventsFromExecution?: unknown;
      };
      if (typeof moduleValue?.buildMutationEventsFromExecution === "function") {
        cachedMutationEventsBuilder = moduleValue
          .buildMutationEventsFromExecution as MutationEventsBuilder;
        return cachedMutationEventsBuilder;
      }
    } catch {
      continue;
    }
  }

  cachedMutationEventsBuilder = null;
  return null;
}

function emitEntityMutationSuccessEvents(
  emitter: StreamEmitter,
  input: AgentTurnInput,
  output: AgentTurnOutput,
): void {
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
    if (!event || typeof event !== "object") continue;
    emitter.emit({
      type: "entity_mutation_success",
      event: event as Record<string, unknown>,
    });
  }
}

function buildMutationProposalShape(
  confirmedAction: Record<string, unknown>,
): { actionType: string; params: Record<string, unknown> } | null {
  const plan = toRecord(confirmedAction.plan);
  if (plan) {
    const diagnostics = toRecord(plan.diagnostics);
    const linkResolution = toRecord(diagnostics?.linkResolution);
    const linkResolutionStatus = asString(linkResolution?.status);
    const linkResolutionSourceTrace = resolveLinkResolutionSourceTrace(linkResolution);
    const rootOperation =
      toRecord(plan.rootOperation) ||
      toRecord(plan.operation) ||
      null;
    const params = rootOperation
      ? {
          entityType: asString(rootOperation.entityType) ?? undefined,
          entityId: coerceNumber(rootOperation.entityId),
          ...(toRecord(rootOperation.payload) ? { payload: toRecord(rootOperation.payload)! } : {}),
          ...(toRecord(rootOperation.changes) ? { changes: toRecord(rootOperation.changes)! } : {}),
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
      actionType:
        rootOp === "create"
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

function resolveLinkResolutionSourceTrace(
  linkResolution: Record<string, unknown> | null,
): "explicit" | "resolved" | "fallback" | undefined {
  if (!linkResolution) return undefined;
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

function buildDisambiguationSelectionPolicy(
  message: string,
  preferredMode?: "single" | "multi" | null,
): Record<string, unknown> {
  const normalized = String(message || "").toLowerCase();
  const isAggregate = AGGREGATE_SELECTION_PATTERN.test(normalized);
  const mode =
    preferredMode === "multi" || preferredMode === "single"
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

function buildDisambiguationActions(
  selectionPolicy: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const mode = asString(selectionPolicy.mode) === "multi" ? "multi" : "single";
  const allowAll = selectionPolicy.allowAll === true;
  const allowNone = selectionPolicy.allowNone === true;
  const actions: Array<Record<string, unknown>> = [
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
