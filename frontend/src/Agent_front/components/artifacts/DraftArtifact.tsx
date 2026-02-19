import { useRef, useState, useEffect } from "react";
import { FileText, Copy, Check, Edit2, CircleDot } from "lucide-react";
import type { DraftOutput } from "../../../services/api/agent";

interface DraftArtifactProps {
  data: DraftOutput;
  onSave?: (sections: {
    subject: string;
    greeting: string;
    body: string;
    closing: string;
    signature: string;
  }) => void;
}

/**
 * Renders a draft document as a document preview artifact.
 * The draft content sits inside an inset "paper" area to visually
 * distinguish generated content from system UI.
 */
export function DraftArtifact({ data, onSave }: DraftArtifactProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [sections, setSections] = useState({
    subject: data.sections?.subject || "",
    greeting: data.sections?.greeting || "",
    body: data.sections?.body || "",
    closing: data.sections?.closing || "",
    signature: data.sections?.signature || "",
  });
  const paperRef = useRef<HTMLDivElement>(null);

  const draftLabel = data.type?.replace(/_/g, " ").toLowerCase() || "document";
  const isRtl = String(data.metadata?.language || "").toLowerCase() === "ar";

  useEffect(() => {
    setSections({
      subject: data.sections?.subject || "",
      greeting: data.sections?.greeting || "",
      body: data.sections?.body || "",
      closing: data.sections?.closing || "",
      signature: data.sections?.signature || "",
    });
    setIsEditing(false);
  }, [data]);

  const handleCopy = async () => {
    const text = [
      sections.subject,
      sections.greeting,
      sections.body,
      sections.closing,
      sections.signature,
    ]
      .filter((line) => line && line.trim())
      .join("\n\n")
      .trim();
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
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-emerald">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              Draft Document
            </h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {draftLabel}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">
          Draft
        </span>
      </div>

      {/* Document paper area */}
      <div className="artifact-build-section artifact-build-section-1 px-4 py-4">
        <div
          ref={paperRef}
          dir={isRtl ? "rtl" : "ltr"}
          lang={isRtl ? "ar" : undefined}
          className={`p-4 rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f172a]/70 shadow-sm ${
            isRtl ? "text-right" : "text-left"
          }`}
        >
          {isEditing ? (
            <textarea
              dir={isRtl ? "rtl" : "ltr"}
              lang={isRtl ? "ar" : undefined}
              className={`w-full min-h-[12rem] rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white/90 dark:bg-[#0f172a]/70 text-sm text-[#0f172a] dark:text-[#f1f5f9] px-3 py-2 focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20 whitespace-pre-wrap ${
                isRtl ? "text-right" : "text-left"
              }`}
              value={[
                sections.subject,
                sections.greeting,
                sections.body,
                sections.closing,
                sections.signature,
              ]
                .filter((line) => line && line.trim())
                .join("\n\n")}
              onChange={(e) => {
                const text = e.target.value;
                const parts = text.split(/\n\n+/);
                setSections((prev) => ({
                  ...prev,
                  subject: parts[0] || "",
                  greeting: parts[1] || "",
                  body: parts.slice(2).join("\n\n").trim(),
                  closing: "",
                  signature: "",
                }));
              }}
            />
          ) : (
            <>
              {sections.subject && (
                <div className="artifact-build-section artifact-build-section-2 mb-3 pb-2 border-b border-black/[0.05] dark:border-white/[0.05]">
                  <span className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                    Subject
                  </span>
                  <p className="text-sm font-semibold text-[#0f172a] dark:text-white mt-1">
                    {sections.subject}
                  </p>
                </div>
              )}

              {sections.greeting && (
                <p className="artifact-build-section artifact-build-section-2 text-sm text-slate-700 dark:text-slate-200 mb-3">
                  {sections.greeting}
                </p>
              )}

              {sections.body && (
                <p className="artifact-build-section artifact-build-section-3 text-sm text-slate-700 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {sections.body}
                </p>
              )}

              {sections.closing && (
                <p className="artifact-build-section artifact-build-section-3 text-sm text-slate-700 dark:text-slate-200 mt-4">
                  {sections.closing}
                </p>
              )}

              {sections.signature && (
                <p className="artifact-build-section artifact-build-section-3 text-sm text-slate-500 dark:text-slate-400 mt-2 italic">
                  {sections.signature}
                </p>
              )}
            </>
          )}
        </div>
      </div>

      {/* Actions bar */}
      <div className="agent-artifact-footer">
        <div className="flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {data.metadata?.language?.toUpperCase() || "--"} · Requires review
            before sending
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
            onClick={() => {
              if (isEditing) {
                if (onSave) {
                  onSave({
                    subject: sections.subject,
                    greeting: sections.greeting,
                    body: sections.body,
                    closing: sections.closing,
                    signature: sections.signature,
                  });
                }
                setIsEditing(false);
                return;
              }
              setIsEditing(true);
            }}
          >
            <Edit2 className="w-4 h-4" />
            {isEditing ? "Done" : "Edit"}
          </button>
        </div>
      </div>
    </div>
  );
}
