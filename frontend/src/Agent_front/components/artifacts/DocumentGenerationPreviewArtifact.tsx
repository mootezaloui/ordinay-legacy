import { useLayoutEffect, useRef, useState } from "react";
import { CheckCircle2, Edit3, Eye, FileText, Globe, Layers, Tag, XCircle } from "lucide-react";
import type { DocumentGenerationPreviewOutput } from "../../../services/api/agent";
import { MarkdownOutput } from "../../../components/MarkdownOutput";
import { useData } from "../../../contexts/DataContext";

interface DocumentGenerationPreviewArtifactProps {
  data: DocumentGenerationPreviewOutput;
  onConfirm: (editedMarkdown?: string) => Promise<void>;
  onCancel: () => Promise<void>;
}

type PreviewState = "ready" | "confirming" | "cancelled" | "failed";

interface DataContextLike {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{ id: number; lawsuitNumber?: string; title?: string; clientId?: number }>;
  lawsuits?: Array<{ id: number; dossierId?: number }>;
  tasks?: Array<{ id: number; dossierId?: number | null; lawsuitId?: number | null }>;
  sessions?: Array<{ id: number; dossierId?: number | null; lawsuitId?: number | null }>;
  missions?: Array<{ id: number; entityType?: string; entityId?: number; clientId?: number | null }>;
  financialEntries?: Array<{
    id: number;
    clientId?: number | null;
    dossierId?: number | null;
    lawsuitId?: number | null;
    taskId?: number | null;
  }>;
}

function toTitleCase(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (char) => char.toUpperCase())
    .trim();
}

function resolveDossierAndClient(
  targetType: string,
  targetId: number,
  data: DataContextLike,
): {
  dossierName: string | null;
  dossierReference: string | null;
  clientName: string | null;
} {
  const clients = data.clients || [];
  const dossiers = data.dossiers || [];
  const lawsuits = data.lawsuits || [];
  const tasks = data.tasks || [];
  const sessions = data.sessions || [];
  const missions = data.missions || [];
  const financialEntries = data.financialEntries || [];

  const findClientName = (clientId?: number | null) => {
    if (!clientId) return null;
    const client = clients.find((item) => Number(item.id) === Number(clientId));
    return client ? client.name || client.reference || null : null;
  };
  const findDossier = (dossierId?: number | null) => {
    if (!dossierId) return null;
    return dossiers.find((item) => Number(item.id) === Number(dossierId)) || null;
  };
  const dossierDisplay = (dossier?: { lawsuitNumber?: string; title?: string } | null) => ({
    dossierReference: dossier?.lawsuitNumber || null,
    dossierName: dossier?.title || dossier?.lawsuitNumber || null,
  });

  const type = String(targetType || "").toLowerCase();

  if (type === "dossier") {
    const dossier = findDossier(targetId);
    return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : null };
  }

  if (type === "client") {
    return { dossierName: null, dossierReference: null, clientName: findClientName(targetId) };
  }

  if (type === "lawsuit") {
    const lawsuit = lawsuits.find((item) => Number(item.id) === Number(targetId));
    const dossier = findDossier(lawsuit?.dossierId);
    return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : null };
  }

  if (type === "task") {
    const task = tasks.find((item) => Number(item.id) === Number(targetId));
    const lawsuit = task?.lawsuitId ? lawsuits.find((item) => Number(item.id) === Number(task.lawsuitId)) : null;
    const dossier = findDossier(task?.dossierId || lawsuit?.dossierId);
    return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : null };
  }

  if (type === "session") {
    const session = sessions.find((item) => Number(item.id) === Number(targetId));
    const lawsuit = session?.lawsuitId ? lawsuits.find((item) => Number(item.id) === Number(session.lawsuitId)) : null;
    const dossier = findDossier(session?.dossierId || lawsuit?.dossierId);
    return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : null };
  }

  if (type === "mission") {
    const mission = missions.find((item) => Number(item.id) === Number(targetId));
    const missionEntityType = String(mission?.entityType || "").toLowerCase();
    if (missionEntityType === "dossier") {
      const dossier = findDossier(mission?.entityId);
      return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : findClientName(mission?.clientId) };
    }
    if (missionEntityType === "lawsuit") {
      const lawsuit = lawsuits.find((item) => Number(item.id) === Number(mission?.entityId));
      const dossier = findDossier(lawsuit?.dossierId);
      return { ...dossierDisplay(dossier), clientName: dossier ? findClientName(dossier.clientId) : findClientName(mission?.clientId) };
    }
    return { dossierName: null, dossierReference: null, clientName: findClientName(mission?.clientId) };
  }

  if (type === "financial_entry") {
    const entry = financialEntries.find((item) => Number(item.id) === Number(targetId));
    const directDossier = findDossier(entry?.dossierId);
    if (directDossier) {
      return { ...dossierDisplay(directDossier), clientName: findClientName(directDossier.clientId) };
    }
    const lawsuit = entry?.lawsuitId ? lawsuits.find((item) => Number(item.id) === Number(entry.lawsuitId)) : null;
    const lawsuitDossier = findDossier(lawsuit?.dossierId);
    if (lawsuitDossier) {
      return { ...dossierDisplay(lawsuitDossier), clientName: findClientName(lawsuitDossier.clientId) };
    }
    const task = entry?.taskId ? tasks.find((item) => Number(item.id) === Number(entry.taskId)) : null;
    const taskLawsuit = task?.lawsuitId ? lawsuits.find((item) => Number(item.id) === Number(task.lawsuitId)) : null;
    const taskDossier = findDossier(task?.dossierId || taskLawsuit?.dossierId);
    return {
      ...dossierDisplay(taskDossier),
      clientName: taskDossier ? findClientName(taskDossier.clientId) : findClientName(entry?.clientId),
    };
  }

  return { dossierName: null, dossierReference: null, clientName: null };
}

export function DocumentGenerationPreviewArtifact({
  data,
  onConfirm,
  onCancel,
}: DocumentGenerationPreviewArtifactProps) {
  const contextData = useData() as DataContextLike;
  const [state, setState] = useState<PreviewState>(() => {
    const metaStatus = data.structuredSummaryMetadata?.status;
    if (metaStatus === "cancelled") return "cancelled";
    const expiresAt = data.structuredSummaryMetadata?.expiresAt;
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) return "cancelled";
    return "ready";
  });
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedMarkdown, setEditedMarkdown] = useState(
    String(data.contentMarkdown || ""),
  );
  const editorRef = useRef<HTMLTextAreaElement | null>(null);

  const handleConfirm = async () => {
    setError(null);
    setState("confirming");
    try {
      await onConfirm(editedMarkdown.trim() || undefined);
    } catch (err) {
      setState("failed");
      setError(err instanceof Error ? err.message : "Preview confirmation failed");
    }
  };

  const handleCancel = async () => {
    setError(null);
    try {
      await onCancel();
      setState("cancelled");
    } catch (err) {
      setState("failed");
      setError(err instanceof Error ? err.message : "Preview cancellation failed");
    }
  };

  const storageTarget =
    data.storageDecision?.resolvedTarget &&
    typeof data.storageDecision.resolvedTarget === "object"
      ? data.storageDecision.resolvedTarget
      : null;
  const storageScopeMissing = String(data.storageDecision?.status || "").toLowerCase() === "missing";
  const disabled = state === "confirming" || state === "cancelled" || storageScopeMissing;
  const hasEditedContent = editedMarkdown.trim().length > 0;
  const summaryMeta = data.structuredSummaryMetadata || {};
  const isRtl = String(data.language || "").toLowerCase() === "ar";
  const targetTypeLabel = toTitleCase(data.targetEntity.type || "Target");
  const targetRef = `${targetTypeLabel} #${data.targetEntity.id}`;
  const documentLabel = toTitleCase(data.documentType);
  const canonicalFormatLabel = String(
    data.canonicalFormat || data.format || "",
  ).toUpperCase();
  const previewFormatLabel = String(data.previewFormat || "").toUpperCase();
  const selectionModeRaw = String(data.formatSelection?.selectionMode || "auto").toLowerCase();
  const selectionModeLabel =
    selectionModeRaw === "explicit"
      ? "Explicit"
      : selectionModeRaw === "preference"
        ? "Preference"
        : "Auto";
  const formatWarning = Array.isArray(data.formatSelection?.warnings)
    ? data.formatSelection?.warnings.find((warning) => warning?.message)?.message || null
    : null;
  const storageWarning =
    typeof data.storageDecision?.message === "string" && data.storageDecision.message.trim()
      ? data.storageDecision.message.trim()
      : null;
  const storageTargetLabel = storageTarget
    ? `${toTitleCase(String(storageTarget.entityType || ""))} #${storageTarget.entityId}`
    : "Unresolved";
  const resolvedContext = resolveDossierAndClient(
    data.targetEntity.type,
    Number(data.targetEntity.id),
    contextData,
  );

  const dossierName =
    resolvedContext.dossierName ||
    (summaryMeta.dossierName as string | undefined) ||
    (summaryMeta.dossierLabel as string | undefined) ||
    (summaryMeta.dossierTitle as string | undefined) ||
    null;
  const dossierReference =
    resolvedContext.dossierReference ||
    (summaryMeta.dossierReference as string | undefined) ||
    (summaryMeta.dossierRef as string | undefined) ||
    targetRef;
  const clientName =
    resolvedContext.clientName ||
    (summaryMeta.clientName as string | undefined) ||
    (summaryMeta.clientLabel as string | undefined) ||
    (summaryMeta.clientTitle as string | undefined) ||
    null;

  useLayoutEffect(() => {
    if (!isEditing || !editorRef.current) return;
    editorRef.current.style.height = "auto";
    editorRef.current.style.height = `${editorRef.current.scrollHeight}px`;
  }, [isEditing, editedMarkdown]);

  return (
    <div className="artifact-build agent-artifact-card is-draft overflow-visible">
      {/* ── Header ── */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-draft flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-indigo shrink-0">
            <Eye className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              Document Preview
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Review before creating a proposal
            </p>
          </div>
        </div>
        {state === "cancelled" && (
          <span className="agent-status-badge agent-status-badge-pending">
            <span className="w-2 h-2 rounded-full bg-slate-400" />
            Cancelled
          </span>
        )}
      </div>

      {/* ── Metadata Grid ── */}
      <div className="artifact-build-section artifact-build-section-1 px-5 pt-4">
        <div className="rounded-xl border border-black/[0.06] bg-white/80 p-4 shadow-sm dark:border-white/[0.08] dark:bg-slate-900/40">
          <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Case Context
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-black/[0.06] bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-slate-800/45">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Tag className="h-3 w-3" />
                Dossier
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {dossierName || targetRef}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{dossierReference}</div>
            </div>
            <div className="rounded-lg border border-black/[0.06] bg-slate-50/70 px-3 py-2.5 dark:border-white/[0.06] dark:bg-slate-800/45">
              <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                <Globe className="h-3 w-3" />
                Client
              </div>
              <div className="text-sm font-medium text-slate-800 dark:text-slate-100">
                {clientName || "Client"}
              </div>
              <div className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">Linked to current context</div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
              <FileText className="h-3 w-3" />
              {documentLabel}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
              {`${String(data.language || "").toUpperCase()} / Preview ${previewFormatLabel || "HTML"}`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
              {`Will be saved as: ${canonicalFormatLabel || "PDF"} (${selectionModeLabel})`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
              {`Will be stored in: ${storageTargetLabel}`}
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
              <Layers className="h-3 w-3" />
              {data.templateKey} ({data.schemaVersion})
            </span>
          </div>
          {formatWarning ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
              {formatWarning}
            </div>
          ) : null}
          {storageWarning ? (
            <div className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-800 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
              {storageWarning}
            </div>
          ) : null}
        </div>
      </div>

      {/* ── Editor / Preview Section ── */}
      <div className="artifact-build-section artifact-build-section-2 px-5 py-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <div
            className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${
              isEditing
                ? "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-700/70 dark:bg-blue-900/30 dark:text-blue-300"
                : "border-slate-200 bg-slate-100/80 text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-300"
            }`}
          >
            {isEditing ? <Edit3 className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
            {isEditing ? "Edit Mode" : "Read-only Preview"}
          </div>
          <button
            type="button"
            onClick={() => setIsEditing((prev) => !prev)}
            aria-pressed={isEditing}
            className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium transition-colors ${
              isEditing
                ? "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 dark:border-blue-700/70 dark:bg-blue-900/30 dark:text-blue-300 dark:hover:bg-blue-900/45"
                : "border-black/[0.08] bg-white text-slate-600 hover:bg-slate-50 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300 dark:hover:bg-slate-700/70"
            }`}
          >
            <Edit3 className="w-3.5 h-3.5" />
            {isEditing ? "Done" : "Edit"}
          </button>
        </div>

        <div className="rounded-xl border border-black/[0.06] bg-white shadow-sm dark:border-white/[0.08] dark:bg-[#0f172a]/70">
          {isEditing ? (
            <textarea
              ref={editorRef}
              dir={isRtl ? "rtl" : "ltr"}
              lang={isRtl ? "ar" : undefined}
              className={`w-full min-h-[280px] p-4 text-sm leading-relaxed text-slate-800 placeholder:text-slate-400 bg-slate-50/70 dark:bg-slate-900/55 dark:text-slate-200 dark:placeholder:text-slate-500 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:ring-inset rounded-xl ${
                isRtl ? "text-right" : "text-left"
              }`}
              value={editedMarkdown}
              onChange={(e) => setEditedMarkdown(e.target.value)}
              placeholder="Edit generated markdown here..."
            />
          ) : (
            <div
              className={`p-4 ${isRtl ? "text-right" : "text-left"}`}
              dir={isRtl ? "rtl" : "ltr"}
              lang={isRtl ? "ar" : undefined}
            >
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-3">
                Document Content
              </div>
              {hasEditedContent ? (
                <div className="text-sm prose prose-sm max-w-none dark:prose-invert prose-slate">
                  <MarkdownOutput content={editedMarkdown} />
                </div>
              ) : (
              <div
                className="text-sm prose prose-sm max-w-none dark:prose-invert prose-slate"
                dangerouslySetInnerHTML={{ __html: data.previewHtml || "" }}
              />
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Error ── */}
      {error && (
        <div className="px-5 pb-2">
          <div className="text-xs font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/40 rounded-lg px-3 py-2">
            {error}
          </div>
        </div>
      )}

      {/* ── Actions Footer ── */}
      <div className="agent-artifact-footer artifact-build-section artifact-build-section-3 sticky bottom-0 z-10 flex-wrap gap-2">
        <div className="flex min-h-6 items-center gap-2 text-xs">
          {state === "confirming" && (
            <>
              <span className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Creating proposal…</span>
            </>
          )}
          {state === "cancelled" && (
            <>
              <span className="w-2 h-2 rounded-full bg-slate-400" />
              <span className="text-xs text-slate-500 dark:text-slate-400">Preview cancelled</span>
            </>
          )}
          {state === "ready" && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {storageScopeMissing
                ? "Resolve target scope before confirmation"
                : "Review and confirm to proceed"}
            </span>
          )}
          {state === "failed" && (
            <>
              <span className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs text-red-500 dark:text-red-400">Action failed</span>
            </>
          )}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button
            type="button"
            onClick={handleCancel}
            disabled={disabled}
            className="agent-action-btn agent-action-btn-secondary disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <XCircle className="w-3.5 h-3.5" />
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={disabled}
            className="agent-action-btn agent-action-btn-primary min-w-[138px] justify-center disabled:opacity-40 disabled:pointer-events-none disabled:cursor-not-allowed"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            {state === "confirming" ? "Creating…" : "Confirm Preview"}
          </button>
        </div>
      </div>
    </div>
  );
}
