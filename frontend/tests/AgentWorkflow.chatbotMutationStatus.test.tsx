import { describe, expect, it, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { chatbotTurnReducer } from "../src/Agent_front/utils/chatbotTurnReducer";
import type { AgentMessage } from "../src/Agent_front/types/agentMessage";

function stubComponent(testId: string) {
  return () => <div data-testid={testId} />;
}

vi.mock("../src/Agent_front/hooks/useAgentSessions", () => ({
  useAgentSessions: () => ({
    activeSessionId: undefined,
    activeSession: undefined,
    updateSessionMessages: vi.fn(),
  }),
}));

vi.mock("../src/Agent_front/components/artifacts/ChatArtifact", () => ({
  ChatArtifact: ({ content }: { content: string }) => (
    <div data-testid="chat-bubble">{content}</div>
  ),
}));

vi.mock("../src/Agent_front/components/artifacts/ExplanationArtifact", () => ({
  ExplanationArtifact: stubComponent("explanation-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/RiskArtifact", () => ({
  RiskArtifact: stubComponent("risk-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/DraftArtifact", () => ({
  DraftArtifact: stubComponent("draft-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/ActionArtifact", () => ({
  ActionArtifact: stubComponent("action-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/ProposalArtifact", () => ({
  ProposalArtifact: stubComponent("proposal-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/ClarificationArtifact", () => ({
  ClarificationArtifact: stubComponent("clarification-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/CollectionArtifact", () => ({
  CollectionArtifact: stubComponent("collection-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/WebSearchResultsArtifact", () => ({
  WebSearchResultsArtifact: stubComponent("web-search-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/DocumentGenerationPreviewArtifact", () => ({
  DocumentGenerationPreviewArtifact: stubComponent("doc-preview-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/RecoveryArtifact", () => ({
  RecoveryArtifact: stubComponent("recovery-artifact"),
}));
vi.mock("../src/Agent_front/components/artifacts/ContextSuggestionRenderer", () => ({
  ContextSuggestionRenderer: stubComponent("context-suggestion-artifact"),
}));
vi.mock("../src/Agent_front/components/messages/AckMessage", () => ({
  AckMessage: stubComponent("ack-message"),
}));
vi.mock("../src/Agent_front/components/messages/StatusMessage", () => ({
  StatusMessage: stubComponent("status-message"),
}));
vi.mock("../src/Agent_front/components/messages/IntentFramingMessage", () => ({
  IntentFramingMessage: stubComponent("intent-message"),
}));
vi.mock("../src/components/MarkdownOutput", () => ({
  MarkdownOutput: ({ content }: { content: string }) => <span>{content}</span>,
}));
vi.mock("../src/services/api/agent", async () => {
  const actual = await vi.importActual<object>("../src/services/api/agent");
  return {
    ...actual,
    cancelDocumentGenerationPreview: vi.fn(),
    confirmDocumentGenerationPreview: vi.fn(),
    confirmProposal: vi.fn(),
  };
});

import { AgentWorkflow } from "../src/Agent_front/components/AgentWorkflow";

function buildMessage(overrides: Partial<AgentMessage> = {}): AgentMessage {
  return {
    id: "a-1",
    role: "agent",
    content: "Client status updated.",
    timestamp: new Date("2026-02-23T10:00:00.000Z"),
    status: "success",
    intent: "COMMAND",
    stage: "artifact",
    ...overrides,
  };
}

function renderWorkflow(message: AgentMessage): string {
  return renderToStaticMarkup(<AgentWorkflow message={message} />);
}

describe("AgentWorkflow chatbot mutation status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders one assistant bubble and pending mutation status", () => {
    const chatbotTurn = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: {
        kind: "mutation_execution",
        entityType: "client",
        entityId: 12,
        operation: "update",
        label: "Updating client status",
      },
    });

    const html = renderWorkflow(buildMessage({ chatbotTurn }));

    expect((html.match(/data-testid=\"chat-bubble\"/g) || []).length).toBe(1);
    expect(html).toContain("data-testid=\"chatbot-mutation-status\"");
    expect(html).toContain("Updating client status");
  });

  it("shows success mutation status without duplicate assistant bubble", () => {
    const pending = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: { kind: "mutation_execution", entityType: "client", entityId: 12, operation: "update" },
    });
    const chatbotTurn = chatbotTurnReducer(pending, {
      type: "mutation_resolved",
      state: "success",
    });

    const html = renderWorkflow(buildMessage({ chatbotTurn }));

    expect((html.match(/data-testid=\"chat-bubble\"/g) || []).length).toBe(1);
    expect(html).toContain("data-state=\"success\"");
    expect(html).toContain(">Done<");
  });

  it("shows error state without internal debug text leakage", () => {
    const pending = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: { kind: "mutation_execution", entityType: "client", entityId: 12, operation: "update" },
    });
    const chatbotTurn = chatbotTurnReducer(pending, {
      type: "mutation_resolved",
      state: "error",
    });

    const html = renderWorkflow(buildMessage({ chatbotTurn }));

    expect(html).toContain("data-state=\"error\"");
    expect(html).toContain("Update failed");
    expect(html).not.toContain("mutation_execution");
    expect(html).not.toContain("/mutate");
    expect(html).not.toContain("stack");
  });

  it("leaves non-chatbot/engine-style messages unaffected when no chatbotTurn is present", () => {
    const html = renderWorkflow(buildMessage({ chatbotTurn: undefined }));

    expect((html.match(/data-testid=\"chat-bubble\"/g) || []).length).toBe(1);
    expect(html).not.toContain("data-testid=\"chatbot-mutation-status\"");
  });

  it("keeps proposal confirmations in one assistant turn without a separate chat bubble", () => {
    const html = renderWorkflow(
      buildMessage({
        content: "I can make that change. Please confirm.",
        data: {
          type: "proposal",
          proposal: {
            type: "proposal",
            sessionId: "session-1",
            proposals: [],
          },
        },
      }),
    );

    expect((html.match(/data-testid=\"chat-bubble\"/g) || []).length).toBe(0);
    expect(html).toContain("data-testid=\"proposal-artifact\"");
  });

  it("suppresses generic chatbot mutation lifecycle block for proposal turns", () => {
    const chatbotTurn = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: {
        kind: "mutation_execution",
        entityType: "client",
        entityId: 12,
        operation: "update",
        label: "Updating client status",
      },
    });

    const html = renderWorkflow(
      buildMessage({
        content: "I can update the client status. Confirm?",
        chatbotTurn,
        data: {
          type: "proposal",
          proposal: {
            type: "proposal",
            sessionId: "session-1",
            proposals: [],
          },
        },
      }),
    );

    expect(html).toContain("data-testid=\"proposal-artifact\"");
    expect(html).not.toContain("data-testid=\"chatbot-mutation-status\"");
    expect(html).not.toContain("Updating client status");
  });
});
