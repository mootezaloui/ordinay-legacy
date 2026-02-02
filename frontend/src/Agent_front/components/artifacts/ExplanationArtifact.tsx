import { Lightbulb, ExternalLink, CheckCircle2 } from "lucide-react";
import type { ExplanationOutput } from "../../../services/api/agent";

interface ExplanationArtifactProps {
  data: ExplanationOutput;
  intent?: string;
}

/**
 * Renders an explanation as a structured report block.
 * No chat bubble — this is a self-contained artifact.
 */
export function ExplanationArtifact({ data, intent }: ExplanationArtifactProps) {
  // Derive a readable entity label from the intent if available
  const entityLabel = intent
    ? intent
        .replace(/^EXPLAIN_|^SUMMARIZE_|_STATE$/g, "")
        .replace(/_/g, " ")
        .toLowerCase()
        .replace(/^\w/, (c) => c.toUpperCase())
    : null;

  return (
    <div className="artifact-enter rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-amber-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {data.title || entityLabel || "Explanation"}
          </span>
        </div>
        <span className="text-xs text-slate-400 dark:text-slate-500 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" />
          Requires validation
        </span>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* Summary — the single most important sentence */}
        <p className="text-sm font-medium text-slate-900 dark:text-white leading-relaxed">
          {data.summary}
        </p>

        {/* Details — bullet observations */}
        {data.details && data.details.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 block">
              Details
            </span>
            <ul className="space-y-1.5">
              {data.details.map((detail: string, idx: number) => (
                <li
                  key={idx}
                  className="text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-slate-300 dark:before:bg-slate-600"
                >
                  {detail}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Related entities */}
        {data.relatedEntities && data.relatedEntities.length > 0 && (
          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 block">
              Related
            </span>
            <div className="flex flex-wrap gap-2">
              {data.relatedEntities.map((entity, idx) => (
                <span
                  key={idx}
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 rounded"
                >
                  <ExternalLink className="w-3 h-3" />
                  {entity.name || `${entity.type} #${entity.id}`}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
