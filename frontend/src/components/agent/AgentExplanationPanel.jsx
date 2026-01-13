/**
 * Agent Explanation Panel
 *
 * Phase C.2 - Clean, readable explanations with clear structure
 *
 * Displays agent explanations in structured format:
 * - Summary (heading)
 * - Details (list)
 * - Sources (data references)
 * - Metadata (footer)
 *
 * Following render contract rules from Phase C.0
 */

export default function AgentExplanationPanel({ explanation, status }) {
  if (!explanation) {
    return (
      <div className="text-center py-12">
        <div className="text-slate-400 mb-3">
          <span className="text-2xl font-semibold">[ ]</span>
        </div>
        <p className="text-slate-700 font-medium dark:text-slate-200">
          No explanation available
        </p>
        <p className="text-sm text-slate-500 mt-2 dark:text-slate-400">
          Submit a request to receive an agent explanation
        </p>
      </div>
    );
  }

  if (status !== "SUCCESS") {
    return (
      <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800">
        <p className="text-red-800 font-medium dark:text-red-100">
          Cannot display explanation: Status is {status}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-gray-800 mb-3 dark:text-slate-100">
          Agent Explanation
        </h3>
      </div>

      {explanation.requires_validation && (
        <div className="mb-5 p-3 bg-amber-50 border-l-4 border-amber-400 rounded dark:bg-amber-900/40 dark:border-amber-700">
          <div className="flex items-start">
            <span className="text-amber-600 font-bold mr-2">!</span>
            <div>
              <p className="text-amber-900 font-semibold text-sm dark:text-amber-100">
                Validation required
              </p>
              <p className="text-amber-800 text-xs mt-1 dark:text-amber-100">
                This explanation should be reviewed before relying on it for decisions
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Summary
        </div>
        <div className="p-4 bg-blue-50 border-l-4 border-blue-400 rounded dark:bg-blue-900/30 dark:border-blue-700">
          <p className="text-gray-800 leading-relaxed dark:text-slate-100">
            {explanation.summary || "No summary available"}
          </p>
        </div>
      </div>

      <div className="mb-5">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Details
        </div>
        {explanation.details && explanation.details.length > 0 ? (
          <ul className="space-y-2">
            {explanation.details.map((detail, index) => (
              <li
                key={index}
                className="flex items-start gap-3 p-3 bg-gray-50 border border-gray-200 rounded-md dark:bg-slate-900 dark:border-slate-700"
              >
                <span className="flex-shrink-0 w-6 h-6 flex items-center justify-center bg-blue-600 text-white text-xs font-semibold rounded-full">
                  {index + 1}
                </span>
                <span className="text-sm text-gray-800 leading-relaxed dark:text-slate-100">
                  {detail}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500 italic dark:text-slate-400">
            No details provided
          </p>
        )}
      </div>

      {explanation.sources && explanation.sources.length > 0 && (
        <div className="mb-5">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Data Sources
          </div>
          <div className="flex flex-wrap gap-2">
            {explanation.sources.map((source, index) => (
              <div
                key={index}
                className="px-3 py-2 bg-white border border-gray-300 rounded-md text-xs dark:bg-slate-900 dark:border-slate-700"
              >
                <span className="font-semibold text-gray-700 dark:text-slate-100">
                  {source.type}
                </span>
                <span className="text-gray-500 mx-1 dark:text-slate-400">|</span>
                <span className="text-gray-600 dark:text-slate-200">
                  ID {source.id}
                </span>
                {source.description && (
                  <>
                    <span className="text-gray-500 mx-1 dark:text-slate-400">|</span>
                    <span className="text-gray-600 dark:text-slate-200">
                      {source.description}
                    </span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Generated:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {explanation.timestamp
                ? new Date(explanation.timestamp).toLocaleString()
                : "Unknown"}
            </span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Source:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {explanation.source || "rule-based"}
            </span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Confidence:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {explanation.confidence
                ? `${(explanation.confidence * 100).toFixed(0)}%`
                : "N/A"}
            </span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Entity:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {explanation.entityType} #{explanation.entityId}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
