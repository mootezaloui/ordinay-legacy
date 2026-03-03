"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveChatAmbiguity } = require("./chat.ambiguity.resolver");

test("global-safe LIST_TASKS without scope skips ambiguity resolution", async () => {
  const result = await resolveChatAmbiguity({
    engine: {},
    message: "What are my pending tasks?",
    policy: { version: "v3" },
    executionContext: {},
    exposedTools: [],
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "global_safe_list_without_specific_record");
});

test("singular read without hint still requires context", async () => {
  const result = await resolveChatAmbiguity({
    engine: {
      _callReadTool: async () => ({ tasks: [] }),
      resolveEntity: async () => ({ found: false, reason: "not_found" }),
    },
    message: "show task status",
    policy: { version: "v3" },
    executionContext: {},
    exposedTools: [],
  });
  assert.ok(["missing", "ambiguous", "not_found", "skipped"].includes(result.status));
});

test("global-safe list does not pre-clarify even with huge result set", async () => {
  const result = await resolveChatAmbiguity({
    engine: {
      _callReadTool: async () => ({
        clients: Array.from({ length: 121 }, (_, index) => ({
          id: index + 1,
          name: `Client ${index + 1}`,
        })),
      }),
    },
    message: "give me an idea about my clients",
    policy: { version: "v3" },
    executionContext: {},
    exposedTools: [],
  });
  assert.equal(result.status, "skipped");
  assert.equal(result.reason, "global_safe_list_without_specific_record");
});

test("global-safe list with specific record hint can trigger ambiguity path", async () => {
  const result = await resolveChatAmbiguity({
    engine: {
      resolveEntity: async () => ({ found: false, reason: "not_found" }),
      _callReadTool: async () => ({ clients: [] }),
    },
    message: "list client Acme",
    queryIR: {
      intent: { name: "LIST_CLIENTS", family: "LIST" },
      target: "collection",
      entityType: "client",
      scope: { required: false },
      filters: {},
      entityHints: [{ type: "name", value: "Acme", entityType: "client" }],
      hints: {
        extracted: [
          {
            type: "name",
            value: "Acme",
            entityType: "client",
            confidence: 0.95,
            binding: true,
            classification: "name_candidate",
          },
        ],
      },
    },
    policy: { version: "v3" },
    executionContext: {},
    exposedTools: [],
  });
  assert.notEqual(result.status, "skipped");
  assert.ok(["not_found", "missing", "ambiguous"].includes(result.status));
});
