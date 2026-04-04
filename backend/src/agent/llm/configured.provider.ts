/**
 * ConfiguredLLMProvider — ILLMProvider backed by user-configured settings.
 *
 * Sends all requests to a single OpenAI-compatible endpoint using the
 * base URL, API key, and model stored in the AI provider config.
 *
 * No fallback chain. If the configured endpoint fails, it fails visibly.
 */
import type {
  ILLMProvider,
  LLMGenerateParams,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from "./illm.provider";

export interface ConfiguredProviderConfig {
  provider_type: string;
  base_url: string;
  api_key: string;
  model: string;
}

export function createConfiguredLLMProvider(
  config: ConfiguredProviderConfig,
): ILLMProvider {
  return new ConfiguredLLMProvider(config);
}

class ConfiguredLLMProvider implements ILLMProvider {
  private readonly config: ConfiguredProviderConfig;

  constructor(config: ConfiguredProviderConfig) {
    this.config = config;
  }

  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    if (params.signal?.aborted) {
      throw createAbortError();
    }
    const model = this.resolveModel(params);
    const url = this.buildCompletionUrl();
    const headers = this.buildHeaders();
    const body = toChatCompletionBody(model, params);

    console.info(
      "[CONFIGURED_LLM_GENERATE_START]",
      JSON.stringify({
        provider_type: this.config.provider_type,
        model,
        url,
        messageCount: Array.isArray(params.messages)
          ? params.messages.length
          : 0,
        toolCount: Array.isArray(params.tools) ? params.tools.length : 0,
      }),
    );

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    });

    if (!response.ok) {
      const errBody = await response.text().catch(() => "");
      console.warn(
        "[CONFIGURED_LLM_GENERATE_HTTP_ERROR]",
        JSON.stringify({
          status: response.status,
          body: errBody.slice(0, 300),
          model,
        }),
      );
      return {
        text: "I cannot access the language model right now. Please try again.",
        toolCalls: [],
        finishReason: "error",
        raw: { source: "configured", status: response.status },
      };
    }

    const payload = (await response.json()) as Record<string, unknown>;
    return normalizeChatCompletionResponse(payload);
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    if (params.signal?.aborted) {
      return;
    }
    const model = this.resolveModel(params);
    const url = this.buildCompletionUrl();
    const headers = this.buildHeaders();
    const body = {
      ...toChatCompletionBody(model, params),
      stream: true,
    };

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: params.signal,
    }).catch((err) => {
      if (isAbortError(err)) return null;
      console.warn("[CONFIGURED_LLM_STREAM_FETCH_ERROR]", String(err));
      return null;
    });

    if (!response?.ok || !response.body) {
      if (response && !response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          "[CONFIGURED_LLM_STREAM_HTTP_ERROR]",
          JSON.stringify({
            status: response.status,
            body: errBody.slice(0, 500),
            model,
          }),
        );
      }
      // Fallback to non-streaming generate
      const fallback = await this.generate(params);
      if (fallback.text) {
        yield { deltaText: fallback.text };
      }
      for (const toolCall of fallback.toolCalls || []) {
        yield { toolCall };
      }
      yield { finishReason: fallback.finishReason, done: true };
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolFragments = new Map<
      number,
      { id?: string; name?: string; argumentsText: string }
    >();
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
          .map((line) => line.trim())
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trim())
          .filter(Boolean);

        for (const payload of lines) {
          if (payload === "[DONE]") continue;
          let row: Record<string, unknown> | null = null;
          try {
            row = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            row = null;
          }
          if (!row) continue;

          const choice = Array.isArray(row.choices)
            ? toRecord(row.choices[0])
            : null;
          const delta = toRecord(choice?.delta);
          if (!delta) continue;

          const content = asString(delta.content);
          if (content && content.length > 0) {
            yield { deltaText: content };
          }

          const toolCalls = Array.isArray(delta.tool_calls)
            ? delta.tool_calls
            : [];
          for (const toolCallRow of toolCalls) {
            const tc = toRecord(toolCallRow);
            if (!tc) continue;
            const idx = Number(tc.index);
            if (!Number.isFinite(idx)) continue;
            const current = toolFragments.get(idx) ?? { argumentsText: "" };
            if (typeof tc.id === "string" && tc.id.trim().length > 0) {
              current.id = tc.id;
            }
            const fn = toRecord(tc.function);
            const fnName = asString(fn?.name);
            if (fnName && fnName.trim().length > 0) {
              current.name = fnName;
            }
            const argChunk = asString(fn?.arguments);
            if (argChunk) {
              current.argumentsText += argChunk;
            }
            toolFragments.set(idx, current);
          }

          const stopReason = asString(choice?.finish_reason);
          if (stopReason) {
            finishReason = stopReason;
          }
        }
      }
    }

    // Flush remaining buffer
    if (buffer.trim().length > 0) {
      const parts = buffer.split("\n").map((line) => line.trim());
      for (const part of parts) {
        if (!part.startsWith("data:")) continue;
        const payload = part.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        let row: Record<string, unknown> | null = null;
        try {
          row = JSON.parse(payload) as Record<string, unknown>;
        } catch {
          row = null;
        }
        const choice =
          row && Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
        const stopReason = asString(choice?.finish_reason);
        if (stopReason) finishReason = stopReason;
      }
    }

    // Emit completed tool calls
    for (const [, fragment] of Array.from(toolFragments.entries()).sort(
      (a, b) => a[0] - b[0],
    )) {
      const id =
        fragment.id ||
        `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = fragment.name || "";
      if (!name) continue;
      const argumentsObj = parseArguments(fragment.argumentsText);
      yield { toolCall: { id, name, arguments: argumentsObj } };
    }

    yield { finishReason, done: true };
  }

  supportsTools(): boolean {
    return true;
  }

  private resolveModel(params: LLMGenerateParams): string {
    // Use user-configured model; ignore modelPreference metadata from old path
    return this.config.model;
  }

  private buildCompletionUrl(): string {
    const base = String(this.config.base_url || "").replace(/\/+$/, "");
    if (this.config.provider_type === "ollama") {
      return `${base || "http://localhost:11434"}/v1/chat/completions`;
    }
    // openai_compatible and custom: base_url should include /v1 if needed
    return `${base}/chat/completions`;
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.config.api_key) {
      headers["Authorization"] = `Bearer ${this.config.api_key}`;
    }
    return headers;
  }
}

// ── Shared utilities (mirrored from native.provider.ts) ────

function toChatCompletionBody(
  model: string,
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
    model,
    messages,
    tools: Array.isArray(params.tools) ? params.tools : [],
    tool_choice: "auto",
    temperature:
      typeof params.temperature === "number" ? params.temperature : 0.1,
    ...(typeof params.maxTokens === "number"
      ? { max_tokens: params.maxTokens }
      : {}),
    stream: false,
  };
}

function normalizeChatCompletionResponse(
  payload: Record<string, unknown>,
): LLMResponse {
  const choice = Array.isArray(payload.choices)
    ? toRecord(payload.choices[0])
    : null;
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
    try {
      const parsed = JSON.parse(value);
      return toRecord(parsed) ?? {};
    } catch {
      return {};
    }
  }
  return {};
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return null;
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
