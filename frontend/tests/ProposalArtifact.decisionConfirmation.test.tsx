import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProposalOutput } from "../src/services/api/agent";

vi.mock("../src/contexts/DataContext", () => ({
  useData: () => ({
    clients: [{ id: 12, name: "Mootez Aloui" }],
    tasks: [{ id: 4, title: "Send court filing draft to client" }],
    financialEntries: [{ id: 9, title: "Invoice line: Filing fee reimbursement (EUR420)" }],
  }),
}));

import { ProposalArtifact } from "../src/Agent_front/components/artifacts/ProposalArtifact";

function normalizeHtml(html: string): string {
  return html.replace(/\s+/g, " ").trim();
}

function renderProposal(data: ProposalOutput) {
  return renderToStaticMarkup(
    <ProposalArtifact
      data={data}
      onConfirm={async () => ({
        type: "execution_result",
        proposalId: "x",
        status: "success",
      })}
      onCancel={() => {}}
    />,
  );
}

describe("ProposalArtifact semantic-only confirmation enforcement", () => {
  it("snapshot: sensitive client death confirmation renders semantic copy only", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p1",
          status: "pending",
          action: "update",
          description: "Update client status",
          requiresConfirmation: true,
          actionType: "UPDATE_ENTITY",
          reversible: true,
          params: {
            entityType: "client",
            entityId: 12,
            changes: {
              status: { from: "active", to: "deceased" },
            },
          },
          confirmation: {
            impactSummary: [
              "He will no longer appear in active-client views and routine follow-up suggestions.",
            ],
          },
        },
      ],
    });

    const normalized = normalizeHtml(html);
    expect(normalized).toContain("Mark Mootez Aloui as Deceased");
    expect(normalized).not.toContain("Update item");
    expect(normalized).not.toContain("Save changes");
    expect(normalized).toMatchSnapshot();
  });

  it("snapshot: neutral task completion includes task name and avoids legacy edit copy", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p-task",
          status: "pending",
          action: "update",
          description: "Update task",
          requiresConfirmation: true,
          actionType: "UPDATE_ENTITY",
          reversible: true,
          params: {
            entityType: "task",
            entityId: 4,
            changes: {
              status: { from: "in_progress", to: "completed" },
            },
          },
          confirmation: {
            impactSummary: [],
          },
        },
      ],
    });

    const normalized = normalizeHtml(html);
    expect(normalized).toContain("Send court filing draft to client");
    expect(normalized).not.toContain("Edit details");
    expect(normalized).toMatchSnapshot();
  });

  it("snapshot: destructive financial deletion avoids generic CRUD language", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p-del",
          status: "pending",
          action: "delete",
          description: "Delete financial entry",
          requiresConfirmation: true,
          actionType: "DELETE_ENTITY",
          reversible: false,
          params: {
            entityType: "financial_entry",
            entityId: 9,
          },
          confirmation: {
            impactSummary: ["This entry is used in financial totals."],
          },
        },
      ],
    });

    const normalized = normalizeHtml(html);
    expect(normalized).toContain("Delete Financial Entry Permanently");
    expect(normalized).not.toContain("Update item");
    expect(normalized).not.toContain("record");
    expect(normalized).not.toContain("Apply Changes");
    expect(normalized).toMatchSnapshot();
  });

  it("prevents duplicate assistant framing/description and duplicate headline-confirm label", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p1",
          status: "pending",
          action: "update",
          description: "Update client status",
          requiresConfirmation: true,
          actionType: "UPDATE_ENTITY",
          reversible: true,
          params: {
            entityType: "client",
            entityId: 12,
            changes: { status: { from: "active", to: "deceased" } },
          },
        },
      ],
    });

    expect((html.match(/I&#x27;m sorry\. I can mark Mootez Aloui as deceased/g) || []).length).toBe(1);
    expect((html.match(/You said this person has passed away\./g) || []).length).toBe(1);
    expect(html).toContain("Mark as Deceased");
    expect(html).not.toContain(">Mark Mootez Aloui as Deceased</button>");
  });

  it("renders in-panel applied state and does not reintroduce legacy lifecycle labels", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p2",
          status: "pending",
          action: "delete",
          description: "Delete entry",
          requiresConfirmation: true,
          actionType: "DELETE_ENTITY",
          reversible: false,
          params: {
            entityType: "financial_entry",
            entityId: 9,
          },
          uiState: {
            status: "confirmed",
            executionResult: {
              type: "execution_result",
              proposalId: "p2",
              status: "success",
              audit: { executedAt: "2026-02-24T11:00:00.000Z" },
            },
          },
        },
      ],
    });

    expect(html).toContain("Applied");
    expect(html).not.toContain("data-testid=\"chatbot-mutation-status\"");
    expect(html).not.toContain(">Done<");
    expect(html).not.toContain("Update failed");
  });

  it("shows stale/needs-refresh messaging for snapshot mismatch without leaking internal status code", () => {
    const html = renderProposal({
      type: "proposal",
      sessionId: "s1",
      proposals: [
        {
          proposalId: "p2",
          status: "pending",
          action: "delete",
          description: "Delete entry",
          requiresConfirmation: true,
          actionType: "DELETE_ENTITY",
          reversible: false,
          params: {
            entityType: "financial_entry",
            entityId: 9,
          },
          uiState: {
            status: "failed",
            executionResult: {
              type: "execution_result",
              proposalId: "p2",
              status: "snapshot_mismatch",
              error: {
                code: "SNAPSHOT_MISMATCH",
                message: "snapshot mismatch",
                safeMessage: "Data changed while waiting for confirmation.",
                requiresReproposal: true,
              },
            },
          },
        },
      ],
    });

    expect(html).toContain("This confirmation is no longer current.");
    expect(html).not.toContain("snapshot_mismatch");
    expect(html).not.toContain("Update failed");
  });
});
