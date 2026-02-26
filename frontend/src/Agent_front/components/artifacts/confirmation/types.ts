export type SemanticToneVariant = "neutral" | "sensitive" | "caution" | "destructive";

export interface ConfirmationPreviewChange {
  entityType: string;
  entityId?: number | null;
  entityLabel?: string | null;
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface ConfirmationPreviewCascadeGroup {
  entityType: string;
  totalCount: number;
  changedFields?: string[];
  examples?: ConfirmationPreviewChange[];
}

export interface ConfirmationPreview {
  version: "v1" | string;
  scope: "single_entity" | "workflow" | string;
  root?: {
    type?: string;
    id?: number | null;
    label?: string;
    operation?: string;
  };
  primaryChanges?: ConfirmationPreviewChange[];
  cascadeSummary?: ConfirmationPreviewCascadeGroup[];
  effects?: Array<string | { type?: string; message?: string; count?: number }>;
  planner?: {
    legalSummary?: string | null;
    caseFocusPoints?: string[];
    suggestedNextSteps?: string[];
    riskSignals?: string[];
    semanticProfile?: {
      assumptions?: string[];
      missingOptional?: string[];
      missingCritical?: string[];
      summary?: string;
      category?: string | null;
      subtype?: string | null;
      priority?: string | null;
      phaseOrState?: string | null;
    };
    riskFlags?: string[];
    confidence?: number;
    source?: string;
    suggestedChildren?: Array<{ entityType?: string; payload?: Record<string, unknown>; rationale?: string }>;
  };
  reversibility?: "reversible" | "not_reversible" | "unknown" | string;
}

export interface SemanticActionMappingInput {
  entityType: string;
  detectedIntent: string;
  changes?: Record<string, { from: unknown; to: unknown }>;
  context: {
    subjectLabel?: string;
    userUtterance?: string;
    affectedItems?: Array<{ label: string; type?: string }>;
    reversible?: boolean | null;
    riskLevel?: "low" | "medium" | "high";
    reasonHint?: string;
    impactHints?: string[];
    pendingFieldNames?: string[];
    actionKind?: string;
    requiresRiskAck?: boolean;
    proposalSummary?: string;
    confirmationPreview?: ConfirmationPreview;
  };
}

export interface SemanticImpactItem {
  kind: "change" | "consequence" | "reversibility" | "warning";
  title?: string;
  detail: string;
  before?: string;
  after?: string;
}

export interface SemanticActionViewModel {
  assistantMessage: string;
  headline: string;
  description: string;
  impact: SemanticImpactItem[];
  confirmLabel: string;
  cancelLabel: string;
  toneVariant: SemanticToneVariant;
  sections: {
    changesLabel: string;
    consequencesLabel: string;
    warningsLabel: string;
    reversibilityLabel: string;
  };
}

export type DecisionUiState =
  | "awaiting_decision"
  | "submitting"
  | "applied"
  | "declined"
  | "failed"
  | "stale"
  | "expired";
