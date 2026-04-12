import type { QuotaLimits } from "./types";
import crypto from "crypto";

function env(key: string, fallback: string): string {
  return process.env[key]?.trim() || fallback;
}

function requiredEnv(key: string): string {
  const value = process.env[key]?.trim();
  if (!value) {
    throw new Error(`[FATAL] Missing required environment variable: ${key}`);
  }
  return value;
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key]?.trim();
  return v ? parseInt(v, 10) : fallback;
}

// ── Server ────────────────────────────────────────────────

export const PORT = envInt("PORT", 3000);
export const HOST = env("HOST", "0.0.0.0");

// ── JWT ───────────────────────────────────────────────────

export const JWT_SECRET = requiredEnv("JWT_SECRET");

// ── Redis ─────────────────────────────────────────────────

export const REDIS_URL = env("REDIS_URL", "redis://localhost:6379");

// ── Rate Limiting ─────────────────────────────────────────

export const RATE_LIMIT_WINDOW_SEC = envInt("RATE_LIMIT_WINDOW_SEC", 60);
export const RATE_LIMIT_MAX_REQUESTS = envInt("RATE_LIMIT_MAX_REQUESTS", 20);

// ── Quotas (monthly tokens) ──────────────────────────────

export const QUOTA_LIMITS: QuotaLimits = {
  monthly: envInt("QUOTA_MONTHLY", 500_000),
  yearly: envInt("QUOTA_YEARLY", 1_000_000),
  perpetual: envInt("QUOTA_PERPETUAL", 2_000_000),
};

// ── LLM Backend (Primary / Default) ──────────────────────

export const LLM_BASE_URL = env("LLM_BASE_URL", "https://openrouter.ai/api/v1");
export const LLM_API_KEY = env("LLM_API_KEY", "");
export const LLM_MODEL = env("LLM_MODEL", "gpt-oss:120b-cloud");

// ── LLM Backend (Fast — simple requests, short context) ──

export const LLM_FAST_BASE_URL = env("LLM_FAST_BASE_URL", "");
export const LLM_FAST_API_KEY = env("LLM_FAST_API_KEY", "");
export const LLM_FAST_MODEL = env("LLM_FAST_MODEL", "");

// ── LLM Backend (Capable — complex requests, tool calls) ─

export const LLM_CAPABLE_BASE_URL = env("LLM_CAPABLE_BASE_URL", "");
export const LLM_CAPABLE_API_KEY = env("LLM_CAPABLE_API_KEY", "");
export const LLM_CAPABLE_MODEL = env("LLM_CAPABLE_MODEL", "");

// ── Routing Thresholds ───────────────────────────────────

export const ROUTE_COMPLEX_MSG_THRESHOLD = envInt("ROUTE_COMPLEX_MSG_THRESHOLD", 10);
export const ROUTE_COMPLEX_TOOL_THRESHOLD = envInt("ROUTE_COMPLEX_TOOL_THRESHOLD", 1);

// ── Analytics ─────────────────────────────────────────────

export const ANALYTICS_DB = env("ANALYTICS_DB", "./data/analytics.db");

// ── Helpers ───────────────────────────────────────────────

export function hashId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}
