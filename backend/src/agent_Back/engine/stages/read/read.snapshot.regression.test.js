"use strict";

/**
 * Regression Test: Snapshot Application with Failed Entity Resolution
 *
 * Verifies that when entity resolution fails (incomplete/ambiguous/not_found),
 * an active work snapshot does NOT trigger dossier-specific interpretation.
 *
 * Bug: User says "Summarize dossier قضية طلاق زوجية" (unresolved name)
 * With an active dossier snapshot from a previous read, the system incorrectly:
 * - Applied the snapshot to the failed resolution
 * - Generated interpretation like "Work Mode is active", "No active tasks yet"
 * - Created artifact titled "Dossier dossier"
 *
 * Root cause: snapshotAppliesToRead didn't check readOutcome before applying snapshot.
 *
 * Fix: Added readOutcome check to snapshotAppliesToRead logic in _buildReadInterpretationContext.
 */

const assert = require("assert");
const { _buildReadInterpretationContext } = require("./read.meta");

console.log("\n=== read.snapshot Regression Test ===\n");

// TEST 1: Failed resolution with active snapshot should NOT apply snapshot
console.log("TEST 1: Failed resolution (incomplete) should not apply snapshot");
{
  const baseContext = {
    workSnapshot: {
      entityType: "dossier",
      entityId: 42,
      parent: { id: 42, reference: "DOS-042", title: "Previous Case" },
      snapshotAt: "2026-02-13T10:00:00Z",
    },
  };

  const context = _buildReadInterpretationContext(baseContext, {
    entityType: "dossier",
    entityData: null, // No entity retrieved
    readOutcome: "incomplete", // Entity resolution failed
    readSummary: "Which dossier?",
    readDetails: ["Provide a dossier reference or name."],
    readMeta: { entityType: "dossier", count: 0, entityIds: [], singleId: null },
    promotion: { activeEntity: null },
    aggregateSummary: false,
    aggregateFilters: null,
  });

  // Verify snapshot is NOT applied
  assert.strictEqual(
    context._workSnapshotActive,
    false,
    "Snapshot should NOT be active when resolution is incomplete",
  );
  assert.strictEqual(
    context._dossierWorkMode,
    false,
    "Dossier work mode should NOT be active when resolution is incomplete",
  );
  assert.strictEqual(
    context._grounding.workMode.dossier,
    false,
    "Grounding should NOT indicate dossier work mode",
  );
  assert.strictEqual(
    context._grounding.entityRetrieved,
    false,
    "Grounding should indicate no entity was retrieved",
  );

  console.log("✓ PASS: Snapshot not applied when readOutcome is incomplete\n");
}

// TEST 2: Failed resolution (ambiguous) should not apply snapshot
console.log("TEST 2: Failed resolution (ambiguous) should not apply snapshot");
{
  const baseContext = {
    workSnapshot: {
      entityType: "dossier",
      entityId: 99,
      parent: { id: 99, reference: "DOS-099" },
      snapshotAt: "2026-02-13T09:00:00Z",
    },
  };

  const context = _buildReadInterpretationContext(baseContext, {
    entityType: "dossier",
    entityData: null,
    readOutcome: "ambiguous",
    readSummary: "Multiple dossiers match",
    readDetails: ["DOS-001 — Case A", "DOS-002 — Case B"],
    readMeta: { entityType: "dossier", count: 0, entityIds: [], singleId: null },
    promotion: { activeEntity: null },
    aggregateSummary: false,
    aggregateFilters: null,
  });

  assert.strictEqual(
    context._workSnapshotActive,
    false,
    "Snapshot should NOT be active when resolution is ambiguous",
  );
  assert.strictEqual(
    context._dossierWorkMode,
    false,
    "Dossier work mode should NOT be active",
  );

  console.log("✓ PASS: Snapshot not applied when readOutcome is ambiguous\n");
}

// TEST 3: Failed resolution (not_found) should not apply snapshot
console.log("TEST 3: Failed resolution (not_found) should not apply snapshot");
{
  const baseContext = {
    workSnapshot: {
      entityType: "dossier",
      entityId: 77,
      parent: { id: 77, reference: "DOS-077" },
      snapshotAt: "2026-02-13T08:00:00Z",
    },
  };

  const context = _buildReadInterpretationContext(baseContext, {
    entityType: "dossier",
    entityData: null,
    readOutcome: "not_found",
    readSummary: "No dossier found",
    readDetails: ["Try listing all dossiers"],
    readMeta: { entityType: "dossier", count: 0, entityIds: [], singleId: null },
    promotion: { activeEntity: null },
    aggregateSummary: false,
    aggregateFilters: null,
  });

  assert.strictEqual(
    context._workSnapshotActive,
    false,
    "Snapshot should NOT be active when entity not found",
  );
  assert.strictEqual(
    context._dossierWorkMode,
    false,
    "Dossier work mode should NOT be active",
  );

  console.log("✓ PASS: Snapshot not applied when readOutcome is not_found\n");
}

// TEST 4: Successful resolution with snapshot SHOULD apply snapshot
console.log("TEST 4: Successful resolution should apply snapshot");
{
  const baseContext = {
    workSnapshot: {
      entityType: "dossier",
      entityId: 55,
      parent: { id: 55, reference: "DOS-055", title: "Active Case" },
      snapshotAt: "2026-02-13T10:30:00Z",
    },
  };

  const dossierData = { id: 55, reference: "DOS-055", title: "Active Case" };

  const context = _buildReadInterpretationContext(baseContext, {
    entityType: "dossier",
    entityData: dossierData, // Entity successfully retrieved
    readOutcome: "success",
    readSummary: "Dossier Work Mode: DOS-055 — Active Case",
    readDetails: ["Snapshot timestamp: 2026-02-13T10:30:00Z"],
    readMeta: { entityType: "dossier", count: 1, entityIds: [55], singleId: 55 },
    promotion: {
      activeEntity: { type: "dossier", id: 55, source: "user" },
    },
    aggregateSummary: false,
    aggregateFilters: null,
  });

  // Verify snapshot IS applied
  assert.strictEqual(
    context._workSnapshotActive,
    true,
    "Snapshot SHOULD be active when resolution succeeds",
  );
  assert.strictEqual(
    context._dossierWorkMode,
    true,
    "Dossier work mode SHOULD be active",
  );
  assert.strictEqual(
    context._grounding.entityRetrieved,
    true,
    "Grounding should indicate entity was retrieved",
  );

  console.log("✓ PASS: Snapshot correctly applied when readOutcome is success\n");
}

console.log("=== All Regression Tests Passed ✓ ===\n");
console.log("Conclusion: Work snapshot is only applied when entity resolution succeeds.");
console.log("Failed resolutions (incomplete/ambiguous/not_found) no longer trigger");
console.log("hallucinated dossier interpretation.\n");
