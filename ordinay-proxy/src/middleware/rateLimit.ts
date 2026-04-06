import type { Request, Response, NextFunction } from "express";
import type { Redis } from "ioredis";
import { RATE_LIMIT_WINDOW_SEC, RATE_LIMIT_MAX_REQUESTS } from "../config";

let redis: Redis | null = null;

export function setRedisClient(client: Redis): void {
  redis = client;
}

export async function rateLimitMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!redis || !req.auth) {
    next();
    return;
  }

  const key = `rate:${req.auth.deviceHash}`;
  const now = Date.now();
  const windowMs = RATE_LIMIT_WINDOW_SEC * 1000;
  const windowStart = now - windowMs;

  try {
    const pipeline = redis.pipeline();
    pipeline.zremrangebyscore(key, 0, windowStart);
    pipeline.zadd(key, now.toString(), `${now}-${Math.random().toString(36).slice(2, 6)}`);
    pipeline.zcard(key);
    pipeline.expire(key, RATE_LIMIT_WINDOW_SEC + 1);
    const results = await pipeline.exec();

    const count = results?.[2]?.[1] as number ?? 0;

    if (count > RATE_LIMIT_MAX_REQUESTS) {
      const oldest = await redis.zrange(key, 0, 0, "WITHSCORES");
      const oldestTs = oldest.length >= 2 ? Number(oldest[1]) : now;
      const retryAfter = Math.ceil((oldestTs + windowMs - now) / 1000);

      res.setHeader("Retry-After", String(Math.max(1, retryAfter)));
      res.status(429).json({
        error: "rate_limited",
        message: "Too many requests — please slow down",
        retry_after: Math.max(1, retryAfter),
      });
      return;
    }

    next();
  } catch (err) {
    console.error("[RATE_LIMIT] Redis error, allowing request:", (err as Error).message);
    next();
  }
}
