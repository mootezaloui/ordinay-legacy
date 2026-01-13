/**
 * Agent Drafts Panel
 *
 * Phase C.2 - Emphasize structure, review requirement, non-final status
 *
 * Displays drafts with section-by-section rendering:
 * - Header section
 * - Body section
 * - Footer section
 * - Metadata (type, tone, status, requiresValidation)
 *
 * Following render contract rules from Phase C.0
 * NO free-text rendering, NO markdown parsing, NO "Send" buttons
 */

export default function AgentDraftsPanel({ drafts, status }) {
  if (!drafts || drafts.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="text-gray-400 mb-3">
          <span className="text-2xl font-semibold">DR</span>
        </div>
        <p className="text-gray-700 font-medium dark:text-slate-200">
          No drafts prepared
        </p>
        <p className="text-sm text-gray-500 mt-2 dark:text-slate-400">
          Select a draft intent and submit a request to generate drafts
        </p>
      </div>
    );
  }

  if (status !== "SUCCESS") {
    return (
      <div className="px-4 py-3 bg-red-50 border border-red-200 rounded-lg dark:bg-red-900/30 dark:border-red-800">
        <p className="text-red-800 font-medium dark:text-red-100">
          Cannot display drafts: Status is {status}
        </p>
      </div>
    );
  }

  const handleCopy = (draft) => {
    const fullText = `${draft.sections?.header || ""}\n\n${
      draft.sections?.body || ""
    }\n\n${draft.sections?.footer || ""}`;
    navigator.clipboard.writeText(fullText);
  };

  const renderDraft = (draft, index) => (
    <div
      key={index}
      className="bg-white border-2 border-gray-200 rounded-lg p-5 mb-5 shadow-sm dark:bg-slate-800 dark:border-slate-700"
    >
      <div className="flex items-center justify-between mb-4 pb-3 border-b border-gray-200 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <span className="px-3 py-1 bg-blue-600 text-white text-sm font-semibold rounded">
            DRAFT
          </span>
          <span className="px-3 py-1 bg-gray-100 text-gray-700 text-sm font-medium rounded dark:bg-slate-900 dark:text-slate-200">
            {draft.type.replace(/_/g, " ")}
          </span>
        </div>
        <span className="text-xs text-gray-500 dark:text-slate-400">
          {draft.metadata?.source || "rule-based"}
        </span>
      </div>

      {draft.metadata?.requires_validation && (
        <div className="mb-4 p-3 bg-amber-50 border-l-4 border-amber-400 rounded dark:bg-amber-900/40 dark:border-amber-700">
          <div className="flex items-start">
            <span className="text-amber-600 font-bold mr-2">!</span>
            <div>
              <p className="text-amber-900 font-semibold text-sm dark:text-amber-100">
                Human validation required
              </p>
              <p className="text-amber-800 text-xs mt-1 dark:text-amber-100">
                This draft must be reviewed and approved before use. Agent-generated content requires verification.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-slate-400">
            Header
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500">Section 1 of 3</div>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-300 rounded-md whitespace-pre-wrap text-sm leading-relaxed dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {draft.sections?.header || "Unavailable"}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-slate-400">
            Body
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500">Section 2 of 3</div>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-300 rounded-md whitespace-pre-wrap text-sm leading-relaxed dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {draft.sections?.body || "Unavailable"}
        </div>
      </div>

      <div className="mb-4">
        <div className="flex items-center justify-between mb-2">
          <div className="text-xs font-bold text-gray-500 uppercase tracking-wider dark:text-slate-400">
            Footer
          </div>
          <div className="text-xs text-gray-400 dark:text-slate-500">Section 3 of 3</div>
        </div>
        <div className="p-4 bg-gray-50 border border-gray-300 rounded-md whitespace-pre-wrap text-sm leading-relaxed dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {draft.sections?.footer || "Unavailable"}
        </div>
      </div>

      <div className="flex gap-3 mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
        <button
          onClick={() => handleCopy(draft)}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 transition-colors"
          title="Copy all sections to clipboard"
        >
          Copy Draft
        </button>
        <button
          className="px-4 py-2 bg-gray-200 text-gray-500 text-sm font-medium rounded-md cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
          disabled
          title="Mark as reviewed (not yet implemented)"
        >
          Mark Reviewed
        </button>
      </div>

      <div className="mt-4 pt-4 border-t border-gray-200 dark:border-slate-700">
        <div className="grid grid-cols-2 gap-3 text-xs">
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Status:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">{draft.metadata?.status || "draft"}</span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Confidence:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {draft.metadata?.confidence
                ? `${(draft.metadata.confidence * 100).toFixed(0)}%`
                : "N/A"}
            </span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Language:</span>{" "}
            <span className="text-gray-700 uppercase dark:text-slate-100">
              {draft.metadata?.language || "unknown"}
            </span>
          </div>
          <div className="text-gray-500 dark:text-slate-400">
            <span className="font-semibold">Generated:</span>{" "}
            <span className="text-gray-700 dark:text-slate-100">
              {draft.metadata?.generated_at
                ? new Date(draft.metadata.generated_at).toLocaleString()
                : "Unknown"}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div>
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-slate-100">
          Agent Drafts
          <span className="ml-2 px-2 py-1 bg-blue-100 text-blue-700 text-sm font-semibold rounded dark:bg-blue-900/40 dark:text-blue-100">
            {drafts.length}
          </span>
        </h3>
        <p className="text-xs text-gray-500 dark:text-slate-400">
          Review all sections before use
        </p>
      </div>

      {drafts.map((draft, index) => renderDraft(draft, index))}
    </div>
  );
}
