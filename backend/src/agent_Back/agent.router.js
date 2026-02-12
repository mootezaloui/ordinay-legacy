"use strict";

const express = require("express");
const AgentEngine = require("./agent.engine");
const { getAvailableCommands } = require("./intent.classifier");
const { streamIntentFramingMessage, streamWebSearchAiSummary } = require("./llm.client");
const { streamCommentary } = require("./commentary.generator");

const router = express.Router();
const agentEngine = new AgentEngine();

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

const ENTITY_LABELS = Object.freeze({
  client: "client",
  dossier: "dossier",
  lawsuit: "lawsuit",
  session: "session",
  task: "task",
  personal_task: "personal task",
  mission: "mission",
  officer: "officer",
  financial_entry: "financial entry",
  notification: "notification",
  history_event: "history entry",
});

function hasNonEmptyFilters(filters) {
  if (!filters || typeof filters !== "object") return false;
  return Object.values(filters).some(
    (value) =>
      value !== null && value !== undefined && value !== "" && value !== false,
  );
}

function formatEntityLabel(entityType) {
  if (!entityType) return null;
  const normalized = String(entityType).toLowerCase();
  return ENTITY_LABELS[normalized] || normalized.replace(/_/g, " ");
}

function deriveIntentType(intent, contextSnapshot) {
  const source = (intent || contextSnapshot?.lastIntent || "").toUpperCase();
  if (!source) return null;

  if (source.includes("LIST")) return "list";
  if (source.includes("SUMMARIZE")) return "summarize";
  if (source.includes("READ") || source.includes("EXPLAIN")) return "read";

  if (
    source.includes("ANALYZE") ||
    source.includes("RISK") ||
    source.includes("PROPOSE") ||
    source.includes("DRAFT")
  ) {
    return "summarize";
  }

  // Handle follow-up and command intents - derive from context if available
  if (
    source === "FOLLOW_UP" ||
    source === "COMMAND" ||
    source === "SAFETY_GUARD"
  ) {
    const lastIntent = (contextSnapshot?.lastIntent || "").toUpperCase();
    if (lastIntent.includes("LIST")) return "list";
    if (lastIntent.includes("SUMMARIZE")) return "summarize";
    if (lastIntent.includes("READ") || lastIntent.includes("EXPLAIN"))
      return "read";
    // Default to 'read' for follow-ups (reviewing specific data)
    return "read";
  }

  // GENERAL_CHAT gets 'answer' type for conversational requests
  if (source === "GENERAL_CHAT") {
    return "answer";
  }

  // Fallback: any data retrieval intent gets 'read' type
  return "read";
}

function deriveEntityLabel(
  intent,
  followUpIntent,
  contextSnapshot,
) {
  if (followUpIntent?.entityType) {
    return formatEntityLabel(followUpIntent.entityType);
  }

  const normalized = (intent || "").toUpperCase();
  if (normalized.includes("DRAFT_INVITATION")) return "invitation draft";
  if (normalized.includes("DRAFT_CLIENT_EMAIL")) return "client email";
  if (normalized.includes("ANALYZE_OPERATIONAL_RISKS"))
    return "operational risks";
  if (normalized.includes("PROPOSE_ACTIONS")) return "next steps";
  if (normalized.includes("SEARCH_WEB")) return "web sources";
  if (normalized.includes("SEARCH_DEEP_WEB")) return "legal sources";
  if (normalized.includes("WEB_SEARCH")) return "web sources";
  if (normalized.includes("DEEP_SEARCH")) return "legal sources";
  if (normalized.includes("CLIENT")) return "client";
  if (normalized.includes("DOSSIER")) return "dossier";
  if (normalized.includes("LAWSUIT")) return "lawsuit";
  if (normalized.includes("SESSION")) return "session";
  if (normalized.includes("PERSONAL_TASK")) return "personal task";
  if (normalized.includes("TASK")) return "task";
  if (normalized.includes("MISSION")) return "mission";
  if (normalized.includes("OFFICER")) return "officer";
  if (normalized.includes("FINANCIAL")) return "financial entry";
  if (normalized.includes("NOTIFICATION")) return "notification";
  if (normalized.includes("HISTORY")) return "history entry";

  if (contextSnapshot?.activeEntityType) {
    return formatEntityLabel(contextSnapshot.activeEntityType);
  }
  if (contextSnapshot?.lastEntityType) {
    return formatEntityLabel(contextSnapshot.lastEntityType);
  }

  // GENERAL_CHAT gets 'request' as entity label
  if (normalized === "GENERAL_CHAT") {
    return "request";
  }

  return null;
}

function deriveScope(intent, readIntent, followUpIntent, contextSnapshot) {
  const source = (intent || contextSnapshot?.lastIntent || "").toUpperCase();
  const hasFilters =
    hasNonEmptyFilters(readIntent?.filters) ||
    hasNonEmptyFilters(followUpIntent?.filters) ||
    hasNonEmptyFilters(contextSnapshot?.lastResultSummary?.filters);

  if (hasFilters) return "filtered";
  if (source.includes("LIST")) return "multiple";
  if (source.includes("SUMMARIZE") && readIntent?.aggregateSummary)
    return "multiple";
  if (followUpIntent?.entityId) return "single";
  if (
    source.includes("READ") ||
    source.includes("EXPLAIN") ||
    source.includes("SUMMARIZE")
  )
    return "single";
  if (
    source.includes("DRAFT") ||
    source.includes("ANALYZE") ||
    source.includes("PROPOSE")
  )
    return "single";
  return "multiple";
}

function buildIntentFramingPayload({
  intent,
  readIntent,
  followUpIntent,
  contextSnapshot,
}) {
  if (!intent) return null;

  const intentType = deriveIntentType(intent, contextSnapshot);
  const entity = deriveEntityLabel(
    intent,
    followUpIntent,
    contextSnapshot,
  );
  const scope = deriveScope(
    intent,
    readIntent,
    followUpIntent,
    contextSnapshot,
  );

  if (!intentType || !entity || !scope) return null;
  return { intentType, entity, scope };
}

/**
 * Stream intent event with LLM-generated message.
 * Unified event name: `intent`
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} payload - Intent payload { intentType, entity, scope }
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
              entity: payload?.entity || null,
              scope: payload?.scope || null,
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

  // Skip commentary for chat and external search artifacts.
  const artifactType = result?.output?.type;
  if (
    !artifactType ||
    artifactType === "chat" ||
    artifactType === "web_search_results" ||
    artifactType === "web_deep_search_results"
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

  // INTENT FRAMING IS MANDATORY FOR ALL INTERACTIONS
  // Only suppress for explicitly conversational types (chat is already conversational)
  const outputType = String(result?.output?.type || "").toLowerCase();
  if (outputType === "chat") {
    return false;
  }

  return true;
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

/**
 * SSE streaming endpoint for chat responses
 *
 * Events sent:
 * - event: start    - Stream started, includes intent
 * - event: chunk    - Text chunk from LLM
 * - event: done     - Stream completed
 * - event: error    - Error occurred
 */
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
  const hasDocuments = documentContext && documentContext.documents && documentContext.documents.length > 0;
  const requestContext = buildRequestContext(
    context,
    sessionId,
    documentContext,
    metadata,
  );
  const chunkStreamingEnabled = resolveChunkStreamingEnabled(req, metadata);

  // Validate message — allow file-only uploads to pass through
  if (!hasMessage && !followUpIntent && !hasDocuments) {
    res.status(400).json({ error: "Message is required" });
    return;
  }
  const effectiveMessage =
    hasMessage || followUpIntent || !hasDocuments ? message : "uploaded file";

  // Set up SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // Disable nginx buffering
  res.flushHeaders();

  // Disable Nagle's algorithm for real-time streaming
  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  // Helper to send SSE events with immediate flush
  const sendEvent = (event, data) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    // Force flush if available (compression middleware)
    if (typeof res.flush === "function") {
      res.flush();
    }
  };

  // Handle client disconnect - use res.on('close') instead of req.on('close')
  // req.on('close') can fire prematurely in some cases
  let aborted = false;
  const abortController = new AbortController();
  res.on("close", () => {
    console.log("[SSE] Client disconnected (res.close event)");
    aborted = true;
    abortController.abort();
  });

  // TURN COMPLETION INVARIANT: Track terminal lifecycle envelopes
  let hasArtifactBeenSent = false;
  let hasErrorBeenSent = false;
  let hasDoneBeenSent = false;
  const trackingSendEvent = (event, data) => {
    sendEvent(event, data);
    if (event === "artifact") {
      hasArtifactBeenSent = true;
    }
    if (event === "error") {
      hasErrorBeenSent = true;
    }
  };

  const sendErrorEnvelope = (message, code = "STREAM_ERROR") => {
    if (aborted || hasErrorBeenSent) return;
    trackingSendEvent("error", {
      error: message || "Unknown stream error",
      code,
      terminal: true,
      timestamp: new Date().toISOString(),
    });
  };

  const sendDoneEnvelope = (status = "success") => {
    if (aborted || hasDoneBeenSent) return;
    hasDoneBeenSent = true;
    trackingSendEvent("done", {
      status,
      timestamp: new Date().toISOString(),
    });
  };

  // TURN COMPLETION INVARIANT: Every turn ends with artifact OR error before done.
  const sendDoneWithCompletionGuarantee = () => {
    if (aborted) return;
    if (!hasArtifactBeenSent && !hasErrorBeenSent) {
      console.warn("[Turn Completion] Missing artifact envelope before done");
      sendErrorEnvelope(
        "Stream completed without artifact envelope",
        "PROTOCOL_NO_ARTIFACT",
      );
    }
    sendDoneEnvelope(hasErrorBeenSent ? "error" : "success");
  };

  try {
    // Add user message to transcript immediately (before processing)
    // This ensures the message is available for editing even while processing
    if (effectiveMessage && requestContext && !followUpIntent) {
      const conversationId = requestContext.conversationId || sessionId;
      const userId = requestContext.userId || 'default';
      if (conversationId && agentEngine.contextStore?._transcriptStore) {
        agentEngine.contextStore._transcriptStore.updateOrAddTurn(conversationId, userId, {
          userMessage: effectiveMessage,
          agentIntent: null,  // Will be filled in during processing
          agentOutput: null,   // Will be filled in during processing
        });
      }
    }

    trackingSendEvent("start", {
      intent: "PENDING",
      agentVersion,
    });

    const unifiedResult = await agentEngine.run({
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
    const unifiedResultWithLifecycle = contextLifecycle
      ? { ...unifiedResult, contextLifecycle }
      : unifiedResult;
    const externalSearchFlow = isExternalSearchArtifact(unifiedResultWithLifecycle);
    if (externalSearchFlow) {
      console.log(
        "[SearchFlow] External search artifact detected",
        JSON.stringify({
          intent: unifiedResultWithLifecycle?.intent,
          type: unifiedResultWithLifecycle?.output?.type,
          provider: unifiedResultWithLifecycle?.output?.provider || null,
        }),
      );
    }

    // Unified lifecycle: start → intent → artifact → commentary → done

    // Stream intent event
    const contextSnapshot = agentEngine.contextStore.get(requestContext);
    const framingPayload = buildIntentFramingPayload({
      intent: unifiedResultWithLifecycle.intent,
      followUpIntent,
      contextSnapshot,
    });
    if (
      shouldSendIntentFraming(
        unifiedResultWithLifecycle,
        requestContext,
        framingPayload,
      )
    ) {
      if (externalSearchFlow) {
        console.log("[SearchFlow] intent_start");
      }
      console.log(
        "[LLM][IntentFraming] Invoked",
        JSON.stringify({ intent: unifiedResultWithLifecycle?.intent }),
      );
      await streamIntentEvent(
        trackingSendEvent,
        framingPayload,
        abortController.signal,
        aborted,
        { chunkStreaming: chunkStreamingEnabled },
      );
    }

    // Send artifact event
    const sentArtifact = sendArtifactEvent(
      trackingSendEvent,
      unifiedResultWithLifecycle,
      aborted,
    );
    if (sentArtifact && externalSearchFlow) {
      console.log(
        "[SearchFlow] results_emitted",
        `resultCount=${Array.isArray(unifiedResultWithLifecycle?.output?.results) ? unifiedResultWithLifecycle.output.results.length : 0}`,
      );
    }
    if (!sentArtifact) {
      sendErrorEnvelope("Agent response did not include valid output", "INVALID_OUTPUT");
    }

    // Stream commentary event
    if (sentArtifact) {
      if (externalSearchFlow) {
        console.log("[SearchFlow] Using grounded search commentary stream");
        await streamGroundedSearchCommentaryEvent(
          trackingSendEvent,
          unifiedResultWithLifecycle,
          abortController.signal,
          aborted,
          { chunkStreaming: chunkStreamingEnabled },
        );
      } else {
        console.log(
          "[LLM][Commentary] Invoked",
          JSON.stringify({ intent: unifiedResultWithLifecycle?.intent }),
        );
        await streamCommentaryEvent(
          trackingSendEvent,
          unifiedResultWithLifecycle,
          requestContext,
          aborted,
          abortController.signal,
          { chunkStreaming: chunkStreamingEnabled },
        );
      }
    }

    // Done (always sent)
    sendDoneWithCompletionGuarantee();
  } catch (err) {
    if (!aborted) {
      sendErrorEnvelope(err.message || "Unknown error", "STREAM_EXCEPTION");
      sendDoneWithCompletionGuarantee();
    }
  }

  res.end();
});

module.exports = router;
