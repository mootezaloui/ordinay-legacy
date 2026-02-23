import { useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Link2,
  Trash2,
  Unlink,
  XCircle,
  Zap,
} from "lucide-react";
import type { ActionProposal, ExecutionResult, ProposalOutput } from "../../../services/api/agent";
import { useData } from "../../../contexts/DataContext";

interface ProposalArtifactProps {
  data: ProposalOutput;
  onConfirm: (proposalId: string, options?: { ackRisk?: boolean }) => Promise<ExecutionResult>;
  onCancel: (proposalId: string) => void;
}

type ProposalStatus = "pending" | "confirming" | "confirmed" | "cancelled" | "failed";

interface ProposalState {
  status: ProposalStatus;
  error?: string;
  executionResult?: ExecutionResult;
}

interface DataContextLike {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{ id: number; lawsuitNumber?: string; title?: string; clientId?: number }>;
  lawsuits?: Array<{ id: number; lawsuitNumber?: string; title?: string; dossierId?: number }>;
  tasks?: Array<{ id: number; title?: string }>;
  sessions?: Array<{ id: number; title?: string; type?: string }>;
  missions?: Array<{ id: number; missionNumber?: string; title?: string }>;
  financialEntries?: Array<{ id: number; title?: string; description?: string }>;
}

const AGENT_MUTATION_EXECUTED_EVENT = "ordinay:agent-mutation-executed";

function emitExecutedMutationFromExecutionResult(execResult?: ExecutionResult) {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  if (!execResult || String(execResult.status || "").toLowerCase() !== "success") return;
  const mutation = execResult.executedActions?.[0]?.result as
    | { ok?: boolean; entityType?: string; entityId?: number | string }
    | undefined;
  if (!mutation || mutation.ok !== true) return;
  const entityType = String(mutation.entityType || "").trim().toLowerCase();
  const entityId = Number(mutation.entityId || 0);
  if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return;
  window.dispatchEvent(
    new CustomEvent(AGENT_MUTATION_EXECUTED_EVENT, {
      detail: {
        status: "EXECUTED",
        entityType,
        entityId,
        operation: "update",
      },
    }),
  );
}

function toTitleCase(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function labelForEntityType(entityType?: string) {
  const normalized = String(entityType || "").toLowerCase();
  if (!normalized) return "record";
  if (normalized === "financial_entry") return "financial entry";
  if (normalized === "personal_task") return "personal task";
  return toTitleCase(normalized).toLowerCase();
}

function labelForAttachmentType(attachmentType?: string) {
  const normalized = String(attachmentType || "").toLowerCase();
  if (!normalized) return "attachment";
  if (normalized === "generated_document") return "generated document";
  if (normalized === "doc_draft") return "draft document";
  if (normalized === "file_ref") return "file";
  return toTitleCase(normalized).toLowerCase();
}

function resolveEntityLabel(
  entityType: string | undefined,
  entityId: number | undefined,
  context: DataContextLike,
) {
  const type = String(entityType || "").toLowerCase();
  const id = Number(entityId);
  if (!Number.isFinite(id)) return null;

  if (type === "client") {
    const item = context.clients?.find((x) => Number(x.id) === id);
    return item ? item.name || item.reference || `Client #${id}` : `Client #${id}`;
  }
  if (type === "dossier") {
    const item = context.dossiers?.find((x) => Number(x.id) === id);
    if (!item) return `Dossier #${id}`;
    return item.title || item.lawsuitNumber || `Dossier #${id}`;
  }
  if (type === "lawsuit") {
    const item = context.lawsuits?.find((x) => Number(x.id) === id);
    if (!item) return `Lawsuit #${id}`;
    return item.title || item.lawsuitNumber || `Lawsuit #${id}`;
  }
  if (type === "task") {
    const item = context.tasks?.find((x) => Number(x.id) === id);
    return item ? item.title || `Task #${id}` : `Task #${id}`;
  }
  if (type === "session") {
    const item = context.sessions?.find((x) => Number(x.id) === id);
    return item ? item.title || item.type || `Session #${id}` : `Session #${id}`;
  }
  if (type === "mission") {
    const item = context.missions?.find((x) => Number(x.id) === id);
    return item ? item.title || item.missionNumber || `Mission #${id}` : `Mission #${id}`;
  }
  if (type === "financial_entry") {
    const item = context.financialEntries?.find((x) => Number(x.id) === id);
    return item ? item.title || item.description || `Entry #${id}` : `Entry #${id}`;
  }
  return `${toTitleCase(type)} #${id}`;
}

function proposalSummary(proposal: ActionProposal, context: DataContextLike) {
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  const params = proposal.params || {};

  if (actionType === "ATTACH_TO_ENTITY") {
    const targetType = params.target?.type || params.targetType;
    const targetId = Number(params.target?.id || params.targetId);
    const targetLabel =
      resolveEntityLabel(targetType, targetId, context) ||
      params.targetLabel ||
      params.targetReference ||
      params.targetTitle ||
      `${toTitleCase(String(targetType || "record"))} #${targetId}`;
    return {
      title: `Attach ${labelForAttachmentType(params.attachmentType)} to ${targetLabel}`,
      kind: "Attach",
    };
  }

  if (actionType === "CREATE_ENTITY") {
    return {
      title: `Create ${labelForEntityType(params.entityType)}`,
      kind: "Create",
    };
  }

  if (actionType === "UPDATE_ENTITY") {
    const targetLabel =
      params.entityLabel ||
      params.reference ||
      params.title ||
      resolveEntityLabel(params.entityType, Number(params.entityId), context) ||
      labelForEntityType(params.entityType);
    return {
      title: `Update ${targetLabel}`,
      kind: "Update",
    };
  }

  if (actionType === "DELETE_ENTITY") {
    const targetLabel =
      params.entityLabel ||
      params.reference ||
      params.title ||
      resolveEntityLabel(params.entityType, Number(params.entityId), context) ||
      labelForEntityType(params.entityType);
    return {
      title: `Delete ${targetLabel}`,
      kind: "Delete",
    };
  }

  if (actionType === "LINK_ENTITIES") {
    const sourceLabel =
      params.sourceLabel ||
      params.sourceReference ||
      params.sourceTitle ||
      resolveEntityLabel(params.sourceType, Number(params.sourceId), context) ||
      labelForEntityType(params.sourceType);
    const targetLabel =
      params.targetLabel ||
      params.targetReference ||
      params.targetTitle ||
      resolveEntityLabel(params.targetType, Number(params.targetId), context) ||
      labelForEntityType(params.targetType);
    const isRemove = params.mode === "remove";
    return {
      title: `${isRemove ? "Unlink" : "Link"} ${sourceLabel} ${isRemove ? "from" : "to"} ${targetLabel}`,
      kind: isRemove ? "Unlink" : "Link",
    };
  }

  return {
    title:
      proposal.humanReadableSummary ||
      proposal.description ||
      toTitleCase(String(actionType || "Pending action")),
    kind: toTitleCase(String(actionType || "Action")),
  };
}

function renderChangeDiff(changes: Record<string, { from: unknown; to: unknown }> | undefined) {
  if (!changes || Object.keys(changes).length === 0) return null;
  return (
    <div className="mt-3 rounded-lg border border-black/[0.06] bg-white/70 p-3 dark:border-white/[0.08] dark:bg-slate-900/40">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-2">
        Field Changes
      </p>
      <div className="space-y-2">
        {Object.entries(changes).map(([field, diff]) => (
          <div key={field} className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-medium text-slate-700 dark:text-slate-200">{toTitleCase(field)}</span>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-red-700 dark:bg-red-900/30 dark:text-red-300">
              {JSON.stringify(diff.from)}
            </span>
            <span className="text-slate-400 dark:text-slate-500">to</span>
            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              {JSON.stringify(diff.to)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function ProposalArtifact({ data, onConfirm, onCancel }: ProposalArtifactProps) {
  const contextData = useData() as DataContextLike;
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>(() => {
    const initial: Record<string, ProposalState> = {};
    data.proposals.forEach((proposal) => {
      initial[proposal.proposalId] = { status: "pending" };
    });
    return initial;
  });

  const handleConfirm = async (proposalId: string) => {
    setProposalStates((prev) => ({
      ...prev,
      [proposalId]: { status: "confirming" },
    }));

    try {
      const proposal = data.proposals.find((p) => p.proposalId === proposalId);
      const execResult = await onConfirm(proposalId, {
        ackRisk: proposal?.confirmation?.extraRiskAck === true,
      });
      if (execResult.status === "success") {
        emitExecutedMutationFromExecutionResult(execResult);
        setProposalStates((prev) => ({
          ...prev,
          [proposalId]: { status: "confirmed", executionResult: execResult },
        }));
      } else {
        const safeMsg = execResult.error?.safeMessage || execResult.error?.message || "Execution failed";
        setProposalStates((prev) => ({
          ...prev,
          [proposalId]: { status: "failed", error: safeMsg, executionResult: execResult },
        }));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      setProposalStates((prev) => ({
        ...prev,
        [proposalId]: { status: "failed", error: errorMessage },
      }));
    }
  };

  const handleCancel = (proposalId: string) => {
    setProposalStates((prev) => ({
      ...prev,
      [proposalId]: { status: "cancelled" },
    }));
    onCancel(proposalId);
  };

  return (
    <div className="artifact-build agent-artifact-card is-proposal">
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-proposal flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-violet shrink-0 flex items-center justify-center w-10 h-10 rounded-lg">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              Action Proposal
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {data.proposals.length} {data.proposals.length === 1 ? "action" : "actions"} awaiting confirmation
            </p>
          </div>
        </div>
      </div>

      <div className="artifact-build-body px-5 py-4 space-y-4">
        {data.proposals.map((proposal) => {
          const state = proposalStates[proposal.proposalId];
          const isPending = state.status === "pending";
          const isConfirming = state.status === "confirming";
          const isConfirmed = state.status === "confirmed";
          const isCancelled = state.status === "cancelled";
          const isFailed = state.status === "failed";
          const summary = proposalSummary(proposal, contextData);
          const changes =
            proposal.actionType === "UPDATE_ENTITY"
              ? (proposal.params?.changes as Record<string, { from: unknown; to: unknown }> | undefined)
              : undefined;

          return (
            <div
              key={proposal.proposalId}
              className={`rounded-xl border p-4 transition-all ${
                isConfirmed
                  ? "border-emerald-300 bg-emerald-50/80 dark:border-emerald-800 dark:bg-emerald-950/20"
                  : isCancelled
                  ? "border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900/30 opacity-70"
                  : isFailed
                  ? "border-red-300 bg-red-50/80 dark:border-red-800 dark:bg-red-950/20"
                  : "border-violet-200 bg-violet-50/40 dark:border-violet-800 dark:bg-violet-950/20"
              }`}
            >
              <div className="flex flex-wrap items-center gap-2 mb-2">
                <span className="inline-flex items-center rounded-md border border-black/[0.08] bg-white px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-600 dark:border-white/[0.1] dark:bg-slate-800/70 dark:text-slate-300">
                  {summary.kind}
                </span>
                {proposal.snapshot?.timestamp && (
                  <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="w-3 h-3" />
                    {new Date(proposal.snapshot.timestamp).toLocaleString()}
                  </span>
                )}
              </div>

              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{summary.title}</p>

              {proposal.confirmation?.extraRiskAck === true && (
                <div className="mt-2 rounded-lg border border-amber-200/70 bg-amber-50/70 p-2.5 dark:border-amber-800/60 dark:bg-amber-950/20">
                  <div className="flex items-start gap-2 text-xs text-amber-800 dark:text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                    <div className="space-y-1">
                      <div>This action needs an explicit risk confirmation.</div>
                      {proposal.confirmation.impactSummary?.slice(0, 3).map((line, idx) => (
                        <div key={idx} className="text-amber-700/90 dark:text-amber-200/90">
                          • {line}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {proposal.actionType === "ATTACH_TO_ENTITY" &&
                proposal.params?.attachmentType === "doc_draft" &&
                proposal.params?.payload?.title && (
                  <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
                    Draft: {String(proposal.params.payload.title)}
                  </p>
                )}

              {proposal.actionType === "LINK_ENTITIES" && (
                <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                  {proposal.params?.mode === "remove" ? <Unlink className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                  {proposal.params?.linkField ? `Relationship: ${proposal.params.linkField}` : "Relationship update"}
                </div>
              )}

              {proposal.actionType === "DELETE_ENTITY" && (
                <div className="mt-2 inline-flex items-center gap-1.5 text-xs text-red-700 dark:text-red-400">
                  <Trash2 className="w-3 h-3" />
                  This will remove the record (soft delete).
                </div>
              )}

              {renderChangeDiff(changes)}

              {proposal.affectedEntities && proposal.affectedEntities.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {proposal.affectedEntities.map((entity, idx) => {
                    const resolved =
                      resolveEntityLabel(entity.type, Number(entity.id), contextData) ||
                      entity.reference ||
                      entity.type;
                    return (
                      <span
                        key={idx}
                        className="inline-flex items-center gap-1 rounded-md bg-violet-100 px-2 py-1 text-xs font-medium text-violet-800 dark:bg-violet-900/30 dark:text-violet-300"
                      >
                        {resolved}
                      </span>
                    );
                  })}
                </div>
              )}

              {isConfirmed && (
                <div className="mt-3 rounded-lg border border-emerald-200/70 bg-emerald-50/70 p-3 dark:border-emerald-800/60 dark:bg-emerald-950/20">
                  <div className="flex items-center gap-2 text-sm text-emerald-700 dark:text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Confirmed and executed</span>
                  </div>
                  {state.executionResult?.executedActions?.map((ea, i) => (
                    <div key={i} className="ml-6 mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
                      {toTitleCase(String(ea.actionType || "Action"))} completed at{" "}
                      {new Date(ea.executedAt).toLocaleTimeString()}
                    </div>
                  ))}
                  {state.executionResult?.audit?.executedAt && (
                    <div className="ml-6 mt-1 text-xs text-slate-500 dark:text-slate-400">
                      Completed on {new Date(state.executionResult.audit.executedAt).toLocaleString()}
                    </div>
                  )}
                </div>
              )}

              {isCancelled && (
                <div className="mt-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                  <XCircle className="w-4 h-4" />
                  <span>Cancelled</span>
                </div>
              )}

              {isFailed && (
                <div className="mt-3 rounded-lg border border-red-200/70 bg-red-50/70 p-3 dark:border-red-800/60 dark:bg-red-950/20">
                  <div className="flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    <span>{state.error || "Execution failed"}</span>
                  </div>
                  {state.executionResult?.error?.requiresReproposal && (
                    <div className="ml-6 mt-1 text-xs text-red-600 dark:text-red-400">
                      Please retry to generate a new proposal.
                    </div>
                  )}
                </div>
              )}

              {(isPending || isConfirming) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => handleConfirm(proposal.proposalId)}
                    disabled={isConfirming}
                    className={`agent-action-btn min-w-[108px] justify-center ${
                      isConfirming
                        ? "bg-violet-300 text-violet-900 cursor-wait"
                        : "agent-action-btn-primary"
                    }`}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {isConfirming ? "Confirming..." : "Confirm"}
                  </button>

                  <button
                    onClick={() => handleCancel(proposal.proposalId)}
                    disabled={isConfirming}
                    className="agent-action-btn agent-action-btn-secondary disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <XCircle className="w-4 h-4" />
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
