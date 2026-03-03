"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  getIntentExecutionPolicy,
  isGlobalSafeIntent,
  requiresScope,
  preferredExecutionPath,
} = require("./intentExecution.contract");

test("LIST_TASKS policy is global-safe and scope-optional", () => {
  const policy = getIntentExecutionPolicy("LIST_TASKS");
  assert.equal(policy.globalSafe, true);
  assert.equal(policy.scopeRequired, false);
  assert.equal(preferredExecutionPath("LIST_TASKS"), "direct");
  assert.equal(isGlobalSafeIntent("LIST_TASKS"), true);
  assert.equal(requiresScope("LIST_TASKS"), false);
});

test("LIST_CLIENTS policy is global-safe and scope-optional", () => {
  const policy = getIntentExecutionPolicy("LIST_CLIENTS");
  assert.equal(policy.globalSafe, true);
  assert.equal(policy.scopeRequired, false);
  assert.equal(preferredExecutionPath("LIST_CLIENTS"), "direct");
  assert.equal(isGlobalSafeIntent("LIST_CLIENTS"), true);
  assert.equal(policy.reasonCode, "global_safe_collection_listing");
});

test("LIST_DOSSIERS and LIST_LAWSUITS are global-safe", () => {
  const dossiers = getIntentExecutionPolicy("LIST_DOSSIERS");
  const lawsuits = getIntentExecutionPolicy("LIST_LAWSUITS");
  assert.equal(dossiers.globalSafe, true);
  assert.equal(lawsuits.globalSafe, true);
  assert.equal(dossiers.scopeRequired, false);
  assert.equal(lawsuits.scopeRequired, false);
  assert.equal(dossiers.reasonCode, "global_safe_collection_listing");
  assert.equal(lawsuits.reasonCode, "global_safe_collection_listing");
  assert.equal(isGlobalSafeIntent("LIST_DOSSIERS"), true);
  assert.equal(isGlobalSafeIntent("LIST_LAWSUITS"), true);
});

test("auxiliary LIST intents remain global-safe across entity types", () => {
  const intents = [
    "LIST_PERSONAL_TASKS",
    "LIST_OFFICERS",
    "LIST_OVERDUE_TASKS",
    "LIST_UPCOMING_SESSIONS",
  ];
  for (const intent of intents) {
    const policy = getIntentExecutionPolicy(intent);
    assert.equal(policy.globalSafe, true, intent);
    assert.equal(policy.scopeRequired, false, intent);
    assert.equal(policy.reasonCode, "global_safe_collection_listing", intent);
    assert.equal(isGlobalSafeIntent(intent), true, intent);
  }
});

test("READ_TASK policy requires scope", () => {
  const policy = getIntentExecutionPolicy("READ_TASK");
  assert.equal(policy.globalSafe, false);
  assert.equal(policy.scopeRequired, true);
  assert.equal(requiresScope("READ_TASK"), true);
});

test("SUMMARIZE intent scope requirement supports aggregate override", () => {
  assert.equal(requiresScope("SUMMARIZE_DOSSIER", { aggregateSummary: false }), true);
  assert.equal(requiresScope("SUMMARIZE_DOSSIER", { aggregateSummary: true }), false);
});
