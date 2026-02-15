"use strict";

const express = require("express");
const Ajv = require("ajv");
const addFormats = require("ajv-formats");
const AgentEngine = require("./agent.engine");
const { ChatAgentService } = require("./chat/chat.agent.service");
const { getAvailableCommands } = require("./intent.classifier");
const { streamLLM } = require("./llm/stream.provider");
const eventEnvelopeSchema = require("./schemas/event-envelope.schema.json");
const intentSchema = require("./schemas/intent.schema.json");
const commentarySchema = require("./schemas/commentary.schema.json");
const failureSchema = require("./schemas/failure.schema.json");

const router = express.Router();
const agentEngine = new AgentEngine();
let chatAgentService = new ChatAgentService({ engine: agentEngine });
const streamAjv = new Ajv({
  allErrors: true,
  strict: true,
  allowUnionTypes: true,
});
addFormats(streamAjv);

const validateEnvelope = streamAjv.compile(eventEnvelopeSchema);
const validateIntent = streamAjv.compile(intentSchema);
const validateCommentary = streamAjv.compile(commentarySchema);
const validateFailure = streamAjv.compile(failureSchema);

const DELTA_MAX_CHARS = Math.min(
  Math.max(parseInt(process.env.AGENT_STREAM_DELTA_MAX_CHARS || "32", 10), 20),
  40,
);
const DELTA_FLUSH_MS = Math.min(
  Math.max(parseInt(process.env.AGENT_STREAM_DELTA_FLUSH_MS || "80", 10), 50),
  120,
);

// ============================================================================
// Unified SSE Event Lifecycle
// ============================================================================
/**
 * CRITICAL: SSE Event Contract
 *
 * Event sequence: start → intent → artifact → commentary → done
 *
 * Guarantees:
 * - `done` is ALWAYS emitted (even on error)
 * - `error` always terminates with `done`
 * - No artifact suppression based on posture
 * - Single state machine for all streams
 *
 * Events:
 * - start: { intent: "PENDING", agentVersion }
 * - intent: { message, chunks } (streamed)
 * - artifact: { output, intent }
 * - commentary: { message, chunks, signals } (streamed)
 * - done: { status: "success"|"error", error? }
 */

/**
 * Maps intent to status action text.
 * These are deterministic, no LLM involvement.
 *
 * @param {string} intent - The detected intent
 * @param {string} phase - The processing phase (classifying, fetching, analyzing, etc.)
 * @returns {string} Human-readable status action
 */
function getStatusAction(intent, phase = "processing") {
  const n = (intent || "").toUpperCase();

  // Phase-based status messages
  if (phase === "classifying") {
    return "Analyzing your request…";
  }

  if (phase === "fetching") {
    if (n.includes("SEARCH_WEB")) return "Searching the web…";
    if (n.includes("SEARCH_DEEP_WEB")) return "Running deep search…";
    if (n.includes("WEB_SEARCH")) return "Searching the web…";
    if (n.includes("DEEP_SEARCH")) return "Running deep search…";
    if (n.includes("CLIENT")) return "Retrieving client data…";
    if (n.includes("DOSSIER")) return "Loading dossier records…";
    if (n.includes("LAWSUIT")) return "Fetching lawsuit details…";
    if (n.includes("TASK")) return "Reading task information…";
    if (n.includes("SESSION")) return "Loading session data…";
    if (n.includes("FINANCIAL")) return "Retrieving financial records…";
    return "Fetching data…";
  }

  if (phase === "analyzing") {
    if (n.includes("SEARCH_WEB")) return "Compiling web sources…";
    if (n.includes("SEARCH_DEEP_WEB")) return "Compiling deep-search findings…";
    if (n.includes("WEB_SEARCH")) return "Compiling web sources…";
    if (n.includes("DEEP_SEARCH")) return "Compiling deep-search findings…";
    if (n.includes("EXPLAIN")) return "Analyzing current state…";
    if (n.includes("SUMMARIZE")) return "Compiling summary…";
    if (n.includes("RISK")) return "Evaluating operational risks…";
    if (n.includes("DRAFT")) return "Preparing draft content…";
    if (n.includes("PROPOSE") || n.includes("ACTION"))
      return "Identifying possible actions…";
    return "Processing request…";
  }

  if (phase === "interpreting") {
    return "Building interpretation…";
  }

  if (phase === "commentary") {
    return "Preparing response…";
  }

  // Default
  return "Processing…";
}

// ============================================================================
// Intent Framing Helpers — LLM-generated, deterministic inputs only
// ============================================================================

const INTENT_FRAMING_MESSAGE_TYPE = "AGENT_INTENT_MESSAGE";

function deriveIntentType(intent, contextSnapshot) {
  const source = (intent || contextSnapshot?.lastIntent || "").toUpperCase();
  if (!source) return "UNCERTAIN";

  if (
    source.includes("SEARCH_WEB") ||
    source.includes("SEARCH_DEEP_WEB") ||
    source.includes("WEB_SEARCH") ||
    source.includes("DEEP_SEARCH")
  ) {
    return "SEARCH";
  }
  if (source.includes("DRAFT")) return "DRAFT";
  if (source.includes("ANALYZE") || source.includes("RISK")) return "REVIEW";
  if (source.includes("PROPOSE") || source.includes("ACTION"))
    return "PRIORITIZE";
  if (
    source.includes("LIST") ||
    source.includes("SUMMARIZE") ||
    source.includes("READ") ||
    source.includes("EXPLAIN")
  ) {
    return "READ";
  }

  if (
    source === "FOLLOW_UP" ||
    source === "COMMAND" ||
    source === "SAFETY_GUARD"
  ) {
    const lastIntent = (contextSnapshot?.lastIntent || "").toUpperCase();
    return deriveIntentType(lastIntent, null);
  }

  return "UNCERTAIN";
}

function inferMissingEntities({ output, userMessage }) {
  const missing = new Set();
  const summary = String(output?.summary || "").toLowerCase();
  const details = Array.isArray(output?.details)
    ? output.details.map((line) => String(line || "").toLowerCase()).join(" ")
    : "";
  const user = String(userMessage || "").toLowerCase();
  const combined = `${summary} ${details} ${user}`;

  if (/\bclient\b/.test(combined)) missing.add("client");
  if (/\bdossier\b/.test(combined)) missing.add("dossier");
  if (/\bsession\b|\bhearing\b/.test(combined)) missing.add("session");

  return Array.from(missing);
}

function buildIntentFramingPayload({
  intent,
  userMessage,
  result,
  contextSnapshot,
}) {
  if (!intent) return null;

  const intentType = deriveIntentType(intent, contextSnapshot);
  if (!intentType) return null;

  const output = result?.output || {};
  const needsClarification =
    result?.needsClarification === true ||
    String(output?.status || "").toLowerCase() === "pending_clarification";
  const missingEntities = needsClarification
    ? inferMissingEntities({ output, userMessage })
    : [];

  return {
    intentType,
    userMessage: String(userMessage || "").trim(),
    missingEntities,
  };
}

/**
 * Stream intent event with LLM-generated message.
 * Unified event name: `intent`
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} payload - Intent payload { intentType, userMessage, missingEntities }
 * @param {AbortSignal} signal - Abort signal
 * @param {boolean} aborted - Abort flag
 */
async function streamIntentEvent(
  sendEvent,
  payload,
  signal,
  aborted,
  { chunkStreaming = true } = {},
) {
  if (aborted) return;

  return new Promise((resolve) => {
    let fullMessage = "";
    let chunkCount = 0;
    console.log("[SSE][Intent] Stream start", JSON.stringify({ chunkStreaming }));

    streamIntentFramingMessage(
      payload || {},
      {
        onChunk: (chunk) => {
          if (aborted) return;
          fullMessage += chunk;
          chunkCount += 1;
          if (chunkStreaming) {
            sendEvent("intent_framing_chunk", { chunk });
          }
          console.debug("[SSE][Intent] Token emitted", JSON.stringify({ chunkCount, size: chunk.length }));
        },
        onDone: (message) => {
          if (aborted) {
            resolve();
            return;
          }

          // Send unified `intent` event (not `intent_framing`)
          const finalMessage = message || fullMessage;
          if (finalMessage) {
            sendEvent("intent", {
              message: finalMessage,
              action: payload?.intentType || "unknown",
              missingEntities: Array.isArray(payload?.missingEntities)
                ? payload.missingEntities
                : [],
            });
          }
          console.log(
            "[SSE][Intent] Stream end",
            JSON.stringify({ chunkCount, chars: finalMessage ? finalMessage.length : 0 }),
          );
          resolve();
        },
        onError: (error) => {
          console.error("[SSE][Intent] Stream error:", error);
          resolve();
        },
      },
      signal,
    );
  });
}

/**
 * Send artifact event.
 * Unified event name: `artifact` (not `result`)
 * No suppression - all artifacts are sent.
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} result - Agent result from engine
 * @param {boolean} aborted - Whether connection was aborted
 * @returns {boolean} True when artifact was emitted
 */
function sendArtifactEvent(sendEvent, result, aborted) {
  if (aborted) return false;

  const output = result?.output;
  if (!output || typeof output !== "object") {
    console.warn("[SSE] No output in result");
    return false;
  }

  // Send artifact without suppression
  sendEvent("artifact", {
    output,
    intent: result.intent,
    contextLifecycle: result?.contextLifecycle || null,
  });
  return true;
}

function streamTextAsChunks(text, onChunk) {
  if (!text || typeof text !== "string") return;
  const tokens = text.match(/\S+\s*/g) || [];
  for (const token of tokens) {
    onChunk(token);
  }
}

function extractDomain(url) {
  try {
    const parsed = new URL(String(url || "").trim());
    return parsed.hostname.replace(/^www\./i, "");
  } catch {
    return String(url || "").trim();
  }
}

function buildSearchFallbackCommentary(output, reason = "unknown") {
  const rows = Array.isArray(output?.results) ? output.results : [];
  if (!rows.length) {
    return `Summary unavailable (reason: ${reason}). No external results found. Could you narrow scope by jurisdiction, date range, or law number?`;
  }
  const topSources = rows.slice(0, 3).map((row, idx) => {
    const title = String(row?.title || "Untitled source").trim();
    const domain = extractDomain(row?.url || "");
    return `${idx + 1}. ${title} (${domain})`;
  });
  return `Summary unavailable (reason: ${reason}). Top sources: ${topSources.join(" | ")}. Would you like me to narrow to specific statutes, case law, or a date range?`;
}

async function streamGroundedSearchCommentaryEvent(
  sendEvent,
  result,
  signal,
  aborted,
  { chunkStreaming = true } = {},
) {
  // Two-phase search behavior:
  // 1) Emit artifact as soon as external results are available.
  // 2) Run a separate grounded summary stream using only search JSON context.
  // If summary fails, emit deterministic fallback commentary instead of silence.
  if (aborted) return;
  const output = result?.output || {};
  const artifactType = String(output?.type || "");
  const isSearchArtifact =
    artifactType === "web_search_results" ||
    artifactType === "web_deep_search_results";
  if (!isSearchArtifact) return;
  const rows = Array.isArray(output?.results) ? output.results : [];
  if (!rows.length) {
    console.log("[SearchFlow] summary_start skipped=true reason=no_results");
    console.log("[SearchFlow] no_llm_call_without_results confirmed=true");
    console.log("[SearchFlow] summary_failed reason=no_results");
    const fallbackNoResults = buildSearchFallbackCommentary(output, "no_results");
    if (chunkStreaming) {
      streamTextAsChunks(fallbackNoResults, (chunk) => {
        if (aborted) return;
        sendEvent("commentary_chunk", { chunk });
      });
    }
    if (!aborted) {
      sendEvent("commentary", { message: fallbackNoResults, signals: [] });
      console.log("[SearchFlow] fallback_commentary_emitted");
    }
    return;
  }

  let summaryText = "";
  const summaryResult = await streamWebSearchAiSummary(
    {
      query: output?.query || "",
      mode: artifactType === "web_deep_search_results" ? "deep" : "basic",
      results: rows,
    },
    {
      onChunk: (chunk) => {
        if (aborted) return;
        summaryText += chunk;
        if (chunkStreaming) {
          sendEvent("commentary_chunk", { chunk });
        }
      },
      onDone: (finalSummary) => {
        summaryText = finalSummary || summaryText;
      },
    },
    signal,
  );

  if (aborted) return;

  if (summaryResult?.success && summaryText.trim()) {
    sendEvent("commentary", {
      message: summaryText.trim(),
      signals: [],
    });
    return;
  }

  const reason = String(summaryResult?.reason || "summary_unavailable");
  console.log("[SearchFlow] summary_failed", `reason=${reason}`);
  const fallbackCommentary = buildSearchFallbackCommentary(output, reason);
  if (chunkStreaming) {
    streamTextAsChunks(fallbackCommentary, (chunk) => {
      if (aborted) return;
      sendEvent("commentary_chunk", { chunk });
    });
  }
  if (!aborted) {
    sendEvent("commentary", {
      message: fallbackCommentary,
      signals: [],
    });
    console.log("[SearchFlow] fallback_commentary_emitted");
  }
}

/**
 * Stream commentary event with LLM-generated commentary.
 * Unified event name: `commentary`
 * Mandatory for all artifacts except chat.
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} result - Agent result containing output
 * @param {Object} context - Request context
 * @param {boolean} aborted - Whether connection was aborted
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
async function streamCommentaryEvent(
  sendEvent,
  result,
  context,
  aborted,
  signal,
  { chunkStreaming = true } = {},
) {
  if (aborted) return;

  // Skip commentary for chat, external search, and context suggestion artifacts.
  const artifactType = result?.output?.type;
  const outputStatus = String(result?.output?.status || "").toLowerCase();
  if (
    !artifactType ||
    artifactType === "chat" ||
    artifactType === "web_search_results" ||
    artifactType === "web_deep_search_results" ||
    artifactType === "context_suggestion" ||
    outputStatus === "error" ||
    result?.resolutionMode === true
  ) {
    if (
      artifactType === "web_search_results" ||
      artifactType === "web_deep_search_results"
    ) {
      console.log(
        "[SearchFlow] Commentary skipped for external search artifact",
        JSON.stringify({ artifactType }),
      );
    }
    if (artifactType === "context_suggestion") {
      console.log(
        "[Commentary] Skipped for context suggestion (no advice during ambiguity resolution)",
        JSON.stringify({ artifactType }),
      );
    }
    if (result?.resolutionMode === true) {
      console.log(
        "[Commentary] Skipped for pending resolution mode",
        JSON.stringify({ artifactType, reasoner: result?.reasoner || null }),
      );
    }
    if (outputStatus === "error") {
      console.log(
        "[Commentary] Skipped for error output",
        JSON.stringify({ artifactType, outputStatus }),
      );
    }
    return;
  }

  // Get conversation history for context-aware commentary
  const llmContext =
    typeof agentEngine.contextStore?.getContextForLLMInjection === "function"
      ? agentEngine.contextStore.getContextForLLMInjection(context)
      : {};

  const resultCount =
    typeof result?.readMeta?.count === "number"
      ? result.readMeta.count
      : undefined;

  // Build commentary context with intent and conversation history
  // CRITICAL: Include intent for commentary mode derivation
  // The commentary generator uses intent to determine REPORTING vs INTERPRETIVE vs GUIDANCE mode
  const commentaryContext = {
    ...(context || {}),
    intent: result?.intent, // PRIMARY USER INTENT - determines commentary mode
    lastIntent: result?.intent || context?.lastIntent,
    _resultCount: resultCount,
    _readOutcome:
      result?.readOutcome || (resultCount === 0 ? "empty" : undefined),
    _activeEntityType:
      result?.output?.entityType ||
      result?.contextPromotion?.activeEntity?.type ||
      null,
    _activeEntityId: result?.contextPromotion?.activeEntity?.id || null,
    _pendingSelection: result?.contextPromotion?.pendingSelection || null,
    _grounding: {
      source: "read_intent",
      entityType: result?.output?.entityType || null,
      entityRetrieved: typeof resultCount === "number" ? resultCount > 0 : false,
      resultCount: typeof resultCount === "number" ? resultCount : null,
      readOutcome:
        result?.readOutcome || (resultCount === 0 ? "empty" : "unknown"),
      workMode: {
        dossier:
          result?.output?.entityType === "dossier" &&
          typeof resultCount === "number" &&
          resultCount > 0,
      },
    },
    _dossierWorkMode:
      result?.output?.entityType === "dossier" &&
      typeof resultCount === "number" &&
      resultCount > 0,
    // NEW: Inject conversation history for context-aware commentary
    recentTurns: llmContext.recentTurns || [],
    compactionSummary: llmContext.compactionSummary || null,
    activeEntity: llmContext.activeEntity || null,
    workMode: llmContext.workMode || null,
    posture: llmContext.posture || null,
  };

  console.log("[Commentary] Intent for mode derivation:", result?.intent);

  return new Promise((resolve) => {
    let chunkCount = 0;
    console.log("[SSE][Commentary] Stream start", JSON.stringify({ chunkStreaming }));

    streamCommentary(
      artifactType,
      result.output,
      commentaryContext,
      {
        onChunk: (chunk) => {
          if (aborted) return;
          chunkCount += 1;
          if (chunkStreaming) {
            sendEvent("commentary_chunk", { chunk });
          }
          console.debug(
            "[SSE][Commentary] Token emitted",
            JSON.stringify({ chunkCount, size: chunk.length }),
          );
        },
        onDone: (commentaryResult) => {
          if (aborted) {
            resolve();
            return;
          }

          // Send unified commentary event
          const hasSignals =
            Array.isArray(commentaryResult?.signals) &&
            commentaryResult.signals.length > 0;
          if (commentaryResult?.commentary || hasSignals) {
            sendEvent("commentary", {
              message: commentaryResult.commentary || "",
              signals: commentaryResult.signals || [],
            });
          }
          console.log(
            "[SSE][Commentary] Stream end",
            JSON.stringify({
              chunkCount,
              chars: commentaryResult?.commentary ? commentaryResult.commentary.length : 0,
            }),
          );
          resolve();
        },
        onError: (err) => {
          console.error("[SSE][Commentary] Stream error:", err);
          resolve();
        },
      },
      signal,
    );
  });
}

function resolveChunkStreamingEnabled(req, metadata) {
  const serverEnabled = process.env.OLLAMA_STREAMING !== "false";
  const metadataEnabled =
    metadata && typeof metadata === "object" && metadata.streamingEnabled === false
      ? false
      : true;
  const header = String(req.get("x-agent-streaming") || "").trim().toLowerCase();
  const headerEnabled = header !== "false" && header !== "0";
  return serverEnabled && metadataEnabled && headerEnabled;
}

/**
 * GET /agent/commands - Get available slash commands for UI autocomplete
 */
router.get("/agent/commands", (req, res) => {
  const commands = getAvailableCommands();
  res.json({
    status: "ok",
    data: commands,
  });
});

function resolveDocumentContext(sessionId, documentIds) {
  if (!sessionId && (!Array.isArray(documentIds) || documentIds.length === 0)) {
    return null;
  }

  try {
    const agentDocumentsService = require("../services/agentDocuments.service");
    if (sessionId) {
      return agentDocumentsService.buildAgentDocumentContext(sessionId);
    }
  } catch (err) {
    console.warn("[Agent] Failed to load document context:", err.message);
  }

  return null;
}

function buildRequestContext(context, sessionId, documentContext, metadata) {
  const requestContext = { ...(context || {}) };
  if (sessionId && !requestContext.conversationId) {
    requestContext.conversationId = sessionId;
  }
  if (
    documentContext &&
    Array.isArray(documentContext.documents) &&
    documentContext.documents.length > 0
  ) {
    requestContext._hasDocumentContext = true;
    requestContext.documentCount = documentContext.documents.length;
  }
  if (metadata && typeof metadata === "object") {
    requestContext.requestMetadata = { ...metadata };
  }
  return requestContext;
}

function getLifecycleStatusAction(contextLifecycle) {
  const type = String(contextLifecycle?.type || "").toLowerCase();
  if (type === "expired") {
    return "Previous context expired; starting with a fresh context.";
  }
  if (type === "posture_reset") {
    return "Context reset because interaction mode changed.";
  }
  if (type === "posture_transition") {
    return "Interaction mode changed; conversation context was preserved.";
  }
  if (type === "cleared") {
    return "Conversation context was cleared.";
  }
  return "Conversation context changed.";
}

function isExternalSearchArtifact(result) {
  const outputType = String(result?.output?.type || "").toLowerCase();
  const provider = String(result?.output?.provider || "").toLowerCase();
  if (
    outputType === "web_search_results" ||
    outputType === "web_deep_search_results"
  ) {
    return true;
  }
  return provider.includes("langsearch");
}

function shouldSendIntentFraming(result, requestContext, framingPayload) {
  if (!framingPayload) return false;
  if (result?.resolutionMode === true) return false;

  // INTENT FRAMING IS MANDATORY FOR ALL INTERACTIONS
  // Only suppress for explicitly conversational types (chat is already conversational)
  const outputStatus = String(result?.output?.status || "").toLowerCase();
  if (outputStatus === "error") {
    return false;
  }
  const outputType = String(result?.output?.type || "").toLowerCase();
  if (outputType === "chat") {
    return false;
  }

  return true;
}

async function generateChatIntentFramingMessage(message, signal) {
  const intentResult = await generateStructuredPayload({
    kind: "intent",
    schema: intentSchema,
    validate: validateIntent,
    buildMessages: ({ strictJson }) =>
      buildIntentMessages({
        message,
        intentHint: "CHATBOT_AGENT_MODE",
        strictJson,
      }),
    signal,
  });
  if (intentResult.ok) {
    const intentPayload = coerceIntentPayload(intentResult.value, message);
    if (validateIntent(intentPayload)) {
      const summary = String(intentPayload.summary || "").trim();
      const nextQuestion = String(intentPayload.nextQuestion || "").trim();
      return [summary, nextQuestion].filter(Boolean).join(" ");
    }
  }
  return "Understood. I will review your request.";
}

async function generateChatCommentaryMessage(message, finalResponse, signal) {
  const commentaryResult = await generateStructuredPayload({
    kind: "commentary",
    schema: commentarySchema,
    validate: validateCommentary,
    buildMessages: ({ strictJson }) =>
      buildCommentaryMessages({
        message,
        intent: "CHATBOT_AGENT_MODE",
        output: {
          type: "chat",
          summary: String(finalResponse || "").slice(0, 600),
        },
        strictJson,
      }),
    signal,
  });

  if (commentaryResult.ok) {
    const payload = coerceCommentaryPayload(
      commentaryResult.value,
      { type: "chat", summary: finalResponse || "" },
      message,
    );
    if (validateCommentary(payload)) {
      const lines = Array.isArray(payload.lines) ? payload.lines : [];
      const question = payload.question ? [payload.question] : [];
      const out = [...lines, ...question].join(" ").trim();
      if (out) return out;
    }
  }
  return "";
}

function normalizeChatSearchArtifact(entry) {
  const output = entry?.result;
  if (!output || typeof output !== "object") return null;

  const existingType = String(output?.type || "").toLowerCase();
  if (
    existingType === "web_search_results" ||
    existingType === "web_deep_search_results"
  ) {
    return output;
  }

  const toolName = String(entry?.toolName || "").trim();
  const isMcpWeb = toolName === "mcpWebSearch";
  const isMcpDeep = toolName === "mcpDeepSearch";
  if (!isMcpWeb && !isMcpDeep) return null;

  const rows = Array.isArray(output.results)
    ? output.results
        .map((item, idx) => ({
          id: String(item?.id || idx + 1),
          title: String(item?.title || "Untitled result"),
          snippet: String(item?.snippet || ""),
          url: String(item?.url || "").trim(),
          source: item?.source ? String(item.source) : null,
          publishedDate: item?.publishedDate
            ? String(item.publishedDate)
            : item?.datePublished
              ? String(item.datePublished)
              : null,
        }))
        .filter((item) => item.url)
    : [];

  const base = {
    query: String(output?.query || ""),
    triggeredBy: String(output?.triggeredBy || "explicit_language"),
    provider: String(output?.provider || "langsearch"),
    results: rows,
    resultCount:
      typeof output?.resultCount === "number" ? output.resultCount : rows.length,
    message: null,
    sources: rows.slice(0, 10).map((row) => ({
      sourceType: "web",
      reference: row.url,
      note: row.source || row.title,
    })),
    timestamp: new Date().toISOString(),
    status: String(output?.status || "complete"),
    aiSummary: null,
    source: "chat_tool",
    requires_validation: true,
  };

  if (isMcpDeep) {
    return {
      type: "web_deep_search_results",
      searchIntent: "DEEP_SEARCH",
      queries: Array.isArray(output?.queries)
        ? output.queries.map((q) => String(q))
        : [String(output?.query || "")],
      totalEstimatedMatches:
        typeof output?.totalEstimatedMatches === "number"
          ? output.totalEstimatedMatches
          : rows.length,
      reason: output?.reason ? String(output.reason) : null,
      ...base,
    };
  }

  return {
    type: "web_search_results",
    searchIntent: "WEB_SEARCH",
    ...base,
  };
}

router.post("/agent/run", async (req, res, next) => {
  const {
    message,
    context,
    agentVersion,
    reasoner,
    followUpIntent,
    sessionId,
    documentIds,
    metadata,
  } = req.body || {};
  try {
    const documentContext = resolveDocumentContext(sessionId, documentIds);
    const requestContext = buildRequestContext(
      context,
      sessionId,
      documentContext,
      metadata,
    );
    const hasMessage =
      typeof message === "string" && String(message).trim().length > 0;
    const hasDocuments =
      documentContext &&
      Array.isArray(documentContext.documents) &&
      documentContext.documents.length > 0;
    const effectiveMessage =
      hasMessage || followUpIntent || !hasDocuments ? message : "uploaded file";

    const result = await agentEngine.run({
      message: effectiveMessage,
      context: requestContext,
      agentVersion,
      reasoner,
      followUpIntent,
      documentContext,
    });
    const contextLifecycle =
      typeof agentEngine.contextStore?.consumeLifecycleEvent === "function"
        ? agentEngine.contextStore.consumeLifecycleEvent(requestContext)
        : null;
    res.json({
      status: "ok",
      data: contextLifecycle ? { ...result, contextLifecycle } : result,
    });
  } catch (err) {
    next(err);
  }
});

router.post("/agent/chat", async (req, res) => {
  const {
    message,
    context,
    agentVersion,
    sessionId,
    metadata,
  } = req.body || {};

  const hasMessage =
    typeof message === "string" && String(message).trim().length > 0;
  if (!hasMessage) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const requestContext = buildRequestContext(context, sessionId, null, metadata);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  let aborted = false;
  const abortController = new AbortController();
  res.on("close", () => {
    aborted = true;
    abortController.abort();
  });

  const emit = (event, payload) => {
    if (aborted) return;
    res.write(`event: ${event}\ndata: ${JSON.stringify(payload || {})}\n\n`);
    if (typeof res.flush === "function") {
      res.flush();
    }
  };

  try {
    emit("start", {
      intent: "CHATBOT_AGENT_MODE",
      agentVersion: agentVersion || "v3",
      timestamp: new Date().toISOString(),
    });

    const result = await chatAgentService.run({
      message,
      context: requestContext,
      sessionId,
      agentVersion: agentVersion || "v3",
      metadata,
      userId: req.user?.id || null,
      tenantId: req.user?.tenantId || requestContext?.tenantId || null,
      signal: abortController.signal,
    });

    const searchArtifact = Array.isArray(result?.toolExecutions)
      ? result.toolExecutions
          .filter((entry) => entry?.ok === true)
          .map((entry) => normalizeChatSearchArtifact(entry))
          .find((output) => Boolean(output)) || null
      : null;

    if (searchArtifact) {
      const chatIntentMessage = await generateChatIntentFramingMessage(
        message,
        abortController.signal,
      );
      emit("intent", {
        message: chatIntentMessage,
        action: "CHATBOT_AGENT_MODE",
        missingEntities: [],
      });
      emit("result", {
        output: searchArtifact,
        intent: "CHATBOT_AGENT_MODE",
      });
      const chatCommentaryMessage = await generateChatCommentaryMessage(
        message,
        result.message,
        abortController.signal,
      );
      if (chatCommentaryMessage) {
        emit("commentary", {
          message: chatCommentaryMessage,
          signals: [],
        });
      }
    } else {
      emit("chunk", {
        content: result.message,
        timestamp: new Date().toISOString(),
      });
    }
    emit("done", {
      timestamp: new Date().toISOString(),
      mode: "chatbot",
      toolCalls: result.toolExecutions.length,
    });
  } catch (error) {
    emit("error", {
      error: String(error?.message || "Chat mode execution failed"),
      code: error?.status || 500,
      timestamp: new Date().toISOString(),
    });
    emit("done", {
      timestamp: new Date().toISOString(),
      mode: "chatbot",
      status: "error",
    });
  } finally {
    if (!aborted) {
      res.end();
    }
  }
});

router.__setChatAgentServiceForTests = (service) => {
  if (service && typeof service.run === "function") {
    chatAgentService = service;
  }
};

/**
 * POST /agent/edit - Edit the last user message
 *
 * Creates a new version and marks the old one as superseded
 * Invalidates any downstream agent responses
 * Frontend should re-call /agent/stream after edit
 */
router.post("/agent/edit", async (req, res, next) => {
  const { message, sessionId, userId } = req.body || {};

  // Validation
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({
      status: 'error',
      error: 'MESSAGE_REQUIRED',
      message: 'Message is required',
    });
  }

  if (!sessionId) {
    return res.status(400).json({
      status: 'error',
      error: 'SESSION_REQUIRED',
      message: 'Session ID is required',
    });
  }

  try {
    // Use sessionId as conversationId (same pattern as /agent/stream and /agent/message)
    const conversationId = sessionId || `conv:${userId || 'default'}:GLOBAL`;

    // Get the last user turn from transcript store
    let lastUserTurn = agentEngine.contextStore._transcriptStore.getLastUserTurn(conversationId);

    // If no turn exists (e.g., after app restart), accept the edit anyway
    // Frontend has persistent conversation state in localStorage, backend doesn't
    // This is a temporary solution until transcript is persisted to database
    if (!lastUserTurn) {
      console.log('[Edit] No turn found in transcript (likely after restart), creating synthetic turn');

      // Create a synthetic turn representing the original message
      // We don't know the original message text, but we accept the edit request
      // The frontend will handle showing the edited state correctly
      lastUserTurn = agentEngine.contextStore._transcriptStore.addTurn(conversationId, userId || 'default', {
        userMessage: message.trim(),  // Use the edited message as if it was the original
        agentIntent: null,
        agentOutput: null,
      });

      // Return success without creating an edit chain (no previousVersion)
      // This allows editing to work after reload
      return res.json({
        status: 'ok',
        editedTurn: {
          turnId: lastUserTurn.turnId,
          message: lastUserTurn.userMessage,
          editedAt: null,  // Not an edit, just a sync
          previousVersion: null,
        },
        originalTurn: null,
      });
    }

    // Edit the turn (normal flow when turn exists)
    const { editedTurn, originalTurn } = agentEngine.contextStore._transcriptStore.editLastUserTurn(
      conversationId,
      userId || 'default',
      message.trim()
    );

    // TODO: Cancel any pending proposals associated with the original turn
    // This would require tracking proposals by turnId

    console.log('[Edit] Message edited:', {
      originalTurnId: originalTurn.turnId,
      editedTurnId: editedTurn.turnId,
      sessionId,
    });

    return res.json({
      status: 'ok',
      editedTurn: {
        turnId: editedTurn.turnId,
        message: editedTurn.userMessage,
        editedAt: editedTurn.editedAt,
        previousVersion: editedTurn.previousVersion,
      },
      originalTurn: {
        turnId: originalTurn.turnId,
        message: originalTurn.userMessage,
      },
    });
  } catch (err) {
    console.error('[Edit] Error editing message:', err);
    return res.status(500).json({
      status: 'error',
      error: 'EDIT_FAILED',
      message: err.message || 'Failed to edit message',
    });
  }
});

/**
 * POST /agent/confirm - Confirm and execute a proposal (V3 only)
 *
 * Validates posture, snapshot, permissions, then executes action
 */
router.post("/agent/confirm", async (req, res, next) => {
  const { proposalId, sessionId } = req.body || {};

  try {
    const result = await agentEngine.confirmProposal({
      proposalId,
      sessionId,
      userId: req.user?.id,
    });

    res.json({ status: "ok", data: result });
  } catch (err) {
    next(err);
  }
});

function newEventId(prefix = "evt") {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function extractJsonObject(rawText) {
  const raw = String(rawText || "").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    try {
      return JSON.parse(raw.slice(start, end + 1));
    } catch {
      return null;
    }
  }
}

function cleanUserText(text, fallback = "") {
  const raw = String(text || "").replace(/\s+/g, " ").trim();
  if (!raw) return fallback;
  const blocked = /\b(token|permission|confidence|assumption|risk flag|internal|auth|firewall)\b/i;
  if (blocked.test(raw)) {
    return fallback || "I understood your request and will proceed.";
  }
  return raw;
}

function normalizeQuestion(question, fallback = null) {
  const q = cleanUserText(question, "").trim();
  if (!q) return fallback;
  if (/[?؟]$/.test(q)) return q;
  return `${q.replace(/[.!\s]+$/g, "")}?`;
}

function coerceIntentPayload(payload, userMessage) {
  const source = payload && typeof payload === "object" ? payload : {};
  const contextEchoCandidate = cleanUserText(source.contextEcho || userMessage, "");
  const summary =
    cleanUserText(source.summary, "") ||
    `Got it — you want me to handle "${cleanUserText(userMessage, "this request")}".`;
  const rawNextQuestion = normalizeQuestion(source.nextQuestion, null);
  const lowValueIdentifierQuestion =
    rawNextQuestion &&
    /\b(case number|reference|reference id|identifier|party names|more details|provide.*details)\b/i.test(
      rawNextQuestion,
    );
  return {
    kind: "intent",
    summary,
    contextEcho: contextEchoCandidate || null,
    nextQuestion: lowValueIdentifierQuestion ? null : rawNextQuestion,
  };
}

function buildCommentaryFallbackFromArtifact(output, userMessage) {
  const artifact = output && typeof output === "object" ? output : {};
  const type = String(artifact.type || "").toLowerCase();
  const fallback = {
    kind: "commentary",
    lines: [],
    options: [],
    question: null,
  };

  if (type === "context_suggestion") {
    const suggestions = Array.isArray(artifact.suggestions)
      ? artifact.suggestions
      : [];
    const entityType = cleanUserText(artifact.entityType, "item");
    const messageLine =
      cleanUserText(artifact.message, "") ||
      `I found ${suggestions.length} possible ${entityType} matches.`;
    fallback.lines = [messageLine];
    fallback.options = suggestions.slice(0, 8).map((item) => ({
      label:
        cleanUserText(item?.label, "") ||
        `${cleanUserText(item?.entityType, entityType)} ${String(item?.entityId || "").trim()}`,
      value: String(item?.id || item?.entityId || "").trim(),
    })).filter((item) => item.label && item.value);
    fallback.question = "Which one do you mean?";
    return fallback;
  }

  if (type === "collection") {
    const items = Array.isArray(artifact.items) ? artifact.items : [];
    const entity = cleanUserText(artifact.entityType, "item");
    const summary = cleanUserText(artifact.summary, "");
    fallback.lines = [
      summary || `I found ${items.length} ${entity}${items.length === 1 ? "" : "s"}.`,
    ];
    if (items.length > 1) {
      fallback.options = items.slice(0, 8).map((item) => ({
        label:
          cleanUserText(item?.title, "") ||
          cleanUserText(item?.subtitle, "") ||
          `${entity} ${String(item?.id || "").trim()}`,
        value: String(item?.entityId || item?.id || "").trim(),
      })).filter((row) => row.label && row.value);
      fallback.question =
        fallback.options.length > 0 ? "Which one do you mean?" : null;
    }
    return fallback;
  }

  if (type === "clarification" || type === "routing_clarification") {
    const candidates = Array.isArray(artifact.candidates) ? artifact.candidates : [];
    const promptLine =
      cleanUserText(artifact.prompt || artifact.message, "") ||
      "I need one more detail to continue.";
    fallback.lines = [promptLine];
    fallback.options = candidates.slice(0, 8).map((item) => ({
      label:
        cleanUserText(item?.label, "") ||
        `${cleanUserText(item?.entityType, "Option")} ${String(item?.id || "").trim()}`,
      value: String(item?.id || "").trim(),
    })).filter((item) => item.label && item.value);
    fallback.question = normalizeQuestion(artifact.prompt, "Could you clarify your selection?");
    return fallback;
  }

  if (type === "web_search_results" || type === "web_deep_search_results") {
    const count = Number.isFinite(artifact.resultCount)
      ? Number(artifact.resultCount)
      : Array.isArray(artifact.results)
        ? artifact.results.length
        : 0;
    const query = cleanUserText(artifact.query, cleanUserText(userMessage, "your request"));
    fallback.lines = [
      `I found ${count} source${count === 1 ? "" : "s"} for "${query}".`,
    ];
    fallback.question = null;
    return fallback;
  }

  if (type === "draft" || type === "client_email" || type === "invitation") {
    fallback.lines = ["Here is the draft. You can review and edit it before sending."];
    fallback.question = null;
    return fallback;
  }

  const summary = cleanUserText(artifact.summary || artifact.message, "");
  if (summary) {
    fallback.lines = [summary];
  } else {
    fallback.lines = ["I found the relevant information and organized it for you."];
  }
  return fallback;
}

function dedupeLines(lines = []) {
  const seen = new Set();
  const out = [];
  for (const line of lines) {
    const key = String(line || "").trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(String(line).trim());
  }
  return out;
}

function deriveKnownResultCount(output) {
  if (!output || typeof output !== "object") return null;
  if (typeof output.resultCount === "number" && Number.isFinite(output.resultCount)) {
    return output.resultCount;
  }
  if (Array.isArray(output.items)) return output.items.length;
  if (Array.isArray(output.results)) return output.results.length;
  if (Array.isArray(output.suggestions)) return output.suggestions.length;
  return null;
}

function hasCountContradiction(lines = [], count = null) {
  if (!Array.isArray(lines) || lines.length === 0 || typeof count !== "number") {
    return false;
  }
  const text = lines.join(" ").toLowerCase();
  const noResultsClaim =
    /\b(no\b|none|couldn.?t find|didn.?t find|not found|aucun|introuvable|لا يوجد|لم يتم العثور)\b/i.test(
      text,
    );
  const foundClaim = /\b(found|identified|located|retrieved|تم العثور)\b/i.test(text);
  if (count > 0 && noResultsClaim) return true;
  if (count === 0 && foundClaim && !noResultsClaim) return true;
  const numericMatch = text.match(/\b(\d+)\b/);
  if (numericMatch) {
    const claimed = parseInt(numericMatch[1], 10);
    if (Number.isFinite(claimed) && claimed !== count) return true;
  }
  return false;
}

function isGenericOptionLabel(label) {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return true;
  return /^(option|item|result|choice|selection|record|entry|client|dossier|case)\s*[-:#]?\s*\d+$/.test(
    normalized,
  );
}

function extractReferenceToken(text) {
  const raw = String(text || "");
  if (!raw) return "";
  const match = raw.match(/\b([A-Z]{2,10}-\d{2,8}(?:-\d{1,8})?)\b/i);
  return match ? String(match[1]).trim() : "";
}

function extractClientName(text) {
  const raw = String(text || "");
  if (!raw) return "";
  const prefixed = raw.match(/\bclient\s*:\s*([^|]+)/i);
  if (prefixed && prefixed[1]) return String(prefixed[1]).trim();
  return "";
}

function splitSubtitleParts(subtitle) {
  return String(subtitle || "")
    .split("|")
    .map((part) => cleanUserText(part, ""))
    .filter(Boolean);
}

function normalizeDetailPart(part) {
  return String(part || "")
    .toLowerCase()
    .replace(/[^a-z0-9\u0600-\u06ff]+/g, "")
    .trim();
}

function dedupeDetailParts(parts = []) {
  const out = [];
  const seen = new Set();
  for (const part of parts) {
    const clean = cleanUserText(part, "");
    if (!clean) continue;
    const key = normalizeDetailPart(clean);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

function buildCanonicalOptionPool(output) {
  const artifact = output && typeof output === "object" ? output : {};
  const pool = [];

  const withDetails = (label, details = []) => {
    const base = cleanUserText(label, "");
    const extras = dedupeDetailParts(Array.isArray(details) ? details : []);
    if (!base) return extras.join(" | ");
    if (extras.length === 0) return base;
    return `${base} (${extras.join(" | ")})`;
  };

  const pushOption = (label, value) => {
    const cleanLabel = cleanUserText(label, "");
    const cleanValue = String(value || "").trim();
    if (!cleanLabel || !cleanValue) return;
    if (pool.some((item) => item.value === cleanValue)) return;
    pool.push({ label: cleanLabel, value: cleanValue });
  };

  const suggestions = Array.isArray(artifact.suggestions) ? artifact.suggestions : [];
  for (const suggestion of suggestions) {
    const subtitle = cleanUserText(suggestion?.subtitle || "", "");
    const subtitleParts = splitSubtitleParts(subtitle);
    const reference =
      suggestion?.reference ||
      suggestion?.metadata?.reference ||
      extractReferenceToken(subtitleParts.join(" | "));
    const client =
      suggestion?.clientName ||
      suggestion?.metadata?.clientName ||
      suggestion?.metadata?.client_name ||
      extractClientName(subtitleParts.join(" | "));
    const extraDetails = subtitleParts.filter((part) => {
      const normalized = part.toLowerCase();
      if (reference && normalizeDetailPart(part) === normalizeDetailPart(reference)) {
        return false;
      }
      if (client && normalized.includes(String(client).toLowerCase())) {
        return false;
      }
      if (normalized.startsWith("client:")) return false;
      return true;
    });
    pushOption(
      withDetails(
        suggestion?.label ||
        `${cleanUserText(suggestion?.entityType, "Item")} ${String(suggestion?.entityId || "").trim()}`,
        [reference, client ? `Client: ${client}` : "", ...extraDetails],
      ),
      suggestion?.id || suggestion?.entityId,
    );
  }

  const items = Array.isArray(artifact.items) ? artifact.items : [];
  for (const item of items) {
    const reference = item?.reference || item?.subtitle || "";
    const client = item?.client || item?.clientName || "";
    pushOption(
      withDetails(item?.title || item?.subtitle || item?.label, [
        reference,
        client,
      ]),
      item?.entityId || item?.id || item?.value,
    );
  }

  const candidates = Array.isArray(artifact.candidates) ? artifact.candidates : [];
  for (const candidate of candidates) {
    const reference = candidate?.reference || candidate?.ref || "";
    const client = candidate?.clientName || candidate?.client || "";
    pushOption(
      withDetails(
        candidate?.label ||
        `${cleanUserText(candidate?.entityType, "Option")} ${String(candidate?.id || "").trim()}`,
        [reference, client],
      ),
      candidate?.id || candidate?.value,
    );
  }

  const directOptions = Array.isArray(artifact.options) ? artifact.options : [];
  for (const option of directOptions) {
    pushOption(option?.label, option?.value || option?.id);
  }

  return pool;
}

function enforceNonGenericOptionLabels(options = [], output) {
  if (!Array.isArray(options) || options.length === 0) return [];
  const canonical = buildCanonicalOptionPool(output);
  const byValue = new Map(canonical.map((item) => [item.value, item.label]));

  const sanitized = options.map((option, index) => {
    const value = String(option?.value || "").trim();
    let label = cleanUserText(option?.label, "");
    if (!value) return null;

    const canonicalByValue = byValue.get(value);
    const canonicalByIndex =
      canonical[index] && String(canonical[index].value || "").trim() === value
        ? canonical[index].label
        : canonical[index]?.label;

    if (isGenericOptionLabel(label)) {
      label = canonicalByValue || canonicalByIndex || label;
    }

    return {
      label: cleanUserText(label, canonicalByValue || canonicalByIndex || value),
      value,
    };
  }).filter(Boolean);

  const deduped = [];
  const seen = new Set();
  for (const option of sanitized) {
    const key = String(option.value || "");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    deduped.push(option);
  }
  return deduped;
}

function buildDisambiguatedOptionsFromOutput(output) {
  const artifact = output && typeof output === "object" ? output : {};
  const suggestions = Array.isArray(artifact.suggestions) ? artifact.suggestions : [];
  if (suggestions.length === 0) return [];

  return suggestions.slice(0, 8).map((s) => {
    const title = cleanUserText(s?.label || s?.name || s?.title, "");
    const subtitle = cleanUserText(s?.subtitle || "", "");
    const subtitleParts = splitSubtitleParts(subtitle);
    const reference =
      cleanUserText(s?.reference || s?.metadata?.reference, "") ||
      extractReferenceToken(subtitleParts.join(" | "));
    const clientName =
      cleanUserText(
        s?.clientName ||
          s?.metadata?.clientName ||
          s?.metadata?.client_name ||
          "",
        "",
      ) || extractClientName(subtitleParts.join(" | "));
    const extraParts = subtitleParts.filter((part) => {
      const normalized = part.toLowerCase();
      if (reference && normalizeDetailPart(part) === normalizeDetailPart(reference)) {
        return false;
      }
      if (clientName && normalized.includes(String(clientName).toLowerCase())) {
        return false;
      }
      if (normalized.startsWith("client:")) return false;
      return true;
    });
    const details = dedupeDetailParts([
      reference,
      clientName ? `Client: ${clientName}` : "",
      ...extraParts,
    ]);
    const label = details.length > 0 ? `${title} (${details.join(" | ")})` : title;
    return {
      label: cleanUserText(label, title || String(s?.entityId || s?.id || "")),
      value: String(s?.id || s?.entityId || "").trim(),
    };
  }).filter((o) => o.label && o.value);
}

function coerceCommentaryPayload(payload, output, userMessage) {
  const source = payload && typeof payload === "object" ? payload : {};
  const fallback = buildCommentaryFallbackFromArtifact(output, userMessage);
  const rawLines = Array.isArray(source.lines) ? source.lines : [];
  let lines = rawLines
    .map((line) => cleanUserText(line, ""))
    .filter(Boolean)
    .slice(0, 6);
  const rawOptions = Array.isArray(source.options) ? source.options : [];
  const parsedOptions = rawOptions
    .map((item) => ({
      label: cleanUserText(item?.label, ""),
      value: String(item?.value || "").trim(),
    }))
    .filter((item) => item.label && item.value)
    .slice(0, 8);
  lines = dedupeLines(lines);
  const knownCount = deriveKnownResultCount(output);
  if (hasCountContradiction(lines, knownCount)) {
    lines = fallback.lines;
  }

  let question = normalizeQuestion(source.question, fallback.question);
  const baseOptions = parsedOptions.length > 0 ? parsedOptions : fallback.options;
  const strictDisambiguatedOptions = buildDisambiguatedOptionsFromOutput(output);
  const finalOptions = strictDisambiguatedOptions.length > 1
    ? strictDisambiguatedOptions
    : enforceNonGenericOptionLabels(baseOptions, output);
  if ((!question || !String(question).trim()) && finalOptions.length > 1) {
    question = "Which one do you mean?";
  }

  return {
    kind: "commentary",
    lines: lines.length > 0 ? lines : fallback.lines,
    options: finalOptions,
    question,
  };
}

function buildIntentPreview(payload) {
  return String(payload.summary || "").trim();
}

function buildCommentaryPreview(payload) {
  const line = Array.isArray(payload.lines) && payload.lines.length > 0
    ? payload.lines[0]
    : "";
  const question = payload.question || "";
  return [line, question].filter(Boolean).join(" ");
}

function buildArtifactDigest(output) {
  if (!output || typeof output !== "object") return { type: "unknown" };
  const digest = {
    type: String(output.type || "unknown"),
    summary: String(output.summary || output.message || "").slice(0, 360),
  };
  if (Array.isArray(output.items)) {
    digest.itemCount = output.items.length;
  }
  if (Array.isArray(output.results)) {
    digest.resultCount = output.results.length;
  }
  if (output.entityType) {
    digest.entityType = output.entityType;
  }
  if (output.entityId) {
    digest.entityId = output.entityId;
  }
  return digest;
}

function createDeltaEmitter(emitDelta) {
  let buffer = "";
  let lastFlushAt = Date.now();
  return {
    push(text) {
      const value = String(text || "");
      if (!value) return;
      buffer += value;
      while (buffer.length >= DELTA_MAX_CHARS) {
        const chunk = buffer.slice(0, DELTA_MAX_CHARS);
        buffer = buffer.slice(DELTA_MAX_CHARS);
        lastFlushAt = Date.now();
        emitDelta(chunk);
      }
      if (buffer.length > 0 && Date.now() - lastFlushAt >= DELTA_FLUSH_MS) {
        const chunk = buffer;
        buffer = "";
        lastFlushAt = Date.now();
        emitDelta(chunk);
      }
    },
    flush() {
      if (!buffer) return;
      emitDelta(buffer);
      buffer = "";
      lastFlushAt = Date.now();
    },
  };
}

function buildIntentMessages({
  message,
  intentHint,
  strictJson = false,
}) {
  const basePrompt = [
    "Return only one JSON object.",
    "No markdown, no prose, no extra keys, no internal/system details.",
    "Schema:",
    "{",
    '  "kind": "intent",',
    '  "summary": "string",',
    '  "contextEcho": "string|null",',
    '  "nextQuestion": "string|null"',
    "}",
    "Constraints:",
    '- summary: one friendly conversational sentence for the user (for example: "Got it — you want ...").',
    "- contextEcho: short echo of the user's exact topic/request when available, else null.",
    "- nextQuestion: only if required to continue; must be a direct user-facing question; else null.",
    "- Never include confidence, risk, assumptions, permissions, tokens, or internal process terms.",
    strictJson
      ? "STRICT: Output must be valid JSON with exact keys and types."
      : "Keep values concise and user-friendly.",
    `Intent hint: ${String(intentHint || "UNKNOWN")}`,
    `User request: ${String(message || "").trim()}`,
  ].join("\n");
  return [
    { role: "system", content: "You are a structured output generator." },
    { role: "user", content: basePrompt },
  ];
}

function buildCommentaryMessages({
  message,
  intent,
  output,
  strictJson = false,
}) {
  const digest = buildArtifactDigest(output);
  const prompt = [
    "Return only one JSON object.",
    "No markdown, no prose outside JSON, no internal/system details.",
    "Schema:",
    "{",
    '  "kind": "commentary",',
    '  "lines": ["string"],',
    '  "options": [{"label":"string","value":"string"}],',
    '  "question": "string|null"',
    "}",
    "Constraints:",
    "- lines: short user-facing conversational lines explaining what was found and what matters now.",
    "- options: only when the user must choose between matches; label should be human-readable and concise.",
    "- question: user-facing clarification question when needed, otherwise null.",
    "- Never invent tool results not present in digest.",
    "- Never include confidence, tokens, assumptions, risk flags, permissions, or internal workflow terms.",
    '- For ambiguous matches, ask directly: "Which one do you mean?"',
    strictJson
      ? "STRICT: Output must be valid JSON and exactly match keys."
      : "Use concise conversational language.",
    `Intent: ${String(intent || "UNKNOWN")}`,
    `User request: ${String(message || "").trim()}`,
    `Artifact digest: ${JSON.stringify(digest)}`,
  ].join("\n");
  return [
    { role: "system", content: "You generate typed reasoning blocks." },
    { role: "user", content: prompt },
  ];
}

async function generateStructuredPayload({
  kind,
  schema,
  validate,
  buildMessages,
  signal,
  onDelta,
}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const strictJson = attempt === 1;
    const messages = buildMessages({ strictJson });
    let raw = "";

    for await (const part of streamLLM({
      provider: process.env.LLM_PROVIDER || "auto",
      model: process.env.LLM_MODEL,
      mode: "json",
      schema,
      messages,
      signal,
      temperature: strictJson ? 0 : 0.1,
      maxTokens: 420,
    })) {
      if (part?.kind === "delta" && part.text) {
        raw += part.text;
        onDelta?.(part.text);
      }
      if (part?.kind === "final_text" && typeof part.text === "string") {
        raw = raw || part.text;
      }
    }

    const parsed = extractJsonObject(raw);
    if (parsed && validate(parsed)) {
      return { ok: true, value: parsed };
    }
  }

  return {
    ok: false,
    error: `${kind.toUpperCase()}_SCHEMA_VALIDATION_FAILED`,
  };
}

router.post("/agent/stream", async (req, res) => {
  const {
    message,
    context,
    agentVersion = "v1",
    reasoner,
    followUpIntent,
    sessionId,
    documentIds,
    metadata,
  } = req.body || {};

  const documentContext = resolveDocumentContext(sessionId, documentIds);
  const hasMessage = message && typeof message === "string" && message.trim();
  const hasDocuments =
    documentContext &&
    Array.isArray(documentContext.documents) &&
    documentContext.documents.length > 0;

  if (!hasMessage && !followUpIntent && !hasDocuments) {
    res.status(400).json({ error: "Message is required" });
    return;
  }

  const requestContext = buildRequestContext(
    context,
    sessionId,
    documentContext,
    metadata,
  );
  const effectiveMessage =
    hasMessage || followUpIntent || !hasDocuments ? message : "uploaded file";
  const turnId = newEventId("turn");

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.setHeader("Content-Encoding", "identity");
  res.flushHeaders();

  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  let aborted = false;
  const abortController = new AbortController();
  res.on("close", () => {
    aborted = true;
    abortController.abort();
  });

  let seq = 0;
  let didEnd = false;
  let intentTerminal = false;
  let artifactTerminal = false;
  let commentaryTerminal = false;
  let hasStageFailure = false;

  const emit = (type, payload) => {
    if (aborted) return;
    const envelope = {
      eventId: newEventId("evt"),
      turnId,
      seq: ++seq,
      type,
      timestamp: new Date().toISOString(),
      payload: payload && typeof payload === "object" ? payload : {},
    };
    if (!validateEnvelope(envelope)) {
      return;
    }
    res.write(`event: ${type}\ndata: ${JSON.stringify(envelope)}\n\n`);
    if (typeof res.flush === "function") {
      res.flush();
    }
  };

  const emitFailed = (eventName, failure) => {
    hasStageFailure = true;
    const safeFailure = {
      stage: failure?.stage || "turn",
      code: String(failure?.code || "UNKNOWN_ERROR"),
      message: String(failure?.message || "Unknown stream failure"),
      retryable: Boolean(failure?.retryable),
      details:
        failure?.details && typeof failure.details === "object"
          ? failure.details
          : {},
    };
    if (!validateFailure(safeFailure)) {
      safeFailure.code = "FAILURE_SCHEMA_INVALID";
      safeFailure.message = "Failure payload could not be validated";
      safeFailure.retryable = false;
      safeFailure.details = {};
    }
    emit(eventName, safeFailure);
  };

  try {
    emit("turn.start", {
      agentVersion,
      intent: "PENDING",
    });

    const intentDelta = createDeltaEmitter((chunk) =>
      emit("intent.delta", { chunk }),
    );
    const intentResult = await generateStructuredPayload({
      kind: "intent",
      schema: intentSchema,
      validate: validateIntent,
      buildMessages: ({ strictJson }) =>
        buildIntentMessages({
          message: effectiveMessage,
          intentHint: followUpIntent?.intent || "UNKNOWN",
          strictJson,
        }),
      signal: abortController.signal,
      onDelta: (chunk) => intentDelta.push(chunk),
    });
    intentDelta.flush();

    if (!intentResult.ok) {
      emitFailed("intent.failed", {
        stage: "intent",
        code: intentResult.error,
        message: "Could not produce structured intent payload",
        retryable: true,
      });
      intentTerminal = true;
    } else {
      const intentPayload = coerceIntentPayload(intentResult.value, effectiveMessage);
      if (!validateIntent(intentPayload)) {
        emitFailed("intent.failed", {
          stage: "intent",
          code: "INTENT_SCHEMA_INVALID",
          message: "Intent payload failed schema validation",
          retryable: false,
        });
        intentTerminal = true;
      } else {
        emit("intent.final", intentPayload);
        intentTerminal = true;
      }
    }

    const runResult = await agentEngine.run({
      message: effectiveMessage,
      context: requestContext,
      agentVersion,
      reasoner,
      followUpIntent,
      documentContext,
    });
    const contextLifecycle =
      typeof agentEngine.contextStore?.consumeLifecycleEvent === "function"
        ? agentEngine.contextStore.consumeLifecycleEvent(requestContext)
        : null;
    const unifiedResult = contextLifecycle
      ? { ...runResult, contextLifecycle }
      : runResult;

    const artifactOutput = unifiedResult?.output;
    if (!artifactOutput || typeof artifactOutput !== "object") {
      emitFailed("artifact.failed", {
        stage: "artifact",
        code: "INVALID_ARTIFACT",
        message: "Artifact payload missing from agent run result",
        retryable: false,
      });
      artifactTerminal = true;
    } else {
      const artifactDelta = createDeltaEmitter((chunk) =>
        emit("artifact.delta", { chunk }),
      );
      artifactDelta.push(JSON.stringify(buildArtifactDigest(artifactOutput)));
      artifactDelta.flush();

      emit("artifact.final", {
        intent: unifiedResult.intent,
        output: artifactOutput,
        contextLifecycle: unifiedResult.contextLifecycle || null,
      });
      artifactTerminal = true;
    }

    const commentaryDelta = createDeltaEmitter((chunk) =>
      emit("commentary.delta", { chunk }),
    );

    if (!artifactOutput || typeof artifactOutput !== "object") {
      emitFailed("commentary.failed", {
        stage: "commentary",
        code: "NO_ARTIFACT_FOR_COMMENTARY",
        message: "Cannot derive commentary without artifact output",
        retryable: false,
      });
      commentaryTerminal = true;
    } else {
      const commentaryResult = await generateStructuredPayload({
        kind: "commentary",
        schema: commentarySchema,
        validate: validateCommentary,
        buildMessages: ({ strictJson }) =>
          buildCommentaryMessages({
            message: effectiveMessage,
            intent: unifiedResult.intent,
            output: artifactOutput,
            strictJson,
          }),
        signal: abortController.signal,
        onDelta: (chunk) => commentaryDelta.push(chunk),
      });
      commentaryDelta.flush();

      if (!commentaryResult.ok) {
        emitFailed("commentary.failed", {
          stage: "commentary",
          code: commentaryResult.error,
          message: "Could not produce structured commentary payload",
          retryable: true,
        });
        commentaryTerminal = true;
      } else {
        const commentaryPayload = coerceCommentaryPayload(
          commentaryResult.value,
          artifactOutput,
          effectiveMessage,
        );
        if (!validateCommentary(commentaryPayload)) {
          emitFailed("commentary.failed", {
            stage: "commentary",
            code: "COMMENTARY_SCHEMA_INVALID",
            message: "Commentary payload failed schema validation",
            retryable: false,
          });
          commentaryTerminal = true;
        } else {
          emit("commentary.final", {
            ...commentaryPayload,
            message: buildCommentaryPreview(commentaryPayload),
          });
          commentaryTerminal = true;
        }
      }
    }

    emit("turn.end", {
      status: hasStageFailure ? "error" : "success",
      preview: {
        intent: unifiedResult?.intent || "UNKNOWN",
        intentText: intentResult.ok
          ? buildIntentPreview(coerceIntentPayload(intentResult.value, effectiveMessage))
          : null,
      },
    });
    didEnd = true;
  } catch (err) {
    if (!intentTerminal) {
      emitFailed("intent.failed", {
        stage: "intent",
        code: "INTENT_ABORTED",
        message: "Intent stage aborted before finalization",
        retryable: false,
      });
      intentTerminal = true;
    }
    if (!artifactTerminal) {
      emitFailed("artifact.failed", {
        stage: "artifact",
        code: "ARTIFACT_ABORTED",
        message: "Artifact stage aborted before finalization",
        retryable: false,
      });
      artifactTerminal = true;
    }
    if (!commentaryTerminal) {
      emitFailed("commentary.failed", {
        stage: "commentary",
        code: "COMMENTARY_ABORTED",
        message: "Commentary stage aborted before finalization",
        retryable: false,
      });
      commentaryTerminal = true;
    }
    emit("turn.end", {
      status: "error",
      error: String(err?.message || "Unknown stream error"),
    });
    didEnd = true;
  }

  if (!didEnd) {
    emit("turn.end", { status: "error", error: "Stream terminated unexpectedly" });
  }
  res.end();
});

module.exports = router;
