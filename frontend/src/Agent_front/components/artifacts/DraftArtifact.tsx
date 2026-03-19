import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Check,
  Download,
  Edit2,
  FileText,
  RefreshCw,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import type {
  DraftArtifactData,
  DraftLayoutData,
  DraftOutput,
  DraftSectionData,
} from "../../../services/api/agent";
import { DraftRenderer, SectionView } from "./draft/DraftRenderer";
import { MULTILINE_ROLES, getDocumentFontFamily } from "./draft/roleStyles";
import { detectLanguage, buildContentFromSections, ensureSectionId } from "./draft/layoutUtils";

type DraftMode = "view" | "edit" | "regen";
type DraftState = "pending" | "exported" | "discarded";

interface DraftRegenerationSnapshot {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  version?: number;
  content?: string;
}

interface DraftArtifactProps {
  data: DraftArtifactData | DraftOutput;
  onRegenerate?: (instructions: string, snapshot: DraftRegenerationSnapshot) => void;
  onSave?: (next: {
    sections: DraftSectionData[];
    layout: DraftLayoutData;
    content: string;
  }) => void;
  isStreaming?: boolean;
}

interface NormalizedDraft {
  title: string;
  subtitle: string;
  draftType: string;
  draftTypeLabel: string;
  version: number;
  metadata?: Record<string, string>;
  metaFields: Array<{ label: string; value: string }>;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
}

function isDraftV2(data: DraftArtifactData | DraftOutput): data is DraftArtifactData {
  return data.type === "draft_v2";
}

function normalizeDraft(data: DraftArtifactData | DraftOutput): NormalizedDraft {
  if (isDraftV2(data)) {
    const sections =
      Array.isArray(data.sections) && data.sections.length > 0
        ? data.sections.map((section, idx) => ensureSectionId(section, idx))
        : (() => {
            const fallbackText = String(data.content || "").trim();
            return fallbackText
              ? [
                  {
                    id: "sec_1",
                    role: "body",
                    text: fallbackText,
                  } as DraftSectionData,
                ]
              : [];
          })();
    const contentText = buildContentFromSections(sections);
    const language =
      String(data.layout?.language || "").trim().toLowerCase() ||
      String(data.metadata?.language || "").trim().toLowerCase() ||
      detectLanguage(contentText);
    const direction: DraftLayoutData["direction"] =
      data.layout?.direction === "rtl" || language === "ar" ? "rtl" : "ltr";
    const layout: DraftLayoutData = {
      direction,
      language,
      formality:
        data.layout?.formality === "casual" ||
        data.layout?.formality === "standard" ||
        data.layout?.formality === "formal"
          ? data.layout.formality
          : "formal",
      documentClass: String(data.layout?.documentClass || data.draftType || "other"),
    };
    const metaFields = Object.entries(data.metadata || {})
      .slice(0, 4)
      .map(([label, value]) => ({ label, value }));

    return {
      title: data.title,
      subtitle: String(data.subtitle || ""),
      draftType: String(data.draftType || "document"),
      draftTypeLabel: String(data.draftType || "document").replace(/_/g, " "),
      version: Number(data.version || 1),
      metadata: data.metadata,
      metaFields,
      sections,
      layout,
    };
  }

  const sections: DraftSectionData[] = [];
  if (data.sections?.subject) {
    sections.push({
      id: "sec_subject",
      role: "subject",
      text: data.sections.subject,
    });
  }
  if (data.sections?.greeting) {
    sections.push({
      id: "sec_greeting",
      role: "salutation",
      text: data.sections.greeting,
    });
  }
  if (data.sections?.body) {
    const parts = String(data.sections.body)
      .split(/\n\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      sections.push({
        id: "sec_body_1",
        role: "body",
        text: data.sections.body,
      });
    } else {
      parts.forEach((part, idx) => {
        sections.push({
          id: `sec_body_${idx + 1}`,
          role: "body",
          text: part,
        });
      });
    }
  }
  if (data.sections?.closing) {
    sections.push({
      id: "sec_closing",
      role: "closing",
      text: data.sections.closing,
    });
  }
  if (data.sections?.signature) {
    sections.push({
      id: "sec_signature",
      role: "signature_name",
      text: data.sections.signature,
    });
  }

  const language = String(data.metadata?.language || "en").toLowerCase();
  const layout: DraftLayoutData = {
    direction: language === "ar" ? "rtl" : "ltr",
    language: language || "en",
    formality: "formal",
    documentClass: String(data.type || "other").toLowerCase(),
  };
  const metaFields: Array<{ label: string; value: string }> = [];
  if (data.metadata?.language) {
    metaFields.push({ label: "Lang", value: String(data.metadata.language).toUpperCase() });
  }
  if (data.metadata?.targetEntity?.type) {
    metaFields.push({ label: "Target", value: String(data.metadata.targetEntity.type) });
  }

  return {
    title: data.sections?.subject || "Draft Document",
    subtitle: String(data.type || "").replace(/_/g, " "),
    draftType: String(data.type || "document"),
    draftTypeLabel: String(data.type || "document").replace(/_/g, " "),
    version: 1,
    metaFields,
    sections,
    layout,
  };
}

function SectionEdit({
  section,
  onChange,
  onAutoSize,
}: {
  section: DraftSectionData;
  onChange: (value: string) => void;
  onAutoSize: (el: HTMLTextAreaElement | null) => void;
}) {
  if (section.role === "spacer" || section.role === "separator" || section.role === "page_break") {
    return <SectionView section={section} />;
  }

  const multiline = MULTILINE_ROLES.has(section.role) || String(section.text || "").includes("\n");
  const baseClass =
    "w-full rounded-md border border-blue-500/30 dark:border-blue-500/30 bg-white dark:bg-[#0d1117] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  return (
    <div className="mb-2">
      {section.label ? (
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
          {section.label}
        </div>
      ) : null}
      {multiline ? (
        <textarea
          ref={onAutoSize}
          className={`${baseClass} resize-none leading-relaxed min-h-[3.25rem]`}
          value={String(section.text || "")}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          type="text"
          className={baseClass}
          value={String(section.text || "")}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </div>
  );
}

export function DraftArtifact({
  data,
  onRegenerate,
  onSave,
  isStreaming = false,
}: DraftArtifactProps) {
  const normalized = useMemo(() => normalizeDraft(data), [data]);
  const [mode, setMode] = useState<DraftMode>("view");
  const [state, setState] = useState<DraftState>("pending");
  const [sections, setSections] = useState<DraftSectionData[]>(normalized.sections);
  const [regenText, setRegenText] = useState("");
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});

  useEffect(() => {
    setSections(normalized.sections);
    setMode("view");
    setState("pending");
    setRegenText("");
  }, [normalized]);

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((node) => {
      if (!node) return;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    });
  }, [sections, mode]);

  const isRtl = normalized.layout.direction === "rtl";
  const contentText = buildContentFromSections(sections);

  const handleDiscard = useCallback(() => setState("discarded"), []);
  const handleRestore = useCallback(() => {
    setState("pending");
    setMode("view");
  }, []);

  const handleSectionChange = useCallback((id: string, value: string) => {
    setSections((prev) =>
      prev.map((section) => (section.id === id ? { ...section, text: value } : section)),
    );
  }, []);

  const handleEditDone = useCallback(() => {
    onSave?.({
      sections,
      layout: normalized.layout,
      content: contentText,
    });
    setMode("view");
  }, [contentText, normalized.layout, onSave, sections]);

  const handleRegen = useCallback(() => {
    const instructions = regenText.trim();
    if (!instructions || !onRegenerate) return;
    const snapshot: DraftRegenerationSnapshot = {
      draftType: normalized.draftType,
      title: normalized.title,
      subtitle: normalized.subtitle || undefined,
      metadata: normalized.metadata,
      sections,
      layout: normalized.layout,
      version: normalized.version,
      content: contentText,
    };
    onRegenerate(instructions, snapshot);
    setRegenText("");
    setMode("view");
  }, [
    contentText,
    normalized.draftType,
    normalized.layout,
    normalized.metadata,
    normalized.subtitle,
    normalized.title,
    normalized.version,
    onRegenerate,
    regenText,
    sections,
  ]);

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
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono text-slate-500 dark:text-slate-500 uppercase tracking-wider">
            Generate
          </span>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-semibold font-mono uppercase tracking-wider bg-amber-500/10 text-amber-500 border border-amber-500/20">
            <FileText className="w-3 h-3" />
            {normalized.draftTypeLabel}
          </span>
        </div>
        <span className="inline-flex items-center gap-1 text-[10px] font-mono text-slate-500 dark:text-slate-500">
          <RotateCcw className="w-3 h-3" />
          Reversible
          {normalized.version > 1 ? (
            <span className="ml-1 text-slate-400">v{normalized.version}</span>
          ) : null}
        </span>
      </div>

      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.06]">
        <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 tracking-tight">
          {normalized.title}
        </div>
        {normalized.subtitle ? (
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
            {normalized.subtitle}
          </div>
        ) : null}
      </div>

      {normalized.metaFields.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 px-3 py-2 bg-black/[0.02] dark:bg-black/20 border-b border-black/[0.05] dark:border-white/[0.06]">
          {normalized.metaFields.map((field, index) => (
            <div
              key={`${field.label}_${index}`}
              className="flex flex-col gap-0.5 px-2.5 py-1.5 rounded-md bg-white/60 dark:bg-white/[0.03] border border-black/[0.04] dark:border-white/[0.06]"
            >
              <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                {field.label}
              </span>
              <span className="text-[11px] text-slate-700 dark:text-slate-300 font-medium truncate">
                {field.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}

      <div className="artifact-build-section artifact-build-section-1 px-4 py-4 relative">
        {mode === "edit" ? (
          <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={normalized.layout.language}
            className="relative rounded-lg border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#0f172a]/70 p-4 max-h-[420px] overflow-y-auto shadow-sm"
            style={{ fontFamily: getDocumentFontFamily(normalized.layout) }}
          >
            <div className={isRtl ? "text-right" : "text-left"}>
              {sections.map((section, index) => (
                <SectionEdit
                  key={section.id || `section_${index}`}
                  section={section}
                  onChange={(value) => handleSectionChange(section.id, value)}
                  onAutoSize={(node) => {
                    textareaRefs.current[section.id] = node;
                  }}
                />
              ))}
            </div>
          </div>
        ) : (
          <DraftRenderer
            sections={sections}
            layout={normalized.layout}
            isStreaming={isStreaming}
          />
        )}
      </div>

      {mode === "regen" ? (
        <div className="flex gap-2 items-center px-4 pb-3">
          <input
            className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white/90 dark:bg-[#0d1117] px-3 py-2 text-xs text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-blue-500/50"
            placeholder="Instructions… e.g. make it shorter, add urgency"
            value={regenText}
            onChange={(event) => setRegenText(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleRegen()}
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
      ) : null}

      <div className="agent-artifact-footer">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          <AlertTriangle className="w-3 h-3" />
          Review before exporting
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary text-red-500/70 hover:text-red-500 hover:border-red-500/30"
            onClick={handleDiscard}
          >
            <X className="w-3.5 h-3.5" />
            Discard
          </button>
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
          <button
            type="button"
            className={`agent-action-btn ${mode === "regen" ? "agent-action-btn-primary" : "agent-action-btn-secondary"}`}
            onClick={() => setMode(mode === "regen" ? "view" : "regen")}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Regenerate
          </button>
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary opacity-40 cursor-not-allowed"
            disabled
            title="Export will be available in a later phase"
          >
            <Download className="w-3.5 h-3.5" />
            Export
          </button>
        </div>
      </div>
    </div>
  );
}
