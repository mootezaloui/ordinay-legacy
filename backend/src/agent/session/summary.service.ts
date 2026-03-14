import type { Session } from "./session.types";

const SUMMARY_MAX_CHARS = 1_500;
const MAX_ASSISTANT_TURNS = 8;

export function generateSummary(session: Session): string {
  const assistantTurns = session.turns.filter(
    (turn) => turn.role === "assistant" && turn.message.trim().length > 0,
  );

  const latestFirst = [...assistantTurns].reverse();
  const selectedLatest = latestFirst.slice(0, MAX_ASSISTANT_TURNS);
  const chronological = selectedLatest.reverse();
  const combined = chronological.map((turn) => turn.message.trim()).join("\n");

  if (combined.length <= SUMMARY_MAX_CHARS) {
    return combined;
  }

  return combined.slice(0, SUMMARY_MAX_CHARS - 3).trimEnd() + "...";
}
