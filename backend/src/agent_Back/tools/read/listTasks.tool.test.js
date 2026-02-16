"use strict";

const assert = require("assert");

const tasksService = require("../../../services/tasks.service");
const dossiersService = require("../../../services/dossiers.service");
const lawsuitsService = require("../../../services/lawsuits.service");
const clientsService = require("../../../services/clients.service");
const listTasksTool = require("./listTasks.tool");

function backupServiceMethods() {
  return {
    tasksList: tasksService.list,
    dossiersList: dossiersService.list,
    lawsuitsList: lawsuitsService.list,
    clientsList: clientsService.list,
  };
}

function restoreServiceMethods(backup) {
  tasksService.list = backup.tasksList;
  dossiersService.list = backup.dossiersList;
  lawsuitsService.list = backup.lawsuitsList;
  clientsService.list = backup.clientsList;
}

function applyFixture() {
  clientsService.list = () => [
    { id: 1, name: "Youssef Daly" },
    { id: 2, name: "Noor Eddine" },
  ];

  dossiersService.list = () => [
    { id: 3, reference: "DOS-2026-951469", title: "قضية طلاق زوجية", client_id: 1 },
    { id: 7, reference: "DOS-2026-198756", title: "دعوى إفلاس", client_id: 2 },
  ];

  lawsuitsService.list = () => [
    {
      id: 55,
      reference: "PRO-2026-055",
      lawsuit_number: "PRO-2026-055",
      title: "دعوى تجارية ضد الشركة",
      dossier_id: 3,
    },
  ];

  tasksService.list = () => [
    {
      id: 124,
      title: "مراجعة العقد",
      status: "todo",
      priority: "high",
      dossier_id: 3,
      lawsuit_id: null,
      due_date: "2026-02-17T08:00:00.000Z",
    },
    {
      id: 125,
      title: "إعداد الوثائق",
      status: "todo",
      priority: "medium",
      dossier_id: null,
      lawsuit_id: 55,
      due_date: "2026-02-18T08:00:00.000Z",
    },
  ];
}

async function testListTasksEnrichesLinkedEntities() {
  const result = await listTasksTool.handler({ status: "todo", limit: 50 });

  assert.strictEqual(result.count, 2);
  assert.ok(Array.isArray(result.tasks));

  const dossierTask = result.tasks.find((task) => task.id === 124);
  assert.ok(dossierTask, "Expected dossier-linked task");
  assert.strictEqual(dossierTask.dossier_id, 3);
  assert.strictEqual(dossierTask.linked_dossier?.reference, "DOS-2026-951469");
  assert.strictEqual(dossierTask.linked_dossier?.title, "قضية طلاق زوجية");
  assert.strictEqual(dossierTask.linked_dossier?.client_name, "Youssef Daly");
  assert.strictEqual(dossierTask.linked_lawsuit, null);

  const lawsuitTask = result.tasks.find((task) => task.id === 125);
  assert.ok(lawsuitTask, "Expected lawsuit-linked task");
  assert.strictEqual(lawsuitTask.lawsuit_id, 55);
  assert.strictEqual(lawsuitTask.linked_lawsuit?.reference, "PRO-2026-055");
  assert.strictEqual(lawsuitTask.linked_lawsuit?.title, "دعوى تجارية ضد الشركة");
  assert.strictEqual(lawsuitTask.linked_dossier?.reference, "DOS-2026-951469");
  assert.strictEqual(lawsuitTask.linked_dossier?.client_name, "Youssef Daly");
}

async function run() {
  const backup = backupServiceMethods();
  try {
    applyFixture();
    await testListTasksEnrichesLinkedEntities();
    console.log("listTasks.tool.test.js: all tests passed");
  } finally {
    restoreServiceMethods(backup);
  }
}

run().catch((error) => {
  console.error("listTasks.tool.test.js: failed");
  console.error(error);
  process.exitCode = 1;
});

