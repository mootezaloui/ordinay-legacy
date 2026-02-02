"use strict";

const { INTENT_LIST } = require("./intents");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "qwen2.5:7b-instruct";
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || "30000", 10);

const INTENT_CLASSIFICATION_PROMPT = `You are an intent classifier for a legal practice management system called Organia.
Your task is to classify user messages into exactly ONE of these intents:

- GENERAL_CHAT: User is greeting, asking general questions, or having casual conversation
- EXPLAIN_ENTITY_STATE: User wants explanation of a client, dossier, task, lawsuit, session, or other entity
- SUMMARIZE_SESSION: User wants a summary or recap of a session, meeting, or hearing
- ANALYZE_OPERATIONAL_RISKS: User wants risk analysis, risk assessment, or mitigation advice
- DRAFT_INVITATION: User wants to draft an invitation letter or RSVP
- DRAFT_CLIENT_EMAIL: User wants to draft an email to a client
- PROPOSE_ACTIONS: User wants suggested next steps, action plans, or recommendations

Rules:
1. Respond with ONLY the intent name, and nothing else. No punctuation, no explanation, no extra words, no code block, no quotes.
2. If the message doesn't clearly match a specific task intent, respond with: GENERAL_CHAT
3. Do not explain your reasoning. Do not add any other text.

User message: `;

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

const CHAT_SYSTEM_PROMPT = `You are Organia Assistant, a helpful AI for a legal practice management system.
You help lawyers and legal professionals with their daily work.
Be concise, professional, and helpful. Keep responses brief unless asked for detail.`;

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
};
