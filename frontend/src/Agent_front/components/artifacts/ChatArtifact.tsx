import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface ChatArtifactProps {
  content: string;
}

/**
 * Renders a plain text / general chat response.
 * No bubble — just left-aligned text in the workspace.
 * This is the simplest artifact: content without decoration.
 */
export function ChatArtifact({ content }: ChatArtifactProps) {
  return (
    <div className="artifact-enter px-1 py-2">
      <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 max-w-prose">
        <MarkdownOutput content={content} />
      </div>
    </div>
  );
}
