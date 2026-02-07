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
 * Uses the unified agent message style (agent-bubble agent-chat-text)
 * so all agent-authored messages look visually consistent.
 */
export function AckMessage({ content }: AckMessageProps) {
  return (
    <div className="ack-message agent-message-row animate-in fade-in duration-150">
      <div className="agent-bubble agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-5 py-4">
        <p className="m-0">
          {content}
        </p>
      </div>
    </div>
  );
}
