"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  inferLastResolvedFromGraphResult,
  inferLastResolvedFromToolExecutions,
} = require("./scopedEntityContext");

test("inferLastResolvedFromGraphResult prefers a single open dossier under a client graph", () => {
  const inferred = inferLastResolvedFromGraphResult({
    root: { type: "client", id: 12, name: "Omar Ben Salah" },
    children: {
      dossiers: [
        { type: "dossier", id: 87, title: "Divorce Case #2024-087", status: "open" },
        { type: "dossier", id: 88, title: "Archived Matter", status: "closed" },
      ],
    },
  });

  assert.deepEqual(inferred, {
    type: "dossier",
    id: 87,
    label: "Divorce Case #2024-087",
  });
});

test("inferLastResolvedFromToolExecutions promotes a single dossier from direct list reads", () => {
  const inferred = inferLastResolvedFromToolExecutions([
    {
      toolName: "listDossiersForClient",
      result: {
        dossiers: [
          { id: 87, title: "Divorce Case #2024-087", status: "open" },
          { id: 88, title: "Old Matter", status: "closed" },
        ],
      },
    },
  ]);

  assert.deepEqual(inferred, {
    type: "dossier",
    id: 87,
    label: "Divorce Case #2024-087",
  });
});
