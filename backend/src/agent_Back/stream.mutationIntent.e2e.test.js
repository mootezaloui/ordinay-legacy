"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const express = require("express");

function tmpDbPath(name) {
  return path.join(
    os.tmpdir(),
    `ordinay-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function clearBackendCache() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}backend${path.sep}src${path.sep}`)) {
      delete require.cache[key];
    }
  });
}

function removeSqliteArtifacts(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {}
  }
}

function readSseFrames(text) {
  return String(text || "")
    .split("\n\n")
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const eventLine = lines.find((line) => line.startsWith("event: "));
      const dataLine = lines.find((line) => line.startsWith("data: "));
      return {
        event: eventLine ? eventLine.slice(7).trim() : "",
        data: dataLine ? JSON.parse(dataLine.slice(6)) : {},
      };
    });
}

function createApp(router) {
  const app = express();
  app.use(express.json());
  app.use("/", router);
  return app;
}

async function startServer(router) {
  const app = createApp(router);
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, "127.0.0.1", () => resolve(instance));
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : null;
  return { server, baseUrl: `http://127.0.0.1:${port}` };
}

function seedData(db) {
  db.prepare(`INSERT INTO clients (id, name, status) VALUES (1, 'Stream Client', 'active')`).run();
  db.prepare(
    `INSERT INTO dossiers (id, reference, client_id, title, status, priority, phase, validated)
     VALUES (1, 'DOS-STREAM-001', 1, 'Stream Dossier', 'open', 'medium', 'investigation', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO sessions (id, title, session_type, status, scheduled_at, dossier_id)
     VALUES (42, 'Stream Hearing', 'hearing', 'scheduled', '2026-02-20 09:00:00', 1)`,
  ).run();
}

test("stream route Stage 3 parity emits proposal artifact behind stream feature flag", async () => {
  const dbPath = tmpDbPath("stream-stage3-e2e");
  const prevEnv = {};
  const envPatch = {
    DB_FILE: dbPath,
    AGENT_MUTATION_INTENT_DETECTION: "1",
    AGENT_MUTATION_INTENT_STREAM_DETECTION: "1",
    AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
  };
  for (const [k, v] of Object.entries(envPatch)) {
    prevEnv[k] = process.env[k];
    process.env[k] = String(v);
  }

  clearBackendCache();
  const router = require("./agent.router");
  const db = require("../db/connection");
  seedData(db);
  const { server, baseUrl } = await startServer(router);

  try {
    const response = await fetch(`${baseUrl}/agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Move hearing 42 to March 15, 2026",
        sessionId: "stream-stage3-1",
        agentVersion: "v3",
      }),
    });
    assert.equal(response.status, 200);
    const frames = readSseFrames(await response.text());
    const artifactFinal = frames.find((f) => f.event === "artifact.final");
    assert.ok(artifactFinal, "expected artifact.final SSE frame");
    assert.equal(artifactFinal.data?.payload?.output?.type, "proposal");
    const proposalId =
      artifactFinal.data?.payload?.output?.proposals?.[0]?.proposalId;
    assert.ok(proposalId, "expected proposal artifact with proposalId");

    const sessionRow = db.prepare(`SELECT scheduled_at FROM sessions WHERE id = 42`).get();
    assert.equal(
      sessionRow.scheduled_at,
      "2026-02-20 09:00:00",
      "stream parity must not auto-execute mutation",
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      db.close();
    } catch {}
    clearBackendCache();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    removeSqliteArtifacts(dbPath);
  }
});

test("stream route Stage 3 clarification UX emits explanation artifact for ambiguous date", async () => {
  const dbPath = tmpDbPath("stream-stage3-clarify");
  const prevEnv = {};
  const envPatch = {
    DB_FILE: dbPath,
    AGENT_MUTATION_INTENT_DETECTION: "1",
    AGENT_MUTATION_INTENT_STREAM_DETECTION: "1",
    AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
  };
  for (const [k, v] of Object.entries(envPatch)) {
    prevEnv[k] = process.env[k];
    process.env[k] = String(v);
  }

  clearBackendCache();
  const router = require("./agent.router");
  const db = require("../db/connection");
  seedData(db);
  const { server, baseUrl } = await startServer(router);

  try {
    const response = await fetch(`${baseUrl}/agent/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Set hearing 42 date to 03/04",
        sessionId: "stream-stage3-clarify-1",
        agentVersion: "v3",
      }),
    });
    assert.equal(response.status, 200);
    const frames = readSseFrames(await response.text());

    const artifactFinal = frames.find((f) => f.event === "artifact.final");
    assert.ok(artifactFinal, "expected artifact.final SSE frame");
    const output = artifactFinal.data?.payload?.output;
    assert.equal(output?.type, "explanation");
    assert.match(String(output?.summary || ""), /ambiguous|date/i);

    const proposalFrame = frames.find(
      (f) => f.event === "artifact.final" && f.data?.payload?.output?.type === "proposal",
    );
    assert.equal(Boolean(proposalFrame), false, "clarification path must not emit proposal");

    const sessionRow = db.prepare(`SELECT scheduled_at FROM sessions WHERE id = 42`).get();
    assert.equal(sessionRow.scheduled_at, "2026-02-20 09:00:00");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    try {
      db.close();
    } catch {}
    clearBackendCache();
    for (const [k, v] of Object.entries(prevEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    removeSqliteArtifacts(dbPath);
  }
});
