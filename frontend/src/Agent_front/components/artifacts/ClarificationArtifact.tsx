import { HelpCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { ClarificationOutput, SemanticSignal } from "../../../services/api/agent";

interface ClarificationArtifactProps {
  data: ClarificationOutput;
  onConfirmWebSearch?: () => void;
}

function formatValue(value: string | number | null | undefined) {
  if (value === null || value === undefined || value === "") return "—";
  return String(value);
}

function renderSignal(signal: SemanticSignal) {
  if (signal.type === "INTENT_FRAMING") {
    return `INTENT_FRAMING:${signal.action}:${signal.entity}:${signal.scope}`;
  }
  if (signal.type === "EMPTY_RESULT") {
    return `EMPTY_RESULT:${formatValue(signal.entityType)}:${formatValue(signal.resultCount)}`;
  }
  if (signal.type === "MULTIPLE_RESULTS") {
    return `MULTIPLE_RESULTS:${formatValue(signal.entityType)}:${formatValue(signal.resultCount)}`;
  }
  if (signal.type === "AMBIGUOUS_SCOPE") {
    return `AMBIGUOUS_SCOPE:${formatValue(signal.entityType)}:${formatValue(signal.resultCount)}`;
  }
  if (signal.type === "MISSING_INFORMATION") {
    return `MISSING_INFORMATION:${formatValue(signal.entityType)}:${formatValue(signal.reason)}`;
  }
  if (signal.type === "CLARIFICATION_REQUIRED") {
    return `CLARIFICATION_REQUIRED:${formatValue(signal.entityType)}:${formatValue(signal.reason)}`;
  }
  return "CLARIFICATION_REQUIRED";
}

export function ClarificationArtifact({ data, onConfirmWebSearch }: ClarificationArtifactProps) {
  const { t } = useTranslation("common");
  const reasonType = data.reason?.type || "UNKNOWN";
  const entityType = data.reason?.entityType || null;
  const resultCount = data.reason?.resultCount;
  const hasOptions = Array.isArray(data.options) && data.options.length > 0;
  const hasSignals = Array.isArray(data.signals) && data.signals.length > 0;

  return (
    <div className="artifact-build agent-artifact-card">
      <div className="artifact-build-header agent-artifact-header flex items-center gap-2 px-5 py-3">
        <HelpCircle className="w-4 h-4 text-slate-500" />
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          {t("agent.artifacts.clarificationRequired")}
        </span>
      </div>

      <div className="artifact-build-section artifact-build-section-1 px-5 py-4 space-y-3">
        <div className="artifact-build-section artifact-build-section-2 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-600 dark:text-slate-300">
          <div className="flex flex-col gap-1">
            <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t("agent.artifacts.reason")}
            </span>
            <span className="font-semibold">{reasonType}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t("agent.artifacts.entity")}
            </span>
            <span className="font-semibold">{formatValue(entityType)}</span>
          </div>
          <div className="flex flex-col gap-1">
            <span className="uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t("agent.artifacts.resultCount")}
            </span>
            <span className="font-semibold">{formatValue(resultCount ?? null)}</span>
          </div>
        </div>

        {hasOptions && (
          <div className="artifact-build-section artifact-build-section-2 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t("agent.artifacts.options")}
            </span>
            <div className="flex flex-wrap gap-2">
              {data.options?.map((option, idx) => (
                <div
                  key={`${option.action}-${idx}`}
                  className="artifact-build-statement px-3 py-1.5 text-xs font-semibold rounded-full bg-black/[0.04] dark:bg-white/[0.05] text-slate-600 dark:text-slate-300"
                  style={{ animationDelay: `${0.3 + idx * 0.08}s` }}
                >
                  {option.action}
                </div>
              ))}
            </div>
          </div>
        )}

        {hasSignals && (
          <div className="artifact-build-section artifact-build-section-3 space-y-2">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {t("agent.artifacts.signals")}
            </span>
            <div className="flex flex-wrap gap-2">
              {data.signals?.map((signal, idx) => (
                <div
                  key={`${signal.type}-${idx}`}
                  className="artifact-build-statement px-3 py-1.5 text-xs rounded-full bg-[#f9fafb] dark:bg-[#0f172a] text-slate-500 dark:text-slate-400"
                  style={{ animationDelay: `${0.45 + idx * 0.08}s` }}
                >
                  {renderSignal(signal)}
                </div>
              ))}
            </div>
          </div>
        )}

        {reasonType === "EXTERNAL_SEARCH_CONFIRMATION_REQUIRED" && onConfirmWebSearch && (
          <div className="artifact-build-section artifact-build-section-3 pt-1">
            <button
              type="button"
              onClick={onConfirmWebSearch}
              className="px-3 py-2 rounded-lg text-xs font-semibold bg-[#0f172a] text-white dark:bg-[#f1f5f9] dark:text-[#0f172a]"
            >
              {t("agent.artifacts.searchTheWeb")}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
