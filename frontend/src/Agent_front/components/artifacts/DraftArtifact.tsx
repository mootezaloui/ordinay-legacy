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
    <div className="artifact-build agent-artifact-card is-draft">
      {/* Header */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-emerald">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
              Draft Document
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {draftLabel}
            </p>
          </div>
        </div>
        <span className="agent-status-badge agent-status-badge-in-progress">
          <Edit2 className="w-3 h-3" />
          Draft
        </span>
      </div>

      {/* Document paper area */}
      <div className="artifact-build-section artifact-build-section-1 px-5 py-5">
        <div
          ref={paperRef}
          className="p-6 rounded-xl border border-slate-200/80 dark:border-slate-700/60 bg-white dark:bg-slate-900/70 shadow-sm"
        >
          {/* Subject */}
          {data.sections?.subject && (
            <div className="artifact-build-section artifact-build-section-2 mb-5 pb-4 border-b border-slate-100 dark:border-slate-700/50">
              <span className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                Subject
              </span>
              <p className="text-base font-semibold text-slate-800 dark:text-white mt-1">
                {data.sections.subject}
              </p>
            </div>
          )}

          {/* Greeting */}
          {data.sections?.greeting && (
            <p className="artifact-build-section artifact-build-section-2 text-[15px] text-slate-700 dark:text-slate-200 mb-4">
              {data.sections.greeting}
            </p>
          )}

          {/* Body */}
          {data.sections?.body && (
            <p className="artifact-build-section artifact-build-section-3 text-[15px] text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
              {data.sections.body}
            </p>
          )}

          {/* Closing */}
          {data.sections?.closing && (
            <p className="artifact-build-section artifact-build-section-3 text-[15px] text-slate-700 dark:text-slate-200 mt-5">
              {data.sections.closing}
            </p>
          )}

          {/* Signature */}
          {data.sections?.signature && (
            <p className="artifact-build-section artifact-build-section-3 text-[15px] text-slate-500 dark:text-slate-400 mt-2 italic">
              {data.sections.signature}
            </p>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="agent-artifact-footer">
        <div className="flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {data.metadata?.language?.toUpperCase() || "--"} · Requires review before sending
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleCopy}
            className="agent-action-btn agent-action-btn-secondary"
          >
            {copied ? (
              <>
                <Check className="w-4 h-4 text-emerald-600" />
                Copied
              </>
            ) : (
              <>
                <Copy className="w-4 h-4" />
                Copy
              </>
            )}
          </button>
          <button
            type="button"
            className="agent-action-btn agent-action-btn-primary"
          >
            <Edit2 className="w-4 h-4" />
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}
