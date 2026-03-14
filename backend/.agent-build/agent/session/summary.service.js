"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSummary = generateSummary;
const SUMMARY_MAX_CHARS = 1_500;
const MAX_ASSISTANT_TURNS = 8;
function generateSummary(session) {
    const assistantTurns = session.turns.filter((turn) => turn.role === "assistant" && turn.message.trim().length > 0);
    const latestFirst = [...assistantTurns].reverse();
    const selectedLatest = latestFirst.slice(0, MAX_ASSISTANT_TURNS);
    const chronological = selectedLatest.reverse();
    const combined = chronological.map((turn) => turn.message.trim()).join("\n");
    if (combined.length <= SUMMARY_MAX_CHARS) {
        return combined;
    }
    return combined.slice(0, SUMMARY_MAX_CHARS - 3).trimEnd() + "...";
}
