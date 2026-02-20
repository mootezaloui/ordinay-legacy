"use strict";

const assert = require("assert");

const clientsService = require("../../../services/clients.service");
const dossiersService = require("../../../services/dossiers.service");
const lawsuitsService = require("../../../services/lawsuits.service");
const tasksService = require("../../../services/tasks.service");
const missionsService = require("../../../services/missions.service");
const sessionsService = require("../../../services/sessions.service");
const documentsService = require("../../../services/documents.service");
const getEntityGraphTool = require("./getEntityGraph.tool");

function daysFromNow(days) {
  const value = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
  return value.toISOString();
}

function buildFixture() {
  return {
    clients: [
      { id: 1, name: "Client A", status: "active", created_at: daysFromNow(-200), updated_at: daysFromNow(-5) },
      { id: 2, name: "Client B", status: "active", created_at: daysFromNow(-100), updated_at: daysFromNow(-3) },
    ],
    dossiers: [
      { id: 10, client_id: 1, title: "Dossier Alpha", status: "open", priority: "high", next_deadline: daysFromNow(2), created_at: daysFromNow(-60), updated_at: daysFromNow(-2) },
      { id: 11, client_id: 1, title: "Dossier Beta", status: "in_progress", priority: "medium", next_deadline: daysFromNow(20), created_at: daysFromNow(-40), updated_at: daysFromNow(-1) },
      { id: 12, client_id: 2, title: "Dossier Gamma", status: "open", priority: "low", next_deadline: daysFromNow(12), created_at: daysFromNow(-30), updated_at: daysFromNow(-1) },
    ],
    lawsuits: [
      { id: 20, dossier_id: 10, title: "Lawsuit A1", status: "in_progress", priority: "urgent", next_hearing: daysFromNow(3), created_at: daysFromNow(-30), updated_at: daysFromNow(-1) },
      { id: 21, dossier_id: 11, title: "Lawsuit B1", status: "open", priority: "medium", next_hearing: daysFromNow(15), created_at: daysFromNow(-25), updated_at: daysFromNow(-1) },
    ],
    tasks: [
      { id: 30, dossier_id: 10, lawsuit_id: null, title: "Task dossier A", status: "in_progress", priority: "high", due_date: daysFromNow(1), created_at: daysFromNow(-20), updated_at: daysFromNow(-1) },
      { id: 31, dossier_id: null, lawsuit_id: 20, title: "Task lawsuit A1", status: "todo", priority: "medium", due_date: daysFromNow(-1), created_at: daysFromNow(-18), updated_at: daysFromNow(-1) },
      { id: 32, dossier_id: 11, lawsuit_id: null, title: "Task dossier B", status: "todo", priority: "low", due_date: daysFromNow(8), created_at: daysFromNow(-10), updated_at: daysFromNow(-1) },
      { id: 33, dossier_id: 12, lawsuit_id: null, title: "Task dossier C", status: "todo", priority: "low", due_date: daysFromNow(9), created_at: daysFromNow(-8), updated_at: daysFromNow(-1) },
    ],
    missions: [
      { id: 40, dossier_id: null, lawsuit_id: 20, title: "Mission lawsuit A1", status: "in_progress", priority: "medium", due_date: daysFromNow(4), created_at: daysFromNow(-7), updated_at: daysFromNow(-1) },
      { id: 41, dossier_id: 10, lawsuit_id: null, title: "Mission dossier A", status: "planned", priority: "high", due_date: daysFromNow(5), created_at: daysFromNow(-7), updated_at: daysFromNow(-1) },
      { id: 42, dossier_id: 11, lawsuit_id: null, title: "Mission dossier B", status: "planned", priority: "medium", due_date: daysFromNow(25), created_at: daysFromNow(-5), updated_at: daysFromNow(-1) },
    ],
    sessions: [
      { id: 50, dossier_id: 10, lawsuit_id: null, title: "Session dossier A", status: "scheduled", scheduled_at: daysFromNow(6), created_at: daysFromNow(-6), updated_at: daysFromNow(-1) },
      { id: 51, dossier_id: null, lawsuit_id: 20, title: "Session lawsuit A1", status: "scheduled", scheduled_at: daysFromNow(2), created_at: daysFromNow(-4), updated_at: daysFromNow(-1) },
      { id: 52, dossier_id: 11, lawsuit_id: null, title: "Session dossier B", status: "confirmed", scheduled_at: daysFromNow(18), created_at: daysFromNow(-3), updated_at: daysFromNow(-1) },
    ],
    documents: [
      { id: 60, title: "Dossier Alpha brief", dossier_id: 10, client_id: null, lawsuit_id: null, mission_id: null, task_id: null, session_id: null, uploaded_at: daysFromNow(-2), updated_at: daysFromNow(-1) },
      { id: 61, title: "Lawsuit A1 filing", dossier_id: null, client_id: null, lawsuit_id: 20, mission_id: null, task_id: null, session_id: null, uploaded_at: daysFromNow(-1), updated_at: daysFromNow(-1) },
      { id: 62, title: "Client A ID", dossier_id: null, client_id: 1, lawsuit_id: null, mission_id: null, task_id: null, session_id: null, uploaded_at: daysFromNow(-5), updated_at: daysFromNow(-1) },
    ],
  };
}

function applyFixture(fixture) {
  clientsService.list = () => fixture.clients.map((row) => ({ ...row }));
  dossiersService.list = () => fixture.dossiers.map((row) => ({ ...row }));
  lawsuitsService.list = () => fixture.lawsuits.map((row) => ({ ...row }));
  tasksService.list = () => fixture.tasks.map((row) => ({ ...row }));
  missionsService.list = () => fixture.missions.map((row) => ({ ...row }));
  sessionsService.list = () => fixture.sessions.map((row) => ({ ...row }));
  documentsService.list = () => fixture.documents.map((row) => ({ ...row }));
}

function backupServiceMethods() {
  return {
    clientsList: clientsService.list,
    dossiersList: dossiersService.list,
    lawsuitsList: lawsuitsService.list,
    tasksList: tasksService.list,
    missionsList: missionsService.list,
    sessionsList: sessionsService.list,
    documentsList: documentsService.list,
  };
}

function restoreServiceMethods(backup) {
  clientsService.list = backup.clientsList;
  dossiersService.list = backup.dossiersList;
  lawsuitsService.list = backup.lawsuitsList;
  tasksService.list = backup.tasksList;
  missionsService.list = backup.missionsList;
  sessionsService.list = backup.sessionsList;
  documentsService.list = backup.documentsList;
}

async function testClientFullDownGraph() {
  const graph = await getEntityGraphTool.handler({
    entityType: "client",
    entityId: 1,
    depth: 2,
    direction: "down",
  });

  assert.strictEqual(graph.root.type, "client");
  assert.strictEqual(graph.root.id, 1);
  assert.strictEqual(graph.metrics.totalDossiers, 2);
  assert.strictEqual(graph.metrics.totalLawsuits, 2);
  assert.strictEqual(graph.metrics.totalTasks, 2);
  assert.strictEqual(graph.metrics.totalMissions, 2);
  assert.strictEqual(graph.metrics.totalSessions, 2);
  assert.strictEqual(graph.metrics.totalDocuments, 3);
}

async function testDossierUpAndDown() {
  const graph = await getEntityGraphTool.handler({
    entityType: "dossier",
    entityId: 10,
    depth: 2,
    direction: "both",
  });

  assert.ok(graph.parents.client, "Expected dossier parent client");
  assert.strictEqual(graph.parents.client.id, 1);
  assert.strictEqual(graph.metrics.totalLawsuits, 1);
  assert.strictEqual(graph.metrics.totalTasks, 2);
  assert.strictEqual(graph.metrics.totalMissions, 2);
  assert.strictEqual(graph.metrics.totalSessions, 2);
  assert.strictEqual(graph.metrics.totalDocuments, 2);
}

async function testLawsuitUpAndChildren() {
  const graph = await getEntityGraphTool.handler({
    entityType: "lawsuit",
    entityId: 20,
    depth: 2,
    direction: "both",
  });

  assert.ok(graph.parents.dossier, "Expected lawsuit parent dossier");
  assert.strictEqual(graph.parents.dossier.id, 10);
  assert.strictEqual(graph.metrics.totalTasks, 1);
  assert.strictEqual(graph.metrics.totalMissions, 1);
  assert.strictEqual(graph.metrics.totalSessions, 1);
  assert.ok(Array.isArray(graph.children.lawsuits), "Lawsuits category should be present");
  assert.strictEqual(graph.children.lawsuits.length, 0);
}

async function testTaskUpOnly() {
  const graph = await getEntityGraphTool.handler({
    entityType: "task",
    entityId: 31,
    direction: "up",
  });

  assert.ok(graph.parents.lawsuit, "Task parent should resolve to lawsuit");
  assert.strictEqual(graph.parents.lawsuit.id, 20);
  assert.deepStrictEqual(graph.children, {});
}

async function testAccessFilterAndContextFiltering() {
  const graph = await getEntityGraphTool.handler(
    {
      entityType: "dossier",
      entityId: 10,
      depth: 2,
      direction: "down",
      accessFilter: {
        dossiers: false,
        lawsuits: true,
        tasks: false,
        missions: true,
        sessions: true,
      },
    },
    {
      dataAccess: {
        sessions: false,
      },
    },
  );

  assert.ok(!("tasks" in graph.children), "Tasks should be omitted by accessFilter");
  assert.ok(!("sessions" in graph.children), "Sessions should be omitted by context.dataAccess");
  assert.ok(Array.isArray(graph.children.missions), "Missions should remain available");
}

async function testDepthOneVsDepthTwo() {
  const depth1 = await getEntityGraphTool.handler({
    entityType: "dossier",
    entityId: 10,
    depth: 1,
    direction: "down",
  });
  const depth2 = await getEntityGraphTool.handler({
    entityType: "dossier",
    entityId: 10,
    depth: 2,
    direction: "down",
  });

  assert.strictEqual(depth1.metrics.totalTasks, 1, "Depth 1 should only include direct dossier tasks");
  assert.strictEqual(depth2.metrics.totalTasks, 2, "Depth 2 should include lawsuit tasks");
}

async function testEdgeCases() {
  let missingThrown = false;
  try {
    await getEntityGraphTool.handler({
      entityType: "client",
      entityId: 99999,
      direction: "both",
    });
  } catch (error) {
    missingThrown = true;
    assert.strictEqual(error.type, "entity_not_found");
    assert.strictEqual(error.entityType, "client");
    assert.strictEqual(error.entityId, 99999);
  }
  assert.ok(missingThrown, "Expected structured entity_not_found error");

  const rootOnly = await getEntityGraphTool.handler({
    entityType: "dossier",
    entityId: 10,
    direction: "down",
    include: [],
  });
  assert.deepStrictEqual(rootOnly.children, {});
  assert.strictEqual(rootOnly.metrics.totalDossiers, 0);
  assert.strictEqual(rootOnly.metrics.totalTasks, 0);
}

async function run() {
  const backup = backupServiceMethods();
  try {
    applyFixture(buildFixture());
    await testClientFullDownGraph();
    await testDossierUpAndDown();
    await testLawsuitUpAndChildren();
    await testTaskUpOnly();
    await testAccessFilterAndContextFiltering();
    await testDepthOneVsDepthTwo();
    await testEdgeCases();
    console.log("getEntityGraph.tool.test.js: all tests passed");
  } finally {
    restoreServiceMethods(backup);
  }
}

run().catch((error) => {
  console.error("getEntityGraph.tool.test.js: failed");
  console.error(error);
  process.exitCode = 1;
});
