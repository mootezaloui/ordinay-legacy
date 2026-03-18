export enum AgentMode {
  READ_ONLY = "READ_ONLY",
  DRAFT = "DRAFT",
  EXECUTE = "EXECUTE",
  AUTONOMOUS = "AUTONOMOUS",
}

export enum TurnType {
  NEW = "NEW",
  CONFIRMATION = "CONFIRMATION",
  REJECTION = "REJECTION",
  AMENDMENT = "AMENDMENT",
}

export type SessionID = string;

export interface EntityReference {
  type: string;
  id: string | number;
  label?: string;
}

export interface PendingAction {
  id: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
  createdAt: string;
  requestedByTurnId?: string;
  risk?: "low" | "medium" | "high";
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  sessionId: SessionID;
  turnId: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface DraftArtifact {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  content: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  generatedAt: string;
  version: number;
}

export interface AgentTurnInput {
  sessionId: SessionID;
  turnId: string;
  message: string;
  mode: AgentMode;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTurnOutput {
  sessionId: SessionID;
  turnId: string;
  turnType: TurnType;
  responseText: string;
  pendingAction?: PendingAction | null;
  toolCalls?: ToolCallRecord[];
  audit?: AuditRecord[];
  metadata?: Record<string, unknown>;
}
