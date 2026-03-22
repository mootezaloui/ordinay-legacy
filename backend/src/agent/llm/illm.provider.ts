export type LLMRole = "system" | "user" | "assistant" | "tool";

export interface LLMMessage {
  role: LLMRole;
  content: string;
  name?: string;
  toolCallId?: string;
  tool_calls?: Array<{ id: string; type: "function"; function: { name: string; arguments: string } }>;
}

export interface LLMToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface LLMResponse {
  text: string;
  toolCalls: LLMToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error" | string;
  raw?: unknown;
}

export interface LLMStreamChunk {
  deltaText?: string;
  toolCall?: Partial<LLMToolCall>;
  finishReason?: LLMResponse["finishReason"];
  done?: boolean;
  raw?: unknown;
}

export interface LLMGenerateParams {
  messages: LLMMessage[];
  tools?: Array<Record<string, unknown>>;
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface ILLMProvider {
  generate(params: LLMGenerateParams): Promise<LLMResponse>;
  stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk>;
  supportsTools(): boolean;
}
