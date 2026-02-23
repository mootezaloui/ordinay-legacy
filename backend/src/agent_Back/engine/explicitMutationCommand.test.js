"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { _executeSlashCommand } = require("./stages/stage.intent");
const { filterToolsForChat } = require("../chat/chat.tool.exposure");

function makeProposal() {
  return {
    proposalId: "v3-UPDATE_ENTITY-123-test",
    status: "PROPOSED",
    actionType: "UPDATE_ENTITY",
    requiresConfirmation: true,
    humanReadableSummary: "Update task #123 (reason: user asked)",
    affectedEntities: [{ type: "task", id: 123 }],
    reversible: true,
    version: "v3",
    posture: "WORK",
    snapshot: {
      scope: "task",
      scopeId: 123,
      hash: "sha256:abc",
      timestamp: new Date().toISOString(),
    },
    sessionId: "sess-1",
    params: {
      entityType: "task",
      entityId: 123,
      changes: { status: "completed" },
    },
  };
}

test("slash /mutate creates and stores proposal with explicit-origin metadata", async () => {
  const stored = [];
  const fakeEngine = {
    ledger: { record() {} },
    async executeToolV2(toolName, params, policy, context) {
      assert.equal(toolName, "propose_entity_mutation");
      assert.equal(context.explicitMutationCommand, true);
      assert.equal(context.posture, "WORK");
      assert.equal(params.operation, "update");
      return { result: makeProposal() };
    },
    storeProposal(proposal, contextSnapshot) {
      stored.push({ proposal, contextSnapshot });
    },
    async _executeCommandTools() {
      throw new Error("Should not call READ command path for /mutate");
    },
  };

  const result = await _executeSlashCommand.call(
    fakeEngine,
    '/mutate {"entityType":"task","entityId":"123","operation":"update","payload":{"status":"completed"},"reasoningSummary":"User explicitly requested completion."}',
    { conversationId: "sess-1", userId: 42, sourceRoute: "/agent/stream" },
    { version: "v3" },
    { sessionId: "sess-1", userId: 42, dataAccess: {} },
  );

  assert.equal(result.intent, "COMMAND");
  assert.equal(result.output.type, "proposal");
  assert.equal(result.output.proposals.length, 1);
  assert.equal(stored.length, 1);
  assert.equal(stored[0].contextSnapshot.explicitMutationCommand, true);
  assert.equal(stored[0].contextSnapshot.proposalKind, "entity_mutation");
});

test("slash /mutate invalid JSON returns command error artifact", async () => {
  const fakeEngine = {
    ledger: { record() {} },
    async executeToolV2() {
      throw new Error("should not execute");
    },
    async _executeCommandTools() {
      throw new Error("should not execute");
    },
  };

  const result = await _executeSlashCommand.call(
    fakeEngine,
    '/mutate {"entityType":"task",}',
    {},
    { version: "v3" },
    { sessionId: "sess-1", userId: 42, dataAccess: {} },
  );

  assert.equal(result.intent, "COMMAND");
  assert.equal(result.output.type, "explanation");
  assert.match(String(result.output.summary || ""), /Command failed/i);
});

test("chat tool exposure excludes mutation tools in normal chatbot mode", () => {
  const fakeEngine = {
    toolRegistry: {
      list() {
        return [
          {
            name: "listTasks",
            category: "read",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
          {
            name: "universalMutation",
            category: "execute",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
          {
            name: "propose_entity_mutation",
            category: "plan",
            inputSchema: { type: "object", properties: {}, additionalProperties: false },
          },
        ];
      },
    },
    toolFirewall: {
      checkPermission() {
        return { permitted: true };
      },
    },
  };

  const exposed = filterToolsForChat({
    engine: fakeEngine,
    policy: {
      version: "v3",
      allowedToolCategories: ["read", "plan", "execute"],
      allowExecution: true,
      requirePosture: "WORK",
    },
    executionContext: {
      posture: "WORK",
      dataAccess: {},
    },
  });

  const names = exposed.map((tool) => tool.name);
  assert.deepEqual(names, ["listTasks"]);
});
