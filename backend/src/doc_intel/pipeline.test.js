"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { _internals } = require("./pipeline");

test("buildPageRange auto stops at maxPagesAuto and sets continue", () => {
  const limits = { maxPagesAuto: 5, maxPagesHard: 25 };
  const range = _internals.buildPageRange(18, "auto", limits, []);
  assert.equal(range.pages.length, 5);
  assert.equal(range.needsUserContinue, true);
  assert.equal(range.remainingPages.length, 13);
});

test("buildPageRange full respects maxPagesHard", () => {
  const limits = { maxPagesAuto: 5, maxPagesHard: 25 };
  const range = _internals.buildPageRange(40, "full", limits, []);
  assert.equal(range.pages.length, 25);
  assert.equal(range.needsUserContinue, true);
  assert.equal(range.remainingPages.length, 15);
});

test("shouldReadable enforces non-empty OCR minimum text", () => {
  assert.equal(_internals.shouldReadable(""), false);
  assert.equal(_internals.shouldReadable("hello"), true);
});

test("hasSubstantiveText rejects symbol-only payloads", () => {
  assert.equal(_internals.hasSubstantiveText("• • • • • • •"), false);
  assert.equal(_internals.hasSubstantiveText("DevOps pipeline and CI automation."), true);
});
