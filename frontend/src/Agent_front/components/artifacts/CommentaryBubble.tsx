import { Lightbulb } from "lucide-react";
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
    <div className="agent-insight-callout mt-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Insight card */}
      <div className="agent-insight-card">
        {/* Icon */}
        <div className="agent-insight-icon">
          <Lightbulb className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        </div>

        {/* Content */}
        <div className="agent-insight-content">
          <span className="agent-insight-label">Agent Insight</span>
          <p className="agent-insight-text">
            {commentary.message}
          </p>
        </div>
      </div>
    </div>
  );
}
