import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import os from "node:os";
import fs from "node:fs";
import crypto from "node:crypto";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";

const TEST_TIMEOUT_MS = 60_000;
const LAWYER_APP_ROOT = path.resolve(__dirname, "..", "..");
const PROXY_ROOT = path.join(LAWYER_APP_ROOT, "ordinay-proxy");

const proxyRequire = createRequire(path.join(PROXY_ROOT, "package.json"));
const express = proxyRequire("express") as typeof import("express");
const jwt = proxyRequire("jsonwebtoken") as {
  sign(payload: object, secret: string, options?: Record<string, unknown>): string;
};
const RedisMockCtor = proxyRequire("ioredis-mock") as new () => {
  flushall(): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  disconnect?(): void;
};

let proxyServer: http.Server;
let proxyBaseUrl = "";
let redis: InstanceType<typeof RedisMockCtor>;
let jwtSecret = "";
let adminKey = "";
let activeEnvSnapshot: Record<string, string | undefined> | null = null;

describe.sequential("Phase 5 Proxy Security", () => {
  beforeAll(async () => {
    jwtSecret = "phase5-jwt-secret";
    adminKey = "phase5-admin-key";

    activeEnvSnapshot = snapshotEnv([
      "JWT_SECRET",
      "ADMIN_API_KEY",
      "LLM_API_KEY",
      "RATE_LIMIT_MAX_REQUESTS",
      "RATE_LIMIT_WINDOW_SEC",
      "QUOTA_MONTHLY",
      "QUOTA_YEARLY",
      "QUOTA_PERPETUAL",
    ]);

    process.env.JWT_SECRET = jwtSecret;
    process.env.ADMIN_API_KEY = adminKey;
    process.env.LLM_API_KEY = "phase5-llm-key";
    process.env.RATE_LIMIT_MAX_REQUESTS = "2";
    process.env.RATE_LIMIT_WINDOW_SEC = "60";
    process.env.QUOTA_MONTHLY = "3";
    process.env.QUOTA_YEARLY = "3";
    process.env.QUOTA_PERPETUAL = "3";

    const authModule = await freshImport(path.join(PROXY_ROOT, "src", "middleware", "auth.ts"));
    const rateLimitModule = await freshImport(
      path.join(PROXY_ROOT, "src", "middleware", "rateLimit.ts"),
    );
    const quotaModule = await freshImport(path.join(PROXY_ROOT, "src", "middleware", "quota.ts"));
    const adminRouter = (await freshImport(path.join(PROXY_ROOT, "src", "routes", "admin.ts")))
      .default;

    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use(adminRouter);

    redis = new RedisMockCtor();
    rateLimitModule.setRedisClient(redis);
    quotaModule.setRedisClient(redis);

    app.use(authModule.authMiddleware);
    app.use(rateLimitModule.rateLimitMiddleware);
    app.use(quotaModule.quotaMiddleware);

    app.get("/v1/ping", (_req, res) => {
      res.json({ ok: true });
    });

    proxyServer = await new Promise<http.Server>((resolve, reject) => {
      const server = app.listen(0, "127.0.0.1", () => resolve(server));
      server.once("error", reject);
    });

    const addr = proxyServer.address() as AddressInfo;
    proxyBaseUrl = `http://127.0.0.1:${addr.port}`;
  }, TEST_TIMEOUT_MS);

  afterAll(async () => {
    if (proxyServer?.listening) {
      await new Promise<void>((resolve, reject) => {
        proxyServer.close((error) => (error ? reject(error) : resolve()));
      });
    }
    if (redis?.disconnect) {
      redis.disconnect();
    }
    restoreEnv(activeEnvSnapshot);
  });

  it("proxy fails to boot without JWT_SECRET", async () => {
    const env = {
      ...process.env,
      PORT: "0",
      HOST: "127.0.0.1",
      LLM_API_KEY: "phase5-llm-key",
      JWT_SECRET: "",
      REDIS_URL: "redis://127.0.0.1:63999",
    };
    const serverPath = path.join(PROXY_ROOT, "dist", "server.js");
    if (!fs.existsSync(serverPath)) {
      throw new Error(`Missing proxy build artifact: ${serverPath}`);
    }

    const child = spawn(process.execPath, [serverPath], {
      cwd: PROXY_ROOT,
      env,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk || "");
    });

    const exitCode = await waitForExit(child, 10_000);
    expect(exitCode).not.toBe(0);
    expect(stderr).toContain("JWT_SECRET");
  });

  it("admin endpoints reject query-string key and require header key", async () => {
    const queryOnly = await fetch(
      `${proxyBaseUrl}/admin/analytics/summary?days=7&api_key=${encodeURIComponent(adminKey)}`,
    );
    expect(queryOnly.status).toBe(403);

    const withHeader = await fetch(
      `${proxyBaseUrl}/admin/analytics/summary?days=7&api_key=${encodeURIComponent(adminKey)}`,
      {
        headers: {
          "x-admin-key": adminKey,
        },
      },
    );
    expect(withHeader.status).toBe(200);
  });

  it("JWT invalid signature is rejected", async () => {
    const badToken = jwt.sign(
      {
        lid: "phase5-license-invalid-signature",
        did: "phase5-device-invalid-signature",
        tier: "monthly",
      },
      "wrong-signing-secret",
      { algorithm: "HS256", expiresIn: 300 },
    );

    const response = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: {
        Authorization: `Bearer ${badToken}`,
      },
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("invalid_token");
  });

  it("expired JWT is rejected", async () => {
    const expiredToken = jwt.sign(
      {
        lid: "phase5-license-expired",
        did: "phase5-device-expired",
        tier: "monthly",
      },
      jwtSecret,
      { algorithm: "HS256", expiresIn: -5 },
    );

    const response = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: {
        Authorization: `Bearer ${expiredToken}`,
      },
    });
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toBe("token_expired");
  });

  it("rate limit and quota checks remain enforced", async () => {
    await redis.flushall();

    const rateLimitedToken = jwt.sign(
      {
        lid: "phase5-rate-license",
        did: "phase5-rate-device",
        tier: "monthly",
      },
      jwtSecret,
      { algorithm: "HS256", expiresIn: 600 },
    );

    const first = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: { Authorization: `Bearer ${rateLimitedToken}` },
    });
    const second = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: { Authorization: `Bearer ${rateLimitedToken}` },
    });
    const third = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: { Authorization: `Bearer ${rateLimitedToken}` },
    });
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(third.status).toBe(429);

    await redis.flushall();
    const quotaLicenseId = "phase5-quota-license";
    const monthKey = currentYearMonth();
    const quotaKey = `quota:${hashId(quotaLicenseId)}:${monthKey}`;
    await redis.set(quotaKey, "3");

    const quotaToken = jwt.sign(
      {
        lid: quotaLicenseId,
        did: "phase5-quota-device",
        tier: "monthly",
      },
      jwtSecret,
      { algorithm: "HS256", expiresIn: 600 },
    );

    const quotaResponse = await fetch(`${proxyBaseUrl}/v1/ping`, {
      headers: { Authorization: `Bearer ${quotaToken}` },
    });
    expect(quotaResponse.status).toBe(402);
    const quotaBody = await quotaResponse.json();
    expect(quotaBody.error).toBe("monthly_quota_exceeded");
  });
});

async function freshImport(absPath: string): Promise<any> {
  const href = pathToFileURL(absPath).href;
  return import(href);
}

function hashId(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function snapshotEnv(keys: string[]): Record<string, string | undefined> {
  const snapshot: Record<string, string | undefined> = {};
  for (const key of keys) {
    snapshot[key] = process.env[key];
  }
  return snapshot;
}

function restoreEnv(snapshot: Record<string, string | undefined> | null): void {
  if (!snapshot) return;
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

async function waitForExit(
  child: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<number | null> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
      reject(new Error("Timed out waiting for proxy process exit."));
    }, timeoutMs);

    child.once("exit", (code) => {
      clearTimeout(timer);
      resolve(code);
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });
}
