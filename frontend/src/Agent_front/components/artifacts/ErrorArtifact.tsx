import { AlertCircle } from "lucide-react";
import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface ErrorArtifactProps {
  content: string;
}

/**
 * Renders an error state as a distinct, non-chat block.
 * Factual — states what happened, no apology.
 */
export function ErrorArtifact({ content }: ErrorArtifactProps) {
  return (
    <div className="artifact-enter rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-red-200 dark:border-red-800">
        <AlertCircle className="w-4 h-4 text-red-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-red-600 dark:text-red-400">
          Error
        </span>
      </div>
      <div className="px-5 py-3">
        <div className="text-sm text-red-700 dark:text-red-300 leading-relaxed">
          <MarkdownOutput content={content} />
        </div>
      </div>
    </div>
  );
}
