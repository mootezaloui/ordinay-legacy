import type { CommentaryOutput } from "../../../services/api/agent";

interface CommentaryBubbleProps {
  commentary: CommentaryOutput;
}

/**
 * Assistive Reasoning Bubble
 *
 * Renders the assistant's interpretive message AFTER the artifact.
 * The user sees the data first, then reads the assistant's reasoning about it.
 *
 * Render order (enforced in AgentWorkflow.tsx):
 *   1. Artifact (structured facts — data first)
 *   2. Assistive reasoning (this component — interpretation, priorities, offers of help)
 *   3. Follow-ups (clickable suggestions)
 *
 * RULES (from commentary.generator.js):
 * - Interprets consequences, priorities, tradeoffs
 * - Offers help when appropriate
 * - NEVER repeats facts already visible in the artifact
 * - NEVER proposes write actions
 * - Stays silent if it cannot add value beyond the artifact
 */
export function CommentaryBubble({ commentary }: CommentaryBubbleProps) {
  // Skip rendering if no commentary or empty message
  if (!commentary || !commentary.message || commentary.message.trim().length === 0) {
    return null;
  }

  return (
    <div className="agent-message-row animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="agent-bubble agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-5 py-4">
        <p className="m-0">
          {commentary.message}
        </p>
      </div>
    </div>
  );
}
