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
    expect(vm.sections.consequencesLabel).toBe("Consequences");
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
    expect(vm.headline).toContain("Completed");
    expect(vm.confirmLabel).toBe("Mark Task Complete");
  });

  it("produces destructive copy for financial entry deletion", () => {
    const input = proposalToSemanticInput(
      {
        ...buildProposal(),
        actionType: "DELETE_ENTITY",
        action: "delete",
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
    expect(vm.headline).toContain("Delete Financial Entry Permanently");
    expect(vm.confirmLabel).toBe("Delete Entry Permanently");
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

    expect(vm.headline).toContain("Revise");
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

    expect(vm.headline).toContain("Revise");
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

    expect(vm.headline).toContain("Reassign client");
    expect(vm.headline).toContain("Send court filing draft to client");
    expect(vm.confirmLabel).toBe("Confirm Reassignment");
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

    expect(vm.headline).toBe("Revise Information for Mootez Aloui");
    expect(vm.description).toContain("selected information");
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

    expect(vm.headline).toBe("Revise Selected Information");
    expect(vm.assistantMessage).toBe("I can revise the selected information.");
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
    expect(collectViewModelStrings(vm).join(" ").toLowerCase()).not.toContain("what this affects");
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
        consequencesLabel: "Consequences",
        warningsLabel: "Warnings",
        reversibilityLabel: "Can this be undone?",
      },
    };

    expect(() => assertNonGenericSemanticCopy(genericVm)).toThrow(SemanticMappingError);
  });
});
