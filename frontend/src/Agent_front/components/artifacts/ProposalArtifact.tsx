import { useState } from "react";
import type { ActionProposal, ExecutionResult, ProposalOutput } from "../../../services/api/agent";
import { useData } from "../../../contexts/DataContext";
import { DecisionConfirmationPanel } from "./confirmation/DecisionConfirmationPanel";
import type { DecisionUiState } from "./confirmation/types";
import { mapSemanticAction } from "./confirmation/semanticActionMapper";
import type { SemanticActionViewModel, StructuredProposalCardViewModel } from "./confirmation/types";
import { SemanticMappingError } from "./confirmation/semanticGuards";
import {
  proposalToSemanticInput,
  type DataContextLike,
} from "./confirmation/proposalToSemanticInput";
import { emitEntityMutationSuccess } from "../../../core/mutationSync";

interface ProposalArtifactProps {
  data: ProposalOutput;
  onConfirm: (proposalId: string, options?: { ackRisk?: boolean }) => Promise<ExecutionResult>;
  onCancel: (proposalId: string) => void;
  onUndo?: (proposalId: string) => void;
}

interface ProposalState {
  status: Exclude<DecisionUiState, "expired">;
  error?: string;
  executionResult?: ExecutionResult;
}

interface SemanticRenderItem {
  viewModel: SemanticActionViewModel;
  debugPayload?: Record<string, unknown>;
}

const SEMANTIC_CONFIRMATION_PANEL_DEBUG_STORAGE_KEY = "ordinay:debug:semantic-confirmation-panel";
const loggedSemanticDebugProposalIds = new Set<string>();

function isSemanticConfirmationPanelDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (!(typeof import.meta !== "undefined" && import.meta.env?.DEV)) return false;
  try {
    const value = window.localStorage?.getItem(SEMANTIC_CONFIRMATION_PANEL_DEBUG_STORAGE_KEY);
    return ["1", "true", "yes", "on"].includes(String(value || "").toLowerCase());
  } catch {
    return false;
  }
}

function emitExecutedMutationEvent(detail: {
  entityType: string;
  entityId: number;
  operation?: string;
}) {
  const entityType = String(detail?.entityType || "").trim().toLowerCase();
  const entityId = Number(detail?.entityId || 0);
  if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return;
  const op = String(detail?.operation || "update").trim().toLowerCase();
  emitEntityMutationSuccess({
    type: "ENTITY_MUTATION_SUCCESS",
    entityType,
    entityId,
    operation: op === "create" || op === "update" || op === "delete" || op === "attach" ? op : "update",
    scope: {},
    source: "agent",
    timestamp: new Date().toISOString(),
  });
}

function emitExecutedMutationFromExecutionResult(execResult?: ExecutionResult) {
  if (!execResult) return;
  const seen = new Set<string>();
  const emitOnce = (detail: { entityType?: unknown; entityId?: unknown; operation?: unknown }) => {
    const entityType = String(detail?.entityType || "").trim().toLowerCase();
    const entityId = Number(detail?.entityId || 0);
    if (!entityType || !Number.isInteger(entityId) || entityId <= 0) return;
    const operation = String(detail?.operation || "update").trim().toLowerCase();
    const key = `${entityType}:${entityId}:${operation}`;
    if (seen.has(key)) return;
    seen.add(key);
    emitExecutedMutationEvent({
      entityType,
      entityId,
      operation,
    });
  };

  for (const action of execResult.executedActions || []) {
    const result = action?.result as
      | {
          ok?: boolean;
          entityType?: string;
          entityId?: number | string;
          operation?: string;
          stepResults?: Array<{
            ok?: boolean;
            actionType?: string;
            result?: { ok?: boolean; entityType?: string; entityId?: number | string; operation?: string };
          }>;
        }
      | undefined;
    if (!result) continue;
    if (result.ok === true) {
      emitOnce(result);
    }

    if (Array.isArray(result.stepResults)) {
      for (const step of result.stepResults) {
        if (!step || step.ok !== true || !step.result || step.result.ok === false) continue;
        const actionType = String(step.actionType || "").toUpperCase();
        let op = "update";
        if (actionType === "CREATE_ENTITY") op = "create";
        else if (actionType === "DELETE_ENTITY") op = "delete";
        emitOnce({
          entityType: step.result.entityType,
          entityId: step.result.entityId,
          operation: step.result.operation || op,
        });
      }
    }
  }
}

function restoreProposalState(proposal: ActionProposal): ProposalState {
  const persisted = proposal?.uiState;
  const status = String(persisted?.status || "").toLowerCase();
  if (status === "confirmed") {
    return { status: "applied", executionResult: persisted?.executionResult };
  }
  if (status === "failed") {
    if (persisted?.executionResult?.status === "snapshot_mismatch") {
      return {
        status: "stale",
        error: persisted?.error,
        executionResult: persisted?.executionResult,
      };
    }
    return {
      status: "failed",
      error: persisted?.error,
      executionResult: persisted?.executionResult,
    };
  }
  if (status === "cancelled") {
    return { status: "declined" };
  }
  return { status: "awaiting_decision" };
}

function hasExpired(proposal: ActionProposal): boolean {
  const expiresAt = proposal.confirmation?.expiresAt;
  if (!expiresAt) return false;
  const time = new Date(expiresAt).getTime();
  if (!Number.isFinite(time)) return false;
  return time < Date.now();
}

function getEffectiveUiState(state: ProposalState, proposal: ActionProposal): DecisionUiState {
  if (state.status === "awaiting_decision" && hasExpired(proposal)) {
    return "expired";
  }
  return state.status;
}

function toProposalState(execResult: ExecutionResult, fallbackMessage?: string): ProposalState {
  if (execResult.status === "success") {
    return { status: "applied", executionResult: execResult };
  }
  if (execResult.status === "snapshot_mismatch") {
    return {
      status: "stale",
      executionResult: execResult,
      error: execResult.error?.safeMessage || execResult.error?.message || fallbackMessage,
    };
  }
  return {
    status: "failed",
    executionResult: execResult,
    error: execResult.error?.safeMessage || execResult.error?.message || fallbackMessage,
  };
}

function canRetry(state: ProposalState): boolean {
  if (state.status !== "failed") return false;
  if (state.executionResult?.error?.requiresReproposal) return false;
  return true;
}

function getCompletedAtLabel(state: ProposalState): string | undefined {
  const executedAt = state.executionResult?.audit?.executedAt;
  if (!executedAt) return undefined;
  return `Applied ${new Date(executedAt).toLocaleString()}`;
}

export function ProposalArtifact({
  data,
  onConfirm,
  onCancel,
  onUndo,
}: ProposalArtifactProps) {
  const contextData = useData() as DataContextLike;
  const [proposalStates, setProposalStates] = useState<Record<string, ProposalState>>(() => {
    const initial: Record<string, ProposalState> = {};
    for (const proposal of data.proposals) {
      initial[proposal.proposalId] = restoreProposalState(proposal);
    }
    return initial;
  });

  const updateState = (proposalId: string, next: ProposalState) => {
    setProposalStates((prev) => ({
      ...prev,
      [proposalId]: next,
    }));
  };

  const handleConfirm = async (proposalId: string) => {
    const proposal = data.proposals.find((p) => p.proposalId === proposalId);
    if (!proposal) return;

    if (hasExpired(proposal)) {
      updateState(proposalId, { status: "awaiting_decision" });
      return;
    }

    updateState(proposalId, { status: "submitting" });

    try {
      const execResult = await onConfirm(proposalId, {
        ackRisk: proposal.confirmation?.extraRiskAck === true,
      });
      emitExecutedMutationFromExecutionResult(execResult);
      updateState(
        proposalId,
        toProposalState(execResult, "I could not apply that change. Please try again."),
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error";
      updateState(proposalId, {
        status: "failed",
        error: errorMessage,
      });
    }
  };

  const handleDecline = (proposalId: string) => {
    updateState(proposalId, { status: "declined" });
    onCancel(proposalId);
  };

  const handleUndo = (proposalId: string) => {
    const proposal = data.proposals.find((p) => p.proposalId === proposalId);
    if (!proposal) return;
    if (hasExpired(proposal)) {
      updateState(proposalId, { status: "awaiting_decision" });
      return;
    }
    updateState(proposalId, { status: "awaiting_decision" });
    onUndo?.(proposalId);
  };

  const renderItems = buildProposalRenderItems(data.proposals, contextData, isSemanticConfirmationPanelDebugEnabled());

  return (
    <div className="space-y-3">
      {data.proposals.map((proposal, idx) => {
        const state = proposalStates[proposal.proposalId] || { status: "awaiting_decision" };
        const uiState = getEffectiveUiState(state, proposal);
        const renderItem = renderItems[idx];
        const semantic = renderItem.viewModel;
        const completedAtLabel = getCompletedAtLabel(state);
        const errorMessage =
          uiState === "stale"
            ? undefined
            : state.error ||
              state.executionResult?.error?.safeMessage ||
              state.executionResult?.error?.message;

        return (
          <DecisionConfirmationPanel
            key={proposal.proposalId}
            viewModel={semantic}
            uiState={uiState}
            errorMessage={errorMessage}
            completedAtLabel={completedAtLabel}
            expiresAt={proposal.confirmation?.expiresAt}
            canRetry={canRetry(state)}
            requiresRefresh={uiState === "stale"}
            debugPayload={renderItem.debugPayload}
            onConfirm={() => void handleConfirm(proposal.proposalId)}
            onRetry={() => void handleConfirm(proposal.proposalId)}
            onDecline={() => handleDecline(proposal.proposalId)}
            onUndo={() => handleUndo(proposal.proposalId)}
          />
        );
      })}
    </div>
  );
}

function buildProposalRenderItems(
  proposals: ActionProposal[],
  contextData: DataContextLike,
  includeDebugPayload: boolean,
): SemanticRenderItem[] {
  if (!Array.isArray(proposals) || proposals.length === 0) {
    throw new SemanticMappingError("No confirmation actions available to render.");
  }

  return proposals.map((proposal) => {
    try {
      const semanticInput = proposalToSemanticInput(proposal, contextData);
      const viewModel = mapSemanticAction(semanticInput);
      if (typeof import.meta !== "undefined" && import.meta.env?.DEV && proposal.requiresConfirmation) {
        const proposalDebugKey = String(proposal.proposalId || "");
        if (proposalDebugKey && !loggedSemanticDebugProposalIds.has(proposalDebugKey)) {
          loggedSemanticDebugProposalIds.add(proposalDebugKey);
          console.warn("[CONFIRM_DEBUG][frontend][semanticConfirmation]", {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType || proposal.action,
            humanReadableSummary: proposal.humanReadableSummary,
            description: proposal.description,
            reversible: proposal.reversible,
            confirmation: proposal.confirmation,
            affectedEntities: proposal.affectedEntities,
            workflow: proposal.params?.workflow,
            params: proposal.params,
            semanticInput,
            viewModel,
          });
          console.warn("[CONFIRM_DEBUG][frontend][semanticConfirmation][parsed]", {
            proposalId: proposal.proposalId,
            actionType: proposal.actionType || proposal.action,
            workflowRequestedGoal: proposal.params?.workflow?.requestedGoal,
            workflowStepCount: Array.isArray(proposal.params?.workflow?.steps) ? proposal.params?.workflow?.steps.length : 0,
            workflowFirstStep: Array.isArray(proposal.params?.workflow?.steps) ? proposal.params?.workflow?.steps[0] : undefined,
            semanticInputChanges: semanticInput.changes,
            semanticInputChangeKeys: Object.keys(semanticInput.changes || {}),
            semanticInputImpactHints: semanticInput.context.impactHints,
            semanticInputPendingFieldNames: semanticInput.context.pendingFieldNames,
          });
        }
      }
      return {
        viewModel,
        debugPayload: includeDebugPayload
          ? {
              proposalId: proposal.proposalId,
              actionType: proposal.actionType || proposal.action,
              humanReadableSummary: proposal.humanReadableSummary,
              description: proposal.description,
              params: proposal.params,
              workflow: proposal.params?.workflow,
              confirmation: proposal.confirmation,
              affectedEntities: proposal.affectedEntities,
              preview: proposal.preview,
              semanticInput,
              viewModel,
            }
          : undefined,
      };
    } catch (error) {
      const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
      const params = proposal.params || {};
      const semanticInput =
        error instanceof SemanticMappingError ? proposalToSemanticInput(proposal, contextData) : undefined;
      const confirmationPreview = proposal.confirmation?.preview;
      const previewRoot =
        confirmationPreview && typeof confirmationPreview === "object"
          ? (confirmationPreview as { root?: unknown }).root
          : undefined;
      console.error("[SemanticConfirmation] Failed to build semantic confirmation view model", {
        proposalId: proposal.proposalId,
        actionType,
        entityType: String(params.entityType || params.targetType || params.sourceType || params.target?.type || ""),
        paramsKeys: Object.keys(params),
        changesKeys:
          params.changes && typeof params.changes === "object"
            ? Object.keys(params.changes as Record<string, unknown>)
            : [],
        payloadKeys:
          params.payload && typeof params.payload === "object" && !Array.isArray(params.payload)
            ? Object.keys(params.payload as Record<string, unknown>)
            : [],
        semanticDebug: semanticInput
          ? {
              detectedIntent: semanticInput.detectedIntent,
              entityType: semanticInput.entityType,
              actionKind: semanticInput.context.actionKind,
              hasSubjectLabel: Boolean(semanticInput.context.subjectLabel),
              subjectLabel: semanticInput.context.subjectLabel,
              changeKeys: Object.keys(semanticInput.changes || {}),
              pendingFieldNames: semanticInput.context.pendingFieldNames || [],
              impactHints: semanticInput.context.impactHints || [],
              hasConfirmationPreview: Boolean(semanticInput.context.confirmationPreview),
              confirmationPreviewRoot: semanticInput.context.confirmationPreview?.root,
              confirmationPreviewPrimaryChangeCount: semanticInput.context.confirmationPreview?.primaryChanges?.length || 0,
              confirmationPreviewCascadeGroupCount: semanticInput.context.confirmationPreview?.cascadeSummary?.length || 0,
            }
          : undefined,
        confirmationDebug: {
          confirmationKeys:
            proposal.confirmation && typeof proposal.confirmation === "object"
              ? Object.keys(proposal.confirmation)
              : [],
          hasPreview: Boolean(confirmationPreview),
          previewRoot,
          previewKeys:
            confirmationPreview && typeof confirmationPreview === "object"
              ? Object.keys(confirmationPreview as unknown as Record<string, unknown>)
              : [],
          previewPrimaryChangeCount:
            Array.isArray((confirmationPreview as { primaryChanges?: unknown[] } | undefined)?.primaryChanges)
              ? (confirmationPreview as { primaryChanges: unknown[] }).primaryChanges.length
              : 0,
          previewCascadeGroupCount:
            Array.isArray((confirmationPreview as { cascadeSummary?: unknown[] } | undefined)?.cascadeSummary)
              ? (confirmationPreview as { cascadeSummary: unknown[] }).cascadeSummary.length
              : 0,
          previewEffects:
            Array.isArray((confirmationPreview as { effects?: unknown[] } | undefined)?.effects)
              ? (confirmationPreview as { effects: unknown[] }).effects
              : [],
        },
        semanticMappingErrorMeta:
          error instanceof SemanticMappingError ? (error as SemanticMappingError & { meta?: unknown }).meta : undefined,
        error,
      });
      const fallbackSummary = (
        String(proposal.humanReadableSummary || "").trim() ||
        "review and apply the requested change"
      )
        .replace(/\bworkflow\b/gi, "step plan")
        .replace(/\bmutation\b/gi, "change")
        .replace(/\boperation\b/gi, "action")
        .replace(/\bproposal\b/gi, "confirmation")
        .replace(/\s{2,}/g, " ")
        .trim();
      const fallbackTarget =
        String(
          proposal.params?.entityLabel ||
            proposal.params?.title ||
            proposal.params?.reference ||
            proposal.params?.targetLabel ||
            "",
        ).trim() || "the selected information";
      const fallbackViewModel: SemanticActionViewModel = {
        card: {
          verb: "Confirm",
          entityLabel: "Change",
          reversibleLabel: proposal.reversible === false ? "Not reversible" : "Can be adjusted later",
          title: `Confirm Change for ${fallbackTarget}`,
          subtitle: `This applies the requested change for ${fallbackTarget}.`,
          fields: [
            {
              key: "planned_change",
              label: "Planned change",
              value: `This will ${fallbackSummary.toLowerCase()}.`,
              icon: "file",
              span: "full",
            },
          ],
          warningHint: "Review before confirming.",
          confirmLabel: "Confirm Change",
          cancelLabel: "Keep Current Information",
          applied: {
            title: "Applied",
            subtitle: "The confirmed action completed successfully.",
          },
          cancelled: {
            title: "Cancelled",
            subtitle: "No change was applied.",
            undoLabel: "Undo",
          },
        } satisfies StructuredProposalCardViewModel,
        assistantMessage: `I can ${fallbackSummary.toLowerCase()} for ${fallbackTarget}. Please confirm before I continue.`,
        headline: `Confirm Change for ${fallbackTarget}`,
        description: `This applies the requested change for ${fallbackTarget}.`,
        impact: [
          {
            kind: "consequence",
            title: "Planned change",
            detail: `This will ${fallbackSummary.toLowerCase()}.`,
          },
          {
            kind: "reversibility",
            detail:
              proposal.reversible === false
                ? "Not reversible."
                : "If needed, this can be changed later.",
          },
        ],
        confirmLabel: "Confirm Change",
        cancelLabel: "Keep Current Information",
        toneVariant: proposal.reversible === false ? "destructive" : "neutral",
        sections: {
          changesLabel: "What changes",
          consequencesLabel: "What this affects",
          warningsLabel: "What this affects",
          reversibilityLabel: "Can this be undone?",
        },
      };
      return {
        viewModel: fallbackViewModel,
        debugPayload: includeDebugPayload
          ? {
              fallbackUsed: true,
              proposalId: proposal.proposalId,
              actionType,
              originalError:
                error instanceof Error
                  ? { name: error.name, message: error.message }
                  : { message: String(error) },
            }
          : undefined,
      };
    }
  });
}
