import { useState } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  FileText,
  FolderOpen,
  Link2,
  Loader2,
  RefreshCcw,
  Tag,
  User,
  XCircle,
} from "lucide-react";
import { MarkdownOutput } from "../../../../components/MarkdownOutput";
import type {
  DecisionUiState,
  SemanticActionViewModel,
  SemanticImpactItem,
  StructuredProposalCardField,
  StructuredProposalCardViewModel,
} from "./types";

interface DecisionConfirmationPanelProps {
  viewModel: SemanticActionViewModel;
  uiState: DecisionUiState;
  errorMessage?: string;
  completedAtLabel?: string;
  onConfirm?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  onRetry?: () => void;
  expiresAt?: string;
  canRetry?: boolean;
  requiresRefresh?: boolean;
  debugPayload?: unknown;
}

function cx(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(" ");
}

function normalizeForDupCheck(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shouldSuppressDescription(framingMessage?: string, description?: string): boolean {
  const a = normalizeForDupCheck(framingMessage || "");
  const b = normalizeForDupCheck(description || "");
  if (!a || !b) return false;
  if (a === b) return true;
  if (a.includes(b) || b.includes(a)) return Math.min(a.length, b.length) > 32;
  return false;
}

function getToneClasses(tone: SemanticActionViewModel["toneVariant"]) {
  if (tone === "destructive") {
    return {
      wrap: "border-rose-300 bg-rose-50/80 dark:border-rose-800/70 dark:bg-rose-950/20",
      accent: "bg-rose-500",
      subtle: "bg-rose-50/70 dark:bg-rose-950/20 border-rose-200/70 dark:border-rose-800/60",
      warningRow: "border-rose-200/70 bg-rose-50/90 dark:border-rose-800/60 dark:bg-rose-950/20",
    };
  }
  if (tone === "sensitive") {
    return {
      wrap: "border-slate-300 bg-slate-50/80 dark:border-slate-700 dark:bg-slate-900/40",
      accent: "bg-slate-500",
      subtle: "bg-white/70 dark:bg-slate-900/40 border-slate-200/70 dark:border-slate-700/60",
      warningRow: "border-slate-200/70 bg-white/90 dark:border-slate-700/60 dark:bg-slate-900/20",
    };
  }
  if (tone === "caution") {
    return {
      wrap: "border-amber-300 bg-amber-50/70 dark:border-amber-800/70 dark:bg-amber-950/20",
      accent: "bg-amber-500",
      subtle: "bg-amber-50/70 dark:bg-amber-950/20 border-amber-200/70 dark:border-amber-800/60",
      warningRow: "border-amber-200/80 bg-amber-50/90 dark:border-amber-800/60 dark:bg-amber-950/25",
    };
  }
  return {
    wrap: "border-slate-200 bg-white/90 dark:border-slate-700 dark:bg-slate-900/30",
    accent: "bg-slate-500",
    subtle: "bg-slate-50/70 dark:bg-slate-900/30 border-slate-200/70 dark:border-slate-700/60",
    warningRow: "border-slate-200/70 bg-slate-50/80 dark:border-slate-700/60 dark:bg-slate-900/25",
  };
}

function getToneLabel(tone: SemanticActionViewModel["toneVariant"]): string | null {
  if (tone === "neutral") return null;
  if (tone === "sensitive") return "Sensitive Tone";
  if (tone === "caution") return "Caution Tone";
  return "Destructive Tone";
}

function SectionTitle({ children }: { children: string }) {
  return (
    <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
      {children}
    </div>
  );
}

function ChangeRows({ items, title }: { items: SemanticImpactItem[]; title: string }) {
  if (items.length === 0) return null;
  const diffRows = items.filter((item) => item.before || item.after);
  const descriptiveRows = items.filter((item) => !item.before && !item.after);
  return (
    <div className="space-y-2.5">
      <SectionTitle>{title}</SectionTitle>
      {diffRows.length > 0 ? (
        <div className="space-y-2">
          {diffRows.map((item, idx) => (
            <div key={`${item.title || "change"}-${idx}`} className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 gap-y-1 text-xs">
              <div className="font-medium text-slate-700 dark:text-slate-200">{item.title || "Change"}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                  {item.before || "Current"}
                </span>
                <span className="text-slate-400 dark:text-slate-500">{"->"}</span>
                <span className="rounded bg-slate-900 px-1.5 py-0.5 text-white dark:bg-slate-100 dark:text-slate-900">
                  {item.after || "Updated"}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {descriptiveRows.length > 0 ? (
        <div className="space-y-1.5">
          {descriptiveRows.map((item, idx) => (
            <div
              key={`${item.title || "planned"}-detail-${idx}`}
              className="flex items-start gap-2 rounded-md border border-slate-200/70 bg-white/80 px-2.5 py-2 text-xs text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/25 dark:text-slate-200"
            >
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
              <span>
                {item.title ? <span className="font-medium">{item.title}: </span> : null}
                {item.detail}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ImpactRows({
  items,
  title,
  emphasizeWarning = false,
  tone,
}: {
  items: SemanticImpactItem[];
  title: string;
  emphasizeWarning?: boolean;
  tone: SemanticActionViewModel["toneVariant"];
}) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;
  const toneClasses = getToneClasses(tone);
  const visible = expanded ? items : items.slice(0, 5);
  return (
    <div className="space-y-2">
      <SectionTitle>{title}</SectionTitle>
      <div className="space-y-1.5">
        {visible.map((item, idx) => (
          <div
            key={`${title}-${idx}`}
            className={cx(
              "flex items-start gap-2 rounded-md border px-2.5 py-2 text-xs text-slate-700 dark:text-slate-200",
              emphasizeWarning ? toneClasses.warningRow : "border-slate-200/70 bg-white/80 dark:border-slate-700/60 dark:bg-slate-900/25",
            )}
          >
            {emphasizeWarning ? (
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            ) : (
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
            )}
            <span>{item.detail}</span>
          </div>
        ))}
      </div>
      {items.length > 5 ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-xs text-slate-600 hover:text-slate-900 dark:text-slate-300 dark:hover:text-white"
        >
          {expanded ? "Show less" : `Show ${items.length - 5} more`}
        </button>
      ) : null}
    </div>
  );
}

function PreviewRows({
  preview,
}: {
  preview?: SemanticActionViewModel["preview"];
}) {
  if (!preview || !Array.isArray(preview.items) || preview.items.length === 0) return null;
  const maxItems = 20;
  const visibleItems = preview.items.slice(0, maxItems);
  const hiddenCount = Math.max(0, preview.items.length - visibleItems.length);
  return (
    <div className="space-y-2">
      <SectionTitle>{preview.title || "Planned changes"}</SectionTitle>
      <div className="overflow-hidden rounded-md border border-slate-200/70 bg-white/85 dark:border-slate-700/60 dark:bg-slate-900/25">
        <table className="w-full text-xs">
          <thead className="bg-slate-100/80 dark:bg-slate-800/70">
            <tr className="text-left text-slate-700 dark:text-slate-200">
              <th className="px-2.5 py-2 font-medium">Title</th>
              <th className="px-2.5 py-2 font-medium">Status</th>
              <th className="px-2.5 py-2 font-medium">Priority</th>
              <th className="px-2.5 py-2 font-medium">Linked to</th>
              <th className="px-2.5 py-2 font-medium">Inference</th>
            </tr>
          </thead>
          <tbody>
            {visibleItems.map((row, index) => (
              <tr key={`${row.title}-${index}`} className="border-t border-slate-200/60 dark:border-slate-700/50 text-slate-700 dark:text-slate-200">
                <td className="px-2.5 py-2 align-top">{row.title}</td>
                <td className="px-2.5 py-2 align-top">{row.status || "-"}</td>
                <td className="px-2.5 py-2 align-top">{row.priority || "-"}</td>
                <td className="px-2.5 py-2 align-top">
                  {Array.isArray(row.parentLinks) && row.parentLinks.length > 0
                    ? row.parentLinks.join(" / ")
                    : "-"}
                </td>
                <td className="px-2.5 py-2 align-top">
                  <div className="flex flex-wrap gap-1.5">
                    {Array.isArray(row.explicitFields) && row.explicitFields.length > 0 ? (
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                        explicit {row.explicitFields.length}
                      </span>
                    ) : null}
                    {Array.isArray(row.defaultedFields) && row.defaultedFields.length > 0 ? (
                      <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-200">
                        defaults {row.defaultedFields.length}
                      </span>
                    ) : null}
                    {Array.isArray(row.inheritedFields) && row.inheritedFields.length > 0 ? (
                      <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-blue-700 dark:bg-blue-950/40 dark:text-blue-200">
                        inherited {row.inheritedFields.length}
                      </span>
                    ) : null}
                    {Array.isArray(row.inferredFields) && row.inferredFields.length > 0 ? (
                      <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-200">
                        inferred {row.inferredFields.length}
                      </span>
                    ) : null}
                    {Array.isArray(row.correctedFields) && row.correctedFields.length > 0 ? (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
                        corrected {row.correctedFields.length}
                      </span>
                    ) : null}
                    {Array.isArray(row.warnings) && row.warnings.length > 0 ? (
                      <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-rose-700 dark:bg-rose-950/30 dark:text-rose-200">
                        warnings {row.warnings.length}
                      </span>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {hiddenCount > 0 ? (
        <div className="text-xs text-slate-600 dark:text-slate-300">+{hiddenCount} more</div>
      ) : null}
      {Array.isArray(preview.warnings) && preview.warnings.length > 0 ? (
        <div className="space-y-1.5">
          {preview.warnings.map((line, idx) => (
            <div
              key={`preview-warning-${idx}`}
              className="flex items-start gap-2 rounded-md border border-amber-200/80 bg-amber-50/90 px-2.5 py-2 text-xs text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-200"
            >
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <span>{line}</span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ProposalFieldIcon({ field }: { field: StructuredProposalCardField }) {
  const className = "h-3.5 w-3.5";
  if (field.icon === "client" || field.icon === "person") return <User className={className} />;
  if (field.icon === "dossier") return <FolderOpen className={className} />;
  if (field.icon === "lawsuit" || field.icon === "link") return <Link2 className={className} />;
  if (field.icon === "calendar" || field.icon === "date") return <Calendar className={className} />;
  if (field.icon === "tag" || field.icon === "type" || field.icon === "status") return <Tag className={className} />;
  return <FileText className={className} />;
}

function ProposalResultFooter({
  card,
  uiState,
  completedAtLabel,
  onUndo,
}: {
  card: StructuredProposalCardViewModel;
  uiState: DecisionUiState;
  completedAtLabel?: string;
  onUndo?: () => void;
}) {
  if (uiState === "applied") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)] animate-pulse" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-emerald-100">{card.applied.title}</div>
            <div className="text-xs text-emerald-200/70">
              {card.applied.subtitle || completedAtLabel || "The confirmed action completed successfully."}
            </div>
          </div>
        </div>
        {card.applied.shortcutLabel && card.applied.resultTarget ? (
          <div className="text-xs font-medium text-emerald-200 whitespace-nowrap">
            {card.applied.shortcutLabel} &rarr;
          </div>
        ) : null}
      </div>
    );
  }

  if (uiState === "declined") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-rose-500/20 bg-rose-500/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.45)]" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-rose-100">{card.cancelled.title}</div>
            <div className="text-xs text-rose-200/70">{card.cancelled.subtitle}</div>
          </div>
        </div>
        {onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            className="rounded-md border border-white/10 px-2.5 py-1 text-xs font-medium text-slate-100 transition hover:bg-white/5"
          >
            {card.cancelled.undoLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}

function StructuredProposalCard({
  card,
  uiState,
  errorMessage,
  completedAtLabel,
  expiresAt,
  canRetry,
  requiresRefresh,
  onConfirm,
  onDecline,
  onUndo,
  onRetry,
}: {
  card: StructuredProposalCardViewModel;
  uiState: DecisionUiState;
  errorMessage?: string;
  completedAtLabel?: string;
  expiresAt?: string;
  canRetry: boolean;
  requiresRefresh: boolean;
  onConfirm?: () => void;
  onDecline?: () => void;
  onUndo?: () => void;
  onRetry?: () => void;
}) {
  const showPendingBar = uiState === "awaiting_decision" || uiState === "submitting" || uiState === "failed";
  const showRetry = uiState === "failed" && canRetry && !requiresRefresh;

  return (
    <div
      className="overflow-hidden rounded-2xl border border-white/8 bg-slate-950/70 shadow-[0_16px_60px_rgba(2,6,23,0.42)] animate-in fade-in slide-in-from-bottom-2 duration-300"
      data-testid="decision-confirmation-panel"
      data-state={uiState}
    >
      <div className="flex items-center justify-between gap-3 border-b border-white/6 bg-black/20 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">{card.verb}</span>
          <span className="rounded-md border border-sky-400/20 bg-sky-500/10 px-2 py-1 text-[11px] font-semibold text-sky-300">
            {card.entityLabel}
          </span>
        </div>
        <span className="rounded-md border border-white/8 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-300">
          {card.reversibleLabel}
        </span>
      </div>

      <div className="space-y-4 px-4 py-4">
        <div className="space-y-1">
          <h3 className="text-[15px] font-semibold leading-6 text-slate-50">{card.title}</h3>
          {card.subtitle ? (
            <p className="text-sm leading-5 text-slate-400">{card.subtitle}</p>
          ) : null}
        </div>

        {card.fields.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {card.fields.map((field) => (
              <div
                key={`${field.key}-${field.label}`}
                className={cx(
                  "flex items-start gap-3 rounded-xl border border-white/6 bg-white/[0.03] px-3 py-3",
                  field.span === "full" ? "sm:col-span-2" : "",
                )}
              >
                <span className="mt-0.5 text-slate-500">
                  <ProposalFieldIcon field={field} />
                </span>
                <div className="min-w-0">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                    {field.label}
                  </div>
                  <div className="mt-1 break-words text-sm font-medium text-slate-100">{field.value}</div>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {card.contentPreview ? (
          <div className="rounded-r-xl border border-white/6 border-l-sky-400/40 bg-white/[0.03] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
              {card.contentPreview.label}
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-200">{card.contentPreview.text}</p>
          </div>
        ) : null}

        {uiState === "expired" ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
            This confirmation expired. Ask the assistant to prepare it again.
          </div>
        ) : null}

        {uiState === "stale" ? (
          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2.5 text-sm text-amber-100">
            This confirmation is no longer current. Please ask the assistant to prepare the change again.
          </div>
        ) : null}

        {errorMessage && uiState === "failed" ? (
          <div className="rounded-xl border border-rose-500/20 bg-rose-500/10 px-3 py-2.5 text-sm text-rose-100">
            {errorMessage}
          </div>
        ) : null}
      </div>

      {showPendingBar ? (
        <div className="flex flex-col gap-3 border-t border-white/6 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-xs font-medium text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>{card.warningHint}</span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={uiState === "submitting"}
              className="rounded-lg border border-white/10 px-3.5 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/5 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {card.cancelLabel}
            </button>
            <button
              type="button"
              onClick={showRetry ? onRetry : onConfirm}
              disabled={uiState === "submitting"}
              className="inline-flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500 px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {uiState === "submitting" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{card.confirmLabel}</span>
                </>
              ) : showRetry ? (
                <>
                  <RefreshCcw className="h-4 w-4" />
                  <span>Try Again</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4" />
                  <span>{card.confirmLabel}</span>
                </>
              )}
            </button>
          </div>
        </div>
      ) : null}

      {(uiState === "applied" || uiState === "declined") ? (
        <ProposalResultFooter
          card={card}
          uiState={uiState}
          completedAtLabel={completedAtLabel}
          onUndo={uiState === "declined" ? onUndo : undefined}
        />
      ) : null}

      {expiresAt && uiState === "awaiting_decision" ? (
        <div className="border-t border-white/6 px-4 py-2 text-[11px] text-slate-500">
          Available until {new Date(expiresAt).toLocaleTimeString()}.
        </div>
      ) : null}
    </div>
  );
}

function LegacyExecutionState({
  uiState,
  errorMessage,
  completedAtLabel,
}: {
  uiState: DecisionUiState;
  errorMessage?: string;
  completedAtLabel?: string;
}) {
  if (uiState === "awaiting_decision" || uiState === "declined" || uiState === "expired") return null;

  if (uiState === "submitting") {
    return (
      <div className="mt-3 rounded-lg border border-slate-200/70 bg-white/85 px-3 py-2.5 dark:border-slate-700/60 dark:bg-slate-900/30" aria-live="polite">
        <div className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Applying your confirmed change...</span>
        </div>
      </div>
    );
  }

  if (uiState === "applied") {
    return (
      <div className="mt-3 rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2.5 text-sm text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/20 dark:text-emerald-200" aria-live="polite">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          <span>Applied</span>
        </div>
        {completedAtLabel ? <div className="mt-1 text-xs opacity-80">{completedAtLabel}</div> : null}
      </div>
    );
  }

  if (uiState === "stale") {
    return (
      <div className="mt-3 rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-200" aria-live="polite">
        <div className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" />
          <span>This confirmation is no longer current.</span>
        </div>
        <div className="mt-1 text-xs opacity-90">
          Please ask the assistant to prepare the change again so it can use the latest data.
        </div>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-rose-200/80 bg-rose-50/90 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-800/60 dark:bg-rose-950/20 dark:text-rose-200" aria-live="polite">
      <div className="flex items-center gap-2">
        <XCircle className="h-4 w-4" />
        <span>I could not apply that change.</span>
      </div>
      {errorMessage ? <div className="mt-1 text-xs opacity-90">{errorMessage}</div> : null}
    </div>
  );
}

function LegacyPanel({
  viewModel,
  uiState,
  errorMessage,
  completedAtLabel,
  onConfirm,
  onDecline,
  onRetry,
  expiresAt,
  canRetry = true,
  requiresRefresh = false,
  debugPayload,
}: DecisionConfirmationPanelProps) {
  const tone = getToneClasses(viewModel.toneVariant);
  const changeItems = viewModel.impact.filter((item) => item.kind === "change");
  const warningItems = viewModel.impact.filter((item) => item.kind === "warning");
  const reversibilityItems = viewModel.impact.filter((item) => item.kind === "reversibility");
  const consequenceItems = viewModel.impact.filter((item) => item.kind === "consequence");
  const effectItems = [...consequenceItems, ...warningItems];
  const hasEffectWarnings = warningItems.length > 0;
  const toneLabel = getToneLabel(viewModel.toneVariant);
  const showDescription = Boolean(
    viewModel.description && !shouldSuppressDescription(viewModel.assistantMessage, viewModel.description),
  );
  const isActionable = uiState === "awaiting_decision";
  const showRetry = uiState === "failed" && canRetry && !requiresRefresh;

  return (
    <div className="space-y-2" data-testid="decision-confirmation-turn">
      <div className="agent-message-row">
        <div className="agent-chat-text px-1 text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
          <MarkdownOutput content={viewModel.assistantMessage} />
        </div>
      </div>

      <div
        className={cx("overflow-hidden rounded-xl border shadow-sm", tone.wrap)}
        data-testid="decision-confirmation-panel"
        data-tone={viewModel.toneVariant}
        data-state={uiState}
      >
        <div className={cx("h-1", tone.accent)} />
        <div className="space-y-3 px-4 py-3.5">
          <div className="space-y-1">
            {toneLabel ? (
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                {toneLabel}
              </div>
            ) : null}
            <h3 className="text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">
              {viewModel.headline}
            </h3>
            {showDescription ? (
              <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{viewModel.description}</p>
            ) : null}
          </div>

          <div className={cx("space-y-3 rounded-lg border p-3", tone.subtle)}>
            <PreviewRows preview={viewModel.preview} />
            <ChangeRows items={changeItems} title={viewModel.sections.changesLabel} />
            <ImpactRows
              title={viewModel.sections.consequencesLabel}
              items={effectItems}
              emphasizeWarning={hasEffectWarnings}
              tone={viewModel.toneVariant}
            />
            <ImpactRows title={viewModel.sections.reversibilityLabel} items={reversibilityItems} tone={viewModel.toneVariant} />
          </div>

          {uiState === "declined" ? (
            <div className="rounded-lg border border-slate-200/80 bg-white/80 px-3 py-2 text-sm text-slate-700 dark:border-slate-700/60 dark:bg-slate-900/20 dark:text-slate-300">
              No change was applied.
            </div>
          ) : null}

          {uiState === "expired" ? (
            <div className="rounded-lg border border-amber-200/80 bg-amber-50/90 px-3 py-2 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/20 dark:text-amber-200">
              This confirmation expired. Ask the assistant to prepare it again.
            </div>
          ) : null}

          <LegacyExecutionState uiState={uiState} errorMessage={errorMessage} completedAtLabel={completedAtLabel} />

          {(isActionable || showRetry) ? (
            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="button"
                onClick={showRetry ? onRetry : onConfirm}
                className={cx(
                  "agent-action-btn min-w-[132px] justify-center",
                  viewModel.toneVariant === "destructive"
                    ? "border-rose-300 bg-rose-600 text-white hover:bg-rose-700 dark:border-rose-700 dark:bg-rose-600"
                    : "agent-action-btn-primary",
                )}
              >
                {showRetry ? (
                  <>
                    <RefreshCcw className="w-4 h-4" />
                    Try Again
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    {viewModel.confirmLabel}
                  </>
                )}
              </button>

              {isActionable ? (
                <button
                  type="button"
                  onClick={onDecline}
                  className="agent-action-btn agent-action-btn-secondary"
                >
                  <XCircle className="w-4 h-4" />
                  {viewModel.cancelLabel}
                </button>
              ) : null}
            </div>
          ) : null}

          {expiresAt && isActionable ? (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              Available until {new Date(expiresAt).toLocaleTimeString()}.
            </div>
          ) : null}

          {typeof import.meta !== "undefined" && import.meta.env?.DEV && debugPayload ? (
            <details className="rounded-lg border border-dashed border-slate-300/80 bg-white/60 px-3 py-2 dark:border-slate-700/60 dark:bg-slate-900/20">
              <summary className="cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-200">
                Debug Payload (temporary)
              </summary>
              <pre className="mt-2 max-h-64 overflow-auto rounded bg-slate-950 p-2 text-[11px] leading-relaxed text-slate-100">
                {JSON.stringify(debugPayload, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function DecisionConfirmationPanel(props: DecisionConfirmationPanelProps) {
  const { viewModel, uiState, errorMessage, completedAtLabel, expiresAt, canRetry = true, requiresRefresh = false, onConfirm, onDecline, onUndo, onRetry } = props;

  if (viewModel.card) {
    return (
      <StructuredProposalCard
        card={viewModel.card}
        uiState={uiState}
        errorMessage={errorMessage}
        completedAtLabel={completedAtLabel}
        expiresAt={expiresAt}
        canRetry={canRetry}
        requiresRefresh={requiresRefresh}
        onConfirm={onConfirm}
        onDecline={onDecline}
        onUndo={onUndo}
        onRetry={onRetry}
      />
    );
  }

  return <LegacyPanel {...props} />;
}
