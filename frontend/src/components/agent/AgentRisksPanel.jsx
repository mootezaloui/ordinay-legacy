/**
 * Agent Risks Panel
 *
 * Phase C.2 - Operational signals, not alerts. Neutral colors, factual tone.
 *
 * Displays operational risks in categorized lists:
 * - Grouped by severity (HIGH -> MEDIUM -> LOW)
 * - Category badges
 * - Factual descriptions
 *
 * Following render contract rules from Phase C.0
 * System awareness, not AI warnings
 */

export default function AgentRisksPanel({ risks, status }) {
  if (!risks || risks.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-3">
          <span className="text-2xl font-semibold">OK</span>
        </div>
        <p className="text-gray-700 font-medium dark:text-slate-200">
          No operational risks detected
        </p>
        <p className="text-sm text-gray-500 mt-2 dark:text-slate-400">
          System analysis completed with no concerns identified
        </p>
      </div>
    );
  }

  if (status !== "SUCCESS") {
    return (
      <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800">
        <p className="text-red-800 font-medium dark:text-red-100">
          Cannot display risks: Status is {status}
        </p>
      </div>
    );
  }

  const groupedBySeverity = {
    HIGH: risks.filter((r) => r.severity === "HIGH"),
    MEDIUM: risks.filter((r) => r.severity === "MEDIUM"),
    LOW: risks.filter((r) => r.severity === "LOW"),
  };

  const totalCount = risks.length;
  const highCount = groupedBySeverity.HIGH.length;
  const mediumCount = groupedBySeverity.MEDIUM.length;
  const lowCount = groupedBySeverity.LOW.length;

  const getSeverityConfig = (severity) => {
    switch (severity) {
      case "HIGH":
        return {
          label: "Attention Required",
          borderColor: "border-slate-400",
          bgColor: "bg-slate-50",
          badgeColor: "bg-slate-600 text-white",
          darkBg: "dark:bg-slate-900",
          darkBorder: "dark:border-slate-600",
        };
      case "MEDIUM":
        return {
          label: "Monitor",
          borderColor: "border-gray-400",
          bgColor: "bg-gray-50",
          badgeColor: "bg-gray-500 text-white",
          darkBg: "dark:bg-slate-900",
          darkBorder: "dark:border-slate-600",
        };
      case "LOW":
        return {
          label: "For Reference",
          borderColor: "border-gray-300",
          bgColor: "bg-gray-50",
          badgeColor: "bg-gray-400 text-white",
          darkBg: "dark:bg-slate-900",
          darkBorder: "dark:border-slate-600",
        };
      default:
        return {
          label: severity,
          borderColor: "border-gray-300",
          bgColor: "bg-gray-50",
          badgeColor: "bg-gray-400 text-white",
          darkBg: "dark:bg-slate-900",
          darkBorder: "dark:border-slate-600",
        };
    }
  };

  const renderRiskItem = (risk, index) => {
    const config = getSeverityConfig(risk.severity);

    return (
      <div
        key={index}
        className={`border-l-4 ${config.borderColor} ${config.bgColor} ${config.darkBg} ${config.darkBorder} rounded-r p-4 mb-3`}
      >
        <div className="flex items-center gap-2 mb-3">
          <span className="px-2 py-1 bg-white border border-gray-300 rounded text-xs font-semibold text-gray-700 uppercase tracking-wide dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100">
            {risk.category}
          </span>
          <span className={`px-2 py-1 rounded text-xs font-semibold ${config.badgeColor}`}>
            {config.label}
          </span>
        </div>

        <p className="text-sm text-gray-800 mb-3 leading-relaxed dark:text-slate-100">
          {risk.description}
        </p>

        {risk.affected_entities && risk.affected_entities.length > 0 && (
          <div className="mb-2">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 dark:text-slate-400">
              Affected Entities
            </div>
            <div className="flex flex-wrap gap-2">
              {risk.affected_entities.map((entity, idx) => (
                <span
                  key={idx}
                  className="px-2 py-1 bg-white border border-gray-300 rounded text-xs text-gray-700 dark:bg-slate-800 dark:border-slate-600 dark:text-slate-100"
                >
                  {entity.type} #{entity.id}
                  {entity.name && `: ${entity.name}`}
                </span>
              ))}
            </div>
          </div>
        )}

        {risk.risk_score && (
          <div className="text-xs text-gray-500 mt-2 dark:text-slate-400">
            <span className="font-semibold">Score:</span> {(risk.risk_score * 100).toFixed(0)}%
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <div className="mb-5 pb-4 border-b border-gray-200 dark:border-slate-700">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 dark:text-slate-100">
          Operational Risk Analysis
        </h3>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold text-gray-800 dark:text-slate-100">
              {totalCount}
            </span>
            <span className="text-sm text-gray-600 dark:text-slate-300">
              total signals
            </span>
          </div>
          {highCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-slate-600"></div>
              <span className="text-xs font-medium text-gray-700 dark:text-slate-200">
                {highCount} attention
              </span>
            </div>
          )}
          {mediumCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-500"></div>
              <span className="text-xs font-medium text-gray-700 dark:text-slate-200">
                {mediumCount} monitor
              </span>
            </div>
          )}
          {lowCount > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-gray-400"></div>
              <span className="text-xs font-medium text-gray-700 dark:text-slate-200">
                {lowCount} reference
              </span>
            </div>
          )}
        </div>
      </div>

      {["HIGH", "MEDIUM", "LOW"].map((severity) => {
        const risksInGroup = groupedBySeverity[severity];
        if (risksInGroup.length === 0) return null;

        const config = getSeverityConfig(severity);

        return (
          <div key={severity} className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 uppercase tracking-wide dark:text-slate-200">
              {config.label} ({risksInGroup.length})
            </h4>
            {risksInGroup.map(renderRiskItem)}
          </div>
        );
      })}

      <div className="mt-6 pt-4 border-t border-gray-200 text-xs text-gray-500 dark:border-slate-700 dark:text-slate-400">
        <p>
          Analysis generated from system state. Review all signals and take appropriate action where needed.
        </p>
      </div>
    </div>
  );
}
