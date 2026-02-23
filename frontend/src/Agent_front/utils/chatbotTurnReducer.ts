import type {
  AgentMessage,
  ChatbotMutationOperation,
  ChatbotTurnState,
} from "../types/agentMessage";

export interface ChatbotMutationExecutionAction {
  kind: "mutation_execution";
  entityType?: string;
  entityId?: number | string;
  operation?: string;
  label?: string;
}

export type ChatbotTurnReducerAction =
  | { type: "mutation_execution"; action: ChatbotMutationExecutionAction }
  | { type: "mutation_resolved"; state: "success" | "error" };

const MUTATION_OPERATIONS = new Set<ChatbotMutationOperation>([
  "create",
  "update",
  "delete",
]);

function normalizeEntityId(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeOperation(value: unknown): ChatbotMutationOperation | undefined {
  const normalized = String(value || "").trim().toLowerCase() as ChatbotMutationOperation;
  return MUTATION_OPERATIONS.has(normalized) ? normalized : undefined;
}

export function chatbotTurnReducer(
  current: ChatbotTurnState | undefined,
  action: ChatbotTurnReducerAction,
): ChatbotTurnState | undefined {
  if (action.type === "mutation_execution") {
    return {
      ...(current || {}),
      mutation: {
        state: "pending",
        entityType:
          typeof action.action.entityType === "string" && action.action.entityType.trim()
            ? action.action.entityType.trim()
            : current?.mutation?.entityType,
        entityId:
          normalizeEntityId(action.action.entityId) ?? current?.mutation?.entityId,
        operation:
          normalizeOperation(action.action.operation) ?? current?.mutation?.operation,
        label:
          typeof action.action.label === "string" && action.action.label.trim()
            ? action.action.label.trim()
            : current?.mutation?.label,
      },
    };
  }

  if (!current?.mutation) return current;

  return {
    ...current,
    mutation: {
      ...current.mutation,
      state: action.state,
    },
  };
}

export function attachChatbotTurn(message: AgentMessage, chatbotTurn?: ChatbotTurnState): AgentMessage {
  if (message.role !== "agent") return message;
  if (!chatbotTurn?.mutation) return message;
  return {
    ...message,
    chatbotTurn: {
      ...(message.chatbotTurn || {}),
      ...chatbotTurn,
      mutation: {
        ...chatbotTurn.mutation,
      },
    },
  };
}

export function resolveChatbotMutationStateFromAssistantResult(input: {
  mutationOutcome?: { status?: string | null } | null;
  outputType?: string | null;
}): "success" | "error" | null {
  const status = String(input.mutationOutcome?.status || "").trim().toLowerCase();
  if (status) {
    if (["success", "ok", "completed"].includes(status)) return "success";
    if (["error", "failed", "failure"].includes(status)) return "error";
  }

  if (String(input.outputType || "").trim().toLowerCase() === "recovery") {
    return "error";
  }

  return null;
}

export function resolveChatbotMutationStateFromDone(input: {
  mutationOutcome?: { status?: string | null } | null;
  hasPendingMutation: boolean;
}): "success" | "error" | null {
  const status = String(input.mutationOutcome?.status || "").trim().toLowerCase();
  if (status) {
    if (["success", "ok", "completed"].includes(status)) return "success";
    if (["error", "failed", "failure"].includes(status)) return "error";
  }
  return input.hasPendingMutation ? "success" : null;
}
