"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  StorageHint,
  normalizeActiveScope,
  normalizeStorageHint,
  resolveStorageTarget,
} = require("./document.storage.resolver");

test("normalizeStorageHint supports inherit and explicit hints", () => {
  assert.equal(normalizeStorageHint("inherit"), "inherit");
  assert.equal(normalizeStorageHint("DOSSIER"), "dossier");
  assert.equal(normalizeStorageHint("unknown"), null);
});

test("normalizeActiveScope maps aliases and entityType/entityId", () => {
  const scope = normalizeActiveScope({
    dossier_id: 14,
    entity_type: "client",
    entity_id: 9,
  });
  assert.equal(scope.dossierId, 14);
  assert.equal(scope.clientId, 9);
});

test("inherit mode picks deepest hierarchy (dossier over client)", () => {
  const resolved = resolveStorageTarget({
    activeScope: {
      clientId: 3,
      dossierId: 11,
    },
  });
  assert.deepEqual(resolved, {
    entityType: "dossier",
    entityId: 11,
    resolutionMode: "inherit",
  });
});

test("inherit mode picks deepest among full hierarchy", () => {
  const resolved = resolveStorageTarget({
    activeScope: {
      clientId: 1,
      dossierId: 2,
      lawsuitId: 3,
      financialEntryId: 4,
      missionId: 5,
      sessionId: 6,
      taskId: 7,
    },
    storageHint: StorageHint.INHERIT,
  });
  assert.equal(resolved.entityType, "task");
  assert.equal(resolved.entityId, 7);
});

test("explicit hint overrides deeper inherited scope", () => {
  const resolved = resolveStorageTarget({
    activeScope: {
      taskId: 200,
      clientId: 99,
    },
    storageHint: StorageHint.CLIENT,
  });
  assert.deepEqual(resolved, {
    entityType: "client",
    entityId: 99,
    resolutionMode: "hint",
  });
});

test("explicit hint missing scope throws STORAGE_SCOPE_MISSING", () => {
  assert.throws(
    () =>
      resolveStorageTarget({
        activeScope: { taskId: 4 },
        storageHint: StorageHint.CLIENT,
      }),
    (error) => String(error?.code || "") === "STORAGE_SCOPE_MISSING",
  );
});

test("no scope throws STORAGE_SCOPE_MISSING", () => {
  assert.throws(
    () => resolveStorageTarget({ activeScope: {} }),
    (error) => String(error?.code || "") === "STORAGE_SCOPE_MISSING",
  );
});

