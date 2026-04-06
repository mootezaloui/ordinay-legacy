import type { Request, Response, NextFunction } from "express";
import type { Redis } from "ioredis";
import { QUOTA_LIMITS } from "../config";

let redis: Redis | null = null;

export function setRedisClient(client: Redis): void {
  redis = client;
}

function getMonthKey(licenseHash: string): string {
  const now = new Date();
  const ym = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `quota:${licenseHash}:${ym}`;
}

function getResetDate(): string {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  return next.toISOString().split("T")[0];
}

export async function quotaMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!redis || !req.auth) {
    next();
    return;
  }

  const { licenseHash, tier } = req.auth;
  const limit = QUOTA_LIMITS[tier] ?? 0;
  if (limit <= 0) {
    res.status(403).json({ error: "no_quota", message: "License tier has no Ordinay AI access" });
    return;
  }

  const key = getMonthKey(licenseHash);

  try {
    const used = parseInt(await redis.get(key) ?? "0", 10);

    if (used >= limit) {
      res.status(402).json({
        error: "monthly_quota_exceeded",
        message: "Monthly AI quota reached",
        tokens_used: used,
        tokens_limit: limit,
        reset_at: getResetDate(),
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[QUOTA] Redis error, allowing request:", (err as Error).message);
    next();
  }
}

export async function recordTokenUsage(
  licenseHash: string,
  tokens: number,
): Promise<void> {
  if (!redis || tokens <= 0) return;
  const key = getMonthKey(licenseHash);
  try {
    await redis.incrby(key, tokens);
    // Expire the key after 35 days (covers the full month + buffer)
    await redis.expire(key, 35 * 24 * 3600);
  } catch (err) {
    console.error("[QUOTA] Failed to record usage:", (err as Error).message);
  }
}
