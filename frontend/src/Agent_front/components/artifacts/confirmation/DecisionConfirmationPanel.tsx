import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileText,
  ListChecks,
  Loader2,
  RefreshCcw,
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

function toStructuredCardFromLegacyViewModel(
  viewModel: SemanticActionViewModel,
): StructuredProposalCardViewModel {
  const changeItems = viewModel.impact.filter((item) => item.kind === "change");
  const consequenceItems = viewModel.impact.filter((item) => item.kind === "consequence");
  const warningItems = viewModel.impact.filter((item) => item.kind === "warning");
  const reversibilityItems = viewModel.impact.filter((item) => item.kind === "reversibility");

  const fields: StructuredProposalCardField[] = [];
  for (const item of changeItems) {
    const label = String(item.title || "Change").trim();
    const hasDiff = Boolean(item.before || item.after);
    const value = hasDiff
      ? `${item.before || "Current"} -> ${item.after || "Updated"}`
      : String(item.detail || "").trim();
    if (!value) continue;
    fields.push({
      key: `${label}-${fields.length}`,
      label,
      value,
      icon: "status",
      span: "full",
    });
  }

  if (fields.length === 0) {
    fields.push({
      key: "planned_change",
      label: "Planned change",
      value: String(viewModel.description || "This action will be applied when confirmed."),
      icon: "file",
      span: "full",
    });
  }

  const impactLines = [...consequenceItems, ...warningItems, ...reversibilityItems]
    .map((item) => String(item.detail || "").trim())
    .filter(Boolean);

  return {
    verb: "Confirm",
    entityLabel: "Change",
    reversibleLabel:
      viewModel.toneVariant === "destructive" ? "Not reversible" : "Can be adjusted later",
    title: viewModel.headline || "Confirm this change",
    subtitle: viewModel.description || undefined,
    fields,
    contentPreview:
      impactLines.length > 0
        ? {
            label: "What this affects",
            text: impactLines.map((line) => `- ${line}`).join("\n"),
          }
        : undefined,
    warningHint:
      viewModel.toneVariant === "destructive"
        ? "Please review carefully before confirming."
        : "Review before confirming.",
    confirmLabel: viewModel.confirmLabel || "Confirm",
    cancelLabel: viewModel.cancelLabel || "Cancel",
    applied: {
      title: "Applied",
      subtitle: "The confirmed action completed successfully.",
    },
    cancelled: {
      title: "Cancelled",
      subtitle: "No change was applied.",
      undoLabel: "Undo",
    },
  };
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
      <div className="flex items-center justify-between gap-3 border-t border-emerald-200/70 bg-emerald-50/80 px-4 py-3 dark:border-emerald-700/40 dark:bg-emerald-900/20">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.55)] animate-pulse" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-emerald-800 dark:text-emerald-100">{card.applied.title}</div>
            <div className="text-xs text-emerald-700/80 dark:text-emerald-200/70">
              {card.applied.subtitle || completedAtLabel || "The confirmed action completed successfully."}
            </div>
          </div>
        </div>
        {card.applied.shortcutLabel && card.applied.resultTarget ? (
          <div className="text-xs font-medium text-emerald-700 dark:text-emerald-200 whitespace-nowrap">
            {card.applied.shortcutLabel} &rarr;
          </div>
        ) : null}
      </div>
    );
  }

  if (uiState === "declined") {
    return (
      <div className="flex items-center justify-between gap-3 border-t border-rose-200/70 bg-rose-50/80 px-4 py-3 dark:border-rose-700/40 dark:bg-rose-900/20">
        <div className="flex min-w-0 items-center gap-3">
          <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-rose-400 shadow-[0_0_10px_rgba(251,113,133,0.45)]" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-rose-800 dark:text-rose-100">{card.cancelled.title}</div>
            <div className="text-xs text-rose-700/80 dark:text-rose-200/70">{card.cancelled.subtitle}</div>
          </div>
        </div>
        {onUndo ? (
          <button
            type="button"
            onClick={onUndo}
            className="rounded-md border border-black/[0.08] bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 dark:border-white/10 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700"
          >
            {card.cancelled.undoLabel}
          </button>
        ) : null}
      </div>
    );
  }

  return null;
}

function splitDiffValue(value: string): { before: string; after: string } | null {
  const text = String(value || "").trim();
  if (!text) return null;
  const marker = "->";
  const markerIndex = text.indexOf(marker);
  if (markerIndex <= 0) return null;
  const before = text.slice(0, markerIndex).trim();
  const after = text.slice(markerIndex + marker.length).trim();
  if (!before || !after) return null;
  return { before, after };
}

function splitCompoundPreviewLine(line: string): string[] {
  const original = String(line || "");
  const hadBulletMarker = /[\u2022\u00b7]/.test(original);
  const normalized = String(line || "")
    .replace(/\u2022/g, "-")
    .replace(/\u00b7/g, "-")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const withoutMarker = normalized.replace(/^\s*[-*]\s*/, "").trim();
  if (!withoutMarker) return [];
  if (withoutMarker.includes("->")) return [withoutMarker];

  const pieces = withoutMarker.split(/\s+-\s+(?=(?:\d+|[A-Za-z]))/g);
  const looksLikeCountSummary =
    pieces.length > 1 &&
    pieces.every((piece) =>
      /^(?:\d+\s+[a-z]|(?:client|dossier|lawsuit|task|session|mission)\s+has\s+\d+)/i.test(
        piece.trim(),
      ),
    );
  const isCompressedList = hadBulletMarker || pieces.length > 2 || looksLikeCountSummary;
  if (!isCompressedList) return [withoutMarker];

  return pieces.map((piece) => piece.trim()).filter(Boolean);
}

function normalizePreviewLines(text: string): string[] {
  const lines = String(text || "")
    .replace(/\r\n/g, "\n")
    .split(/\n+/)
    .flatMap((line) => splitCompoundPreviewLine(line));
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const line of lines) {
    const item = String(line || "")
      .replace(/^\s*[-*]\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!item) continue;
    const key = item.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    normalized.push(item);
  }
  return normalized;
}

function normalizeContentLabel(label?: string): string {
  const normalized = String(label || "").trim().toLowerCase();
  if (!normalized) return "Required related changes";
  if (normalized.includes("affect") || normalized.includes("impact")) {
    return "Required related changes";
  }
  return label || "Required related changes";
}

function extractPlannedStepCount(value?: string): number | null {
  const match = String(value || "")
    .trim()
    .match(/(\d+)\s+planned\s+steps?/i);
  if (!match) return null;
  const parsed = Number(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function singularizeLabel(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text.endsWith("ies") && text.length > 3) return `${text.slice(0, -3)}y`;
  if (text.endsWith("s") && !text.endsWith("ss") && text.length > 3) return text.slice(0, -1);
  return text;
}

type ImpactCardTone = "blue" | "violet" | "amber" | "teal";
type ImpactCardModel = {
  key: string;
  title: string;
  subtitle: string;
  count: number;
  tone: ImpactCardTone;
};

function normalizeEntityLabel(raw: string): string {
  const cleaned = String(raw || "")
    .replace(/\b(non-terminal|open|active)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!cleaned) return "Records";
  return toTitleCase(cleaned);
}

function parseImpactCard(line: string): Omit<ImpactCardModel, "tone"> | null {
  const text = String(line || "").trim();
  if (!text) return null;

  const updateMatch = text.match(
    /^(\d+)\s+([a-z][a-z\s-]*)\s+will(?:\s+be|\s+have\s+their\s+[a-z\s]+)?\s+updated(?:\s*\(fields:\s*([^)]+)\))?\.?$/i,
  );
  if (updateMatch) {
    const count = Number(updateMatch[1]);
    if (!Number.isFinite(count) || count <= 0) return null;
    const entityLabel = normalizeEntityLabel(updateMatch[2]);
    const fields = String(updateMatch[3] || "").trim();
    return {
      key: entityLabel.toLowerCase(),
      title: entityLabel,
      subtitle: fields ? `${toTitleCase(fields)} update` : "Status update",
      count,
    };
  }

  const hasMatch = text.match(/^Client has (\d+)\s+(.+?)\.?$/i);
  if (hasMatch) {
    const count = Number(hasMatch[1]);
    if (!Number.isFinite(count) || count <= 0) return null;
    const tail = String(hasMatch[2] || "").trim();
    const qualifierMatch = tail.match(/^(open|active|non-terminal)\s+(.+)$/i);
    const qualifier = qualifierMatch ? qualifierMatch[1].toLowerCase() : "";
    const entityPart = qualifierMatch ? qualifierMatch[2] : tail;
    const entityLabel = normalizeEntityLabel(entityPart);
    const subtitle = qualifier ? `${toTitleCase(qualifier)} linked records` : "Linked records";
    return {
      key: entityLabel.toLowerCase(),
      title: entityLabel,
      subtitle,
      count,
    };
  }

  return null;
}

function toneForImpactIndex(index: number): ImpactCardTone {
  const tones: ImpactCardTone[] = ["blue", "violet", "amber", "teal"];
  return tones[index % tones.length];
}

function impactToneClasses(tone: ImpactCardTone): { iconWrap: string; iconText: string; countChip: string } {
  if (tone === "violet") {
    return {
      iconWrap: "bg-violet-500/12 border-violet-400/35 dark:bg-violet-500/20 dark:border-violet-500/35",
      iconText: "text-violet-700 dark:text-violet-200",
      countChip: "bg-violet-50 text-violet-700 border-violet-200/80 dark:bg-violet-900/35 dark:text-violet-200 dark:border-violet-700/60",
    };
  }
  if (tone === "amber") {
    return {
      iconWrap: "bg-amber-500/12 border-amber-400/35 dark:bg-amber-500/20 dark:border-amber-500/35",
      iconText: "text-amber-700 dark:text-amber-200",
      countChip: "bg-amber-50 text-amber-700 border-amber-200/80 dark:bg-amber-900/35 dark:text-amber-200 dark:border-amber-700/60",
    };
  }
  if (tone === "teal") {
    return {
      iconWrap: "bg-teal-500/12 border-teal-400/35 dark:bg-teal-500/20 dark:border-teal-500/35",
      iconText: "text-teal-700 dark:text-teal-200",
      countChip: "bg-teal-50 text-teal-700 border-teal-200/80 dark:bg-teal-900/35 dark:text-teal-200 dark:border-teal-700/60",
    };
  }
  return {
    iconWrap: "bg-blue-500/12 border-blue-400/35 dark:bg-blue-500/20 dark:border-blue-500/35",
    iconText: "text-blue-700 dark:text-blue-200",
    countChip: "bg-blue-50 text-blue-700 border-blue-200/80 dark:bg-blue-900/35 dark:text-blue-200 dark:border-blue-700/60",
  };
}

function buildImpactPresentation(lines: string[]): { cards: ImpactCardModel[]; contextLines: string[] } {
  const cards: ImpactCardModel[] = [];
  const contextLines: string[] = [];
  const seenEntities = new Set<string>();

  for (const line of lines) {
    const parsed = parseImpactCard(line);
    if (!parsed) {
      contextLines.push(line);
      continue;
    }
    if (seenEntities.has(parsed.key)) {
      contextLines.push(line);
      continue;
    }
    seenEntities.add(parsed.key);
    cards.push({
      ...parsed,
      tone: toneForImpactIndex(cards.length),
    });
  }

  const visibleCards = cards.slice(0, 4);
  const overflow = cards.slice(4);
  if (overflow.length > 0) {
    contextLines.unshift(
      `${overflow.length} additional ${overflow.length === 1 ? "group" : "groups"} of related records will also be updated.`,
    );
  }

  return { cards: visibleCards, contextLines };
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
  const contentLines = card.contentPreview ? normalizePreviewLines(card.contentPreview.text) : [];
  const impactPresentation = buildImpactPresentation(contentLines);
  const impactCards = impactPresentation.cards;
  const contextLines = impactPresentation.contextLines;
  const plannedStepCount = extractPlannedStepCount(card.subtitle) || contentLines.length || null;
  const entityBadgeLabel =
    String(card.entityLabel || "").trim().toLowerCase() === "change"
      ? `${String(card.title || "change").split(/\s+/).slice(0, 2).join(" ")}`
      : `${card.entityLabel} update`;

  return (
    <div
      className="artifact-build agent-artifact-card is-proposal overflow-visible border border-white/10 shadow-[0_12px_38px_rgba(2,6,23,0.28)] animate-in fade-in slide-in-from-bottom-2 duration-300"
      data-testid="decision-confirmation-panel"
      data-state={uiState}
    >
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-proposal border-b border-black/[0.06] bg-gradient-to-r from-slate-50/85 via-indigo-50/35 to-transparent px-5 py-3 dark:border-white/[0.07] dark:from-slate-900/65 dark:via-indigo-950/15">
        <div className="flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600 dark:text-slate-300">
            <ListChecks className="h-3.5 w-3.5" />
            Review change
          </span>
          <span className="rounded-full border border-blue-300/60 bg-blue-50/80 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.06em] text-blue-700 dark:border-blue-700/60 dark:bg-blue-950/30 dark:text-blue-200">
            {entityBadgeLabel}
          </span>
          {plannedStepCount ? (
            <span className="rounded-full border border-indigo-200/80 bg-indigo-50 px-2.5 py-0.5 text-[11px] font-medium text-indigo-700 dark:border-indigo-800/70 dark:bg-indigo-950/35 dark:text-indigo-200">
              {plannedStepCount} planned step{plannedStepCount === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>

      <div className="artifact-build-section artifact-build-section-1 space-y-4 px-5 py-4">
        <div className="space-y-1 rounded-xl border border-black/[0.06] bg-gradient-to-br from-slate-50 to-white px-4 py-3 dark:border-white/[0.08] dark:from-slate-900/55 dark:to-slate-950/25">
          <h3 className="text-[15px] font-semibold leading-6 text-slate-900 dark:text-slate-100">{card.title}</h3>
          {card.subtitle ? (
            <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{card.subtitle}</p>
          ) : null}
        </div>

        {card.fields.length > 0 ? (
          <div className="rounded-xl border border-black/[0.06] bg-slate-50/80 px-4 py-3 dark:border-white/[0.08] dark:bg-slate-900/35">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
              <span className="h-1 w-2.5 shrink-0 rounded-full bg-violet-400/70 dark:bg-violet-500/80" />
              Main change
            </div>
            <div className="mt-2 space-y-2">
              {card.fields.map((field) => {
                const diff = splitDiffValue(field.value);
                return (
                  <div key={`${field.key}-${field.label}`} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200/75 bg-white/80 px-3 py-2.5 text-sm dark:border-slate-700/70 dark:bg-slate-900/35 sm:grid-cols-[minmax(112px,auto)_1fr] sm:items-center sm:gap-3">
                    <div className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600 dark:text-slate-300">{field.label}</div>
                    {diff ? (
                      <div className="flex flex-wrap items-center gap-2 text-slate-700 dark:text-slate-200">
                        <span className="rounded-md border border-slate-200/80 bg-slate-100/80 px-2 py-0.5 text-slate-500 line-through decoration-slate-400/50 dark:border-slate-600/60 dark:bg-slate-700/40 dark:text-slate-400 dark:decoration-slate-500/50">
                          {diff.before}
                        </span>
                        <ArrowRight className="h-3.5 w-3.5 shrink-0 text-violet-400 dark:text-violet-400" />
                        <span className="rounded-md border border-violet-300/80 bg-violet-50 px-2 py-0.5 font-semibold text-violet-800 dark:border-violet-600/60 dark:bg-violet-900/50 dark:text-violet-100">
                          {diff.after}
                        </span>
                      </div>
                    ) : (
                      <div className="break-words text-slate-700 dark:text-slate-200">{field.value}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {card.contentPreview && contentLines.length > 0 ? (
          <div className="rounded-xl border border-black/[0.06] bg-white/85 px-4 py-3 dark:border-white/[0.08] dark:bg-slate-900/30">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                <span className="h-1 w-2.5 shrink-0 rounded-full bg-violet-400/70 dark:bg-violet-500/80" />
                {normalizeContentLabel(card.contentPreview.label)}
              </div>
              <div className="rounded-full border border-violet-200/70 bg-violet-50 px-2.5 py-0.5 text-[11px] font-medium text-violet-700 dark:border-violet-700/50 dark:bg-violet-900/30 dark:text-violet-300">
                {contentLines.length} item{contentLines.length === 1 ? "" : "s"}
              </div>
            </div>
            {impactCards.length > 0 ? (
              <div className="mt-2 grid grid-cols-1 gap-2 lg:grid-cols-2">
                {impactCards.map((cardItem, idx) => {
                  const tone = impactToneClasses(cardItem.tone);
                  const label = singularizeLabel(cardItem.title).slice(0, 2).toUpperCase();
                  return (
                    <div
                      key={`impact-card-${cardItem.key}-${idx}`}
                      className="flex items-center gap-3 rounded-lg border border-slate-200/75 bg-slate-50/75 px-3 py-2.5 dark:border-slate-700/70 dark:bg-slate-900/35"
                    >
                      <span className={cx("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-[11px] font-semibold", tone.iconWrap, tone.iconText)}>
                        {label || <FileText className="h-3.5 w-3.5" />}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {cardItem.title}
                        </div>
                        <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                          {cardItem.subtitle}
                        </div>
                      </div>
                      <span className={cx("inline-flex min-w-[2.1rem] items-center justify-center rounded-full border px-2 py-0.5 text-sm font-semibold", tone.countChip)}>
                        {cardItem.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : null}
            {contextLines.length > 0 ? (
              <div className={cx("mt-3 space-y-2", impactCards.length > 0 ? "border-t border-slate-200/70 pt-3 dark:border-slate-700/70" : "")}>
                <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                  <span className="h-1 w-2.5 shrink-0 rounded-full bg-slate-400/60 dark:bg-slate-500/70" />
                  Additional context
                </div>
                <ol className="space-y-1.5">
                  {contextLines.map((line, idx) => (
                    <li
                      key={`context-line-${idx}`}
                      className="flex items-start gap-2 rounded-md border border-slate-200/70 bg-slate-50/70 px-2.5 py-2 text-sm text-slate-700 dark:border-slate-700/70 dark:bg-slate-900/30 dark:text-slate-200"
                    >
                      <span className="inline-flex h-4.5 w-4.5 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-[10px] font-semibold text-slate-600 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        {idx + 1}
                      </span>
                      <span>{line}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}
          </div>
        ) : null}

        {uiState === "expired" ? (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-200">
            This confirmation expired. Ask the assistant to prepare it again.
          </div>
        ) : null}

        {uiState === "stale" ? (
          <div className="rounded-xl border border-amber-200/70 bg-amber-50/90 px-3 py-2.5 text-sm text-amber-900 dark:border-amber-800/60 dark:bg-amber-950/25 dark:text-amber-200">
            This confirmation is no longer current. Please ask the assistant to prepare the change again.
          </div>
        ) : null}

        {errorMessage && uiState === "failed" ? (
          <div className="rounded-xl border border-rose-200/70 bg-gradient-to-r from-rose-50/90 to-rose-100/70 px-3 py-2.5 text-sm text-rose-900 dark:border-rose-800/60 dark:from-rose-950/25 dark:to-rose-950/15 dark:text-rose-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{errorMessage}</span>
            </div>
          </div>
        ) : null}
      </div>

      {showPendingBar ? (
        <div className="agent-artifact-footer artifact-build-section artifact-build-section-3 flex-wrap gap-2 border-t border-black/[0.05] bg-slate-50/65 px-5 py-3 dark:border-white/[0.06] dark:bg-slate-900/35">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-block h-1.5 w-1.5 rounded-full bg-slate-400 dark:bg-slate-500" />
            {card.warningHint}
          </div>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={onDecline}
              disabled={uiState === "submitting"}
              className="agent-action-btn agent-action-btn-secondary disabled:cursor-not-allowed disabled:opacity-60"
            >
              {card.cancelLabel}
            </button>
            <button
              type="button"
              onClick={showRetry ? onRetry : onConfirm}
              disabled={uiState === "submitting"}
              className="agent-action-btn agent-action-btn-primary min-w-[132px] justify-center disabled:cursor-not-allowed disabled:opacity-70"
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
        <div className="border-t border-black/[0.05] px-5 py-2 text-[11px] text-slate-500 dark:border-white/[0.06] dark:text-slate-400">
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
        className={cx("artifact-build agent-artifact-card is-proposal overflow-visible", tone.wrap)}
        data-testid="decision-confirmation-panel"
        data-tone={viewModel.toneVariant}
        data-state={uiState}
      >
        <div className="artifact-build-header agent-artifact-header agent-artifact-header-proposal flex items-center justify-between gap-3 px-5 py-4">
          <div className="flex items-center gap-2.5">
            {toneLabel ? (
              <span className="rounded-md border border-amber-300/50 bg-amber-50 px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-amber-700 dark:border-amber-700/40 dark:bg-amber-900/20 dark:text-amber-300">
                {toneLabel}
              </span>
            ) : (
              <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500 dark:text-slate-400">
                Confirmation
              </span>
            )}
          </div>
          <span className="rounded-md border border-black/[0.08] bg-white px-2 py-1 text-[11px] font-medium text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
            {viewModel.toneVariant === "destructive" ? "Not reversible" : "Can be adjusted later"}
          </span>
        </div>

        <div className="artifact-build-section artifact-build-section-1 space-y-3 px-5 py-4">
          <div className="space-y-1">
            <h3 className="text-sm font-semibold leading-5 text-slate-900 dark:text-slate-100">
              {viewModel.headline}
            </h3>
            {showDescription ? (
              <p className="text-sm leading-5 text-slate-600 dark:text-slate-300">{viewModel.description}</p>
            ) : null}
          </div>

          <div className={cx("space-y-3 rounded-xl border p-3", tone.subtle)}>
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
            <div className="agent-artifact-footer artifact-build-section artifact-build-section-3 -mx-5 -mb-4 mt-1 flex-wrap gap-2 border-t border-black/[0.05] px-5 py-3 dark:border-white/[0.06]">
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
  const card = viewModel.card || toStructuredCardFromLegacyViewModel(viewModel);
  if (!card) {
    return <LegacyPanel {...props} />;
  }
  return (
    <StructuredProposalCard
      card={card}
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
