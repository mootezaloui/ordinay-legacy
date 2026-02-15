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
  const hasLines = Array.isArray(commentary?.lines) && commentary.lines.length > 0;
  const hasOptions =
    Array.isArray(commentary?.options) && commentary.options.length > 0;
  const hasQuestion =
    typeof commentary?.question === "string" && commentary.question.length > 0;
  const hasStructured =
    commentary &&
    (hasLines || hasOptions || hasQuestion);
  if (
    !commentary ||
    (!hasStructured && (!commentary.message || commentary.message.trim().length === 0))
  ) {
    return null;
  }

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="agent-chat-text text-[15px] leading-relaxed text-slate-700 dark:text-slate-300 px-1 pt-3 border-t border-black/[0.05] dark:border-white/[0.05] space-y-1.5">
        {hasLines &&
          commentary.lines.map((line, index) => (
            <p key={`${line}-${index}`} className="m-0">
              {line}
            </p>
          ))}
        {hasOptions && (
            <ul className="m-0 pl-4 space-y-1 text-slate-600 dark:text-slate-400">
              {commentary.options.map((option) => (
                <li key={`${option.value}-${option.label}`} className="list-disc">
                  {option.label}
                </li>
              ))}
            </ul>
          )}
        {hasQuestion && (
          <p className="m-0 text-[15px] font-medium">{commentary.question}</p>
        )}
        {!hasStructured && commentary.message && (
          <p className="m-0 text-[15px] text-slate-700 dark:text-slate-300">
            {commentary.message}
          </p>
        )}
      </div>
    </div>
  );
}
