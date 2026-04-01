export type SemanticToneVariant = "neutral" | "sensitive" | "caution" | "destructive";

export type StructuredProposalFieldIcon =
  | "type"
  | "client"
  | "dossier"
  | "lawsuit"
  | "date"
  | "status"
  | "content"
  | "person"
  | "link"
  | "file"
  | "tag"
  | "calendar"
  | "generic";

export interface StructuredProposalCardField {
  key: string;
  label: string;
  value: string;
  icon: StructuredProposalFieldIcon;
  span: "half" | "full";
}

export interface StructuredProposalCardResultTarget {
  type: string;
  id?: number | string;
  label: string;
}

export interface StructuredProposalCardViewModel {
  verb: string;
  entityLabel: string;
  reversibleLabel: string;
  title: string;
  subtitle?: string;
  fields: StructuredProposalCardField[];
  contentPreview?: {
    label: string;
    text: string;
  };
  warningHint: string;
  confirmLabel: string;
  cancelLabel: string;
  applied: {
    title: string;
    subtitle?: string;
    resultTarget?: StructuredProposalCardResultTarget;
    shortcutLabel?: string;
  };
  cancelled: {
    title: string;
    subtitle: string;
    undoLabel: string;
  };
}

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

export interface ConfirmationPreviewLinkingTarget {
  entityType: string;
  entityId: number | string;
  label?: string;
  field?: string;
}

export interface ConfirmationPreviewLinkingCandidate {
  entityType: string;
  entityId: number | string;
  label?: string;
  source?: string;
}

export interface ConfirmationPreviewLinking {
  status: "unchanged" | "resolved" | "ambiguous" | "unresolved" | string;
  source?: string;
  target?: ConfirmationPreviewLinkingTarget;
  userSpecified?: boolean;
  resolutionLabel?: string;
  ambiguousCandidates?: ConfirmationPreviewLinkingCandidate[];
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
  linking?: ConfirmationPreviewLinking;
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
    proposalPreview?: {
      title?: string;
      items: Array<{
        index: number;
        entityType: string | null;
        operation: string | null;
        title: string;
        status?: string | null;
        priority?: string | null;
        parentLinks?: string[] | null;
        explicitFields?: string[];
        defaultedFields?: string[];
        inheritedFields?: string[];
        inferredFields?: Array<{
          field?: string;
          value?: unknown;
          origin?: string;
          confidence?: number;
          strategyId?: string;
        }>;
        correctedFields?: Array<{
          field?: string;
          from?: unknown;
          to?: unknown;
          ruleId?: string;
        }>;
        fieldDecisionMap?: Record<string, unknown>;
        inferenceSummary?: {
          countsByOrigin?: Record<string, number>;
          warningCount?: number;
        };
        warnings?: string[];
      }>;
      warnings?: string[];
    };
    structuredCard?: StructuredProposalCardViewModel;
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
  preview?: {
    title: string;
    items: Array<{
      index: number;
      title: string;
      status?: string | null;
      priority?: string | null;
      parentLinks?: string[] | null;
      explicitFields?: string[];
      defaultedFields?: string[];
      inheritedFields?: string[];
      inferredFields?: Array<{
        field?: string;
        value?: unknown;
        origin?: string;
        confidence?: number;
        strategyId?: string;
      }>;
      correctedFields?: Array<{
        field?: string;
        from?: unknown;
        to?: unknown;
        ruleId?: string;
      }>;
      fieldDecisionMap?: Record<string, unknown>;
      inferenceSummary?: {
        countsByOrigin?: Record<string, number>;
        warningCount?: number;
      };
      warnings?: string[];
    }>;
    warnings: string[];
  };
  card?: StructuredProposalCardViewModel;
}

export type DecisionUiState =
  | "awaiting_decision"
  | "submitting"
  | "applied"
  | "declined"
  | "failed"
  | "stale"
  | "expired";
