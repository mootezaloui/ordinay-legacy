"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.InMemorySessionStore = void 0;
const config_1 = require("../config");
const errors_1 = require("../errors");
const types_1 = require("../types");
class InMemorySessionStore {
    repository;
    sessions = new Map();
    sessionTouches = new Map();
    maxSessions;
    evictAfterTouches;
    touchCounter = 0;
    cacheStats = {
        hits: 0,
        misses: 0,
        loads: 0,
        creates: 0,
        updates: 0,
        evictions: 0,
    };
    constructor(repository, options = {}) {
        this.repository = repository;
        this.maxSessions = this.normalizePositiveInt(options.maxSessions, 200);
        this.evictAfterTouches = this.normalizePositiveInt(options.evictAfterTouches, 120);
    }
    createSession(input) {
        const sessionId = this.normalizeSessionId(input.sessionId);
        if (this.sessions.has(sessionId)) {
            throw new errors_1.SessionError(`Session "${sessionId}" already exists`);
        }
        const now = new Date().toISOString();
        const session = {
            id: sessionId,
            userId: input.userId,
            mode: input.mode ?? config_1.DEFAULT_AGENT_MODE,
            state: {
                status: "ACTIVE",
                pendingAction: null,
                lastTurnType: types_1.TurnType.NEW,
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
        this.enqueuePersistence("clearPendingAction(create)", () => this.repository?.clearPendingAction(sessionId));
        return session;
    }
    getSession(sessionId) {
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
    async getOrLoadSession(sessionId) {
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
        loaded.mode = loaded.mode ?? config_1.DEFAULT_AGENT_MODE;
        loaded.state = loaded.state ?? {
            status: "ACTIVE",
            pendingAction: null,
            lastTurnType: types_1.TurnType.NEW,
        };
        loaded.state.pendingAction = loaded.state.pendingAction ?? null;
        loaded.state.lastTurnType = loaded.state.lastTurnType ?? types_1.TurnType.NEW;
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
    async requireOrLoadSession(sessionId) {
        const loaded = await this.getOrLoadSession(sessionId);
        if (!loaded) {
            throw new errors_1.SessionError(`Session "${sessionId}" not found`);
        }
        return loaded;
    }
    requireSession(sessionId) {
        const session = this.getSession(sessionId);
        if (!session) {
            throw new errors_1.SessionError(`Session "${sessionId}" not found`);
        }
        return session;
    }
    updateSession(session) {
        const sessionId = this.normalizeSessionId(session.id);
        session.updatedAt = new Date().toISOString();
        session.state.pendingAction = session.state.pendingAction ?? null;
        this.cacheStats.updates += 1;
        this.setCacheEntry(sessionId, session);
        this.evictIfNeeded(sessionId);
        this.enqueuePersistence("saveSession(update)", () => this.repository?.saveSession(session));
        if (session.state.pendingAction) {
            this.enqueuePersistence("setPendingAction(update)", () => this.repository?.setPendingAction(sessionId, session.state.pendingAction));
        }
        else {
            this.enqueuePersistence("clearPendingAction(update)", () => this.repository?.clearPendingAction(sessionId));
        }
    }
    deleteSession(sessionId) {
        const key = this.normalizeSessionId(sessionId);
        this.sessions.delete(key);
        this.sessionTouches.delete(key);
        this.enqueuePersistence("clearPendingAction(delete)", () => this.repository?.clearPendingAction(key));
    }
    getCacheStats() {
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
    trimCache(targetSize) {
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
    clearCache() {
        const removed = this.sessions.size;
        this.sessions.clear();
        this.sessionTouches.clear();
        return removed;
    }
    normalizeSessionId(sessionId) {
        const normalized = String(sessionId ?? "").trim();
        if (!normalized) {
            throw new errors_1.SessionError("Session ID must be a non-empty string");
        }
        return normalized;
    }
    setCacheEntry(sessionId, session) {
        if (this.sessions.has(sessionId)) {
            this.sessions.delete(sessionId);
        }
        this.sessions.set(sessionId, session);
        this.touchSession(sessionId, session);
    }
    touchSession(sessionId, session) {
        this.touchCounter += 1;
        this.sessionTouches.set(sessionId, this.touchCounter);
        if (this.sessions.get(sessionId) !== session) {
            this.sessions.set(sessionId, session);
        }
        this.evictStaleSessions();
    }
    evictIfNeeded(protectedSessionId) {
        while (this.sessions.size > this.maxSessions) {
            if (!this.evictOldest(protectedSessionId)) {
                break;
            }
        }
    }
    evictStaleSessions() {
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
    evictOldest(protectedSessionId) {
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
    evictSession(sessionId) {
        if (!this.sessions.has(sessionId)) {
            return;
        }
        this.sessions.delete(sessionId);
        this.sessionTouches.delete(sessionId);
        this.cacheStats.evictions += 1;
    }
    normalizePositiveInt(value, fallback) {
        const parsed = Number.parseInt(String(value ?? fallback), 10);
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
    }
    enqueuePersistence(label, write) {
        if (!this.repository) {
            return;
        }
        Promise.resolve()
            .then(() => write())
            .catch((error) => {
            const message = error instanceof Error && error.message.trim().length > 0
                ? error.message
                : String(error || "unknown persistence error");
            console.warn(`[agent.persistence] ${label} failed: ${message}`);
        });
    }
}
exports.InMemorySessionStore = InMemorySessionStore;
