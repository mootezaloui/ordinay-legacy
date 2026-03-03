"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeTaskMutationPayload } = require("./taskMutationNormalization");

test("task.status 'pending' becomes 'todo' for create", () => {
  const payload = normalizeTaskMutationPayload(
    {
      title: "Review dossier",
      status: "pending",
      priority: "high",
    },
    { operation: "create" },
  );

  assert.equal(payload.status, "todo");
  assert.equal(payload.priority, "high");
});

