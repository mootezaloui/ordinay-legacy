import type { RecoveryOutput } from "../../../services/api/agent";
import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface RecoveryArtifactProps {
  data: RecoveryOutput;
  onExampleClick?: (example: string) => void;
}

export function RecoveryArtifact({ data, onExampleClick }: RecoveryArtifactProps) {
  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];
  const prompts = Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts : [];
  const body = [
    data.message,
    data.whatHappened,
    alternatives.length > 0
      ? `You can continue with:\n${alternatives
          .map((alt, idx) => `${idx + 1}. ${alt.label}`)
          .join("\n")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  return (
    <div className="agent-message-row">
      <div className="agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-1 space-y-3">
        <MarkdownOutput content={body} />
        {onExampleClick && prompts.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {prompts.slice(0, 4).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onExampleClick(prompt)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700/70 rounded-full transition-colors"
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
