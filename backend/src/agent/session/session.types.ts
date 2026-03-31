import type {
  DraftArtifact,
  EntityReference,
  PendingAction,
  SessionID,
  ToolCallRecord,
  TurnType,
} from "../types";

export type SessionLifecycleStatus = "ACTIVE" | "PAUSED" | "CLOSED";

export interface SessionState {
  status: SessionLifecycleStatus;
  pendingAction: PendingAction | null;
  lastTurnType: TurnType;
}

export interface ConversationTurn {
  id: string;
  role: "system" | "user" | "assistant" | "tool";
  turnType: TurnType;
  message: string;
  createdAt: string;
  toolCalls?: ToolCallRecord[];
}

export interface ActiveEntity extends EntityReference {
  sourceTool?: string;
  lastMentionedAt: string;
}

export interface HistoryEntry {
  turnId: string;
  role: ConversationTurn["role"];
  summary: string;
  createdAt: string;
}

export interface Session {
  id: SessionID;
  userId?: string;
  state: SessionState;
  turns: ConversationTurn[];
  history: HistoryEntry[];
  activeEntities: ActiveEntity[];
  currentDraft?: DraftArtifact;
  summary?: string;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, unknown>;
}
