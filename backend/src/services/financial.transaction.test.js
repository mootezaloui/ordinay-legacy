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

test("financial create rolls back entry and audit when later history write fails", async () => {
  const dbPath = tmpDbPath("financial-tx");
  const prevDbFile = process.env.DB_FILE;

  process.env.DB_FILE = dbPath;
  clearBackendCache();

  const db = require("../db/connection");
  const historyService = require("./history.service");
  const financialService = require("./financial.service");

  const originalCreate = historyService.create;
  historyService.create = function failingHistoryCreate(...args) {
    throw new Error("forced_history_failure_after_audit");
  };

  try {
    const clientInsert = db
      .prepare(`INSERT INTO clients (name, status) VALUES (@name, @status)`)
      .run({ name: "Tx Client", status: "active" });
    const clientId = clientInsert.lastInsertRowid;

    assert.throws(
      () =>
        financialService.create({
          scope: "client",
          client_id: clientId,
          entry_type: "income",
          amount: 123.45,
          currency: "USD",
          title: "Rollback Probe",
        }),
      /forced_history_failure_after_audit/,
    );

    const financialCount = db
      .prepare(`SELECT COUNT(*) AS count FROM financial_entries`)
      .get().count;
    const auditCount = db
      .prepare(`SELECT COUNT(*) AS count FROM audit_mutations`)
      .get().count;
    const historyCount = db
      .prepare(`SELECT COUNT(*) AS count FROM history_events WHERE entity_type = 'financial_entry'`)
      .get().count;

    assert.equal(financialCount, 0);
    assert.equal(auditCount, 0);
    assert.equal(historyCount, 0);
  } finally {
    historyService.create = originalCreate;
    try {
      db.close();
    } catch {}
    clearBackendCache();
    if (prevDbFile === undefined) delete process.env.DB_FILE;
    else process.env.DB_FILE = prevDbFile;
    removeSqliteArtifacts(dbPath);
  }
});
