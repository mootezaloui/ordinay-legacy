"use strict";

const { INTENT_LIST } = require("../intents");
const {
  INTENT_CLASSIFICATION_PROMPT,
  CHAT_SYSTEM_PROMPT,
  DOCUMENT_RELEVANCE_PROMPT,
  DOCUMENT_SUMMARY_PROMPT,
  UNGOVERNED_MODE_DECISION_PROMPT,
  WEB_SEARCH_SUMMARY_PROMPT,
} = require("./llm.prompts");
const { parseJsonResponse } = require("./llm.validation");

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const OPENAI_API_KEY =
  process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL ||
  process.env.LLM_OPENAI_BASE_URL ||
  "https://api.openai.com";
const LLM_TIMEOUT = parseInt(process.env.LLM_TIMEOUT || "45000", 10);
const OLLAMA_STREAMING = process.env.OLLAMA_STREAMING !== "false";
const INTENT_FRAMING_TIMEOUT = parseInt(
  process.env.LLM_INTENT_FRAMING_TIMEOUT || "30000",
  10,
);
const DOCUMENT_SUMMARY_MAX_CHARS = parseInt(
  process.env.DOCUMENT_SUMMARY_MAX_CHARS || "12000",
  10,
);
const WEB_SEARCH_SUMMARY_TIMEOUT = parseInt(
  process.env.LLM_WEB_SEARCH_SUMMARY_TIMEOUT || "15000",
  10,
);
const WEB_SEARCH_STREAM_TIMEOUT = Math.max(
  parseInt(process.env.LLM_WEB_SEARCH_STREAM_TIMEOUT || "30000", 10),
  30000,
);
const WEB_SEARCH_SUMMARY_MAX_ITEMS = 5;
const WEB_SEARCH_SUMMARY_MAX_TEXT = 400;
const WEB_SEARCH_SUMMARY_MAX_RETRIES = 1;

function normalizeBase(url) {
  return String(url || "").replace(/\/+$/, "");
}

function normalizeOpenAiBase(url) {
  const base = normalizeBase(url);
  return base.endsWith("/v1") ? base : `${base}/v1`;
}

async function classifyIntentWithLLM(
  message,
  { customPrompt, validationList } = {},
) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  const prompt = customPrompt || INTENT_CLASSIFICATION_PROMPT + message;
  const allowedValues = validationList || INTENT_LIST;

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

    // Validate the response against allowed values
    if (allowedValues.includes(result)) {
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

async function selectRelevantDocuments({
  question,
  entityType,
  entityId,
  documents,
}) {
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
          temperature: 0.2,
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
          item && Number.isInteger(item.document_id) && item.document_id > 0,
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

  const prompt = DOCUMENT_SUMMARY_PROMPT.replace(
    "{{title}}",
    title || "Document",
  )
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

function buildChatHistoryBlock(historyContext) {
  if (!historyContext || typeof historyContext !== "object") return "";
  const lines = [];

  if (historyContext.compactionSummary) {
    lines.push(`Conversation summary: ${historyContext.compactionSummary}`);
  }

  const turns = Array.isArray(historyContext.recentTurns)
    ? historyContext.recentTurns
    : [];
  for (const turn of turns) {
    if (turn?.userMessage) {
      lines.push(`User: ${turn.userMessage}`);
    }
    const assistantMessage =
      turn?.agentOutput?.message || turn?.agentOutput?.summary || null;
    if (assistantMessage) {
      lines.push(`Assistant: ${assistantMessage}`);
    }
  }

  return lines.length > 0 ? lines.join("\n") : "";
}

function buildChatPrompt(message, historyContext) {
  const historyBlock = buildChatHistoryBlock(historyContext);
  if (historyBlock) {
    return `${CHAT_SYSTEM_PROMPT}\n\n${historyBlock}\n\nUser: ${message}\n\nAssistant:`;
  }
  return `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`;
}

async function generateChatResponse(message, historyContext = null) {
  console.log(
    "[LLM][ChatCompletion] Invoked",
    JSON.stringify({ preview: String(message || "").slice(0, 80) }),
  );
  console.debug(
    "[LLM][ChatCompletion] Prompt context",
    JSON.stringify({
      recentTurns: Array.isArray(historyContext?.recentTurns)
        ? historyContext.recentTurns.length
        : 0,
      hasCompactionSummary: Boolean(historyContext?.compactionSummary),
    }),
  );
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), LLM_TIMEOUT);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: buildChatPrompt(message, historyContext),
        stream: false,
        options: {
          temperature: 0.2,
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

async function generateToolCallingTurn({
  messages = [],
  tools = [],
  model = LLM_MODEL,
  signal,
  temperature = 0.1,
  maxTokens = 800,
} = {}) {
  const openAiUrl = `${normalizeOpenAiBase(OPENAI_BASE_URL)}/chat/completions`;
  const requestBody = {
    model,
    messages: Array.isArray(messages) ? messages : [],
    tools: Array.isArray(tools) ? tools : [],
    tool_choice: "auto",
    temperature,
    max_tokens: maxTokens,
    stream: false,
  };
  try {
    const response = await fetch(openAiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(OPENAI_API_KEY ? { Authorization: `Bearer ${OPENAI_API_KEY}` } : {}),
      },
      body: JSON.stringify(requestBody),
      signal,
    });

    if (response.ok) {
      const payload = await response.json();
      const assistant = payload?.choices?.[0]?.message || {};
      return {
        role: assistant.role || "assistant",
        content: typeof assistant.content === "string" ? assistant.content : "",
        tool_calls: Array.isArray(assistant.tool_calls)
          ? assistant.tool_calls
          : [],
      };
    }
  } catch {
    // Fallback to local chat model.
  }

  // Fallback 1: Ollama OpenAI-compatible endpoint (often more stable for tool calls)
  try {
    const response = await fetch(
      `${normalizeBase(LLM_BASE_URL)}/v1/chat/completions`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
        signal,
      },
    );
    if (response.ok) {
      const payload = await response.json();
      const assistant = payload?.choices?.[0]?.message || {};
      return {
        role: assistant.role || "assistant",
        content: typeof assistant.content === "string" ? assistant.content : "",
        tool_calls: Array.isArray(assistant.tool_calls)
          ? assistant.tool_calls
          : [],
      };
    }
  } catch {
    // Continue to /api/chat fallback
  }

  const ollamaResponse = await fetch(`${normalizeBase(LLM_BASE_URL)}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      messages: Array.isArray(messages) ? messages : [],
      tools: Array.isArray(tools) ? tools : [],
      stream: false,
      options: {
        temperature,
        num_predict: maxTokens,
      },
    }),
    signal,
  });

  if (!ollamaResponse.ok) {
    let errorBody = "";
    try {
      errorBody = await ollamaResponse.text();
    } catch {
      errorBody = "";
    }
    console.warn(
      "[LLM][ToolCalling] /api/chat failed, returning safe fallback",
      JSON.stringify({
        status: ollamaResponse.status,
        detail: String(errorBody || "").slice(0, 240),
      }),
    );
    return {
      role: "assistant",
      content:
        "I cannot access operational tools right now. Please try again in a moment.",
      tool_calls: [],
    };
  }

  const payload = await ollamaResponse.json();
  const message = payload?.message || {};
  const toolCalls = Array.isArray(message?.tool_calls)
    ? message.tool_calls.map((call, index) => {
        const fn = call?.function || {};
        const args = fn.arguments;
        return {
          id: call?.id || `tool_${Date.now()}_${index}`,
          type: "function",
          function: {
            name: fn.name,
            arguments:
              typeof args === "string" ? args : JSON.stringify(args || {}),
          },
        };
      })
    : [];

  return {
    role: "assistant",
    content: typeof message?.content === "string" ? message.content : "",
    tool_calls: toolCalls,
  };
}

function buildMissingEntityQuestion(missingEntities = []) {
  const normalized = Array.from(
    new Set(
      (Array.isArray(missingEntities) ? missingEntities : [])
        .map((entity) =>
          String(entity || "")
            .toLowerCase()
            .trim(),
        )
        .filter(Boolean),
    ),
  );
  const hasClient = normalized.includes("client");
  const hasDossier = normalized.includes("dossier");
  const hasSession = normalized.includes("session");

  if (!hasClient && !hasDossier && !hasSession) return null;
  if (hasSession && hasDossier && !hasClient) {
    return "Which session or dossier does this pertain to?";
  }
  if (hasClient && hasDossier && hasSession) {
    return "Please specify the client, session, or dossier.";
  }
  if (hasClient && hasDossier) {
    return "Which client or dossier does this pertain to?";
  }
  if (hasClient && hasSession) {
    return "Which client or session does this pertain to?";
  }
  if (hasClient) return "Which client should this be for?";
  if (hasSession) return "Which session does this pertain to?";
  return "Which dossier does this pertain to?";
}

function buildIntentFramingPrompt(
  intentType,
  userMessage,
  missingEntities = [],
) {
  const normalizedIntent = String(intentType || "UNCERTAIN").toUpperCase();
  const message = String(userMessage || "").trim() || "(empty user request)";
  const missingQuestion = buildMissingEntityQuestion(missingEntities);
  const missingInstruction = missingQuestion
    ? `A required entity is missing. End with this exact question: "${missingQuestion}".`
    : "No entities are missing. Do not ask a clarification question.";

  const baseRules = `You are Ordinay Assistant.
Generate only an intent-framing response for the request below.

User request:
"${message}"

Rules:
- Output 1-3 short professional sentences.
- Keep wording minimal and action-focused.
- Mirror the user's action verb when possible (for example: write, draft, search, summarize, review).
- Do not rewrite the meaning of the user's request.
- No coaching, no motivation, no workflow explanations, no generic advice.
- No tool/internal process references.
- No hallucinated details.
- ${missingInstruction}`;

  switch (normalizedIntent) {
    case "DRAFT":
      return `${baseRules}

Intent category: DRAFT
Start with a direct draft action, such as:
- "Understood. I will draft ..."
- "Understood. I will prepare ..."
If needed, include one minimal clarification question as instructed above.

Return only the final message.`;
    case "READ":
      return `${baseRules}

Intent category: READ
Start with a direct read/review action, such as:
- "Understood. I will review ..."
- "Understood. I will retrieve ..."
If needed, include one minimal clarification question as instructed above.

Return only the final message.`;
    case "SEARCH":
      return `${baseRules}

Intent category: SEARCH
Start with a direct search action, such as:
- "Understood. I will search the web ..."
- "Understood. I will gather search results ..."
If needed, include one minimal clarification question as instructed above.

Return only the final message.`;
    case "REVIEW":
      return `${baseRules}

Intent category: REVIEW
Start with a direct review action:
- "Understood. I will review and analyze ..."
If needed, include one minimal clarification question as instructed above.

Return only the final message.`;
    case "PRIORITIZE":
      return `${baseRules}

Intent category: PRIORITIZE
Start with a direct prioritization action:
- "Understood. I will suggest a prioritization ..."
If needed, include one minimal clarification question as instructed above.

Return only the final message.`;
    default:
      return `${baseRules}

Intent category: UNCERTAIN
The intent is ambiguous between READ and DRAFT.
Return exactly this single question:
"Are you asking me to review or to draft a document?"`;
  }
}

async function consumeOllamaJsonlStream(response, handlers) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = "";

  const processLine = (line) => {
    const trimmed = line.trim();
    if (!trimmed) return false;
    try {
      const data = JSON.parse(trimmed);
      if (data.response) {
        handlers.onToken?.(data.response);
      }
      if (data.done) {
        handlers.onDone?.(data);
        return true;
      }
    } catch {
      // Skip malformed json line chunks
    }
    return false;
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split("\n");
    pending = lines.pop() || "";
    for (const line of lines) {
      if (processLine(line)) return;
    }
  }

  if (pending && processLine(pending)) return;
  handlers.onDone?.({ done: true });
}

async function requestIntentFraming(prompt, signal) {
  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    INTENT_FRAMING_TIMEOUT,
  );

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), {
        once: true,
      });
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
          temperature: 0.2,
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

async function generateIntentFramingMessage(
  { intentType, userMessage, missingEntities = [] },
  signal,
) {
  if (!intentType || !String(userMessage || "").trim()) return null;

  const basePrompt = buildIntentFramingPrompt(
    intentType,
    userMessage,
    missingEntities,
  );
  const first = await requestIntentFraming(basePrompt, signal);
  if (first) return first;

  const retryPrompt = `${basePrompt}\n\nReturn exactly one short, minimal message.`;
  return await requestIntentFraming(retryPrompt, signal);
}

/**
 * Stream intent framing message with callbacks
 * Provides real-time streaming for immediate responsiveness
 *
 * @param {Object} payload - { intentType, userMessage, missingEntities }
 * @param {Object} callbacks - { onChunk, onDone, onError }
 * @param {AbortSignal} signal - Optional abort signal
 */
async function streamIntentFramingMessage(
  { intentType, userMessage, missingEntities = [] },
  callbacks,
  signal,
) {
  console.log("[Intent Framing LLM] Called with:", {
    intentType,
    hasUserMessage: Boolean(String(userMessage || "").trim()),
    missingEntities,
  });

  if (!intentType || !String(userMessage || "").trim()) {
    console.log("[Intent Framing LLM] Missing required params, skipping");
    callbacks.onDone?.("");
    return;
  }

  if (!OLLAMA_STREAMING) {
    const message = await generateIntentFramingMessage(
      { intentType, userMessage, missingEntities },
      signal,
    );
    callbacks.onDone?.(message || "");
    return;
  }

  const prompt = buildIntentFramingPrompt(
    intentType,
    userMessage,
    missingEntities,
  );
  console.log(
    "[Intent Framing LLM] Starting stream request to:",
    `${LLM_BASE_URL}/api/generate`,
  );

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.log(
      "[Intent Framing LLM] Timeout after",
      INTENT_FRAMING_TIMEOUT,
      "ms",
    );
    abortController.abort();
  }, INTENT_FRAMING_TIMEOUT);

  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    }
  }

  let fullContent = "";
  let emittedChunks = 0;

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.2,
          num_predict: 80,
        },
      }),
      signal: abortController.signal,
    });

    clearTimeout(timeoutId);
    console.log("[Intent Framing LLM] Response status:", response.status);

    if (!response.ok) {
      console.error("[Intent Framing LLM] Request failed:", response.status);
      callbacks.onError?.(`LLM request failed: ${response.status}`);
      return;
    }

    await consumeOllamaJsonlStream(response, {
      onToken: (token) => {
        fullContent += token;
        emittedChunks += 1;
        callbacks.onChunk?.(token);
      },
      onDone: () => {},
    });
    console.log(
      "[Intent Framing LLM] Stream complete, total length:",
      fullContent.length,
      "chunks:",
      emittedChunks,
    );
    callbacks.onDone?.(fullContent);
  } catch (err) {
    clearTimeout(timeoutId);
    console.error("[Intent Framing LLM] Error:", err.name, err.message);
    if (err.name === "AbortError") {
      console.log(
        "[Intent Framing LLM] Aborted, returning partial content:",
        fullContent.length,
      );
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
    if (!OLLAMA_STREAMING) {
      const fallback = await generateChatResponse(message);
      if (fallback) {
        yield { type: "chunk", content: fallback };
      }
      yield { type: "done" };
      return;
    }

    console.log("[LLM STREAM] Sending fetch request...");
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.2,
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
    if (!OLLAMA_STREAMING) {
      const fallback = await generateChatResponse(message);
      if (fallback) {
        callbacks.onChunk?.(fallback);
      }
      callbacks.onDone?.();
      return;
    }

    console.log("[LLM STREAM CB] Sending fetch request...");
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: `${CHAT_SYSTEM_PROMPT}\n\nUser: ${message}\n\nAssistant:`,
        stream: true,
        options: {
          temperature: 0.2,
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

    await consumeOllamaJsonlStream(response, {
      onToken: (token) => callbacks.onChunk?.(token),
      onDone: () => {},
    });
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

async function decideUngoverned(message) {
  // INTENT ADAPTIVE RULE: Detect generation/writing requests that should NOT execute intents
  // These requests ask for the agent's assistance (writing, examples, templates),
  // not for system data retrieval. Route them directly to ungoverned mode.
  const normalized = (message || "").toLowerCase();

  // Generation request patterns - these indicate user wants writing/creative help
  const generationPatterns = [
    /\b(give me|show me|provide|create|write|draft|generate|compose)\s+(a|an|some)?\s*(example|sample|template|draft|model|demo)/i,
    /\b(help me (write|draft|create|compose))/i,
    /\bexample\s+(of|for)\s+(a|an)/i,
    /\bhow (do i|to|would i)\s+(write|draft|create|compose)/i,
    /\bstructured\s+(email|letter|message|document|cover\s+letter|invitation)/i,
    /\bsample\s+(email|letter|message|document)/i,
  ];

  const isGenerationRequest = generationPatterns.some((pattern) =>
    pattern.test(normalized),
  );

  if (isGenerationRequest) {
    console.log(
      "[Intent Adaptive] Generation request detected, routing to ungoverned mode:",
      message.slice(0, 60),
    );
    return { requiresOrdinayData: false, reason: "generation_request" };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt: UNGOVERNED_MODE_DECISION_PROMPT + message,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 10,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      return { requiresOrdinayData: true };
    }

    const data = await response.json();
    const rawResponse = (data.response || "").trim().toUpperCase();
    const requiresData = rawResponse === "YES";

    console.log(
      "[Ungoverned Decision]",
      requiresData ? "GOVERNED" : "UNGOVERNED",
      "- Message:",
      message.slice(0, 50),
    );

    return { requiresOrdinayData: requiresData };
  } catch (err) {
    clearTimeout(timeoutId);
    console.warn(
      "[Ungoverned Decision] LLM error, defaulting to governed:",
      err.message,
    );
    return { requiresOrdinayData: true };
  }
}

function sanitizeSearchSummaryInput(results = []) {
  return (Array.isArray(results) ? results : [])
    .slice(0, WEB_SEARCH_SUMMARY_MAX_ITEMS)
    .map((row, idx) => {
      const title = String(row?.title || "")
        .trim()
        .slice(0, WEB_SEARCH_SUMMARY_MAX_TEXT);
      const snippet = String(row?.snippet || "")
        .trim()
        .slice(0, WEB_SEARCH_SUMMARY_MAX_TEXT);
      const summary = row?.summary
        ? String(row.summary).trim().slice(0, WEB_SEARCH_SUMMARY_MAX_TEXT)
        : "";
      const url = String(row?.url || "")
        .trim()
        .slice(0, 1200);
      const publishedDate = row?.publishedDate
        ? String(row.publishedDate).trim().slice(0, 80)
        : "";
      const source = row?.source ? String(row.source).trim().slice(0, 120) : "";
      if (!url) return null;
      return {
        index: idx + 1,
        title,
        snippet,
        summary: summary || null,
        url,
        publishedDate: publishedDate || null,
        source: source || null,
      };
    })
    .filter(Boolean);
}

function buildStructuredSearchContext(query, results) {
  return {
    query: String(query || "").trim(),
    results: (Array.isArray(results) ? results : [])
      .slice(0, WEB_SEARCH_SUMMARY_MAX_ITEMS)
      .map((row) => ({
        title: String(row?.title || "").trim(),
        snippet: String(row?.snippet || "").trim(),
        summary: row?.summary ? String(row.summary).trim() : "",
        url: String(row?.url || "").trim(),
      })),
  };
}

function normalizeSummaryText(text) {
  const raw = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim();
  if (!raw) return null;

  const cleanInline = (segment = "") =>
    String(segment || "")
      .replace(/\s*-\s*/g, "-")
      .replace(/\s+([,.;:!?%])/g, "$1")
      .replace(/([(\[])\s+/g, "$1")
      .replace(/\s+([)\]])/g, "$1")
      .replace(/(\[\d+\])(?=[A-Za-z0-9])/g, "$1 ")
      .replace(/\s+/g, " ")
      .trim();

  let paragraphs = raw
    .split(/\n\s*\n+/)
    .map((p) => cleanInline(p))
    .filter(Boolean);

  if (paragraphs.length <= 1) {
    const sentences = cleanInline(raw)
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (sentences.length >= 4) {
      const midpoint = Math.ceil(sentences.length / 2);
      paragraphs = [
        sentences.slice(0, midpoint).join(" "),
        sentences.slice(midpoint).join(" "),
      ];
    } else if (sentences.length > 0) {
      paragraphs = [sentences.join(" ")];
    }
  }

  const merged = paragraphs.join("\n\n");
  if (!merged) return null;
  return merged.length > 1600 ? `${merged.slice(0, 1600).trim()}...` : merged;
}

async function generateWebSearchAiSummary({
  query,
  mode = "basic",
  results = [],
} = {}) {
  const sanitizedResults = sanitizeSearchSummaryInput(results);
  if (!query || sanitizedResults.length === 0) return null;
  const structuredSearchContext = buildStructuredSearchContext(
    query,
    sanitizedResults,
  );

  console.log(
    "[WebSearchSummary] Started",
    JSON.stringify({ mode, query, resultCount: sanitizedResults.length }),
  );
  console.log(
    "[WebSearchSummary] Grounded context payload",
    JSON.stringify({
      query,
      mode,
      resultCount: structuredSearchContext.results.length,
      sample: structuredSearchContext.results.slice(0, 2),
    }),
  );

  const controller = new AbortController();
  const timeoutId = setTimeout(
    () => controller.abort(),
    WEB_SEARCH_SUMMARY_TIMEOUT,
  );
  try {
    const basePrompt = `${WEB_SEARCH_SUMMARY_PROMPT}

USER:
${JSON.stringify(structuredSearchContext)}`;
    let prompt = basePrompt;
    let lastError = "empty_summary";
    for (
      let attempt = 0;
      attempt <= WEB_SEARCH_SUMMARY_MAX_RETRIES;
      attempt += 1
    ) {
      const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: LLM_MODEL,
          prompt,
          stream: false,
          options: {
            temperature: 0.2,
            num_predict: 350,
          },
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        console.warn(
          "[WebSearchSummary] Failed: non-ok response",
          response.status,
        );
        return null;
      }

      const data = await response.json();
      const summaryText = normalizeSummaryText(data?.response || "");
      if (summaryText) {
        console.log(
          "[WebSearchSummary] Finished",
          JSON.stringify({ chars: summaryText.length, attempt: attempt + 1 }),
        );
        return {
          shortAnswer: summaryText,
          keyHighlights: [],
          citations: [],
        };
      }

      lastError = "empty_summary";
      console.warn(
        "[WebSearchSummary] Invalid payload",
        JSON.stringify({ attempt: attempt + 1, error: lastError }),
      );
      if (attempt >= WEB_SEARCH_SUMMARY_MAX_RETRIES) {
        break;
      }
      prompt = `${basePrompt}

Respond with only a concise factual summary grounded in the provided JSON. No generic advice.`;
    }

    console.warn("[WebSearchSummary] Failed: retries exhausted");
    return null;
  } catch (err) {
    console.warn("[WebSearchSummary] Failed", err?.message || "unknown_error");
    return null;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function streamWebSearchAiSummary(
  { query, mode = "basic", results = [] } = {},
  callbacks = {},
  signal,
) {
  const sanitizedResults = sanitizeSearchSummaryInput(results);
  if (!query || sanitizedResults.length === 0) {
    return { success: false, reason: "no_results" };
  }
  const structuredSearchContext = buildStructuredSearchContext(
    query,
    sanitizedResults,
  );
  const timeoutMs = WEB_SEARCH_STREAM_TIMEOUT;

  const abortController = new AbortController();
  const timeoutId = setTimeout(() => abortController.abort(), timeoutMs);
  if (signal) {
    if (signal.aborted) {
      abortController.abort();
    } else {
      signal.addEventListener("abort", () => abortController.abort(), {
        once: true,
      });
    }
  }

  console.log(
    "[SearchFlow] summary_start",
    JSON.stringify({
      timeoutMs,
      mode,
      resultCount: structuredSearchContext.results.length,
    }),
  );
  console.log(
    "[SearchFlow] summary_context_payload",
    JSON.stringify({
      query,
      mode,
      resultCount: structuredSearchContext.results.length,
      sample: structuredSearchContext.results.slice(0, 2),
    }),
  );

  let fullContent = "";
  let chunkCount = 0;
  try {
    const prompt = `${WEB_SEARCH_SUMMARY_PROMPT}

USER:
${JSON.stringify(structuredSearchContext)}`;
    const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: LLM_MODEL,
        prompt,
        stream: true,
        options: {
          temperature: 0.2,
          num_predict: 350,
        },
      }),
      signal: abortController.signal,
    });
    clearTimeout(timeoutId);
    if (!response.ok) {
      return { success: false, reason: `http_${response.status}` };
    }

    await consumeOllamaJsonlStream(response, {
      onToken: (token) => {
        chunkCount += 1;
        fullContent += token;
        callbacks.onChunk?.(token);
        console.debug(
          "[SearchFlow] summary_token",
          JSON.stringify({ chunkCount, size: String(token || "").length }),
        );
      },
      onDone: () => {},
    });

    const normalized = normalizeSummaryText(fullContent);
    if (!normalized) {
      return { success: false, reason: "empty_summary" };
    }
    console.log(
      "[SearchFlow] summary_complete",
      JSON.stringify({ chunkCount, chars: normalized.length }),
    );
    callbacks.onDone?.(normalized);
    return { success: true, summary: normalized };
  } catch (err) {
    clearTimeout(timeoutId);
    const reason =
      err?.name === "AbortError" ? "abort" : err?.message || "error";
    return { success: false, reason };
  }
}

module.exports = {
  classifyIntentWithLLM,
  generateChatResponse,
  generateToolCallingTurn,
  streamChatResponse,
  streamChatWithCallbacks,
  isLLMAvailable,
  LLM_BASE_URL,
  LLM_MODEL,
  OLLAMA_STREAMING,
  CHAT_SYSTEM_PROMPT,
  buildIntentFramingPrompt,
  generateIntentFramingMessage,
  streamIntentFramingMessage,
  selectRelevantDocuments,
  summarizeDocumentText,
  decideUngoverned,
  generateWebSearchAiSummary,
  streamWebSearchAiSummary,
};
