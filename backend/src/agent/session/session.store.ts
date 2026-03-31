import { SessionError } from "../errors";
import { TurnType, type SessionID } from "../types";
import type { Session } from "./session.types";

export interface SessionPersistenceBridge {
  loadSession(sessionId: SessionID): Promise<Session | null>;
  saveSession(session: Session): Promise<void>;
  saveTurnSnapshot?(
    sessionId: SessionID,
    turnId: string,
    input: Record<string, unknown>,
    output: Record<string, unknown>,
    createdAt?: string,
    completedAt?: string,
  ): Promise<void>;
  appendHistory?(
    sessionId: SessionID,
    entry: { turnId: string; role: string; summary: string; createdAt: string },
    toolName?: string,
  ): Promise<void>;
  setPendingAction(sessionId: SessionID, action: NonNullable<Session["state"]["pendingAction"]>): Promise<void>;
  clearPendingAction(sessionId: SessionID): Promise<void>;
  appendAudit?(record: {
    id: string;
    sessionId: SessionID;
    turnId: string;
    eventType: string;
    timestamp: string;
    data: Record<string, unknown>;
  }): Promise<void>;
  getRecentAuditEvents?(params?: {
    limit?: number;
    eventTypes?: string[];
    sessionId?: SessionID;
  }): Promise<
    Array<{
      id: string;
      sessionId: SessionID;
      turnId: string;
      eventType: string;
      timestamp: string;
      data: Record<string, unknown>;
    }>
  >;
  getTurnTraceByTurnId?(turnId: string): Promise<{
    id: string;
    sessionId: SessionID;
    turnId: string;
    eventType: string;
    timestamp: string;
    data: Record<string, unknown>;
  } | null>;
  getHealthSnapshots?(params?: { limit?: number }): Promise<
    Array<{
      id: string;
      sessionId: SessionID;
      turnId: string;
      eventType: string;
      timestamp: string;
      data: Record<string, unknown>;
    }>
  >;
  getPerformanceSnapshots?(params?: { limit?: number }): Promise<
    Array<{
      id: string;
      sessionId: SessionID;
      turnId: string;
      eventType: string;
      timestamp: string;
      data: Record<string, unknown>;
    }>
  >;
}

export interface CreateSessionInput {
  sessionId: SessionID;
  userId?: string;
}

export interface SessionStoreOptions {
  maxSessions?: number;
  evictAfterTouches?: number;
}

export class InMemorySessionStore {
  private readonly sessions = new Map<SessionID, Session>();
  private readonly sessionTouches = new Map<SessionID, number>();
  private readonly maxSessions: number;
  private readonly evictAfterTouches: number;
  private touchCounter = 0;
  private readonly cacheStats = {
    hits: 0,
    misses: 0,
    loads: 0,
    creates: 0,
    updates: 0,
    evictions: 0,
  };

  constructor(
    private readonly repository?: SessionPersistenceBridge,
    options: SessionStoreOptions = {},
  ) {
    this.maxSessions = this.normalizePositiveInt(options.maxSessions, 200);
    this.evictAfterTouches = this.normalizePositiveInt(options.evictAfterTouches, 120);
  }

  createSession(input: CreateSessionInput): Session {
    const sessionId = this.normalizeSessionId(input.sessionId);
    if (this.sessions.has(sessionId)) {
      throw new SessionError(`Session "${sessionId}" already exists`);
    }

    const now = new Date().toISOString();
    const session: Session = {
      id: sessionId,
      userId: input.userId,
      state: {
        status: "ACTIVE",
        pendingAction: null,
        lastTurnType: TurnType.NEW,
      },
      turns: [],
      history: [],
      activeEntities: [],
      summary: undefined,
      createdAt: now,
      updatedAt: now,
      metadata: undefined,
    };

    this.cacheStats.creates += 1;
    this.setCacheEntry(sessionId, session);
    this.evictIfNeeded(sessionId);
    this.enqueuePersistence("saveSession(create)", () => this.repository?.saveSession(session));
    this.enqueuePersistence("clearPendingAction(create)", () =>
      this.repository?.clearPendingAction(sessionId),
    );
    return session;
  }

  getSession(sessionId: SessionID): Session | null {
    const key = this.normalizeSessionId(sessionId);
    const session = this.sessions.get(key) ?? null;
    if (!session) {
      this.cacheStats.misses += 1;
      return null;
    }
    this.cacheStats.hits += 1;
    this.touchSession(key, session);
    return session;
  }

  async getOrLoadSession(sessionId: SessionID): Promise<Session | null> {
    const key = this.normalizeSessionId(sessionId);
    const cached = this.sessions.get(key);
    if (cached) {
      this.cacheStats.hits += 1;
      this.touchSession(key, cached);
      return cached;
    }
    this.cacheStats.misses += 1;

    if (!this.repository) {
      return null;
    }

    const loaded = await this.repository.loadSession(key);
    if (!loaded) {
      return null;
    }

    loaded.id = key;
    loaded.state = loaded.state ?? {
      status: "ACTIVE",
      pendingAction: null,
      lastTurnType: TurnType.NEW,
    };
    loaded.state.pendingAction = loaded.state.pendingAction ?? null;
    loaded.state.lastTurnType = loaded.state.lastTurnType ?? TurnType.NEW;
    loaded.turns = Array.isArray(loaded.turns) ? loaded.turns : [];
    loaded.history = Array.isArray(loaded.history) ? loaded.history : [];
    loaded.activeEntities = Array.isArray(loaded.activeEntities) ? loaded.activeEntities : [];
    loaded.currentDraft =
      loaded.currentDraft && typeof loaded.currentDraft === "object" && !Array.isArray(loaded.currentDraft)
        ? loaded.currentDraft
        : undefined;
    loaded.createdAt = loaded.createdAt || new Date().toISOString();
    loaded.updatedAt = loaded.updatedAt || loaded.createdAt;

    this.cacheStats.loads += 1;
    this.setCacheEntry(key, loaded);
    this.evictIfNeeded(key);
    return loaded;
  }

  async requireOrLoadSession(sessionId: SessionID): Promise<Session> {
    const loaded = await this.getOrLoadSession(sessionId);
    if (!loaded) {
      throw new SessionError(`Session "${sessionId}" not found`);
    }
    return loaded;
  }

  requireSession(sessionId: SessionID): Session {
    const session = this.getSession(sessionId);
    if (!session) {
      throw new SessionError(`Session "${sessionId}" not found`);
    }
    return session;
  }

  updateSession(session: Session): void {
    const sessionId = this.normalizeSessionId(session.id);
    session.updatedAt = new Date().toISOString();
    session.state.pendingAction = session.state.pendingAction ?? null;
    this.cacheStats.updates += 1;
    this.setCacheEntry(sessionId, session);
    this.evictIfNeeded(sessionId);
    this.enqueuePersistence("saveSession(update)", () => this.repository?.saveSession(session));
    if (session.state.pendingAction) {
      this.enqueuePersistence("setPendingAction(update)", () =>
        this.repository?.setPendingAction(sessionId, session.state.pendingAction!),
      );
    } else {
      this.enqueuePersistence("clearPendingAction(update)", () =>
        this.repository?.clearPendingAction(sessionId),
      );
    }
  }

  deleteSession(sessionId: SessionID): void {
    const key = this.normalizeSessionId(sessionId);
    this.sessions.delete(key);
    this.sessionTouches.delete(key);
    this.enqueuePersistence("clearPendingAction(delete)", () =>
      this.repository?.clearPendingAction(key),
    );
  }

  getCacheStats(): Record<string, number> {
    return {
      size: this.sessions.size,
      max: this.maxSessions,
      hits: this.cacheStats.hits,
      misses: this.cacheStats.misses,
      loads: this.cacheStats.loads,
      creates: this.cacheStats.creates,
      updates: this.cacheStats.updates,
      evictions: this.cacheStats.evictions,
    };
  }

  trimCache(targetSize?: number): number {
    const desiredSize = this.normalizePositiveInt(targetSize, Math.floor(this.maxSessions / 2));
    const safeTarget = Math.min(desiredSize, this.maxSessions);
    let removed = 0;
    while (this.sessions.size > safeTarget) {
      if (!this.evictOldest()) {
        break;
      }
      removed += 1;
    }
    return removed;
  }

  clearCache(): number {
    const removed = this.sessions.size;
    this.sessions.clear();
    this.sessionTouches.clear();
    return removed;
  }

  private normalizeSessionId(sessionId: SessionID): SessionID {
    const normalized = String(sessionId ?? "").trim();
    if (!normalized) {
      throw new SessionError("Session ID must be a non-empty string");
    }
    return normalized;
  }

  private setCacheEntry(sessionId: SessionID, session: Session): void {
    if (this.sessions.has(sessionId)) {
      this.sessions.delete(sessionId);
    }
    this.sessions.set(sessionId, session);
    this.touchSession(sessionId, session);
  }

  private touchSession(sessionId: SessionID, session: Session): void {
    this.touchCounter += 1;
    this.sessionTouches.set(sessionId, this.touchCounter);
    if (this.sessions.get(sessionId) !== session) {
      this.sessions.set(sessionId, session);
    }
    this.evictStaleSessions();
  }

  private evictIfNeeded(protectedSessionId?: SessionID): void {
    while (this.sessions.size > this.maxSessions) {
      if (!this.evictOldest(protectedSessionId)) {
        break;
      }
    }
  }

  private evictStaleSessions(): void {
    if (this.evictAfterTouches <= 0) {
      return;
    }
    const threshold = this.touchCounter - this.evictAfterTouches;
    if (threshold <= 0 || this.sessions.size <= 1) {
      return;
    }

    for (const [sessionId, touchedAt] of this.sessionTouches.entries()) {
      if (this.sessions.size <= 1) {
        break;
      }
      if (touchedAt <= threshold) {
        this.evictSession(sessionId);
      }
    }
  }

  private evictOldest(protectedSessionId?: SessionID): boolean {
    const keys = [...this.sessions.keys()];
    if (keys.length === 0) {
      return false;
    }

    for (const key of keys) {
      if (protectedSessionId && key === protectedSessionId) {
        continue;
      }
      this.evictSession(key);
      return true;
    }

    if (protectedSessionId) {
      return false;
    }
    this.evictSession(keys[0]);
    return true;
  }

  private evictSession(sessionId: SessionID): void {
    if (!this.sessions.has(sessionId)) {
      return;
    }
    this.sessions.delete(sessionId);
    this.sessionTouches.delete(sessionId);
    this.cacheStats.evictions += 1;
  }

  private normalizePositiveInt(value: unknown, fallback: number): number {
    const parsed = Number.parseInt(String(value ?? fallback), 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private enqueuePersistence(label: string, write: () => Promise<void> | undefined): void {
    if (!this.repository) {
      return;
    }
    Promise.resolve()
      .then(() => write())
      .catch((error) => {
        const message =
          error instanceof Error && error.message.trim().length > 0
            ? error.message
            : String(error || "unknown persistence error");
        console.warn(`[agent.persistence] ${label} failed: ${message}`);
      });
  }
}
