"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sanitizeForDisplay,
  sanitizeValidationMessage,
} = require("./presentationSanitizer");
const { enforceUserSafeResponsePolicy } = require("../chat/chat.userSafeResponsePolicy");

function collectStrings(value, bucket = []) {
  if (typeof value === "string") {
    bucket.push(value);
    return bucket;
  }
  if (!value || typeof value !== "object") return bucket;
  if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, bucket);
    return bucket;
  }
  for (const item of Object.values(value)) collectStrings(item, bucket);
  return bucket;
}

function assertNoStandalonePrimaryKeyNumbers(text) {
  const source = String(text || "");
  if (!source) return;
  const phoneRegex = /\+?\d[\d\s().-]{7,}\d/g;
  const refRegex = /\b[A-Z]{2,}-\d{4}-\d+\b/g;
  const protectedSpans = [];
  for (const m of source.matchAll(phoneRegex)) {
    protectedSpans.push([m.index || 0, (m.index || 0) + m[0].length]);
  }
  for (const m of source.matchAll(refRegex)) {
    protectedSpans.push([m.index || 0, (m.index || 0) + m[0].length]);
  }

  for (const match of source.matchAll(/\b\d+\b/g)) {
    const index = match.index || 0;
    const number = match[0];
    const inProtectedSpan = protectedSpans.some(([start, end]) => index >= start && index < end);
    if (inProtectedSpan) continue;

    const context = source.slice(Math.max(0, index - 20), index + number.length + 20).toLowerCase();
    const idContext = /\b(id|dossier|client|lawsuit|task|session|mission|officer|entity)\b/.test(context);
    assert.equal(
      idContext,
      false,
      `Primary key-like numeric token leaked in assistant output: "${number}" within "${context}"`,
    );
  }
}

test("sanitizeForDisplay removes id keys and replaces foreign keys with references", () => {
  const sanitized = sanitizeForDisplay({
    id: 10,
    title: "Create reminder",
    dossier_id: 44,
    dossier_label: "Family case",
    nested: {
      client_id: 4,
      client_reference: "CLI-2026-014",
      raw: "Dossier Id: 10",
    },
  });

  assert.equal("id" in sanitized, false);
  assert.equal("dossier_id" in sanitized, false);
  assert.equal(sanitized.dossier_ref, "Family case");
  assert.equal("client_id" in sanitized.nested, false);
  assert.equal(sanitized.nested.client_ref, "CLI-2026-014");
  assert.ok(!/\bId:\s*\d+\b/i.test(sanitized.nested.raw));
});

test("sanitizeValidationMessage rewrites internal field prompts", () => {
  const result = sanitizeValidationMessage("Provide values for: dossier_id.");
  assert.equal(result, "Please select the dossier where this task should be created.");
});

test("global safe policy strips id-like numbers from outgoing assistant content", () => {
  const result = enforceUserSafeResponsePolicy({
    text: "Dossier Id: 10. Client: ID 4. Call +1 555-123-4567 about DOS-2026-001.",
    output: {
      type: "proposal",
      proposals: [
        {
          proposalId: "prop-1",
          actionType: "UPDATE_ENTITY",
          humanReadableSummary:
            "Update task #10: {\"dossier_id\":10,\"title\":\"Call client\"}",
          requiresConfirmation: true,
          status: "PROPOSED",
          affectedEntities: [{ type: "task", id: 10, operation: "update" }],
          confirmation: {
            preview: {
              root: { type: "task", id: 10, label: "Task #10" },
              primaryChanges: [{ field: "dossier_id", to: 10 }],
            },
          },
          params: {
            entityType: "task",
            entityId: 10,
            changes: { dossier_id: 10, title: "Call client" },
          },
        },
      ],
    },
  });

  const allStrings = [result.text, ...collectStrings(result.output)];
  for (const str of allStrings) {
    assertNoStandalonePrimaryKeyNumbers(str);
  }
  const serialized = JSON.stringify(result.output);
  assert.equal(/"dossier_id"/i.test(serialized), false);
  assert.equal(/"entityId"\s*:\s*10/.test(serialized), false);
});
