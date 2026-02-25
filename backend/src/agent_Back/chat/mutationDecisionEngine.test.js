"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  isStrongMutationIntent,
  isWeakMutationIntent,
  normalizeMutationSemantics,
  decideMutationMode,
} = require("./mutationDecisionEngine");

test("isStrongMutationIntent detects ownership negation mutation phrasing", () => {
  assert.equal(isStrongMutationIntent("client mootez aloui is not mine anymore"), true);
  assert.equal(isStrongMutationIntent("Mootez Aloui is not my client anymore"), true);
  assert.equal(isStrongMutationIntent("what should I do if a client is no longer mine?"), false);
});

test("decideMutationMode enforces deterministic matrix", () => {
  const strongResolved = decideMutationMode({
    message: "client mootez aloui is not mine anymore",
    mutationIntent: { entityId: 12, routeDecision: "orchestrate" },
  });
  assert.equal(strongResolved.decision, "FORCE_MUTATION_PROPOSAL");
  assert.equal(strongResolved.mode, "execution");

  const strongUnresolved = decideMutationMode({
    message: "client mootez aloui is not mine anymore",
    mutationIntent: null,
  });
  assert.equal(strongUnresolved.decision, "CLARIFY_ENTITY");
  assert.equal(strongUnresolved.mode, "clarification");

  const advisory = decideMutationMode({
    message: "what should I do if a client is no longer mine?",
    mutationIntent: null,
  });
  assert.equal(advisory.decision, "ADVISORY_RESPONSE");
  assert.equal(advisory.mode, "informational");

  const informational = decideMutationMode({
    message: "show client mootez aloui",
    mutationIntent: { entityId: 12, routeDecision: "clarify" },
  });
  assert.equal(isWeakMutationIntent("show client mootez aloui"), false);
  assert.equal(informational.decision, "INFORMATIONAL_ENTITY_RESPONSE");
});

test("normalizeMutationSemantics maps EN/FR/AR ownership-loss, death, transfer to deterministic client inactivity route", () => {
  const cases = [
    "client mootez aloui is dead",
    "i have transfered the client mootez aloui to another lawyer",
    "je viens de perdre mon client Mootez aloui",
    "فقدت موكلي Mootez aloui",
  ];
  for (const input of cases) {
    const semantic = normalizeMutationSemantics(input);
    assert.equal(semantic.strongMutationIntent, true, input);
    assert.equal(semantic.entityTypeHint, "client", input);
    assert.equal(semantic.capabilityRoute, "single_field_status_inactive", input);
    assert.equal(semantic.normalizedPayloadHint?.field, "status", input);
    assert.equal(String(semantic.normalizedPayloadHint?.value).toLowerCase(), "inactive", input);
    assert.match(String(semantic.canonicalMessage || ""), /not my client anymore/i, input);
  }
});
