import type { IntentFramingOutput } from "../../../services/api/agent";

interface IntentFramingMessageProps {
  content: string;
  structured?: IntentFramingOutput;
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
export function IntentFramingMessage({ content, structured }: IntentFramingMessageProps) {
  const hasStructured =
    structured &&
    typeof structured.summary === "string" &&
    structured.summary.trim().length > 0;
  if (!hasStructured && (!content || content.trim().length === 0)) return null;

  return (
    <div className="intent-framing-message agent-message-row animate-in fade-in slide-in-from-bottom-1 duration-150">
      <div className="agent-chat-text text-[15px] leading-relaxed text-slate-600 dark:text-slate-300 px-1 py-1 space-y-1">
        {hasStructured ? (
          <>
            <p className="m-0">{structured.summary}</p>
            {structured.contextEcho && (
              <p className="m-0 text-[15px] text-slate-500 dark:text-slate-400">
                {structured.contextEcho}
              </p>
            )}
            {structured.nextQuestion && (
              <p className="m-0 text-[15px] text-slate-500 dark:text-slate-400">
                {structured.nextQuestion}
              </p>
            )}
          </>
        ) : (
          <p className="m-0">{content}</p>
        )}
      </div>
    </div>
  );
}
