"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  runEntityIdentityPreflight,
  buildIdentityCollisionArtifact,
  buildContextSuggestionFromIdentityCollision,
} = require("./entityIdentityPreflight");

test("lawsuit preflight blocks semantic duplicate within the same dossier", async () => {
  const result = await runEntityIdentityPreflight(
    {
      entityType: "lawsuit",
      payload: {
        dossier_id: 18,
        title: "Child custody lawsuit",
        description: "We will go to court for custody of the kids",
      },
      userMessage: "Create a custody lawsuit for the kids",
    },
    {
      candidateRows: [
        {
          id: 7,
          dossier_id: 18,
          title: "Custody lawsuit",
          description: "Court action for child custody",
          status: "in_progress",
        },
      ],
    },
  );

  assert.equal(result.outcome, "duplicate_found");
  assert.equal(result.matchedEntity?.id, 7);
  const artifact = buildIdentityCollisionArtifact(result, { sessionId: "s1" });
  assert.equal(artifact.type, "identity_collision");
  assert.equal(artifact.sessionId, "s1");
  const suggestion = buildContextSuggestionFromIdentityCollision(artifact, {
    originalMessage: "Open a custody lawsuit",
  });
  assert.equal(suggestion.type, "context_suggestion");
  assert.equal(suggestion.suggestions.length, 1);
  assert.equal(suggestion.originalIntent, "READ_LAWSUIT");
  assert.equal(suggestion.originalMessage, null);
  assert.equal(suggestion.suggestions[0].label, "Custody lawsuit");
  assert.match(String(suggestion.suggestions[0].subtitle || ""), /in_progress/i);
});

test("lawsuit preflight allows another lawsuit in the same dossier when matter differs", async () => {
  const result = await runEntityIdentityPreflight(
    {
      entityType: "lawsuit",
      payload: {
        dossier_id: 18,
        title: "Child custody lawsuit",
        description: "Proceed with custody case",
      },
      userMessage: "Open a custody lawsuit",
    },
    {
      candidateRows: [
        {
          id: 3,
          dossier_id: 18,
          title: "Divorce lawsuit",
          description: "Proceeding for divorce",
          status: "in_progress",
        },
      ],
    },
  );

  assert.equal(result.outcome, "allow_create");
});

test("client preflight returns ambiguous match on same name without strong unique signals", async () => {
  const result = await runEntityIdentityPreflight(
    {
      entityType: "client",
      payload: {
        name: "Omar Ben Salah",
      },
      userMessage: "Create client Omar Ben Salah",
    },
    {
      candidateRows: [
        {
          id: 4,
          name: "Omar Ben Salah",
          status: "active",
        },
      ],
    },
  );

  assert.equal(result.outcome, "ambiguous_match");
  assert.equal(result.matchedEntity?.id, 4);
});
