"use strict";

const aiProviderService = require("../services/aiProvider.service");
const ollamaService = require("../services/ollama.service");

const DEFAULT_OLLAMA_BASE_URL = "http://127.0.0.1:11434";

function readBoolean(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

function resolveAutoStartBaseUrl(env, providerConfig) {
  const configuredBase = String(providerConfig?.base_url || "").trim();
  if (configuredBase) {
    return ollamaService.normalizeOllamaBaseUrl(configuredBase);
  }
  const envBase = String(env?.LLM_BASE_URL || "").trim();
  return ollamaService.normalizeOllamaBaseUrl(envBase || DEFAULT_OLLAMA_BASE_URL);
}

async function autoStartOllamaOnBoot({ logger = console, env = process.env } = {}) {
  const enabled = readBoolean(env.OLLAMA_AUTO_START_ON_BOOT, true);
  if (!enabled) {
    logger.log("[Ollama AutoStart] Disabled by OLLAMA_AUTO_START_ON_BOOT");
    return;
  }

  let providerConfig = null;
  try {
    providerConfig = aiProviderService.getProviderConfig();
  } catch (error) {
    logger.warn("[Ollama AutoStart] Unable to read provider config:", error?.message || String(error));
    return;
  }

  if (!providerConfig || providerConfig.provider_type !== "ollama") {
    logger.log("[Ollama AutoStart] Skipped (active provider is not ollama)");
    return;
  }

  const baseUrl = resolveAutoStartBaseUrl(env, providerConfig);
  if (!ollamaService.isLocalOllamaHost(baseUrl)) {
    logger.log(`[Ollama AutoStart] Skipped (non-local endpoint: ${baseUrl})`);
    return;
  }

  try {
    const runningProbe = await ollamaService.checkIfRunning(baseUrl);
    if (runningProbe.running) {
      logger.log("[Ollama AutoStart] Already running");
      return;
    }

    const installedProbe = ollamaService.checkIfInstalled();
    if (!installedProbe.installed) {
      logger.warn(
        "[Ollama AutoStart] Skipped (not installed):",
        installedProbe.error || "Ollama app was not detected on this machine",
      );
      return;
    }

    const startResult = ollamaService.tryStartOllama();
    if (!startResult.ok) {
      logger.warn("[Ollama AutoStart] Failed to launch:", startResult.error || "unknown error");
      return;
    }

    const readyResult = await ollamaService.waitUntilReady(baseUrl);
    if (!readyResult.ready) {
      logger.warn(
        `[Ollama AutoStart] Launch requested but not ready after ${readyResult.elapsed_ms}ms`,
      );
      return;
    }

    logger.log(`[Ollama AutoStart] Ready after ${readyResult.elapsed_ms}ms`);
  } catch (error) {
    logger.warn("[Ollama AutoStart] Unexpected error:", error?.message || String(error));
  }
}

module.exports = {
  autoStartOllamaOnBoot,
};

