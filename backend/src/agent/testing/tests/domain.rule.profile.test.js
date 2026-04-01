"use strict";

const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");

const { DomainRuleProfile } = resolveRuleProfileModule();

test("domain rule profile: client inactive transition is blocked by open dependencies", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const result = await profile.validateOperation({
    operation: "update",
    entityType: "client",
    entityId: 1,
    changes: { status: "inActive" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockerCounts.open_dossiers, 1);
  assert.equal(result.blockerCounts.open_lawsuits, 1);
  assert.equal(result.blockerCounts.open_tasks, 2);
  assert.equal(result.blockerCounts.open_sessions, 1);
  assert.equal(result.blockerCounts.active_missions, 2);
  assert.equal(result.blockerCounts.unpaid_receivables, 1);
});

test("domain rule profile: dossier closed transition is blocked by unresolved descendants", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const result = await profile.validateOperation({
    operation: "update",
    entityType: "dossier",
    entityId: 11,
    changes: { status: "closed" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockerCounts.open_lawsuits, 1);
  assert.equal(result.blockerCounts.open_tasks, 2);
  assert.equal(result.blockerCounts.open_sessions, 1);
  assert.equal(result.blockerCounts.active_missions, 2);
  assert.equal(result.blockerCounts.unpaid_receivables, 1);
});

test("domain rule profile: lawsuit closed transition is blocked by unresolved descendants", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const result = await profile.validateOperation({
    operation: "update",
    entityType: "lawsuit",
    entityId: 21,
    changes: { status: "Closed" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockerCounts.open_tasks, 1);
  assert.equal(result.blockerCounts.open_sessions, 1);
  assert.equal(result.blockerCounts.active_missions, 1);
});

test("domain rule profile: officer inactive transition is blocked by active missions", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const result = await profile.validateOperation({
    operation: "update",
    entityType: "officer",
    entityId: 90,
    changes: { status: "inactive" },
  });

  assert.equal(result.allowed, false);
  assert.equal(result.blockerCounts.active_missions, 1);
});

test("domain rule profile: delete transitions report linked-child blockers", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const clientDelete = await profile.validateOperation({
    operation: "delete",
    entityType: "client",
    entityId: 1,
  });
  assert.equal(clientDelete.allowed, false);
  assert.equal(clientDelete.blockerCounts.linked_dossiers, 2);

  const dossierDelete = await profile.validateOperation({
    operation: "delete",
    entityType: "dossier",
    entityId: 11,
  });
  assert.equal(dossierDelete.allowed, false);
  assert.equal(dossierDelete.blockerCounts.linked_lawsuits, 1);
  assert.equal(dossierDelete.blockerCounts.linked_tasks, 1);
  assert.equal(dossierDelete.blockerCounts.linked_sessions, 0);
  assert.equal(dossierDelete.blockerCounts.linked_missions, 1);

  const lawsuitDelete = await profile.validateOperation({
    operation: "delete",
    entityType: "lawsuit",
    entityId: 21,
  });
  assert.equal(lawsuitDelete.allowed, false);
  assert.equal(lawsuitDelete.blockerCounts.linked_tasks, 1);
  assert.equal(lawsuitDelete.blockerCounts.linked_sessions, 1);
  assert.equal(lawsuitDelete.blockerCounts.linked_missions, 1);
});

test("domain rule profile: transitions are allowed when no blockers remain", async () => {
  const profile = createProfileWithFixtures(createCleanFixtures());

  const clientInactive = await profile.validateOperation({
    operation: "update",
    entityType: "client",
    entityId: 2,
    changes: { status: "inactive" },
  });
  assert.equal(clientInactive.allowed, true);

  const dossierClosed = await profile.validateOperation({
    operation: "update",
    entityType: "dossier",
    entityId: 24,
    changes: { status: "closed" },
  });
  assert.equal(dossierClosed.allowed, true);

  const lawsuitClosed = await profile.validateOperation({
    operation: "update",
    entityType: "lawsuit",
    entityId: 34,
    changes: { status: "closed" },
  });
  assert.equal(lawsuitClosed.allowed, true);
});

test("domain rule profile parity: frontend status aliases map to the same blocked transitions", async () => {
  const profile = createProfileWithFixtures(createBlockedFixtures());

  const clientInactiveAlias = await profile.validateOperation({
    operation: "update",
    entityType: "client",
    entityId: 1,
    changes: { status: "in_active" },
  });
  assert.equal(clientInactiveAlias.allowed, false);
  assert.equal(clientInactiveAlias.blockerCounts.open_dossiers, 1);

  const dossierArchiveAlias = await profile.validateOperation({
    operation: "update",
    entityType: "dossier",
    entityId: 11,
    changes: { status: "Archived" },
  });
  assert.equal(dossierArchiveAlias.allowed, false);
  assert.equal(dossierArchiveAlias.blockerCounts.open_lawsuits, 1);

  const lawsuitCloseAlias = await profile.validateOperation({
    operation: "update",
    entityType: "lawsuit",
    entityId: 21,
    changes: { status: "archive" },
  });
  assert.equal(lawsuitCloseAlias.allowed, false);
  assert.equal(lawsuitCloseAlias.blockerCounts.open_tasks, 1);
});

test("domain rule profile parity: child mutations are blocked when ancestors are closed/inactive", async () => {
  const profile = createProfileWithFixtures(createAncestorBlockedFixtures());

  const taskEditWithClosedAncestors = await profile.validateOperation({
    operation: "update",
    entityType: "task",
    entityId: 331,
    changes: { title: "Updated task title" },
  });
  assert.equal(taskEditWithClosedAncestors.allowed, false);
  assert.equal(taskEditWithClosedAncestors.blockerCounts.closed_dossier_ancestor, 1);
  assert.equal(taskEditWithClosedAncestors.blockerCounts.inactive_client_ancestor, 1);

  const lawsuitCreateUnderClosedDossier = await profile.validateOperation({
    operation: "create",
    entityType: "lawsuit",
    payload: { dossierId: 411, title: "New lawsuit under closed dossier" },
  });
  assert.equal(lawsuitCreateUnderClosedDossier.allowed, false);
  assert.equal(lawsuitCreateUnderClosedDossier.blockerCounts.closed_dossier_ancestor, 1);
  assert.equal(lawsuitCreateUnderClosedDossier.blockerCounts.inactive_client_ancestor, 1);
});

function createProfileWithFixtures(fixtures) {
  const profile = new DomainRuleProfile();
  profile.getService = (fileName) => fixtures[fileName] || null;
  return profile;
}

function createBlockedFixtures() {
  const clients = [{ id: 1, name: "Leila Ben Youssef", status: "active" }];
  const dossiers = [
    { id: 11, client_id: 1, reference: "D-11", status: "active" },
    { id: 12, client_id: 1, reference: "D-12", status: "closed" },
  ];
  const lawsuits = [{ id: 21, dossier_id: 11, lawsuit_number: "L-21", status: "open" }];
  const tasks = [
    { id: 31, dossier_id: 11, status: "todo" },
    { id: 33, lawsuit_id: 21, status: "pending" },
  ];
  const sessions = [{ id: 41, lawsuit_id: 21, status: "scheduled" }];
  const missions = [
    { id: 51, dossier_id: 11, status: "active" },
    { id: 52, lawsuit_id: 21, status: "active" },
    { id: 53, officer_id: 90, status: "active" },
  ];
  const financialEntries = [
    { id: 61, client_id: 1, direction: "receivable", status: "draft", paid_at: null },
    { id: 62, client_id: 1, direction: "receivable", status: "confirmed", paid_at: "2026-03-01T10:00:00.000Z" },
  ];
  const officers = [{ id: 90, name: "Officer Active", status: "active" }];

  return {
    "clients.service": createFixtureService(clients),
    "dossiers.service": createFixtureService(dossiers),
    "lawsuits.service": createFixtureService(lawsuits),
    "tasks.service": createFixtureService(tasks),
    "sessions.service": createFixtureService(sessions),
    "missions.service": createFixtureService(missions),
    "financial.service": createFixtureService(financialEntries),
    "officers.service": createFixtureService(officers),
  };
}

function createCleanFixtures() {
  const clients = [
    { id: 2, name: "Clean Client", status: "active" },
    { id: 4, name: "Clean Dossier Client", status: "active" },
    { id: 5, name: "Clean Lawsuit Client", status: "active" },
  ];
  const dossiers = [
    { id: 22, client_id: 2, reference: "D-22", status: "closed" },
    { id: 24, client_id: 4, reference: "D-24", status: "open" },
    { id: 25, client_id: 5, reference: "D-25", status: "open" },
  ];
  const lawsuits = [
    { id: 32, dossier_id: 22, lawsuit_number: "L-32", status: "closed" },
    { id: 34, dossier_id: 25, lawsuit_number: "L-34", status: "open" },
  ];
  const tasks = [];
  const sessions = [];
  const missions = [];
  const financialEntries = [
    { id: 72, client_id: 2, direction: "receivable", status: "confirmed", paid_at: "2026-03-01T10:00:00.000Z" },
    { id: 74, client_id: 4, direction: "receivable", status: "confirmed", paid_at: "2026-03-01T10:00:00.000Z" },
    { id: 75, client_id: 5, direction: "receivable", status: "confirmed", paid_at: "2026-03-01T10:00:00.000Z" },
  ];
  const officers = [{ id: 92, name: "Officer Clean", status: "active" }];

  return {
    "clients.service": createFixtureService(clients),
    "dossiers.service": createFixtureService(dossiers),
    "lawsuits.service": createFixtureService(lawsuits),
    "tasks.service": createFixtureService(tasks),
    "sessions.service": createFixtureService(sessions),
    "missions.service": createFixtureService(missions),
    "financial.service": createFixtureService(financialEntries),
    "officers.service": createFixtureService(officers),
  };
}

function createAncestorBlockedFixtures() {
  const clients = [{ id: 401, name: "Inactive Ancestor Client", status: "inactive" }];
  const dossiers = [{ id: 411, client_id: 401, reference: "D-411", status: "closed" }];
  const lawsuits = [{ id: 421, dossier_id: 411, lawsuit_number: "L-421", status: "closed" }];
  const tasks = [{ id: 331, lawsuit_id: 421, status: "todo", title: "Blocked child task" }];
  const sessions = [];
  const missions = [];
  const financialEntries = [];
  const officers = [];

  return {
    "clients.service": createFixtureService(clients),
    "dossiers.service": createFixtureService(dossiers),
    "lawsuits.service": createFixtureService(lawsuits),
    "tasks.service": createFixtureService(tasks),
    "sessions.service": createFixtureService(sessions),
    "missions.service": createFixtureService(missions),
    "financial.service": createFixtureService(financialEntries),
    "officers.service": createFixtureService(officers),
  };
}

function createFixtureService(rows) {
  const safeRows = Array.isArray(rows) ? rows : [];
  return {
    list: () => safeRows,
    get: (id) => safeRows.find((row) => String(row?.id) === String(id)) || null,
    listByClient: (clientId) =>
      safeRows.filter((row) => String(row?.client_id ?? row?.clientId) === String(clientId)),
    listByDossier: (dossierId) =>
      safeRows.filter((row) => String(row?.dossier_id ?? row?.dossierId) === String(dossierId)),
    listByLawsuit: (lawsuitId) =>
      safeRows.filter((row) => String(row?.lawsuit_id ?? row?.lawsuitId) === String(lawsuitId)),
  };
}

function resolveRuleProfileModule() {
  const candidates = [
    path.resolve(__dirname, "../../../.agent-build/agent/domain/rule.profile"),
    path.resolve(__dirname, "../../.agent-build/agent/domain/rule.profile"),
    path.resolve(process.cwd(), ".agent-build/agent/domain/rule.profile"),
    path.resolve(process.cwd(), "backend/.agent-build/agent/domain/rule.profile"),
  ];
  for (const candidate of candidates) {
    try {
      const resolved = require.resolve(candidate);
      return require(resolved);
    } catch {
      continue;
    }
  }
  throw new Error(
    `Unable to resolve rule profile module for tests. Run build first. Tried: ${candidates.join(", ")}`,
  );
}
