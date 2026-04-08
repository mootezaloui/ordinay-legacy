"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createConfiguredLLMProvider = createConfiguredLLMProvider;
const DEFAULT_CONFIGURED_MAX_TOKENS = 2048;
const CONFIGURED_MAX_OUTPUT_TOKENS = readOptionalPositiveInt(process.env.CONFIGURED_LLM_MAX_OUTPUT_TOKENS);
function createConfiguredLLMProvider(config) {
    return new ConfiguredLLMProvider(config);
}
class ConfiguredLLMProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    async generate(params) {
        if (params.signal?.aborted) {
            throw createAbortError();
        }
        const model = this.resolveModel(params);
        const url = this.buildCompletionUrl();
        const headers = this.buildHeaders();
        const body = toChatCompletionBody(model, params, this.resolveMaxTokens(params));
        console.info("[CONFIGURED_LLM_GENERATE_START]", JSON.stringify({
            provider_type: this.config.provider_type,
            model,
            url,
            messageCount: Array.isArray(params.messages)
                ? params.messages.length
                : 0,
            toolCount: Array.isArray(params.tools) ? params.tools.length : 0,
        }));
        let response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: params.signal,
        });
        if (!response.ok) {
            const errBody = await response.text().catch(() => "");
            const adjustedMaxTokens = deriveAffordableRetryMaxTokens(response.status, errBody, Number(body.max_tokens));
            if (adjustedMaxTokens) {
                const retryBody = { ...body, max_tokens: adjustedMaxTokens };
                console.info("[CONFIGURED_LLM_GENERATE_RETRY_LOWER_MAX_TOKENS]", JSON.stringify({
                    model,
                    previousMaxTokens: body.max_tokens,
                    retryMaxTokens: adjustedMaxTokens,
                }));
                response = await fetch(url, {
                    method: "POST",
                    headers,
                    body: JSON.stringify(retryBody),
                    signal: params.signal,
                });
                if (response.ok) {
                    const payload = (await response.json());
                    return normalizeChatCompletionResponse(payload);
                }
            }
            console.warn("[CONFIGURED_LLM_GENERATE_HTTP_ERROR]", JSON.stringify({
                status: response.status,
                body: errBody.slice(0, 300),
                model,
            }));
            const providerMessage = extractProviderErrorMessage(errBody).slice(0, 300);
            return {
                text: providerMessage
                    ? `Provider error (${response.status}): ${providerMessage}`
                    : "I cannot access the language model right now. Please try again.",
                toolCalls: [],
                finishReason: "error",
                raw: { source: "configured", status: response.status },
            };
        }
        const payload = (await response.json());
        return normalizeChatCompletionResponse(payload);
    }
    async *stream(params) {
        if (params.signal?.aborted) {
            return;
        }
        const model = this.resolveModel(params);
        const url = this.buildCompletionUrl();
        const headers = this.buildHeaders();
        const body = {
            ...toChatCompletionBody(model, params, this.resolveMaxTokens(params)),
            stream: true,
        };
        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(body),
            signal: params.signal,
        }).catch((err) => {
            if (isAbortError(err))
                return null;
            console.warn("[CONFIGURED_LLM_STREAM_FETCH_ERROR]", String(err));
            return null;
        });
        if (!response?.ok || !response.body) {
            if (response && !response.ok) {
                const errBody = await response.text().catch(() => "");
                console.warn("[CONFIGURED_LLM_STREAM_HTTP_ERROR]", JSON.stringify({
                    status: response.status,
                    body: errBody.slice(0, 500),
                    model,
                }));
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
        const toolFragments = new Map();
        let finishReason = "stop";
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
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
                    if (payload === "[DONE]")
                        continue;
                    let row = null;
                    try {
                        row = JSON.parse(payload);
                    }
                    catch {
                        row = null;
                    }
                    if (!row)
                        continue;
                    const choice = Array.isArray(row.choices)
                        ? toRecord(row.choices[0])
                        : null;
                    const delta = toRecord(choice?.delta);
                    if (!delta)
                        continue;
                    const content = asString(delta.content);
                    if (content && content.length > 0) {
                        yield { deltaText: content };
                    }
                    const toolCalls = Array.isArray(delta.tool_calls)
                        ? delta.tool_calls
                        : [];
                    for (const toolCallRow of toolCalls) {
                        const tc = toRecord(toolCallRow);
                        if (!tc)
                            continue;
                        const idx = Number(tc.index);
                        if (!Number.isFinite(idx))
                            continue;
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
                if (!part.startsWith("data:"))
                    continue;
                const payload = part.slice(5).trim();
                if (!payload || payload === "[DONE]")
                    continue;
                let row = null;
                try {
                    row = JSON.parse(payload);
                }
                catch {
                    row = null;
                }
                const choice = row && Array.isArray(row.choices) ? toRecord(row.choices[0]) : null;
                const stopReason = asString(choice?.finish_reason);
                if (stopReason)
                    finishReason = stopReason;
            }
        }
        // Emit completed tool calls
        for (const [, fragment] of Array.from(toolFragments.entries()).sort((a, b) => a[0] - b[0])) {
            const id = fragment.id ||
                `tool_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const name = fragment.name || "";
            if (!name)
                continue;
            const argumentsObj = parseArguments(fragment.argumentsText);
            yield { toolCall: { id, name, arguments: argumentsObj } };
        }
        yield { finishReason, done: true };
    }
    supportsTools() {
        return true;
    }
    resolveModel(params) {
        // Use user-configured model; ignore modelPreference metadata from old path
        return this.config.model;
    }
    buildCompletionUrl() {
        const base = String(this.config.base_url || "").replace(/\/+$/, "");
        if (this.config.provider_type === "ollama") {
            return `${base || "http://localhost:11434"}/v1/chat/completions`;
        }
        // openai_compatible and custom: base_url should include /v1 if needed
        return `${base}/chat/completions`;
    }
    buildHeaders() {
        const headers = {
            "Content-Type": "application/json",
        };
        if (this.config.api_key) {
            headers["Authorization"] = `Bearer ${this.config.api_key}`;
        }
        return headers;
    }
    resolveMaxTokens(params) {
        const requested = Number(params?.maxTokens);
        if (Number.isFinite(requested) && requested > 0) {
            return Math.floor(requested);
        }
        return CONFIGURED_MAX_OUTPUT_TOKENS || DEFAULT_CONFIGURED_MAX_TOKENS;
    }
}
// ── Shared utilities (mirrored from native.provider.ts) ────
function toChatCompletionBody(model, params, maxTokens) {
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
        temperature: typeof params.temperature === "number" ? params.temperature : 0.1,
        max_tokens: maxTokens,
        stream: false,
    };
}
function readOptionalPositiveInt(value) {
    if (!value)
        return undefined;
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0)
        return undefined;
    return Math.floor(parsed);
}
function deriveAffordableRetryMaxTokens(status, errorBody, requestedMaxTokens) {
    if (status !== 402)
        return null;
    const current = Number(requestedMaxTokens);
    if (!Number.isFinite(current) || current <= 128)
        return null;
    const text = extractProviderErrorMessage(errorBody);
    const affordMatch = text.match(/can only afford\s+(\d+)/i);
    if (!affordMatch)
        return null;
    const afford = Number(affordMatch[1]);
    if (!Number.isFinite(afford) || afford <= 0)
        return null;
    // Keep some headroom for provider accounting variance.
    const target = Math.max(128, Math.min(current - 1, afford - 64));
    return target > 0 && target < current ? target : null;
}
function extractProviderErrorMessage(errorBody) {
    const fallback = String(errorBody || "");
    try {
        const parsed = JSON.parse(fallback);
        const message = parsed?.error?.message;
        if (typeof message === "string" && message.trim().length > 0) {
            return message;
        }
        if (typeof parsed?.error === "string" && parsed.error.trim().length > 0) {
            return parsed.error;
        }
    }
    catch {
        // ignore and return fallback
    }
    return fallback;
}
function normalizeChatCompletionResponse(payload) {
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
function normalizeToolCalls(value) {
    if (!Array.isArray(value))
        return [];
    const output = [];
    for (let i = 0; i < value.length; i++) {
        const row = toRecord(value[i]);
        const fn = toRecord(row?.function);
        const id = asString(row?.id) ?? `tool_${Date.now()}_${i}`;
        const name = asString(fn?.name);
        if (!name)
            continue;
        output.push({ id, name, arguments: parseArguments(fn?.arguments) });
    }
    return output;
}
function parseArguments(value) {
    if (toRecord(value))
        return value;
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            return toRecord(parsed) ?? {};
        }
        catch {
            return {};
        }
    }
    return {};
}
function asString(value) {
    return typeof value === "string" ? value : null;
}
function toRecord(value) {
    if (typeof value !== "object" || value === null || Array.isArray(value))
        return null;
    return value;
}
function isAbortError(error) {
    if (error instanceof Error && error.name === "AbortError")
        return true;
    return String(error || "").toLowerCase().includes("aborted");
}
function createAbortError() {
    const err = new Error("Aborted");
    err.name = "AbortError";
    return err;
}
