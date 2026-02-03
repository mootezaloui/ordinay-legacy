import { useRef, useState } from "react";
import { FileText, Copy, Check, Edit2, CircleDot } from "lucide-react";
import type { DraftOutput } from "../../../services/api/agent";

interface DraftArtifactProps {
  data: DraftOutput;
}

/**
 * Renders a draft document as a document preview artifact.
 * The draft content sits inside an inset "paper" area to visually
 * distinguish generated content from system UI.
 */
export function DraftArtifact({ data }: DraftArtifactProps) {
  const [copied, setCopied] = useState(false);
  const paperRef = useRef<HTMLDivElement>(null);

  const draftLabel = data.type?.replace(/_/g, " ").toLowerCase() || "document";

  const handleCopy = async () => {
    if (!paperRef.current) return;
    const text = paperRef.current.innerText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent fail
    }
  };

  return (
    <div className="artifact-enter agent-artifact-card is-draft">
      {/* Header */}
      <div className="agent-artifact-header flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Draft · {draftLabel}
          </span>
        </div>
        <span className="text-xs font-semibold px-2 py-0.5 rounded border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-300">
          DRAFT
        </span>
      </div>

      {/* Document paper area */}
      <div className="px-5 py-4">
        <div
          ref={paperRef}
          className="p-5 rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/50"
        >
          {/* Subject */}
          {data.sections?.subject && (
            <div className="mb-4">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">
                Subject
              </span>
              <p className="text-sm font-medium text-slate-900 dark:text-white mt-0.5">
                {data.sections.subject}
              </p>
            </div>
          )}

          {/* Greeting */}
          {data.sections?.greeting && (
            <p className="text-sm text-slate-700 dark:text-slate-300 mb-3">
              {data.sections.greeting}
            </p>
          )}

          {/* Body */}
          {data.sections?.body && (
            <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {data.sections.body}
            </p>
          )}

          {/* Closing */}
          {data.sections?.closing && (
            <p className="text-sm text-slate-700 dark:text-slate-300 mt-4">
              {data.sections.closing}
            </p>
          )}

          {/* Signature */}
          {data.sections?.signature && (
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 italic">
              {data.sections.signature}
            </p>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="px-5 py-3 bg-slate-50/70 dark:bg-slate-900/50 border-t border-slate-200/70 dark:border-slate-700/60 flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <CircleDot className="w-3 h-3 text-slate-400" />
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {data.metadata?.language?.toUpperCase() || "--"} · Requires review before sending
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            {copied ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-full border border-slate-200/80 dark:border-slate-700/60 bg-white/80 dark:bg-slate-900/60 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <Edit2 className="w-3.5 h-3.5" />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
