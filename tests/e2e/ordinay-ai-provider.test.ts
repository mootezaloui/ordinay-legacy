import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import net from "node:net";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AddressInfo } from "node:net";

const TEST_TIMEOUT_MS = 90_000;
const JWT_SECRET = "test-jwt-secret-for-tests";

const MOCK_COMPLETION_PAYLOAD = {
  id: "chatcmpl-test",
  object: "chat.completion",
  choices: [
    {
      index: 0,
      message: { role: "assistant", content: "Test response" },
      finish_reason: "stop",
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LAWYER_APP_ROOT = path.resolve(__dirname, "..", "..");
const PROJECT_ROOT = path.resolve(LAWYER_APP_ROOT, "..");
const PROXY_ROOT = path.join(LAWYER_APP_ROOT, "ordinay-proxy");
const BACKEND_ROOT = path.join(LAWYER_APP_ROOT, "backend");
const WEBSITE_ROOT = path.join(PROJECT_ROOT, "Ordinay_website");

const backendRequire = createRequire(path.join(BACKEND_ROOT, "package.json"));
const websiteRequire = createRequire(path.join(WEBSITE_ROOT, "package.json"));
const proxyRequire = createRequire(path.join(PROXY_ROOT, "package.json"));

const BetterSqlite3 = websiteRequire("better-sqlite3") as any;
const jwt = websiteRequire("jsonwebtoken") as {
  sign(payload: object, secret: string, options?: Record<string, unknown>): string;
};

let tempDir = "";
let licenseDbPath = "";
let backendDbPath = "";
let analyticsDbPath = "";

let llmServer: http.Server;
let llmBaseUrl = "";
let llmRequests: Array<Record<string, unknown>> = [];

let licenseServer: ChildProcessWithoutNullStreams;
let licenseServerOutput = "";
let licenseBaseUrl = "";
let licenseDb: any;

let proxyServer: http.Server;
let proxyBaseUrl = "";
let proxyRedis: {
  flushall(): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  disconnect?(): void;
};

let analyticsDb: any;
let aiProviderService: {
  saveProviderConfig(config: {
    provider_type: string;
    base_url: string;
    api_key: string;
    model: string;
  }): void;
  clearProviderConfig(): void;
  cacheAgentToken(token: string, expiresIn?: number): void;
  clearAgentToken(): void;
  getCachedAgentToken(): { token: string } | null;
};

describe.sequential("Ordinay AI Provider E2E Acceptance", () => {
  beforeAll(async () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ordinay-e2e-"));
    licenseDbPath = path.join(tempDir, "license.db");
    backendDbPath = path.join(tempDir, "backend.db");
    analyticsDbPath = path.join(tempDir, "analytics.db");

    const llm = await startMockLlmServer();
    llmServer = llm.server;
    llmBaseUrl = llm.baseUrl;
    llmRequests = llm.requests;

    const licensePort = await getAvailablePort();
    licenseBaseUrl = `http://127.0.0.1:${licensePort}`;
    licenseServer = startLicenseServer({
      port: licensePort,
      dbPath: licenseDbPath,
      jwtSecret: JWT_SECRET,
    });
    await waitForHttpOk(`${licenseBaseUrl}/api/health`, 20_000, () => licenseServer.exitCode !== null);
    licenseDb = new BetterSqlite3(licenseDbPath);

    process.env.JWT_SECRET = JWT_SECRET;
    process.env.LLM_BASE_URL = `${llmBaseUrl}/v1`;
    process.env.LLM_API_KEY = "mock-key";
    process.env.LLM_MODEL = "test-model";
    process.env.ANALYTICS_DB = analyticsDbPath;
    process.env.ORDINAY_PROXY_URL = "";
    process.env.DB_FILE = backendDbPath;
    process.env.APP_SECRET = "test-app-secret";

    const proxy = await startProxyServer();
    proxyServer = proxy.server;
    proxyBaseUrl = proxy.baseUrl;
    proxyRedis = proxy.redis;

    analyticsDb = new BetterSqlite3(analyticsDbPath);
    aiProviderService = backendRequire("./src/services/aiProvider.service.js");
  }, TEST_TIMEOUT_MS);

  beforeEach(async () => {
    llmRequests.length = 0;
    await proxyRedis.flushall();
    licenseDb.exec("DELETE FROM activations;");
    analyticsDb.exec("DELETE FROM analytics;");
    aiProviderService.clearProviderConfig();
    aiProviderService.clearAgentToken();
    process.env.ORDINAY_PROXY_URL = proxyBaseUrl;
  });

  afterAll(async () => {
    analyticsDb?.close();
    licenseDb?.close();
    if (proxyRedis?.disconnect) proxyRedis.disconnect();
    await closeHttpServer(proxyServer);
    await closeHttpServer(llmServer);
    await stopChildProcess(licenseServer);
    if (tempDir) {
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {
        // Proxy analytics keeps a SQLite handle open for process lifetime on Windows.
      }
    }
  }, TEST_TIMEOUT_MS);

  it("Test 1: Active monthly license -> agent responds", async () => {
    upsertActivation({
      deviceId: "test-device-1",
      plan: "monthly",
      status: "active",
      expiresAt: futureDate(10),
      licenseId: "license-test-1",
    });

    const tokenResponse = await requestAgentToken("test-device-1");
    expect(tokenResponse.status).toBe(200);
    expect(tokenResponse.body).toMatchObject({
      ok: true,
      expires_in: 3600,
    });
    expect(typeof tokenResponse.body.token).toBe("string");

    const completion = await requestProxyCompletion(tokenResponse.body.token, {
      messages: [{ role: "user", content: "Hello from acceptance test" }],
    });
    expect(completion.status).toBe(200);
    expect(completion.body.object).toBe("chat.completion");
    expect(completion.body.choices?.[0]?.message?.content).toBe("Test response");
  });

  it("Test 2: Expired license -> blocked", async () => {
    upsertActivation({
      deviceId: "test-device-2",
      plan: "monthly",
      status: "active",
      expiresAt: pastDate(1),
    });

    const tokenResponse = await requestAgentToken("test-device-2");
    expect(tokenResponse.status).toBe(403);
    expect(tokenResponse.body).toEqual({
      ok: false,
      error: "License expired or inactive",
    });
  });

  it("Test 3: Free/trial license -> no access", async () => {
    upsertActivation({
      deviceId: "test-device-3",
      plan: "free",
      status: "active",
      expiresAt: null,
    });

    const tokenResponse = await requestAgentToken("test-device-3");
    expect(tokenResponse.status).toBe(403);
    expect(tokenResponse.body).toEqual({
      ok: false,
      error: "Plan does not include Ordinay AI access",
    });
  });

  it("Test 4: Rate limit -> 429", async () => {
    upsertActivation({
      deviceId: "test-device-4",
      plan: "monthly",
      status: "active",
      expiresAt: futureDate(30),
    });

    const tokenResponse = await requestAgentToken("test-device-4");
    expect(tokenResponse.status).toBe(200);
    const token = tokenResponse.body.token as string;

    for (let i = 0; i < 20; i += 1) {
      const response = await requestProxyCompletion(token, {
        messages: [{ role: "user", content: `request ${i}` }],
      });
      expect(response.status).toBe(200);
    }

    const limited = await requestProxyCompletion(token, {
      messages: [{ role: "user", content: "request 21" }],
    });
    expect(limited.status).toBe(429);
    expect(limited.body.error).toBe("rate_limited");
    expect(typeof limited.body.retry_after).toBe("number");
    expect(limited.body.retry_after).toBeGreaterThan(0);
  });

  it("Test 5: Quota exceeded -> 402", async () => {
    const licenseId = "license-test-5";
    upsertActivation({
      deviceId: "test-device-5",
      plan: "monthly",
      status: "active",
      expiresAt: futureDate(30),
      licenseId,
    });

    const tokenResponse = await requestAgentToken("test-device-5");
    expect(tokenResponse.status).toBe(200);
    const token = tokenResponse.body.token as string;

    const month = currentYearMonth();
    const quotaKey = `quota:${hashId(licenseId)}:${month}`;
    await proxyRedis.set(quotaKey, "500000");

    const response = await requestProxyCompletion(token, {
      messages: [{ role: "user", content: "quota check" }],
    });

    expect(response.status).toBe(402);
    expect(response.body.error).toBe("monthly_quota_exceeded");
    expect(response.body.tokens_used).toBeGreaterThanOrEqual(500000);
    expect(response.body.tokens_limit).toBe(500000);
    expect(typeof response.body.reset_at).toBe("string");
  });

  it("Test 6: Proxy down -> graceful error", async () => {
    process.env.ORDINAY_PROXY_URL = "http://127.0.0.1:65535";
    aiProviderService.cacheAgentToken("test-token", 3600);

    const ordinayProvider = await importModule(
      path.join(BACKEND_ROOT, "src", "agent", "llm", "ordinay.provider.ts"),
    );
    const provider = ordinayProvider.createOrdinayLLMProvider();

    const result = await provider.generate({
      messages: [{ role: "user", content: "Can you respond?" }],
    });

    expect(result.finishReason).toBe("error");
    expect(result.text).toContain("Failed to connect to Ordinay AI");
  });

  it("Test 7: Token expiry -> 401", async () => {
    const expiringToken = jwt.sign(
      { lid: "license-test-7", did: hashId("test-device-7"), tier: "monthly" },
      JWT_SECRET,
      { algorithm: "HS256", expiresIn: 1 },
    );

    await sleep(2_000);

    const response = await requestProxyCompletion(expiringToken, {
      messages: [{ role: "user", content: "expired token request" }],
    });

    expect(response.status).toBe(401);
    expect(response.body).toMatchObject({ error: "token_expired" });
  });

  it("Test 8: Analytics -> no message content", async () => {
    const licenseId = "license-test-8";
    const sentinel = "CLIENT_NAME_SHOULD_NOT_APPEAR";
    upsertActivation({
      deviceId: "test-device-8",
      plan: "monthly",
      status: "active",
      expiresAt: futureDate(30),
      licenseId,
    });

    const tokenResponse = await requestAgentToken("test-device-8");
    expect(tokenResponse.status).toBe(200);

    const response = await requestProxyCompletion(tokenResponse.body.token as string, {
      messages: [{ role: "user", content: sentinel }],
      tools: [
        {
          type: "function",
          function: { name: "lookup_case", description: "Lookup", parameters: { type: "object" } },
        },
      ],
    });
    expect(response.status).toBe(200);

    const row = analyticsDb
      .prepare("SELECT * FROM analytics ORDER BY id DESC LIMIT 1")
      .get() as Record<string, unknown> | undefined;

    expect(row).toBeTruthy();
    expect(row?.license_hash).toBe(hashId(licenseId));
    expect(row?.tool_count).toBe(1);
    expect(row?.message_count).toBe(1);
    expect(row?.backend).toBe("primary");
    expect(Number(row?.latency_ms ?? -1)).toBeGreaterThanOrEqual(0);
    expect(JSON.stringify(row)).not.toContain(sentinel);
  });

  it("Test 9: BYOK mode unchanged", async () => {
    aiProviderService.saveProviderConfig({
      provider_type: "openai_compatible",
      base_url: `${llmBaseUrl}/v1`,
      api_key: "",
      model: "test-model",
    });
    aiProviderService.clearAgentToken();
    expect(aiProviderService.getCachedAgentToken()).toBeNull();

    const providerFactory = await importModule(
      path.join(BACKEND_ROOT, "src", "agent", "llm", "provider.factory.ts"),
    );
    const provider = providerFactory.resolveProvider();

    const result = await provider.generate({
      messages: [{ role: "user", content: "BYOK request" }],
    });

    expect(result.text).toBe("Test response");
    expect(result.text).not.toContain("Ordinay AI is not authenticated");
    expect(llmRequests.length).toBeGreaterThan(0);
  });

  it("Test 10: License revoked mid-session", async () => {
    upsertActivation({
      deviceId: "test-device-10",
      plan: "monthly",
      status: "active",
      expiresAt: futureDate(30),
      licenseId: "license-test-10",
    });

    const tokenResponse = await requestAgentToken("test-device-10");
    expect(tokenResponse.status).toBe(200);
    const token = tokenResponse.body.token as string;

    const firstCall = await requestProxyCompletion(token, {
      messages: [{ role: "user", content: "first call" }],
    });
    expect(firstCall.status).toBe(200);

    licenseDb
      .prepare("UPDATE activations SET status = ? WHERE device_id = ?")
      .run("inactive", "test-device-10");

    const stillValidUntilExpiry = await requestProxyCompletion(token, {
      messages: [{ role: "user", content: "token still valid before expiry" }],
    });
    expect(stillValidUntilExpiry.status).toBe(200);

    const refreshAttempt = await requestAgentToken("test-device-10");
    expect(refreshAttempt.status).toBe(403);
    expect(refreshAttempt.body).toEqual({
      ok: false,
      error: "License expired or inactive",
    });
  });
});

function upsertActivation(params: {
  deviceId: string;
  plan: string;
  status: string;
  expiresAt: string | null;
  licenseId?: string;
}) {
  const nowIso = new Date().toISOString();
  licenseDb
    .prepare(`
      INSERT INTO activations (
        device_id, plan, status, referral_code, pending_referral_code, referral_applied,
        referrer_device_id, payment_reference, license_id, activated_at, expires_at
      ) VALUES (?, ?, ?, NULL, NULL, 0, NULL, NULL, ?, ?, ?)
      ON CONFLICT(device_id) DO UPDATE SET
        plan = excluded.plan,
        status = excluded.status,
        referral_code = excluded.referral_code,
        pending_referral_code = excluded.pending_referral_code,
        referral_applied = excluded.referral_applied,
        referrer_device_id = excluded.referrer_device_id,
        payment_reference = excluded.payment_reference,
        license_id = excluded.license_id,
        activated_at = excluded.activated_at,
        expires_at = excluded.expires_at
    `)
    .run(params.deviceId, params.plan, params.status, params.licenseId ?? null, nowIso, params.expiresAt);
}

async function requestAgentToken(deviceId: string): Promise<{ status: number; body: any }> {
  return postJson(`${licenseBaseUrl}/api/agent-token`, { device_id: deviceId });
}

async function requestProxyCompletion(
  token: string,
  payload: Record<string, unknown>,
): Promise<{ status: number; body: any }> {
  return postJson(
    `${proxyBaseUrl}/v1/chat/completions`,
    {
      model: "ignored-by-proxy",
      stream: false,
      ...payload,
    },
    {
      Authorization: `Bearer ${token}`,
      "X-App-Version": "e2e-test",
    },
  );
}

async function postJson(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string> = {},
): Promise<{ status: number; body: any }> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
  const text = await response.text();
  let parsed: unknown = text;
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    parsed = text;
  }
  return { status: response.status, body: parsed };
}

async function startMockLlmServer(): Promise<{
  server: http.Server;
  baseUrl: string;
  requests: Array<Record<string, unknown>>;
}> {
  const requests: Array<Record<string, unknown>> = [];
  const server = http.createServer(async (req: IncomingMessage, res: ServerResponse) => {
    if (!req.url) {
      res.statusCode = 400;
      res.end("missing url");
      return;
    }

    if (req.method === "GET" && (req.url === "/v1/models" || req.url === "/models")) {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ object: "list", data: [{ id: "test-model", object: "model" }] }));
      return;
    }

    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const raw = await readRequestBody(req);
      try {
        requests.push(JSON.parse(raw || "{}") as Record<string, unknown>);
      } catch {
        requests.push({ parse_error: true, raw });
      }
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(MOCK_COMPLETION_PAYLOAD));
      return;
    }

    res.statusCode = 404;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ error: "not_found", path: req.url }));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    requests,
  };
}

function startLicenseServer(params: {
  port: number;
  dbPath: string;
  jwtSecret: string;
}): ChildProcessWithoutNullStreams {
  const child = spawn(process.execPath, ["--import", "tsx", "server/api.ts"], {
    cwd: WEBSITE_ROOT,
    env: {
      ...process.env,
      PORT: String(params.port),
      ORDINAY_DB_PATH: params.dbPath,
      ORDINAY_AGENT_JWT_SECRET: params.jwtSecret,
      NODE_ENV: "test",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout.on("data", (chunk: Buffer) => {
    licenseServerOutput += chunk.toString("utf8");
  });
  child.stderr.on("data", (chunk: Buffer) => {
    licenseServerOutput += chunk.toString("utf8");
  });

  return child;
}

async function startProxyServer(): Promise<{
  server: http.Server;
  baseUrl: string;
  redis: {
    flushall(): Promise<unknown>;
    set(key: string, value: string): Promise<unknown>;
    disconnect?(): void;
  };
}> {
  const express = proxyRequire("express") as any;
  const RedisMock = proxyRequire("ioredis-mock") as new () => {
    flushall(): Promise<unknown>;
    set(key: string, value: string): Promise<unknown>;
    disconnect?(): void;
  };

  const authModule = await importModule(path.join(PROXY_ROOT, "src", "middleware", "auth.ts"));
  const rateLimitModule = await importModule(
    path.join(PROXY_ROOT, "src", "middleware", "rateLimit.ts"),
  );
  const quotaModule = await importModule(path.join(PROXY_ROOT, "src", "middleware", "quota.ts"));
  const usageModule = await importModule(path.join(PROXY_ROOT, "src", "routes", "usage.ts"));
  const completionsRouter = (await importModule(
    path.join(PROXY_ROOT, "src", "routes", "completions.ts"),
  )).default;
  const healthRouter = (await importModule(path.join(PROXY_ROOT, "src", "routes", "health.ts"))).default;
  const usageRouter = usageModule.default;
  const analyticsStore = await importModule(path.join(PROXY_ROOT, "src", "analytics", "store.ts"));

  analyticsStore.initAnalyticsDb();

  const redis = new RedisMock();
  rateLimitModule.setRedisClient(redis);
  quotaModule.setRedisClient(redis);
  usageModule.setRedisClient(redis);

  const app = express();
  app.use(express.json({ limit: "2mb" }));
  app.use(healthRouter);
  app.use(authModule.authMiddleware);
  app.use(rateLimitModule.rateLimitMiddleware);
  app.use(quotaModule.quotaMiddleware);
  app.use(completionsRouter);
  app.use(usageRouter);

  const server = await new Promise<http.Server>((resolve, reject) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
    instance.once("error", reject);
  });
  const address = server.address() as AddressInfo;
  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}`,
    redis,
  };
}

async function importModule(absPath: string): Promise<any> {
  return import(pathToFileURL(absPath).href);
}

async function waitForHttpOk(
  url: string,
  timeoutMs: number,
  hasExited?: () => boolean,
): Promise<void> {
  const start = Date.now();
  let lastError = "";
  while (Date.now() - start < timeoutMs) {
    if (hasExited?.()) {
      throw new Error(`Process exited before health check became ready.\n${licenseServerOutput}`);
    }
    try {
      const response = await fetch(url);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = String(error);
    }
    await sleep(200);
  }
  throw new Error(`Timed out waiting for ${url}. Last error: ${lastError}\n${licenseServerOutput}`);
}

async function getAvailablePort(): Promise<number> {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function closeHttpServer(server?: http.Server): Promise<void> {
  if (!server) return;
  if (!server.listening) return;
  await new Promise<void>((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function stopChildProcess(child?: ChildProcessWithoutNullStreams): Promise<void> {
  if (!child) return;
  if (child.exitCode !== null) return;
  child.kill();
  await Promise.race([
    new Promise<void>((resolve) => child.once("exit", () => resolve())),
    sleep(3_000).then(() => {
      if (child.exitCode === null) child.kill("SIGKILL");
    }),
  ]);
}

async function readRequestBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function hashId(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
}

function futureDate(daysAhead: number): string {
  const dt = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return dt.toISOString().split("T")[0];
}

function pastDate(daysAgo: number): string {
  const dt = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
  return dt.toISOString().split("T")[0];
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}
