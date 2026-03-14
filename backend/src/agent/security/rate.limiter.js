"use strict";

const DEFAULT_LIMIT = 30;
const DEFAULT_WINDOW_MS = 60_000;

function createRateLimiter(config = {}) {
  const limit = normalizePositiveInt(config.limit, DEFAULT_LIMIT);
  const windowMs = normalizePositiveInt(config.windowMs, DEFAULT_WINDOW_MS);
  const buckets = new Map();

  function check(rawKey) {
    const now = Date.now();
    cleanupExpiredBuckets(buckets, now);

    const key = normalizeKey(rawKey);
    const existing = buckets.get(key);
    if (!existing || existing.resetAt <= now) {
      const resetAt = now + windowMs;
      const bucket = { count: 1, resetAt };
      buckets.set(key, bucket);
      return {
        allowed: true,
        remaining: Math.max(0, limit - bucket.count),
        resetAt,
      };
    }

    existing.count += 1;
    const allowed = existing.count <= limit;
    return {
      allowed,
      remaining: allowed ? Math.max(0, limit - existing.count) : 0,
      resetAt: existing.resetAt,
    };
  }

  function stats() {
    return {
      buckets: buckets.size,
      limit,
      windowMs,
    };
  }

  return {
    check,
    stats,
    policy: { limit, windowMs },
  };
}

function resolveRateLimitKey({ userId, sessionId, ip } = {}) {
  const userKey = normalizeOptionalString(userId);
  if (userKey) return `user:${userKey}`;

  const sessionKey = normalizeOptionalString(sessionId);
  if (sessionKey) return `session:${sessionKey}`;

  const ipKey = normalizeOptionalString(ip);
  if (ipKey) return `ip:${ipKey}`;

  return "anonymous";
}

function cleanupExpiredBuckets(buckets, now) {
  for (const [key, bucket] of buckets.entries()) {
    if (!bucket || Number(bucket.resetAt) <= now) {
      buckets.delete(key);
    }
  }
}

function normalizeKey(value) {
  const text = normalizeOptionalString(value);
  return text || "anonymous";
}

function normalizeOptionalString(value) {
  return String(value ?? "").trim();
}

function normalizePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? fallback), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = {
  createRateLimiter,
  resolveRateLimitKey,
  DEFAULT_LIMIT,
  DEFAULT_WINDOW_MS,
};

