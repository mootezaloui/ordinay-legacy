import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface ChatArtifactProps {
  content: string;
}

/**
 * Renders a plain text / general chat response.
 * Left-aligned, conversational bubble to keep chat primary.
 */
export function ChatArtifact({ content }: ChatArtifactProps) {
  return (
    <div className="artifact-enter agent-message-row">
      <div className="agent-bubble agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
        <MarkdownOutput content={content} />
      </div>
    </div>
  );
}
