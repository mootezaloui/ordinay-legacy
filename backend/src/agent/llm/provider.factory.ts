/**
 * Provider factory — resolves the ILLMProvider to use at runtime.
 *
 * Returns a dynamic proxy that re-reads the user's AI provider config
 * from the database on every generate/stream call. This means settings
 * changes take effect immediately without requiring a restart.
 */
import type { ILLMProvider, LLMGenerateParams, LLMResponse, LLMStreamChunk } from "./illm.provider";
import { createNativeLLMProvider } from "./native.provider";
import { createConfiguredLLMProvider } from "./configured.provider";
import { createAnthropicLLMProvider } from "./anthropic.provider";
import { createGeminiLLMProvider } from "./gemini.provider";
import { createOrdinayLLMProvider } from "./ordinay.provider";

interface ProviderConfigRow {
  provider_type: string;
  base_url: string;
  api_key: string;
  model: string;
}

function resolveCurrentProvider(): ILLMProvider {
  let config: ProviderConfigRow | null = null;
  try {
    const aiProviderService = require("../../../src/services/aiProvider.service");
    config = aiProviderService.getRawProviderConfig();
  } catch (error) {
    console.warn(
      "[PROVIDER_FACTORY] Failed to load aiProvider.service:",
      String(error),
    );
  }

  if (config && config.provider_type && config.model) {
    console.info(
      "[PROVIDER_FACTORY] Using configured provider",
      JSON.stringify({
        provider_type: config.provider_type,
        base_url: config.base_url,
        model: config.model,
        hasApiKey: Boolean(config.api_key),
      }),
    );

    if (config.provider_type === "anthropic") {
      return createAnthropicLLMProvider({
        api_key: config.api_key,
        model: config.model,
      });
    }

    if (config.provider_type === "gemini") {
      return createGeminiLLMProvider({
        api_key: config.api_key,
        model: config.model,
      });
    }

    if (config.provider_type === "ordinay") {
      return createOrdinayLLMProvider();
    }

    if (config.provider_type === "ollama") {
      return createNativeLLMProvider();
    }

    return createConfiguredLLMProvider(config);
  }

  console.info("[PROVIDER_FACTORY] No user config found, falling back to .env-based provider");
  return createNativeLLMProvider();
}

/**
 * Returns a proxy ILLMProvider that re-reads DB config on every call.
 * Settings changes take effect on the next agent request — no restart needed.
 */
export function resolveProvider(): ILLMProvider {
  return {
    generate(params: LLMGenerateParams): Promise<LLMResponse> {
      return resolveCurrentProvider().generate(params);
    },
    stream(params: LLMGenerateParams): AsyncIterable<LLMStreamChunk> {
      return resolveCurrentProvider().stream(params);
    },
    supportsTools(): boolean {
      return resolveCurrentProvider().supportsTools();
    },
  };
}
