/**
 * Agent Transparency Panel
 *
 * Phase C.2 - Audit console with clear, readable transparency
 *
 * Zone C - RIGHT panel
 *
 * Responsibilities:
 * - Show what data the agent used
 * - Show what rules/constraints were applied
 * - Show agent ledger (request/response metadata)
 *
 * CRITICAL RULES:
 * - Read-only panel
 * - Cannot trigger actions
 * - Cannot influence agent behavior
 * - Shows transparency, NOT control
 */

import { useState } from "react";

export default function AgentTransparencyPanel({ agentResponse, agentLedger }) {
  const [activeTab, setActiveTab] = useState("data_used");

  const tabs = [
    { id: "data_used", label: "Data Used", icon: "DU" },
    { id: "rules_applied", label: "Rules Applied", icon: "RA" },
    { id: "agent_log", label: "Agent Log", icon: "AL" },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm h-full dark:bg-slate-800 dark:border-slate-700">
      <div className="p-4 border-b border-gray-200 bg-gray-50 dark:border-slate-700 dark:bg-slate-900">
        <h2 className="text-md font-bold text-gray-800 dark:text-slate-100">Transparency & Audit</h2>
        <p className="text-xs text-gray-600 mt-1 dark:text-slate-400">Read-only audit console</p>
      </div>

      <div className="flex border-b border-gray-200 dark:border-slate-700">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex-1 px-3 py-2.5 text-xs font-medium border-r border-gray-200 last:border-r-0 transition-colors dark:border-slate-700 ${
                isActive
                  ? "bg-white text-blue-700 border-b-2 border-blue-600 dark:bg-slate-800 dark:text-blue-200 dark:border-blue-500"
                  : "bg-gray-50 text-gray-600 hover:bg-gray-100 dark:bg-slate-900 dark:text-slate-300 dark:hover:text-white dark:hover:bg-slate-700"
              }`}
            >
              <div className="flex flex-col items-center gap-1">
                <span className="text-[10px] font-semibold">{tab.icon}</span>
                <span>{tab.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="p-4 overflow-y-auto max-h-[600px]">
        {activeTab === "data_used" && (
          <DataUsedTab agentResponse={agentResponse} />
        )}
        {activeTab === "rules_applied" && (
          <RulesAppliedTab agentResponse={agentResponse} />
        )}
        {activeTab === "agent_log" && (
          <AgentLogTab agentLedger={agentLedger} />
        )}
      </div>
    </div>
  );
}

function DataUsedTab({ agentResponse }) {
  if (!agentResponse) {
    return (
      <div className="text-center py-8 text-gray-500 text-xs dark:text-slate-400">
        No data available. Submit a request first.
      </div>
    );
  }

  const sources = agentResponse.explanation?.sources || [];
  const riskEntities = agentResponse.risks?.flatMap(
    (risk) => risk.affected_entities || []
  );
  const proposalEntities = agentResponse.actionProposals?.flatMap(
    (proposal) => proposal.affectedEntities || []
  );

  const allEntities = [
    ...(riskEntities || []),
    ...(proposalEntities || []),
  ].filter(Boolean);

  const uniqueEntities = Array.from(
    new Map(
      allEntities.map((entity) => [`${entity.type}-${entity.id}`, entity])
    ).values()
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1 dark:text-slate-400">
          Request ID
        </div>
        <div className="p-2 bg-gray-50 border border-gray-200 rounded text-xs font-mono text-gray-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {agentResponse.requestId}
        </div>
      </div>

      {sources.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Data Sources ({sources.length})
          </div>
          <div className="space-y-2">
            {sources.map((source, index) => (
              <div
                key={index}
                className="p-2 bg-gray-50 border border-gray-200 rounded text-xs dark:bg-slate-900 dark:border-slate-700"
              >
                <div className="font-semibold text-gray-700 dark:text-slate-100">{source.type}</div>
                <div className="text-gray-600 mt-0.5 dark:text-slate-300">ID: {source.id}</div>
                {source.description && (
                  <div className="text-gray-500 mt-0.5 dark:text-slate-400">{source.description}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {uniqueEntities.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Affected Entities ({uniqueEntities.length})
          </div>
          <div className="flex flex-wrap gap-2">
            {uniqueEntities.map((entity, index) => (
              <div
                key={index}
                className="px-2 py-1 bg-white border border-gray-300 rounded text-xs dark:bg-slate-900 dark:border-slate-700"
              >
                <span className="font-semibold text-gray-700 dark:text-slate-100">{entity.type}</span>
                <span className="text-gray-500 mx-1 dark:text-slate-400">|</span>
                <span className="text-gray-600 dark:text-slate-200">#{entity.id}</span>
                {entity.name && (
                  <>
                    <span className="text-gray-500 mx-1 dark:text-slate-400">|</span>
                    <span className="text-gray-600 dark:text-slate-200">{entity.name}</span>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {sources.length === 0 && uniqueEntities.length === 0 && (
        <div className="text-center py-8 text-gray-500 text-xs dark:text-slate-400">
          No explicit data sources identified
        </div>
      )}
    </div>
  );
}

function RulesAppliedTab({ agentResponse }) {
  if (!agentResponse) {
    return (
      <div className="text-center py-8 text-gray-500 text-xs dark:text-slate-400">
        No agent response yet. Submit a request to see rules applied.
      </div>
    );
  }

  const { agentVersion, status, blockingReason, explanation, actionProposals } =
    agentResponse;

  const requiresValidation = explanation?.requires_validation || false;
  const blockedProposals =
    actionProposals?.filter((p) => p.status === "BLOCKED") || [];

  return (
    <div className="space-y-4">
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Agent Version
        </div>
        <div className="p-2 bg-gray-50 border border-gray-200 rounded text-sm font-mono font-semibold text-gray-800 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
          {agentVersion}
        </div>
        <div className="mt-1.5 text-xs text-gray-600 leading-relaxed dark:text-slate-300">
          {agentVersion === "v1" &&
            "v1: Read-only. No execution, no tool calls."}
          {agentVersion === "v2" &&
            "v2: Proposal-only. Can propose actions, requires confirmation."}
          {agentVersion === "v3" &&
            "v3: Execution-enabled with confirmation flow."}
        </div>
      </div>

      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
          Response Status
        </div>
        <div
          className={`p-2 border rounded text-xs font-semibold font-mono ${
            status === "SUCCESS"
              ? "bg-green-50 border-green-300 text-green-800 dark:bg-green-900/30 dark:border-green-800 dark:text-green-100"
              : status === "BLOCKED"
              ? "bg-red-50 border-red-300 text-red-800 dark:bg-red-900/30 dark:border-red-800 dark:text-red-100"
              : "bg-yellow-50 border-yellow-300 text-yellow-800 dark:bg-yellow-900/30 dark:border-yellow-800 dark:text-yellow-100"
          }`}
        >
          {status}
        </div>
      </div>

      {blockingReason && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Blocking Reason
          </div>
          <div className="p-3 bg-red-50 border border-red-300 rounded dark:bg-red-900/30 dark:border-red-800">
            <div className="text-xs text-red-800 leading-relaxed dark:text-red-100">
              {blockingReason}
            </div>
          </div>
        </div>
      )}

      {requiresValidation && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Validation Requirements
          </div>
          <div className="p-3 bg-amber-50 border border-amber-300 rounded dark:bg-amber-900/40 dark:border-amber-700">
            <div className="flex items-start gap-2">
              <span className="text-amber-600">!</span>
              <div className="text-xs text-amber-800 leading-relaxed dark:text-amber-100">
                This response requires human validation before use
              </div>
            </div>
          </div>
        </div>
      )}

      {blockedProposals.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 dark:text-slate-400">
            Blocked Proposals ({blockedProposals.length})
          </div>
          <div className="space-y-2">
            {blockedProposals.map((proposal) => (
              <div
                key={proposal.proposalId}
                className="p-2 bg-gray-50 border border-gray-200 rounded dark:bg-slate-900 dark:border-slate-700"
              >
                <div className="font-mono text-xs font-semibold text-gray-700 dark:text-slate-100">
                  {proposal.actionType}
                </div>
                <div className="text-xs text-gray-600 mt-1 dark:text-slate-300">
                  {proposal.blockingReason}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {!blockingReason &&
        !requiresValidation &&
        blockedProposals.length === 0 && (
          <div className="text-center py-6 text-gray-500 text-xs dark:text-slate-400">
            No blocking constraints applied in this response.
          </div>
        )}
    </div>
  );
}

function AgentLogTab({ agentLedger }) {
  if (!agentLedger || agentLedger.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500 text-xs dark:text-slate-400">
        No agent log entries yet. Submit a request to see agent activity.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {agentLedger.map((entry) => (
        <div key={entry.id} className="bg-gray-50 border border-gray-200 rounded p-3 dark:bg-slate-900 dark:border-slate-700">
          <div className="flex justify-between items-start mb-3 pb-2 border-b border-gray-200 dark:border-slate-700">
            <div className="font-mono text-xs font-semibold text-gray-800 dark:text-slate-100">
              {entry.type}
            </div>
            <div className="text-xs text-gray-500 dark:text-slate-400">
              {new Date(entry.timestamp).toLocaleString()}
            </div>
          </div>

          <div className="space-y-2 text-xs">
            {entry.requestId && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 min-w-[80px] dark:text-slate-400">
                  Request ID:
                </span>
                <span className="font-mono text-gray-700 break-all dark:text-slate-100">
                  {entry.requestId}
                </span>
              </div>
            )}
            {entry.intent && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 min-w-[80px] dark:text-slate-400">
                  Intent:
                </span>
                <span className="font-mono text-gray-700 dark:text-slate-100">{entry.intent}</span>
              </div>
            )}
            {entry.contextScope && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 min-w-[80px] dark:text-slate-400">
                  Context:
                </span>
                <span className="font-mono text-gray-700 dark:text-slate-100">
                  {entry.contextScope}
                </span>
              </div>
            )}
            {entry.status && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 min-w-[80px] dark:text-slate-400">
                  Status:
                </span>
                <span className="font-mono text-gray-700 dark:text-slate-100">{entry.status}</span>
              </div>
            )}
            {entry.blockingReason && (
              <div className="flex items-start gap-2">
                <span className="font-semibold text-gray-500 min-w-[80px] dark:text-slate-400">
                  Blocked:
                </span>
                <span className="text-red-700 text-xs dark:text-red-200">
                  {entry.blockingReason}
                </span>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
