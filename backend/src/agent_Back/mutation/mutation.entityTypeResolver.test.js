"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { resolveEntityTypeFromMessage } = require("./mutation.entityTypeResolver");

const KNOWN = [
  "client",
  "dossier",
  "lawsuit",
  "task",
  "personal_task",
  "session",
  "mission",
  "financial_entry",
  "document",
  "note",
];

test("explicit noun beats previous mutation inertia (task after lawsuit)", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "create a task for tomorrow",
    knownEntityTypes: KNOWN,
    previousMutationContext: { entityType: "lawsuit" },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "task");
  assert.equal(result.source, "explicit_noun");
});

test("schedule a session resolves to session", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "schedule a session next week",
    knownEntityTypes: KNOWN,
    previousMutationContext: null,
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "session");
});

test("add note resolves to note", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "add note about spouse response",
    knownEntityTypes: KNOWN,
    previousMutationContext: { entityType: "lawsuit" },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "note");
});

test("hearing resolves to session", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "schedule a hearing next week",
    knownEntityTypes: KNOWN,
    previousMutationContext: null,
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "session");
});

test("personal task phrase wins over generic task/client nouns", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "create a personal task to call the client",
    knownEntityTypes: KNOWN,
    previousMutationContext: { entityType: "lawsuit" },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "personal_task");
});

test("no explicit noun returns none (no forced reuse)", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage: "create something",
    knownEntityTypes: KNOWN,
    previousMutationContext: { entityType: "lawsuit" },
  });
  assert.equal(result.status, "none");
  assert.equal(result.entityType, null);
});

test("action-anchor chooses task over earlier lawsuit mentions", () => {
  const result = resolveEntityTypeFromMessage({
    userMessage:
      "okay we created the lawsuit, now lets create a task for me to go to court and check",
    knownEntityTypes: KNOWN,
    previousMutationContext: { entityType: "lawsuit" },
  });
  assert.equal(result.status, "resolved");
  assert.equal(result.entityType, "task");
});
