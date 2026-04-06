"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProvider = resolveProvider;
const native_provider_1 = require("./native.provider");
const configured_provider_1 = require("./configured.provider");
const anthropic_provider_1 = require("./anthropic.provider");
const gemini_provider_1 = require("./gemini.provider");
const ordinay_provider_1 = require("./ordinay.provider");
function resolveCurrentProvider() {
    let config = null;
    try {
        const aiProviderService = require("../../services/aiProvider.service");
        config = aiProviderService.getRawProviderConfig();
    }
    catch (error) {
        console.warn("[PROVIDER_FACTORY] Failed to load aiProvider.service:", String(error));
    }
    if (config && config.provider_type && config.model) {
        console.info("[PROVIDER_FACTORY] Using configured provider", JSON.stringify({
            provider_type: config.provider_type,
            base_url: config.base_url,
            model: config.model,
            hasApiKey: Boolean(config.api_key),
        }));
        if (config.provider_type === "anthropic") {
            return (0, anthropic_provider_1.createAnthropicLLMProvider)({
                api_key: config.api_key,
                model: config.model,
            });
        }
        if (config.provider_type === "gemini") {
            return (0, gemini_provider_1.createGeminiLLMProvider)({
                api_key: config.api_key,
                model: config.model,
            });
        }
        if (config.provider_type === "ordinay") {
            return (0, ordinay_provider_1.createOrdinayLLMProvider)();
        }
        return (0, configured_provider_1.createConfiguredLLMProvider)(config);
    }
    console.info("[PROVIDER_FACTORY] No user config found, falling back to .env-based provider");
    return (0, native_provider_1.createNativeLLMProvider)();
}
/**
 * Returns a proxy ILLMProvider that re-reads DB config on every call.
 * Settings changes take effect on the next agent request — no restart needed.
 */
function resolveProvider() {
    return {
        generate(params) {
            return resolveCurrentProvider().generate(params);
        },
        stream(params) {
            return resolveCurrentProvider().stream(params);
        },
        supportsTools() {
            return resolveCurrentProvider().supportsTools();
        },
    };
}
