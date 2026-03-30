"use strict";

const DEFAULT_LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const DEFAULT_LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const REQUEST_TIMEOUT_MS = Number(process.env.DOCUMENT_LLM_TIMEOUT_MS || 120000);

function normalizeBase(value) {
  return String(value || DEFAULT_LLM_BASE_URL).replace(/\/+$/, "");
}

function normalizeNumber(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return numeric;
}

function extractTextContent(content) {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      if (typeof item.text === "string") return item.text;
      return "";
    })
    .join("");
}

async function parseResponseBody(response) {
  const text = await response.text();
  try {
    return { text, json: JSON.parse(text) };
  } catch {
    return { text, json: null };
  }
}

async function requestOpenAiCompatible({ baseUrl, model, messages, temperature, maxTokens }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature,
        max_tokens: maxTokens,
        stream: false,
      }),
      signal: controller.signal,
    });

    const { text, json } = await parseResponseBody(response);
    if (!response.ok) {
      const err = new Error(`OpenAI-compatible LLM call failed (${response.status})`);
      err.details = text;
      throw err;
    }

    const content = extractTextContent(json?.choices?.[0]?.message?.content);
    return String(content || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function requestOllamaChat({ baseUrl, model, messages, temperature, maxTokens }) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        options: {
          temperature,
          num_predict: maxTokens,
        },
      }),
      signal: controller.signal,
    });

    const { text, json } = await parseResponseBody(response);
    if (!response.ok) {
      const err = new Error(`Ollama chat call failed (${response.status})`);
      err.details = text;
      throw err;
    }

    const content =
      (typeof json?.message?.content === "string" && json.message.content) ||
      (typeof json?.response === "string" && json.response) ||
      "";
    return String(content || "").trim();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function* streamLLM(options = {}) {
  const baseUrl = normalizeBase(options.baseUrl || process.env.LLM_BASE_URL || DEFAULT_LLM_BASE_URL);
  const model = String(options.model || process.env.LLM_MODEL || DEFAULT_LLM_MODEL);
  const messages = Array.isArray(options.messages) ? options.messages : [];
  const temperature = normalizeNumber(options.temperature, 0.2);
  const maxTokens = Math.max(1, Math.floor(normalizeNumber(options.maxTokens, 1200)));

  const errors = [];

  try {
    const text = await requestOpenAiCompatible({
      baseUrl,
      model,
      messages,
      temperature,
      maxTokens,
    });
    yield { kind: "final_text", text };
    return;
  } catch (error) {
    errors.push(error);
  }

  try {
    const text = await requestOllamaChat({
      baseUrl,
      model,
      messages,
      temperature,
      maxTokens,
    });
    yield { kind: "final_text", text };
    return;
  } catch (error) {
    errors.push(error);
  }

  const details = errors
    .map((error) => {
      if (!error) return "Unknown LLM error";
      const message = error instanceof Error ? error.message : String(error);
      const extra = error && typeof error === "object" && typeof error.details === "string" ? ` :: ${error.details}` : "";
      return `${message}${extra}`;
    })
    .join(" | ");

  const finalError = new Error(`Document LLM stream failed: ${details}`);
  finalError.code = "DOCUMENT_LLM_STREAM_FAILED";
  throw finalError;
}

module.exports = {
  streamLLM,
};

