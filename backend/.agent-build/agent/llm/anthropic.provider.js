"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnthropicLLMProvider = createAnthropicLLMProvider;
function createAnthropicLLMProvider(config) {
    return new AnthropicLLMProvider(config);
}
class AnthropicLLMProvider {
    config;
    client = null;
    constructor(config) {
        this.config = config;
    }
    getClient() {
        if (!this.client) {
            // Dynamic require to keep the import lazy
            const AnthropicModule = require("@anthropic-ai/sdk");
            const AnthropicClass = AnthropicModule.default || AnthropicModule;
            this.client = new AnthropicClass({ apiKey: this.config.api_key });
        }
        return this.client;
    }
    async generate(params) {
        if (params.signal?.aborted) {
            throw createAbortError();
        }
        const { system, messages } = splitSystemMessages(params.messages);
        const tools = convertTools(params.tools);
        console.info("[ANTHROPIC_LLM_GENERATE_START]", JSON.stringify({
            model: this.config.model,
            messageCount: messages.length,
            toolCount: tools.length,
            hasSystem: system.length > 0,
        }));
        try {
            const requestParams = {
                model: this.config.model,
                max_tokens: typeof params.maxTokens === "number" ? params.maxTokens : 4096,
                messages,
                ...(system.length > 0 ? { system } : {}),
                ...(tools.length > 0 ? { tools } : {}),
                ...(typeof params.temperature === "number"
                    ? { temperature: params.temperature }
                    : {}),
            };
            const response = await this.getClient().messages.create(requestParams);
            return normalizeResponse(response);
        }
        catch (error) {
            if (isAbortError(error))
                throw error;
            console.warn("[ANTHROPIC_LLM_GENERATE_ERROR]", String(error));
            return {
                text: "I cannot access the language model right now. Please try again.",
                toolCalls: [],
                finishReason: "error",
                raw: { source: "anthropic", error: String(error) },
            };
        }
    }
    async *stream(params) {
        if (params.signal?.aborted)
            return;
        const { system, messages } = splitSystemMessages(params.messages);
        const tools = convertTools(params.tools);
        try {
            const requestParams = {
                model: this.config.model,
                max_tokens: typeof params.maxTokens === "number" ? params.maxTokens : 4096,
                messages,
                ...(system.length > 0 ? { system } : {}),
                ...(tools.length > 0 ? { tools } : {}),
                ...(typeof params.temperature === "number"
                    ? { temperature: params.temperature }
                    : {}),
            };
            const stream = this.getClient().messages.stream(requestParams);
            const toolAccumulator = new Map();
            let toolBlockIndex = -1;
            for await (const event of stream) {
                if (params.signal?.aborted)
                    return;
                if (event.type === "content_block_start") {
                    if (event.content_block?.type === "tool_use") {
                        toolBlockIndex++;
                        toolAccumulator.set(toolBlockIndex, {
                            id: event.content_block.id || `tool_${Date.now()}_${toolBlockIndex}`,
                            name: event.content_block.name || "",
                            inputJson: "",
                        });
                    }
                }
                else if (event.type === "content_block_delta") {
                    const delta = event.delta;
                    if (delta?.type === "text_delta" && delta.text) {
                        yield { deltaText: delta.text };
                    }
                    else if (delta?.type === "input_json_delta" && delta.partial_json) {
                        const current = toolAccumulator.get(toolBlockIndex);
                        if (current) {
                            current.inputJson += delta.partial_json;
                        }
                    }
                }
                else if (event.type === "message_delta") {
                    // end of message
                }
            }
            // Emit completed tool calls
            for (const [, fragment] of Array.from(toolAccumulator.entries()).sort((a, b) => a[0] - b[0])) {
                if (!fragment.name)
                    continue;
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
        }
        catch (error) {
            if (isAbortError(error))
                return;
            console.warn("[ANTHROPIC_LLM_STREAM_ERROR]", String(error));
            // Fallback to non-streaming
            const fallback = await this.generate(params);
            if (fallback.text)
                yield { deltaText: fallback.text };
            for (const tc of fallback.toolCalls || [])
                yield { toolCall: tc };
            yield { finishReason: fallback.finishReason, done: true };
        }
    }
    supportsTools() {
        return true;
    }
}
// ── Message conversion ─────────────────────────────────────
function splitSystemMessages(messages) {
    const systemParts = [];
    const converted = [];
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
            const content = [];
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
function convertTools(tools) {
    if (!Array.isArray(tools) || tools.length === 0)
        return [];
    return tools
        .map((tool) => {
        const fn = tool.type === "function" && typeof tool.function === "object"
            ? tool.function
            : tool;
        const name = String(fn.name || "").trim();
        if (!name)
            return null;
        return {
            name,
            description: String(fn.description || ""),
            input_schema: (fn.parameters || { type: "object", properties: {} }),
        };
    })
        .filter(Boolean);
}
// ── Response normalization ─────────────────────────────────
function normalizeResponse(response) {
    let text = "";
    const toolCalls = [];
    for (const block of response.content || []) {
        if (block.type === "text") {
            text += block.text || "";
        }
        else if (block.type === "tool_use") {
            toolCalls.push({
                id: block.id || `tool_${Date.now()}_${toolCalls.length}`,
                name: block.name || "",
                arguments: typeof block.input === "object" && block.input !== null
                    ? block.input
                    : {},
            });
        }
    }
    return {
        text,
        toolCalls,
        finishReason: response.stop_reason === "tool_use"
            ? "tool_calls"
            : response.stop_reason || "stop",
        raw: response,
    };
}
// ── Utilities ──────────────────────────────────────────────
function parseJson(value) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                return parsed;
            }
        }
        catch {
            // ignore
        }
    }
    return {};
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
