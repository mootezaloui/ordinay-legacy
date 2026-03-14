import type { ILLMProvider, LLMGenerateParams, LLMResponse, LLMStreamChunk, LLMToolCall } from "./illm.provider";

const LLM_BASE_URL = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
const LLM_MODEL = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
const OPENAI_API_KEY =
  process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
const OPENAI_BASE_URL =
  process.env.OPENAI_BASE_URL ||
  process.env.LLM_OPENAI_BASE_URL ||
  "https://api.openai.com";

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
    const response = await this.generate(params);
    if (response.text) {
      yield { deltaText: response.text };
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
      maxTokens: typeof params.maxTokens === "number" ? params.maxTokens : 800,
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
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeChatCompletionResponse(payload);
    } catch {
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
            num_predict: request.maxTokens,
          },
        }),
      });

      if (!response.ok) {
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
    } catch {
      return null;
    }
  }
}

interface LLMRequest {
  model: string;
  messages: LLMGenerateParams["messages"];
  tools: NonNullable<LLMGenerateParams["tools"]>;
  temperature: number;
  maxTokens: number;
}

function toChatCompletionBody(request: LLMRequest): Record<string, unknown> {
  return {
    model: request.model,
    messages: request.messages,
    tools: request.tools,
    tool_choice: "auto",
    temperature: request.temperature,
    max_tokens: request.maxTokens,
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
    const name = asString(fn?.name);
    if (!name) {
      continue;
    }

    const id = asString(row?.id) ?? `tool_${Date.now()}_${index}`;
    const parsedArgs = parseArguments(fn?.arguments);
    output.push({ id, name, arguments: parsedArgs });
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
    const name = asString(fn?.name);
    if (!name) {
      continue;
    }

    const id = asString(row?.id) ?? `tool_${Date.now()}_${index}`;
    const parsedArgs = parseArguments(fn?.arguments);
    output.push({ id, name, arguments: parsedArgs });
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