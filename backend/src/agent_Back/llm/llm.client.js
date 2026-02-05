"use strict";

const { INTENT_LIST } = require("../intents");
const {
  INTENT_CLASSIFICATION_PROMPT,
  CHAT_SYSTEM_PROMPT,
  INTENT_FRAMING_PROMPT,
  DOCUMENT_RELEVANCE_PROMPT,
  DOCUMENT_SUMMARY_PROMPT,
} = require("./llm.prompts");
const { parseJsonResponse } = require("./llm.validation");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || "45000", 10);
const INTENT_FRAMING_TIMEOUT = parseInt(
  process.env.LLM_INTENT_FRAMING_TIMEOUT || "30000",
  10,
);
const DOCUMENT_SUMMARY_MAX_CHARS = parseInt(
  process.env.DOCUMENT_SUMMARY_MAX_CHARS || "12000",
  10,
);

async function classifyIntentWithLLM(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: INTENT_CLASSIFICATION_PROMPT + message,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 50,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rawResponse = (data.response || "").trim();
    console.log("[LLM RAW RESPONSE]", rawResponse); // Log the raw LLM response for debugging
    const result = rawResponse.toUpperCase();

    // Validate the response is a known intent
    if (INTENT_LIST.includes(result)) {
      return result;
    }

    // If not valid, log a warning for debugging
    console.warn("[LLM INVALID INTENT]", rawResponse);
    return null;
  } catch (err) {
    clearTimeout(timeoutId);
    // LLM unavailable or timeout - return null to trigger fallback
    return null;
  }
}

async function isLLMAvailable() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${LLM_BASE_URL}/api/tags`, {
      method: "GET",
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    return response.ok;
  } catch {
    return false;
  }
}

async function selectRelevantDocuments({ question, entityType, entityId, documents }) {
  if (!question || !Array.isArray(documents)) {
    return null;
  }

  const docPayload = documents.map((doc) => ({
    document_id: doc.document_id,
    title: doc.title || null,
    category: doc.category || null,
    notes: doc.notes || null,
    preview: doc.document_preview || null,
  }));

  const prompt = `${DOCUMENT_RELEVANCE_PROMPT}
Entity type: ${entityType || "unknown"}
Entity id: ${entityId || "unknown"}
User question: ${question}
Documents:
${JSON.stringify(docPayload, null, 2)}

JSON:`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 200,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const rawResponse = (data.response || "").trim();
    const parsed = parseJsonResponse(rawResponse);
    if (!parsed || !Array.isArray(parsed.selected)) {
      return null;
    }

    return {
      selected: parsed.selected.filter(
        (item) =>
          item &&
          Number.isInteger(item.document_id) &&
          item.document_id > 0,
      ),
    };
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function summarizeDocumentText({ title, text, question }) {
  if (!text || typeof text !== "string") return null;

  const trimmedText = text.trim();
  if (!trimmedText) return null;

  const truncated =
    trimmedText.length > DOCUMENT_SUMMARY_MAX_CHARS
      ? trimmedText.slice(0, DOCUMENT_SUMMARY_MAX_CHARS)
      : trimmedText;

  const prompt = DOCUMENT_SUMMARY_PROMPT
    .replace("{{title}}", title || "Document")
    .replace("{{question}}", question ? String(question).trim() : "None")
    .replace(
      "{{text}}",
      truncated +
        (trimmedText.length > truncated.length
          ? "\n\n[Document text truncated]"
          : ""),
    );

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.2,
          num_predict: 400,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const summary = (data.response || "").trim();
    return summary.length > 0 ? summary : null;
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function generateChatResponse(message) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`,
        stream: false,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    return (data.response || "").trim();
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

function buildIntentFramingPrompt(intentType, entity, scope) {
  return INTENT_FRAMING_PROMPT
    .replace("{{intentType}}", intentType)
    .replace("{{entity}}", entity)
    .replace("{{scope}}", scope);
}

async function requestIntentFraming(prompt, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), INTENT_FRAMING_TIMEOUT);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: false,
        options: {
          temperature: 0.4,
          num_predict: 80,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const message = (data.response || "").trim();
    return message.length > 0 ? message : null;
  } catch (err) {
    clearTimeout(timeoutId);
    return null;
  }
}

async function generateIntentFramingMessage({ intentType, entity, scope }, signal) {
  if (!intentType || !entity || !scope) return null;

  const basePrompt = buildIntentFramingPrompt(intentType, entity, scope);
  const first = await requestIntentFraming(basePrompt, signal);
  if (first) return first;

  const retryPrompt = `${basePrompt}\n\nReturn exactly one short sentence.`;
  return await requestIntentFraming(retryPrompt, signal);
}

/**
 * Stream intent framing message with callbacks
 * Provides real-time streaming for immediate responsiveness
 *
 * @param {Object} payload - { intentType, entity, scope }
 * @param {Object} callbacks - { onChunk, onDone, onError }
 * @param {AbortSignal} signal - Optional abort signal
 */
async function streamIntentFramingMessage({ intentType, entity, scope }, callbacks, signal) {
  console.log('[Intent Framing LLM] Called with:', { intentType, entity, scope });

  if (!intentType || !entity || !scope) {
    console.log('[Intent Framing LLM] Missing required params, skipping');
    callbacks.onDone?.('');
    return;
  }

  const prompt = buildIntentFramingPrompt(intentType, entity, scope);
  console.log('[Intent Framing LLM] Starting stream request to:', `${LLM_BASE_URL}/api/generate`);

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log('[Intent Framing LLM] Timeout after', INTENT_FRAMING_TIMEOUT, 'ms');
    abortController.abort();
  }, INTENT_FRAMING_TIMEOUT);

  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener('abort', () => abortController.abort(), { once: true });
    }
  }

  let fullContent = '';

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.4,
          num_predict: 80,
        },
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);
    console.log('[Intent Framing LLM] Response status:', response.status);

    if (!response.ok) {
      console.error('[Intent Framing LLM] Request failed:', response.status);
      callbacks.onError?.(`LLM request failed: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split('\n').filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            fullContent += data.response;
            callbacks.onChunk?.(data.response);
          }
          if (data.done) {
            console.log('[Intent Framing LLM] Stream complete, total length:', fullContent.length);
            callbacks.onDone?.(fullContent);
            return;
          }
        } catch {
          // Skip malformed JSON
        }
      }
    }

    console.log('[Intent Framing LLM] Reader finished, total length:', fullContent.length);
    callbacks.onDone?.(fullContent);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error('[Intent Framing LLM] Error:', err.name, err.message);
    if (err.name === 'AbortError') {
      console.log('[Intent Framing LLM] Aborted, returning partial content:', fullContent.length);
      callbacks.onDone?.(fullContent);
    } else {
      callbacks.onError?.(err.message);
    }
  }
}

/**
 * Stream chat response from Ollama
 * Yields chunks as they arrive from the LLM
 * @param {string} message - User message
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @yields {Object} - { type: 'chunk', content: string } or { type: 'done' } or { type: 'error', error: string }
 */
async function* streamChatResponse(message, signal) {
  console.log(
    "[LLM STREAM] Starting stream request to:",
    `${LLM_BASE_URL}/api/generate`,
  );

  // Create a combined abort controller for timeout and caller cancellation
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(
      "[LLM STREAM] Request timeout after",
      LLM_TIMEOUT,
      "ms, aborting...",
    );
    abortController.abort();
  }, LLM_TIMEOUT * 2); // Double timeout for streaming (model loading can be slow)

  // Forward caller's abort signal
  if (signal) {
    signal.addEventListener("abort", () => abortController.abort());
  }

  try {
    console.log("[LLM STREAM] Sending fetch request...");
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      }),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);

    console.log(
      "[LLM STREAM] Response status:",
      response.status,
      response.ok ? "OK" : "FAILED",
    );
    if (!response.ok) {
      yield { type: "error", error: `LLM request failed: ${response.status}` };
      return;
    }

    const reader = response.body.getReader();
    console.log("[LLM STREAM] Got reader, starting to read chunks...");
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value, { stream: true });
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield { type: "chunk", content: data.response };
          }
          if (data.done) {
            yield { type: "done" };
            return;
          }
        } catch {
          // Skip malformed JSON lines
        }
      }
    }

    yield { type: "done" };
  } catch (err) {
    clearTimeout(timeoutId);
    console.log("[LLM STREAM] Error:", err.name, err.message);
    if (err.name === "AbortError") {
      yield { type: "cancelled" };
    } else {
      yield { type: "error", error: err.message || "Unknown streaming error" };
    }
  }
}

/**
 * Stream chat response from Ollama using callbacks
 * This version uses callbacks instead of async generator for better Express compatibility
 * @param {string} message - User message
 * @param {Object} callbacks - { onChunk, onDone, onError }
 * @param {AbortSignal} signal - Optional abort signal for cancellation
 * @returns {Promise<void>}
 */
async function streamChatWithCallbacks(message, callbacks, signal) {
  console.log(
    "[LLM STREAM CB] Starting stream request to:",
    `${LLM_BASE_URL}/api/generate`,
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log("[LLM STREAM CB] Request timeout, aborting...");
    abortController.abort();
  }, LLM_TIMEOUT * 2);

  if (signal) {
    signal.addEventListener("abort", () => abortController.abort());
  }

  try {
    console.log("[LLM STREAM CB] Sending fetch request...");
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.7,
          num_predict: 500,
        },
      }),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);

    console.log("[LLM STREAM CB] Response status:", response.status);
    if (!response.ok) {
      callbacks.onError?.(`LLM request failed: ${response.status}`);
      return;
    }

    const reader = response.body.getReader();
    console.log("[LLM STREAM CB] Got reader, starting to read...");
    const decoder = new TextDecoder();

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        console.log("[LLM STREAM CB] Reader done");
        break;
      }

      const chunk = decoder.decode(value, { stream: true });
      console.log("[LLM STREAM CB] Received chunk:", chunk.slice(0, 50));
      const lines = chunk.split("\n").filter((line) => line.trim());

      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          console.log(
            "[LLM STREAM CB] Parsed data, response:",
            data.response ? `"${data.response}"` : "(empty)",
            "done:",
            data.done,
          );
          if (data.response) {
            console.log("[LLM STREAM CB] Calling onChunk with:", data.response);
            callbacks.onChunk?.(data.response);
          }
          if (data.done) {
            console.log("[LLM STREAM CB] Ollama done signal received");
            callbacks.onDone?.();
            return;
          }
        } catch (parseErr) {
          console.log(
            "[LLM STREAM CB] JSON parse error:",
            parseErr.message,
            "line:",
            line.slice(0, 50),
          );
        }
      }
    }

    callbacks.onDone?.();
  } catch (err) {
    clearTimeout(timeoutId);
    console.log("[LLM STREAM CB] Error:", err.name, err.message);
    console.log("[LLM STREAM CB] Error details:", {
      name: err.name,
      message: err.message,
      cause: err.cause,
      stack: err.stack?.split("\n").slice(0, 3).join("\n"),
    });
    if (err.name === "AbortError") {
      callbacks.onCancelled?.();
    } else {
      callbacks.onError?.(err.message || "Unknown streaming error");
    }
  }
}

module.exports = {
  classifyIntentWithLLM,
  generateChatResponse,
  streamChatResponse,
  streamChatWithCallbacks,
  isLLMAvailable,
  LLM_BASE_URL,
  LLM_MODEL,
  CHAT_SYSTEM_PROMPT,
  generateIntentFramingMessage,
  streamIntentFramingMessage,
  selectRelevantDocuments,
  summarizeDocumentText,
};
