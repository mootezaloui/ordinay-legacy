import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface ChatArtifactProps {
  content: string;
}

/**
 * Renders a plain text / general chat response.
 * Left-aligned, conversational text block (not an artifact card).
 */
export function ChatArtifact({ content }: ChatArtifactProps) {
  return (
    <div className="agent-message-row">
      <div className="agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-1">
        <MarkdownOutput content={content} />
      </div>
    </div>
  );
}
