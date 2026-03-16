import type { ILLMProvider, LLMGenerateParams, LLMResponse, LLMStreamChunk, LLMToolCall } from "./illm.provider";

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const OPENAI_API_KEY =
  process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL ||
  process.env.LLM_OPENAI_BASE_URL ||
  "https://api.openai.com";
const LLM_MAX_OUTPUT_TOKENS = readOptionalPositiveInt(
  process.env.LLM_MAX_OUTPUT_TOKENS,
);

export function createNativeLLMProvider(): ILLMProvider {
  return new NativeLLMProvider();
}

class NativeLLMProvider implements ILLMProvider {
  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    const request = this.buildRequest(params);

    const openAi = await this.tryOpenAiCompletion(request);
    if (openAi) {
      return openAi;
    }

    const ollamaOpenAi = await this.tryOllamaOpenAiCompletion(request);
    if (ollamaOpenAi) {
      return ollamaOpenAi;
    }

    const ollamaChat = await this.tryOllamaChatCompletion(request);
    if (ollamaChat) {
      return ollamaChat;
    }

    return {
      text: "I cannot access the language model right now. Please try again.",
      toolCalls: [],
      finishReason: "error",
      raw: { source: "fallback" },
    };
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    const request = this.buildRequest(params);

    if (OPENAI_API_KEY) {
      let emitted = false;
      for await (const chunk of this.streamOpenAiFromUrl(
        `${normalizeOpenAiBase(OPENAI_BASE_URL)}/chat/completions`,
        request,
        {
          ...(OPENAI_API_KEY ? { Authorization: `Bearer ${OPENAI_API_KEY}` } : {}),
        },
      )) {
        emitted = true;
        yield chunk;
      }
      if (emitted) {
        return;
      }
    }

    // OpenAI-compatible endpoint served by local/remote LLM gateway (no API key required).
    let compatEmitted = false;
    for await (const chunk of this.streamOpenAiFromUrl(
      `${normalizeBase(LLM_BASE_URL)}/v1/chat/completions`,
      request,
    )) {
      compatEmitted = true;
      yield chunk;
    }
    if (compatEmitted) {
      return;
    }

    let ollamaEmitted = false;
    for await (const chunk of this.streamOllamaFromUrl(
      `${normalizeBase(LLM_BASE_URL)}/api/chat`,
      request,
    )) {
      ollamaEmitted = true;
      yield chunk;
    }
    if (ollamaEmitted) {
      return;
    }

    const response = await this.generate(params);
    if (response.text) {
      yield { deltaText: response.text };
    }
    for (const toolCall of response.toolCalls || []) {
      yield { toolCall };
    }
    yield { finishReason: response.finishReason, done: true };
  }

  supportsTools(): boolean {
    return true;
  }

  private buildRequest(params: LLMGenerateParams): LLMRequest {
    return {
      model: LLM_MODEL,
      messages: Array.isArray(params.messages) ? params.messages : [],
      tools: Array.isArray(params.tools) ? params.tools : [],
      temperature: typeof params.temperature === "number" ? params.temperature : 0.1,
      maxTokens:
        typeof params.maxTokens === "number" ? params.maxTokens : LLM_MAX_OUTPUT_TOKENS,
    };
  }

  private async tryOpenAiCompletion(request: LLMRequest): Promise<LLMResponse | null> {
    if (!OPENAI_API_KEY) {
      return null;
    }

    const url = `${normalizeOpenAiBase(OPENAI_BASE_URL)}/chat/completions`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${OPENAI_API_KEY}`,
        },
        body: JSON.stringify(toChatCompletionBody(request)),
      });

      if (!response.ok) {
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeChatCompletionResponse(payload);
    } catch {
      return null;
    }
  }

  private async *streamOpenAiFromUrl(
    url: string,
    request: LLMRequest,
    extraHeaders?: Record<string, string>,
  ): AsyncIterable<LLMStreamChunk> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(extraHeaders || {}),
      },
      body: JSON.stringify({
        ...toChatCompletionBody(request),
        stream: true,
      }),
    }).catch((err) => { console.warn("[LLM_STREAM_FETCH_ERROR]", url, String(err)); return null; });

    if (!response?.ok || !response.body) {
      if (response && !response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn("[LLM_STREAM_HTTP_ERROR]", JSON.stringify({ url, status: response.status, body: errBody.slice(0, 500), msgCount: request.messages?.length }));
      }
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
          if (payload === "[DONE]") {
            continue;
          }
          let row: Record<string, unknown> | null = null;
          try {
            row = JSON.parse(payload) as Record<string, unknown>;
          } catch {
            row = null;
          }
          if (!row) continue;

          const choice = Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
          const delta = toRecord(choice?.delta);
          if (!delta) continue;

          const content = asString(delta.content);
          if (content && content.length > 0) {
            yield { deltaText: content };
          }

          const toolCalls = Array.isArray(delta.tool_calls) ? delta.tool_calls : [];
          for (const toolCallRow of toolCalls) {
            const toolCall = toRecord(toolCallRow);
            if (!toolCall) continue;
            const idx = Number(toolCall.index);
            if (!Number.isFinite(idx)) continue;
            const current = toolFragments.get(idx) ?? { argumentsText: "" };
            if (typeof toolCall.id === "string" && toolCall.id.trim().length > 0) {
              current.id = toolCall.id;
            }
            const fn = toRecord(toolCall.function);
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
        const choice = row && Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
        const stopReason = asString(choice?.finish_reason);
        if (stopReason) {
          finishReason = stopReason;
        }
      }
    }

    for (const [, fragment] of Array.from(toolFragments.entries()).sort((a, b) => a[0] - b[0])) {
      const id = fragment.id || `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const name = fragment.name || "";
      if (!name) continue;
      const argumentsObj = parseArguments(fragment.argumentsText);
      yield {
        toolCall: {
          id,
          name,
          arguments: argumentsObj,
        },
      };
    }

    yield { finishReason, done: true };
  }

  private async tryOllamaOpenAiCompletion(
    request: LLMRequest,
  ): Promise<LLMResponse | null> {
    const url = `${normalizeBase(LLM_BASE_URL)}/v1/chat/completions`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toChatCompletionBody(request)),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn("[LLM_OLLAMA_OPENAI_ERROR]", JSON.stringify({ status: response.status, body: errBody.slice(0, 300), msgCount: request.messages?.length, toolCount: request.tools?.length }));
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeChatCompletionResponse(payload);
    } catch (err) {
      console.warn("[LLM_OLLAMA_OPENAI_CATCH]", String(err));
      return null;
    }
  }

  private async tryOllamaChatCompletion(request: LLMRequest): Promise<LLMResponse | null> {
    const url = `${normalizeBase(LLM_BASE_URL)}/api/chat`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: request.model,
          messages: request.messages,
          tools: request.tools,
          stream: false,
          options: {
            temperature: request.temperature,
            ...(typeof request.maxTokens === "number"
              ? { num_predict: request.maxTokens }
              : {}),
          },
        }),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn("[LLM_OLLAMA_CHAT_ERROR]", JSON.stringify({ status: response.status, body: errBody.slice(0, 300), msgCount: request.messages?.length }));
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      const message = toRecord(payload.message) ?? {};
      const text = asString(message.content) ?? "";
      const toolCalls = normalizeOllamaToolCalls(message.tool_calls);

      return {
        text,
        toolCalls,
        finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
        raw: payload,
      };
    } catch (err) {
      console.warn("[LLM_OLLAMA_CHAT_CATCH]", String(err));
      return null;
    }
  }

  private async *streamOllamaFromUrl(
    url: string,
    request: LLMRequest,
  ): AsyncIterable<LLMStreamChunk> {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: request.model,
        messages: request.messages,
        tools: request.tools,
        stream: true,
        options: {
          temperature: request.temperature,
          ...(typeof request.maxTokens === "number"
            ? { num_predict: request.maxTokens }
            : {}),
        },
      }),
    }).catch(() => null);

    if (!response?.ok || !response.body) {
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason: LLMResponse["finishReason"] = "stop";
    const collectedToolCalls: LLMToolCall[] = [];

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        let row: Record<string, unknown> | null = null;
        try {
          row = JSON.parse(trimmed) as Record<string, unknown>;
        } catch {
          row = null;
        }
        if (!row) continue;
        const message = toRecord(row.message);
        const content = asString(message?.content);
        if (content && content.length > 0) {
          yield { deltaText: content };
        }

        const parsedCalls = normalizeOllamaToolCalls(message?.tool_calls);
        if (parsedCalls.length > 0) {
          collectedToolCalls.push(...parsedCalls);
        }

        if (row.done === true) {
          finishReason = parsedCalls.length > 0 ? "tool_calls" : "stop";
        }
      }
    }

    for (const toolCall of collectedToolCalls) {
      yield { toolCall };
    }
    yield { finishReason, done: true };
  }
}

interface LLMRequest {
  model: string;
  messages: LLMGenerateParams["messages"];
  tools: NonNullable<LLMGenerateParams["tools"]>;
  temperature: number;
  maxTokens?: number;
}

function toChatCompletionBody(request: LLMRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: "auto",
    temperature: request.temperature,
    ...(typeof request.maxTokens === "number" ? { max_tokens: request.maxTokens } : {}),
    stream: false,
  };
}

function normalizeChatCompletionResponse(payload: Record<string, unknown>): LLMResponse {
  const choice = Array.isArray(payload.choices) ? toRecord(payload.choices[0]) : null;
  const message = toRecord(choice?.message) ?? {};
  const text = asString(message.content) ?? "";
  const toolCalls = normalizeOpenAiToolCalls(message.tool_calls);

  return {
    text,
    toolCalls,
    finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
    raw: payload,
  };
}

function normalizeOpenAiToolCalls(value: unknown): LLMToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: LLMToolCall[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = toRecord(value[index]);
    const fn = toRecord(row?.function);
    const id = asString(row?.id) ?? `tool_${Date.now()}_${index}`;
    const parsedArgs = parseArguments(fn?.arguments);
    const name = asString(fn?.name);
    const sanitized = sanitizeToolCallCandidate({ id, name, args: parsedArgs, source: "openai" });
    if (sanitized) {
      output.push(sanitized);
    }
  }

  return output;
}

function normalizeOllamaToolCalls(value: unknown): LLMToolCall[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const output: LLMToolCall[] = [];
  for (let index = 0; index < value.length; index += 1) {
    const row = toRecord(value[index]);
    const fn = toRecord(row?.function) ?? row;
    const id = asString(row?.id) ?? `tool_${Date.now()}_${index}`;
    const parsedArgs = parseArguments(fn?.arguments);
    const name = asString(fn?.name);
    const sanitized = sanitizeToolCallCandidate({ id, name, args: parsedArgs, source: "ollama" });
    if (sanitized) {
      output.push(sanitized);
    }
  }

  return output;
}

function parseArguments(value: unknown): Record<string, unknown> {
  if (toRecord(value)) {
    return value as Record<string, unknown>;
  }

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

function normalizeOpenAiBase(value: string): string {
  const trimmed = normalizeBase(value);
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

function normalizeBase(value: string): string {
  return String(value || "").replace(/\/+$/, "");
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function readOptionalPositiveInt(value: string | undefined): number | undefined {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function sanitizeToolCallCandidate(params: {
  id: string;
  name: string | null;
  args: Record<string, unknown>;
  source: "openai" | "ollama";
}): LLMToolCall | null {
  const rawName = String(params.name || "").trim();
  const args = params.args;

  if (!rawName) {
    return null;
  }

  const normalizedName = rawName.toLowerCase();
  const hasPseudoAssistantName =
    normalizedName === "assistant" ||
    normalizedName === "commentary" ||
    normalizedName.includes("<|channel|>");

  if (!hasPseudoAssistantName) {
    return { id: params.id, name: rawName, arguments: args };
  }

  const nestedTool = typeof args.tool === "string" ? args.tool.trim() : "";
  const nestedArgs = toRecord(args.arguments) ?? {};
  const hasWrappedResult = toRecord(args.result) !== null;

  if (nestedTool && Object.keys(nestedArgs).length > 0) {
    console.warn(
      "[LLM_TOOL_CALL_SANITIZED]",
      JSON.stringify({
        source: params.source,
        from: rawName,
        to: nestedTool,
      }),
    );
    return {
      id: params.id,
      name: nestedTool,
      arguments: nestedArgs,
    };
  }

  if (nestedTool && hasWrappedResult) {
    console.warn(
      "[LLM_TOOL_CALL_DROPPED_WRAPPED_RESULT]",
      JSON.stringify({
        source: params.source,
        from: rawName,
        nestedTool,
      }),
    );
    return null;
  }

  console.warn(
    "[LLM_TOOL_CALL_DROPPED_INVALID_NAME]",
    JSON.stringify({
      source: params.source,
      name: rawName,
      argKeys: Object.keys(args),
    }),
  );
  return null;
}
