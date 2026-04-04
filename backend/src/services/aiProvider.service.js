"use strict";

const crypto = require("crypto");
const db = require("../db/connection");

// ── Encryption (AES-256-GCM) ──────────────────────────────

const ENCRYPTION_ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getEncryptionKey() {
  const secret = process.env.APP_SECRET || "ordinay-default-app-secret-key-32";
  return crypto.createHash("sha256").update(secret).digest();
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

const VALID_PROVIDER_TYPES = ["openai_compatible", "ollama", "custom", "anthropic", "gemini"];

const CONFIG_KEYS = [
  "ai_provider_type",
  "ai_provider_base_url",
  "ai_provider_api_key_encrypted",
  "ai_provider_model",
];

function getProviderConfig() {
  const providerType = getSetting("ai_provider_type", null);
  if (!providerType) {
    return { configured: false };
  }
  return {
    configured: true,
    provider_type: providerType,
    base_url: getSetting("ai_provider_base_url", ""),
    api_key_masked: getSetting("ai_provider_api_key_encrypted", null)
      ? "****"
      : "",
    model: getSetting("ai_provider_model", ""),
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

ensureSchema();

module.exports = {
  getProviderConfig,
  getRawProviderConfig,
  saveProviderConfig,
  clearProviderConfig,
  VALID_PROVIDER_TYPES,
};
