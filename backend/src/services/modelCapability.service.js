"use strict";

const crypto = require("crypto");
const ollamaService = require("./ollama.service");

const CACHE_TTL_MS = 5 * 60 * 1000;
const _capabilityCache = new Map();
const _ollamaLibraryToolsCache = new Map();

function nowIso() {
  return new Date().toISOString();
}

function normalizeBaseUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function normalizeOpenAiBase(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return "";
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function hashApiKey(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  return crypto.createHash("sha1").update(text).digest("hex");
}

function cacheKey(config) {
  const provider = String(config?.provider_type || "").trim().toLowerCase();
  const base = String(config?.base_url || "").trim().toLowerCase();
  const model = String(config?.model || "").trim().toLowerCase();
  const keyHash = hashApiKey(config?.api_key || "");
  return `${provider}|${base}|${model}|${keyHash}`;
}

function readCache(config) {
  const key = cacheKey(config);
  const entry = _capabilityCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    _capabilityCache.delete(key);
    return null;
  }
  return entry.value;
}

function writeCache(config, value) {
  _capabilityCache.set(cacheKey(config), { at: Date.now(), value });
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(String(text || ""));
  } catch {
    return null;
  }
}

function extractErrorMessage(text) {
  const fallback = String(text || "").trim();
  const parsed = parseJsonSafe(fallback);
  if (parsed?.error?.message) return String(parsed.error.message);
  if (typeof parsed?.error === "string") return parsed.error;
  if (parsed?.message) return String(parsed.message);
  return fallback;
}

function hasToolParamsFromMetadata(supportedParameters) {
  if (!Array.isArray(supportedParameters)) return false;
  const set = new Set(
    supportedParameters
      .map((v) => String(v || "").trim().toLowerCase())
      .filter(Boolean),
  );
  return set.has("tools") && set.has("tool_choice");
}

async function resolveFromOpenAiProbe(config) {
  const base = normalizeOpenAiBase(config.base_url);
  const model = String(config.model || "").trim();
  if (!base || !model) {
    return {
      supports_tools: false,
      source_of_truth: "openai_probe_invalid_config",
      checked_at: nowIso(),
      reason: "Missing base URL or model.",
    };
  }

  const headers = { "Content-Type": "application/json" };
  if (String(config.api_key || "").trim()) {
    headers.Authorization = `Bearer ${String(config.api_key).trim()}`;
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "ping" }],
      tools: [
        {
          type: "function",
          function: {
            name: "ping_tool",
            description: "Tool capability probe",
            parameters: { type: "object", properties: {}, required: [] },
          },
        },
      ],
      tool_choice: "auto",
      max_tokens: 1,
      temperature: 0,
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return {
      supports_tools: false,
      source_of_truth: "openai_probe_fetch_error",
      checked_at: nowIso(),
      reason: response?._fetchError?.message || "Probe request failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      supports_tools: false,
      source_of_truth: "openai_probe_http_error",
      checked_at: nowIso(),
      reason: extractErrorMessage(text) || `HTTP ${response.status}`,
    };
  }

  return {
    supports_tools: true,
    source_of_truth: "openai_probe_success",
    checked_at: nowIso(),
  };
}

async function resolveFromAnthropicProbe(config) {
  const model = String(config.model || "").trim();
  const apiKey = String(config.api_key || "").trim();
  if (!model || !apiKey) {
    return {
      supports_tools: false,
      source_of_truth: "anthropic_probe_invalid_config",
      checked_at: nowIso(),
      reason: "Missing model or API key.",
    };
  }

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "ping" }],
      tools: [
        {
          name: "ping_tool",
          description: "Tool capability probe",
          input_schema: { type: "object", properties: {}, required: [] },
        },
      ],
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return {
      supports_tools: false,
      source_of_truth: "anthropic_probe_fetch_error",
      checked_at: nowIso(),
      reason: response?._fetchError?.message || "Probe request failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      supports_tools: false,
      source_of_truth: "anthropic_probe_http_error",
      checked_at: nowIso(),
      reason: extractErrorMessage(text) || `HTTP ${response.status}`,
    };
  }

  return {
    supports_tools: true,
    source_of_truth: "anthropic_probe_success",
    checked_at: nowIso(),
  };
}

async function resolveFromGeminiProbe(config) {
  const model = String(config.model || "").trim();
  const apiKey = String(config.api_key || "").trim();
  if (!model || !apiKey) {
    return {
      supports_tools: false,
      source_of_truth: "gemini_probe_invalid_config",
      checked_at: nowIso(),
      reason: "Missing model or API key.",
    };
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: "ping" }] }],
      tools: [
        {
          functionDeclarations: [
            {
              name: "ping_tool",
              description: "Tool capability probe",
              parameters: { type: "OBJECT", properties: {} },
            },
          ],
        },
      ],
      generationConfig: { maxOutputTokens: 1, temperature: 0 },
    }),
    signal: AbortSignal.timeout(10000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return {
      supports_tools: false,
      source_of_truth: "gemini_probe_fetch_error",
      checked_at: nowIso(),
      reason: response?._fetchError?.message || "Probe request failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return {
      supports_tools: false,
      source_of_truth: "gemini_probe_http_error",
      checked_at: nowIso(),
      reason: extractErrorMessage(text) || `HTTP ${response.status}`,
    };
  }

  return {
    supports_tools: true,
    source_of_truth: "gemini_probe_success",
    checked_at: nowIso(),
  };
}

async function resolveFromOllamaShow(config) {
  const model = String(config.model || "").trim();
  const base = ollamaService.normalizeOllamaBaseUrl(
    config.base_url || "http://127.0.0.1:11434",
  );
  if (!model) {
    return {
      supports_tools: false,
      source_of_truth: "ollama_show_invalid_config",
      checked_at: nowIso(),
      reason: "Missing model.",
    };
  }

  const response = await fetch(`${base}/api/show`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model }),
    signal: AbortSignal.timeout(8000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return {
      supports_tools: false,
      source_of_truth: "ollama_show_fetch_error",
      checked_at: nowIso(),
      reason: response?._fetchError?.message || "Probe request failed",
    };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    // Cloud variants may not be present locally; fall back to Ollama library metadata.
    if (/-cloud$/i.test(model)) {
      const catalog = await ollamaService.getCatalogModels({
        query: model,
        limit: 200,
        installedModels: [],
      });
      const match = Array.isArray(catalog?.models)
        ? catalog.models.find((row) => String(row?.name || "").trim().toLowerCase() === model.toLowerCase())
        : null;
      const capabilities = Array.isArray(match?.capabilities)
        ? match.capabilities.map((c) => String(c || "").trim().toLowerCase())
        : [];
      if (capabilities.includes("tools")) {
        return {
          supports_tools: true,
          source_of_truth: "ollama_library_tags",
          checked_at: nowIso(),
        };
      }
    }
    return {
      supports_tools: false,
      source_of_truth: "ollama_show_http_error",
      checked_at: nowIso(),
      reason: extractErrorMessage(text) || `HTTP ${response.status}`,
    };
  }

  const payload = await response.json().catch(() => ({}));
  const capabilities = Array.isArray(payload?.capabilities)
    ? payload.capabilities.map((c) => String(c || "").trim().toLowerCase())
    : [];
  const supports = capabilities.includes("tools");
  if (!supports && /-cloud$/i.test(model)) {
    const catalog = await ollamaService.getCatalogModels({
      query: model,
      limit: 200,
      installedModels: [],
    });
    const match = Array.isArray(catalog?.models)
      ? catalog.models.find((row) => String(row?.name || "").trim().toLowerCase() === model.toLowerCase())
      : null;
    const libCaps = Array.isArray(match?.capabilities)
      ? match.capabilities.map((c) => String(c || "").trim().toLowerCase())
      : [];
    if (libCaps.includes("tools")) {
      return {
        supports_tools: true,
        source_of_truth: "ollama_library_tags",
        checked_at: nowIso(),
      };
    }
  }

  return {
    supports_tools: supports,
    source_of_truth: "ollama_api_show",
    checked_at: nowIso(),
    reason: supports ? undefined : "Model capabilities do not include tools.",
  };
}

async function resolveModelCapability(config, options = {}) {
  const normalizedConfig = {
    provider_type: String(config?.provider_type || "").trim(),
    base_url: String(config?.base_url || "").trim(),
    api_key: String(config?.api_key || "").trim(),
    model: String(config?.model || "").trim(),
  };

  const cached = readCache(normalizedConfig);
  if (cached) {
    return cached;
  }

  const provider = normalizedConfig.provider_type;
  let result;

  if (provider === "ollama") {
    result = await resolveFromOllamaShow(normalizedConfig);
  } else if (provider === "anthropic") {
    result = await resolveFromAnthropicProbe(normalizedConfig);
  } else if (provider === "gemini") {
    result = await resolveFromGeminiProbe(normalizedConfig);
  } else if (provider === "openai_compatible" || provider === "custom") {
    const metadataSupports = hasToolParamsFromMetadata(options?.supported_parameters);
    if (metadataSupports) {
      result = {
        supports_tools: true,
        source_of_truth: "provider_supported_parameters",
        checked_at: nowIso(),
      };
    } else {
      result = await resolveFromOpenAiProbe(normalizedConfig);
    }
  } else {
    result = {
      supports_tools: false,
      source_of_truth: "unsupported_provider",
      checked_at: nowIso(),
      reason: `Unsupported provider for tool capability check: ${provider}`,
    };
  }

  writeCache(normalizedConfig, result);
  return result;
}

async function fetchAnthropicModels(apiKey) {
  const response = await fetch("https://api.anthropic.com/v1/models", {
    method: "GET",
    headers: {
      "x-api-key": String(apiKey || "").trim(),
      "anthropic-version": "2023-06-01",
    },
    signal: AbortSignal.timeout(12000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return { ok: false, models: [], error: response?._fetchError?.message || "Anthropic model listing failed" };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, models: [], error: extractErrorMessage(text) || `Anthropic HTTP ${response.status}` };
  }

  const payload = await response.json().catch(() => ({}));
  const data = Array.isArray(payload?.data) ? payload.data : [];
  return {
    ok: true,
    models: data
      .map((row) => ({
        id: String(row?.id || row?.name || "").trim(),
        owned_by: "anthropic",
      }))
      .filter((row) => Boolean(row.id)),
  };
}

async function fetchGeminiModels(apiKey) {
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(String(apiKey || "").trim())}`;
  const response = await fetch(endpoint, {
    method: "GET",
    signal: AbortSignal.timeout(12000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return { ok: false, models: [], error: response?._fetchError?.message || "Gemini model listing failed" };
  }
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, models: [], error: extractErrorMessage(text) || `Gemini HTTP ${response.status}` };
  }

  const payload = await response.json().catch(() => ({}));
  const rows = Array.isArray(payload?.models) ? payload.models : [];
  return {
    ok: true,
    models: rows
      .map((row) => {
        const rawName = String(row?.name || "").trim();
        const id = rawName.startsWith("models/") ? rawName.slice("models/".length) : rawName;
        return {
          id,
          owned_by: "google",
          supported_parameters: Array.isArray(row?.supportedGenerationMethods)
            ? ["tools", "tool_choice"]
            : [],
        };
      })
      .filter((row) => Boolean(row.id)),
  };
}

async function fetchOpenAiCompatibleModels(config) {
  const base = normalizeOpenAiBase(config.base_url);
  if (!base) {
    return { ok: false, models: [], error: "base_url is required for this provider" };
  }

  const headers = {};
  if (String(config.api_key || "").trim()) {
    headers.Authorization = `Bearer ${String(config.api_key).trim()}`;
  }

  const response = await fetch(`${base}/models`, {
    method: "GET",
    headers,
    signal: AbortSignal.timeout(12000),
  }).catch((error) => ({ _fetchError: error }));

  if (!response || response._fetchError) {
    return { ok: false, models: [], error: response?._fetchError?.message || "Model listing failed" };
  }

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    return { ok: false, models: [], error: extractErrorMessage(text) || `Provider HTTP ${response.status}` };
  }

  const payload = await response.json().catch(() => ({}));
  const dataRows = Array.isArray(payload?.data) ? payload.data : [];
  return {
    ok: true,
    models: dataRows
      .map((row) => ({
        id: String(row?.id || row?.model || row?.name || "").trim(),
        owned_by: String(row?.owned_by || "").trim(),
        supported_parameters: Array.isArray(row?.supported_parameters) ? row.supported_parameters : undefined,
      }))
      .filter((row) => Boolean(row.id)),
  };
}

async function resolveToolCapableRows(config, rows) {
  const output = [];
  for (const row of rows) {
    const id = String(row?.id || "").trim();
    if (!id) continue;
    const capability = await resolveModelCapability(
      { ...config, model: id },
      { supported_parameters: row?.supported_parameters },
    );
    if (!capability.supports_tools) continue;
    output.push({
      id,
      owned_by: String(row?.owned_by || "").trim(),
      source: config.provider_type === "ollama" ? "local" : "cloud",
      supports_tools: true,
      capability_source: capability.source_of_truth,
      checked_at: capability.checked_at,
    });
  }
  return output;
}

async function listToolCapableModels(config) {
  const provider = String(config?.provider_type || "").trim();
  if (!provider) {
    return { ok: false, models: [], error: "provider_type is required" };
  }

  let listResult;
  if (provider === "ollama") {
    const base = ollamaService.normalizeOllamaBaseUrl(config.base_url || "http://127.0.0.1:11434");
    const local = await ollamaService.getModels(base);
    if (!local.ok) return { ok: false, models: [], error: local.error || "Failed to fetch Ollama models." };
    listResult = {
      ok: true,
      models: (Array.isArray(local.models) ? local.models : []).map((id) => ({ id: String(id || "").trim(), owned_by: "ollama" })),
    };
  } else if (provider === "anthropic") {
    listResult = await fetchAnthropicModels(config.api_key);
  } else if (provider === "gemini") {
    listResult = await fetchGeminiModels(config.api_key);
  } else if (provider === "openai_compatible" || provider === "custom") {
    listResult = await fetchOpenAiCompatibleModels(config);
  } else {
    return {
      ok: false,
      models: [],
      error: `Model listing is currently unsupported for provider: ${provider}`,
    };
  }

  if (!listResult.ok) {
    return { ok: false, models: [], error: listResult.error || "Failed to fetch model list." };
  }

  const filtered = await resolveToolCapableRows(config, listResult.models || []);
  const deduped = Array.from(
    filtered.reduce((acc, row) => {
      const key = row.id.toLowerCase();
      if (!acc.has(key)) acc.set(key, row);
      return acc;
    }, new Map()).values(),
  ).sort((a, b) => a.id.localeCompare(b.id));

  return { ok: true, models: deduped };
}

async function ensureModelSupportsTools(config) {
  const capability = await resolveModelCapability(config);
  return {
    ok: capability.supports_tools,
    capability,
    error: capability.supports_tools
      ? null
      : capability.reason || "Selected model does not support tool calling.",
  };
}

module.exports = {
  resolveModelCapability,
  listToolCapableModels,
  ensureModelSupportsTools,
  hasToolParamsFromMetadata,
};
