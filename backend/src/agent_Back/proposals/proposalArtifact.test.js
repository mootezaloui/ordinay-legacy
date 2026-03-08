"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const { toProposalArtifact } = require("./proposalArtifact");

test("toProposalArtifact builds structured data for create proposals without UI fields", () => {
  const artifact = toProposalArtifact(
    {
      proposalId: "p-create",
      status: "PERMITTED",
      actionType: "CREATE_ENTITY",
      requiresConfirmation: true,
      reversible: true,
      humanReadableSummary: "Create legal note",
      params: {
        entityType: "legal_note",
        payload: {
          title: "Child Custody - Proceeding to Lawsuit",
          description: "No settlement reached with spouse. Proceeding with child custody lawsuit.",
          status: "open",
        },
      },
      affectedEntities: [
        { type: "client", id: 12, reference: "Omar Ben Salah" },
        { type: "dossier", id: 87, reference: "Divorce Case #2024-087" },
      ],
      confirmation: {
        preview: {
          planner: {
            legalSummary: "Child Custody - Proceeding to Lawsuit",
          },
        },
      },
    },
    "session-1",
  );

  const structured = artifact.proposals[0].structured;
  assert.equal(structured.verb, "create");
  assert.equal(structured.entityType, "legal_note");
  assert.equal(structured.reversible, true);
  assert.equal(structured.title, "Child Custody - Proceeding to Lawsuit");
  assert.match(structured.subtitle, /legal note/i);
  assert.ok(Array.isArray(structured.fields));
  assert.ok(structured.fields.some((field) => field.key === "client" && field.value === "Omar Ben Salah"));
  assert.ok(
    structured.fields.some(
      (field) => field.key === "dossier" && /Divorce Case/i.test(field.value),
    ),
  );
  assert.deepEqual(structured.contentPreview, {
    label: "Note Content",
    text: "No settlement reached with spouse. Proceeding with child custody lawsuit.",
  });
  assert.equal(structured.resultTarget.type, "dossier");
  assert.equal(structured.resultTarget.id, 87);
  assert.match(structured.resultTarget.label, /Divorce Case/i);
  assert.equal("icon" in structured.fields[0], false);
  assert.equal("span" in structured.fields[0], false);
});

test("toProposalArtifact builds structured data for update proposals from changes", () => {
  const artifact = toProposalArtifact(
    {
      proposalId: "p-update",
      status: "PERMITTED",
      actionType: "UPDATE_ENTITY",
      requiresConfirmation: true,
      reversible: true,
      humanReadableSummary: "Update lawsuit status",
      params: {
        entityType: "lawsuit",
        entityId: 14,
        changes: {
          status: { from: "pending", to: "open" },
          priority: { from: "low", to: "high" },
        },
      },
      affectedEntities: [{ type: "lawsuit", id: 14, reference: "Lawsuit #2024-14" }],
    },
    "session-1",
  );

  const structured = artifact.proposals[0].structured;
  assert.equal(structured.verb, "update");
  assert.equal(structured.entityType, "lawsuit");
  assert.ok(structured.fields.some((field) => field.key === "status" && field.value === "open"));
  assert.ok(structured.fields.some((field) => field.key === "priority" && field.value === "high"));
  assert.equal(structured.contentPreview, undefined);
});

test("toProposalArtifact marks delete proposals as irreversible and omits content preview", () => {
  const artifact = toProposalArtifact(
    {
      proposalId: "p-delete",
      status: "PERMITTED",
      actionType: "DELETE_ENTITY",
      requiresConfirmation: true,
      reversible: false,
      humanReadableSummary: "Delete client note",
      params: {
        entityType: "legal_note",
        entityId: 22,
      },
      affectedEntities: [{ type: "legal_note", id: 22, reference: "Note #22" }],
    },
    "session-1",
  );

  const structured = artifact.proposals[0].structured;
  assert.equal(structured.verb, "delete");
  assert.equal(structured.reversible, false);
  assert.equal(structured.contentPreview, undefined);
  assert.match(structured.subtitle, /permanently remove/i);
});
