import { AlertTriangle, AlertCircle, Info, CheckCircle } from "lucide-react";
import type { InterpretationBlock as InterpretationBlockType } from "../../../services/api/agent";

interface InterpretationBlockProps {
  interpretation: InterpretationBlockType;
}

const levelConfig = {
  critical: {
    icon: AlertTriangle,
    borderColor: "border-l-red-500",
    bgColor: "bg-red-50 dark:bg-red-950/30",
    iconColor: "text-red-500",
    labelColor: "text-red-700 dark:text-red-400",
  },
  warning: {
    icon: AlertCircle,
    borderColor: "border-l-amber-500",
    bgColor: "bg-amber-50 dark:bg-amber-950/30",
    iconColor: "text-amber-500",
    labelColor: "text-amber-700 dark:text-amber-400",
  },
  info: {
    icon: Info,
    borderColor: "border-l-blue-500",
    bgColor: "bg-blue-50 dark:bg-blue-950/30",
    iconColor: "text-blue-500",
    labelColor: "text-blue-700 dark:text-blue-400",
  },
  neutral: {
    icon: CheckCircle,
    borderColor: "border-l-neutral-400",
    bgColor: "bg-black/[0.03] dark:bg-white/[0.04]",
    iconColor: "text-slate-400",
    labelColor: "text-slate-600 dark:text-slate-400",
  },
};

/**
 * Renders the interpretation section when meaningful signals exist.
 *
 * Interpretation is suppressed if there is nothing meaningful to say.
 */
export function InterpretationBlock({ interpretation }: InterpretationBlockProps) {
  if (!interpretation || !Array.isArray(interpretation.statements) || interpretation.statements.length === 0) {
    return null;
  }

  const hasCritical = interpretation.statements.some((s) => s.level === "critical");
  const hasWarning = interpretation.statements.some((s) => s.level === "warning");
  const summaryText = String(interpretation.summary || "").trim();

  // Summary styling based on urgency
  const summaryStyle = hasCritical
    ? "text-red-700 dark:text-red-400 font-medium"
    : hasWarning
      ? "text-amber-700 dark:text-amber-400 font-medium"
      : "text-slate-600 dark:text-slate-400";

  return (
    <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.05]">
      {/* Section header */}
      <div className="flex items-center gap-2 mb-3">
        {hasCritical ? (
          <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
        ) : hasWarning ? (
          <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
        ) : (
          <Info className="w-3.5 h-3.5 text-slate-400" />
        )}
        <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Interpretation
        </span>
        {summaryText && (
          <span className={`text-xs ml-auto ${summaryStyle}`}>
            {summaryText}
          </span>
        )}
      </div>

      {/* Interpretation statements - appear with staggered animation */}
      <div className="space-y-2">
        {interpretation.statements.map((stmt, idx) => {
          const config = levelConfig[stmt.level] || levelConfig.neutral;
          const IconComponent = config.icon;

          return (
            <div
              key={idx}
              className={`artifact-build-statement flex gap-2.5 px-3 py-2.5 rounded-lg border-l-[3px] ${config.borderColor} ${config.bgColor}`}
            >
              <IconComponent
                className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${config.iconColor}`}
              />
              <div className="min-w-0 flex-1">
                <p className={`text-[13px] font-medium leading-snug ${config.labelColor}`}>
                  {stmt.statement}
                </p>
                {stmt.implication && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed">
                    {stmt.implication}
                  </p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
