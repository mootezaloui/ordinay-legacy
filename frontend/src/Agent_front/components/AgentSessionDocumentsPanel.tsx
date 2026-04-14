import { useEffect, useMemo, useState, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Eye,
  Tags,
} from "lucide-react";
import {
  getSessionDocumentContext,
  getSessionDocumentArtifacts,
  removeSessionDocument,
  retrySessionDocumentAnalysis,
  type AgentDocumentContext,
} from "../../services/api/agentDocuments";

interface AgentSessionDocumentsPanelProps {
  sessionId?: string | null;
}

function statusKey(status?: string | null): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "readable" || normalized === "completed") return "ready";
  if (normalized === "needs_ocr") return "needsOcr";
  if (normalized === "failed") return "failed";
  if (normalized === "extracting") return "extracting";
  if (normalized === "unreadable") return "notProcessed";
  return "processing";
}

function renderStatusTone(status?: string | null): string {
  const normalized = String(status || "").toLowerCase();
  if (normalized === "readable" || normalized === "completed") {
    return "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300";
  }
  if (normalized === "needs_ocr") {
    return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/20 dark:text-indigo-300";
  }
  if (normalized === "failed") {
    return "bg-rose-100 text-rose-700 dark:bg-rose-900/20 dark:text-rose-300";
  }
  if (normalized === "unreadable") {
    return "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300";
  }
  return "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300";
}

type ArtifactShape = {
  visual_summary?: string;
  key_entities?: Array<Record<string, unknown>>;
  risk_flags?: string[];
  extracted_text?: string;
  provenance?: Record<string, unknown>;
};

function asArtifact(value: unknown): ArtifactShape | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as ArtifactShape;
}

function sanitizeVisualSummary(summary: string | null | undefined, analyzedFallback: string): string | null {
  const text = String(summary || "").trim();
  if (!text) return null;
  const lower = text.toLowerCase();
  if (
    lower.includes("embedded text") ||
    lower.includes("ocr page") ||
    lower.includes("analyzed offline") ||
    lower.includes("provenance")
  ) {
    return analyzedFallback;
  }
  return text;
}

function mapRiskFlags(flags: string[]): string[] {
  return flags
    .map((flag) => {
      const key = String(flag || "").toLowerCase();
      if (key === "document_understanding_disabled") return "";
      return key.replace(/_/g, " ");
    })
    .filter(Boolean);
}

export function AgentSessionDocumentsPanel({
  sessionId,
}: AgentSessionDocumentsPanelProps) {
  const { t } = useTranslation("common");
  const [context, setContext] = useState<AgentDocumentContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionBusyByDoc, setActionBusyByDoc] = useState<Record<number, string>>(
    {},
  );
  const [openedArtifactByDoc, setOpenedArtifactByDoc] = useState<
    Record<number, unknown>
  >({});

  const setDocBusy = (documentId: number, action: string | null) => {
    setActionBusyByDoc((prev) => {
      const next = { ...prev };
      if (!action) {
        delete next[documentId];
      } else {
        next[documentId] = action;
      }
      return next;
    });
  };

  const loadContext = async () => {
    if (!sessionId) {
      setContext(null);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const next = await getSessionDocumentContext(sessionId);
      setContext(next);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agent.documents.errorLoad"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const load = async () => {
      if (!sessionId) {
        if (mounted) {
          setContext(null);
          setLoading(false);
          setError(null);
        }
        return;
      }
      if (mounted) setLoading(true);
      try {
        const next = await getSessionDocumentContext(sessionId);
        if (!mounted) return;
        setContext(next);
        setError(null);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : t("agent.documents.errorLoad"));
      } finally {
        if (mounted) setLoading(false);
      }
      if (mounted) {
        timer = setTimeout(load, 5000);
      }
    };

    load();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);


  const handleOpenArtifacts = async (documentId: number) => {
    if (!sessionId) return;
    if (openedArtifactByDoc[documentId]) {
      setOpenedArtifactByDoc((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
      return;
    }
    try {
      setDocBusy(documentId, "artifacts");
      const detail = await getSessionDocumentArtifacts(sessionId, documentId);
      setOpenedArtifactByDoc((prev) => ({
        ...prev,
        [documentId]: detail.artifacts || null,
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agent.documents.errorOpenArtifacts"));
    } finally {
      setDocBusy(documentId, null);
    }
  };

  const handleRetry = async (documentId: number) => {
    if (!sessionId) return;
    try {
      setDocBusy(documentId, "retry");
      await retrySessionDocumentAnalysis(sessionId, documentId);
      await loadContext();
      setOpenedArtifactByDoc((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agent.documents.errorRetry"));
    } finally {
      setDocBusy(documentId, null);
    }
  };

  const handleRemove = async (documentId: number) => {
    if (!sessionId) return;
    try {
      setDocBusy(documentId, "remove");
      await removeSessionDocument(sessionId, documentId);
      setOpenedArtifactByDoc((prev) => {
        const next = { ...prev };
        delete next[documentId];
        return next;
      });
      await loadContext();
    } catch (err) {
      setError(err instanceof Error ? err.message : t("agent.documents.errorRemove"));
    } finally {
      setDocBusy(documentId, null);
    }
  };

  const sortedDocuments = useMemo(() => {
    if (!context?.documents) return [];
    return [...context.documents].sort((a, b) => {
      const aProc = a.text_status === "processing" ? 0 : 1;
      const bProc = b.text_status === "processing" ? 0 : 1;
      if (aProc !== bProc) return aProc - bProc;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });
  }, [context]);

  return (
    <div className="h-full w-full flex flex-col border-l border-black/[0.05] dark:border-white/[0.04] bg-[#f8fafc] dark:bg-[#0b1220] overflow-hidden">
      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.04]">
        <p className="text-xs font-semibold tracking-wide text-slate-800 dark:text-slate-100 uppercase">
          {t("agent.documents.heading")}
        </p>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
          {t("agent.documents.subheading")}
        </p>
      </div>

      <div className="px-4 py-3 border-b border-black/[0.05] dark:border-white/[0.04] grid grid-cols-4 gap-2 text-center">
        <Stat value={context?.totalDocuments ?? 0} label={t("agent.documents.total")} />
        <Stat value={context?.readableCount ?? 0} label={t("agent.documents.readable")} />
        <Stat value={context?.processingCount ?? 0} label={t("agent.documents.processing")} />
        <Stat value={context?.unreadableCount ?? 0} label={t("agent.documents.unreadable")} />
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {!sessionId ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("agent.documents.emptyNoSession")}
          </p>
        ) : loading && sortedDocuments.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">{t("agent.documents.loading")}</p>
        ) : error ? (
          <p className="text-xs text-rose-600 dark:text-rose-400">{error}</p>
        ) : sortedDocuments.length === 0 ? (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {t("agent.documents.empty")}
          </p>
        ) : (
          sortedDocuments.map((doc) => {
            const textStatus = doc.text_status || "unreadable";

            return (
              <div
                key={doc.document_id}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/60 p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">
                      {doc.title || doc.original_filename || `Document #${doc.document_id}`}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {doc.mime_type}
                    </p>
                  </div>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded ${renderStatusTone(
                      textStatus,
                    )}`}
                  >
                    {t(`agent.documents.status.${statusKey(textStatus)}`)}
                  </span>
                </div>

                {doc.text_source ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="text-[10px] px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                      {doc.text_source}
                    </span>
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleOpenArtifacts(doc.document_id)}
                    disabled={Boolean(actionBusyByDoc[doc.document_id])}
                    className="text-[11px] px-2 py-1 rounded border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-60"
                  >
                    {openedArtifactByDoc[doc.document_id] ? t("agent.documents.hideDetails") : t("agent.documents.viewDetails")}
                  </button>
                  {textStatus === "failed" ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(doc.document_id)}
                      disabled={Boolean(actionBusyByDoc[doc.document_id])}
                      className="text-[11px] px-2 py-1 rounded border border-indigo-300 dark:border-indigo-700 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 disabled:opacity-60"
                    >
                      {t("agent.documents.retryExtraction")}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => handleRemove(doc.document_id)}
                    disabled={Boolean(actionBusyByDoc[doc.document_id])}
                    className="text-[11px] px-2 py-1 rounded border border-rose-300 dark:border-rose-700 text-rose-700 dark:text-rose-300 hover:bg-rose-50 dark:hover:bg-rose-900/20 disabled:opacity-60"
                  >
                    {t("agent.documents.removeFromSession")}
                  </button>
                </div>

                {actionBusyByDoc[doc.document_id] ? (
                  <p className="mt-2 text-[10px] text-slate-500 dark:text-slate-400">
                    {t("agent.documents.working", { action: actionBusyByDoc[doc.document_id] })}
                  </p>
                ) : null}

                {openedArtifactByDoc[doc.document_id] ? (
                  <ArtifactDetails artifact={openedArtifactByDoc[doc.document_id]} t={t} />
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/40 px-2 py-1.5">
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      <p className="text-[10px] text-slate-500 dark:text-slate-400">{label}</p>
    </div>
  );
}

function ArtifactDetails({ artifact, t }: { artifact: unknown; t: (key: string, options?: Record<string, unknown>) => string }) {
  const [open, setOpen] = useState({
    visual: true,
    entities: true,
    flags: true,
  });
  const parsed = asArtifact(artifact);
  if (!parsed) {
    return (
      <div className="mt-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 p-2">
        <p className="text-[10px] font-medium text-slate-700 dark:text-slate-300 mb-1">
          {t("agent.documents.artifactPayload")}
        </p>
        <pre className="text-[10px] leading-relaxed text-slate-700 dark:text-slate-200 whitespace-pre-wrap break-words overflow-auto max-h-56">
{JSON.stringify(artifact, null, 2)}
        </pre>
      </div>
    );
  }

  const entities = Array.isArray(parsed.key_entities) ? parsed.key_entities : [];
  const flags = Array.isArray(parsed.risk_flags) ? parsed.risk_flags : [];
  const normalizedFlags = mapRiskFlags(flags);
  const safeSummary = sanitizeVisualSummary(parsed.visual_summary || null, t("agent.documents.analyzedSummary"));

  return (
    <div className="mt-3 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950/40 p-2 space-y-2">
      {safeSummary ? (
        <CollapsibleSection
          title={t("agent.documents.documentSummary")}
          icon={Eye}
          tone="blue"
          open={open.visual}
          onToggle={() => setOpen((prev) => ({ ...prev, visual: !prev.visual }))}
        >
          <p className="text-[11px] text-slate-700 dark:text-slate-200 mt-1 leading-relaxed">
            {safeSummary}
          </p>
        </CollapsibleSection>
      ) : null}

      {entities.length > 0 ? (
        <CollapsibleSection
          title={t("agent.documents.keyEntities")}
          icon={Tags}
          tone="emerald"
          open={open.entities}
          onToggle={() => setOpen((prev) => ({ ...prev, entities: !prev.entities }))}
          badge={`${entities.length}`}
        >
          <div className="mt-1 space-y-1">
            {entities.slice(0, 6).map((entity, idx) => (
              <div
                key={`entity-${idx}`}
                className="text-[11px] text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded px-2 py-1 bg-white dark:bg-slate-900/50"
              >
                {Object.entries(entity)
                  .map(([k, v]) => `${k}: ${String(v)}`)
                  .join(" | ")}
              </div>
            ))}
          </div>
        </CollapsibleSection>
      ) : null}

      {normalizedFlags.length > 0 ? (
        <CollapsibleSection
          title={t("agent.documents.qualityNotes")}
          icon={AlertTriangle}
          tone="amber"
          open={open.flags}
          onToggle={() => setOpen((prev) => ({ ...prev, flags: !prev.flags }))}
          badge={`${normalizedFlags.length}`}
        >
          <div className="mt-1 flex flex-wrap gap-1.5">
            {normalizedFlags.map((flag) => (
              <span
                key={flag}
                className="text-[10px] px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
              >
                {flag}
              </span>
            ))}
          </div>
        </CollapsibleSection>
      ) : null}
    </div>
  );
}

function CollapsibleSection({
  title,
  icon: Icon,
  tone,
  open,
  onToggle,
  badge,
  children,
}: {
  title: string;
  icon: ComponentType<{ className?: string }>;
  tone: "blue" | "emerald" | "amber" | "violet" | "slate";
  open: boolean;
  onToggle: () => void;
  badge?: string;
  children: ReactNode;
}) {
  const toneClass =
    tone === "blue"
      ? "bg-blue-100 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300"
      : tone === "emerald"
        ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300"
        : tone === "amber"
          ? "bg-amber-100 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300"
          : tone === "violet"
            ? "bg-violet-100 text-violet-700 dark:bg-violet-900/20 dark:text-violet-300"
            : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300";

  return (
    <section className="border border-slate-200 dark:border-slate-700 rounded bg-white dark:bg-slate-900/40">
      <button
        type="button"
        onClick={onToggle}
        className="w-full px-2 py-1.5 flex items-center justify-between gap-2 text-left"
      >
        <span className="flex items-center gap-2 min-w-0">
          <span className={`p-1 rounded ${toneClass}`}>
            <Icon className="w-3 h-3" />
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300 truncate">
            {title}
          </span>
          {badge ? (
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
              {badge}
            </span>
          ) : null}
        </span>
        {open ? (
          <ChevronDown className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        ) : (
          <ChevronRight className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400" />
        )}
      </button>
      {open ? <div className="px-2 pb-2">{children}</div> : null}
    </section>
  );
}
