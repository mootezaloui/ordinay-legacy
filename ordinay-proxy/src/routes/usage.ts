import { Router } from "express";
import type { Request, Response } from "express";
import type { Redis } from "ioredis";
import { QUOTA_LIMITS } from "../config";

let redis: Redis | null = null;

export function setRedisClient(client: Redis): void {
  redis = client;
}

const router = Router();

router.get("/v1/usage", async (req: Request, res: Response) => {
  const auth = req.auth!;
  const limit = QUOTA_LIMITS[auth.tier] ?? 0;

  if (!redis) {
    res.json({ tokens_used: 0, tokens_limit: limit, reset_at: getResetDate() });
    return;
  }

  const key = getMonthKey(auth.licenseHash);
  try {
    const used = parseInt(await redis.get(key) ?? "0", 10);
    res.json({
      tokens_used: used,
      tokens_limit: limit,
      reset_at: getResetDate(),
    });
  } catch (err) {
    console.error("[USAGE] Redis error:", (err as Error).message);
    res.json({ tokens_used: 0, tokens_limit: limit, reset_at: getResetDate() });
  }
});

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

export default router;
