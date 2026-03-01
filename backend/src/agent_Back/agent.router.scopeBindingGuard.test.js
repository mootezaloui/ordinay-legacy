"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const db = require("../db/connection");
const router = require("./agent.router");

function ensureClient({ withDossier = false } = {}) {
  const insertedClient = db
    .prepare("INSERT INTO clients (name, status) VALUES (@name, @status)")
    .run({
      name: `Scope Guard Client ${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      status: "active",
    });
  const clientId = Number(insertedClient.lastInsertRowid);
  if (withDossier) {
    db.prepare(
      "INSERT INTO dossiers (reference, client_id, title, status, priority) VALUES (@reference, @client_id, @title, @status, @priority)",
    ).run({
      reference: `DOS-${new Date().getFullYear()}-${Date.now()}`,
      client_id: clientId,
      title: "Divorce Matter",
      status: "open",
      priority: "medium",
    });
  }
  return clientId;
}

function buildClientPlan(clientId, hasScopeBinding = false, scopeDiscoveryHint = null) {
  return {
    target: { type: "client", id: clientId },
    storageGovernance: {
      hasScopeBinding,
      storageHint: "inherit",
      activeScope: { clientId },
      scopeDiscoveryHint:
        scopeDiscoveryHint &&
        typeof scopeDiscoveryHint === "object" &&
        !Array.isArray(scopeDiscoveryHint)
          ? scopeDiscoveryHint
          : undefined,
    },
    contentJson: {
      content: {
        title: "Draft",
        markdown: "Please generate a document for divorce case.",
      },
    },
  };
}

test("generated document attach target auto-resolves deeper entity when winner is clear", async () => {
  const clientId = ensureClient({ withDossier: true });
  const guard = router.__private?.resolveGeneratedDocumentAttachTarget;
  assert.equal(typeof guard, "function");

  const result = await guard({
    requestContext: {},
    plan: buildClientPlan(clientId, false, {
      queryText: "divorce case",
      preferredScopeLevels: ["dossier"],
    }),
  });

  assert.equal(result?.artifact, null);
  assert.equal(String(result?.target?.type || "").toLowerCase(), "dossier");
  assert.ok(Number(result?.target?.id || 0) > 0);
});

test("generated document attach guard allows client attach when no deeper entities exist", async () => {
  const clientId = ensureClient({ withDossier: false });
  const guard = router.__private?.resolveGeneratedDocumentAttachTarget;
  assert.equal(typeof guard, "function");

  const result = await guard({
    requestContext: {},
    plan: buildClientPlan(clientId, false),
  });

  assert.equal(result?.artifact, null);
  assert.equal(String(result?.target?.type || "").toLowerCase(), "client");
  assert.equal(Number(result?.target?.id || 0), clientId);
});

test("generated document attach guard allows explicit scope binding even if deeper entities exist", async () => {
  const clientId = ensureClient({ withDossier: true });
  const guard = router.__private?.resolveGeneratedDocumentAttachTarget;
  assert.equal(typeof guard, "function");

  const result = await guard({
    requestContext: { hasScopeBinding: true },
    plan: buildClientPlan(clientId, true),
  });

  assert.equal(result?.artifact, null);
  assert.equal(String(result?.target?.type || "").toLowerCase(), "client");
});

test("generated document attach target returns clarify when multiple close candidates exist", async () => {
  const clientId = ensureClient({ withDossier: false });
  db.prepare(
    "INSERT INTO dossiers (reference, client_id, title, status, priority) VALUES (@reference, @client_id, @title, @status, @priority)",
  ).run({
    reference: `DOS-${new Date().getFullYear()}-${Date.now()}-A`,
    client_id: clientId,
    title: "Alpha Contract Review",
    status: "open",
    priority: "medium",
  });
  db.prepare(
    "INSERT INTO dossiers (reference, client_id, title, status, priority) VALUES (@reference, @client_id, @title, @status, @priority)",
  ).run({
    reference: `DOS-${new Date().getFullYear()}-${Date.now()}-B`,
    client_id: clientId,
    title: "Alpha Contract Renewal",
    status: "open",
    priority: "medium",
  });
  const guard = router.__private?.resolveGeneratedDocumentAttachTarget;
  assert.equal(typeof guard, "function");

  const result = await guard({
    requestContext: {},
    plan: {
      ...buildClientPlan(clientId, false),
      storageGovernance: {
        ...buildClientPlan(clientId, false).storageGovernance,
        scopeDiscoveryHint: {
          queryText: "alpha contract",
          preferredScopeLevels: ["dossier"],
        },
      },
      contentJson: {
        content: {
          title: "Alpha Contract Draft",
          markdown: "Generate document for alpha contract.",
        },
      },
    },
  });

  assert.equal(result?.artifact?.type, "context_suggestion");
  assert.ok(Array.isArray(result?.artifact?.suggestions));
  assert.ok(result.artifact.suggestions.length >= 1);
});
