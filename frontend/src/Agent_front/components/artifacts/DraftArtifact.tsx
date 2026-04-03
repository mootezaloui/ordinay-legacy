import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  ChevronRight,
  Download,
  Edit2,
  FileText,
  Loader2,
  Plus,
  RotateCcw,
  Send,
  Trash2,
  X,
} from "lucide-react";
import type {
  DraftArtifactData,
  DraftLayoutData,
  DraftOutput,
  DraftSectionData,
  DraftVersionEntry,
} from "../../../services/api/agent";
import { DraftRenderer, SectionView } from "./draft/DraftRenderer";
import { MULTILINE_ROLES, ROLE_DISPLAY_NAMES, getDocumentFontFamily } from "./draft/roleStyles";
import { detectLanguage, buildContentFromSections, ensureSectionId, normalizeDraftText } from "./draft/layoutUtils";

type DraftMode = "view" | "edit";
type DraftState = "pending" | "exported" | "discarded";

interface DraftRegenerationSnapshot {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  linkedEntityType?: string;
  linkedEntityId?: number;
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
  onExport?: (snapshot: DraftRegenerationSnapshot) => Promise<boolean | void> | boolean | void;
  isStreaming?: boolean;
}

interface NormalizedDraft {
  title: string;
  subtitle: string;
  draftType: string;
  draftTypeLabel: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  savedDocumentId?: number;
  savedAt?: string;
  version: number;
  metadata?: Record<string, string>;
  metaFields: Array<{ label: string; value: string }>;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  versionHistory: DraftVersionEntry[];
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
      linkedEntityType: String(data.linkedEntityType || "").trim() || undefined,
      linkedEntityId:
        typeof data.linkedEntityId === "number" && Number.isFinite(data.linkedEntityId)
          ? Number(data.linkedEntityId)
          : undefined,
      savedDocumentId:
        typeof data.savedDocumentId === "number" && Number.isFinite(data.savedDocumentId)
          ? Number(data.savedDocumentId)
          : undefined,
      savedAt:
        typeof data.savedAt === "string" && String(data.savedAt).trim().length > 0
          ? String(data.savedAt)
          : undefined,
      version: Number(data.version || 1),
      metadata: data.metadata,
      metaFields,
      sections,
      layout,
      versionHistory: Array.isArray(data.versionHistory) ? data.versionHistory : [],
    };
  }

  const sections: DraftSectionData[] = [];
  if (data.sections?.subject) {
    sections.push({
      id: "sec_subject",
      role: "subject",
      text: normalizeDraftText(String(data.sections.subject)),
    });
  }
  if (data.sections?.greeting) {
    sections.push({
      id: "sec_greeting",
      role: "salutation",
      text: normalizeDraftText(String(data.sections.greeting)),
    });
  }
  if (data.sections?.body) {
    const normalizedBody = normalizeDraftText(String(data.sections.body));
    const parts = normalizedBody
      .split(/\n\n+/)
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length === 0) {
      sections.push({
        id: "sec_body_1",
        role: "body",
        text: normalizedBody,
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
      text: normalizeDraftText(String(data.sections.closing)),
    });
  }
  if (data.sections?.signature) {
    sections.push({
      id: "sec_signature",
      role: "signature_name",
      text: normalizeDraftText(String(data.sections.signature)),
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
    linkedEntityType:
      String(data.metadata?.targetEntity?.type || "").trim().toLowerCase() || undefined,
    linkedEntityId:
      typeof data.metadata?.targetEntity?.id === "number" &&
      Number.isFinite(data.metadata?.targetEntity?.id)
        ? Number(data.metadata?.targetEntity?.id)
        : undefined,
    savedDocumentId: undefined,
    savedAt: undefined,
    version: 1,
    metaFields,
    sections,
    layout,
    versionHistory: [],
  };
}

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeKey(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function resolveLinkedEntityLabel(draft: NormalizedDraft): string | null {
  const entityType = String(draft.linkedEntityType || "").trim().toLowerCase();
  if (!entityType) return null;

  const metadata = draft.metadata || {};
  const entries = Object.entries(metadata);
  const entityKey = normalizeKey(entityType);

  const exactMatch = entries.find(([key]) => normalizeKey(key) === entityKey);
  if (exactMatch && String(exactMatch[1] || "").trim().length > 0) {
    return `${toTitleCase(entityType)}: ${String(exactMatch[1]).trim()}`;
  }

  const probableMatch = entries.find(([key, value]) => {
    const normalizedKey = normalizeKey(key);
    if (!normalizedKey.includes(entityKey)) return false;
    return String(value || "").trim().length > 0;
  });
  if (probableMatch) {
    return `${toTitleCase(entityType)}: ${String(probableMatch[1]).trim()}`;
  }

  if (typeof draft.linkedEntityId === "number" && Number.isFinite(draft.linkedEntityId)) {
    return `${toTitleCase(entityType)} #${String(draft.linkedEntityId)}`;
  }

  return toTitleCase(entityType);
}

function SectionEdit({
  section,
  index,
  totalSections,
  onChange,
  onAutoSize,
  onAdd,
  onRemove,
  onMove,
}: {
  section: DraftSectionData;
  index: number;
  totalSections: number;
  onChange: (value: string) => void;
  onAutoSize: (el: HTMLTextAreaElement | null) => void;
  onAdd: () => void;
  onRemove: () => void;
  onMove: (direction: -1 | 1) => void;
}) {
  if (section.role === "spacer" || section.role === "separator" || section.role === "page_break") {
    return <SectionView section={section} />;
  }

  const multiline = MULTILINE_ROLES.has(section.role) || String(section.text || "").includes("\n");
  const baseClass =
    "w-full rounded-md border border-blue-500/30 dark:border-blue-500/30 bg-white dark:bg-[#0d1117] text-sm px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500/20";

  const roleDisplayName = ROLE_DISPLAY_NAMES[section.role] || section.role;
  const controlBtnClass = "p-0.5 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors";

  return (
    <div className="mb-2 group/section relative">
      <div className="flex items-center justify-between mb-1">
        <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
          {section.label || roleDisplayName}
        </div>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/section:opacity-100 transition-opacity">
          {index > 0 ? (
            <button type="button" className={controlBtnClass} onClick={() => onMove(-1)} title="Move up">
              <ArrowUp className="w-3 h-3" />
            </button>
          ) : null}
          {index < totalSections - 1 ? (
            <button type="button" className={controlBtnClass} onClick={() => onMove(1)} title="Move down">
              <ArrowDown className="w-3 h-3" />
            </button>
          ) : null}
          {totalSections > 1 ? (
            <button type="button" className={`${controlBtnClass} hover:text-red-500 dark:hover:text-red-400`} onClick={onRemove} title="Remove section">
              <Trash2 className="w-3 h-3" />
            </button>
          ) : null}
        </div>
      </div>
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
      <div className="flex justify-center -mb-1">
        <button
          type="button"
          className="p-0.5 rounded text-slate-300 dark:text-slate-600 hover:text-blue-500 dark:hover:text-blue-400 opacity-0 group-hover/section:opacity-100 transition-opacity"
          onClick={onAdd}
          title="Add section below"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

export function DraftArtifact({
  data,
  onRegenerate,
  onSave,
  onExport,
  isStreaming = false,
}: DraftArtifactProps) {
  const normalized = useMemo(() => normalizeDraft(data), [data]);
  const normalizedHasPersistedSave =
    typeof normalized.savedDocumentId === "number" &&
    Number.isFinite(normalized.savedDocumentId);
  const [mode, setMode] = useState<DraftMode>("view");
  const [state, setState] = useState<DraftState>(
    normalizedHasPersistedSave ? "exported" : "pending",
  );
  const [localSaved, setLocalSaved] = useState<boolean>(normalizedHasPersistedSave);
  const [sections, setSections] = useState<DraftSectionData[]>(normalized.sections);
  const [regenText, setRegenText] = useState("");
  const [regenOpen, setRegenOpen] = useState(false);
  const [viewingVersion, setViewingVersion] = useState<number | null>(null);
  const [regenPending, setRegenPending] = useState(false);
  const [contentFresh, setContentFresh] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [exportPending, setExportPending] = useState(false);
  const textareaRefs = useRef<Record<string, HTMLTextAreaElement | null>>({});
  const prevVersionRef = useRef(normalized.version);

  useEffect(() => {
    // New data arrived (version changed or first mount) — clear regen state, apply content.
    const versionChanged = normalized.version !== prevVersionRef.current;
    prevVersionRef.current = normalized.version;
    setLocalSaved((prev) => {
      if (normalizedHasPersistedSave) return true;
      if (versionChanged) return false;
      return prev;
    });
    setSections(normalized.sections);
    setMode("view");
    setState((prev) => {
      if (!versionChanged && (prev === "exported" || prev === "discarded")) {
        return prev;
      }
      return "pending";
    });
    setRegenText("");
    setRegenOpen(false);
    setViewingVersion(null);
    setExportError(null);
    if (regenPending && versionChanged) {
      setRegenPending(false);
      setContentFresh(true);
    }
  }, [normalized, normalizedHasPersistedSave]); // eslint-disable-line react-hooks/exhaustive-deps

  // Clear regenPending when streaming ends (handles errors / no new data).
  useEffect(() => {
    if (!isStreaming && regenPending) setRegenPending(false);
  }, [isStreaming]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fade-in timer — clear contentFresh flag after animation plays.
  useEffect(() => {
    if (!contentFresh) return;
    const timer = setTimeout(() => setContentFresh(false), 500);
    return () => clearTimeout(timer);
  }, [contentFresh]);

  const isRegenerating = isStreaming && regenPending;

  useEffect(() => {
    Object.values(textareaRefs.current).forEach((node) => {
      if (!node) return;
      node.style.height = "auto";
      node.style.height = `${node.scrollHeight}px`;
    });
  }, [sections, mode]);

  const isRtl = normalized.layout.direction === "rtl";
  const editFontFamily = getDocumentFontFamily(normalized.layout);
  const contentText = buildContentFromSections(sections);
  const hasHistory = normalized.versionHistory.length > 0;
  const hasPersistedSave = normalizedHasPersistedSave || localSaved;
  const linkedDestinationLabel = useMemo(
    () => resolveLinkedEntityLabel(normalized),
    [normalized],
  );

  // Resolve what to display based on viewingVersion
  const browsingOld = viewingVersion !== null;
  const browsedEntry = browsingOld
    ? normalized.versionHistory.find((v) => v.version === viewingVersion)
    : null;
  const displaySections = browsedEntry
    ? browsedEntry.sections.map((s, i) => ensureSectionId(s, i))
    : sections;
  const displayLayout = browsedEntry ? browsedEntry.layout : normalized.layout;

  const handleDiscard = useCallback(() => setState("discarded"), []);
  const handleRestore = useCallback(() => {
    setState("pending");
    setMode("view");
    setExportError(null);
  }, []);

  const handleSectionChange = useCallback((id: string, value: string) => {
    setSections((prev) =>
      prev.map((section) => (section.id === id ? { ...section, text: value } : section)),
    );
  }, []);

  const handleAddSection = useCallback((afterIndex: number) => {
    setSections((prev) => {
      const newId = `sec_new_${Date.now()}`;
      const newSection: DraftSectionData = { id: newId, role: "body", text: "" };
      const next = [...prev];
      next.splice(afterIndex + 1, 0, newSection);
      return next;
    });
  }, []);

  const handleRemoveSection = useCallback((id: string) => {
    setSections((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((s) => s.id !== id);
    });
  }, []);

  const handleMoveSection = useCallback((index: number, direction: -1 | 1) => {
    setSections((prev) => {
      const target = index + direction;
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
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
    if (!instructions || !onRegenerate || isRegenerating) return;
    const snapshot: DraftRegenerationSnapshot = {
      draftType: normalized.draftType,
      title: normalized.title,
      subtitle: normalized.subtitle || undefined,
      metadata: normalized.metadata,
      sections,
      layout: normalized.layout,
      linkedEntityType: normalized.linkedEntityType,
      linkedEntityId: normalized.linkedEntityId,
      version: normalized.version,
      content: contentText,
    };
    setRegenPending(true);
    setRegenOpen(false);
    setMode("view");
    onRegenerate(instructions, snapshot);
    setRegenText("");
    setViewingVersion(null);
  }, [
    contentText,
    isRegenerating,
    normalized.draftType,
    normalized.layout,
    normalized.linkedEntityId,
    normalized.linkedEntityType,
    normalized.metadata,
    normalized.subtitle,
    normalized.title,
    normalized.version,
    onRegenerate,
    regenText,
    sections,
  ]);

  const handleExport = useCallback(async () => {
    if (!onExport || browsingOld || isRegenerating || exportPending || hasPersistedSave) return;
    setExportError(null);
    setExportPending(true);
    const snapshot: DraftRegenerationSnapshot = {
      draftType: normalized.draftType,
      title: normalized.title,
      subtitle: normalized.subtitle || undefined,
      metadata: normalized.metadata,
      sections,
      layout: normalized.layout,
      linkedEntityType: normalized.linkedEntityType,
      linkedEntityId: normalized.linkedEntityId,
      version: normalized.version,
      content: contentText,
    };

    console.info("[DRAFT_EXPORT_CLICK]", {
      draftType: snapshot.draftType,
      title: snapshot.title,
      linkedEntityType: snapshot.linkedEntityType || null,
      linkedEntityId: snapshot.linkedEntityId ?? null,
      destinationLabel: linkedDestinationLabel,
      sectionCount: Array.isArray(snapshot.sections) ? snapshot.sections.length : 0,
    });

    try {
      const result = await onExport(snapshot);
      if (result === false) {
        setExportError("Could not save this draft. Please try again.");
        return;
      }
      setLocalSaved(true);
      setState("exported");
    } catch (error) {
      const message =
        error instanceof Error && String(error.message || "").trim().length > 0
          ? error.message
          : "Could not save this draft. Please try again.";
      setExportError(message);
    } finally {
      setExportPending(false);
    }
  }, [
    browsingOld,
    contentText,
    exportPending,
    hasPersistedSave,
    isRegenerating,
    linkedDestinationLabel,
    normalized.draftType,
    normalized.layout,
    normalized.linkedEntityId,
    normalized.linkedEntityType,
    normalized.metadata,
    normalized.subtitle,
    normalized.title,
    normalized.version,
    onExport,
    sections,
  ]);

  if (state === "exported") {
    return (
      <div className="artifact-build agent-artifact-card is-draft">
        <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="agent-icon-container agent-icon-container-emerald">
              <Check className="w-4 h-4 text-white" />
            </div>
            <div>
              <h4 className="text-xs font-semibold text-emerald-400">Draft saved</h4>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                {linkedDestinationLabel
                  ? `Stored in ${linkedDestinationLabel} documents.`
                  : "Stored in documents."}
              </p>
              {hasPersistedSave ? (
                <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Document #{normalized.savedDocumentId}
                </p>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="agent-action-btn agent-action-btn-secondary"
            onClick={handleRestore}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Back to Draft
          </button>
        </div>
      </div>
    );
  }

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
      {/* ── Header ── */}
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
        </span>
      </div>

      {/* ── Version Strip ── */}
      {hasHistory || isRegenerating ? (
        <div className="flex items-center gap-1 px-4 py-1.5 border-b border-black/[0.05] dark:border-white/[0.06] bg-black/[0.01] dark:bg-black/20">
          <span className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider mr-1">
            Versions
          </span>
          {normalized.versionHistory.map((entry) => (
            <button
              key={entry.version}
              type="button"
              onClick={() => { if (!isRegenerating) setViewingVersion(entry.version); }}
              disabled={isRegenerating}
              className={`inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded text-[10px] font-mono font-semibold transition-colors ${
                viewingVersion === entry.version
                  ? "bg-slate-600 text-white dark:bg-slate-400 dark:text-slate-900"
                  : "bg-slate-200/60 text-slate-500 hover:bg-slate-300/60 dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.1]"
              } ${isRegenerating ? "opacity-60 cursor-not-allowed" : ""}`}
            >
              v{entry.version}
            </button>
          ))}
          <button
            type="button"
            onClick={() => { if (!isRegenerating) setViewingVersion(null); }}
            disabled={isRegenerating}
            className={`inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded text-[10px] font-mono font-semibold transition-colors ${
              viewingVersion === null && !isRegenerating
                ? "bg-amber-500 text-white"
                : "bg-slate-200/60 text-slate-500 hover:bg-slate-300/60 dark:bg-white/[0.06] dark:text-slate-400 dark:hover:bg-white/[0.1]"
            } ${isRegenerating ? "opacity-60 cursor-not-allowed" : ""}`}
          >
            v{normalized.version}
          </button>
      {isRegenerating ? (
            <span className="inline-flex items-center justify-center min-w-[28px] h-5 px-1.5 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse">
              v{normalized.version + 1}
            </span>
          ) : null}
        </div>
      ) : null}

      {/* ── Title + Meta ── */}
      <div className="px-5 py-3 border-b border-black/[0.05] dark:border-white/[0.06]">
        <div className="text-[15px] font-semibold text-slate-800 dark:text-slate-100 tracking-tight leading-snug">
          {browsingOld && browsedEntry ? browsedEntry.title : normalized.title}
        </div>
        {(() => {
          const sub = browsingOld && browsedEntry ? browsedEntry.subtitle : normalized.subtitle;
          return sub ? (
            <div className="text-[12px] text-slate-500 dark:text-slate-400 mt-0.5">{sub}</div>
          ) : null;
        })()}
        {normalized.metaFields.length > 0 && !browsingOld ? (
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {normalized.metaFields.map((field, index) => (
              <span
                key={`${field.label}_${index}`}
                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-black/[0.03] dark:bg-white/[0.04] text-slate-600 dark:text-slate-400 border border-black/[0.04] dark:border-white/[0.06]"
              >
                <span className="font-mono text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">{field.label}</span>
                <span className="font-medium">{field.value}</span>
              </span>
            ))}
          </div>
        ) : null}
        {browsingOld ? (
          <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-mono text-amber-600 dark:text-amber-400">
            Viewing v{viewingVersion}
            <button
              type="button"
              onClick={() => setViewingVersion(null)}
              className="underline hover:no-underline ml-1"
            >
              Back to current
            </button>
          </div>
        ) : null}
      </div>

      {/* ── Content Area ── */}
      <div className="artifact-build-section artifact-build-section-1 px-5 py-4 relative">
        {mode === "edit" && !browsingOld && !isRegenerating ? (
          <div
            dir={isRtl ? "rtl" : "ltr"}
            lang={normalized.layout.language}
            style={{ fontFamily: editFontFamily }}
            className="draft-edit-surface relative rounded-lg border border-blue-500/20 dark:border-[#30363d] bg-white dark:bg-[#1c2333] px-8 py-7 max-h-[800px] overflow-y-auto"
          >
            <div className={isRtl ? "text-right" : "text-left"}>
              {sections.map((section, index) => (
                <SectionEdit
                  key={section.id || `section_${index}`}
                  section={section}
                  index={index}
                  totalSections={sections.length}
                  onChange={(value) => handleSectionChange(section.id, value)}
                  onAutoSize={(node) => {
                    textareaRefs.current[section.id] = node;
                  }}
                  onAdd={() => handleAddSection(index)}
                  onRemove={() => handleRemoveSection(section.id)}
                  onMove={(dir) => handleMoveSection(index, dir)}
                />
              ))}
            </div>
          </div>
        ) : (
          <div className="relative">
            <div
              className={`transition-opacity duration-300 ${isRegenerating ? "opacity-30 pointer-events-none" : "opacity-100"} ${contentFresh ? "animate-[agent-fade-up_0.4s_ease-out]" : ""}`}
            >
              <DraftRenderer
                sections={displaySections}
                layout={displayLayout}
                isStreaming={!browsingOld && isStreaming && sections.length === 0}
              />
            </div>
            {isRegenerating ? (
              <div className="absolute inset-0 rounded-lg flex items-center justify-center">
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-white/80 dark:bg-[#0f172a]/90 border border-black/[0.06] dark:border-white/[0.08] shadow-sm">
                  <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                  <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Regenerating draft...
                  </span>
                </div>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* ── Footer Actions ── */}
      <div className="agent-artifact-footer">
        <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
          {isRegenerating ? (
            <>
              <Loader2 className="w-3 h-3 animate-spin" />
              Generating new version...
            </>
          ) : (
            <div className="flex flex-col gap-0.5">
              <span className="inline-flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" />
                Review before saving
              </span>
              {linkedDestinationLabel ? (
                <span className="pl-4 text-[10px] text-slate-500/90 dark:text-slate-400/90">
                  Storage target: {linkedDestinationLabel}
                </span>
              ) : null}
              {hasPersistedSave ? (
                <span className="pl-4 text-[10px] text-emerald-500 dark:text-emerald-400">
                  Already saved as document #{normalized.savedDocumentId}
                </span>
              ) : null}
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className={`agent-action-btn agent-action-btn-secondary text-red-500/70 hover:text-red-500 hover:border-red-500/30 ${isRegenerating ? "opacity-40 cursor-not-allowed" : ""}`}
            disabled={isRegenerating}
            onClick={handleDiscard}
          >
            <X className="w-3.5 h-3.5" />
            Discard
          </button>
          <button
            type="button"
            className={`agent-action-btn ${mode === "edit" && !browsingOld && !isRegenerating ? "agent-action-btn-primary" : "agent-action-btn-secondary"} ${browsingOld || isRegenerating ? "opacity-40 cursor-not-allowed" : ""}`}
            disabled={browsingOld || isRegenerating}
            onClick={() => {
              if (browsingOld || isRegenerating) return;
              if (mode === "edit") {
                handleEditDone();
              } else {
                setMode("edit");
              }
            }}
          >
            {mode === "edit" && !browsingOld && !isRegenerating ? <Check className="w-3.5 h-3.5" /> : <Edit2 className="w-3.5 h-3.5" />}
            {mode === "edit" && !browsingOld && !isRegenerating ? "Done" : "Edit"}
          </button>
          {onRegenerate && !browsingOld && !isRegenerating ? (
            <button
              type="button"
              className={`agent-action-btn ${regenOpen ? "agent-action-btn-primary" : "agent-action-btn-secondary"}`}
              onClick={() => setRegenOpen((v) => !v)}
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Regenerate
            </button>
          ) : null}
          <button
            type="button"
            className={`agent-action-btn agent-action-btn-secondary ${browsingOld || isRegenerating || exportPending || hasPersistedSave || !onExport ? "opacity-40 cursor-not-allowed" : ""}`}
            disabled={browsingOld || isRegenerating || exportPending || hasPersistedSave || !onExport}
            onClick={handleExport}
            title={
              browsingOld
                ? "Switch back to current version before exporting"
                : isRegenerating
                  ? "Wait for regeneration to complete"
                  : exportPending
                    ? "Saving draft..."
                    : hasPersistedSave
                      ? "Draft already saved"
                  : onExport
                    ? "Store this draft in linked documents"
                    : "Export action unavailable"
            }
          >
            {exportPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
            {hasPersistedSave ? "Saved" : exportPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
      {exportError ? (
        <div className="px-4 pb-2 text-[11px] text-red-500 dark:text-red-400">
          {exportError}
        </div>
      ) : null}

      {/* ── Revision Log ── */}
      {hasHistory ? (
        <div className="border-t border-black/[0.05] dark:border-white/[0.06] px-4 py-2 bg-black/[0.01] dark:bg-black/20">
          <div className="text-[9px] font-mono text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-1.5">
            Revision history
          </div>
          <div className="space-y-1">
            {normalized.versionHistory.map((entry) => (
              <div
                key={entry.version}
                className="flex items-start gap-2 text-[11px] text-slate-500 dark:text-slate-400"
              >
                <span className="inline-flex items-center gap-0.5 shrink-0 font-mono text-[10px] text-slate-400 dark:text-slate-500 mt-px">
                  v{entry.version}
                  <ChevronRight className="w-2.5 h-2.5" />
                  v{entry.version + 1}
                </span>
                <span className="text-slate-600 dark:text-slate-300 leading-snug">
                  {entry.instruction || "Regenerated"}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* ── Regenerate Input (expandable) ── */}
      {regenOpen && onRegenerate && !browsingOld && !isRegenerating ? (
        <div className="flex gap-2 items-center px-5 py-2.5 border-t border-black/[0.04] dark:border-white/[0.04]">
          <input
            className="flex-1 rounded-lg border border-black/[0.08] dark:border-white/[0.08] bg-white/90 dark:bg-white/[0.04] px-3 py-2 text-sm text-slate-700 dark:text-slate-300 placeholder:text-slate-400 focus:outline-none focus:border-amber-500/50"
            placeholder="What should I change? e.g. make it shorter, add urgency, change tone..."
            value={regenText}
            onChange={(event) => setRegenText(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && handleRegen()}
            autoFocus
          />
          <button
            type="button"
            className={`flex items-center justify-center w-8 h-8 rounded-lg border transition-colors ${
              regenText.trim()
                ? "bg-amber-500 border-amber-500 text-white hover:bg-amber-600"
                : "bg-white/90 dark:bg-[#21262d] border-black/[0.08] dark:border-white/[0.08] text-slate-400 cursor-not-allowed"
            }`}
            onClick={handleRegen}
            disabled={!regenText.trim()}
          >
            <Send className="w-3.5 h-3.5" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
