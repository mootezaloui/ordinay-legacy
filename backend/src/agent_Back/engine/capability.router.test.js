"use strict";

/**
 * capability.router.test.js
 *
 * Test Suite: Capability Router
 * Tests deterministic routing before LLM execution
 *
 * Test Strategy:
 * - Verify deterministic routing for READ/DRAFT/SEARCH capabilities
 * - Verify clarification outputs when intent is ambiguous
 * - Verify posture cannot bypass capability lock (regression)
 * - Verify confidence thresholds
 * - Verify capability preservation in follow-up context
 */

const assert = require("assert");
const { routeCapability } = require("./capability.router");
const { CAPABILITIES } = require("../contracts/capabilityRoute.contract");
const { READ_INTENTS } = require("../intent.classifier");

// Helper: Assert routing result structure
function assertRoutingResult(result, expectedCapability, expectedIntent) {
  assert.strictEqual(
    result.type,
    "routing_result",
    "Expected routing_result type",
  );
  assert.strictEqual(
    result.capability,
    expectedCapability,
    `Expected capability ${expectedCapability}`,
  );
  assert.strictEqual(
    result.intent,
    expectedIntent,
    `Expected intent ${expectedIntent}`,
  );
  assert.ok(
    result.confidence >= 0 && result.confidence <= 1,
    "Confidence must be 0-1",
  );
  assert.ok(Array.isArray(result.signals), "Signals must be array");
  assert.ok(typeof result.requires === "object", "Requires must be object");
}

// Helper: Assert routing clarification structure
function assertRoutingClarification(result, expectedReason) {
  assert.strictEqual(
    result.type,
    "routing_clarification",
    "Expected routing_clarification type",
  );
  assert.ok(
    typeof result.message === "string" && result.message.length > 0,
    "Message must be non-empty string",
  );
  assert.strictEqual(
    result.reason,
    expectedReason,
    `Expected reason ${expectedReason}`,
  );
  assert.ok(Array.isArray(result.candidates), "Candidates must be array");
  assert.ok(result.candidates.length > 0, "Candidates must not be empty");
}

// Test Suite
console.log("\n=== Capability Router Test Suite ===\n");

// TEST 1: READ capability - list tasks
console.log("TEST 1: READ capability - list tasks");
{
  const result = routeCapability({
    message: "help me see my upcoming tasks",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.READ, READ_INTENTS.LIST_TASKS);
  assert.ok(result.signals.includes("read_rule"), "Expected read_rule signal");
  console.log("✓ PASS: READ capability correctly routed to LIST_TASKS\n");
}

// TEST 2: DRAFT capability - generic draft request
console.log("TEST 2: DRAFT capability - generic draft request");
{
  const result = routeCapability({
    message: "write an official request",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.DRAFT, "DRAFT_GENERIC");
  assert.ok(
    result.signals.includes("draft_rule"),
    "Expected draft_rule signal",
  );
  console.log("✓ PASS: DRAFT capability correctly routed\n");
}

// TEST 3: SEARCH capability - web search
console.log("TEST 3: SEARCH capability - web search");
{
  const result = routeCapability({
    message: "search the web for labor code",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.SEARCH, READ_INTENTS.WEB_SEARCH);
  assert.ok(
    result.signals.includes("search_rule"),
    "Expected search_rule signal",
  );
  console.log("✓ PASS: SEARCH capability correctly routed to WEB_SEARCH\n");
}

// TEST 4: SEARCH capability - deep search
console.log("TEST 4: SEARCH capability - deep search");
{
  const result = routeCapability({
    message: "do a deep search for recent precedents on labor disputes",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.SEARCH, READ_INTENTS.DEEP_SEARCH);
  assert.ok(
    result.signals.includes("search_rule"),
    "Expected search_rule signal",
  );
  console.log("✓ PASS: SEARCH capability correctly routed to DEEP_SEARCH\n");
}

// TEST 5: Routing clarification - case scope ambiguity
console.log("TEST 5: Routing clarification - case scope ambiguity");
{
  const result = routeCapability({
    message: "summarize my case",
    context: {
      dataAccess: {
        dossiers: [
          { id: 1, caseNumber: "CASE-001", title: "Labor Dispute" },
          { id: 2, caseNumber: "CASE-002", title: "Contract Review" },
          { id: 3, caseNumber: "CASE-003", title: "Employment Law" },
        ],
        lawsuits: [
          { id: 10, reference: "LAWSUIT-001", title: "Johnson vs. Corp" },
        ],
      },
    },
    resumeContext: null,
  });
  assertRoutingClarification(result, "read_scope_selection");
  assert.ok(
    result.candidates.length >= 2,
    "Expected at least 2 candidates (SUMMARIZE_DOSSIER + SUMMARIZE_LAWSUIT)",
  );
  const dossierCandidate = result.candidates.find(
    (c) => c.intent === "SUMMARIZE_DOSSIER",
  );
  const lawsuitCandidate = result.candidates.find(
    (c) => c.intent === "SUMMARIZE_LAWSUIT",
  );
  assert.ok(dossierCandidate, "Expected SUMMARIZE_DOSSIER candidate");
  assert.ok(lawsuitCandidate, "Expected SUMMARIZE_LAWSUIT candidate");
  console.log(
    "✓ PASS: Case scope ambiguity correctly triggers routing clarification\n",
  );
}

// TEST 6: Follow-up context preserves capability
console.log("TEST 6: Follow-up context preserves capability");
{
  const result = routeCapability({
    message: "what about next week?",
    context: {
      lastIntent: READ_INTENTS.LIST_TASKS,
    },
    resumeContext: {
      intent: "RESOLVE_CONTEXT_AND_CONTINUE",
      capability: CAPABILITIES.READ,
    },
  });
  assertRoutingResult(
    result,
    CAPABILITIES.READ,
    "RESOLVE_CONTEXT_AND_CONTINUE",
  );
  assert.ok(
    result.signals.includes("resume_mode"),
    "Expected resume_mode signal",
  );
  console.log("✓ PASS: Follow-up context preserves READ capability\n");
}

// TEST 7: ASSISTANT capability fallback (vague query)
console.log("TEST 7: ASSISTANT capability fallback (vague query)");
{
  const result = routeCapability({
    message: "hello there",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.ASSISTANT, null);
  assert.ok(
    result.signals.includes("no_domain_match"),
    "Expected no_domain_match signal",
  );
  console.log("✓ PASS: ASSISTANT capability fallback works for vague query\n");
}

// TEST 8: READ capability - list clients
console.log("TEST 8: READ capability - list clients");
{
  const result = routeCapability({
    message: "show me all my clients",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.READ, READ_INTENTS.LIST_CLIENTS);
  assert.ok(result.signals.includes("read_rule"), "Expected read_rule signal");
  console.log("✓ PASS: READ capability correctly routed to LIST_CLIENTS\n");
}

// TEST 9: DRAFT capability with explicit type
console.log("TEST 9: DRAFT capability with explicit type");
{
  const result = routeCapability({
    message: "draft an invitation for the hearing",
    context: {
      activeEntity: { type: "hearing", id: 42 },
    },
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.DRAFT, "DRAFT_INVITATION");
  assert.ok(
    result.signals.includes("draft_rule"),
    "Expected draft_rule signal",
  );
  console.log("✓ PASS: DRAFT capability correctly routed with explicit type\n");
}

// TEST 10: Confidence threshold enforcement
console.log("TEST 10: Confidence threshold enforcement");
{
  const result = routeCapability({
    message: "hmm",
    context: {},
    resumeContext: null,
  });
  // Should fall back to ASSISTANT due to no domain match
  assert.strictEqual(
    result.capability,
    CAPABILITIES.ASSISTANT,
    "Expected ASSISTANT fallback",
  );
  console.log("✓ PASS: Low confidence correctly triggers ASSISTANT fallback\n");
}

// TEST 11: READ capability - list dossiers request
console.log("TEST 11: READ capability - list dossiers request");
{
  const result = routeCapability({
    message: "show me my dossiers",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.READ, READ_INTENTS.LIST_DOSSIERS);
  assert.ok(result.signals.includes("read_rule"), "Expected read_rule signal");
  console.log("✓ PASS: READ capability correctly routed to LIST_DOSSIERS\n");
}

// TEST 12: Posture cannot bypass capability lock (regression test)
console.log("TEST 12: Posture cannot bypass capability lock (regression test)");
{
  // Even if posture is ASSISTANT, routing still enforces capability lock
  const result = routeCapability({
    message: "list my upcoming hearings",
    context: {
      lastPosture: "ASSISTANT", // This should NOT bypass routing
    },
    resumeContext: null,
  });
  assertRoutingResult(
    result,
    CAPABILITIES.READ,
    READ_INTENTS.LIST_UPCOMING_SESSIONS,
  );
  assert.ok(
    result.capability !== CAPABILITIES.ASSISTANT,
    "Posture should not bypass routing",
  );
  console.log("✓ PASS: Posture cannot bypass capability lock\n");
}

// TEST 13: DRAFT capability - email type
console.log("TEST 13: DRAFT capability - email type");
{
  const result = routeCapability({
    message: "write an email to my client",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.DRAFT, "DRAFT_CLIENT_EMAIL");
  console.log("✓ PASS: DRAFT capability correctly routed to CLIENT_EMAIL\n");
}

// TEST 14: READ capability - tasks (alternative test)
console.log("TEST 14: READ capability - sessions list");
{
  const result = routeCapability({
    message: "show me all sessions",
    context: {},
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.READ, READ_INTENTS.LIST_SESSIONS);
  assert.ok(result.signals.includes("read_rule"), "Expected read_rule signal");
  console.log("✓ PASS: READ capability correctly routed to LIST_SESSIONS\n");
}

// TEST 15: ANALYZE capability - dossier priorities from work snapshot context
console.log("TEST 15: ANALYZE capability - work snapshot priority review");
{
  const result = routeCapability({
    message: "review immediate priorities",
    context: {
      workSnapshot: {
        entityType: "dossier",
        entityId: 77,
        parent: { id: 77, reference: "DOS-2026-77" },
      },
    },
    resumeContext: null,
  });
  assertRoutingResult(result, CAPABILITIES.ANALYZE, "ANALYZE_ENTITY");
  assert.ok(
    result.signals.includes("dossier_priority_rule"),
    "Expected dossier_priority_rule signal",
  );
  assert.ok(result.metadata, "Expected routing metadata for analyze intent");
  assert.strictEqual(
    result.metadata.analysisType,
    "dossier_priorities",
    "Expected dossier priorities analysis type",
  );
  assert.strictEqual(
    result.metadata.entityId,
    77,
    "Expected active dossier id from snapshot context",
  );
  console.log(
    "✓ PASS: ANALYZE capability routed from work snapshot context\n",
  );
}

// Summary
console.log("\n=== All Tests Passed ✓ ===\n");
console.log("Router Statistics:");
console.log("- Total tests: 15");
console.log("- Capability routing: 12 tests");
console.log("- Routing clarification: 1 test");
console.log("- Follow-up preservation: 1 test");
console.log("- Regression tests: 1 test");
console.log(
  "\nConclusion: Capability router enforces deterministic routing before LLM execution.",
);
console.log("No posture bypass detected. Clarifications work correctly.\n");
