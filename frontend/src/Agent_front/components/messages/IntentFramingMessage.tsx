import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface IntentFramingMessageProps {
  content: string;
}

/**
 * Intent Framing Message
 *
 * LLM-generated, short message that sets expectations
 * before any data retrieval or execution begins.
 *
 * Uses the unified agent message style (agent-bubble agent-chat-text)
 * so all agent-authored messages look visually consistent.
 */
export function IntentFramingMessage({ content }: IntentFramingMessageProps) {
  if (!content || content.trim().length === 0) return null;

  return (
    <div className="intent-framing-message agent-message-row animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="agent-bubble agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-5 py-4">
        <MarkdownOutput content={content} />
      </div>
    </div>
  );
}
