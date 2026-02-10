"use strict";

const express = require("express");
const AgentEngine = require("./agent.engine");
const classifyIntent = require("./intent.classifier");
const {
  getAvailableCommands,
  isSlashCommand,
  parseSlashCommand,
  detectReadIntent,
  detectFollowUp,
} = require("./intent.classifier");
const { resolveInteractionPosture } = require("./posture.resolver");
const { INTENTS } = require("./intents");
const {
  streamChatWithCallbacks,
  streamIntentFramingMessage,
} = require("./llm.client");
const { streamCommentary } = require("./commentary.generator");

const router = express.Router();
const agentEngine = new AgentEngine();

// ============================================================================
// Status Message Helpers — Deterministic action descriptions
// ============================================================================

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
  commandInfo,
) {
  if (followUpIntent?.entityType) {
    return formatEntityLabel(followUpIntent.entityType);
  }

  if (commandInfo?.entityLabel) {
    return commandInfo.entityLabel;
  }

  const normalized = (intent || "").toUpperCase();
  if (normalized.includes("DRAFT_INVITATION")) return "invitation draft";
  if (normalized.includes("DRAFT_CLIENT_EMAIL")) return "client email";
  if (normalized.includes("ANALYZE_OPERATIONAL_RISKS"))
    return "operational risks";
  if (normalized.includes("PROPOSE_ACTIONS")) return "next steps";
  if (normalized.includes("WEB_SEARCH")) return "web sources";
  if (normalized.includes("DEEP_SEARCH")) return "legal sources";
  if (normalized.includes("CLIENT")) return "client";
  if (normalized.includes("DOSSIER")) return "dossier";
  if (normalized.includes("LAWSUIT")) return "lawsuit";
  if (normalized.includes("SESSION")) return "session";
  if (normalized.includes("PERSONAL_TASK")) return "personal task";
  if (normalized.includes("TASK")) return "task";
  if (normalized.includes("MISSION")) return "mission";
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
  commandInfo,
}) {
  if (!intent) return null;

  const intentType = deriveIntentType(intent, contextSnapshot);
  const entity = deriveEntityLabel(
    intent,
    followUpIntent,
    contextSnapshot,
    commandInfo,
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

function normalizeCategoryLabel(category) {
  if (!category) return null;
  const normalized = String(category).toLowerCase();
  if (normalized === "accounting") return "financial entry";
  if (normalized === "personal_tasks") return "personal task";
  if (normalized === "history") return "history entry";
  if (ENTITY_LABELS[normalized]) return ENTITY_LABELS[normalized];
  if (normalized.endsWith("s")) return normalized.slice(0, -1);
  return normalized.replace(/_/g, " ");
}

function buildIntentFramingFromCommand(parsedCommand) {
  if (!parsedCommand || !parsedCommand.valid || !parsedCommand.toolMapping)
    return null;
  if (parsedCommand.commandKey === "help") return null;

  const requiresArg = !!parsedCommand.toolMapping.params?.requiresArg;
  const entityLabel = normalizeCategoryLabel(
    parsedCommand.toolMapping.category,
  );
  if (!entityLabel) return null;

  return {
    intentType: requiresArg ? "read" : "list",
    entity: entityLabel,
    scope: requiresArg ? "single" : "multiple",
  };
}

async function sendIntentFramingIfNeeded(sendEvent, payload, signal, aborted) {
  if (aborted) return;

  const signalPayload = payload
    ? {
        type: "INTENT_FRAMING",
        action: payload.intentType,
        entity: payload.entity,
        scope: payload.scope,
      }
    : null;

  // Use streaming for real-time responsiveness - LLM generates the message
  return new Promise((resolve) => {
    let hasContent = false;
    let fullMessage = "";

    console.log(
      "[Intent Framing] Starting LLM generation with payload:",
      JSON.stringify(payload),
    );

    streamIntentFramingMessage(
      payload || {},
      {
        onChunk: (chunk) => {
          if (aborted) return;
          if (!hasContent) {
            hasContent = true;
            console.log(
              "[Intent Framing] First chunk received, streaming started",
            );
          }
          fullMessage += chunk;
          sendEvent("intent_framing_chunk", { chunk });
        },
        onDone: (message) => {
          if (aborted) {
            resolve();
            return;
          }

          console.log(
            "[Intent Framing] LLM generation complete, message length:",
            fullMessage.length,
          );

          // Only send if LLM produced content - no hardcoded fallbacks
          if (fullMessage) {
            sendEvent("intent_framing", {
              message: fullMessage,
              messageType: INTENT_FRAMING_MESSAGE_TYPE,
              signal: signalPayload,
            });
          } else {
            console.log(
              "[Intent Framing] LLM produced no content, skipping intent framing",
            );
          }
          resolve();
        },
        onError: (error) => {
          // Log error but don't send hardcoded fallback - let the artifact speak for itself
          console.warn(
            "[Intent Framing] LLM error, skipping intent framing:",
            error,
          );
          resolve();
        },
      },
      signal,
    );
  });
}

function normalizeResultEnvelopeOutput(result) {
  const output = result?.output;
  if (!output || typeof output !== "object") {
    return null;
  }

  if (output.type === "chat") {
    return output;
  }

  // ARTIFACT JUSTIFICATION: convert low-value artifacts into chat result envelopes.
  const artifactHasValue = checkArtifactValue(output);
  if (!artifactHasValue.hasValue) {
    console.log(
      "[Artifact Justification] Converting low-value artifact to chat envelope:",
      artifactHasValue.reason,
    );
    return {
      type: "chat",
      message:
        artifactHasValue.textAlternative ||
        "I understand your request, but I don't have specific information to show right now.",
      timestamp: new Date().toISOString(),
      source: "fallback",
    };
  }

  return output;
}

/**
 * Send unified result envelope.
 * INVARIANT: successful turns emit exactly one `result` envelope.
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} result - Agent result from engine
 * @param {boolean} aborted - Whether connection was aborted
 * @returns {boolean} True when a result envelope was emitted
 */
function sendResultWithCompletionGuarantee(sendEvent, result, aborted) {
  if (aborted) return false;

  const normalizedOutput = normalizeResultEnvelopeOutput(result);
  if (!normalizedOutput) {
    console.warn("[Turn Completion] Missing output envelope in result");
    return false;
  }

  sendEvent("result", {
    output: normalizedOutput,
    intent: result.intent,
    contextLifecycle: result?.contextLifecycle || null,
  });
  return true;
}

/**
 * Check if an artifact adds value and should be shown.
 * Artifacts are optional - they should only appear when they provide
 * information that can't be conveyed in text alone.
 *
 * @param {Object} output - The artifact output
 * @returns {Object} { hasValue: boolean, reason?: string, textAlternative?: string }
 */
function checkArtifactValue(output) {
  const type = output?.type;

  // Collection artifacts: only show if they contain items
  if (type === "collection") {
    const items = output.items || [];
    if (items.length === 0) {
      return {
        hasValue: false,
        reason: "empty_collection",
        textAlternative: output.summary || "No items found matching your criteria.",
      };
    }
    return { hasValue: true };
  }

  // Explanation artifacts: only show if they contain real system data
  if (type === "explanation") {
    const facts = output.facts;
    const details = facts?.details || [];
    const summary = facts?.summary || "";

    // Empty or placeholder explanations should be suppressed
    if (details.length === 0 && !summary) {
      return {
        hasValue: false,
        reason: "empty_explanation",
        textAlternative: "I don't have specific information about that at the moment.",
      };
    }

    // Generic explanations (no entity ID or system context) should be text-only
    const entityId = output.entityId || "";
    if (!entityId || entityId === "pending_clarification" || entityId === "query") {
      return {
        hasValue: false,
        reason: "generic_explanation",
        textAlternative: summary || "Let me explain that for you.",
      };
    }

    return { hasValue: true };
  }

  // Clarification artifacts: always show (they guide the user)
  if (type === "clarification") {
    return { hasValue: true };
  }

  // Risk analysis artifacts: only show if risks were identified
  if (type === "operational_risk_analysis") {
    const risks = output.risks || [];
    if (risks.length === 0) {
      return {
        hasValue: false,
        reason: "no_risks",
        textAlternative: output.summary || "No significant operational risks were identified.",
      };
    }
    return { hasValue: true };
  }

  // Draft artifacts: always show (they contain generated content)
  if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(type)) {
    const sections = output.sections || {};
    const body = sections.body || "";
    if (!body || body.trim().length === 0) {
      return {
        hasValue: false,
        reason: "empty_draft",
        textAlternative: "I wasn't able to generate a draft at this time.",
      };
    }
    return { hasValue: true };
  }

  // Action plan artifacts: only show if actions exist
  if (type === "action_plan") {
    const actions = output.actions || [];
    if (actions.length === 0) {
      return {
        hasValue: false,
        reason: "no_actions",
        textAlternative: "No specific actions are recommended at this time.",
      };
    }
    return { hasValue: true };
  }

  // Unknown artifact types: show by default (conservative)
  return { hasValue: true };
}

/**
 * Generate and send commentary for an artifact with streaming.
 * This is called AFTER the artifact is sent, BEFORE 'done'.
 * Commentary failures NEVER block the artifact.
 *
 * @param {Function} sendEvent - SSE event sender
 * @param {Object} result - Agent result containing output
 * @param {Object} context - Request context
 * @param {boolean} aborted - Whether connection was aborted
 * @param {AbortSignal} signal - Abort signal for cancellation
 */
async function sendCommentaryIfNeeded(
  sendEvent,
  result,
  context,
  aborted,
  signal,
) {
  if (aborted) return;

  // Skip commentary for chat outputs (already conversational)
  const artifactType = result?.output?.type;
  if (!artifactType || artifactType === "chat" || artifactType === "clarification") return;

  const resultCount =
    typeof result?.readMeta?.count === "number"
      ? result.readMeta.count
      : undefined;

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
  };

  console.log("[Commentary] Intent for mode derivation:", result?.intent);

  return new Promise((resolve) => {
    let hasContent = false;

    streamCommentary(
      artifactType,
      result.output,
      commentaryContext,
      {
        onChunk: (chunk) => {
          if (aborted) return;
          hasContent = true;
          sendEvent("commentary_chunk", { chunk });
        },
        onDone: (commentaryResult) => {
          if (aborted) {
            resolve();
            return;
          }

          // Send final commentary message (for clients that don't support streaming)
          const hasSignals =
            Array.isArray(commentaryResult?.signals) &&
            commentaryResult.signals.length > 0;
          if (commentaryResult?.commentary || hasSignals) {
            console.log(
              "[SSE] Sending commentary, source:",
              commentaryResult.source,
            );
            sendEvent("commentary", {
              message: commentaryResult.commentary || "",
              source: commentaryResult.source,
              signals: commentaryResult.signals || [],
            });
          } else {
            console.log(
              "[SSE] No commentary generated, source:",
              commentaryResult?.source,
              "reason:",
              commentaryResult?.reason,
            );
          }
          resolve();
        },
        onError: (err) => {
          console.warn(
            "[SSE] Commentary streaming failed (non-blocking):",
            err,
          );
          resolve();
        },
      },
      signal,
    );
  });
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

function buildRequestContext(context, sessionId, documentContext) {
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

function shouldSendIntentFraming(result, requestContext, framingPayload) {
  if (!framingPayload) return false;

  const outputType = String(result?.output?.type || "").toLowerCase();
  if (outputType === "chat" || outputType === "clarification") {
    return false;
  }

  if (requestContext?._hasDocumentContext) {
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
  } = req.body || {};
  try {
    const documentContext = resolveDocumentContext(sessionId, documentIds);
    const requestContext = buildRequestContext(
      context,
      sessionId,
      documentContext,
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
  } = req.body || {};

  const documentContext = resolveDocumentContext(sessionId, documentIds);

  const hasMessage = message && typeof message === "string" && message.trim();
  const hasDocuments = documentContext && documentContext.documents && documentContext.documents.length > 0;
  const requestContext = buildRequestContext(
    context,
    sessionId,
    documentContext,
  );

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
  let hasResultBeenSent = false;
  let hasErrorBeenSent = false;
  let hasDoneBeenSent = false;
  const trackingSendEvent = (event, data) => {
    sendEvent(event, data);
    if (event === "result") {
      hasResultBeenSent = true;
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

  // TURN COMPLETION INVARIANT: Every turn ends with result OR error before done.
  const sendDoneWithCompletionGuarantee = () => {
    if (aborted) return;
    if (!hasResultBeenSent && !hasErrorBeenSent) {
      console.warn("[Turn Completion] Missing result envelope before done");
      sendErrorEnvelope(
        "Stream completed without result envelope",
        "PROTOCOL_NO_RESULT",
      );
    }
    sendDoneEnvelope(hasErrorBeenSent ? "error" : "success");
  };

  try {
    trackingSendEvent("start", {
      intent: "PENDING",
      agentVersion,
    });

    trackingSendEvent("status", {
      action: getStatusAction(null, "classifying"),
      phase: "classifying",
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

    if (contextLifecycle) {
      trackingSendEvent("status", {
        action: getLifecycleStatusAction(contextLifecycle),
        phase: "context_lifecycle",
        contextLifecycle,
      });
    }

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
      await sendIntentFramingIfNeeded(
        trackingSendEvent,
        framingPayload,
        abortController.signal,
        aborted,
      );
    }

    trackingSendEvent("status", {
      action: getStatusAction(unifiedResultWithLifecycle.intent, "interpreting"),
      phase: "interpreting",
    });
    const sentResult = sendResultWithCompletionGuarantee(
      trackingSendEvent,
      unifiedResultWithLifecycle,
      aborted,
    );
    if (!sentResult) {
      sendErrorEnvelope("Agent response did not include valid output", "INVALID_OUTPUT");
    }

    if (sentResult) {
      trackingSendEvent("status", {
        action: getStatusAction(unifiedResultWithLifecycle.intent, "commentary"),
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        unifiedResultWithLifecycle,
        requestContext,
        aborted,
        abortController.signal,
      );
    }

    sendDoneWithCompletionGuarantee();
    res.end();
    return;

    // Legacy stream gating path retained for reference only.
    // It is explicitly disabled to keep turn semantics endpoint-independent.
    if (false) {
    // ========== POSTURE RESOLUTION GATE (PRIMARY CONTROL PLANE) ==========
    // CRITICAL: Resolve interaction posture BEFORE any other gates
    // Posture determines artifact requirements, context scope, streaming behavior
    const posture = await resolveInteractionPosture(message, requestContext);
    console.log(
      `[Posture] Resolved: ${posture.mode} (confidence: ${posture.confidence}, signals: ${posture.signals.join(", ")})`,
    );
    trackingSendEvent("posture_resolved", {
      posture: posture.mode,
      confidence: posture.confidence,
      signals: posture.signals,
    });
    // ====================================================================

    // Handle structured follow-up intents first (bypass NLP/LLM entirely)
    if (followUpIntent) {
      trackingSendEvent("start", {
        intent: followUpIntent.intent,
        agentVersion,
        isFollowUpIntent: true,
      });
      const framingPayload = buildIntentFramingPayload({
        intent: followUpIntent.intent,
        followUpIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: fetching data
      trackingSendEvent("status", {
        action: getStatusAction(followUpIntent.intent, "fetching"),
        phase: "fetching",
      });
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        followUpIntent,
        documentContext,
        posture,
      });
      // Status: interpreting (brief)
      trackingSendEvent("status", {
        action: getStatusAction(followUpIntent.intent, "interpreting"),
        phase: "interpreting",
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      trackingSendEvent("status", {
        action: getStatusAction(followUpIntent.intent, "commentary"),
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }

    // Handle slash commands first - bypass LLM entirely
    // Only fire for Work/Inspection postures (skip for Assistant)
    if (isSlashCommand(message) && posture.mode !== 'ASSISTANT') {
      trackingSendEvent("start", { intent: "COMMAND", agentVersion, isCommand: true });
      const parsedCommand = parseSlashCommand(message);
      const framingPayload = buildIntentFramingFromCommand(parsedCommand);
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: executing command
      trackingSendEvent("status", { action: "Executing command…", phase: "executing" });
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        documentContext,
        posture,
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }

    // ========== FOLLOW-UP INTENT GATE ==========
    // CRITICAL: Must run BEFORE intent classification to prevent fallthrough to generic chat
    // If a follow-up is detected, route through agentEngine.run() which has proper handling
    const followUpDetection = detectFollowUp(message, requestContext);
    if (followUpDetection && followUpDetection.isFollowUp) {
      console.log(
        "[SSE] Follow-up detected:",
        followUpDetection.type,
        "confidence:",
        followUpDetection.confidence,
      );
      const contextSnapshot = agentEngine.contextStore.get(requestContext);
      trackingSendEvent("start", {
        intent: "FOLLOW_UP",
        agentVersion,
        isFollowUp: true,
        followUpType: followUpDetection.type,
      });
      // Use 'FOLLOW_UP' as intent fallback when lastIntent is not available
      const framingPayload = buildIntentFramingPayload({
        intent: contextSnapshot?.lastIntent || "FOLLOW_UP",
        contextSnapshot,
      });
      // Always send intent framing for follow-ups to maintain conversational flow
      await sendIntentFramingIfNeeded(
        trackingSendEvent,
        framingPayload,
        abortController.signal,
        aborted,
      );
      // Status: processing follow-up
      trackingSendEvent("status", {
        action: "Processing follow-up…",
        phase: "fetching",
      });
      // Route through agentEngine.run() which has the follow-up resolution logic
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        documentContext,
        posture,
      });
      trackingSendEvent("status", {
        action: getStatusAction(result.intent, "interpreting"),
        phase: "interpreting",
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      trackingSendEvent("status", {
        action: getStatusAction(result.intent, "commentary"),
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }
    // ========== END FOLLOW-UP INTENT GATE ==========

    // READ INTENT GATE - check for data requests BEFORE LLM classification
    // Only fire for Work/Inspection postures (skip for Assistant)
    const readIntent = posture.mode !== 'ASSISTANT' ? detectReadIntent(message, requestContext) : null;
    if (readIntent && readIntent.requiresLocalData) {
      trackingSendEvent("start", {
        intent: readIntent.intent,
        agentVersion,
        isReadIntent: true,
      });
      const framingPayload = buildIntentFramingPayload({
        intent: readIntent.intent,
        readIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: fetching data
      trackingSendEvent("status", {
        action: getStatusAction(readIntent.intent, "fetching"),
        phase: "fetching",
      });
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        documentContext,
        posture,
      });
      // Status: interpreting
      trackingSendEvent("status", {
        action: getStatusAction(readIntent.intent, "interpreting"),
        phase: "interpreting",
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      trackingSendEvent("status", {
        action: getStatusAction(readIntent.intent, "commentary"),
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }

    // Status: classifying (before LLM intent classification)
    trackingSendEvent("status", {
      action: getStatusAction(null, "classifying"),
      phase: "classifying",
    });

    // Classify intent for non-command, non-data messages
    const intent = await classifyIntent(message, requestContext);

    // Send start event with intent
    trackingSendEvent("start", { intent, agentVersion });

    // ========== STREAMING DRAFT GENERATION ==========
    // For DRAFT_* intents, stream the content generation like GENERAL_CHAT
    // Intent framing is sent first, then content streams token-by-token from LLM
    const streamingIntents = [
      INTENTS.DRAFT_INVITATION,
      INTENTS.DRAFT_CLIENT_EMAIL,
    ];

    if (streamingIntents.includes(intent)) {
      // Send intent framing first (acknowledges the task)
      const framingPayload = buildIntentFramingPayload({ intent });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }

      // Status: generating
      trackingSendEvent("status", {
        action: "Generating draft…",
        phase: "generating",
      });

      // Stream the draft content from LLM
      console.log("[Streaming Draft] Starting streaming generation for intent:", intent);
      let fullContent = "";

      await streamChatWithCallbacks(
        message,
        {
          onChunk: (content) => {
            if (aborted) return;
            fullContent += content;
            trackingSendEvent("chunk", { content });
          },
          onDone: () => {
            if (aborted) return;
            console.log("[Streaming Draft] Generation complete, length:", fullContent.length);
          },
          onError: (error) => {
            if (aborted) return;
            console.log("[Streaming Draft] Error:", error);
            trackingSendEvent("error", { error });
          },
          onCancelled: () => {
            console.log("[Streaming Draft] Cancelled");
            trackingSendEvent("cancelled", {});
          },
        },
        abortController.signal,
      );

      // Generate conversational commentary AFTER streaming (optional)
      trackingSendEvent("status", {
        action: "Finalizing…",
        phase: "commentary",
      });

      // Create a result object for commentary generation
      const draftResult = {
        intent,
        output: {
          type: "chat",
          message: fullContent,
          timestamp: new Date().toISOString(),
        },
      };

      await sendCommentaryIfNeeded(
        trackingSendEvent,
        draftResult,
        context,
        aborted,
        abortController.signal,
      );

      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }
    // ========== END STREAMING DRAFT GENERATION ==========

    // For other non-GENERAL_CHAT intents, use batch processing
    if (intent !== INTENTS.GENERAL_CHAT) {
      const framingPayload = buildIntentFramingPayload({ intent });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: processing non-chat intent
      trackingSendEvent("status", {
        action: getStatusAction(intent, "analyzing"),
        phase: "analyzing",
      });
      // For non-chat intents, fall back to regular processing
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        documentContext,
        posture,
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      trackingSendEvent("status", {
        action: getStatusAction(intent, "commentary"),
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }

    // ========== FINAL SAFETY GUARD ==========
    // CRITICAL: If we reach here with a message that looks like a data request,
    // it means the READ intent gate missed it. Route through agentEngine instead.
    // This prevents LLM from asking "Could you provide more context?" after retrieving data.

    // DOMAIN LANGUAGE DECOUPLING: Don't trigger on generic domain usage
    const isGenericDomainUsage =
      /\b(a|an)\s+(sample|example|template|draft|generic|simple|professional|formal)\s+(email|letter|message|document|invitation|cover\s+letter)\b/i.test(message) ||
      /\b(sample|example|template|generic)\s+(of|for)\s+(a|an)\b/i.test(message) ||
      /\bhow\s+to\s+(write|draft|compose|structure)\s+(a|an)\b/i.test(message);

    // Safety guard: Only fire for Work/Inspection postures (skip for Assistant)
    const looksLikeDataRequest =
      posture.mode !== 'ASSISTANT' &&
      !isGenericDomainUsage &&
      /\b(client|clients|dossier|dossiers|task|tasks|session|sessions)\b/i.test(
        message,
      );
    if (looksLikeDataRequest) {
      console.log(
        "[SSE] Safety guard triggered: message contains entity keywords but reached LLM path",
      );
      trackingSendEvent("start", {
        intent: "SAFETY_GUARD",
        agentVersion,
        isSafetyGuard: true,
      });
      const safetyReadIntent = detectReadIntent(message, requestContext);
      const framingPayload = buildIntentFramingPayload({
        intent: safetyReadIntent?.intent,
        readIntent: safetyReadIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          trackingSendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: safety guard triggered, fetching
      trackingSendEvent("status", { action: "Retrieving data…", phase: "fetching" });
      const result = await agentEngine.run({
        message,
        context: requestContext,
        agentVersion,
        reasoner: "rule",
        documentContext,
        posture,
      });
      trackingSendEvent("status", {
        action: "Building interpretation…",
        phase: "interpreting",
      });
      sendResultWithCompletionGuarantee(trackingSendEvent, result, aborted, posture);
      // Generate conversational commentary AFTER artifact (non-blocking)
      trackingSendEvent("status", {
        action: "Preparing response…",
        phase: "commentary",
      });
      await sendCommentaryIfNeeded(
        trackingSendEvent,
        result,
        context,
        aborted,
        abortController.signal,
      );
      sendDoneWithCompletionGuarantee();
      res.end();
      return;
    }
    // ========== END SAFETY GUARD ==========

    // ========== GENERAL_CHAT STREAMING WITH INTENT FRAMING ==========
    // Send intent framing for GENERAL_CHAT (acknowledges the request)
    const chatFramingPayload = buildIntentFramingPayload({ intent: INTENTS.GENERAL_CHAT });
    if (chatFramingPayload) {
      await sendIntentFramingIfNeeded(
        trackingSendEvent,
        chatFramingPayload,
        abortController.signal,
        aborted,
      );
    }

    // Stream the chat response using callback-based approach
    console.log("[SSE] Starting stream from Ollama...");

    // ========== DOCUMENT-AUGMENTED CHAT ==========
    // If documents are attached to this session, inject their text into the prompt
    // so the LLM can reason about them (summarize, analyze, answer questions).
    let augmentedMessage = message;
    if (
      documentContext &&
      documentContext.documents &&
      documentContext.documents.length > 0
    ) {
      const docSections = documentContext.documents
        .filter((d) => d.has_text && d.text)
        .map((d, i) => {
          const truncatedText =
            d.text.length > 8000
              ? d.text.slice(0, 8000) + "\n\n[Document text truncated]"
              : d.text;
          return `--- Document ${i + 1}: "${d.title || d.original_filename}" (${d.mime_type || "unknown type"}) ---\n${truncatedText}`;
        });

      const processingDocs = documentContext.documents.filter(
        (d) => d.text_status === "processing",
      );
      const unreadableDocs = documentContext.documents.filter(
        (d) => d.text_status === "unreadable",
      );

      if (docSections.length > 0) {
        augmentedMessage =
          `The user has attached ${documentContext.totalDocuments} document(s) to this conversation.\n\n` +
          docSections.join("\n\n") +
          (processingDocs.length > 0
            ? `\n\n[Note: ${processingDocs.length} document(s) are still being processed and their text is not yet available.]`
            : "") +
          (unreadableDocs.length > 0
            ? `\n\n[Note: ${unreadableDocs.length} document(s) could not be read.]`
            : "") +
          `\n\nUser question: ${message}`;
      } else if (processingDocs.length > 0) {
        augmentedMessage = `The user attached ${processingDocs.length} document(s), but they are still being processed. Please let the user know their documents are being processed and to try again shortly.\n\nUser question: ${message}`;
      } else if (unreadableDocs.length > 0) {
        augmentedMessage = `The user attached ${unreadableDocs.length} document(s), but they could not be read (extraction failed). Please acknowledge this.\n\nUser question: ${message}`;
      }
      console.log(
        "[SSE] Document-augmented message length:",
        augmentedMessage.length,
      );
    }

    // Send immediate heartbeat to keep connection alive
    res.write(": waiting for LLM\n\n");

    // Send heartbeat every 500ms while waiting for Ollama
    const heartbeatInterval = setInterval(() => {
      if (!aborted) {
        res.write(": heartbeat\n\n");
        console.log("[SSE] Heartbeat sent");
      }
    }, 500);

    let fullContent = "";

    await streamChatWithCallbacks(
      augmentedMessage,
      {
        onChunk: (content) => {
          console.log(
            "[SSE] onChunk called, aborted:",
            aborted,
            "content:",
            content?.slice(0, 10),
          );
          if (aborted) {
            console.log("[SSE] Skipping chunk because aborted");
            return;
          }
          try {
            fullContent += content;
            trackingSendEvent("chunk", { content });
          } catch (err) {
            console.log("[SSE] Error in onChunk:", err.message);
          }
        },
        onDone: async () => {
          if (aborted) return;
          console.log(
            "[SSE] Stream complete, fullContent length:",
            fullContent.length,
          );

          // Generate conversational commentary AFTER streaming
          trackingSendEvent("status", {
            action: "Finalizing…",
            phase: "commentary",
          });

          // Create a result object for commentary generation
          const chatResult = {
            intent: INTENTS.GENERAL_CHAT,
            output: {
              type: "chat",
              message: fullContent,
              timestamp: new Date().toISOString(),
            },
          };

          await sendCommentaryIfNeeded(
            trackingSendEvent,
            chatResult,
            context,
            aborted,
            abortController.signal,
          );

          sendDoneWithCompletionGuarantee();
        },
        onError: (error) => {
          if (aborted) return;
          console.log("[SSE] Stream error:", error);
          trackingSendEvent("error", { error });
        },
        onCancelled: () => {
          console.log("[SSE] Stream cancelled");
          trackingSendEvent("cancelled", {});
        },
      },
      abortController.signal,
    );

    clearInterval(heartbeatInterval);
    }
  } catch (err) {
    if (!aborted) {
      sendErrorEnvelope(err.message || "Unknown error", "STREAM_EXCEPTION");
      sendDoneWithCompletionGuarantee();
    }
  }

  res.end();
});

module.exports = router;
