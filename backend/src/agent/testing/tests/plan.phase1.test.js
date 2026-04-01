"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { createLiveRuntime } = require("../runtime.resolver");

const runtime = createLiveRuntime();

async function executeProposeCreate(args) {
  const tool = runtime?.loop?.registry?.get?.("proposeCreate");
  assert.ok(tool, "Expected proposeCreate tool to be available.");
  return runtime.loop.executor.execute(
    tool,
    {
      sessionId: "phase1_plan_validation_session",
      turnId: `phase1_plan_validation_turn_${Date.now()}`,
      metadata: { security: { authScope: "execute" } },
    },
    args,
  );
}

test("phase1: task create requires exactly one of dossier_id or lawsuit_id", async () => {
  const missingScope = await executeProposeCreate({
    entityType: "task",
    payload: { title: "Prepare hearing notes" },
  });
  assert.equal(missingScope.ok, false);
  assert.equal(missingScope.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(missingScope.errorMessage || ""), /either dossier_id .* or lawsuit_id/i);

  const dualScope = await executeProposeCreate({
    entityType: "task",
    payload: {
      title: "Prepare hearing notes",
      dossier_id: 10,
      lawsuit_id: 22,
    },
  });
  assert.equal(dualScope.ok, false);
  assert.equal(dualScope.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(dualScope.errorMessage || ""), /exactly one parent reference/i);
});

test("phase1: session create requires exactly one of dossier_id or lawsuit_id", async () => {
  const missingScope = await executeProposeCreate({
    entityType: "session",
    payload: { type: "hearing" },
  });
  assert.equal(missingScope.ok, false);
  assert.equal(missingScope.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(missingScope.errorMessage || ""), /either dossier_id .* or lawsuit_id/i);

  const singleScope = await executeProposeCreate({
    entityType: "session",
    payload: { type: "hearing", dossier_id: 10 },
  });
  assert.equal(singleScope.ok, true);
});

test("phase1: mission create requires exactly one of dossier_id or lawsuit_id", async () => {
  const dualScope = await executeProposeCreate({
    entityType: "mission",
    payload: {
      title: "Serve court notice",
      dossier_id: 10,
      lawsuit_id: 22,
    },
  });
  assert.equal(dualScope.ok, false);
  assert.equal(dualScope.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(dualScope.errorMessage || ""), /either dossier_id .* or lawsuit_id/i);

  const singleScope = await executeProposeCreate({
    entityType: "mission",
    payload: { title: "Serve court notice", lawsuit_id: 22 },
  });
  assert.equal(singleScope.ok, true);
});

test("phase1: document create requires exactly one parent link", async () => {
  const noParent = await executeProposeCreate({
    entityType: "document",
    payload: {
      title: "Court filing",
      file_path: "/tmp/court-filing.pdf",
    },
  });
  assert.equal(noParent.ok, false);
  assert.equal(noParent.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(noParent.errorMessage || ""), /exactly one parent reference/i);

  const dualParent = await executeProposeCreate({
    entityType: "document",
    payload: {
      title: "Court filing",
      file_path: "/tmp/court-filing.pdf",
      dossier_id: 10,
      lawsuit_id: 22,
    },
  });
  assert.equal(dualParent.ok, false);
  assert.equal(dualParent.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(dualParent.errorMessage || ""), /exactly one parent reference/i);
});

test("phase1: document create requires file_path or generation source token", async () => {
  const noStorageSource = await executeProposeCreate({
    entityType: "document",
    payload: {
      title: "Generated legal opinion",
      dossier_id: 10,
    },
  });
  assert.equal(noStorageSource.ok, false);
  assert.equal(noStorageSource.errorCode, "INVALID_CREATE_PROPOSAL");
  assert.match(String(noStorageSource.errorMessage || ""), /requires file_path .* generation source token/i);
});

test("phase1: document create accepts generation source token with single parent", async () => {
  const generated = await executeProposeCreate({
    entityType: "document",
    payload: {
      title: "Generated legal opinion",
      dossier_id: 10,
      generation_uid: "gen_12345",
    },
  });
  assert.equal(generated.ok, true);
  assert.equal(generated.data?.proposal?.operation?.operation, "create");
  assert.equal(generated.data?.proposal?.operation?.entityType, "document");
});

