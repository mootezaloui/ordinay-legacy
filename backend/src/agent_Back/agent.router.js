'use strict';

const express = require('express');
const AgentEngine = require('./agent.engine');
const classifyIntent = require('./intent.classifier');
const { getAvailableCommands, isSlashCommand, parseSlashCommand, detectReadIntent, detectFollowUp } = require('./intent.classifier');
const { INTENTS } = require('./intents');
const { streamChatWithCallbacks, generateIntentFramingMessage, streamIntentFramingMessage } = require('./llm.client');
const { generateAgentCommentary, streamCommentary } = require('./commentary.generator');

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
function getStatusAction(intent, phase = 'processing') {
  const n = (intent || '').toUpperCase();

  // Phase-based status messages
  if (phase === 'classifying') {
    return 'Analyzing your request…';
  }

  if (phase === 'fetching') {
    if (n.includes('CLIENT')) return 'Retrieving client data…';
    if (n.includes('DOSSIER')) return 'Loading dossier records…';
    if (n.includes('LAWSUIT')) return 'Fetching lawsuit details…';
    if (n.includes('TASK')) return 'Reading task information…';
    if (n.includes('SESSION')) return 'Loading session data…';
    if (n.includes('FINANCIAL')) return 'Retrieving financial records…';
    return 'Fetching data…';
  }

  if (phase === 'analyzing') {
    if (n.includes('EXPLAIN')) return 'Analyzing current state…';
    if (n.includes('SUMMARIZE')) return 'Compiling summary…';
    if (n.includes('RISK')) return 'Evaluating operational risks…';
    if (n.includes('DRAFT')) return 'Preparing draft content…';
    if (n.includes('PROPOSE') || n.includes('ACTION')) return 'Identifying possible actions…';
    return 'Processing request…';
  }

  if (phase === 'interpreting') {
    return 'Building interpretation…';
  }

  if (phase === 'commentary') {
    return 'Preparing response…';
  }

  // Default
  return 'Processing…';
}

// ============================================================================
// Intent Framing Helpers — LLM-generated, deterministic inputs only
// ============================================================================

const INTENT_FRAMING_MESSAGE_TYPE = 'AGENT_INTENT_MESSAGE';

const ENTITY_LABELS = Object.freeze({
  client: 'client',
  dossier: 'dossier',
  lawsuit: 'lawsuit',
  session: 'session',
  task: 'task',
  personal_task: 'personal task',
  mission: 'mission',
  financial_entry: 'financial entry',
  notification: 'notification',
  history_event: 'history entry',
});

function hasNonEmptyFilters(filters) {
  if (!filters || typeof filters !== 'object') return false;
  return Object.values(filters).some(
    (value) =>
      value !== null &&
      value !== undefined &&
      value !== '' &&
      value !== false,
  );
}

function formatEntityLabel(entityType) {
  if (!entityType) return null;
  const normalized = String(entityType).toLowerCase();
  return ENTITY_LABELS[normalized] || normalized.replace(/_/g, ' ');
}

function deriveIntentType(intent, contextSnapshot) {
  const source = (intent || contextSnapshot?.lastIntent || '').toUpperCase();
  if (!source) return null;

  if (source.includes('LIST')) return 'list';
  if (source.includes('SUMMARIZE')) return 'summarize';
  if (source.includes('READ') || source.includes('EXPLAIN')) return 'read';

  if (
    source.includes('ANALYZE') ||
    source.includes('RISK') ||
    source.includes('PROPOSE') ||
    source.includes('DRAFT')
  ) {
    return 'summarize';
  }

  // Handle follow-up and command intents - derive from context if available
  if (source === 'FOLLOW_UP' || source === 'COMMAND' || source === 'SAFETY_GUARD') {
    const lastIntent = (contextSnapshot?.lastIntent || '').toUpperCase();
    if (lastIntent.includes('LIST')) return 'list';
    if (lastIntent.includes('SUMMARIZE')) return 'summarize';
    if (lastIntent.includes('READ') || lastIntent.includes('EXPLAIN')) return 'read';
    // Default to 'read' for follow-ups (reviewing specific data)
    return 'read';
  }

  // Fallback: any data retrieval intent gets 'read' type
  // This ensures intent framing is generated for most non-chat intents
  if (source !== 'GENERAL_CHAT') {
    return 'read';
  }

  return null;
}

function deriveEntityLabel(intent, followUpIntent, contextSnapshot, commandInfo) {
  if (followUpIntent?.entityType) {
    return formatEntityLabel(followUpIntent.entityType);
  }

  if (commandInfo?.entityLabel) {
    return commandInfo.entityLabel;
  }

  const normalized = (intent || '').toUpperCase();
  if (normalized.includes('DRAFT_INVITATION')) return 'invitation draft';
  if (normalized.includes('DRAFT_CLIENT_EMAIL')) return 'client email';
  if (normalized.includes('ANALYZE_OPERATIONAL_RISKS')) return 'operational risks';
  if (normalized.includes('PROPOSE_ACTIONS')) return 'next steps';
  if (normalized.includes('CLIENT')) return 'client';
  if (normalized.includes('DOSSIER')) return 'dossier';
  if (normalized.includes('LAWSUIT')) return 'lawsuit';
  if (normalized.includes('SESSION')) return 'session';
  if (normalized.includes('PERSONAL_TASK')) return 'personal task';
  if (normalized.includes('TASK')) return 'task';
  if (normalized.includes('MISSION')) return 'mission';
  if (normalized.includes('FINANCIAL')) return 'financial entry';
  if (normalized.includes('NOTIFICATION')) return 'notification';
  if (normalized.includes('HISTORY')) return 'history entry';

  if (contextSnapshot?.activeEntityType) {
    return formatEntityLabel(contextSnapshot.activeEntityType);
  }
  if (contextSnapshot?.lastEntityType) {
    return formatEntityLabel(contextSnapshot.lastEntityType);
  }

  return null;
}

function deriveScope(intent, readIntent, followUpIntent, contextSnapshot) {
  const source = (intent || contextSnapshot?.lastIntent || '').toUpperCase();
  const hasFilters =
    hasNonEmptyFilters(readIntent?.filters) ||
    hasNonEmptyFilters(followUpIntent?.filters) ||
    hasNonEmptyFilters(contextSnapshot?.lastResultSummary?.filters);

  if (hasFilters) return 'filtered';
  if (source.includes('LIST')) return 'multiple';
  if (source.includes('SUMMARIZE') && readIntent?.aggregateSummary) return 'multiple';
  if (followUpIntent?.entityId) return 'single';
  if (source.includes('READ') || source.includes('EXPLAIN') || source.includes('SUMMARIZE')) return 'single';
  if (source.includes('DRAFT') || source.includes('ANALYZE') || source.includes('PROPOSE')) return 'single';
  return 'multiple';
}

function buildIntentFramingPayload({ intent, readIntent, followUpIntent, contextSnapshot, commandInfo }) {
  if (!intent || intent === INTENTS.GENERAL_CHAT) return null;

  const intentType = deriveIntentType(intent, contextSnapshot);
  const entity = deriveEntityLabel(intent, followUpIntent, contextSnapshot, commandInfo);
  const scope = deriveScope(intent, readIntent, followUpIntent, contextSnapshot);

  if (!intentType || !entity || !scope) return null;
  return { intentType, entity, scope };
}

function normalizeCategoryLabel(category) {
  if (!category) return null;
  const normalized = String(category).toLowerCase();
  if (normalized === 'accounting') return 'financial entry';
  if (normalized === 'personal_tasks') return 'personal task';
  if (normalized === 'history') return 'history entry';
  if (ENTITY_LABELS[normalized]) return ENTITY_LABELS[normalized];
  if (normalized.endsWith('s')) return normalized.slice(0, -1);
  return normalized.replace(/_/g, ' ');
}

function buildIntentFramingFromCommand(parsedCommand) {
  if (!parsedCommand || !parsedCommand.valid || !parsedCommand.toolMapping) return null;
  if (parsedCommand.commandKey === 'help') return null;

  const requiresArg = !!parsedCommand.toolMapping.params?.requiresArg;
  const entityLabel = normalizeCategoryLabel(parsedCommand.toolMapping.category);
  if (!entityLabel) return null;

  return {
    intentType: requiresArg ? 'read' : 'list',
    entity: entityLabel,
    scope: requiresArg ? 'single' : 'multiple',
  };
}

async function sendIntentFramingIfNeeded(sendEvent, payload, signal, aborted) {
  if (aborted) return;

  const signalPayload = payload
    ? {
        type: 'INTENT_FRAMING',
        action: payload.intentType,
        entity: payload.entity,
        scope: payload.scope,
      }
    : null;

  // Use streaming for real-time responsiveness - LLM generates the message
  return new Promise((resolve) => {
    let hasContent = false;
    let fullMessage = '';

    console.log('[Intent Framing] Starting LLM generation with payload:', JSON.stringify(payload));

    streamIntentFramingMessage(payload || {}, {
      onChunk: (chunk) => {
        if (aborted) return;
        if (!hasContent) {
          hasContent = true;
          console.log('[Intent Framing] First chunk received, streaming started');
        }
        fullMessage += chunk;
        sendEvent('intent_framing_chunk', { chunk });
      },
      onDone: (message) => {
        if (aborted) {
          resolve();
          return;
        }

        console.log('[Intent Framing] LLM generation complete, message length:', fullMessage.length);

        // Only send if LLM produced content - no hardcoded fallbacks
        if (fullMessage) {
          sendEvent('intent_framing', {
            message: fullMessage,
            messageType: INTENT_FRAMING_MESSAGE_TYPE,
            signal: signalPayload,
          });
        } else {
          console.log('[Intent Framing] LLM produced no content, skipping intent framing');
        }
        resolve();
      },
      onError: (error) => {
        // Log error but don't send hardcoded fallback - let the artifact speak for itself
        console.warn('[Intent Framing] LLM error, skipping intent framing:', error);
        resolve();
      },
    }, signal);
  });
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
async function sendCommentaryIfNeeded(sendEvent, result, context, aborted, signal) {
  if (aborted) return;

  // Skip commentary for chat outputs (already conversational)
  const artifactType = result?.output?.type;
  if (!artifactType || artifactType === 'chat') return;

  const resultCount = typeof result?.readMeta?.count === 'number' ? result.readMeta.count : undefined;

  // CRITICAL: Include intent for commentary mode derivation
  // The commentary generator uses intent to determine REPORTING vs INTERPRETIVE vs GUIDANCE mode
  const commentaryContext = {
    ...(context || {}),
    intent: result?.intent, // PRIMARY USER INTENT - determines commentary mode
    lastIntent: result?.intent || context?.lastIntent,
    _resultCount: resultCount,
    _readOutcome: resultCount === 0 ? 'empty' : undefined,
    _activeEntityType: result?.contextPromotion?.activeEntity?.type || null,
    _activeEntityId: result?.contextPromotion?.activeEntity?.id || null,
    _pendingSelection: result?.contextPromotion?.pendingSelection || null,
  };

  console.log('[Commentary] Intent for mode derivation:', result?.intent);

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
          sendEvent('commentary_chunk', { chunk });
        },
        onDone: (commentaryResult) => {
          if (aborted) {
            resolve();
            return;
          }

          // Send final commentary message (for clients that don't support streaming)
          const hasSignals =
            Array.isArray(commentaryResult?.signals) && commentaryResult.signals.length > 0;
          if (commentaryResult?.commentary || hasSignals) {
            console.log('[SSE] Sending commentary, source:', commentaryResult.source, 'mode:', commentaryResult.mode);
            sendEvent('commentary', {
              message: commentaryResult.commentary || "",
              source: commentaryResult.source,
              signals: commentaryResult.signals || [],
              mode: commentaryResult.mode, // Include mode for debugging/analytics
            });
          } else {
            console.log('[SSE] No commentary generated, source:', commentaryResult?.source, 'reason:', commentaryResult?.reason, 'mode:', commentaryResult?.mode);
          }
          resolve();
        },
        onError: (err) => {
          console.warn('[SSE] Commentary streaming failed (non-blocking):', err);
          resolve();
        },
      },
      signal
    );
  });
}

/**
 * GET /agent/commands - Get available slash commands for UI autocomplete
 */
router.get('/agent/commands', (req, res) => {
  const commands = getAvailableCommands();
  res.json({
    status: 'ok',
    data: commands,
  });
});

router.post('/agent/run', async (req, res, next) => {
  const { message, context, agentVersion, reasoner, followUpIntent } = req.body || {};
  try {
    const result = await agentEngine.run({ message, context, agentVersion, reasoner, followUpIntent });
    res.json({
      status: 'ok',
      data: result,
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
router.post('/agent/stream', async (req, res) => {
  const { message, context, agentVersion = 'v1', followUpIntent } = req.body || {};

  // Validate message
  if ((!message || typeof message !== 'string' || !message.trim()) && !followUpIntent) {
    res.status(400).json({ error: 'Message is required' });
    return;
  }

  // Set up SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable nginx buffering
  res.flushHeaders();

  // Disable Nagle's algorithm for real-time streaming
  if (res.socket) {
    res.socket.setNoDelay(true);
  }

  // Helper to send SSE events with immediate flush
  const sendEvent = (event, data) => {
    console.log(`[SSE] Sending event: ${event}`, data);
    console.log(`[SSE] Connection writable: ${res.writable}, finished: ${res.writableFinished}, destroyed: ${res.destroyed}`);
    const success = res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    console.log(`[SSE] Write result: ${success}`);
    // Force flush if available (compression middleware)
    if (typeof res.flush === 'function') {
      res.flush();
    }
  };

  // Handle client disconnect - use res.on('close') instead of req.on('close')
  // req.on('close') can fire prematurely in some cases
  let aborted = false;
  const abortController = new AbortController();
  res.on('close', () => {
    console.log('[SSE] Client disconnected (res.close event)');
    aborted = true;
    abortController.abort();
  });

  try {
    // Handle structured follow-up intents first (bypass NLP/LLM entirely)
    if (followUpIntent) {
      sendEvent('start', { intent: followUpIntent.intent, agentVersion, isFollowUpIntent: true });
      const framingPayload = buildIntentFramingPayload({
        intent: followUpIntent.intent,
        followUpIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          sendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: fetching data
      sendEvent('status', { action: getStatusAction(followUpIntent.intent, 'fetching'), phase: 'fetching' });
      const result = await agentEngine.run({
        message,
        context,
        agentVersion,
        reasoner: 'rule',
        followUpIntent,
      });
      // Status: interpreting (brief)
      sendEvent('status', { action: getStatusAction(followUpIntent.intent, 'interpreting'), phase: 'interpreting' });
      sendEvent('result', { output: result.output, intent: result.intent, isFollowUpIntent: true });
      // Generate conversational commentary AFTER artifact (non-blocking)
      sendEvent('status', { action: getStatusAction(followUpIntent.intent, 'commentary'), phase: 'commentary' });
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }

    // Handle slash commands first - bypass LLM entirely
    if (isSlashCommand(message)) {
      sendEvent('start', { intent: 'COMMAND', agentVersion, isCommand: true });
      const parsedCommand = parseSlashCommand(message);
      const framingPayload = buildIntentFramingFromCommand(parsedCommand);
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          sendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: executing command
      sendEvent('status', { action: 'Executing command…', phase: 'executing' });
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: 'COMMAND', isCommand: true });
      // Generate conversational commentary AFTER artifact (non-blocking)
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }

    // ========== FOLLOW-UP INTENT GATE ==========
    // CRITICAL: Must run BEFORE intent classification to prevent fallthrough to generic chat
    // If a follow-up is detected, route through agentEngine.run() which has proper handling
    const followUpDetection = detectFollowUp(message, context || {});
    if (followUpDetection && followUpDetection.isFollowUp) {
      console.log('[SSE] Follow-up detected:', followUpDetection.type, 'confidence:', followUpDetection.confidence);
      const contextSnapshot = agentEngine.contextStore.get(context || {});
      sendEvent('start', { intent: 'FOLLOW_UP', agentVersion, isFollowUp: true, followUpType: followUpDetection.type });
      // Use 'FOLLOW_UP' as intent fallback when lastIntent is not available
      const framingPayload = buildIntentFramingPayload({
        intent: contextSnapshot?.lastIntent || 'FOLLOW_UP',
        contextSnapshot,
      });
      // Always send intent framing for follow-ups to maintain conversational flow
      await sendIntentFramingIfNeeded(
        sendEvent,
        framingPayload,
        abortController.signal,
        aborted,
      );
      // Status: processing follow-up
      sendEvent('status', { action: 'Processing follow-up…', phase: 'fetching' });
      // Route through agentEngine.run() which has the follow-up resolution logic
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('status', { action: getStatusAction(result.intent, 'interpreting'), phase: 'interpreting' });
      sendEvent('result', { output: result.output, intent: result.intent, isFollowUp: true });
      // Generate conversational commentary AFTER artifact (non-blocking)
      sendEvent('status', { action: getStatusAction(result.intent, 'commentary'), phase: 'commentary' });
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }
    // ========== END FOLLOW-UP INTENT GATE ==========

    // READ INTENT GATE - check for data requests BEFORE LLM classification
    const readIntent = detectReadIntent(message, context || {});
    if (readIntent && readIntent.requiresLocalData) {
      sendEvent('start', { intent: readIntent.intent, agentVersion, isReadIntent: true });
      const framingPayload = buildIntentFramingPayload({
        intent: readIntent.intent,
        readIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          sendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: fetching data
      sendEvent('status', { action: getStatusAction(readIntent.intent, 'fetching'), phase: 'fetching' });
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      // Status: interpreting
      sendEvent('status', { action: getStatusAction(readIntent.intent, 'interpreting'), phase: 'interpreting' });
      sendEvent('result', { output: result.output, intent: result.intent, isReadIntent: true });
      // Generate conversational commentary AFTER artifact (non-blocking)
      sendEvent('status', { action: getStatusAction(readIntent.intent, 'commentary'), phase: 'commentary' });
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }

    // Status: classifying (before LLM intent classification)
    sendEvent('status', { action: getStatusAction(null, 'classifying'), phase: 'classifying' });

    // Classify intent for non-command, non-data messages
    const intent = await classifyIntent(message, context || {});

    // Send start event with intent
    sendEvent('start', { intent, agentVersion });

    // Only stream for GENERAL_CHAT intent
    if (intent !== INTENTS.GENERAL_CHAT) {
      const framingPayload = buildIntentFramingPayload({ intent });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          sendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: processing non-chat intent
      sendEvent('status', { action: getStatusAction(intent, 'analyzing'), phase: 'analyzing' });
      // For non-chat intents, fall back to regular processing
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: result.intent });
      // Generate conversational commentary AFTER artifact (non-blocking)
      sendEvent('status', { action: getStatusAction(intent, 'commentary'), phase: 'commentary' });
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }

    // ========== FINAL SAFETY GUARD ==========
    // CRITICAL: If we reach here with a message that looks like a data request,
    // it means the READ intent gate missed it. Route through agentEngine instead.
    // This prevents LLM from asking "Could you provide more context?" after retrieving data.
    const looksLikeDataRequest = /\b(client|clients|dossier|dossiers|task|tasks|session|sessions)\b/i.test(message);
    if (looksLikeDataRequest) {
      console.log('[SSE] Safety guard triggered: message contains entity keywords but reached LLM path');
      sendEvent('start', { intent: 'SAFETY_GUARD', agentVersion, isSafetyGuard: true });
      const safetyReadIntent = detectReadIntent(message, context || {});
      const framingPayload = buildIntentFramingPayload({
        intent: safetyReadIntent?.intent,
        readIntent: safetyReadIntent,
      });
      if (framingPayload) {
        await sendIntentFramingIfNeeded(
          sendEvent,
          framingPayload,
          abortController.signal,
          aborted,
        );
      }
      // Status: safety guard triggered, fetching
      sendEvent('status', { action: 'Retrieving data…', phase: 'fetching' });
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('status', { action: 'Building interpretation…', phase: 'interpreting' });
      sendEvent('result', { output: result.output, intent: result.intent, isSafetyGuard: true });
      // Generate conversational commentary AFTER artifact (non-blocking)
      sendEvent('status', { action: 'Preparing response…', phase: 'commentary' });
      await sendCommentaryIfNeeded(sendEvent, result, context, aborted, abortController.signal);
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }
    // ========== END SAFETY GUARD ==========

    // Stream the chat response using callback-based approach
    console.log('[SSE] Starting stream from Ollama...');

    // Send immediate heartbeat to keep connection alive
    res.write(': waiting for LLM\n\n');

    // Send heartbeat every 500ms while waiting for Ollama
    const heartbeatInterval = setInterval(() => {
      if (!aborted) {
        res.write(': heartbeat\n\n');
        console.log('[SSE] Heartbeat sent');
      }
    }, 500);

    let fullContent = '';

    await streamChatWithCallbacks(
      message,
      {
        onChunk: (content) => {
          console.log('[SSE] onChunk called, aborted:', aborted, 'content:', content?.slice(0, 10));
          if (aborted) {
            console.log('[SSE] Skipping chunk because aborted');
            return;
          }
          try {
            fullContent += content;
            sendEvent('chunk', { content });
          } catch (err) {
            console.log('[SSE] Error in onChunk:', err.message);
          }
        },
        onDone: () => {
          if (aborted) return;
          console.log('[SSE] Stream complete, fullContent length:', fullContent.length);
          sendEvent('done', {
            timestamp: new Date().toISOString(),
            fullContent
          });
        },
        onError: (error) => {
          if (aborted) return;
          console.log('[SSE] Stream error:', error);
          sendEvent('error', { error });
        },
        onCancelled: () => {
          console.log('[SSE] Stream cancelled');
          sendEvent('cancelled', {});
        }
      },
      abortController.signal
    );

    clearInterval(heartbeatInterval);
  } catch (err) {
    if (!aborted) {
      sendEvent('error', { error: err.message || 'Unknown error' });
    }
  }

  res.end();
});

module.exports = router;
