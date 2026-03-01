"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { ChatOrchestrator } = require("./chat.orchestrator");

function buildEngine(dataset = {}) {
  return {
    ledger: { record: () => {} },
    toolRegistry: new Map(),
    ajv: { compile: () => () => true },
    async _callReadTool(toolName, params = {}) {
      if (toolName === "listDossiersForClient") {
        return { dossiers: dataset.dossiers || [] };
      }
      if (toolName === "listLawsuits") {
        const dossierId = Number(params?.dossierId || 0);
        return { lawsuits: dataset.lawsuitsByDossier?.[dossierId] || [] };
      }
      if (toolName === "listSessions") {
        const dossierId = Number(params?.dossierId || 0);
        const lawsuitId = Number(params?.lawsuitId || 0);
        if (dossierId > 0) return { sessions: dataset.sessionsByDossier?.[dossierId] || [] };
        if (lawsuitId > 0) return { sessions: dataset.sessionsByLawsuit?.[lawsuitId] || [] };
        return { sessions: [] };
      }
      if (toolName === "listTasks") return { tasks: [] };
      if (toolName === "listMissions") return { missions: [] };
      if (toolName === "listFinancialEntries") return { financialEntries: [] };
      return {};
    },
  };
}

test("artifact client-scope discovery pins resolved dossier before document generation", async () => {
  const orchestrator = new ChatOrchestrator({
    engine: buildEngine({
      dossiers: [
        { id: 41, title: "Divorce Matter", reference: "DOS-41", updated_at: "2026-01-10T00:00:00Z" },
      ],
    }),
  });
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({
      queryText: "divorce case",
      preferredScopeLevels: ["dossier"],
    });

  const requestContext = {
    conversationId: "conv-1",
    userId: "u1",
    clientId: 8,
  };
  const executionContext = { ...requestContext };
  const llmHistory = {
    conversationScope: {
      activeScope: {
        entityType: "client",
        entityId: 8,
      },
    },
  };

  const result = await orchestrator._discoverArtifactScopeFromClient({
    userMessage: "Generate a document for his divorce case.",
    requestContext,
    executionContext,
    policy: null,
    llmHistory,
    contractMetadata: {},
  });

  assert.equal(result.status, "resolved");
  assert.deepEqual(result.resolvedEntity, { entityType: "dossier", entityId: 41 });
  assert.equal(requestContext.dossierId, 41);
  assert.deepEqual(requestContext.resolvedEntity, { type: "dossier", id: 41 });
});

test("artifact client-scope discovery returns clarify when candidates are too close", async () => {
  const orchestrator = new ChatOrchestrator({
    engine: buildEngine({
      dossiers: [
        { id: 71, title: "Alpha Contract Review", reference: "DOS-A-1", updated_at: "2026-01-10T00:00:00Z" },
        { id: 72, title: "Alpha Contract Renewal", reference: "DOS-A-2", updated_at: "2026-01-10T00:00:00Z" },
      ],
    }),
  });
  orchestrator.helper.mutationIntentExtractor = async () =>
    JSON.stringify({
      queryText: "alpha contract",
      preferredScopeLevels: ["dossier"],
    });

  const requestContext = {
    conversationId: "conv-2",
    userId: "u2",
    clientId: 9,
  };
  const executionContext = { ...requestContext };

  const result = await orchestrator._discoverArtifactScopeFromClient({
    userMessage: "Generate for alpha contract",
    requestContext,
    executionContext,
    policy: null,
    llmHistory: {
      conversationScope: {
        activeScope: {
          entityType: "client",
          entityId: 9,
        },
      },
    },
    contractMetadata: {},
  });

  assert.equal(result.status, "clarify");
  assert.equal(result.suggestionArtifact?.type, "context_suggestion");
  assert.ok(Array.isArray(result.suggestionArtifact?.suggestions));
  assert.ok(result.suggestionArtifact.suggestions.length >= 2);
});
