import { describe, expect, it } from "vitest";
import { mapSemanticAction } from "../src/Agent_front/components/artifacts/confirmation/semanticActionMapper";
import { containsForbiddenConfirmationCopy } from "../src/Agent_front/components/artifacts/confirmation/confirmationCopyGuard";
import { proposalToSemanticInput } from "../src/Agent_front/components/artifacts/confirmation/proposalToSemanticInput";
import {
  assertNonGenericSemanticCopy,
  SemanticMappingError,
} from "../src/Agent_front/components/artifacts/confirmation/semanticGuards";
import type { ActionProposal } from "../src/services/api/agent";
import type { SemanticActionViewModel } from "../src/Agent_front/components/artifacts/confirmation/types";

function buildProposal(overrides: Partial<ActionProposal> = {}): ActionProposal {
  return {
    proposalId: "p-1",
    status: "pending",
    action: "update",
    description: "Client status change",
    requiresConfirmation: true,
    actionType: "UPDATE_ENTITY",
    params: {
      entityType: "client",
      entityId: 12,
      changes: {
        status: { from: "active", to: "deceased" },
      },
    },
    confirmation: {
      impactSummary: [],
    },
    ...overrides,
  };
}

function collectViewModelStrings(vm: SemanticActionViewModel): string[] {
  return [
    vm.assistantMessage,
    vm.headline,
    vm.description,
    vm.confirmLabel,
    vm.cancelLabel,
    vm.sections.changesLabel,
    vm.sections.consequencesLabel,
    vm.sections.warningsLabel,
    vm.sections.reversibilityLabel,
    ...vm.impact.flatMap((item) =>
      [item.title, item.detail, item.before, item.after].filter((v): v is string => Boolean(v)),
    ),
  ];
}

describe("semanticActionMapper", () => {
  it("produces sensitive death confirmation copy with explicit reversibility", () => {
    const input = proposalToSemanticInput(buildProposal(), {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    });
    const vm = mapSemanticAction(input);

    expect(vm.toneVariant).toBe("sensitive");
    expect(vm.assistantMessage).toContain("I'm sorry.");
    expect(vm.headline).toContain("Mark Mootez Aloui as Deceased");
    expect(vm.confirmLabel).toBe("Mark as Deceased");
    expect(vm.cancelLabel).toBe("Keep Current Status");
    expect(vm.sections.consequencesLabel).toBe("What this affects");
    expect(vm.impact.some((item) => item.kind === "reversibility")).toBe(true);
  });

  it("supports sensitive death confirmation when subject label is missing", () => {
    const input = proposalToSemanticInput(
      buildProposal({
        params: {
          entityType: "client",
          changes: {
            status: { from: "active", to: "deceased" },
          },
        },
      }),
      {},
    );
    const vm = mapSemanticAction(input);

    expect(vm.toneVariant).toBe("sensitive");
    expect(vm.headline).toBe("Mark this client as Deceased");
    expect(vm.assistantMessage).toContain("mark this client as deceased");
    expect(vm.headline.toLowerCase()).not.toContain("item");
    expect(vm.headline.toLowerCase()).not.toContain("record");
  });

  it("produces neutral task completion copy with task-specific headline", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {
          entityType: "task",
          entityId: 4,
          changes: {
            status: { from: "in_progress", to: "completed" },
          },
        },
      },
      {
        tasks: [{ id: 4, title: "Send court filing draft to client" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.toneVariant).toBe("neutral");
    expect(vm.assistantMessage).toContain("Send court filing draft to client");
    expect(vm.headline).toContain("Confirm Status Update");
    expect(vm.confirmLabel).toBe("Set Status to Completed");
  });

  it("produces destructive copy for financial entry deletion", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        actionType: "DELETE_ENTITY",
        action: "delete",
        description: "Delete financial entry",
        params: {
          entityType: "financial_entry",
          entityId: 33,
        },
        reversible: false,
        confirmation: {
          impactSummary: ["This entry is used in financial totals."],
        },
      },
      {
        financialEntries: [{ id: 33, title: "Invoice line: Filing fee reimbursement (EUR420)" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.toneVariant).toBe("destructive");
    expect(vm.headline).toContain("Confirm:");
    expect(vm.headline).toContain("Delete Financial Entry");
    expect(vm.confirmLabel).toBe("Apply Permanent Change");
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Planned change")).toBe(true);
    expect(vm.impact.some((item) => item.kind === "warning")).toBe(true);
    expect(vm.impact.find((item) => item.kind === "reversibility")?.detail).toContain("Not reversible");
  });

  it("supports non-status UPDATE_ENTITY changes without generic fallback copy", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {
          entityType: "client",
          entityId: 12,
          changes: {
            title: { from: "Old title", to: "Updated title" },
            description: { from: "Old note", to: "Corrected note" },
          },
        },
      },
      {
        clients: [{ id: 12, name: "Mootez Aloui" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.headline).toContain("Confirm");
    expect(vm.headline).toContain("Mootez Aloui");
    expect(vm.confirmLabel).toBe("Confirm Changes");
    expect(vm.description).not.toContain("requested changes.");
    expect(vm.description).not.toContain("apply");
  });

  it("supports payload-only UPDATE_ENTITY confirmations without params.changes", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {
          entityType: "client",
          entityId: 12,
          payload: {
            title: "Updated title",
            description: "Corrected note",
          },
        },
      },
      {
        clients: [{ id: 12, name: "Mootez Aloui" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.headline).toContain("Confirm");
    expect(vm.headline).toContain("Mootez Aloui");
    expect(vm.confirmLabel).toContain("Confirm");
    expect(vm.description.toLowerCase()).not.toContain("requested changes.");
  });

  it("supports payload-only reassignment UPDATE_ENTITY confirmations with relation id fields", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {
          entityType: "task",
          entityId: 4,
          payload: {
            clientId: 12,
          },
        },
      },
      {
        tasks: [{ id: 4, title: "Send court filing draft to client" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.headline).toContain("Client Change");
    expect(vm.headline).toContain("Send court filing draft to client");
    expect(vm.confirmLabel).toBe("Confirm Assignment Change");
    expect(vm.cancelLabel).toBe("Keep Current Assignment");
  });

  it("supports UPDATE_ENTITY confirmations without diff or payload fields using semantic update copy", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {
          entityType: "client",
          entityId: 12,
          payload: {
            internalId: 99,
          },
        },
      },
      {
        clients: [{ id: 12, name: "Mootez Aloui" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.headline).toBe("Confirm Changes for Mootez Aloui");
    expect(vm.description).toContain("requested change");
    expect(vm.headline.toLowerCase()).not.toContain("update");
    expect(vm.headline.toLowerCase()).not.toContain("item");
  });

  it("supports UPDATE_ENTITY confirmations with empty params using target-agnostic semantic copy", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {},
      },
      {},
    );
    const vm = mapSemanticAction(input);

    expect(vm.headline).toBe("Confirm Requested Changes");
    expect(vm.assistantMessage).toContain("the selected information");
    expect(vm.confirmLabel).toBe("Confirm Changes");
    expect(vm.cancelLabel).toBe("Keep Current Information");
    expect(vm.headline.toLowerCase()).not.toContain("update");
    expect(vm.headline.toLowerCase()).not.toContain("record");
    expect(vm.headline.toLowerCase()).not.toContain("item");
  });

  it("infers a deceased-client confirmation from user message and affected entity when params are empty", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        params: {},
        userMessageDraft: "this guy is not my client anymore he is dead",
        affectedEntities: [{ type: "client", id: 12 }],
      },
      {
        clients: [{ id: 12, name: "Mootez Aloui" }],
      },
    );
    const vm = mapSemanticAction(input);

    expect(vm.toneVariant).toBe("sensitive");
    expect(vm.headline).toBe("Mark Mootez Aloui as Deceased");
    expect(vm.assistantMessage).toContain("I'm sorry.");
    expect(vm.confirmLabel).toBe("Mark as Deceased");
    expect(vm.cancelLabel).toBe("Keep Current Status");
    expect(vm.impact.some((item) => item.detail.includes("active-client views"))).toBe(true);
    expect(vm.impact.some((item) => item.detail.includes("Related information connected to Mootez Aloui"))).toBe(
      false,
    );
  });

  it("rejects forbidden generic/admin vocabulary in user-facing semantic copy", () => {
    const vm = mapSemanticAction(proposalToSemanticInput(buildProposal(), {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    }));

    expect(collectViewModelStrings(vm).some((value) => containsForbiddenConfirmationCopy(value))).toBe(false);
    expect(collectViewModelStrings(vm).join(" ").toLowerCase()).toContain("what this affects");
  });

  it("prevents duplicate assistant/description and headline/confirm label wording", () => {
    const vm = mapSemanticAction(proposalToSemanticInput(buildProposal(), {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    }));

    expect(vm.assistantMessage.trim()).not.toBe(vm.description.trim());
    expect(vm.confirmLabel.trim().toLowerCase()).not.toBe(vm.headline.trim().toLowerCase());
  });

  it("throws in development for generic semantic headlines", () => {
    const genericVm: SemanticActionViewModel = {
      assistantMessage: "I can help with that.",
      headline: "Update item",
      description: "Confirm the change.",
      impact: [],
      confirmLabel: "Confirm",
      cancelLabel: "Cancel",
      toneVariant: "neutral",
      sections: {
        changesLabel: "What changes",
        consequencesLabel: "What this affects",
        warningsLabel: "What this affects",
        reversibilityLabel: "Can this be undone?",
      },
    };

    expect(() => assertNonGenericSemanticCopy(genericVm)).toThrow(SemanticMappingError);
  });

  it("renders legacy generic workflow confirmations when structured preview is unavailable", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      params: {
        entityType: "client",
        entityId: 12,
      },
      affectedEntities: [{ type: "client", id: 12 }, { type: "task", id: 4 }],
      confirmation: {
        impactSummary: ["Related follow-up suggestions will be updated."],
      },
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
      tasks: [{ id: 4, title: "Send court filing draft to client" }],
    }));

    expect(vm.assistantMessage).toContain("Please confirm");
    expect(vm.headline).toContain("Confirm");
    expect(vm.headline.toLowerCase()).not.toContain("workflow");
    expect(vm.sections.consequencesLabel).toBe("What this affects");
  });

  it("uses confirmation preview to render workflow root and cascade details", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      humanReadableSummary: "Update Mootez Aloui after cleaning related records",
      params: {
        entityType: "client",
        entityId: 12,
      },
      reversible: false,
      confirmation: {
        impactSummary: [],
        preview: {
          version: "v1",
          scope: "workflow",
          root: { type: "client", id: 12, label: "Mootez Aloui", operation: "update" },
          primaryChanges: [
            {
              entityType: "client",
              entityId: 12,
              entityLabel: "Mootez Aloui",
              field: "status",
              from: "active",
              to: "inactive",
            },
          ],
          cascadeSummary: [
            {
              entityType: "task",
              totalCount: 2,
              changedFields: ["status", "priority"],
              examples: [
                {
                  entityType: "task",
                  entityId: 4,
                  entityLabel: "Send court filing draft to client",
                  field: "status",
                  from: "todo",
                  to: "cancelled",
                },
              ],
            },
            {
              entityType: "lawsuit",
              totalCount: 1,
              changedFields: ["status"],
              examples: [
                {
                  entityType: "lawsuit",
                  entityId: 10,
                  entityLabel: "Lawsuit Title",
                  field: "status",
                  from: "in_progress",
                  to: "on_hold",
                },
              ],
            },
          ],
          effects: ["Related records must be aligned before the client can be inactivated safely."],
          reversibility: "not_reversible",
        },
      },
      affectedEntities: [{ type: "client", id: 12 }],
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
      tasks: [{ id: 4, title: "Send court filing draft to client" }],
      lawsuits: [{ id: 10, title: "Lawsuit Title" }],
    }));

    expect(vm.headline).toContain("Status");
    expect(vm.confirmLabel).toBe("Set Status to Inactive");
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Status" && item.after === "Inactive")).toBe(true);
    expect(vm.impact.some((item) => item.kind === "change" && item.title?.includes("Send court filing draft to client") && item.after === "Cancelled")).toBe(true);
    expect(vm.impact.some((item) => item.kind === "consequence" && item.detail.includes("2 tasks will also be updated"))).toBe(true);
    expect(vm.impact.some((item) => item.kind === "consequence" && item.detail.includes("1 lawsuit will also be updated"))).toBe(true);
    expect(vm.impact.some((item) => item.kind === "consequence" && item.detail.includes("aligned before the client"))).toBe(true);
  });

  it("supports sanitized workflow proposals with empty params when preview root is present", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      params: {},
      affectedEntities: [],
      reversible: false,
      confirmation: {
        impactSummary: [],
        preview: {
          version: "v1",
          scope: "workflow",
          root: { type: "client", id: 12, label: "Mootez Aloui", operation: "update" },
          primaryChanges: [
            {
              entityType: "client",
              entityId: 12,
              entityLabel: "Mootez Aloui",
              field: "status",
              from: "active",
              to: "inactive",
            },
          ],
          cascadeSummary: [],
          effects: ["Related records will be updated first."],
          reversibility: "not_reversible",
        },
      },
      humanReadableSummary: "Update Mootez Aloui after cleaning related records",
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    }));

    expect(vm.headline).toBe("Confirm Status Update for Mootez Aloui");
    expect(vm.assistantMessage).toContain("Mootez Aloui");
    expect(vm.confirmLabel).toBe("Set Status to Inactive");
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Status")).toBe(true);
  });

  it("supports sanitized single-entity UPDATE confirmations using confirmation preview", () => {
    const vm = mapSemanticAction(
      proposalToSemanticInput(
        {
          ...buildProposal(),
          actionType: "UPDATE_ENTITY",
          action: "update",
          params: {},
          affectedEntities: [{ type: "client", id: 12 }],
          reversible: true,
          confirmation: {
            impactSummary: [],
            preview: {
              version: "v1",
              scope: "single_entity",
              root: { type: "client", id: 12, label: "Mootez Aloui", operation: "update" },
              primaryChanges: [
                {
                  entityType: "client",
                  entityId: 12,
                  entityLabel: "Mootez Aloui",
                  field: "status",
                  from: "active",
                  to: "inactive",
                },
              ],
              cascadeSummary: [],
              effects: [],
              reversibility: "reversible",
            },
          },
          humanReadableSummary: "Update client #12 fields [status] (reason: user said no longer client)",
        },
        {
          clients: [{ id: 12, name: "Mootez Aloui" }],
        },
      ),
    );

    expect(vm.headline).toBe("Confirm Status Update for Mootez Aloui");
    expect(vm.description).toContain("from Active to Inactive");
    expect(vm.confirmLabel).toBe("Set Status to Inactive");
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Status" && item.before === "Active" && item.after === "Inactive")).toBe(true);
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Planned change")).toBe(false);
  });

  it("rewrites internal-style workflow reasoning effects into user-facing confirmation copy", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      params: {},
      affectedEntities: [],
      reversible: false,
      confirmation: {
        impactSummary: [],
        preview: {
          version: "v1",
          scope: "workflow",
          root: { type: "client", id: 12, label: "Mootez Aloui", operation: "update" },
          primaryChanges: [
            {
              entityType: "client",
              entityId: 12,
              entityLabel: "Mootez Aloui",
              field: "status",
              from: "active",
              to: "inactive",
            },
          ],
          cascadeSummary: [],
          effects: ["User requested client inactivation; cleanup workflow required before final status update."],
          reversibility: "not_reversible",
        },
      },
      humanReadableSummary: "Update Mootez Aloui after cleaning related records",
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    }));

    const effectText = vm.impact.filter((item) => item.kind === "consequence").map((item) => item.detail).join(" ");
    expect(effectText.toLowerCase()).not.toContain("workflow");
    expect(effectText.toLowerCase()).not.toContain("user requested");
    expect(effectText.toLowerCase()).toContain("needed before the final status change");
  });

  it("ignores workflow impactSummary when structured preview is present", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      params: {},
      affectedEntities: [],
      reversible: false,
      confirmation: {
        impactSummary: ["User requested client inactivation; cleanup workflow required before final status update."],
        preview: {
          version: "v1",
          scope: "workflow",
          root: { type: "client", id: 12, label: "Mootez Aloui", operation: "update" },
          primaryChanges: [
            {
              entityType: "client",
              entityId: 12,
              entityLabel: "Mootez Aloui",
              field: "status",
              from: "active",
              to: "inactive",
            },
          ],
          cascadeSummary: [],
          effects: [],
          reversibility: "not_reversible",
        },
      },
      humanReadableSummary: "Update Mootez Aloui after cleaning related records",
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
    }));

    const allText = collectViewModelStrings(vm).join(" ").toLowerCase();
    expect(allText).not.toContain("user requested client inactivation");
    expect(allText).not.toContain("cleanup workflow");
  });

  it("uses workflow requestedGoal and steps to explain concrete planned changes", () => {
    const vm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "EXECUTE_MUTATION_WORKFLOW",
      action: "update",
      humanReadableSummary: "Update Mootez Aloui after cleaning related records",
      params: {
        workflow: {
          workflowType: "client_inactivation_cleanup",
          rootEntity: { type: "client", id: 12 },
          rootLabel: "Mootez Aloui",
          requestedGoal: {
            entityType: "client",
            operation: "update",
            changes: { status: "inactive" },
          },
          steps: [
            {
              actionType: "UPDATE_ENTITY",
              params: {
                entityType: "task",
                entityId: 4,
                changes: { status: "cancelled" },
              },
            },
          ],
          reasoningSummary: "Related follow-up tasks must be closed before the client can be inactivated safely.",
        },
      },
      affectedEntities: [{ type: "client", id: 12 }],
      reversible: false,
      confirmation: { impactSummary: [] },
    }, {
      clients: [{ id: 12, name: "Mootez Aloui" }],
      tasks: [{ id: 4, title: "Send court filing draft to client" }],
    }));

    expect(vm.assistantMessage.toLowerCase()).toContain("status");
    expect(vm.headline).toContain("Status");
    expect(vm.impact.some((item) => item.kind === "change" && item.title === "Status" && item.after === "Inactive")).toBe(true);
    expect(vm.impact.some((item) => item.kind === "consequence" && item.detail.includes("Send court filing draft to client"))).toBe(true);
  });

  it("renders generic create/link/attach confirmations with the same panel semantics", () => {
    const createVm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "CREATE_ENTITY",
      action: "create",
      params: { entityType: "task" },
    }, {}));
    const linkVm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "LINK_ENTITIES",
      action: "update",
      params: { sourceType: "task", sourceId: 4 },
    }, { tasks: [{ id: 4, title: "Send court filing draft to client" }] }));
    const attachVm = mapSemanticAction(proposalToSemanticInput({
      ...buildProposal(),
      actionType: "ATTACH_TO_ENTITY",
      action: "update",
      params: { targetType: "client", targetId: 12 },
    }, { clients: [{ id: 12, name: "Mootez Aloui" }] }));

    for (const vm of [createVm, linkVm, attachVm]) {
      expect(vm.assistantMessage).toContain("Please confirm");
      expect(vm.headline).toContain("Confirm");
      expect(vm.sections.consequencesLabel).toBe("What this affects");
      expect(vm.sections.reversibilityLabel).toBe("Can this be undone?");
    }
  });
});
