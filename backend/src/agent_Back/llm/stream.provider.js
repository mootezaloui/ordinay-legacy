"use strict";

const DEFAULT_PROVIDER = process.env.LLM_PROVIDER || "auto";
const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const OPENAI_API_KEY = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || process.env.LLM_OPENAI_BASE_URL || "https://api.openai.com/v1";

function resolveProvider(explicitProvider) {
  const raw = String(explicitProvider || DEFAULT_PROVIDER || "auto").toLowerCase();
  if (["ollama", "openai", "auto"].includes(raw)) {
    return raw;
  }
  return "auto";
}

function toPrompt(messages = []) {
  const rows = Array.isArray(messages) ? messages : [];
  return rows
    .map((row) => {
      const role = String(row?.role || "user").toUpperCase();
      const content = String(row?.content || "").trim();
      return `${role}: ${content}`;
    })
    .join("\n\n");
}

function normalizeOpenAiBase(url) {
  const trimmed = String(url || "").replace(/\/+$/, "");
  if (trimmed.endsWith("/v1")) return trimmed;
  return `${trimmed}/v1`;
}

async function* parseNdjsonOrSseStream(response) {
  const reader = response.body?.getReader?.();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let pending = "";

  const parseLine = (line) => {
    const trimmed = String(line || "").trim();
    if (!trimmed) return { done: false, text: "" };

    if (trimmed.startsWith("data:")) {
      const dataPart = trimmed.slice(5).trim();
      if (dataPart === "[DONE]") {
        return { done: true, text: "" };
      }
      try {
        const parsed = JSON.parse(dataPart);
        const ollamaToken = parsed?.response || "";
        const openaiToken = parsed?.choices?.[0]?.delta?.content || "";
        const done = Boolean(parsed?.done) || parsed?.choices?.[0]?.finish_reason != null;
        return { done, text: String(ollamaToken || openaiToken || "") };
      } catch {
        return { done: false, text: dataPart };
      }
    }

    try {
      const parsed = JSON.parse(trimmed);
      const ollamaToken = parsed?.response || "";
      const openaiToken = parsed?.choices?.[0]?.delta?.content || "";
      const done = Boolean(parsed?.done) || parsed?.choices?.[0]?.finish_reason != null;
      return { done, text: String(ollamaToken || openaiToken || "") };
    } catch {
      return { done: false, text: trimmed };
    }
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });

    const lines = pending.split("\n");
    pending = lines.pop() || "";

    for (const line of lines) {
      const parsed = parseLine(line);
      if (parsed.text) {
        yield { kind: "delta", text: parsed.text };
      }
      if (parsed.done) {
        return;
      }
    }
  }

  if (pending) {
    const parsed = parseLine(pending);
    if (parsed.text) {
      yield { kind: "delta", text: parsed.text };
    }
  }
}

async function* streamOllama({ model, messages, prompt, signal, temperature, maxTokens }) {
  const body = {
    model: model || LLM_MODEL,
    prompt: prompt || toPrompt(messages),
    stream: true,
    options: {
      temperature: typeof temperature === "number" ? temperature : 0.1,
      num_predict: typeof maxTokens === "number" ? maxTokens : 450,
    },
  };

  const response = await fetch(`${LLM_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`LLM_HTTP_${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await response.json();
    const text = String(json?.response || "");
    if (text) {
      yield { kind: "delta", text };
    }
    yield { kind: "final_text", text };
    return;
  }

  let full = "";
  for await (const part of parseNdjsonOrSseStream(response)) {
    if (part?.text) {
      full += part.text;
      yield part;
    }
  }
  yield { kind: "final_text", text: full };
}

async function* streamOpenAi({ model, messages, signal, temperature, maxTokens, schema, mode }) {
  const base = normalizeOpenAiBase(OPENAI_BASE_URL);
  const useSchema = mode === "json" && schema && typeof schema === "object";
  const body = {
    model: model || LLM_MODEL,
    messages: Array.isArray(messages) ? messages : [],
    stream: true,
    temperature: typeof temperature === "number" ? temperature : 0.1,
    max_tokens: typeof maxTokens === "number" ? maxTokens : 450,
  };

  if (useSchema) {
    body.response_format = {
      type: "json_schema",
      json_schema: {
        name: "structured_output",
        strict: true,
        schema,
      },
    };
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(OPENAI_API_KEY ? { Authorization: `Bearer ${OPENAI_API_KEY}` } : {}),
    },
    body: JSON.stringify(body),
    signal,
  });

  if (!response.ok) {
    throw new Error(`LLM_HTTP_${response.status}`);
  }

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json")) {
    const json = await response.json();
    const text = String(json?.choices?.[0]?.message?.content || "");
    if (text) {
      yield { kind: "delta", text };
    }
    yield { kind: "final_text", text };
    return;
  }

  let full = "";
  for await (const part of parseNdjsonOrSseStream(response)) {
    if (part?.text) {
      full += part.text;
      yield part;
    }
  }
  yield { kind: "final_text", text: full };
}

async function* streamLLM({
  provider,
  model,
  messages,
  prompt,
  schema,
  mode,
  signal,
  temperature,
  maxTokens,
} = {}) {
  const resolved = resolveProvider(provider);

  if (resolved === "ollama") {
    yield* streamOllama({ model, messages, prompt, signal, temperature, maxTokens });
    return;
  }

  if (resolved === "openai") {
    yield* streamOpenAi({ model, messages, signal, temperature, maxTokens, schema, mode });
    return;
  }

  try {
    yield* streamOllama({ model, messages, prompt, signal, temperature, maxTokens });
  } catch (error) {
    const shouldFallbackToOpenAi =
      OPENAI_API_KEY &&
      /(ENOTFOUND|ECONNREFUSED|LLM_HTTP_4\d|LLM_HTTP_5\d)/i.test(String(error?.message || ""));
    if (!shouldFallbackToOpenAi) {
      throw error;
    }
    yield* streamOpenAi({ model, messages, signal, temperature, maxTokens, schema, mode });
  }
}

module.exports = {
  streamLLM,
};
