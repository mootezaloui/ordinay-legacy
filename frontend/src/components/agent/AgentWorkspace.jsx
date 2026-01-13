/**
 * Agent Workspace (ZONE B)
 *
 * Phase C.2 - Clear tab navigation with professional styling
 *
 * Tab-based workspace with fixed tabs:
 * - Explanation
 * - Risks
 * - Drafts
 * - Proposals
 *
 * Plus structured input panel at bottom (NOT a chat interface)
 */

import AgentExplanationPanel from "./AgentExplanationPanel";
import AgentRisksPanel from "./AgentRisksPanel";
import AgentDraftsPanel from "./AgentDraftsPanel";
import AgentProposalsPanel from "./AgentProposalsPanel";
import AgentInputPanel from "./AgentInputPanel";

export default function AgentWorkspace({
  agentResponse,
  activeTab,
  onTabChange,
  onSubmitRequest,
  contextScope,
  language,
}) {
  const tabs = [
    { id: "explanation", label: "Explanation", icon: "EX" },
    { id: "risks", label: "Risks", icon: "RK" },
    { id: "drafts", label: "Drafts", icon: "DR" },
    { id: "proposals", label: "Proposals", icon: "PR" },
  ];

  const riskCount = agentResponse?.risks?.length || 0;
  const draftCount = agentResponse?.drafts?.length || 0;
  const proposalCount = agentResponse?.actionProposals?.length || 0;

  const getCounts = (tabId) => {
    switch (tabId) {
      case "risks":
        return riskCount;
      case "drafts":
        return draftCount;
      case "proposals":
        return proposalCount;
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm dark:bg-slate-800 dark:border-slate-700">
      <div className="border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex">
          {tabs.map((tab) => {
            const count = getCounts(tab.id);
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`
                  flex items-center gap-2 px-5 py-3 border-r border-gray-200 dark:border-slate-700
                  transition-colors duration-150 font-medium text-sm
                  ${
                    isActive
                      ? "bg-white text-blue-700 border-b-2 border-blue-600 dark:bg-slate-800 dark:text-blue-200 dark:border-blue-500"
                      : "text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700"
                  }
                `}
              >
                <span className="text-xs font-semibold">{tab.icon}</span>
                <span>{tab.label}</span>
                {count !== null && count > 0 && (
                  <span
                    className={`
                      ml-1 px-2 py-0.5 text-xs font-semibold rounded-full
                      ${
                        isActive
                          ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-100"
                          : "bg-gray-200 text-gray-600 dark:bg-slate-700 dark:text-slate-100"
                      }
                    `}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="p-6 min-h-[500px]">
        {activeTab === "explanation" && (
          <AgentExplanationPanel
            explanation={agentResponse?.explanation}
            status={agentResponse?.status}
          />
        )}

        {activeTab === "risks" && (
          <AgentRisksPanel
            risks={agentResponse?.risks}
            status={agentResponse?.status}
          />
        )}

        {activeTab === "drafts" && (
          <AgentDraftsPanel
            drafts={agentResponse?.drafts}
            status={agentResponse?.status}
          />
        )}

        {activeTab === "proposals" && (
          <AgentProposalsPanel
            actionProposals={agentResponse?.actionProposals}
            status={agentResponse?.status}
            blockingReason={agentResponse?.blockingReason}
          />
        )}
      </div>

      <div className="border-t border-gray-200 bg-gray-50 p-6 dark:border-slate-700 dark:bg-slate-900">
        <AgentInputPanel
          onSubmit={onSubmitRequest}
          contextScope={contextScope}
          language={language}
        />
      </div>
    </div>
  );
}
