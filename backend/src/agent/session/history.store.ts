import type { HistoryEntry, Session } from "./session.types";

const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 200;

export function appendHistory(session: Session, entry: HistoryEntry): void {
  session.history.push(entry);
}

export function getRecentHistory(session: Session, limit = DEFAULT_HISTORY_LIMIT): HistoryEntry[] {
  const safeLimit = normalizeLimit(limit);
  return session.history.slice(-safeLimit);
}

export function clearHistory(session: Session): void {
  session.history = [];
}

function normalizeLimit(limit: number): number {
  if (!Number.isFinite(limit)) {
    return DEFAULT_HISTORY_LIMIT;
  }

  const normalized = Math.floor(limit);
  if (normalized < 1) {
    return 1;
  }

  if (normalized > MAX_HISTORY_LIMIT) {
    return MAX_HISTORY_LIMIT;
  }

  return normalized;
}
