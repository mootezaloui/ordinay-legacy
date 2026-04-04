"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createGeminiLLMProvider = createGeminiLLMProvider;
function createGeminiLLMProvider(config) {
    return new GeminiLLMProvider(config);
}
class GeminiLLMProvider {
    config;
    constructor(config) {
        this.config = config;
    }
    getModel(systemInstruction, tools) {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        const genAI = new GoogleGenerativeAI(this.config.api_key);
        const modelParams = {
            model: this.config.model,
        };
        if (systemInstruction) {
            modelParams.systemInstruction = systemInstruction;
        }
        if (tools && tools.length > 0) {
            modelParams.tools = [{ functionDeclarations: tools }];
        }
        return genAI.getGenerativeModel(modelParams);
    }
    async generate(params) {
        if (params.signal?.aborted) {
            throw createAbortError();
        }
        const { system, contents } = convertMessages(params.messages);
        const tools = convertTools(params.tools);
        console.info("[GEMINI_LLM_GENERATE_START]", JSON.stringify({
            model: this.config.model,
            contentCount: contents.length,
            toolCount: tools.length,
            hasSystem: Boolean(system),
        }));
        try {
            const model = this.getModel(system, tools);
            const generationConfig = {};
            if (typeof params.maxTokens === "number") {
                generationConfig.maxOutputTokens = params.maxTokens;
            }
            if (typeof params.temperature === "number") {
                generationConfig.temperature = params.temperature;
            }
            const result = await model.generateContent({
                contents,
                generationConfig: Object.keys(generationConfig).length > 0
                    ? generationConfig
                    : undefined,
            });
            const response = result.response;
            return normalizeResponse(response);
        }
        catch (error) {
            if (isAbortError(error))
                throw error;
            console.warn("[GEMINI_LLM_GENERATE_ERROR]", String(error));
            return {
                text: "I cannot access the language model right now. Please try again.",
                toolCalls: [],
                finishReason: "error",
                raw: { source: "gemini", error: String(error) },
            };
        }
    }
    async *stream(params) {
        if (params.signal?.aborted)
            return;
        const { system, contents } = convertMessages(params.messages);
        const tools = convertTools(params.tools);
        try {
            const model = this.getModel(system, tools);
            const generationConfig = {};
            if (typeof params.maxTokens === "number") {
                generationConfig.maxOutputTokens = params.maxTokens;
            }
            if (typeof params.temperature === "number") {
                generationConfig.temperature = params.temperature;
            }
            const result = await model.generateContentStream({
                contents,
                generationConfig: Object.keys(generationConfig).length > 0
                    ? generationConfig
                    : undefined,
            });
            const collectedToolCalls = [];
            for await (const chunk of result.stream) {
                if (params.signal?.aborted)
                    return;
                const candidates = chunk.candidates || [];
                for (const candidate of candidates) {
                    const parts = candidate.content?.parts || [];
                    for (const part of parts) {
                        if (part.text) {
                            yield { deltaText: part.text };
                        }
                        if (part.functionCall) {
                            const tc = {
                                id: `tool_${Date.now()}_${collectedToolCalls.length}`,
                                name: part.functionCall.name || "",
                                arguments: typeof part.functionCall.args === "object" &&
                                    part.functionCall.args !== null
                                    ? part.functionCall.args
                                    : {},
                            };
                            collectedToolCalls.push(tc);
                        }
                    }
                }
            }
            // Emit tool calls at the end (Gemini delivers them in chunks)
            for (const tc of collectedToolCalls) {
                yield { toolCall: tc };
            }
            yield {
                finishReason: collectedToolCalls.length > 0 ? "tool_calls" : "stop",
                done: true,
            };
        }
        catch (error) {
            if (isAbortError(error))
                return;
            console.warn("[GEMINI_LLM_STREAM_ERROR]", String(error));
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
function convertMessages(messages) {
    const systemParts = [];
    const contents = [];
    for (const msg of messages) {
        if (msg.role === "system") {
            systemParts.push(msg.content);
            continue;
        }
        if (msg.role === "tool") {
            contents.push({
                role: "function",
                parts: [
                    {
                        functionResponse: {
                            name: msg.name || "tool_response",
                            response: parseJsonSafe(msg.content),
                        },
                    },
                ],
            });
            continue;
        }
        if (msg.role === "assistant" && msg.tool_calls && msg.tool_calls.length > 0) {
            const parts = [];
            if (msg.content) {
                parts.push({ text: msg.content });
            }
            for (const tc of msg.tool_calls) {
                parts.push({
                    functionCall: {
                        name: tc.function.name,
                        args: parseJsonSafe(tc.function.arguments),
                    },
                });
            }
            contents.push({ role: "model", parts });
            continue;
        }
        contents.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }],
        });
    }
    return { system: systemParts.join("\n\n"), contents };
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
        const parameters = (fn.parameters || {});
        return {
            name,
            description: String(fn.description || ""),
            parameters,
        };
    })
        .filter(Boolean);
}
// ── Response normalization ─────────────────────────────────
function normalizeResponse(response) {
    let text = "";
    const toolCalls = [];
    const candidates = response.candidates || [];
    for (const candidate of candidates) {
        const parts = candidate.content?.parts || [];
        for (const part of parts) {
            if (part.text) {
                text += part.text;
            }
            if (part.functionCall) {
                toolCalls.push({
                    id: `tool_${Date.now()}_${toolCalls.length}`,
                    name: part.functionCall.name || "",
                    arguments: typeof part.functionCall.args === "object" &&
                        part.functionCall.args !== null
                        ? part.functionCall.args
                        : {},
                });
            }
        }
    }
    return {
        text,
        toolCalls,
        finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
        raw: response,
    };
}
// ── Utilities ──────────────────────────────────────────────
function parseJsonSafe(value) {
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
        return value;
    }
    if (typeof value === "string") {
        try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null)
                return parsed;
        }
        catch {
            return { result: value };
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
