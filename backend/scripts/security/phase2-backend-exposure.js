"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const path = require("node:path");

const PORT = Number.parseInt(process.env.PHASE2_TEST_PORT || "3320", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_BASE = `${BASE_URL}/api`;
const BACKEND_TOKEN = "phase2-backend-token";
const STREAM_SECRET = "phase2-stream-secret";

function createStreamToken(sessionId, issuedAtSec = Math.floor(Date.now() / 1000)) {
  const signature = crypto
    .createHmac("sha256", STREAM_SECRET)
    .update(`${sessionId}:${issuedAtSec}`)
    .digest("base64url");
  return `v1.${issuedAtSec}.${signature}`;
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(timeoutMs = 12000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${API_BASE}/ping`, {
        headers: { "X-Ordinay-Backend-Token": BACKEND_TOKEN },
      });
      if (res.status !== 500) {
        return;
      }
    } catch {
      // ignore until server is ready
    }
    await wait(250);
  }
  throw new Error("Phase 2 test server did not start in time.");
}

async function request(pathname, options = {}) {
  const response = await fetch(`${API_BASE}${pathname}`, options);
  const text = await response.text();
  return { response, text };
}

async function run() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const serverPath = path.join(repoRoot, "backend", "src", "server.js");
  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "test",
    FEATURE_AGENT_V2_STREAM: "true",
    AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND: "true",
    BACKEND_API_TOKEN: BACKEND_TOKEN,
    CORS_ALLOWED_ORIGINS: "https://allowed.example",
    SENSITIVE_RATE_LIMIT_ENABLED: "true",
    SENSITIVE_RATE_LIMIT_REQUESTS: "2",
    SENSITIVE_RATE_LIMIT_WINDOW_MS: "60000",
    AGENT_STREAM_AUTH_REQUIRED: "true",
    AGENT_STREAM_AUTH_SECRET: STREAM_SECRET,
    AGENT_STREAM_AUTH_TTL_SECONDS: "300",
  };

  const server = spawn(process.execPath, [serverPath], {
    cwd: repoRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  let stderr = "";
  server.stderr.on("data", (chunk) => {
    stderr += String(chunk || "");
  });

  try {
    await waitForServerReady();

    const unauthorizedClients = await request("/clients");
    assert.equal(
      unauthorizedClients.response.status,
      401,
      `Expected 401 for unauthorized /clients, got ${unauthorizedClients.response.status}`,
    );

    const authorizedClients = await request("/clients", {
      headers: { "X-Ordinay-Backend-Token": BACKEND_TOKEN },
    });
    assert.equal(
      authorizedClients.response.status,
      200,
      `Expected 200 for authorized /clients, got ${authorizedClients.response.status}`,
    );

    const disallowedCors = await request("/clients", {
      headers: {
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
        Origin: "https://evil.example",
      },
    });
    assert.equal(disallowedCors.response.status, 200);
    assert.equal(
      disallowedCors.response.headers.get("access-control-allow-origin"),
      null,
      "Untrusted origin unexpectedly allowed by CORS.",
    );

    const allowedCors = await request("/clients", {
      headers: {
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
        Origin: "https://allowed.example",
      },
    });
    assert.equal(allowedCors.response.status, 200);
    assert.equal(
      allowedCors.response.headers.get("access-control-allow-origin"),
      "https://allowed.example",
      "Allowed origin did not receive CORS allow header.",
    );

    const streamSessionId = "phase2_stream_session";
    const streamBody = JSON.stringify({
      sessionId: streamSessionId,
      turnId: "phase2_stream_turn",
      message: "hello",
      metadata: {},
    });

    const streamNoAuth = await request("/agent/v2/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
      },
      body: streamBody,
    });
    assert.equal(
      streamNoAuth.response.status,
      401,
      `Expected 401 for stream without session auth, got ${streamNoAuth.response.status}`,
    );

    const streamBadAuth = await request("/agent/v2/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
        "X-Ordinay-Stream-Auth": "v1.1.invalid",
      },
      body: streamBody,
    });
    assert.equal(
      streamBadAuth.response.status,
      401,
      `Expected 401 for invalid stream auth token, got ${streamBadAuth.response.status}`,
    );

    const streamGoodAuth = await request("/agent/v2/stream", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
        "X-Ordinay-Stream-Auth": createStreamToken(streamSessionId),
      },
      body: streamBody,
    });
    assert.notEqual(
      streamGoodAuth.response.status,
      401,
      "Valid stream auth token was rejected.",
    );

    const settingsBody = JSON.stringify({
      provider_type: "openai_compatible",
      base_url: "https://example.com/v1",
      api_key: "****",
      model: "test-model",
    });

    const settingsOne = await request("/settings/ai-provider", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
      },
      body: settingsBody,
    });
    const settingsTwo = await request("/settings/ai-provider", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
      },
      body: settingsBody,
    });
    const settingsThree = await request("/settings/ai-provider", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        "X-Ordinay-Backend-Token": BACKEND_TOKEN,
      },
      body: settingsBody,
    });

    assert.notEqual(settingsOne.response.status, 429);
    assert.notEqual(settingsTwo.response.status, 429);
    assert.equal(
      settingsThree.response.status,
      429,
      `Expected 429 on 3rd sensitive endpoint call, got ${settingsThree.response.status}`,
    );

    console.log("phase2_security_checks=pass");
  } finally {
    server.kill("SIGTERM");
    await wait(250);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
    if (stderr.trim()) {
      console.error("[phase2-test] server stderr:");
      console.error(stderr.trim());
    }
  }
}

run().catch((error) => {
  console.error("phase2_security_checks=fail");
  console.error(error?.stack || String(error));
  process.exit(1);
});
