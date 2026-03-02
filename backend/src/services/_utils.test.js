"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeData } = require("./_utils");

test("normalizeData maps localized task status and priority to canonical enum", () => {
  const normalized = normalizeData({
    status: "Non commencée",
    priority: "Moyenne",
  });
  assert.equal(normalized.status, "todo");
  assert.equal(normalized.priority, "medium");
});

test("normalizeData keeps canonical task enums stable", () => {
  const normalized = normalizeData({
    status: "todo",
    priority: "medium",
  });
  assert.equal(normalized.status, "todo");
  assert.equal(normalized.priority, "medium");
});

