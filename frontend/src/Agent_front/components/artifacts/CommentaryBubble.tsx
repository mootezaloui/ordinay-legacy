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
    <div className="commentary-bubble mt-3 flex items-start gap-2.5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Agent avatar indicator */}
      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
        <MessageSquare className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
      </div>

      {/* Commentary content */}
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {commentary.message}
        </p>

        {/* Source indicator (only in development) */}
        {process.env.NODE_ENV === "development" && commentary.source !== "llm" && (
          <span className="mt-1 inline-block text-[10px] text-slate-400 dark:text-slate-500">
            [{commentary.source}]
          </span>
        )}
      </div>
    </div>
  );
}
