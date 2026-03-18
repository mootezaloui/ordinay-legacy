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

const GROQ_API_KEY = process.env.GROQ_API_KEY || "";
const GROQ_MODEL = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai";
const GPT_OSS_MODEL = "gpt-oss:120b-cloud";
const DEEPSEEK_R1_8B_MODEL = "deepseek-r1:8b";
const GEMMA3_1B_MODEL = "gemma3:1b";
const LEGACY_GENNA3_1B_MODEL = "genna3:1b";
const MODEL_TOOL_SUPPORT_HINTS: Record<string, boolean | undefined> = {
  [GPT_OSS_MODEL]: true,
  [GEMMA3_1B_MODEL]: false,
  [LEGACY_GENNA3_1B_MODEL]: false,
};

export function createNativeLLMProvider(): ILLMProvider {
  return new NativeLLMProvider();
}

class NativeLLMProvider implements ILLMProvider {
  private lastStreamRetryAfterMs: number | null = null;
  private readonly modelToolSupportCache = new Map<string, boolean>();

  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    const modelChoice = await this.resolveModelChoice(
      params.metadata,
      Array.isArray(params.tools) && params.tools.length > 0,
    );
    const request = this.buildRequest(params, modelChoice.model);

    if (modelChoice.route !== "local_only") {
      const openAi = await this.tryOpenAiCompletion(request);
      if (openAi) {
        this.logCompletionDiagnostics("openai.generate", request, openAi);
        return openAi;
      }
    }

    const ollamaOpenAi = await this.tryOllamaOpenAiCompletion(request);
    if (ollamaOpenAi) {
      this.logCompletionDiagnostics("ollama-openai.generate", request, ollamaOpenAi);
      return ollamaOpenAi;
    }

    const ollamaChat = await this.tryOllamaChatCompletion(request);
    if (ollamaChat) {
      this.logCompletionDiagnostics("ollama-chat.generate", request, ollamaChat);
      return ollamaChat;
    }

    if (modelChoice.route !== "local_only") {
      const groq = await this.tryGroqCompletion(request);
      if (groq) {
        this.logCompletionDiagnostics("groq.generate", request, groq);
        return groq;
      }
    }

    const fallback: LLMResponse = {
      text: "I cannot access the language model right now. Please try again.",
      toolCalls: [],
      finishReason: "error",
      raw: { source: "fallback" },
    };
    this.logCompletionDiagnostics("fallback.generate", request, fallback);
    return fallback;
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    const modelChoice = await this.resolveModelChoice(
      params.metadata,
      Array.isArray(params.tools) && params.tools.length > 0,
    );
    const request = this.buildRequest(params, modelChoice.model);

    if (modelChoice.route !== "local_only" && OPENAI_API_KEY) {
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

    if (modelChoice.route !== "local_only" && GROQ_API_KEY) {
      const groqRequest = { ...request, model: GROQ_MODEL };
      for (let groqAttempt = 0; groqAttempt < 3; groqAttempt++) {
        this.lastStreamRetryAfterMs = null;
        let groqEmitted = false;
        for await (const chunk of this.streamOpenAiFromUrl(
          `${normalizeBase(GROQ_BASE_URL)}/v1/chat/completions`,
          groqRequest,
          { Authorization: `Bearer ${GROQ_API_KEY}` },
        )) {
          groqEmitted = true;
          yield chunk;
        }
        if (groqEmitted) {
          return;
        }
        const waitMs = this.lastStreamRetryAfterMs ?? 3000;
        console.warn(
          `[LLM_GROQ_STREAM_RETRY] attempt ${groqAttempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
        );
        await new Promise((r) => setTimeout(r, waitMs));
      }
    }

    const response = await this.generate(params);
    this.logCompletionDiagnostics("stream.fallback_to_generate", request, response);
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

  private logCompletionDiagnostics(
    source: string,
    request: LLMRequest,
    response: LLMResponse,
  ): void {
    if (!this.shouldTraceDraftRequest(request)) {
      return;
    }
    const toolCalls = Array.isArray(response.toolCalls) ? response.toolCalls : [];
    console.info(
      "[DRAFT_TRACE_LLM_COMPLETION]",
      JSON.stringify({
        source,
        finishReason: response.finishReason,
        toolCallCount: toolCalls.length,
        toolNames: toolCalls.map((tc) => tc?.name || "unknown"),
        textLength: String(response.text || "").trim().length,
      }),
    );
  }

  private shouldTraceDraftRequest(request: LLMRequest): boolean {
    const messages = Array.isArray(request.messages) ? request.messages : [];
    const userTail = [...messages]
      .reverse()
      .find((msg) => msg && msg.role === "user" && typeof msg.content === "string");
    const userText = String(userTail?.content || "");
    if (/\b(write|draft|compose|prepare|letter|email|summary|redige|rédige|prépare|اكتب|صغ)\b/i.test(userText)) {
      return true;
    }
    return /\nDRAFTING\n/.test(messages.map((m) => String(m?.content || "")).join("\n"));
  }

  private buildRequest(params: LLMGenerateParams, model: string): LLMRequest {
    return {
      model,
      messages: Array.isArray(params.messages) ? params.messages : [],
      tools: Array.isArray(params.tools) ? params.tools : [],
      temperature: typeof params.temperature === "number" ? params.temperature : 0.1,
      maxTokens:
        typeof params.maxTokens === "number" ? params.maxTokens : LLM_MAX_OUTPUT_TOKENS,
    };
  }

  private async resolveModelChoice(
    metadata?: Record<string, unknown>,
    requiresTools = false,
  ): Promise<ModelChoice> {
    const preferred = String(metadata?.modelPreference || "").trim();
    let model = LLM_MODEL;
    let route: ModelChoice["route"] = "auto";

    if (
      preferred === DEEPSEEK_R1_8B_MODEL ||
      preferred === GEMMA3_1B_MODEL ||
      preferred === LEGACY_GENNA3_1B_MODEL
    ) {
      model = preferred === LEGACY_GENNA3_1B_MODEL ? GEMMA3_1B_MODEL : preferred;
      route = "local_only";
    } else if (preferred === GPT_OSS_MODEL) {
      model = GPT_OSS_MODEL;
      route = "auto";
    }

    if (requiresTools) {
      const supportsTools = await this.modelSupportsTools(model);
      if (!supportsTools) {
        const fallbackRoute: ModelChoice["route"] =
          route === "local_only" ? "local_only" : "auto";
        console.warn(
          "[LLM_MODEL_FALLBACK_NO_TOOL_SUPPORT]",
          JSON.stringify({
            requestedModel: model,
            fallbackModel: GPT_OSS_MODEL,
            fallbackRoute,
          }),
        );
        return { model: GPT_OSS_MODEL, route: fallbackRoute };
      }
    }

    return { model, route };
  }

  private async modelSupportsTools(model: string): Promise<boolean> {
    const normalizedModel = String(model || "").trim().toLowerCase();
    if (!normalizedModel) {
      return true;
    }

    const cached = this.modelToolSupportCache.get(normalizedModel);
    if (typeof cached === "boolean") {
      return cached;
    }

    const hint = MODEL_TOOL_SUPPORT_HINTS[normalizedModel];
    if (typeof hint === "boolean") {
      this.modelToolSupportCache.set(normalizedModel, hint);
      return hint;
    }

    try {
      const response = await fetch(`${normalizeBase(LLM_BASE_URL)}/api/show`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model }),
      });
      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          "[LLM_MODEL_CAPS_UNAVAILABLE]",
          JSON.stringify({ model, status: response.status, body: errBody.slice(0, 200) }),
        );
        return true;
      }
      const payload = (await response.json()) as Record<string, unknown>;
      const capabilities = Array.isArray(payload.capabilities)
        ? payload.capabilities
            .map((value) => String(value || "").trim().toLowerCase())
            .filter(Boolean)
        : [];

      if (capabilities.length === 0) {
        this.modelToolSupportCache.set(normalizedModel, true);
        return true;
      }

      const supportsTools = capabilities.includes("tools");
      this.modelToolSupportCache.set(normalizedModel, supportsTools);
      return supportsTools;
    } catch (error) {
      console.warn(
        "[LLM_MODEL_CAPS_CHECK_ERROR]",
        JSON.stringify({ model, error: String(error) }),
      );
      return true;
    }
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
        if (response.status === 429) {
          this.lastStreamRetryAfterMs = this.inferRetryDelayMs(
            errBody,
            response.headers.get("retry-after"),
          );
        } else {
          this.lastStreamRetryAfterMs = null;
        }
        console.warn("[LLM_STREAM_HTTP_ERROR]", JSON.stringify({ url, status: response.status, body: errBody.slice(0, 500), msgCount: request.messages?.length }));
      }
      return;
    }
    this.lastStreamRetryAfterMs = null;

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

    if (this.shouldTraceDraftRequest(request)) {
      const streamedToolNames = Array.from(toolFragments.values())
        .map((fragment) => String(fragment?.name || "").trim())
        .filter(Boolean);
      console.info(
        "[DRAFT_TRACE_LLM_STREAM_PARSED]",
        JSON.stringify({
          source: url,
          finishReason,
          toolCallCount: streamedToolNames.length,
          toolNames: streamedToolNames,
        }),
      );
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

  private async tryGroqCompletion(request: LLMRequest): Promise<LLMResponse | null> {
    if (!GROQ_API_KEY) {
      return null;
    }

    const url = `${normalizeBase(GROQ_BASE_URL)}/v1/chat/completions`;
    const groqRequest = { ...request, model: GROQ_MODEL };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${GROQ_API_KEY}`,
          },
          body: JSON.stringify(toChatCompletionBody(groqRequest)),
        });

        if (response.status === 429) {
          const errBody = await response.text().catch(() => "");
          const waitMs = this.inferRetryDelayMs(errBody, response.headers.get("retry-after"));
          console.warn(
            `[LLM_GROQ_RATE_LIMIT] attempt ${attempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
          );
          await new Promise((r) => setTimeout(r, waitMs));
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          console.warn("[LLM_GROQ_ERROR]", JSON.stringify({ status: response.status, body: errBody.slice(0, 300), msgCount: request.messages?.length }));
          return null;
        }

        const payload = (await response.json()) as Record<string, unknown>;
        return normalizeChatCompletionResponse(payload);
      } catch (err) {
        console.warn("[LLM_GROQ_CATCH]", String(err));
        return null;
      }
    }
    return null;
  }

  private inferRetryDelayMs(
    responseBody: string,
    retryAfterHeader: string | null,
  ): number {
    const fromHeader = Number.parseFloat(String(retryAfterHeader || "").trim());
    if (Number.isFinite(fromHeader) && fromHeader > 0) {
      return this.clampRetryDelayMs(fromHeader * 1000);
    }

    const body = String(responseBody || "");
    const bodyMatch = body.match(/try again in\s+([\d.]+)s/i);
    if (bodyMatch) {
      const seconds = Number.parseFloat(bodyMatch[1]);
      if (Number.isFinite(seconds) && seconds > 0) {
        return this.clampRetryDelayMs(seconds * 1000);
      }
    }

    return 3000;
  }

  private clampRetryDelayMs(value: number): number {
    if (!Number.isFinite(value) || value <= 0) {
      return 3000;
    }
    return Math.max(3000, Math.min(Math.ceil(value), 60000));
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
    if (this.shouldTraceDraftRequest(request)) {
      console.info(
        "[DRAFT_TRACE_LLM_STREAM_PARSED]",
        JSON.stringify({
          source: url,
          finishReason,
          toolCallCount: collectedToolCalls.length,
          toolNames: collectedToolCalls.map((tc) => tc?.name || "unknown"),
        }),
      );
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

interface ModelChoice {
  model: string;
  route: "auto" | "local_only";
}

function toChatCompletionBody(request: LLMRequest): Record<string, unknown> {
  const messages = (request.messages ?? []).map((msg, idx) => {
    if (msg.role === "tool") {
      const { toolCallId, ...rest } = msg;
      return { ...rest, tool_call_id: toolCallId || `tool_${idx}` };
    }
    return msg;
  });
  return {
    model: request.model,
    messages,
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
