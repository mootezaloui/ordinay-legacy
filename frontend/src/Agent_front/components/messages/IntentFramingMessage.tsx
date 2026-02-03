import { MessageSquare } from "lucide-react";
import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface IntentFramingMessageProps {
  content: string;
}

/**
 * Intent Framing Message
 *
 * LLM-generated, short message that sets expectations
 * before any data retrieval or execution begins.
 */
export function IntentFramingMessage({ content }: IntentFramingMessageProps) {
  if (!content || content.trim().length === 0) return null;

  return (
    <div className="intent-framing-message agent-message-row animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="flex-shrink-0 w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center border border-slate-200/70 dark:border-slate-700/60">
        <MessageSquare className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
      </div>
      <div className="agent-bubble agent-bubble-soft agent-chat-text text-[15px] leading-relaxed text-slate-700 dark:text-slate-200">
        <MarkdownOutput content={content} />
      </div>
    </div>
  );
}
