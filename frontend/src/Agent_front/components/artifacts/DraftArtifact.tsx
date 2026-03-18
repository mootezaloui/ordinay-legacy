import { useState, useRef, useEffect, useCallback } from "react";
import { FileText, RotateCcw, X, Check, Edit2, RefreshCw, Download, Send, AlertTriangle } from "lucide-react";
import type { DraftArtifactData, DraftOutput } from "../../../services/api/agent";

type DraftMode = "view" | "edit" | "regen";
type DraftState = "pending" | "exported" | "discarded";

interface DraftArtifactProps {
  data: DraftArtifactData | DraftOutput;
  onRegenerate?: (instructions: string, currentContent: string) => void;
  onSave?: (sections: { subject: string; greeting: string; body: string; closing: string; signature: string }) => void;
  isStreaming?: boolean;
}

function isDraftV2(data: DraftArtifactData | DraftOutput): data is DraftArtifactData {
  return data.type === "draft_v2";
}

function extractContent(data: DraftArtifactData | DraftOutput): string {
  if (isDraftV2(data)) return data.content;
  const s = data.sections;
  return [s?.subject, s?.greeting, s?.body, s?.closing, s?.signature]
    .filter((l) => l && l.trim())
    .join("\n\n");
}

function extractTitle(data: DraftArtifactData | DraftOutput): string {
  if (isDraftV2(data)) return data.title;
  return data.sections?.subject || "Draft Document";
}

function extractSubtitle(data: DraftArtifactData | DraftOutput): string {
  if (isDraftV2(data)) return data.subtitle || "";
  return data.type?.replace(/_/g, " ") || "";
}

function extractMetaFields(data: DraftArtifactData | DraftOutput): Array<{ label: string; value: string }> {
  if (isDraftV2(data) && data.metadata) {
    return Object.entries(data.metadata).slice(0, 4).map(([label, value]) => ({ label, value }));
  }
  const fields: Array<{ label: string; value: string }> = [];
  const meta = (data as DraftOutput).metadata;
  if (meta?.language) fields.push({ label: "Lang", value: String(meta.language).toUpperCase() });
  if (meta?.tone) fields.push({ label: "Tone", value: String(meta.tone) });
  return fields;
}

function extractDraftType(data: DraftArtifactData | DraftOutput): string {
  if (isDraftV2(data)) return data.draftType.replace(/_/g, " ");
  return data.type?.replace(/_/g, " ") || "document";
}

function extractVersion(data: DraftArtifactData | DraftOutput): number {
  if (isDraftV2(data)) return data.version;
  return 1;
}

export function DraftArtifact({ data, onRegenerate, onSave, isStreaming = false }: DraftArtifactProps) {
  const [mode, setMode] = useState<DraftMode>("view");
  const [state, setState] = useState<DraftState>("pending");
  const [editText, setEditText] = useState(() => extractContent(data));
  const [renderedContent, setRenderedContent] = useState(() => extractContent(data));
  const [regenText, setRegenText] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const streamTimerRef = useRef<number | null>(null);

  const content = extractContent(data);
  const title = extractTitle(data);
  const subtitle = extractSubtitle(data);
  const metaFields = extractMetaFields(data);
  const draftType = extractDraftType(data);
  const version = extractVersion(data);
  const isRtl = (() => {
    if (isDraftV2(data)) return data.metadata?.language?.toLowerCase() === "ar";
    return String((data as DraftOutput).metadata?.language || "").toLowerCase() === "ar";
  })();

  useEffect(() => {
    setEditText(extractContent(data));
    setRenderedContent(extractContent(data));
    setMode("view");
    setState("pending");
  }, [data]);

  useEffect(() => {
    if (streamTimerRef.current !== null) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = null;
    }

    if (mode === "edit") {
      setRenderedContent(content);
      return;
    }

    if (!isStreaming) {
      setRenderedContent(content);
      return;
    }

    if (content.trim().length === 0) {
      setRenderedContent("");
      return;
    }

    let cursor = 0;
    let active = true;
    setRenderedContent("");

    const tick = () => {
      if (!active) return;
      const remaining = content.length - cursor;
      if (remaining <= 0) {
        setRenderedContent(content);
        return;
      }
      const chunk = Math.max(8, Math.min(40, Math.ceil(remaining / 10)));
      cursor = Math.min(content.length, cursor + chunk);
      setRenderedContent(content.slice(0, cursor));
      if (cursor < content.length) {
        streamTimerRef.current = window.setTimeout(tick, 28);
      }
    };

    streamTimerRef.current = window.setTimeout(tick, 28);
    return () => {
      active = false;
      if (streamTimerRef.current !== null) {
        window.clearTimeout(streamTimerRef.current);
        streamTimerRef.current = null;
      }
    };
  }, [content, isStreaming, mode]);

  useEffect(() => {
    if (mode === "edit" && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.setSelectionRange(0, 0);
    }
  }, [mode]);

  const handleDiscard = useCallback(() => setState("discarded"), []);
  const handleRestore = useCallback(() => {
    setState("pending");
    setMode("view");
  }, []);

  const handleRegen = useCallback(() => {
    if (!regenText.trim() || !onRegenerate) return;
    onRegenerate(regenText.trim(), editText);
    setRegenText("");
    setMode("view");
  }, [regenText, editText, onRegenerate]);

  const handleEditDone = useCallback(() => {
    if (onSave) {
      const parts = editText.split(/\n\n+/);
      onSave({
        subject: parts[0] || "",
        greeting: parts[1] || "",
        body: parts.slice(2).join("\n\n").trim(),
        closing: "",
        signature: "",
      });
    }
    setMode("view");
  }, [editText, onSave]);

  if (state === "discarded") {
    return (
      <div className="artifact-build agent-artifact-card is-draft">
        <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="agent-icon-container agent-icon-container-red">
              <X className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-red-400">Draft discarded</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                No document was exported or saved.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary"
            onClick={handleRestore}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Restore
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="artifact-build agent-artifact-card is-draft">
      {/* Header strip */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 uppercase tracking-wider">
            Generate
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold font-mono uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <FileText className="w-3 h-3" />
            {draftType}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-500">
          <RotateCcw className="w-3 h-3" />
          Reversible
          {version > 1 && <span className="ml-1 text-slate-400">v{version}</span>}
        </span>
      </div>

      {/* Title area */}
      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.06]">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
          {title}
        </div>
        {subtitle && (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{subtitle}</div>
        )}
      </div>

      {/* Meta fields */}
      {metaFields.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-2 bg-black/[0.02] dark:bg-black/20 border-b border-black/[0.05] dark:border-white/[0.06]">
          {metaFields.map((f, i) => (
            <div key={i} className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-white/60 dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06]">
              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">{f.label}</span>
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate">{f.value}</span>
            </div>
          ))}
        </div>
      )}

      {/* Draft surface */}
      <div className="artifact-build-section artifact-build-section-1 px-4 py-4 relative">
        {mode === "edit" ? (
          <textarea
            ref={textareaRef}
            dir={isRtl ? "rtl" : "ltr"}
            lang={isRtl ? "ar" : undefined}
            className={`w-full min-h-[14rem] rounded-lg border border-blue-500/40 dark:border-blue-500/40 bg-white dark:bg-[#0f172a]/70 text-sm text-slate-800 dark:text-slate-200 px-4 py-3 focus:outline-none focus:ring-2 focus:ring-blue-500/20 whitespace-pre-wrap leading-relaxed ${
              isRtl ? "text-right" : "text-left"
            }`}
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
          />
        ) : (
          <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={isRtl ? "ar" : undefined}
            className={`relative rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f172a]/70 p-4 max-h-[280px] overflow-y-auto shadow-sm ${
              isRtl ? "text-right" : "text-left"
            }`}
          >
            <div className="relative z-10 text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
              {renderedContent.length > 0 ? renderedContent : null}
              {isStreaming && renderedContent.length === 0 ? (
                <span className="text-slate-500 dark:text-slate-400">
                  Draft is being written...
                </span>
              ) : null}
              {isStreaming && renderedContent.length < content.length ? (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-blue-500/80 animate-pulse" />
              ) : null}
              {isStreaming && renderedContent.length === 0 ? (
                <span className="inline-block w-1.5 h-4 ml-1 align-middle bg-blue-500/80 animate-pulse" />
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* Regen input panel */}
      {mode === "regen" && (
        <div className="flex gap-2 items-center px-4 pb-3">
          <input
            className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white/90 dark:bg-[#0d1117] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-blue-500/50"
            placeholder="Instructions… e.g. make it shorter, add urgency"
            value={regenText}
            onChange={(e) => setRegenText(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleRegen()}
            autoFocus
          />
          <button
            type="button"
            className="flex items-center justify-center w-8 h-8 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white/90 dark:bg-[#21262d] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
            onClick={handleRegen}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Action bar */}
      <div className="agent-artifact-footer">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <AlertTriangle className="w-3 h-3" />
          Review before exporting
        </div>
        <div className="flex items-center gap-2">
          {/* Discard */}
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary text-red-500/70 hover:text-red-500 hover:border-red-500/30"
            onClick={handleDiscard}
          >
            <X className="w-3.5 h-3.5" />
            Discard
          </button>

          {/* Edit toggle */}
          <button
            type="button"
            className={`agent-action-btn ${mode === "edit" ? "agent-action-btn-primary" : "agent-action-btn-secondary"}`}
            onClick={() => {
              if (mode === "edit") {
                handleEditDone();
              } else {
                setMode("edit");
              }
            }}
          >
            {mode === "edit" ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            {mode === "edit" ? "Done" : "Edit"}
          </button>

          {/* Regenerate toggle */}
          <button
            type="button"
            className={`agent-action-btn ${mode === "regen" ? "agent-action-btn-primary" : "agent-action-btn-secondary"}`}
            onClick={() => setMode(mode === "regen" ? "view" : "regen")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>

          {/* Export (disabled — Phase 3) */}
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary opacity-40 cursor-not-allowed"
            disabled
            title="Export will be available in Phase 3"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
