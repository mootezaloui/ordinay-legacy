export type SemanticToneVariant = "neutral" | "sensitive" | "caution" | "destructive";

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
