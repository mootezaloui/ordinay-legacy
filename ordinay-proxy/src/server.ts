import express from "express";
import Redis from "ioredis";
import { PORT, HOST, REDIS_URL, LLM_API_KEY } from "./config";
import { authMiddleware } from "./middleware/auth";
import { rateLimitMiddleware, setRedisClient as setRateLimitRedis } from "./middleware/rateLimit";
import { quotaMiddleware, setRedisClient as setQuotaRedis } from "./middleware/quota";
import { setRedisClient as setUsageRedis } from "./routes/usage";
import { initAnalyticsDb } from "./analytics/store";
import completionsRouter from "./routes/completions";
import healthRouter from "./routes/health";
import usageRouter from "./routes/usage";
import adminRouter from "./routes/admin";

// ── Startup checks ───────────────────────────────────────

if (!LLM_API_KEY) {
  console.error("[FATAL] LLM_API_KEY environment variable is required");
  process.exit(1);
}

// ── Redis ─────────────────────────────────────────────────

const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => Math.min(times * 200, 3000),
  lazyConnect: true,
});

redis.on("connect", () => console.info("[REDIS] Connected"));
redis.on("error", (err) => console.error("[REDIS] Error:", err.message));

setRateLimitRedis(redis);
setQuotaRedis(redis);
setUsageRedis(redis);

// ── Analytics DB ──────────────────────────────────────────

initAnalyticsDb();

// ── Express ───────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "2mb" }));

// Public routes (no JWT auth)
app.use(healthRouter);
app.use(adminRouter);

// All other routes require auth + rate limit + quota
app.use(authMiddleware);
app.use(rateLimitMiddleware);
app.use(quotaMiddleware);
app.use(completionsRouter);
app.use(usageRouter);

// ── Start ─────────────────────────────────────────────────

async function start(): Promise<void> {
  try {
    await redis.connect();
  } catch (err) {
    console.warn("[REDIS] Initial connection failed, will retry:", (err as Error).message);
  }

  app.listen(PORT, HOST, () => {
    console.info(`[PROXY] Ordinay AI Proxy running on ${HOST}:${PORT}`);
  });
}

start().catch((err) => {
  console.error("[FATAL]", err);
  process.exit(1);
});
