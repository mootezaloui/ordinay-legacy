import { Sparkles } from "lucide-react";

interface AckMessageProps {
  content: string;
}

/**
 * Acknowledgement Message
 *
 * Renders the IMMEDIATE acknowledgement shown to the user
 * the instant they submit a message. This is deterministic,
 * no LLM involvement — just confirming the request was received.
 *
 * The ack message is:
 * - Shown INSTANTLY (no network wait)
 * - Short and direct ("Got it, checking now.")
 * - Replaced by STATUS → ARTIFACT as processing continues
 *
 * Visual style: Subtle, not demanding attention, but clearly present.
 */
export function AckMessage({ content }: AckMessageProps) {
  return (
    <div className="ack-message agent-message-row animate-in fade-in duration-150">
      <div className="agent-status-line">
        {/* Subtle sparkle icon — acknowledging receipt */}
        <div className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
          <Sparkles className="w-3 h-3 text-slate-400 dark:text-slate-500" />
        </div>

        {/* Acknowledgement text */}
        <span className="text-xs text-slate-500 dark:text-slate-400">
          {content}
        </span>
      </div>
    </div>
  );
}
