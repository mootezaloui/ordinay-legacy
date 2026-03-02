"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { clarificationAnswerMatcher } = require("./clarificationAnswerMatcher");

function pendingFixture() {
  return {
    entityType: "lawsuit",
    artifact: {
      type: "context_suggestion",
      entityType: "lawsuit",
      suggestions: [
        {
          entityType: "lawsuit",
          entityId: 101,
          label: "Commercial Dispute Alpha",
          reference: "LAW-2026-101",
          scope: { lawsuitId: 101 },
        },
        {
          entityType: "lawsuit",
          entityId: 102,
          label: "Commercial Dispute Beta",
          reference: "LAW-2026-102",
          scope: { lawsuitId: 102 },
        },
      ],
    },
  };
}

test("clarification matcher accepts exact candidate id", () => {
  const result = clarificationAnswerMatcher(pendingFixture(), "101");
  assert.equal(result.isAnswer, true);
  assert.equal(result.resolved?.kind, "selection");
  assert.equal(result.resolved?.entityId, 101);
});

test("clarification matcher accepts exact candidate reference token", () => {
  const result = clarificationAnswerMatcher(pendingFixture(), "LAW-2026-102");
  assert.equal(result.isAnswer, true);
  assert.equal(result.resolved?.kind, "selection");
  assert.equal(result.resolved?.entityId, 102);
});

test("clarification matcher accepts unique high-similarity label match", () => {
  const result = clarificationAnswerMatcher(pendingFixture(), "commercial dispute alpha");
  assert.equal(result.isAnswer, true);
  assert.equal(result.resolved?.kind, "selection");
  assert.equal(result.resolved?.entityId, 101);
});

test("clarification matcher rejects unrelated text", () => {
  const values = [
    "summarise what we have in the dossier",
    "hello",
    "hdsa",
  ];
  for (const message of values) {
    const result = clarificationAnswerMatcher(pendingFixture(), message);
    assert.equal(result.isAnswer, false, message);
  }
});

