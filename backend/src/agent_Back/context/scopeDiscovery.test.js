"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { discoverScopedTarget } = require("./scopeDiscovery");

function createEngine(dataset = {}) {
  return {
    async _callReadTool(toolName, params = {}) {
      if (toolName === "listDossiersForClient") {
        return { dossiers: dataset.dossiers || [] };
      }
      if (toolName === "listLawsuits") {
        const dossierId = Number(params?.dossierId || 0);
        return { lawsuits: (dataset.lawsuitsByDossier?.[dossierId] || []).slice(0, params.limit || 50) };
      }
      if (toolName === "listSessions") {
        if (params?.dossierId) {
          const dossierId = Number(params.dossierId);
          return { sessions: (dataset.sessionsByDossier?.[dossierId] || []).slice(0, params.limit || 50) };
        }
        if (params?.lawsuitId) {
          const lawsuitId = Number(params.lawsuitId);
          return { sessions: (dataset.sessionsByLawsuit?.[lawsuitId] || []).slice(0, params.limit || 50) };
        }
        return { sessions: [] };
      }
      if (toolName === "listTasks") {
        if (params?.dossierId) {
          const dossierId = Number(params.dossierId);
          return { tasks: (dataset.tasksByDossier?.[dossierId] || []).slice(0, params.limit || 50) };
        }
        if (params?.lawsuitId) {
          const lawsuitId = Number(params.lawsuitId);
          return { tasks: (dataset.tasksByLawsuit?.[lawsuitId] || []).slice(0, params.limit || 50) };
        }
        return { tasks: [] };
      }
      if (toolName === "listMissions") {
        if (params?.dossierId) {
          const dossierId = Number(params.dossierId);
          return { missions: (dataset.missionsByDossier?.[dossierId] || []).slice(0, params.limit || 50) };
        }
        if (params?.lawsuitId) {
          const lawsuitId = Number(params.lawsuitId);
          return { missions: (dataset.missionsByLawsuit?.[lawsuitId] || []).slice(0, params.limit || 50) };
        }
        return { missions: [] };
      }
      if (toolName === "listFinancialEntries") {
        return { financialEntries: dataset.financialEntries || [] };
      }
      return {};
    },
  };
}

test("scope discovery resolves dossier from client-scoped candidates without keyword routing", async () => {
  const engine = createEngine({
    dossiers: [
      { id: 201, title: "Divorce Proceeding - Doe", reference: "DOS-2026-001", updated_at: "2026-01-10T08:00:00Z" },
      { id: 202, title: "Tax Compliance - Doe", reference: "DOS-2026-002", updated_at: "2026-01-08T08:00:00Z" },
    ],
  });

  const result = await discoverScopedTarget({
    engine,
    clientId: 44,
    message: "Generate a document for my client X for his divorce case",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "dossier");
  assert.equal(result.entityId, 201);
  assert.ok(Number(result.confidence) > 0);
});

test("scope discovery resolves session when message aligns with hearing date", async () => {
  const engine = createEngine({
    dossiers: [{ id: 301, title: "Family Matter", reference: "DOS-FAM-301" }],
    sessionsByDossier: {
      301: [
        {
          id: 401,
          title: "Main Hearing",
          scheduled_at: "2026-04-09T09:00:00Z",
          status: "scheduled",
          updated_at: "2026-03-01T10:00:00Z",
        },
        {
          id: 402,
          title: "Status Conference",
          scheduled_at: "2026-05-12T09:00:00Z",
          status: "scheduled",
          updated_at: "2026-03-01T10:00:00Z",
        },
      ],
    },
  });

  const result = await discoverScopedTarget({
    engine,
    clientId: 99,
    message: "Please prepare the filing pack for the hearing on 2026-04-09.",
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "session");
  assert.equal(result.entityId, 401);
});

test("scope discovery returns clarify when top candidates are close", async () => {
  const engine = createEngine({
    dossiers: [
      { id: 501, title: "Alpha Contract Review", reference: "DOS-ALPHA-1", updated_at: "2026-01-10T08:00:00Z" },
      { id: 502, title: "Alpha Contract Renewal", reference: "DOS-ALPHA-2", updated_at: "2026-01-09T08:00:00Z" },
    ],
  });

  const result = await discoverScopedTarget({
    engine,
    clientId: 55,
    message: "Generate document for alpha contract.",
  });

  assert.equal(result.status, "clarify");
  assert.ok(Array.isArray(result.candidates));
  assert.ok(result.candidates.length >= 2);
});

test("scope discovery respects LLM hint preferred scope levels without using IDs", async () => {
  const engine = createEngine({
    dossiers: [
      { id: 801, title: "Family Proceeding", reference: "DOS-801", updated_at: "2026-01-10T08:00:00Z" },
    ],
    lawsuitsByDossier: {
      801: [
        { id: 901, title: "Family Proceeding", reference: "L-901", updated_at: "2026-01-10T08:00:00Z" },
      ],
    },
  });

  const result = await discoverScopedTarget({
    engine,
    clientId: 77,
    message: "Prepare this filing package.",
    hint: {
      queryText: "family proceeding",
      preferredScopeLevels: ["dossier"],
    },
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.target?.entityType, "dossier");
  assert.equal(result.target?.entityId, 801);
});
