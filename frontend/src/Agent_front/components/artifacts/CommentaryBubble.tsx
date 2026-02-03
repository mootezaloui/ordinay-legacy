import { MessageSquare } from "lucide-react";
import type { CommentaryOutput } from "../../../services/api/agent";

interface CommentaryBubbleProps {
  commentary: CommentaryOutput;
}

/**
 * Conversational Commentary Bubble
 *
 * Renders the conversational commentary ABOUT a structured artifact.
 * This is where the agent's "intelligence" lives — explaining, contextualizing,
 * and suggesting read-only next steps.
 *
 * The commentary appears BELOW the artifact card, creating a natural flow:
 *   1. Artifact (facts, interpretation, navigation)
 *   2. Commentary (conversational explanation)
 *   3. Follow-ups (clickable suggestions)
 *
 * RULES (from commentary.generator.js):
 * - Acknowledges what was found
 * - Explains relevance if urgent signals exist
 * - Asks clarification if ambiguity exists
 * - Suggests read-only next steps
 * - NEVER repeats facts verbatim
 * - NEVER proposes write actions
 */
export function CommentaryBubble({ commentary }: CommentaryBubbleProps) {
  // Skip rendering if no commentary or empty message
  if (!commentary || !commentary.message || commentary.message.trim().length === 0) {
    return null;
  }

  return (
    <div className="commentary-bubble mt-3 agent-message-row animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Agent avatar indicator */}
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200/70 dark:border-slate-700/60">
        <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      </div>

      {/* Commentary content */}
      <div className="agent-bubble agent-bubble-soft agent-chat-text text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
        <p>
          {commentary.message}
        </p>

      </div>
    </div>
  );
}
