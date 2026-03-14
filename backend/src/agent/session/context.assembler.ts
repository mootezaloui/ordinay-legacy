import type { PendingAction } from "../types";
import type { ActiveEntity, ConversationTurn, Session } from "./session.types";

const MAX_CONTEXT_TURNS = 10;

export interface SessionContext {
  activeEntities: ActiveEntity[];
  lastTurns: ConversationTurn[];
  summary?: string;
  pendingAction?: PendingAction | null;
}

export function buildContext(session: Session): SessionContext {
  const recentTurns = session.turns.slice(-MAX_CONTEXT_TURNS);
  const hasSummary = Boolean(session.summary && session.summary.trim().length > 0);

  return {
    activeEntities: [...session.activeEntities],
    lastTurns: [...recentTurns],
    summary: hasSummary ? session.summary : undefined,
    pendingAction: session.state.pendingAction ?? null,
  };
}
