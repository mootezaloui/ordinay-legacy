import { describe, expect, it } from "vitest";
import {
  chatbotTurnReducer,
  resolveChatbotMutationStateFromAssistantResult,
  resolveChatbotMutationStateFromDone,
} from "../src/Agent_front/utils/chatbotTurnReducer";
import { extractChatMutationLifecycleEvent } from "../src/services/api/agent";

describe("chatbotTurnReducer", () => {
  it("sets pending mutation state on mutation_execution action", () => {
    const next = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: {
        kind: "mutation_execution",
        entityType: "client",
        entityId: "12",
        operation: "update",
        label: "Updating client status",
      },
    });

    expect(next?.mutation).toEqual({
      state: "pending",
      entityType: "client",
      entityId: 12,
      operation: "update",
      label: "Updating client status",
    });
  });

  it("resolves pending mutation to success or error from assistant result/done", () => {
    const pending = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: { kind: "mutation_execution", entityType: "task", entityId: 7, operation: "delete" },
    });

    const successFromResult = resolveChatbotMutationStateFromAssistantResult({
      mutationOutcome: { status: "success" },
      outputType: "chat",
    });
    expect(successFromResult).toBe("success");
    const success = chatbotTurnReducer(pending, {
      type: "mutation_resolved",
      state: successFromResult!,
    });
    expect(success?.mutation?.state).toBe("success");

    const errorFromResult = resolveChatbotMutationStateFromAssistantResult({
      mutationOutcome: { status: "failed" },
      outputType: "recovery",
    });
    expect(errorFromResult).toBe("error");

    const pendingAgain = chatbotTurnReducer(undefined, {
      type: "mutation_execution",
      action: { kind: "mutation_execution", entityType: "task", entityId: 8, operation: "update" },
    });
    const error = chatbotTurnReducer(pendingAgain, {
      type: "mutation_resolved",
      state: errorFromResult!,
    });
    expect(error?.mutation?.state).toBe("error");

    const doneFallback = resolveChatbotMutationStateFromDone({
      mutationOutcome: null,
      hasPendingMutation: true,
    });
    expect(doneFallback).toBe("success");
  });
});

describe("extractChatMutationLifecycleEvent", () => {
  it("extracts mutation_execution action payload and ignores non-mutation actions", () => {
    expect(
      extractChatMutationLifecycleEvent({
        payload: {
          kind: "mutation_execution",
          entityType: "client",
          entityId: 12,
          operation: "update",
          label: "Updating client status",
        },
      }),
    ).toMatchObject({
      kind: "mutation_execution",
      entityType: "client",
      entityId: 12,
      operation: "update",
      label: "Updating client status",
    });

    expect(
      extractChatMutationLifecycleEvent({
        kind: "something_else",
      }),
    ).toBeNull();
  });
});
