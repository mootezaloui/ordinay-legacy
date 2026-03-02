"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveChatAmbiguity } = require("./chat.ambiguity.resolver");

function buildEngine({ lawsuits = [], dossiers = [], missions = [] } = {}) {
  const calls = [];
  return {
    calls,
    async _callReadTool(toolName, params = {}) {
      calls.push({ toolName, params: { ...params } });
      if (toolName === "listLawsuits") {
        return { lawsuits };
      }
      if (toolName === "listDossiers") {
        return { dossiers };
      }
      if (toolName === "listMissions") {
        return { missions };
      }
      return {};
    },
    async resolveEntity() {
      return { found: false, reason: "not_found" };
    },
  };
}

test("future intent with no scoped entities skips read ambiguity and marks create candidate", async () => {
  const engine = buildEngine({ lawsuits: [] });

  const result = await resolveChatAmbiguity({
    engine,
    message: "we will be having a lawsuit for the divorce case",
    policy: {},
    executionContext: {
      dossierId: 44,
      dataAccess: {},
    },
    exposedTools: [],
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "future_intent_create_candidate");
  assert.deepEqual(result.mutationHint, {
    operation: "CREATE_ENTITY",
    entityType: "lawsuit",
    source: "future_intent_without_existing_scope_entity",
  });
  const listCall = engine.calls.find((call) => call.toolName === "listLawsuits");
  assert.ok(listCall);
  assert.equal(Number(listCall.params.dossierId), 44);
});

test("explicit show query does not get rerouted to create flow", async () => {
  const engine = buildEngine({ lawsuits: [] });

  const result = await resolveChatAmbiguity({
    engine,
    message: "show me the lawsuit for the divorce case",
    policy: {},
    executionContext: {
      dossierId: 44,
      dataAccess: {},
    },
    exposedTools: [],
  });

  assert.notEqual(result.reason, "future_intent_create_candidate");
  assert.ok(["ambiguous", "missing", "not_found", "skipped"].includes(result.status));
});

test("future intent routing applies generically to other entity types", async () => {
  const engine = buildEngine({ missions: [] });

  const result = await resolveChatAmbiguity({
    engine,
    message: "we will have a mission for dossier DOS-2026-001",
    policy: {},
    executionContext: {
      dossierId: 44,
      dataAccess: {},
    },
    exposedTools: [],
  });

  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "future_intent_create_candidate");
  assert.equal(result?.mutationHint?.operation, "CREATE_ENTITY");
  assert.equal(result?.mutationHint?.entityType, "mission");
  const listCall = engine.calls.find((call) => call.toolName === "listMissions");
  assert.ok(listCall);
  assert.equal(Number(listCall.params.dossierId), 44);
});
