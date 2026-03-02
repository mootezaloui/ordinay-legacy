"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const clientsService = require("../../../services/clients.service");
const dossiersService = require("../../../services/dossiers.service");
const lawsuitsService = require("../../../services/lawsuits.service");
const tasksService = require("../../../services/tasks.service");
const missionsService = require("../../../services/missions.service");
const sessionsService = require("../../../services/sessions.service");
const documentsService = require("../../../services/documents.service");
const { getEntityGraph } = require("./getEntityGraph.tool");

function withStubbedList(service, nextList) {
  const original = service.list;
  service.list = () => nextList;
  return () => {
    service.list = original;
  };
}

test("client depth=2 with include=lawsuits traverses dossiers and returns lawsuits", async () => {
  const restores = [
    withStubbedList(clientsService, [{ id: 1, name: "Omar ben salah", status: "active" }]),
    withStubbedList(dossiersService, [
      { id: 10, client_id: 1, title: "Divorce", status: "open" },
    ]),
    withStubbedList(lawsuitsService, [
      { id: 20, dossier_id: 10, title: "Primary lawsuit", status: "open" },
    ]),
    withStubbedList(tasksService, []),
    withStubbedList(missionsService, []),
    withStubbedList(sessionsService, []),
    withStubbedList(documentsService, []),
  ];

  try {
    const result = await getEntityGraph({
      entityType: "client",
      entityId: 1,
      depth: 2,
      include: ["lawsuits"],
    });

    assert.ok(Array.isArray(result?.children?.lawsuits));
    assert.equal(result.children.lawsuits.length, 1);
    assert.equal(result.children.lawsuits[0].title, "Primary lawsuit");
  } finally {
    restores.reverse().forEach((restore) => restore());
  }
});

