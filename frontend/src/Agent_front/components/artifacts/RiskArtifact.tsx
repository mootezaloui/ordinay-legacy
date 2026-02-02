import { Shield, AlertTriangle, Clock, Link2, FileWarning, CircleDot } from "lucide-react";
import type { RiskAnalysisOutput, RiskItem } from "../../../services/api/agent";

interface RiskArtifactProps {
  data: RiskAnalysisOutput;
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string }> = {
  CRITICAL: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
  },
  HIGH: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
  },
  MEDIUM: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
  },
  LOW: {
    bg: "bg-slate-50 dark:bg-slate-800/50",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
  },
};

const CATEGORY_ICONS: Record<string, typeof Clock> = {
  DEADLINE: Clock,
  DEPENDENCY: Link2,
  MISSING_DOCUMENT: FileWarning,
};

function getSeverityStyle(severity: string) {
  return SEVERITY_STYLES[severity] || SEVERITY_STYLES.LOW;
}

/**
 * Renders a risk analysis as a structured report.
 * Grouped by severity, each risk is its own card — no prose wrappers.
 */
export function RiskArtifact({ data }: RiskArtifactProps) {
  const overallStyle = getSeverityStyle(data.overallRiskLevel);

  // Group risks by severity in order: CRITICAL → HIGH → MEDIUM → LOW
  const severityOrder = ["CRITICAL", "HIGH", "MEDIUM", "LOW"];
  const grouped = severityOrder
    .map((sev) => ({
      severity: sev,
      risks: (data.risks || []).filter((r) => r.severity === sev),
    }))
    .filter((g) => g.risks.length > 0);

  return (
    <div className="artifact-enter rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 bg-slate-50 dark:bg-slate-800/80 border-b border-slate-200 dark:border-slate-700">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            Risk Analysis
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className={`text-xs font-semibold px-2 py-0.5 rounded border ${overallStyle.bg} ${overallStyle.text} ${overallStyle.border}`}>
            {data.overallRiskLevel}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {data.risks?.length || 0} risk{(data.risks?.length || 0) !== 1 ? "s" : ""}
          </span>
        </div>
      </div>

      {/* Summary sentence if provided */}
      {data.summary && (
        <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700/50">
          <p className="text-sm text-slate-700 dark:text-slate-300">{data.summary}</p>
        </div>
      )}

      {/* Risks grouped by severity */}
      <div className="px-5 py-4 space-y-4">
        {grouped.map((group) => {
          const style = getSeverityStyle(group.severity);
          return (
            <div key={group.severity}>
              <div className="flex items-center gap-2 mb-2">
                <span className={`w-2 h-2 rounded-full ${style.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
                  {group.severity}
                </span>
                <span className="text-xs text-slate-400">({group.risks.length})</span>
              </div>
              <div className="space-y-2">
                {group.risks.map((risk: RiskItem, idx: number) => {
                  const IconComponent = CATEGORY_ICONS[risk.category] || AlertTriangle;
                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded border ${style.border} ${style.bg}`}
                    >
                      <div className="flex items-start gap-2">
                        <IconComponent className={`w-3.5 h-3.5 mt-0.5 ${style.text} flex-shrink-0`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase">
                              {risk.category.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-800 dark:text-slate-200">
                            {risk.description}
                          </p>
                          {risk.recommendation && (
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5 pl-3 border-l-2 border-slate-200 dark:border-slate-600">
                              {risk.recommendation}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-5 py-2 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-700 flex items-center gap-3">
        <CircleDot className="w-3 h-3 text-slate-400" />
        <span className="text-xs text-slate-400 dark:text-slate-500">
          Rule-based analysis · Requires validation
        </span>
      </div>
    </div>
  );
}
