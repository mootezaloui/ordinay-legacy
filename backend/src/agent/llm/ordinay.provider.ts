/**
 * OrdinayLLMProvider — ILLMProvider that forwards requests to the Ordinay proxy.
 *
 * Uses a cached JWT (obtained from the license server) for auth.
 * Sends OpenAI-compatible requests; the proxy selects the actual LLM backend.
 */
import type {
  ILLMProvider,
  LLMGenerateParams,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from "./illm.provider";

const ORDINAY_MODEL = "ordinay-default";

function getProxyBaseUrl(): string {
  return (process.env.ORDINAY_PROXY_URL || "https://api.ordinay.app").replace(/\/+$/, "");
}

function loadAgentToken(): string | null {
  try {
    const svc = require("../../../src/services/aiProvider.service");
    const cached = svc.getCachedAgentToken();
    if (!cached || !cached.token) return null;
    if (cached.expired) {
      console.warn("[ORDINAY_PROVIDER] Cached agent token is expired");
      return null;
    }
    return cached.token;
  } catch (err) {
    console.warn("[ORDINAY_PROVIDER] Failed to load agent token:", String(err));
    return null;
  }
}

function buildHeaders(token: string): Record<string, string> {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
    "X-App-Version": process.env.npm_package_version || "unknown",
  };
}

function toChatCompletionBody(
  params: LLMGenerateParams,
): Record<string, unknown> {
  const messages = (params.messages ?? []).map((msg, idx) => {
    if (msg.role === "tool") {
      const { toolCallId, ...rest } = msg;
      return { ...rest, tool_call_id: toolCallId || `tool_${idx}` };
    }
    return msg;
  });
  return {
    model: ORDINAY_MODEL,
    messages,
    tools: Array.isArray(params.tools) ? params.tools : [],
    tool_choice: "auto",
    temperature: typeof params.temperature === "number" ? params.temperature : 0.1,
    ...(typeof params.maxTokens === "number" ? { max_tokens: params.maxTokens } : {}),
    stream: false,
  };
}

function httpErrorMessage(status: number, body: string): string {
  if (status === 401) return "Ordinay AI authentication failed — re-authenticate in Settings.";
  if (status === 402) {
    try {
      const parsed = JSON.parse(body);
      const resetAt = parsed.reset_at ? ` Resets on ${parsed.reset_at}.` : "";
      return `Monthly AI quota reached.${resetAt}`;
    } catch { /* ignore */ }
    return "Monthly AI quota reached. Check Settings for details.";
  }
  if (status === 429) {
    try {
      const parsed = JSON.parse(body);
      const retryAfter = parsed.retry_after ? ` Try again in ${parsed.retry_after}s.` : "";
      return `Too many requests.${retryAfter}`;
    } catch { /* ignore */ }
    return "Too many requests — please slow down.";
  }
  return `Ordinay proxy returned HTTP ${status}`;
}

function normalizeChatCompletionResponse(payload: Record<string, unknown>): LLMResponse {
  const choice = Array.isArray(payload.choices) ? toRecord(payload.choices[0]) : null;
  const message = toRecord(choice?.message) ?? {};
  const text = asString(message.content) ?? "";
  const toolCalls = normalizeToolCalls(message.tool_calls);
  return {
    text,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    raw: payload,
  };
}

export function createOrdinayLLMProvider(): ILLMProvider {
  return new OrdinayLLMProvider();
}

class OrdinayLLMProvider implements ILLMProvider {
  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    if (params.signal?.aborted) throw createAbortError();

    const token = loadAgentToken();
    if (!token) {
      return {
        text: "Ordinay AI is not authenticated. Open Settings → AI Configuration to connect your license.",
        toolCalls: [],
        finishReason: "error",
        raw: { source: "ordinay", error: "no_token" },
      };
    }

    const url = `${getProxyBaseUrl()}/v1/chat/completions`;
    const headers = buildHeaders(token);
    const body = toChatCompletionBody(params);

    console.info("[ORDINAY_LLM_GENERATE_START]", JSON.stringify({
      url,
      messageCount: Array.isArray(params.messages) ? params.messages.length : 0,
      toolCount: Array.isArray(params.tools) ? params.tools.length : 0,
    }));

    let response: globalThis.Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: params.signal,
      });
    } catch (error) {
      if (isAbortError(error)) throw createAbortError();
      console.warn("[ORDINAY_LLM_GENERATE_FETCH_ERROR]", String(error));
      return {
        text: "Failed to connect to Ordinay AI. Please try again shortly.",
        toolCalls: [],
        finishReason: "error",
        raw: { source: "ordinay", error: "fetch_error" },
      };
    }

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn("[ORDINAY_LLM_GENERATE_HTTP_ERROR]", JSON.stringify({
        status: response.status,
        body: errBody.slice(0, 300),
      }));
      return {
        text: httpErrorMessage(response.status, errBody),
        toolCalls: [],
        finishReason: "error",
        raw: { source: "ordinay", status: response.status },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return normalizeChatCompletionResponse(payload);
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    if (params.signal?.aborted) return;

    const token = loadAgentToken();
    if (!token) {
      yield { deltaText: "Ordinay AI is not authenticated. Open Settings → AI Configuration to connect your license." };
      yield { finishReason: "error", done: true };
      return;
    }

    const url = `${getProxyBaseUrl()}/v1/chat/completions`;
    const headers = buildHeaders(token);
    const body = { ...toChatCompletionBody(params), stream: true };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    }).catch((err) => {
      if (isAbortError(err)) return null;
      console.warn("[ORDINAY_LLM_STREAM_FETCH_ERROR]", String(err));
      return null;
    });

    if (!response?.ok || !response.body) {
      if (response && !response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn("[ORDINAY_LLM_STREAM_HTTP_ERROR]", JSON.stringify({
          status: response.status,
          body: errBody.slice(0, 500),
        }));
        yield { deltaText: httpErrorMessage(response.status, errBody) };
        yield { finishReason: "error", done: true };
        return;
      }
      // Fallback to non-streaming
      const fallback = await this.generate(params);
      if (fallback.text) yield { deltaText: fallback.text };
      for (const tc of fallback.toolCalls || []) yield { toolCall: tc };
      yield { finishReason: fallback.finishReason, done: true };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolFragments = new Map<number, { id?: string; name?: string; argumentsText: string }>();
    let finishReason: LLMResponse["finishReason"] = "stop";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      for (const block of blocks) {
        const lines = block
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).trim())
          .filter(Boolean);

        for (const payload of lines) {
          if (payload === "[DONE]") continue;
          let row: Record<string, unknown> | null = null;
          try { row = JSON.parse(payload) as Record<string, unknown>; } catch { row = null; }
          if (!row) continue;

          const choice = Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
          const delta = toRecord(choice?.delta);
          if (!delta) continue;

          const content = asString(delta.content);
          if (content && content.length > 0) yield { deltaText: content };

          const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
          for (const tcRow of toolCalls) {
            const tc = toRecord(tcRow);
            if (!tc) continue;
            const idx = Number(tc.index);
            if (!Number.isFinite(idx)) continue;
            const current = toolFragments.get(idx) ?? { argumentsText: "" };
            if (typeof tc.id === "string" && tc.id.trim().length > 0) current.id = tc.id;
            const fn = toRecord(tc.function);
            const fnName = asString(fn?.name);
            if (fnName && fnName.trim().length > 0) current.name = fnName;
            const argChunk = asString(fn?.arguments);
            if (argChunk) current.argumentsText += argChunk;
            toolFragments.set(idx, current);
          }

          const stopReason = asString(choice?.finish_reason);
          if (stopReason) finishReason = stopReason;
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      for (const part of buffer.split("\n").map((l) => l.trim())) {
        if (!part.startsWith("data:")) continue;
        const payload = part.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let row: Record<string, unknown> | null = null;
        try { row = JSON.parse(payload) as Record<string, unknown>; } catch { row = null; }
        const choice = row && Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
        const stopReason = asString(choice?.finish_reason);
        if (stopReason) finishReason = stopReason;
      }
    }

    // Emit completed tool calls
    for (const [, fragment] of Array.from(toolFragments.entries()).sort((a, b) => a[0] - b[0])) {
      const id = fragment.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = fragment.name || "";
      if (!name) continue;
      yield { toolCall: { id, name, arguments: parseArguments(fragment.argumentsText) } };
    }

    yield { finishReason, done: true };
  }

  supportsTools(): boolean {
    return true;
  }
}

// ── Shared utilities ──────────────────────────────────────

function normalizeToolCalls(value: unknown): LLMToolCall[] {
  if (!Array.isArray(value)) return [];
  const output: LLMToolCall[] = [];
  for (let i = 0; i < value.length; i++) {
    const row = toRecord(value[i]);
    const fn = toRecord(row?.function);
    const id = asString(row?.id) ?? `tool_${Date.now()}_${i}`;
    const name = asString(fn?.name);
    if (!name) continue;
    output.push({ id, name, arguments: parseArguments(fn?.arguments) });
  }
  return output;
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (toRecord(value)) return value as Record<string, unknown>;
  if (typeof value === "string") {
    try { return toRecord(JSON.parse(value)) ?? {}; } catch { return {}; }
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  return String(error || "").toLowerCase().includes("aborted");
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
}
