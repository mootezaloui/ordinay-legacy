import { useEffect, useState } from "react";
import { Check, Copy, Edit2, FileText } from "lucide-react";
import type { DocumentDraftOutput } from "../../../services/api/agent";
import { MarkdownOutput } from "../../../components/MarkdownOutput";

interface DocumentDraftArtifactProps {
  data: DocumentDraftOutput;
  onSave?: (next: { title: string; content: string }) => void;
}

export function DocumentDraftArtifact({ data, onSave }: DocumentDraftArtifactProps) {
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(String(data.title || ""));
  const [content, setContent] = useState(String(data.content || ""));

  useEffect(() => {
    setTitle(String(data.title || ""));
    setContent(String(data.content || ""));
    setIsEditing(false);
  }, [data]);

  const language = String((data.metadata as Record<string, unknown> | undefined)?.language || "");
  const isRtl = language.toLowerCase() === "ar";

  const handleCopy = async () => {
    const text = `${title ? `${title}\n\n` : ""}${content}`.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // no-op
    }
  };

  return (
    <div className="artifact-build agent-artifact-card is-draft overflow-visible">
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-emerald">
            <FileText className="w-4 h-4 text-white" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-800 dark:text-slate-200">Document Draft</h4>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
              {data.entityType && data.entityId ? `${data.entityType} #${data.entityId}` : "Unscoped"}
            </p>
          </div>
        </div>
        <span className="text-[11px] text-slate-500 dark:text-slate-400">Draft</span>
      </div>

      <div className="artifact-build-section artifact-build-section-1 px-4 py-4">
        {isEditing ? (
          <div className="space-y-3">
            <input
              className="w-full rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#0f172a]/70 px-3 py-2 text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Title"
              dir={isRtl ? "rtl" : "ltr"}
            />
            <textarea
              className={`w-full min-h-[16rem] rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white dark:bg-[#0f172a]/70 px-3 py-2 text-sm whitespace-pre-wrap ${isRtl ? "text-right" : "text-left"}`}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              dir={isRtl ? "rtl" : "ltr"}
              lang={isRtl ? "ar" : undefined}
            />
          </div>
        ) : (
          <div
            className={`rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f172a]/70 p-4 ${isRtl ? "text-right" : "text-left"}`}
            dir={isRtl ? "rtl" : "ltr"}
            lang={isRtl ? "ar" : undefined}
          >
            {title ? <h3 className="text-base font-semibold mb-3">{title}</h3> : null}
            <MarkdownOutput content={content} />
          </div>
        )}
      </div>

      <div className="agent-artifact-footer">
        <div className="text-xs text-slate-500 dark:text-slate-400">
          {language ? language.toUpperCase() : "UNSPECIFIED"} · Review and then confirm the storage proposal below
        </div>
        <div className="flex items-center gap-2">
          <button type="button" onClick={handleCopy} className="agent-action-btn agent-action-btn-secondary">
            {copied ? <><Check className="w-4 h-4 text-emerald-600" />Copied</> : <><Copy className="w-4 h-4" />Copy</>}
          </button>
          <button
            type="button"
            className="agent-action-btn agent-action-btn-primary"
            onClick={() => {
              if (isEditing) {
                onSave?.({ title, content });
              }
              setIsEditing((v) => !v);
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
