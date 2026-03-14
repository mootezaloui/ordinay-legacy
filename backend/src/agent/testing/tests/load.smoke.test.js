"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { runLoadTest } = require("../load.runner");

test("load runner produces deterministic summary metrics", async () => {
  const summary = await runLoadTest({
    concurrency: 2,
    turnsPerWorker: 2,
    scenario: "simple_read_only_query",
  });

  assert.equal(summary.config.concurrency, 2);
  assert.equal(summary.config.turnsPerWorker, 2);
  assert.equal(summary.counters.success + summary.counters.failure, 4);
  assert.ok(summary.latency.sampleCount >= 4);
  assert.ok(Number.isFinite(summary.latency.avgMs));
  assert.ok(Number.isFinite(summary.latency.p95Ms));
});

