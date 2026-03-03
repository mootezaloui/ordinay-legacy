"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { buildQueryIR } = require("./queryIR");
const { buildReadPlan } = require("../read/readPlan.builder");
const { resolveChatAmbiguity } = require("../chat/chat.ambiguity.resolver");

async function evaluate(message, context = {}) {
  const queryIR = buildQueryIR({ message, requestContext: context });
  const plan = buildReadPlan({ queryIR, requestContext: context, activeScope: null });
  const ambiguity = await resolveChatAmbiguity({
    engine: {},
    message,
    queryIR,
    policy: { version: "v3" },
    executionContext: context,
    exposedTools: [],
  });
  return { queryIR, plan, ambiguity };
}

test("What are my pending tasks? without active scope", async () => {
  const out = await evaluate("What are my pending tasks?");
  assert.equal(out.queryIR.intent.name, "LIST_TASKS");
  assert.equal(out.queryIR.target, "collection");
  assert.equal(out.queryIR.scope.required, false);
  assert.equal(out.plan?.toolName, "listTasks");
  assert.equal(out.plan?.executionMode, "direct");
  assert.equal(out.ambiguity?.status, "skipped");
});

test("What are my pending tasks? with active scope", async () => {
  const out = await evaluate("What are my pending tasks?", { dossierId: 9 });
  assert.equal(out.queryIR.intent.name, "LIST_TASKS");
  assert.equal(out.plan?.toolName, "getEntityGraph");
  assert.equal(out.plan?.executionMode, "graph");
  assert.equal(out.ambiguity?.status, "skipped");
});

test("give me an idea about my clients without active scope", async () => {
  const out = await evaluate("give me an idea about my clients");
  assert.equal(out.queryIR.intent.name, "LIST_CLIENTS");
  assert.equal(out.queryIR.target, "collection");
  assert.equal(out.queryIR.entityHints.length, 0);
  const extracted = Array.isArray(out.queryIR.hints?.extracted) ? out.queryIR.hints.extracted : [];
  assert.ok(extracted.length >= 1);
  assert.equal(extracted[0].binding, false);
  assert.equal(extracted[0].classification, "scope_operator");
  assert.equal(extracted[0].reasonCode, "pronoun_plural_collection_scope");
  assert.equal(out.plan?.toolName, "listClients");
  assert.equal(out.plan?.executionMode, "direct");
  assert.equal(out.ambiguity?.status, "skipped");
});

test("give me an idea about my clients with active scope", async () => {
  const out = await evaluate("give me an idea about my clients", { clientId: 4 });
  assert.equal(out.queryIR.intent.name, "LIST_CLIENTS");
  assert.equal(out.queryIR.entityHints.length, 0);
  assert.equal(out.plan?.toolName, "getEntityGraph");
  assert.equal(out.plan?.executionMode, "graph");
  assert.equal(out.ambiguity?.status, "skipped");
});

test("list my lawsuits without active scope", async () => {
  const out = await evaluate("list my lawsuits");
  assert.equal(out.queryIR.intent.name, "LIST_LAWSUITS");
  assert.equal(out.queryIR.target, "collection");
  assert.equal(out.plan?.toolName, "listLawsuits");
  assert.equal(out.plan?.executionMode, "direct");
  assert.equal(out.ambiguity?.status, "skipped");
});

test("list my lawsuits with active scope", async () => {
  const out = await evaluate("list my lawsuits", { clientId: 3 });
  assert.equal(out.queryIR.intent.name, "LIST_LAWSUITS");
  assert.equal(out.plan?.toolName, "getEntityGraph");
  assert.equal(out.plan?.executionMode, "graph");
  assert.equal(out.ambiguity?.status, "skipped");
});
