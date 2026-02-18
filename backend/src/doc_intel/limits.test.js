"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { getDocumentIntelLimits } = require("./limits");

test("document intel limits provide safe defaults", () => {
  const limits = getDocumentIntelLimits();
  assert.ok(limits.maxPagesAuto >= 1);
  assert.ok(limits.maxPagesHard >= limits.maxPagesAuto);
  assert.ok(limits.renderScale >= 1.0);
  assert.ok(limits.workerTimeoutMs >= 1000);
});

