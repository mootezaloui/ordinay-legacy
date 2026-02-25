// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";

vi.mock("../src/contexts/DataContext", () => ({
  useData: () => ({
    clients: [{ id: 12, name: "Mootez Aloui" }],
  }),
}));

import { ProposalArtifact } from "../src/Agent_front/components/artifacts/ProposalArtifact";
import { SemanticConfirmationErrorBoundary } from "../src/Agent_front/components/artifacts/confirmation/SemanticConfirmationErrorBoundary";

describe("SemanticConfirmationErrorBoundary", () => {
  it("renders controlled retry messaging when semantic mapping fails for a proposal confirmation", async () => {
    // React 19 act() guard for jsdom tests
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(
        <SemanticConfirmationErrorBoundary>
          <ProposalArtifact
            data={{
              type: "proposal",
              sessionId: "s1",
              proposals: [
                {
                  proposalId: "p-bad",
                  status: "pending",
                  action: "update",
                  description: "Update client details",
                  requiresConfirmation: true,
                  actionType: "UPDATE_ENTITY",
                  params: {},
                },
              ],
            }}
            onConfirm={async () => ({
              type: "execution_result",
              proposalId: "x",
              status: "success",
            })}
            onCancel={() => {}}
          />
        </SemanticConfirmationErrorBoundary>,
      );
    });

    const html = container.innerHTML;
    expect(html).toContain("I couldn");
    expect(html).toContain("prepare that confirmation safely");
    expect(html).not.toContain("Update item");
    expect(html).not.toContain("Save changes");

    await act(async () => {
      root.unmount();
    });
    container.remove();
    consoleErrorSpy.mockRestore();
  });
});
