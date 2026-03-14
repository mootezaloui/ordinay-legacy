"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildContext = buildContext;
const MAX_CONTEXT_TURNS = 10;
function buildContext(session) {
    const recentTurns = session.turns.slice(-MAX_CONTEXT_TURNS);
    const hasSummary = Boolean(session.summary && session.summary.trim().length > 0);
    return {
        activeEntities: [...session.activeEntities],
        lastTurns: [...recentTurns],
        summary: hasSummary ? session.summary : undefined,
        pendingAction: session.state.pendingAction ?? null,
    };
}
