import Database from "better-sqlite3";
import { ANALYTICS_DB } from "../config";
import type { AnalyticsRow } from "../types";

let db: Database.Database | null = null;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS analytics (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp     TEXT NOT NULL,
  license_hash  TEXT NOT NULL,
  device_hash   TEXT NOT NULL,
  tier          TEXT NOT NULL,
  app_version   TEXT,
  tool_count    INTEGER DEFAULT 0,
  message_count INTEGER DEFAULT 0,
  has_tools     INTEGER DEFAULT 0,
  prompt_tokens INTEGER DEFAULT 0,
  compl_tokens  INTEGER DEFAULT 0,
  total_tokens  INTEGER DEFAULT 0,
  latency_ms    INTEGER DEFAULT 0,
  backend       TEXT,
  model         TEXT,
  finish_reason TEXT,
  is_error      INTEGER DEFAULT 0,
  error_type    TEXT
);
CREATE INDEX IF NOT EXISTS idx_analytics_license ON analytics(license_hash);
CREATE INDEX IF NOT EXISTS idx_analytics_timestamp ON analytics(timestamp);
`;

export function initAnalyticsDb(): void {
  db = new Database(ANALYTICS_DB);
  db.pragma("journal_mode = WAL");
  db.exec(SCHEMA);
  console.info("[ANALYTICS] Database initialized at", ANALYTICS_DB);
}

export function insertAnalytics(row: AnalyticsRow): void {
  if (!db) return;
  try {
    db.prepare(`
      INSERT INTO analytics (
        timestamp, license_hash, device_hash, tier, app_version,
        tool_count, message_count, has_tools,
        prompt_tokens, compl_tokens, total_tokens, latency_ms,
        backend, model, finish_reason, is_error, error_type
      ) VALUES (
        @timestamp, @license_hash, @device_hash, @tier, @app_version,
        @tool_count, @message_count, @has_tools,
        @prompt_tokens, @compl_tokens, @total_tokens, @latency_ms,
        @backend, @model, @finish_reason, @is_error, @error_type
      )
    `).run(row);
  } catch (err) {
    console.error("[ANALYTICS] Insert failed:", (err as Error).message);
  }
}

export function querySummary(days: number = 30): Record<string, unknown> {
  if (!db) return { error: "analytics db not initialized" };
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();

  const totals = db.prepare(`
    SELECT
      COUNT(*)              AS total_requests,
      SUM(total_tokens)     AS total_tokens,
      SUM(prompt_tokens)    AS total_prompt_tokens,
      SUM(compl_tokens)     AS total_completion_tokens,
      SUM(is_error)         AS total_errors,
      ROUND(AVG(latency_ms)) AS avg_latency_ms,
      COUNT(DISTINCT license_hash) AS unique_licenses,
      COUNT(DISTINCT device_hash)  AS unique_devices
    FROM analytics WHERE timestamp >= ?
  `).get(since) as Record<string, unknown>;

  const byTier = db.prepare(`
    SELECT
      tier,
      COUNT(*)          AS requests,
      SUM(total_tokens) AS tokens
    FROM analytics WHERE timestamp >= ?
    GROUP BY tier ORDER BY tokens DESC
  `).all(since);

  const byBackend = db.prepare(`
    SELECT
      backend,
      model,
      COUNT(*)              AS requests,
      SUM(total_tokens)     AS tokens,
      ROUND(AVG(latency_ms)) AS avg_latency_ms
    FROM analytics WHERE timestamp >= ?
    GROUP BY backend, model ORDER BY requests DESC
  `).all(since);

  const errorBreakdown = db.prepare(`
    SELECT
      error_type,
      COUNT(*) AS count
    FROM analytics WHERE timestamp >= ? AND is_error = 1
    GROUP BY error_type ORDER BY count DESC
  `).all(since);

  const dailyVolume = db.prepare(`
    SELECT
      DATE(timestamp) AS day,
      COUNT(*)        AS requests,
      SUM(total_tokens) AS tokens
    FROM analytics WHERE timestamp >= ?
    GROUP BY DATE(timestamp) ORDER BY day DESC
    LIMIT 30
  `).all(since);

  return {
    period_days: days,
    since,
    ...totals,
    by_tier: byTier,
    by_backend: byBackend,
    error_breakdown: errorBreakdown,
    daily_volume: dailyVolume,
  };
}

export function purgeOldRecords(retentionDays: number = 90): number {
  if (!db) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000).toISOString();
  const result = db.prepare("DELETE FROM analytics WHERE timestamp < ?").run(cutoff);
  return result.changes;
}
