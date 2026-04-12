"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const Database = require("better-sqlite3");

const PORT = Number.parseInt(process.env.PHASE3_TEST_PORT || "3321", 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;
const API_BASE = `${BASE_URL}/api`;
const BACKEND_TOKEN = "phase3-backend-token";

function createFixturePaths() {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), "ordinay-phase3-"));
  const managedDocumentsRoot = path.join(fixtureRoot, "managed-documents");
  const dbFile = path.join(fixtureRoot, "phase3.db");
  const outsideFile = path.join(fixtureRoot, "outside-secret.txt");

  fs.mkdirSync(managedDocumentsRoot, { recursive: true });
  fs.writeFileSync(outsideFile, "phase3 outside secret", "utf8");

  return { fixtureRoot, managedDocumentsRoot, dbFile, outsideFile };
}

async function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServerReady(timeoutMs = 12_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(`${API_BASE}/ping`, {
        headers: { "X-Ordinay-Backend-Token": BACKEND_TOKEN },
      });
      if (response.status !== 500) {
        return;
      }
    } catch {
      // ignore until the server is reachable
    }
    await wait(250);
  }
  throw new Error("Phase 3 test server did not start in time.");
}

async function apiRequest(pathname, options = {}) {
  const { method = "GET", body, headers = {} } = options;
  const requestHeaders = {
    "X-Ordinay-Backend-Token": BACKEND_TOKEN,
    ...headers,
  };
  const requestOptions = { method, headers: requestHeaders };

  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
    requestOptions.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE}${pathname}`, requestOptions);
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { response, text, json };
}

function expectBlockedPathResponse(result, label) {
  assert.ok(
    [400, 403].includes(result.response.status),
    `${label} should be blocked with 400/403, got ${result.response.status} (${result.text})`,
  );
}

async function run() {
  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const serverPath = path.join(repoRoot, "backend", "src", "server.js");
  const fixture = createFixturePaths();

  const env = {
    ...process.env,
    PORT: String(PORT),
    NODE_ENV: "test",
    DB_FILE: fixture.dbFile,
    ORDINAY_DOCUMENTS_PATH: fixture.managedDocumentsRoot,
    AGENT_DEPLOYMENT_ALLOW_PUBLIC_BIND: "true",
    BACKEND_API_TOKEN: BACKEND_TOKEN,
    OLLAMA_AUTO_START_ON_BOOT: "false",
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

    const createClient = await apiRequest("/clients", {
      method: "POST",
      body: {
        name: `Phase3 Client ${Date.now()}`,
        status: "active",
      },
    });
    assert.equal(
      createClient.response.status,
      201,
      `Expected 201 for /clients create, got ${createClient.response.status} (${createClient.text})`,
    );
    const clientId = Number(createClient.json?.id);
    assert.ok(Number.isInteger(clientId) && clientId > 0, "Client id was not returned.");

    const upload = await apiRequest("/documents/upload", {
      method: "POST",
      body: {
        filename: "phase3-safe.txt",
        mime_type: "text/plain",
        data_base64: Buffer.from("phase3 safe content", "utf8").toString("base64"),
      },
    });
    assert.equal(
      upload.response.status,
      201,
      `Expected 201 for /documents/upload, got ${upload.response.status} (${upload.text})`,
    );
    const managedFilePath = String(upload.json?.file_path || "");
    assert.ok(managedFilePath.length > 0, "Upload did not return file_path.");

    const createManagedDocument = await apiRequest("/documents", {
      method: "POST",
      body: {
        title: "Phase3 Managed Doc",
        file_path: managedFilePath,
        client_id: clientId,
      },
    });
    assert.equal(
      createManagedDocument.response.status,
      201,
      `Expected 201 for managed document create, got ${createManagedDocument.response.status} (${createManagedDocument.text})`,
    );
    const documentId = Number(createManagedDocument.json?.id);
    assert.ok(Number.isInteger(documentId) && documentId > 0, "Document id was not returned.");

    const rejectExternalPathCreate = await apiRequest("/documents", {
      method: "POST",
      body: {
        title: "Phase3 Outside Path Create",
        file_path: fixture.outsideFile,
        client_id: clientId,
      },
    });
    expectBlockedPathResponse(rejectExternalPathCreate, "External absolute file_path on create");

    const rejectTraversalUpdate = await apiRequest(`/documents/${documentId}`, {
      method: "PUT",
      body: {
        file_path: "..\\..//outside-secret.txt",
      },
    });
    expectBlockedPathResponse(rejectTraversalUpdate, "Traversal-like file_path on update");

    const db = new Database(fixture.dbFile);
    try {
      db.prepare("UPDATE documents SET file_path = @filePath WHERE id = @id").run({
        filePath: fixture.outsideFile,
        id: documentId,
      });
    } finally {
      db.close();
    }

    const blockedDownload = await apiRequest(`/documents/${documentId}/download`);
    assert.equal(
      blockedDownload.response.status,
      403,
      `Expected 403 for download of out-of-root file, got ${blockedDownload.response.status} (${blockedDownload.text})`,
    );

    console.log("phase3_security_checks=pass");
  } finally {
    server.kill("SIGTERM");
    await wait(250);
    if (!server.killed) {
      server.kill("SIGKILL");
    }
    if (stderr.trim()) {
      console.error("[phase3-test] server stderr:");
      console.error(stderr.trim());
    }
    try {
      fs.rmSync(fixture.fixtureRoot, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }
}

run().catch((error) => {
  console.error("phase3_security_checks=fail");
  console.error(error?.stack || String(error));
  process.exit(1);
});
