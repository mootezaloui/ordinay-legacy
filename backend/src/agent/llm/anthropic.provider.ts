/**
 * AnthropicLLMProvider — ILLMProvider backed by the Anthropic Messages API.
 *
 * Maps ILLMProvider contracts to Anthropic's native format:
 *   - System prompt is separated from messages (Anthropic requires this)
 *   - Tool definitions use `input_schema` instead of `parameters`
 *   - Responses normalize `tool_use` content blocks → LLMToolCall[]
 *   - Streaming uses Anthropic SDK's stream helper
 */
import type {
  ILLMProvider,
  LLMGenerateParams,
  LLMResponse,
  LLMStreamChunk,
  LLMToolCall,
} from "./illm.provider";

export interface AnthropicProviderConfig {
  api_key: string;
  model: string;
}

export function createAnthropicLLMProvider(
  config: AnthropicProviderConfig,
): ILLMProvider {
  return new AnthropicLLMProvider(config);
}

class AnthropicLLMProvider implements ILLMProvider {
  private readonly config: AnthropicProviderConfig;
  private client: AnthropicClient | null = null;

  constructor(config: AnthropicProviderConfig) {
    this.config = config;
  }

  private getClient(): AnthropicClient {
    if (!this.client) {
      // Dynamic require to keep the import lazy
      const AnthropicModule = require("@anthropic-ai/sdk");
      const AnthropicClass = AnthropicModule.default || AnthropicModule;
      this.client = new AnthropicClass({ apiKey: this.config.api_key });
    }
    return this.client!;
  }

  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    if (params.signal?.aborted) {
      throw createAbortError();
    }

    const { system, messages } = splitSystemMessages(params.messages);
    const tools = convertTools(params.tools);

    console.info(
      "[ANTHROPIC_LLM_GENERATE_START]",
      JSON.stringify({
        model: this.config.model,
        messageCount: messages.length,
        toolCount: tools.length,
        hasSystem: system.length > 0,
      }),
    );

    try {
      const requestParams: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: typeof params.maxTokens === "number" ? params.maxTokens : 4096,
        messages,
        ...(system.length > 0 ? { system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
        ...(typeof params.temperature === "number"
          ? { temperature: params.temperature }
          : {}),
      };

      const response = await this.getClient().messages.create(
        requestParams as never,
      );

      return normalizeResponse(response as AnthropicResponse);
    } catch (error) {
      if (isAbortError(error)) throw error;
      console.warn("[ANTHROPIC_LLM_GENERATE_ERROR]", String(error));
      return {
        text: "I cannot access the language model right now. Please try again.",
        toolCalls: [],
        finishReason: "error",
        raw: { source: "anthropic", error: String(error) },
      };
    }
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    if (params.signal?.aborted) return;

    const { system, messages } = splitSystemMessages(params.messages);
    const tools = convertTools(params.tools);

    try {
      const requestParams: Record<string, unknown> = {
        model: this.config.model,
        max_tokens: typeof params.maxTokens === "number" ? params.maxTokens : 4096,
        messages,
        ...(system.length > 0 ? { system } : {}),
        ...(tools.length > 0 ? { tools } : {}),
        ...(typeof params.temperature === "number"
          ? { temperature: params.temperature }
          : {}),
      };

      const stream = this.getClient().messages.stream(
        requestParams as never,
      );

      const toolAccumulator = new Map<
        number,
        { id: string; name: string; inputJson: string }
      >();
      let toolBlockIndex = -1;

      for await (const event of stream as AsyncIterable<AnthropicStreamEvent>) {
        if (params.signal?.aborted) return;

        if (event.type === "content_block_start") {
          if (event.content_block?.type === "tool_use") {
            toolBlockIndex++;
            toolAccumulator.set(toolBlockIndex, {
              id: event.content_block.id || `tool_${Date.now()}_${toolBlockIndex}`,
              name: event.content_block.name || "",
              inputJson: "",
            });
          }
        } else if (event.type === "content_block_delta") {
          const delta = event.delta;
          if (delta?.type === "text_delta" && delta.text) {
            yield { deltaText: delta.text };
          } else if (delta?.type === "input_json_delta" && delta.partial_json) {
            const current = toolAccumulator.get(toolBlockIndex);
            if (current) {
              current.inputJson += delta.partial_json;
            }
          }
        } else if (event.type === "message_delta") {
          // end of message
        }
      }

      // Emit completed tool calls
      for (const [, fragment] of Array.from(toolAccumulator.entries()).sort(
        (a, b) => a[0] - b[0],
      )) {
        if (!fragment.name) continue;
        const args = parseJson(fragment.inputJson);
        yield {
          toolCall: {
            id: fragment.id,
            name: fragment.name,
            arguments: args,
          },
        };
      }

      const hasToolCalls = toolAccumulator.size > 0;
      yield {
        finishReason: hasToolCalls ? "tool_calls" : "stop",
        done: true,
      };
    } catch (error) {
      if (isAbortError(error)) return;
      console.warn("[ANTHROPIC_LLM_STREAM_ERROR]", String(error));
      // Fallback to non-streaming
      const fallback = await this.generate(params);
      if (fallback.text) yield { deltaText: fallback.text };
      for (const tc of fallback.toolCalls || []) yield { toolCall: tc };
      yield { finishReason: fallback.finishReason, done: true };
    }
  }

  supportsTools(): boolean {
    return true;
  }
}

// ── Message conversion ─────────────────────────────────────

function splitSystemMessages(
  messages: LLMGenerateParams["messages"],
): { system: string; messages: AnthropicMessage[] } {
  const systemParts: string[] = [];
  const converted: AnthropicMessage[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      systemParts.push(msg.content);
      continue;
    }

    if (msg.role === "tool") {
      converted.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: msg.toolCallId || `tool_${Date.now()}`,
            content: msg.content,
          },
        ],
      });
      continue;
    }

    if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
      const content: AnthropicContentBlock[] = [];
      if (msg.content) {
        content.push({ type: "text", text: msg.content });
      }
      for (const tc of msg.tool_calls) {
        content.push({
          type: "tool_use",
          id: tc.id,
          name: tc.function.name,
          input: parseJson(tc.function.arguments),
        });
      }
      converted.push({ role: "assistant", content });
      continue;
    }

    converted.push({
      role: msg.role === "assistant" ? "assistant" : "user",
      content: msg.content,
    });
  }

  return { system: systemParts.join("\n\n"), messages: converted };
}

// ── Tool conversion ────────────────────────────────────────

function convertTools(
  tools?: Array<Record<string, unknown>>,
): AnthropicTool[] {
  if (!Array.isArray(tools) || tools.length === 0) return [];

  return tools
    .map((tool) => {
      const fn =
        tool.type === "function" && typeof tool.function === "object"
          ? (tool.function as Record<string, unknown>)
          : tool;
      const name = String(fn.name || "").trim();
      if (!name) return null;
      return {
        name,
        description: String(fn.description || ""),
        input_schema: (fn.parameters || { type: "object", properties: {} }) as Record<
          string,
          unknown
        >,
      };
    })
    .filter(Boolean) as AnthropicTool[];
}

// ── Response normalization ─────────────────────────────────

function normalizeResponse(response: AnthropicResponse): LLMResponse {
  let text = "";
  const toolCalls: LLMToolCall[] = [];

  for (const block of response.content || []) {
    if (block.type === "text") {
      text += block.text || "";
    } else if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id || `tool_${Date.now()}_${toolCalls.length}`,
        name: block.name || "",
        arguments:
          typeof block.input === "object" && block.input !== null
            ? (block.input as Record<string, unknown>)
            : {},
      });
    }
  }

  return {
    text,
    toolCalls,
    finishReason:
      response.stop_reason === "tool_use"
        ? "tool_calls"
        : response.stop_reason || "stop",
    raw: response,
  };
}

// ── Utilities ──────────────────────────────────────────────

function parseJson(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      // ignore
    }
  }
  return {};
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

// ── Type shims (avoid importing full Anthropic SDK types) ──

interface AnthropicClient {
  messages: {
    create(params: never): Promise<AnthropicResponse>;
    stream(params: never): AsyncIterable<AnthropicStreamEvent>;
  };
}

interface AnthropicResponse {
  content: Array<{
    type: string;
    text?: string;
    id?: string;
    name?: string;
    input?: unknown;
  }>;
  stop_reason?: string;
}

interface AnthropicStreamEvent {
  type: string;
  content_block?: {
    type: string;
    id?: string;
    name?: string;
  };
  delta?: {
    type: string;
    text?: string;
    partial_json?: string;
  };
}

interface AnthropicMessage {
  role: "user" | "assistant";
  content: string | AnthropicContentBlock[];
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
}

interface AnthropicTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}
