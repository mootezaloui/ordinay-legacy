"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { evaluateMutationGovernance } = require("./mutation.governance");

test("future-oriented entity intent in scoped dossier routes to create governance", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "we will be having a lawsuit for the divorce case",
    requestContext: {
      dossierId: 91,
      resolvedEntity: { type: "dossier", id: 91 },
    },
    executionContext: {
      dossierId: 91,
    },
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "lawsuit");
  assert.equal(result.shouldBypassReadResolution, true);
  assert.equal(result.extractedFields.dossier_id, 91);
  assert.equal(typeof result.extractedFields.title, "string");
  assert.equal(result.missingRequiredFields.length, 0);
  assert.equal(result.entityTypeResolution?.source, "explicit_noun");
});

test("explicit show query stays in read governance", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "show me the lawsuit for the divorce case",
    requestContext: {
      dossierId: 91,
    },
    executionContext: {
      dossierId: 91,
    },
  });

  assert.equal(result.intent, "read");
  assert.equal(result.shouldBypassReadResolution, false);
});

test("create governance backfills required *_id from resolved scope and overrides weak llm values", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "we will be having a lawsuit for the divorce case",
    requestContext: {
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () =>
      JSON.stringify({
        entityType: "lawsuit",
        fields: {
          dossier_id: null,
          title: "divorce case",
        },
      }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "lawsuit");
  assert.equal(result.extractedFields.dossier_id, 10);
  assert.equal(result.missingRequiredFields.length, 0);
});

test("after lawsuit context, create task is deterministically task", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "create a task to prepare evidence list",
    requestContext: {
      previousMutationContext: { entityType: "lawsuit" },
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () =>
      JSON.stringify({
        fields: { title: "prepare evidence list" },
      }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "task");
  assert.notEqual(result.entityType, "lawsuit");
  assert.equal(result.entityTypeResolution?.source, "explicit_noun");
  assert.equal(result.extractedFields.dossier_id, 10);
  assert.equal(result.missingRequiredFields.length, 0);
});

test("ambiguous mutation noun missing returns clarification-oriented governance", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "create something",
    requestContext: {},
    executionContext: {},
    llmExtractor: async () =>
      JSON.stringify({
        entityType: null,
        fields: {},
      }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, null);
  assert.equal(result.shouldBypassReadResolution, true);
  assert.ok(Array.isArray(result.missingRequiredFields));
  assert.ok(result.missingRequiredFields.includes("entity_type"));
});

test("schedule hearing routes to create session", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "schedule a hearing next week",
    requestContext: {
      dossierId: 10,
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () =>
      JSON.stringify({
        fields: { scheduled_at: "2026-03-10 10:00:00" },
      }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "session");
});

test("create dossier remains create even when active scope is dossier", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "create a dossier for Omar",
    requestContext: {
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () =>
      JSON.stringify({
        fields: { title: "Omar matter" },
      }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "dossier");
});

test("mixed context message resolves create task instead of previous lawsuit", async () => {
  const result = await evaluateMutationGovernance({
    userMessage:
      "okay we have created the lawsuit, we need to check if the court approved it, lets create a task for me to go to court and check",
    requestContext: {
      previousMutationContext: { entityType: "lawsuit" },
      dossierId: 10,
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () => JSON.stringify({ fields: { title: "go to court and check approval" } }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "task");
  assert.equal(result.entityTypeResolution?.status, "resolved");
  assert.notEqual(result.entityType, "lawsuit");
  assert.equal(result.extractedFields.dossier_id, 10);
  assert.equal(result.missingRequiredFields.length, 0);
});

test("mission create under dossier scope auto-binds dossier_id", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "create a mission to deliver the filing",
    requestContext: {
      dossierId: 10,
      resolvedEntity: { type: "dossier", id: 10 },
    },
    executionContext: {},
    llmExtractor: async () => JSON.stringify({ fields: { title: "deliver the filing" } }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "mission");
  assert.equal(result.extractedFields.dossier_id, 10);
  assert.equal(result.missingRequiredFields.length, 0);
});

test("session create under lawsuit scope prefers lawsuit_id over dossier_id", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "schedule a session for next monday",
    requestContext: {
      dossierId: 10,
      lawsuitId: 3,
      resolvedEntity: { type: "lawsuit", id: 3 },
    },
    executionContext: {},
    llmExtractor: async () => JSON.stringify({ fields: { scheduled_at: "2026-03-09 09:00:00" } }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "session");
  assert.equal(result.extractedFields.lawsuit_id, 3);
  assert.equal(result.extractedFields.dossier_id, undefined);
  assert.equal(result.missingRequiredFields.length, 0);
});

test("task create without scope reports parent binding requirement", async () => {
  const result = await evaluateMutationGovernance({
    userMessage: "create a task to check court approval",
    requestContext: {},
    executionContext: {},
    llmExtractor: async () => JSON.stringify({ fields: { title: "check court approval" } }),
  });

  assert.equal(result.intent, "create");
  assert.equal(result.entityType, "task");
  assert.ok(result.missingRequiredFields.includes("dossier_id"));
  assert.ok(result.missingRequiredFields.includes("lawsuit_id"));
});

test("new governance path contains no entity-specific branching literals", () => {
  const targets = [
    path.join(__dirname, "mutation.governance.js"),
    path.join(__dirname, "..", "orchestrator", "chat.orchestrator.js"),
  ];
  const prohibited = [
    /if\s*\(\s*entityType\s*===\s*['"]lawsuit['"]\s*\)/i,
    /if\s*\(\s*entityType\s*===\s*['"]task['"]\s*\)/i,
    /if\s*\(\s*entityType\s*===\s*['"]session['"]\s*\)/i,
    /if\s*\(\s*entityType\s*===\s*['"]mission['"]\s*\)/i,
  ];
  for (const filePath of targets) {
    const content = fs.readFileSync(filePath, "utf8");
    for (const pattern of prohibited) {
      assert.equal(
        pattern.test(content),
        false,
        `Found prohibited entity-specific branch in ${filePath}: ${pattern}`,
      );
    }
  }
});
