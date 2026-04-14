import { Shield, AlertTriangle, Clock, Link2, FileWarning, CircleDot } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { RiskAnalysisOutput, RiskItem } from "../../../services/api/agent";

interface RiskArtifactProps {
  data: RiskAnalysisOutput;
}

const SEVERITY_STYLES: Record<string, { bg: string; text: string; border: string; dot: string; badge: string }> = {
  CRITICAL: {
    bg: "bg-red-50 dark:bg-red-950/30",
    text: "text-red-700 dark:text-red-300",
    border: "border-red-200 dark:border-red-800",
    dot: "bg-red-500",
    badge: "agent-status-badge-urgent",
  },
  HIGH: {
    bg: "bg-orange-50 dark:bg-orange-950/30",
    text: "text-orange-700 dark:text-orange-300",
    border: "border-orange-200 dark:border-orange-800",
    dot: "bg-orange-500",
    badge: "agent-status-badge-in-progress",
  },
  MEDIUM: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800",
    dot: "bg-amber-500",
    badge: "agent-status-badge-in-progress",
  },
  LOW: {
    bg: "bg-black/[0.03] dark:bg-white/[0.04]",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-black/[0.06] dark:border-white/[0.06]",
    dot: "bg-slate-400",
    badge: "agent-status-badge-pending",
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
  const { t } = useTranslation("common");
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
    <div className="artifact-build agent-artifact-card is-risk">
      {/* Header */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-risk flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-amber">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
              {t("agent.artifacts.riskAnalysis")}
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {t("agent.artifacts.risksIdentified", { count: data.risks?.length || 0 })}
            </p>
          </div>
        </div>
        <span className={`agent-status-badge ${overallStyle.badge}`}>
          <span className={`w-2 h-2 rounded-full ${overallStyle.dot}`} />
          {data.overallRiskLevel}
        </span>
      </div>

      {/* Summary sentence if provided */}
      {data.summary && (
        <div className="artifact-build-section artifact-build-section-1 px-5 py-4 border-b border-black/[0.05] dark:border-white/[0.05]">
          <p className="text-[15px] text-slate-700 dark:text-slate-200 leading-relaxed">{data.summary}</p>
        </div>
      )}

      {/* Risks grouped by severity */}
      <div className="px-5 py-5 space-y-5">
        {grouped.map((group, groupIdx) => {
          const style = getSeverityStyle(group.severity);
          return (
            <div key={group.severity} className={`artifact-build-section artifact-build-section-${groupIdx + 2}`}>
              <div className="flex items-center gap-2 mb-3">
                <span className={`w-2.5 h-2.5 rounded-full ${style.dot}`} />
                <span className={`text-xs font-semibold uppercase tracking-wider ${style.text}`}>
                  {group.severity}
                </span>
                <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                  ({group.risks.length})
                </span>
              </div>
              <div className="space-y-3">
                {group.risks.map((risk: RiskItem, idx: number) => {
                  const IconComponent = CATEGORY_ICONS[risk.category] || AlertTriangle;
                  return (
                    <div
                      key={idx}
                      className={`artifact-build-statement p-4 rounded-xl border ${style.border} ${style.bg}`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg ${style.bg} border ${style.border} flex items-center justify-center flex-shrink-0`}>
                          <IconComponent className={`w-4 h-4 ${style.text}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-semibold uppercase tracking-wide ${style.text}`}>
                              {risk.category.replace(/_/g, " ")}
                            </span>
                          </div>
                          <p className="text-sm text-slate-800 dark:text-slate-200 leading-relaxed">
                            {risk.description}
                          </p>
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
      <div className="agent-artifact-footer">
        <div className="flex items-center gap-2">
          <CircleDot className="w-3.5 h-3.5 text-slate-400" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {t("agent.artifacts.riskAnalysisFooter")}
          </span>
        </div>
      </div>
    </div>
  );
}
