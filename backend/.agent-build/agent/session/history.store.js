"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.appendHistory = appendHistory;
exports.getRecentHistory = getRecentHistory;
exports.clearHistory = clearHistory;
const DEFAULT_HISTORY_LIMIT = 20;
const MAX_HISTORY_LIMIT = 200;
function appendHistory(session, entry) {
    session.history.push(entry);
}
function getRecentHistory(session, limit = DEFAULT_HISTORY_LIMIT) {
    const safeLimit = normalizeLimit(limit);
    return session.history.slice(-safeLimit);
}
function clearHistory(session) {
    session.history = [];
}
function normalizeLimit(limit) {
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
