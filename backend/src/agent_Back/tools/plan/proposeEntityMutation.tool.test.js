"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const Ajv = require("ajv");

const tool = require("./proposeEntityMutation.tool");
const { buildIdentityCollisionArtifact } = require("../../mutation/agentMutationProposal.service");

test("proposeEntityMutation output schema accepts identity_collision artifacts", () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(tool.outputSchema);
  const artifact = buildIdentityCollisionArtifact(
    {
      outcome: "duplicate_found",
      entityType: "lawsuit",
      matchedEntity: {
        id: 12,
        label: "Custody lawsuit",
        entityType: "lawsuit",
        subtitle: "in_progress | Court of First Instance",
        metadata: { status: "in_progress", court: "Court of First Instance" },
      },
      matches: [{
        id: 12,
        label: "Custody lawsuit",
        entityType: "lawsuit",
        subtitle: "in_progress | Court of First Instance",
        metadata: { status: "in_progress", court: "Court of First Instance" },
        score: 0.92,
        reasons: ["category_overlap_1.00"],
      }],
      reasonCode: "same_semantic_identity_in_scope",
      confidence: 0.92,
      userMessage: "An equivalent lawsuit already exists in this dossier. I will not create a duplicate.",
      scope: { dossier_id: 18 },
    },
    { sessionId: "session-1" },
  );
  const valid = validate(artifact);
  assert.equal(valid, true, JSON.stringify(validate.errors || []));
});
