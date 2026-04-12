"use strict";

const crypto = require("crypto");
const path = require("path");
const db = require("../db/connection");

// ── Encryption (AES-256-GCM) ──────────────────────────────

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey() {
  const configured = String(process.env.APP_SECRET || "").trim();
  if (configured) {
    return crypto.createHash("sha256").update(configured).digest();
  }

  const nodeEnv = String(process.env.NODE_ENV || "development").trim().toLowerCase();
  if (nodeEnv === "production") {
    throw new Error("APP_SECRET is required in production");
  }

  // Dev-only fallback: instance-scoped key to avoid shared static secret.
  const workspaceScopedFallback = `dev-fallback:${path.resolve(process.cwd())}`;
  return crypto.createHash("sha256").update(workspaceScopedFallback).digest();
}

function encrypt(plaintext) {
  if (!plaintext) return null;
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

function decrypt(ciphertext) {
  if (!ciphertext) return null;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 3) return null;
    const key = getEncryptionKey();
    const iv = Buffer.from(parts[0], "base64");
    const authTag = Buffer.from(parts[1], "base64");
    const encrypted = Buffer.from(parts[2], "base64");
    const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encrypted) + decipher.final("utf8");
  } catch {
    return null;
  }
}

// ── Settings (reuse existing app_settings table) ───────────

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
`;

function ensureSchema() {
  db.exec(TABLE_SQL);
}

function getSetting(key, fallback = null) {
  const row = db
    .prepare("SELECT value FROM app_settings WHERE key = @key")
    .get({ key });
  if (!row || row.value === null || row.value === undefined) return fallback;
  return row.value;
}

function setSetting(key, value) {
  db.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (@key, @value, CURRENT_TIMESTAMP)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`
  ).run({ key, value: value === undefined ? null : String(value) });
}

// ── Provider config ────────────────────────────────────────

const VALID_PROVIDER_TYPES = ["openai_compatible", "ollama", "custom", "anthropic", "gemini", "ordinay"];

const CONFIG_KEYS = [
  "ai_provider_type",
  "ai_provider_base_url",
  "ai_provider_api_key_encrypted",
  "ai_provider_model",
];

function normalizeBaseUrl(value) {
  return String(value || "").replace(/\/+$/, "");
}

function normalizeOpenAiCompatibleBase(value) {
  const normalized = normalizeBaseUrl(value);
  if (!normalized) return "";
  return normalized.endsWith("/v1") ? normalized : `${normalized}/v1`;
}

function resolveProviderPreset(baseUrl) {
  const normalized = String(baseUrl || "").trim().toLowerCase();
  if (!normalized) return "manual";
  if (normalized.includes("openrouter.ai")) return "openrouter";
  if (normalized.includes("groq.com")) return "groq";
  if (normalized.includes("openai.com")) return "openai";
  return "manual";
}

function deriveUiMetadata(config) {
  const providerType = String(config?.provider_type || "").trim();
  const preset = resolveProviderPreset(config?.base_url);

  if (providerType === "openai_compatible") {
    return {
      provider_display: "openai",
      provider_preset:
        preset === "openrouter" || preset === "groq" ? preset : "openai",
    };
  }

  if (providerType === "custom") {
    return {
      provider_display: "custom",
      provider_preset: preset,
    };
  }

  if (providerType === "ollama") {
    return {
      provider_display: "ollama",
      provider_preset: "manual",
    };
  }

  if (providerType === "anthropic") {
    return {
      provider_display: "anthropic",
      provider_preset: "manual",
    };
  }

  if (providerType === "gemini") {
    return {
      provider_display: "gemini",
      provider_preset: "manual",
    };
  }

  if (providerType === "ordinay") {
    return {
      provider_display: "ordinay",
      provider_preset: "managed",
    };
  }

  return {
    provider_display: "custom",
    provider_preset: "manual",
  };
}

function getNativeFallbackConfig() {
  const llmBaseUrl = process.env.LLM_BASE_URL || "http://127.0.0.1:11434";
  const llmModel = process.env.LLM_MODEL || "gpt-oss:120b-cloud";
  const llmApiKey = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY || "";
  const openAiBaseUrl =
    process.env.OPENAI_BASE_URL ||
    process.env.LLM_OPENAI_BASE_URL ||
    "https://api.openai.com";
  const openRouterApiKey =
    process.env.OPENROUTER_API_KEY || process.env.LLM_OPENROUTER_API_KEY || "";
  const openRouterModel = process.env.OPENROUTER_MODEL || "openai/gpt-oss-120b";
  const openRouterBaseUrl =
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const groqApiKey = process.env.GROQ_API_KEY || "";
  const groqModel = process.env.GROQ_MODEL || "openai/gpt-oss-120b";
  const groqBaseUrl = process.env.GROQ_BASE_URL || "https://api.groq.com/openai";

  if (String(llmApiKey).trim()) {
    return {
      provider_type: "openai_compatible",
      base_url: normalizeOpenAiCompatibleBase(openAiBaseUrl),
      api_key_masked: "****",
      model: llmModel,
      source: "native_fallback",
      persisted: false,
    };
  }

  // Native runtime tries Ollama before OpenRouter/Groq when no OpenAI key is present.
  if (String(llmBaseUrl).trim() && String(llmModel).trim()) {
    return {
      provider_type: "ollama",
      base_url: normalizeBaseUrl(llmBaseUrl),
      api_key_masked: "",
      model: llmModel,
      source: "native_fallback",
      persisted: false,
    };
  }

  if (String(openRouterApiKey).trim()) {
    return {
      provider_type: "openai_compatible",
      base_url: normalizeOpenAiCompatibleBase(openRouterBaseUrl),
      api_key_masked: "****",
      model: openRouterModel,
      source: "native_fallback",
      persisted: false,
    };
  }

  if (String(groqApiKey).trim()) {
    return {
      provider_type: "openai_compatible",
      base_url: normalizeOpenAiCompatibleBase(groqBaseUrl),
      api_key_masked: "****",
      model: groqModel,
      source: "native_fallback",
      persisted: false,
    };
  }

  return null;
}

function getProviderConfig() {
  const providerType = getSetting("ai_provider_type", null);
  if (!providerType) {
    const fallback = getNativeFallbackConfig();
    if (!fallback) {
      return { configured: false };
    }
    const uiMeta = deriveUiMetadata(fallback);
    return {
      configured: false,
      ...fallback,
      ...uiMeta,
    };
  }
  const providerConfig = {
    provider_type: providerType,
    base_url: getSetting("ai_provider_base_url", ""),
  };
  const uiMeta = deriveUiMetadata(providerConfig);
  return {
    configured: true,
    source: "database",
    persisted: true,
    provider_type: providerConfig.provider_type,
    base_url: providerConfig.base_url,
    api_key_masked: getSetting("ai_provider_api_key_encrypted", null)
      ? "****"
      : "",
    model: getSetting("ai_provider_model", ""),
    ...uiMeta,
  };
}

function getRawProviderConfig() {
  const providerType = getSetting("ai_provider_type", null);
  if (!providerType) {
    return null;
  }
  const encryptedKey = getSetting("ai_provider_api_key_encrypted", null);
  return {
    provider_type: providerType,
    base_url: getSetting("ai_provider_base_url", ""),
    api_key: encryptedKey ? decrypt(encryptedKey) : "",
    model: getSetting("ai_provider_model", ""),
  };
}

function saveProviderConfig({ provider_type, base_url, api_key, model }) {
  if (!provider_type || !VALID_PROVIDER_TYPES.includes(provider_type)) {
    throw new Error(
      `Invalid provider_type: ${provider_type}. Must be one of: ${VALID_PROVIDER_TYPES.join(", ")}`
    );
  }
  if (!model || !String(model).trim()) {
    throw new Error("model is required");
  }

  setSetting("ai_provider_type", String(provider_type).trim());
  setSetting("ai_provider_base_url", base_url ? String(base_url).trim() : "");
  setSetting("ai_provider_model", String(model).trim());

  // Only update the key if user actually changed it (not masked placeholder)
  if (api_key && api_key !== "****") {
    setSetting(
      "ai_provider_api_key_encrypted",
      encrypt(String(api_key).trim())
    );
  }
}

function clearProviderConfig() {
  CONFIG_KEYS.forEach((key) => {
    db.prepare("DELETE FROM app_settings WHERE key = @key").run({ key });
  });
}

// ── Agent token cache (Ordinay AI mode) ───────────────────

const AGENT_TOKEN_KEY = "ai_agent_token_encrypted";
const AGENT_TOKEN_EXPIRES_KEY = "ai_agent_token_expires_at";

function cacheAgentToken(token, expiresIn) {
  if (!token) return;
  setSetting(AGENT_TOKEN_KEY, encrypt(String(token)));
  const expiresAt = Date.now() + (Number(expiresIn) || 3600) * 1000;
  setSetting(AGENT_TOKEN_EXPIRES_KEY, String(expiresAt));
}

function getCachedAgentToken() {
  const encrypted = getSetting(AGENT_TOKEN_KEY, null);
  if (!encrypted) return null;
  const expiresAt = Number(getSetting(AGENT_TOKEN_EXPIRES_KEY, "0"));
  const token = decrypt(encrypted);
  if (!token) return null;
  return {
    token,
    expires_at: expiresAt,
    expired: Date.now() >= expiresAt,
    expires_in_ms: Math.max(0, expiresAt - Date.now()),
  };
}

function clearAgentToken() {
  db.prepare("DELETE FROM app_settings WHERE key = @key").run({ key: AGENT_TOKEN_KEY });
  db.prepare("DELETE FROM app_settings WHERE key = @key").run({ key: AGENT_TOKEN_EXPIRES_KEY });
}

ensureSchema();

module.exports = {
  getProviderConfig,
  getRawProviderConfig,
  saveProviderConfig,
  clearProviderConfig,
  cacheAgentToken,
  getCachedAgentToken,
  clearAgentToken,
  VALID_PROVIDER_TYPES,
};
