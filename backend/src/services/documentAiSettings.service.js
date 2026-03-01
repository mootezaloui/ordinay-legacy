"use strict";

const db = require("../db/connection");
const {
  DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  normalizeOutputFormatPreference,
} = require("../domain/documentFormatGovernance");

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_ai_audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER,
  provider TEXT NOT NULL,
  policy_mode TEXT NOT NULL,
  action TEXT NOT NULL,
  detail TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_ai_audit_document ON document_ai_audit_logs(document_id);
CREATE INDEX IF NOT EXISTS idx_document_ai_audit_created ON document_ai_audit_logs(created_at);
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

function parseBool(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const v = String(value).trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(v);
}

function parseIntSafe(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getDocumentAiPolicy() {
  const envEnabled = parseBool(process.env.DOCUMENT_AI_ENABLED, null);
  const dbEnabled = parseBool(getSetting("document_ai_enabled", null), false);
  const enabled = envEnabled === null ? dbEnabled : envEnabled;

  const provider =
    process.env.DOCUMENT_AI_PROVIDER ||
    getSetting("document_ai_provider", "local") ||
    "local";

  const redactionMode =
    process.env.DOCUMENT_AI_REDACTION_MODE ||
    getSetting("document_ai_redaction_mode", "none") ||
    "none";

  const retainArtifactsDays = parseIntSafe(
    process.env.DOCUMENT_AI_RETAIN_ARTIFACTS_DAYS || getSetting("document_ai_retain_artifacts_days", "30"),
    30
  );

  return {
    enabled: Boolean(enabled),
    provider: String(provider).trim().toLowerCase(),
    redactionMode: String(redactionMode).trim().toLowerCase(),
    retainArtifactsDays,
  };
}

function getDocumentAiSettings() {
  const policy = getDocumentAiPolicy();
  const rawPreference = getSetting(
    "document_output_format_preference",
    DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE,
  );
  const documentOutputFormatPreference =
    normalizeOutputFormatPreference(rawPreference) || DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
  return {
    document_ai_enabled: policy.enabled,
    document_ai_provider: policy.provider,
    document_ai_redaction_mode: policy.redactionMode,
    document_ai_retain_artifacts_days: policy.retainArtifactsDays,
    document_output_format_preference: documentOutputFormatPreference,
  };
}

function updateDocumentAiSettings(patch = {}) {
  if (Object.prototype.hasOwnProperty.call(patch, "document_ai_enabled")) {
    setSetting("document_ai_enabled", patch.document_ai_enabled ? "true" : "false");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "document_ai_provider")) {
    const value = String(patch.document_ai_provider || "local").trim().toLowerCase();
    setSetting("document_ai_provider", value || "local");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "document_ai_redaction_mode")) {
    const value = String(patch.document_ai_redaction_mode || "none").trim().toLowerCase();
    setSetting("document_ai_redaction_mode", value || "none");
  }
  if (Object.prototype.hasOwnProperty.call(patch, "document_ai_retain_artifacts_days")) {
    const parsed = Number.parseInt(String(patch.document_ai_retain_artifacts_days || "30"), 10);
    const clamped = Number.isFinite(parsed) ? Math.max(1, Math.min(3650, parsed)) : 30;
    setSetting("document_ai_retain_artifacts_days", String(clamped));
  }
  if (Object.prototype.hasOwnProperty.call(patch, "document_output_format_preference")) {
    const value =
      normalizeOutputFormatPreference(patch.document_output_format_preference) ||
      DEFAULT_DOCUMENT_OUTPUT_FORMAT_PREFERENCE;
    setSetting("document_output_format_preference", value);
  }
  return getDocumentAiSettings();
}

function listDocumentAiAuditLogs({ limit = 100 } = {}) {
  const safeLimit = Math.max(1, Math.min(500, Number.parseInt(String(limit || "100"), 10) || 100));
  return db
    .prepare(
      `SELECT id, document_id, provider, policy_mode, action, detail, created_at
       FROM document_ai_audit_logs
       ORDER BY id DESC
       LIMIT @limit`
    )
    .all({ limit: safeLimit });
}

function logDocumentAiEvent({ documentId = null, provider = "local", policyMode = "local-only", action, detail = null }) {
  try {
    db.prepare(
      `INSERT INTO document_ai_audit_logs (document_id, provider, policy_mode, action, detail)
       VALUES (@document_id, @provider, @policy_mode, @action, @detail)`
    ).run({
      document_id: documentId,
      provider,
      policy_mode: policyMode,
      action,
      detail: detail ? String(detail).slice(0, 2000) : null,
    });
  } catch (error) {
    console.warn("[DocumentAI] Failed to write audit log:", error.message);
  }
}

ensureSchema();

module.exports = {
  ensureSchema,
  getSetting,
  setSetting,
  getDocumentAiPolicy,
  getDocumentAiSettings,
  updateDocumentAiSettings,
  listDocumentAiAuditLogs,
  logDocumentAiEvent,
};
