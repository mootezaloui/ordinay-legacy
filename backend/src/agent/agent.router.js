'use strict';

const express = require('express');
const AgentEngine = require('./agent.engine');
const classifyIntent = require('./intent.classifier');
const { getAvailableCommands, isSlashCommand, detectReadIntent, detectFollowUp } = require('./intent.classifier');
const { INTENTS } = require('./intents');
const { streamChatWithCallbacks } = require('./llm.client');

const router = express.Router();
const agentEngine = new AgentEngine();

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
  const { message, context, agentVersion, reasoner } = req.body || {};
  try {
    const result = await agentEngine.run({ message, context, agentVersion, reasoner });
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
  const { message, context, agentVersion = 'v1' } = req.body || {};

  // Validate message
  if (!message || typeof message !== 'string' || !message.trim()) {
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
    // Handle slash commands first - bypass LLM entirely
    if (isSlashCommand(message)) {
      sendEvent('start', { intent: 'COMMAND', agentVersion, isCommand: true });
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: 'COMMAND', isCommand: true });
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
      sendEvent('start', { intent: 'FOLLOW_UP', agentVersion, isFollowUp: true, followUpType: followUpDetection.type });
      // Route through agentEngine.run() which has the follow-up resolution logic
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: result.intent, isFollowUp: true });
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }
    // ========== END FOLLOW-UP INTENT GATE ==========

    // READ INTENT GATE - check for data requests BEFORE LLM classification
    const readIntent = detectReadIntent(message, context || {});
    if (readIntent && readIntent.requiresLocalData) {
      sendEvent('start', { intent: readIntent.intent, agentVersion, isReadIntent: true });
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: result.intent, isReadIntent: true });
      sendEvent('done', { timestamp: new Date().toISOString() });
      res.end();
      return;
    }

    // Classify intent for non-command, non-data messages
    const intent = await classifyIntent(message, context || {});

    // Send start event with intent
    sendEvent('start', { intent, agentVersion });

    // Only stream for GENERAL_CHAT intent
    if (intent !== INTENTS.GENERAL_CHAT) {
      // For non-chat intents, fall back to regular processing
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: result.intent });
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
      const result = await agentEngine.run({ message, context, agentVersion, reasoner: 'rule' });
      sendEvent('result', { output: result.output, intent: result.intent, isSafetyGuard: true });
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
