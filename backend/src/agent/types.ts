export enum TurnType {
  NEW = "NEW",
  CONFIRMATION = "CONFIRMATION",
  REJECTION = "REJECTION",
  AMENDMENT = "AMENDMENT",
}

export type SessionID = string;

export interface EntityReference {
  type: string;
  id: string | number;
  label?: string;
}

export type PlanOperationType = "create" | "update" | "delete";

export interface PlanOperation {
  operation: PlanOperationType;
  entityType: string;
  entityId?: number | string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  reason?: string;
}

export type LinkResolutionStatus =
  | "unchanged"
  | "resolved"
  | "ambiguous"
  | "unresolved";

export type LinkResolutionSource = "payload" | "draft_context" | "active_entities";

export interface LinkResolutionCandidate {
  entityType: string;
  entityId: number | string;
  label?: string;
  source?: LinkResolutionSource;
}

export interface LinkResolutionDiagnostic {
  status: LinkResolutionStatus;
  reason?: string;
  source?: LinkResolutionSource;
  field?: string;
  entityType?: string;
  entityId?: number | string;
  candidates?: LinkResolutionCandidate[];
  message?: string;
}

export type DomainWorkflowActionType =
  | "CREATE_ENTITY"
  | "UPDATE_ENTITY"
  | "DELETE_ENTITY";

export interface DomainWorkflowDecisionOption {
  key: string;
  title: string;
  description: string;
}

export interface DomainWorkflowStep {
  id: string;
  actionType: DomainWorkflowActionType;
  operation: PlanOperationType;
  entityType: string;
  entityId?: number | string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  reason?: string;
  dependsOn?: string[];
}

export interface DomainWorkflowStepResult {
  stepId: string;
  actionType: DomainWorkflowActionType;
  operation: PlanOperationType;
  entityType: string;
  entityId?: number | string;
  ok: boolean;
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

export interface DomainWorkflowDiagnostics {
  plannerVersion?: string;
  analyzedAt?: string;
  blockers?: Record<string, number>;
  blockerCounts?: Record<string, number>;
  linkResolution?: LinkResolutionDiagnostic;
  notes?: string[];
  requiresUserDecision?: boolean;
  decisionPrompt?: string;
  decisionOptions?: DomainWorkflowDecisionOption[];
}

export interface PlanPreviewChange {
  entityType: string;
  entityId?: number | null;
  entityLabel?: string | null;
  field: string;
  from?: unknown;
  to?: unknown;
}

export interface PlanPreviewCascadeGroup {
  entityType: string;
  totalCount: number;
  changedFields?: string[];
  examples?: PlanPreviewChange[];
}

export interface PlanPreviewField {
  key: string;
  from?: unknown;
  to?: unknown;
}

export interface PlanPreviewLinkingTarget {
  entityType: string;
  entityId: number | string;
  label?: string;
  field?: string;
}

export interface PlanPreviewLinking {
  status: LinkResolutionStatus;
  source?: LinkResolutionSource;
  target?: PlanPreviewLinkingTarget;
  userSpecified?: boolean;
  resolutionLabel?: string;
  ambiguousCandidates?: LinkResolutionCandidate[];
}

export interface PlanPreview {
  title?: string;
  subtitle?: string;
  fields?: PlanPreviewField[];
  warnings?: string[];
  scope?: "single_entity" | "workflow" | string;
  root?: {
    type?: string;
    id?: number | null;
    label?: string;
    operation?: string;
  };
  primaryChanges?: PlanPreviewChange[];
  cascadeSummary?: PlanPreviewCascadeGroup[];
  effects?: string[];
  reversibility?: "reversible" | "not_reversible" | "unknown" | string;
  decisions?: DomainWorkflowDecisionOption[];
  linking?: PlanPreviewLinking;
}

export interface PendingActionPlan {
  rootOperation?: PlanOperation;
  operation: PlanOperation;
  workflowSteps?: DomainWorkflowStep[];
  diagnostics?: DomainWorkflowDiagnostics;
  uiPreview?: PlanPreview;
  preview?: PlanPreview;
}

export type SuggestionArtifactVersion = "v1";
export type SuggestionArtifactDomain = "draft" | "execute";
export type SuggestionArtifactTrigger = "implicit_intent" | "proactive_context";
export type SuggestionArtifactAction = "draft" | "create" | "update" | "delete";

export interface SuggestionArtifact {
  version: SuggestionArtifactVersion;
  domain: SuggestionArtifactDomain;
  trigger: SuggestionArtifactTrigger;
  actionType: SuggestionArtifactAction;
  targetType: string;
  title: string;
  reason: string;
  linkedEntityType?: string;
  linkedEntityId?: number | string;
  prefillData: Record<string, unknown>;
}

export interface PlanArtifact {
  pendingActionId: string;
  operation: PlanOperation;
  summary: string;
  preview?: PlanPreview;
  workflow?: {
    totalSteps: number;
    steps: DomainWorkflowStep[];
    requiresUserDecision?: boolean;
  };
}

export interface PlanExecutedArtifact {
  pendingActionId: string;
  ok: boolean;
  result?: Record<string, unknown>;
  stepResults?: DomainWorkflowStepResult[];
  failedStepId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
}

export interface PlanRejectedArtifact {
  pendingActionId: string;
}

export interface PendingAction {
  id: string;
  toolName: string;
  summary: string;
  args: Record<string, unknown>;
  plan?: PendingActionPlan;
  createdAt: string;
  requestedByTurnId?: string;
  risk?: "low" | "medium" | "high";
}

export interface ToolCallRecord {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  startedAt: string;
  finishedAt?: string;
  ok?: boolean;
  errorCode?: string;
  metadata?: Record<string, unknown>;
}

export interface AuditRecord {
  id: string;
  sessionId: SessionID;
  turnId: string;
  eventType: string;
  timestamp: string;
  data: Record<string, unknown>;
}

export interface DraftSection {
  id: string;
  role: string;
  text?: string;
  label?: string;
}

export interface DraftLayout {
  direction: "ltr" | "rtl";
  language: string;
  formality: "formal" | "standard" | "casual";
  documentClass: string;
}

export interface DraftArtifact {
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSection[];
  layout: DraftLayout;
  // Transition fallback for legacy sessions/components.
  content?: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  generatedAt: string;
  version: number;
}

export interface AgentTurnInput {
  sessionId: SessionID;
  turnId: string;
  message: string;
  userId?: string;
  metadata?: Record<string, unknown>;
}

export interface AgentTurnOutput {
  sessionId: SessionID;
  turnId: string;
  turnType: TurnType;
  responseText: string;
  pendingAction?: PendingAction | null;
  toolCalls?: ToolCallRecord[];
  audit?: AuditRecord[];
  metadata?: Record<string, unknown>;
}
