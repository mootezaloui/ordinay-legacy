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
  return {
    server,
    baseUrl: `http://127.0.0.1:${port}`,
  };
}

function seedMinimalMutationRecords(db) {
  db.prepare(`INSERT INTO clients (id, name, status) VALUES (1, 'E2E Client', 'active')`).run();
  db.prepare(`INSERT INTO clients (id, name, status) VALUES (2, 'Free Client', 'active')`).run();
  db.prepare(
    `INSERT INTO dossiers (id, reference, client_id, title, status, priority, phase, validated)
     VALUES (1, 'DOS-E2E-001', 1, 'E2E Dossier', 'open', 'medium', 'investigation', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO sessions (id, title, session_type, status, scheduled_at, dossier_id)
     VALUES (42, 'Initial Hearing', 'hearing', 'scheduled', '2026-02-20 09:00:00', 1)`,
  ).run();
  db.prepare(
    `INSERT INTO tasks (id, dossier_id, title, status, priority)
     VALUES (123, 1, 'Follow up task', 'todo', 'medium')`,
  ).run();
}

function seedUnpaidReceivableForClient(db, clientId = 1) {
  db.prepare(
    `INSERT INTO financial_entries (
      id, scope, client_id, entry_type, status, amount, currency, direction, title, description
    ) VALUES (
      ?, 'client', ?, 'income', 'confirmed', 500, 'TND', 'receivable', 'Unpaid invoice', 'Outstanding receivable'
    )`,
  ).run(9001 + Number(clientId), Number(clientId));
}

function getProposalIdFromChatFrames(frames) {
  const resultFrame = frames.find((f) => f.event === "result");
  assert.ok(resultFrame, "expected result frame");
  const output = resultFrame.data?.output;
  assert.equal(output?.type, "proposal");
  const proposalId = output?.proposals?.[0]?.proposalId;
  assert.ok(proposalId, "expected proposalId in proposal artifact");
  return proposalId;
}

function collectChunkText(frames) {
  return frames
    .filter((f) => f.event === "chunk")
    .map((f) => String(f.data?.content || ""))
    .join("");
}

function assertNoForbiddenMutationLeak(text) {
  const source = String(text || "");
  const forbidden = [
    /\/mutate\b/i,
    /\bpropose_entity_mutation\b/i,
    /\buniversalmutation\b/i,
    /\bpayload\b/i,
    /\bendpoint\b/i,
    /\bapi\b/i,
    /\bsyntax\b/i,
    /\bselect\s+.+\s+from\b/i,
    /\binsert\s+into\b/i,
    /\bupdate\s+\w+\s+set\b/i,
    /\bdelete\s+from\b/i,
    /\bError:\b/,
    /\bnode:/i,
  ];
  for (const re of forbidden) {
    assert.equal(re.test(source), false, `unexpected leaked text matching ${re}`);
  }
}

async function bootstrapRouterWithTempDb({
  dbPath,
  extraEnv = {},
}) {
  const prev = {};
  const envPatch = {
    DB_FILE: dbPath,
    AGENT_MUTATION_INTENT_DETECTION: "1",
    AGENT_MUTATION_INTENT_SHADOW_MODE: "0",
    AGENT_MUTATION_INTENT_LLM_EXTRACTOR: "0",
    AGENT_MUTATION_INTENT_ALLOW_HIGH_RISK: "0",
    ...extraEnv,
  };
  for (const [k, v] of Object.entries(envPatch)) {
    prev[k] = process.env[k];
    process.env[k] = String(v);
  }

  clearBackendCache();
  const router = require("../agent.router");
  const db = require("../../db/connection");
  const clientsService = require("../../services/clients.service");
  seedMinimalMutationRecords(db);

  const restore = () => {
    try {
      db.close();
    } catch {}
    clearBackendCache();
    for (const [k, v] of Object.entries(prev)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    removeSqliteArtifacts(dbPath);
  };

  return { router, db, clientsService, restore };
}

test("e2e /agent/chat -> proposal -> /agent/confirm executes low-risk session update", async () => {
  const dbPath = tmpDbPath("chat-stage3-e2e-low");
  const { router, db, restore } = await bootstrapRouterWithTempDb({ dbPath });
  const { server, baseUrl } = await startServer(router);

  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Move hearing 42 to March 12, 2026",
        sessionId: "e2e-chat-1",
        agentVersion: "v3",
      }),
    });
    assert.equal(chatResp.status, 200);
    const chatFrames = readSseFrames(await chatResp.text());
    const proposalId = getProposalIdFromChatFrames(chatFrames);

    const confirmResp = await fetch(`${baseUrl}/agent/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId,
        sessionId: "e2e-chat-1",
      }),
    });
    assert.equal(confirmResp.status, 200);
    const confirmJson = await confirmResp.json();
    assert.equal(confirmJson.status, "ok");
    assert.equal(confirmJson.data?.status, "success");
    assert.equal(confirmJson.data?.executedActions?.[0]?.result?.ok, true);
    assert.equal(confirmJson.data?.executedActions?.[0]?.result?.rowCount, 1);
    assert.equal(confirmJson.data?.executedActions?.[0]?.result?.entityType, "session");
    assert.equal(confirmJson.data?.executedActions?.[0]?.result?.entityId, 42);
    assert.ok(Array.isArray(confirmJson.data?.executedActions?.[0]?.result?.changedFields));
    assert.equal(
      confirmJson.data?.executedActions?.[0]?.result?.after?.scheduled_at,
      "2026-03-12",
    );

    const sessionRow = db
      .prepare(`SELECT scheduled_at FROM sessions WHERE id = 42`)
      .get();
    assert.equal(sessionRow.scheduled_at, "2026-03-12");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat high-risk proposal requires ackRisk on /agent/confirm", async () => {
  const dbPath = tmpDbPath("chat-stage3-e2e-risk");
  const { router, db, restore } = await bootstrapRouterWithTempDb({
    dbPath,
    extraEnv: {
      AGENT_MUTATION_INTENT_ALLOW_HIGH_RISK: "1",
      AGENT_MUTATION_INTENT_REQUIRE_RISK_ACK: "1",
    },
  });
  const { server, baseUrl } = await startServer(router);

  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Update task 123 status to cancelled",
        sessionId: "e2e-chat-risk",
        agentVersion: "v3",
      }),
    });
    assert.equal(chatResp.status, 200);
    const chatFrames = readSseFrames(await chatResp.text());
    const proposalId = getProposalIdFromChatFrames(chatFrames);

    const confirmWithoutAck = await fetch(`${baseUrl}/agent/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId,
        sessionId: "e2e-chat-risk",
      }),
    });
    assert.equal(confirmWithoutAck.status, 200);
    const noAckJson = await confirmWithoutAck.json();
    assert.equal(noAckJson.data?.status, "failed");
    assert.equal(noAckJson.data?.error?.code, "RISK_ACK_REQUIRED");

    const confirmWithAck = await fetch(`${baseUrl}/agent/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId,
        sessionId: "e2e-chat-risk",
        ackRisk: true,
      }),
    });
    assert.equal(confirmWithAck.status, 200);
    const ackJson = await confirmWithAck.json();
    assert.equal(ackJson.data?.status, "success");

    const taskRow = db.prepare(`SELECT status FROM tasks WHERE id = 123`).get();
    assert.equal(taskRow.status, "cancelled");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat auto-exec strong client intent updates status and returns safe done message", async () => {
  const dbPath = tmpDbPath("chat-stage3-autoexec-client");
  const { router, db, clientsService, restore } = await bootstrapRouterWithTempDb({ dbPath });
  const { server, baseUrl } = await startServer(router);

  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-autoexec-client",
        agentVersion: "v3",
        context: {
          clientId: 2,
          activeEntity: { type: "client", id: 2 },
        },
        metadata: {
          chatMutationExecutionMode: "auto_execute",
        },
      }),
    });
    assert.equal(chatResp.status, 200);
    const frames = readSseFrames(await chatResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /done/i);
    assert.match(text, /\binactive\b/i);
    assertNoForbiddenMutationLeak(text);

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 2`).get();
    assert.equal(clientRow.status, "inActive");
    const clientRead = clientsService.get(2);
    assert.equal(clientRead?.status, "inActive");

    const proposalResultFrame = frames.find(
      (f) => f.event === "result" && f.data?.output?.type === "proposal",
    );
    assert.equal(Boolean(proposalResultFrame), false, "auto-exec path should not emit proposal card");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat blocks marking client inactive when open dossiers exist (frontend parity rule)", async () => {
  const dbPath = tmpDbPath("chat-stage3-client-inactive-blocked");
  const { router, db, restore } = await bootstrapRouterWithTempDb({
    dbPath,
    extraEnv: {
      AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS: "0",
    },
  });
  const engine = typeof router.__getAgentEngineForTests === "function"
    ? router.__getAgentEngineForTests()
    : null;
  const { server, baseUrl } = await startServer(router);

  try {
    const ledgerBefore = engine?.ledger?.list?.() || [];
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-client-blocked",
        agentVersion: "v3",
        context: {
          clientId: 1,
          activeEntity: { type: "client", id: 1 },
        },
        metadata: {
          chatMutationExecutionMode: "auto_execute",
        },
      }),
    });
    assert.equal(chatResp.status, 200);
    const frames = readSseFrames(await chatResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /open dossier/i);
    assert.match(text, /open dossier/i);
    assertNoForbiddenMutationLeak(text);

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 1`).get();
    assert.equal(clientRow.status, "active");

    const newEntries = (engine?.ledger?.list?.() || []).slice(ledgerBefore.length);
    const failedProposalTool = newEntries.find(
      (entry) =>
        entry?.type === "tool_execution_v2" &&
        entry?.toolName === "propose_entity_mutation" &&
        entry?.success === false,
    );
    assert.ok(failedProposalTool, "expected propose_entity_mutation tool failure due to domain rule");
    const failureText = JSON.stringify(failedProposalTool);
    assert.match(failureText, /DOMAIN_RULE_BLOCKED|open dossier/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat adaptive workflow proposal for client inactive includes factual cleanup summary (no domain-rule wording)", async () => {
  const dbPath = tmpDbPath("chat-stage4-adaptive-workflow-proposal");
  const { router, db, restore } = await bootstrapRouterWithTempDb({
    dbPath,
    extraEnv: {
      AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS: "1",
    },
  });
  seedUnpaidReceivableForClient(db, 1);
  const { server, baseUrl } = await startServer(router);

  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-adaptive-proposal",
        agentVersion: "v3",
        context: {
          clientId: 1,
          activeEntity: { type: "client", id: 1 },
        },
      }),
    });
    assert.equal(chatResp.status, 200);
    const frames = readSseFrames(await chatResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /\bwill\b/i);
    assert.match(text, /open dossier/i);
    assert.match(text, /unpaid receivables/i);
    assert.equal(/domain rules?/i.test(text), false);
    assertNoForbiddenMutationLeak(text);

    const resultFrame = frames.find((f) => f.event === "result");
    assert.ok(resultFrame, "expected proposal artifact");
    const proposal = resultFrame.data?.output?.proposals?.[0];
    assert.ok(proposal, "expected proposal");
    assert.equal(proposal.actionType, "EXECUTE_MUTATION_WORKFLOW");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat adaptive workflow confirm cleans non-financial blockers but leaves client active when unpaid receivables remain", async () => {
  const dbPath = tmpDbPath("chat-stage4-adaptive-workflow-confirm");
  const { router, db, restore } = await bootstrapRouterWithTempDb({
    dbPath,
    extraEnv: {
      AGENT_ADAPTIVE_DOMAIN_CONSTRAINTS: "1",
      AGENT_MUTATION_INTENT_REQUIRE_RISK_ACK: "1",
    },
  });
  seedUnpaidReceivableForClient(db, 1);
  const { server, baseUrl } = await startServer(router);

  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-adaptive-confirm",
        agentVersion: "v3",
        context: {
          clientId: 1,
          activeEntity: { type: "client", id: 1 },
        },
      }),
    });
    assert.equal(chatResp.status, 200);
    const chatFrames = readSseFrames(await chatResp.text());
    const proposalId = getProposalIdFromChatFrames(chatFrames);

    const confirmResp = await fetch(`${baseUrl}/agent/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        proposalId,
        sessionId: "e2e-chat-adaptive-confirm",
        ackRisk: true,
      }),
    });
    assert.equal(confirmResp.status, 200);
    const confirmJson = await confirmResp.json();
    assert.equal(confirmJson.data?.status, "success");
    const workflowResult = confirmJson.data?.executedActions?.[0]?.result;
    assert.equal(workflowResult?.ok, true);
    assert.equal(workflowResult?.workflowType, "client_inactivation_cleanup");
    assert.equal(workflowResult?.goalReached, false);
    assert.match(String(workflowResult?.message || ""), /unpaid receivables/i);

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 1`).get();
    assert.equal(clientRow.status, "active", "client should remain active due to unpaid receivables");
    const dossierRow = db.prepare(`SELECT status FROM dossiers WHERE id = 1`).get();
    assert.equal(dossierRow.status, "closed");
    const taskRow = db.prepare(`SELECT status FROM tasks WHERE id = 123`).get();
    assert.equal(taskRow.status, "cancelled");
    const sessionRow = db.prepare(`SELECT status FROM sessions WHERE id = 42`).get();
    assert.equal(sessionRow.status, "cancelled");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat deterministic mutation orchestration uses tool after show-client context", async () => {
  const dbPath = tmpDbPath("chat-stage3-show-client-then-mutate");
  const { router, db, restore } = await bootstrapRouterWithTempDb({ dbPath });
  const engine = typeof router.__getAgentEngineForTests === "function"
    ? router.__getAgentEngineForTests()
    : null;
  const { server, baseUrl } = await startServer(router);

  try {
    const showResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "show client 2",
        sessionId: "e2e-chat-show-then-mutate",
        agentVersion: "v3",
      }),
    });
    assert.equal(showResp.status, 200);
    await showResp.text();

    const ledgerBefore = engine?.ledger?.list?.() || [];

    const mutateResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-show-then-mutate",
        agentVersion: "v3",
        metadata: {
          chatMutationExecutionMode: "auto_execute",
        },
      }),
    });
    assert.equal(mutateResp.status, 200);
    const frames = readSseFrames(await mutateResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /done/i);
    assert.match(text, /\binactive\b/i);
    assertNoForbiddenMutationLeak(text);

    const ledgerAfter = engine?.ledger?.list?.() || [];
    const newEntries = ledgerAfter.slice(ledgerBefore.length);
    const proposeToolCall = newEntries.find(
      (entry) =>
        entry?.type === "tool_execution_v2" &&
        entry?.toolName === "propose_entity_mutation" &&
        entry?.success === true,
    );
    assert.ok(proposeToolCall, "expected propose_entity_mutation tool call in deterministic mutation path");

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 2`).get();
    assert.equal(clientRow.status, "inActive");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat with agentVersion v1 still routes strong mutation intent through v3 mutation orchestration", async () => {
  const dbPath = tmpDbPath("chat-stage3-v1-policy-override");
  const { router, db, restore } = await bootstrapRouterWithTempDb({ dbPath });
  const engine = typeof router.__getAgentEngineForTests === "function"
    ? router.__getAgentEngineForTests()
    : null;
  const { server, baseUrl } = await startServer(router);

  try {
    const showResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Show client 2",
        sessionId: "e2e-chat-v1-mutate",
        agentVersion: "v1",
      }),
    });
    assert.equal(showResp.status, 200);
    await showResp.text();

    const ledgerBefore = engine?.ledger?.list?.() || [];

    const mutateResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-v1-mutate",
        agentVersion: "v1",
      }),
    });
    assert.equal(mutateResp.status, 200);
    const frames = readSseFrames(await mutateResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /confirm/i);
    assert.match(text, /\binactive\b/i);
    assertNoForbiddenMutationLeak(text);

    const resultFrame = frames.find(
      (f) => f.event === "result" && f.data?.output?.type === "proposal",
    );
    assert.ok(resultFrame, "expected proposal artifact in v1 chat path");

    const newEntries = (engine?.ledger?.list?.() || []).slice(ledgerBefore.length);
    const proposeToolCall = newEntries.find(
      (entry) =>
        entry?.type === "tool_execution_v2" &&
        entry?.toolName === "propose_entity_mutation" &&
        entry?.success === true,
    );
    assert.ok(proposeToolCall, "expected propose_entity_mutation execution in v1 path");
    assert.equal(String(proposeToolCall.policyVersion || "").toLowerCase(), "v3");

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 2`).get();
    assert.equal(clientRow.status, "active", "confirm-mode should not auto-execute");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    restore();
  }
});

test("e2e /agent/chat auto-exec failure returns safe message without internal leak", async () => {
  const dbPath = tmpDbPath("chat-stage3-autoexec-fail");
  const { router, db, restore } = await bootstrapRouterWithTempDb({ dbPath });
  const modulePath = require.resolve("../engine/universalOperations");
  const previousExports = require.cache[modulePath]?.exports;
  const patched = previousExports ? { ...previousExports } : require(modulePath);
  patched.executeUpdateEntity = async () => {
    const err = new Error("propose_entity_mutation payload failed at endpoint /agent/confirm");
    err.code = "EXECUTION_ERROR";
    throw err;
  };
  require.cache[modulePath] = {
    id: modulePath,
    filename: modulePath,
    loaded: true,
    exports: patched,
  };

  const { server, baseUrl } = await startServer(router);
  try {
    const chatResp = await fetch(`${baseUrl}/agent/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "this guy is not my client anymore",
        sessionId: "e2e-chat-autoexec-fail",
        agentVersion: "v3",
        context: {
          clientId: 2,
          activeEntity: { type: "client", id: 2 },
        },
        metadata: {
          chatMutationExecutionMode: "auto_execute",
        },
      }),
    });
    assert.equal(chatResp.status, 200);
    const frames = readSseFrames(await chatResp.text());
    const text = collectChunkText(frames);
    assert.match(text, /(couldn.t|could not)/i);
    assert.match(text, /(system error|try again|prepare)/i);
    assertNoForbiddenMutationLeak(text);

    const clientRow = db.prepare(`SELECT status FROM clients WHERE id = 2`).get();
    assert.equal(clientRow.status, "active");
  } finally {
    await new Promise((resolve) => server.close(resolve));
    if (previousExports) {
      require.cache[modulePath].exports = previousExports;
    } else {
      delete require.cache[modulePath];
    }
    restore();
  }
});
