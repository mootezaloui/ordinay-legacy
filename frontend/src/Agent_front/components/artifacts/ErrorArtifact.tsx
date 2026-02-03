import { AlertCircle, Search, ArrowRight } from "lucide-react";
import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface ErrorArtifactProps {
  content: string;
  onExampleClick?: (example: string) => void;
}

/**
 * Example queries shown when context is missing.
 * These help the user understand what to ask first.
 */
const CONTEXT_EXAMPLES = [
  "Show me client Müller",
  "What's the status of my open dossiers?",
  "List my tasks for this week",
];

/**
 * Detects if the error is a "no entity context" error.
 * This happens when the user tries to use follow-ups without first loading an entity.
 */
function isContextError(content: string): boolean {
  const lower = content.toLowerCase();
  return (
    lower.includes("need context first") ||
    lower.includes("no active entity context") ||
    lower.includes("read an entity before")
  );
}

/**
 * Renders an error state as a distinct, non-chat block.
 * Factual — states what happened, no apology.
 *
 * For context errors, shows helpful example queries the user can click.
 */
export function ErrorArtifact({ content, onExampleClick }: ErrorArtifactProps) {
  const isContext = isContextError(content);

  return (
    <div className="artifact-enter rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/20 overflow-hidden">
      <div className="flex items-center gap-2 px-5 py-3 border-b border-amber-200 dark:border-amber-800">
        {isContext ? (
          <Search className="w-4 h-4 text-amber-600 dark:text-amber-400" />
        ) : (
          <AlertCircle className="w-4 h-4 text-red-500" />
        )}
        <span className={`text-xs font-semibold uppercase tracking-wide ${
          isContext
            ? "text-amber-700 dark:text-amber-400"
            : "text-red-600 dark:text-red-400"
        }`}>
          {isContext ? "Context Needed" : "Error"}
        </span>
      </div>
      <div className="px-5 py-3 space-y-3">
        <div className={`text-sm leading-relaxed ${
          isContext
            ? "text-amber-800 dark:text-amber-200"
            : "text-red-700 dark:text-red-300"
        }`}>
          <MarkdownOutput content={content} />
        </div>

        {/* Show example queries for context errors */}
        {isContext && onExampleClick && (
          <div className="pt-2 space-y-2">
            <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">
              Try one of these:
            </p>
            <div className="flex flex-wrap gap-2">
              {CONTEXT_EXAMPLES.map((example) => (
                <button
                  key={example}
                  type="button"
                  onClick={() => onExampleClick(example)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-100 dark:bg-amber-900/40 hover:bg-amber-200 dark:hover:bg-amber-800/50 rounded-full transition-colors"
                >
                  {example}
                  <ArrowRight className="w-3 h-3" />
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
