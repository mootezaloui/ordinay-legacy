"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveProvider = resolveProvider;
const native_provider_1 = require("./native.provider");
const configured_provider_1 = require("./configured.provider");
const anthropic_provider_1 = require("./anthropic.provider");
const gemini_provider_1 = require("./gemini.provider");
function resolveProvider() {
    let config = null;
    try {
        // Dynamic require — aiProvider.service.js is a JS module in the services layer.
        // This avoids a compile-time dependency from the TS agent module to the JS service layer.
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
        return (0, configured_provider_1.createConfiguredLLMProvider)(config);
    }
    console.info("[PROVIDER_FACTORY] No user config found, falling back to .env-based provider");
    return (0, native_provider_1.createNativeLLMProvider)();
}
