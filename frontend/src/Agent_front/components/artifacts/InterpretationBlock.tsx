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
    borderColor: "border-l-slate-400",
    bgColor: "bg-slate-50 dark:bg-slate-800/50",
    iconColor: "text-slate-400",
    labelColor: "text-slate-600 dark:text-slate-400",
  },
};

/**
 * Renders the MANDATORY interpretation section.
 *
 * This is NOT optional. Every entity read MUST have interpretation.
 * The interpretation explains WHY the current state matters.
 */
export function InterpretationBlock({ interpretation }: InterpretationBlockProps) {
  const hasCritical = interpretation.statements.some((s) => s.level === "critical");
  const hasWarning = interpretation.statements.some((s) => s.level === "warning");

  // Summary styling based on urgency
  const summaryStyle = hasCritical
    ? "text-red-700 dark:text-red-400 font-medium"
    : hasWarning
      ? "text-amber-700 dark:text-amber-400 font-medium"
      : "text-slate-600 dark:text-slate-400";

  return (
    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
      {/* Section header */}
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
          Interpretation
        </span>
        <span className={`text-xs ${summaryStyle}`}>
          {interpretation.summary}
        </span>
      </div>

      {/* Interpretation statements */}
      <div className="space-y-2">
        {interpretation.statements.map((stmt, idx) => {
          const config = levelConfig[stmt.level] || levelConfig.neutral;
          const IconComponent = config.icon;

          return (
            <div
              key={idx}
              className={`flex gap-3 p-3 rounded-r border-l-2 ${config.borderColor} ${config.bgColor}`}
            >
              <IconComponent
                className={`w-4 h-4 flex-shrink-0 mt-0.5 ${config.iconColor}`}
              />
              <div className="min-w-0 flex-1 space-y-1">
                <p className={`text-sm font-medium ${config.labelColor}`}>
                  {stmt.statement}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  {stmt.implication}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
