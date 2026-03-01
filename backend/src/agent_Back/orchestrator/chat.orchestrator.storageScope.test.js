"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatOrchestrator } = require("./chat.orchestrator");

function buildOrchestrator() {
  return new ChatOrchestrator({
    engine: {
      ledger: { record: () => {} },
      toolRegistry: new Map(),
      ajv: { compile: () => () => true },
    },
  });
}

test("deriveResolvedEntityFromAmbiguity prefers dossier over client when both are present", () => {
  const orchestrator = buildOrchestrator();
  const resolved = orchestrator._deriveResolvedEntityFromAmbiguity({
    resolvedScope: {
      clientId: 10,
      dossierId: 22,
    },
  });
  assert.deepEqual(resolved, { entityType: "dossier", entityId: 22 });
});

test("resolveActiveEntityScope picks deepest available request scope", () => {
  const orchestrator = buildOrchestrator();
  const resolved = orchestrator._resolveActiveEntityScope(
    {
      clientId: 2,
      dossierId: 3,
      taskId: 9,
    },
    null,
  );
  assert.deepEqual(resolved, { entityType: "task", entityId: 9 });
});

test("resolveActiveEntityScope keeps explicit resolvedEntity precedence", () => {
  const orchestrator = buildOrchestrator();
  const resolved = orchestrator._resolveActiveEntityScope(
    {
      resolvedEntity: { type: "client", id: 88 },
      taskId: 12,
      dossierId: 7,
    },
    null,
  );
  assert.deepEqual(resolved, { entityType: "client", entityId: 88 });
});

