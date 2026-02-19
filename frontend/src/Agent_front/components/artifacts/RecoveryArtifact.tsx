import type { RecoveryOutput } from "../../../services/api/agent";

interface RecoveryArtifactProps {
  data: RecoveryOutput;
  onExampleClick?: (example: string) => void;
}

export function RecoveryArtifact({ data, onExampleClick }: RecoveryArtifactProps) {
  const alternatives = Array.isArray(data.alternatives) ? data.alternatives : [];
  const prompts = Array.isArray(data.suggestedPrompts) ? data.suggestedPrompts : [];

  return (
    <div className="artifact-build agent-artifact-card">
      <div className="artifact-build-header agent-artifact-header px-5 py-3 border-b border-black/[0.06] dark:border-white/[0.08]">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300">
          Next Step
        </span>
      </div>
      <div className="artifact-build-section artifact-build-section-1 px-5 py-3 space-y-3">
        <p className="text-sm text-slate-800 dark:text-slate-100 m-0">{data.message}</p>
        <p className="text-sm text-slate-600 dark:text-slate-300 m-0">{data.whatHappened}</p>
        {alternatives.length > 0 && (
          <div className="space-y-1.5">
            {alternatives.map((alt, idx) => (
              <p
                key={`${alt.label}-${idx}`}
                className="text-sm text-slate-700 dark:text-slate-200 m-0"
              >
                - {alt.label}
              </p>
            ))}
          </div>
        )}
        {onExampleClick && prompts.length > 0 && (
          <div className="flex flex-wrap gap-2 pt-1">
            {prompts.slice(0, 4).map((prompt) => (
              <button
                key={prompt}
                type="button"
                onClick={() => onExampleClick(prompt)}
                className="artifact-build-statement inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800/60 hover:bg-slate-200 dark:hover:bg-slate-700/70 rounded-full transition-colors"
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

