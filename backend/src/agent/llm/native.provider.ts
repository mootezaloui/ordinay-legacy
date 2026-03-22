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
const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY || process.env.LLM_OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
const OPENROUTER_HTTP_REFERER = process.env.OPENROUTER_HTTP_REFERER || "";
const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || "";
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
  private lastStreamRateLimitKind: "tpd" | "other" | null = null;
  private readonly modelToolSupportCache = new Map<string, boolean>();

  async generate(params: LLMGenerateParams): Promise<LLMResponse> {
    if (params.signal?.aborted) {
      throw createAbortError();
    }
    const modelChoice = await this.resolveModelChoice(
      params.metadata,
      Array.isArray(params.tools) && params.tools.length > 0,
    );
    const request = this.buildRequest(params, modelChoice.model);
    console.info(
      "[LLM_GENERATE_START]",
      JSON.stringify({
        model: request.model,
        route: modelChoice.route,
        messageCount: Array.isArray(request.messages) ? request.messages.length : 0,
        toolCount: Array.isArray(request.tools) ? request.tools.length : 0,
        hasOpenAiKey: Boolean(OPENAI_API_KEY),
        hasOpenRouterKey: Boolean(OPENROUTER_API_KEY),
        hasGroqKey: Boolean(GROQ_API_KEY),
        llmBaseUrl: normalizeBase(LLM_BASE_URL),
        openAiBaseUrl: normalizeOpenAiBase(OPENAI_BASE_URL),
        openRouterBaseUrl: normalizeBase(OPENROUTER_BASE_URL),
        groqBaseUrl: normalizeBase(GROQ_BASE_URL),
      }),
    );

    if (modelChoice.route !== "local_only") {
      const openAi = await this.tryOpenAiCompletion(request, params.signal);
      if (openAi) {
        this.logCompletionDiagnostics("openai.generate", request, openAi);
        return openAi;
      }
    }

    const ollamaOpenAi = await this.tryOllamaOpenAiCompletion(request, params.signal);
    if (ollamaOpenAi) {
      this.logCompletionDiagnostics("ollama-openai.generate", request, ollamaOpenAi);
      return ollamaOpenAi;
    }

    const ollamaChat = await this.tryOllamaChatCompletion(request, params.signal);
    if (ollamaChat) {
      this.logCompletionDiagnostics("ollama-chat.generate", request, ollamaChat);
      return ollamaChat;
    }

    if (modelChoice.route !== "local_only") {
      const openRouter = await this.tryOpenRouterCompletion(request, params.signal);
      if (openRouter) {
        this.logCompletionDiagnostics("openrouter.generate", request, openRouter);
        return openRouter;
      }
    }

    if (modelChoice.route !== "local_only") {
      const groq = await this.tryGroqCompletion(request, params.signal);
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
    console.warn(
      "[LLM_GENERATE_ALL_PROVIDERS_FAILED]",
      JSON.stringify({
        model: request.model,
        route: modelChoice.route,
        messageCount: Array.isArray(request.messages) ? request.messages.length : 0,
        toolCount: Array.isArray(request.tools) ? request.tools.length : 0,
      }),
    );
    this.logCompletionDiagnostics("fallback.generate", request, fallback);
    return fallback;
  }

  async *stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
    if (params.signal?.aborted) {
      return;
    }
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
        params.signal,
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
      undefined,
      params.signal,
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
      params.signal,
    )) {
      ollamaEmitted = true;
      yield chunk;
    }
    if (ollamaEmitted) {
      return;
    }

    if (modelChoice.route !== "local_only" && OPENROUTER_API_KEY) {
      const openRouterRequest = { ...request, model: OPENROUTER_MODEL };
      for (let openRouterAttempt = 0; openRouterAttempt < 3; openRouterAttempt++) {
        this.lastStreamRetryAfterMs = null;
        this.lastStreamRateLimitKind = null;
        let openRouterEmitted = false;
        for await (const chunk of this.streamOpenAiFromUrl(
          `${normalizeBase(OPENROUTER_BASE_URL)}/chat/completions`,
          openRouterRequest,
          this.buildOpenRouterHeaders(),
          params.signal,
        )) {
          openRouterEmitted = true;
          yield chunk;
        }
        if (openRouterEmitted) {
          return;
        }
        if (this.lastStreamRateLimitKind === "tpd") {
          console.warn("[LLM_OPENROUTER_STREAM_RETRY_HALTED_TPD_LIMIT]");
          break;
        }
        const waitMs = this.lastStreamRetryAfterMs ?? 3000;
        console.warn(
          `[LLM_OPENROUTER_STREAM_RETRY] attempt ${openRouterAttempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
        );
        try {
          await this.sleepWithAbort(waitMs, params.signal);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          throw error;
        }
      }
    }

    if (modelChoice.route !== "local_only" && GROQ_API_KEY) {
      const groqRequest = { ...request, model: GROQ_MODEL };
      for (let groqAttempt = 0; groqAttempt < 3; groqAttempt++) {
        this.lastStreamRetryAfterMs = null;
        this.lastStreamRateLimitKind = null;
        let groqEmitted = false;
        for await (const chunk of this.streamOpenAiFromUrl(
          `${normalizeBase(GROQ_BASE_URL)}/v1/chat/completions`,
          groqRequest,
          { Authorization: `Bearer ${GROQ_API_KEY}` },
          params.signal,
        )) {
          groqEmitted = true;
          yield chunk;
        }
        if (groqEmitted) {
          return;
        }
        if (this.lastStreamRateLimitKind === "tpd") {
          console.warn("[LLM_GROQ_STREAM_RETRY_HALTED_TPD_LIMIT]");
          break;
        }
        const waitMs = this.lastStreamRetryAfterMs ?? 3000;
        console.warn(
          `[LLM_GROQ_STREAM_RETRY] attempt ${groqAttempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
        );
        try {
          await this.sleepWithAbort(waitMs, params.signal);
        } catch (error) {
          if (isAbortError(error)) {
            return;
          }
          throw error;
        }
      }
    }

    if (params.signal?.aborted) {
      return;
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

  private async tryOpenAiCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse | null> {
    if (!OPENAI_API_KEY) {
      console.warn("[LLM_OPENAI_SKIPPED_NO_API_KEY]");
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
        signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          "[LLM_OPENAI_HTTP_ERROR]",
          JSON.stringify({
            status: response.status,
            body: errBody.slice(0, 300),
            model: request.model,
            messageCount: request.messages?.length ?? 0,
          }),
        );
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeChatCompletionResponse(payload);
    } catch (error) {
      if (isAbortError(error)) {
        return null;
      }
      console.warn("[LLM_OPENAI_FETCH_ERROR]", String(error));
      return null;
    }
  }

  private async *streamOpenAiFromUrl(
    url: string,
    request: LLMRequest,
    extraHeaders?: Record<string, string>,
    signal?: AbortSignal,
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
      signal,
    }).catch((err) => {
      if (isAbortError(err)) {
        return null;
      }
      console.warn("[LLM_STREAM_FETCH_ERROR]", url, String(err));
      return null;
    });

    if (!response?.ok || !response.body) {
      if (response && !response.ok) {
        const errBody = await response.text().catch(() => "");
        if (response.status === 429) {
          this.lastStreamRateLimitKind = this.classifyRateLimitKind(errBody);
          this.lastStreamRetryAfterMs = this.inferRetryDelayMs(
            errBody,
            response.headers.get("retry-after"),
          );
        } else {
          this.lastStreamRateLimitKind = null;
          this.lastStreamRetryAfterMs = null;
        }
        console.warn("[LLM_STREAM_HTTP_ERROR]", JSON.stringify({ url, status: response.status, body: errBody.slice(0, 500), msgCount: request.messages?.length }));
      } else {
        console.warn(
          "[LLM_STREAM_EMPTY_OR_UNREACHABLE]",
          JSON.stringify({
            url,
            model: request.model,
            messageCount: request.messages?.length ?? 0,
            toolCount: request.tools?.length ?? 0,
          }),
        );
      }
      return;
    }
    this.lastStreamRetryAfterMs = null;

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    const toolFragments = new Map<
      number,
      { id?: string; name?: string; argumentsText: string; lastYieldLen: number; lastYieldTime: number }
    >();
    let finishReason: LLMResponse["finishReason"] = "stop";
    const PARTIAL_YIELD_INTERVAL_MS = 350;
    const PARTIAL_YIELD_MIN_GROWTH = 60;

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
            const current = toolFragments.get(idx) ?? { argumentsText: "", lastYieldLen: 0, lastYieldTime: 0 };
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

            // Progressive tool call streaming: yield partial chunks as args grow.
            // First yield when name is detected (empty placeholder), then periodic
            // updates using partial JSON repair so sections appear progressively.
            if (current.name && current.id) {
              const now = Date.now();
              const growth = current.argumentsText.length - current.lastYieldLen;
              const elapsed = now - current.lastYieldTime;
              const isFirst = current.lastYieldTime === 0;
              if (isFirst || (elapsed >= PARTIAL_YIELD_INTERVAL_MS && growth >= PARTIAL_YIELD_MIN_GROWTH)) {
                const partialArgs = repairPartialJson(current.argumentsText);
                console.info(
                  "[PROGRESSIVE_TOOL_CALL_YIELD]",
                  JSON.stringify({
                    toolName: current.name,
                    toolId: current.id,
                    isFirst,
                    argTextLen: current.argumentsText.length,
                    growth,
                    elapsed,
                    parsedKeys: Object.keys(partialArgs),
                    sectionCount: Array.isArray(partialArgs.sections) ? partialArgs.sections.length : 0,
                  }),
                );
                yield {
                  toolCall: {
                    id: current.id,
                    name: current.name,
                    arguments: partialArgs,
                  },
                };
                current.lastYieldLen = current.argumentsText.length;
                current.lastYieldTime = now;
              }
            }
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
    signal?: AbortSignal,
  ): Promise<LLMResponse | null> {
    const url = `${normalizeBase(LLM_BASE_URL)}/v1/chat/completions`;
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(toChatCompletionBody(request)),
        signal,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn("[LLM_OLLAMA_OPENAI_ERROR]", JSON.stringify({ status: response.status, body: errBody.slice(0, 300), msgCount: request.messages?.length, toolCount: request.tools?.length }));
        return null;
      }

      const payload = (await response.json()) as Record<string, unknown>;
      return normalizeChatCompletionResponse(payload);
    } catch (err) {
      if (isAbortError(err)) {
        return null;
      }
      console.warn("[LLM_OLLAMA_OPENAI_CATCH]", String(err));
      return null;
    }
  }

  private async tryOllamaChatCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse | null> {
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
        signal,
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
      if (isAbortError(err)) {
        return null;
      }
      console.warn("[LLM_OLLAMA_CHAT_CATCH]", String(err));
      return null;
    }
  }

  private async tryGroqCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse | null> {
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
          signal,
        });

        if (response.status === 429) {
          const errBody = await response.text().catch(() => "");
          const rateLimitKind = this.classifyRateLimitKind(errBody);
          if (rateLimitKind === "tpd") {
            console.warn(
              "[LLM_GROQ_RATE_LIMIT_TPD_HALT]",
              JSON.stringify({
                attempt: attempt + 1,
                status: response.status,
                body: errBody.slice(0, 300),
              }),
            );
            return null;
          }
          const waitMs = this.inferRetryDelayMs(errBody, response.headers.get("retry-after"));
          console.warn(
            `[LLM_GROQ_RATE_LIMIT] attempt ${attempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
          );
          try {
            await this.sleepWithAbort(waitMs, signal);
          } catch (error) {
            if (isAbortError(error)) {
              return null;
            }
            throw error;
          }
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
        if (isAbortError(err)) {
          return null;
        }
        console.warn("[LLM_GROQ_CATCH]", String(err));
        return null;
      }
    }
    return null;
  }

  private async tryOpenRouterCompletion(
    request: LLMRequest,
    signal?: AbortSignal,
  ): Promise<LLMResponse | null> {
    if (!OPENROUTER_API_KEY) {
      return null;
    }

    const url = `${normalizeBase(OPENROUTER_BASE_URL)}/chat/completions`;
    const openRouterRequest = { ...request, model: OPENROUTER_MODEL };
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: this.buildOpenRouterHeaders(),
          body: JSON.stringify(toChatCompletionBody(openRouterRequest)),
          signal,
        });

        if (response.status === 429) {
          const errBody = await response.text().catch(() => "");
          const rateLimitKind = this.classifyRateLimitKind(errBody);
          if (rateLimitKind === "tpd") {
            console.warn(
              "[LLM_OPENROUTER_RATE_LIMIT_TPD_HALT]",
              JSON.stringify({
                attempt: attempt + 1,
                status: response.status,
                body: errBody.slice(0, 300),
              }),
            );
            return null;
          }
          const waitMs = this.inferRetryDelayMs(errBody, response.headers.get("retry-after"));
          console.warn(
            `[LLM_OPENROUTER_RATE_LIMIT] attempt ${attempt + 1}/3, waiting ${Math.ceil(waitMs / 1000)}s`,
          );
          try {
            await this.sleepWithAbort(waitMs, signal);
          } catch (error) {
            if (isAbortError(error)) {
              return null;
            }
            throw error;
          }
          continue;
        }

        if (!response.ok) {
          const errBody = await response.text().catch(() => "");
          console.warn(
            "[LLM_OPENROUTER_ERROR]",
            JSON.stringify({
              status: response.status,
              body: errBody.slice(0, 300),
              msgCount: request.messages?.length,
            }),
          );
          return null;
        }

        const payload = (await response.json()) as Record<string, unknown>;
        return normalizeChatCompletionResponse(payload);
      } catch (err) {
        if (isAbortError(err)) {
          return null;
        }
        console.warn("[LLM_OPENROUTER_CATCH]", String(err));
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
    const bodyMatchWithMinutes = body.match(/try again in\s+((\d+)m)?\s*([\d.]+)s/i);
    if (bodyMatchWithMinutes) {
      const minutes = Number.parseFloat(bodyMatchWithMinutes[2] || "0");
      const seconds = Number.parseFloat(bodyMatchWithMinutes[3] || "0");
      const totalSeconds = (Number.isFinite(minutes) ? minutes : 0) * 60 + (Number.isFinite(seconds) ? seconds : 0);
      if (Number.isFinite(totalSeconds) && totalSeconds > 0) {
        return this.clampRetryDelayMs(totalSeconds * 1000);
      }
    }

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

  private classifyRateLimitKind(responseBody: string): "tpd" | "other" {
    const body = String(responseBody || "").toLowerCase();
    if (body.includes("tokens per day") || body.includes("tpd")) {
      return "tpd";
    }
    return "other";
  }

  private buildOpenRouterHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    };
    if (OPENROUTER_HTTP_REFERER.trim().length > 0) {
      headers["HTTP-Referer"] = OPENROUTER_HTTP_REFERER.trim();
    }
    if (OPENROUTER_APP_NAME.trim().length > 0) {
      headers["X-Title"] = OPENROUTER_APP_NAME.trim();
    }
    return headers;
  }

  private async *streamOllamaFromUrl(
    url: string,
    request: LLMRequest,
    signal?: AbortSignal,
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
      signal,
    }).catch((error) => {
      if (isAbortError(error)) {
        return null;
      }
      console.warn("[LLM_OLLAMA_STREAM_FETCH_ERROR]", JSON.stringify({ url, error: String(error) }));
      return null;
    });

    if (!response?.ok || !response.body) {
      if (response && !response.ok) {
        const errBody = await response.text().catch(() => "");
        console.warn(
          "[LLM_OLLAMA_STREAM_HTTP_ERROR]",
          JSON.stringify({
            status: response.status,
            body: errBody.slice(0, 300),
            model: request.model,
            messageCount: request.messages?.length ?? 0,
          }),
        );
      } else {
        console.warn(
          "[LLM_OLLAMA_STREAM_UNREACHABLE]",
          JSON.stringify({
            url,
            model: request.model,
            messageCount: request.messages?.length ?? 0,
          }),
        );
      }
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let finishReason: LLMResponse["finishReason"] = "stop";
    const yieldedToolCalls: LLMToolCall[] = [];

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
          // Yield tool calls immediately instead of collecting
          for (const toolCall of parsedCalls) {
            yieldedToolCalls.push(toolCall);
            yield { toolCall };
          }
        }

        if (row.done === true) {
          finishReason = parsedCalls.length > 0 ? "tool_calls" : "stop";
        }
      }
    }
    if (this.shouldTraceDraftRequest(request)) {
      console.info(
        "[DRAFT_TRACE_LLM_STREAM_PARSED]",
        JSON.stringify({
          source: url,
          finishReason,
          toolCallCount: yieldedToolCalls.length,
          toolNames: yieldedToolCalls.map((tc) => tc?.name || "unknown"),
        }),
      );
    }
    yield { finishReason, done: true };
  }

  private async sleepWithAbort(ms: number, signal?: AbortSignal): Promise<void> {
    if (!signal) {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return;
    }
    if (signal.aborted) {
      throw createAbortError();
    }
    await new Promise<void>((resolve, reject) => {
      const handle = setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, ms);
      const onAbort = () => {
        clearTimeout(handle);
        signal.removeEventListener("abort", onAbort);
        reject(createAbortError());
      };
      signal.addEventListener("abort", onAbort, { once: true });
    });
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

/**
 * Attempt to repair incomplete JSON from streaming tool call arguments.
 * Closes unclosed strings, arrays, and objects so JSON.parse can succeed
 * on partial data, allowing progressive draft artifact updates.
 */
function repairPartialJson(text: string): Record<string, unknown> {
  if (!text || text.trim().length === 0) return {};
  // Try complete parse first
  try {
    const parsed = JSON.parse(text);
    return toRecord(parsed) ?? {};
  } catch { /* expected for partial data */ }

  let attempt = text.trimEnd();
  // Strip trailing comma
  if (attempt.endsWith(",")) attempt = attempt.slice(0, -1);

  // Walk the string to find unclosed structures
  let inString = false;
  let escape = false;
  let braces = 0;
  let brackets = 0;
  for (let i = 0; i < attempt.length; i++) {
    const ch = attempt[i];
    if (escape) { escape = false; continue; }
    if (ch === "\\") { escape = true; continue; }
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === "{") braces++;
    else if (ch === "}") braces--;
    else if (ch === "[") brackets++;
    else if (ch === "]") brackets--;
  }

  // Close unclosed string
  if (inString) attempt += '"';
  // Strip any trailing comma after closing the string
  if (attempt.endsWith(",")) attempt = attempt.slice(0, -1);
  // Close open brackets then braces
  for (let i = 0; i < brackets; i++) attempt += "]";
  for (let i = 0; i < braces; i++) attempt += "}";

  try {
    const parsed = JSON.parse(attempt);
    return toRecord(parsed) ?? {};
  } catch {
    return {};
  }
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

function isAbortError(error: unknown): boolean {
  if (error instanceof Error && error.name === "AbortError") {
    return true;
  }
  return String(error || "").toLowerCase().includes("aborted");
}

function createAbortError(): Error {
  const err = new Error("Aborted");
  err.name = "AbortError";
  return err;
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
