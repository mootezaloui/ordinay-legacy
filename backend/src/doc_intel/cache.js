"use strict";

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const db = require("../db/connection");

const TABLE_SQL = `
CREATE TABLE IF NOT EXISTS document_intel_cache (
  cache_key TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL,
  pipeline_version TEXT NOT NULL,
  options_signature TEXT NOT NULL,
  context_json TEXT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_document_intel_cache_hash ON document_intel_cache(content_hash);
CREATE INDEX IF NOT EXISTS idx_document_intel_cache_updated ON document_intel_cache(updated_at);
`;

let schemaReady = false;

function ensureSchema() {
  if (schemaReady) return;
  db.exec(TABLE_SQL);
  schemaReady = true;
}

function isSha256Hex(value) {
  return /^[a-f0-9]{64}$/i.test(String(value || ""));
}

function deriveContentHash(filePath) {
  const base = path.basename(String(filePath || ""));
  const token = base.split(".")[0];
  if (isSha256Hex(token)) return token.toLowerCase();
  const buffer = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function buildCacheKey(contentHash, pipelineVersion, optionsSignature) {
  return `${contentHash}:${pipelineVersion}:${optionsSignature}`;
}

function readCache({ contentHash, pipelineVersion, optionsSignature }) {
  ensureSchema();
  const cacheKey = buildCacheKey(contentHash, pipelineVersion, optionsSignature);
  const row = db
    .prepare(
      `SELECT context_json FROM document_intel_cache
       WHERE cache_key = @cache_key
       LIMIT 1`,
    )
    .get({ cache_key: cacheKey });
  if (!row || !row.context_json) return null;
  try {
    return JSON.parse(row.context_json);
  } catch {
    return null;
  }
}

function writeCache({ contentHash, pipelineVersion, optionsSignature, context }) {
  ensureSchema();
  const cacheKey = buildCacheKey(contentHash, pipelineVersion, optionsSignature);
  const payload = JSON.stringify(context || {});
  db.prepare(
    `INSERT INTO document_intel_cache (
      cache_key, content_hash, pipeline_version, options_signature, context_json, updated_at
     ) VALUES (
      @cache_key, @content_hash, @pipeline_version, @options_signature, @context_json, CURRENT_TIMESTAMP
     )
     ON CONFLICT(cache_key) DO UPDATE SET
       context_json = excluded.context_json,
       updated_at = CURRENT_TIMESTAMP`,
  ).run({
    cache_key: cacheKey,
    content_hash: contentHash,
    pipeline_version: pipelineVersion,
    options_signature: optionsSignature,
    context_json: payload,
  });
}

function deleteCache({ contentHash, pipelineVersion, optionsSignature }) {
  ensureSchema();
  const cacheKey = buildCacheKey(contentHash, pipelineVersion, optionsSignature);
  db.prepare("DELETE FROM document_intel_cache WHERE cache_key = @cache_key").run({
    cache_key: cacheKey,
  });
}

module.exports = {
  ensureSchema,
  deriveContentHash,
  readCache,
  writeCache,
  deleteCache,
};
