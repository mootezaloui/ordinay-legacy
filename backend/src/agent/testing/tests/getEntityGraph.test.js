"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const getEntityGraphTool = require("../../tools/read/getEntityGraph.tool");

function createStubServices() {
  const now = new Date().toISOString();

  const client = {
    id: 1,
    name: "Client One",
    status: "active",
    created_at: now,
    updated_at: now,
  };

  const dossier = {
    id: 10,
    client_id: 1,
    title: "Dossier A",
    status: "open",
    priority: "high",
    next_deadline: "2030-01-10T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  };

  const lawsuit = {
    id: 20,
    dossier_id: 10,
    title: "Lawsuit A",
    status: "in_progress",
    priority: "medium",
    next_hearing: "2030-02-01T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  };

  const task = {
    id: 30,
    lawsuit_id: 20,
    title: "Task A",
    status: "todo",
    priority: "urgent",
    due_date: "2030-01-05T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  };

  const mission = {
    id: 40,
    lawsuit_id: 20,
    title: "Mission A",
    status: "planned",
    priority: "high",
    due_date: "2030-01-06T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  };

  const session = {
    id: 50,
    lawsuit_id: 20,
    title: "Session A",
    status: "scheduled",
    priority: "medium",
    scheduled_at: "2030-01-07T00:00:00.000Z",
    created_at: now,
    updated_at: now,
  };

  const document = {
    id: 60,
    task_id: 30,
    title: "Document A",
    status: "readable",
    created_at: now,
    updated_at: now,
    uploaded_at: now,
  };

  return {
    clients: {
      get: (id) => (Number(id) === client.id ? { ...client } : null),
    },
    dossiers: {
      get: (id) => (Number(id) === dossier.id ? { ...dossier } : null),
      listByClient: (clientId) =>
        Number(clientId) === 1 ? [{ ...dossier }] : [],
    },
    lawsuits: {
      get: (id) => (Number(id) === lawsuit.id ? { ...lawsuit } : null),
      listByDossier: (dossierId) =>
        Number(dossierId) === dossier.id ? [{ ...lawsuit }] : [],
    },
    tasks: {
      get: (id) => (Number(id) === task.id ? { ...task } : null),
      listByDossier: () => [],
      listByLawsuit: (lawsuitId) =>
        Number(lawsuitId) === lawsuit.id ? [{ ...task }] : [],
    },
    missions: {
      get: (id) => (Number(id) === mission.id ? { ...mission } : null),
      listByDossier: () => [],
      listByLawsuit: (lawsuitId) =>
        Number(lawsuitId) === lawsuit.id ? [{ ...mission }] : [],
    },
    sessions: {
      get: (id) => (Number(id) === session.id ? { ...session } : null),
      listByDossier: () => [],
      listByLawsuit: (lawsuitId) =>
        Number(lawsuitId) === lawsuit.id ? [{ ...session }] : [],
    },
    documents: {
      get: (id) => (Number(id) === document.id ? { ...document } : null),
      listByClient: () => [],
      listByDossier: () => [],
      listByLawsuit: () => [],
      listByTask: (taskId) => (Number(taskId) === task.id ? [{ ...document }] : []),
      listByMission: () => [],
      listBySession: () => [],
    },
  };
}

test("getEntityGraph supports session/document roots and complete parent chains", async () => {
  const services = createStubServices();

  const taskResult = await getEntityGraphTool.handler(
    { entityType: "task", entityId: 30, direction: "up" },
    { services },
  );
  assert.equal(taskResult.parents.lawsuit.id, 20);
  assert.equal(taskResult.parents.dossier.id, 10);
  assert.equal(taskResult.parents.client.id, 1);

  const missionResult = await getEntityGraphTool.handler(
    { entityType: "mission", entityId: 40, direction: "up" },
    { services },
  );
  assert.equal(missionResult.parents.lawsuit.id, 20);
  assert.equal(missionResult.parents.dossier.id, 10);
  assert.equal(missionResult.parents.client.id, 1);

  const sessionResult = await getEntityGraphTool.handler(
    { entityType: "session", entityId: 50, direction: "up" },
    { services },
  );
  assert.equal(sessionResult.parents.lawsuit.id, 20);
  assert.equal(sessionResult.parents.dossier.id, 10);
  assert.equal(sessionResult.parents.client.id, 1);

  const documentResult = await getEntityGraphTool.handler(
    { entityType: "document", entityId: 60, direction: "up" },
    { services },
  );
  assert.equal(documentResult.parents.task.id, 30);
  assert.equal(documentResult.parents.lawsuit.id, 20);
  assert.equal(documentResult.parents.dossier.id, 10);
  assert.equal(documentResult.parents.client.id, 1);
});

test("getEntityGraph applies child caps and returns deterministic meta/metrics", async () => {
  const services = createStubServices();
  const tasks = [];
  for (let index = 1; index <= 55; index += 1) {
    tasks.push({
      id: 100 + index,
      dossier_id: 10,
      title: `Task ${index}`,
      status: index % 2 === 0 ? "done" : "todo",
      priority: index % 3 === 0 ? "urgent" : "medium",
      due_date: "2030-01-10T00:00:00.000Z",
      created_at: "2026-01-01T00:00:00.000Z",
      updated_at: "2026-01-02T00:00:00.000Z",
    });
  }

  services.tasks.listByDossier = () => tasks.map((row) => ({ ...row }));

  const result = await getEntityGraphTool.handler(
    {
      entityType: "dossier",
      entityId: 10,
      direction: "down",
      depth: 1,
      include: ["tasks"],
    },
    { services },
  );

  assert.equal(result.children.tasks.length, 50);
  assert.equal(result.meta.truncated, true);
  assert.equal(result.meta.totalBeforeCap, 55);
  assert.equal(result.metrics.totalTasks, 50);
  assert.ok(typeof result.metrics.openTasks === "number");
  assert.ok(typeof result.metrics.completedTasks === "number");
  assert.ok("latestActivity" in result.metrics);
  assert.ok("earliestUpcoming" in result.metrics);
});

test("getEntityGraph direction up returns parents only with zero child totals", async () => {
  const services = createStubServices();
  const result = await getEntityGraphTool.handler(
    { entityType: "lawsuit", entityId: 20, direction: "up", depth: 2 },
    { services },
  );

  assert.deepEqual(result.children, {});
  assert.equal(result.metrics.totalDossiers, 0);
  assert.equal(result.metrics.totalLawsuits, 0);
  assert.equal(result.metrics.totalTasks, 0);
  assert.equal(result.meta.totalBeforeCap, 0);
});

test("getEntityGraph traversal modules do not use full-table service.list()", () => {
  const traversalPath = path.resolve(
    __dirname,
    "../../tools/read/graph.traversal.js",
  );
  const toolPath = path.resolve(
    __dirname,
    "../../tools/read/getEntityGraph.tool.js",
  );

  const traversalSource = fs.readFileSync(traversalPath, "utf8");
  const toolSource = fs.readFileSync(toolPath, "utf8");

  assert.equal(/\.list\(/.test(traversalSource), false);
  assert.equal(/\.list\(/.test(toolSource), false);
});
