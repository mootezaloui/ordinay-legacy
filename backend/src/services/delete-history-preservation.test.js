"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

function tmpDbPath(name) {
  return path.join(
    os.tmpdir(),
    `ordinay-${name}-${Date.now()}-${Math.random().toString(16).slice(2)}.sqlite`,
  );
}

function clearBackendCache() {
  Object.keys(require.cache).forEach((key) => {
    if (key.includes(`${path.sep}backend${path.sep}src${path.sep}`)) {
      delete require.cache[key];
    }
  });
}

function removeSqliteArtifacts(dbPath) {
  for (const suffix of ["", "-wal", "-shm"]) {
    try {
      fs.unlinkSync(dbPath + suffix);
    } catch {}
  }
}

test("deleting client preserves prior history rows and appends entity_deleted + audit", async () => {
  const dbPath = tmpDbPath("delete-history");
  const prevDbFile = process.env.DB_FILE;

  process.env.DB_FILE = dbPath;
  clearBackendCache();

  const clientsService = require("./clients.service");
  const historyService = require("./history.service");
  const auditMutations = require("./auditMutations.service");
  const db = require("../db/connection");

  try {
    const client = clientsService.create({ name: "Audit Test Client", status: "active" });
    assert.ok(client?.id);

    const priorHistory = historyService.create({
      entity_type: "client",
      entity_id: client.id,
      action: "note",
      description: "pre-delete history row",
    });
    assert.ok(priorHistory?.id);

    const removed = clientsService.remove(client.id);
    assert.equal(removed, true);

    const historyRows = db
      .prepare(
        `SELECT action, description
         FROM history_events
         WHERE entity_type = 'client' AND entity_id = @id
         ORDER BY id ASC`,
      )
      .all({ id: client.id });

    assert.ok(historyRows.some((r) => r.description === "pre-delete history row"));
    assert.ok(historyRows.some((r) => r.action === "entity_deleted"));

    const auditRows = auditMutations.listByEntity("client", client.id);
    assert.ok(auditRows.some((r) => r.operation === "delete"));
  } finally {
    try {
      db.close();
    } catch {}
    clearBackendCache();
    if (prevDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = prevDbFile;
    removeSqliteArtifacts(dbPath);
  }
});
