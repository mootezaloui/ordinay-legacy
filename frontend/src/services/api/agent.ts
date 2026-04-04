/**
 * Agent API Service
 *
 * Handles communication with the backend Agent Engine.
 * Maps frontend requests to backend contract format.
 */

import { apiClient } from './client';
import { getApiBase, getBackendConfig, isElectron } from '../../lib/apiConfig';
import type { EntityMutationSuccessEvent } from '../../core/mutationSync';

// Context scopes supported by the agent
export type ContextScope = 'GLOBAL' | 'CLIENT' | 'DOSSIER' | 'lawsuit' | 'SESSION' | 'TASK';

// Agent versions
export type AgentVersion = 'v1' | 'v2' | 'v3';

// Response status from agent
export type ResponseStatus = 'SUCCESS' | 'BLOCKED' | 'FAILED';

// Context references based on scope
export interface ContextRefs {
  clientId?: number;
  dossierId?: number;
  lawsuitId?: number;
  sessionId?: number;
  taskId?: number;
}

// Data access permissions - controls which domains the agent can access
export interface DataAccessPermissions {
  clients: boolean;
  dossiers: boolean;
  lawsuits: boolean;
  tasks: boolean;
  personalTasks: boolean;
  missions: boolean;
  sessions: boolean;
  financialEntries: boolean;
  notifications: boolean;
  history: boolean;
  documents: boolean;
}

export type WebSearchTrigger = 'explicit_language' | 'button' | 'user_confirmed';
export type AgentModelPreference = string;

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
  status: 'unchanged' | 'resolved' | 'ambiguous' | 'unresolved' | string;
  source?: string;
  target?: ConfirmationPreviewLinkingTarget;
  userSpecified?: boolean;
  resolutionLabel?: string;
  ambiguousCandidates?: ConfirmationPreviewLinkingCandidate[];
}

export interface ConfirmationPreview {
  version: 'v1' | string;
  scope: 'single_entity' | 'workflow' | string;
  root?: {
    type?: string;
    id?: number | null;
    label?: string;
    operation?: string;
  };
  primaryChanges?: ConfirmationPreviewChange[];
  cascadeSummary?: ConfirmationPreviewCascadeGroup[];
  effects?: string[];
  reversibility?: 'reversible' | 'not_reversible' | 'unknown' | string;
  linking?: ConfirmationPreviewLinking;
}

export interface StructuredProposalField {
  key: string;
  label: string;
  value: string;
}

export interface StructuredProposalContentPreview {
  label: string;
  text: string;
}

export interface StructuredProposalResultTarget {
  type: string;
  id?: number | string;
  label: string;
}

export interface StructuredProposal {
  verb: string;
  entityType: string;
  reversible: boolean | null;
  title: string;
  subtitle?: string;
  fields: StructuredProposalField[];
  contentPreview?: StructuredProposalContentPreview;
  resultTarget?: StructuredProposalResultTarget;
}

export interface AgentRequestMetadata {
  requestSource?: string;
  requestTriggerId?: string;
  webSearchEnabled?: boolean;
  webSearchTrigger?: WebSearchTrigger;
  webSearchQuery?: string;
  webSearchIntent?: 'WEB_SEARCH';
  streamingEnabled?: boolean;
  modelPreference?: AgentModelPreference;
  regenerateDraft?: boolean;
  regenInstruction?: string;
  draftSnapshot?: {
    draftType: string;
    title: string;
    subtitle?: string;
    metadata?: Record<string, string>;
    sections: DraftSectionData[];
    layout: DraftLayoutData;
    linkedEntityType?: string;
    linkedEntityId?: number;
    version?: number;
    content?: string;
  };
  // Frontend-only helper used to replace an existing assistant artifact in-place
  // during regenerate flows. It is stripped before backend request dispatch.
  replaceMessageId?: string;
}

// Agent request to backend
export interface AgentRequest {
  message: string;
  context?: ContextRefs & { scope?: ContextScope; dataAccess?: DataAccessPermissions };
  metadata?: AgentRequestMetadata;
  agentVersion?: AgentVersion;
  reasoner?: string;
  followUpIntent?: FollowUpIntent;
  sessionId: string; // REQUIRED: Session ID for continuity
  documentIds?: number[];
}

export interface ContextLifecycleEvent {
  conversationId: string;
  type: 'expired' | 'posture_reset' | 'cleared' | string;
  reason?: string;
  at?: string;
  previousUpdatedAt?: string | null;
  previousPosture?: string | null;
  nextPosture?: string | null;
  ttlMs?: number;
}

// ─── Post-Read Interpretation Types (MANDATORY) ───

// Interpretation statement — what a state means
export interface InterpretationStatement {
  level: 'critical' | 'warning' | 'info' | 'neutral';
  statement: string;
  implication: string;
  signal?: string;
  dataPoints?: Record<string, unknown>;
}

// Interpretation block — why the entity matters now
export interface InterpretationBlock {
  statements: InterpretationStatement[];
  summary: string;
}

// Navigation context — entity role awareness
export interface NavigationContext {
  role: 'parent' | 'child' | 'unknown';
  roleDescription: string;
  contextStatement: string;
  parentPath?: {
    type: string;
    id: string | number;
    reference?: string;
    name?: string;
  } | null;
  childrenAvailable?: Array<{
    type: string;
    count: number;
  }>;
}

// Follow-up suggestion with reason (MANDATORY)
export interface FollowUpSuggestion {
  label: string;
  labelKey?: string;
  labelParams?: Record<string, unknown>;
  reason: string;
  category?: 'urgency' | 'accountability' | 'planning' | 'exploration' | 'summary' | 'selection' | 'search' | 'navigation' | 'guidance';
  selectionId?: string | number;
  selectionCategory?: string;
  intent: string;
  entityType: string;
  entityId: string | number;
  origin: {
    entity: string;
    entityId: string | number;
  };
  target?: {
    type: string;
    id?: string | number;
    label?: string;
    count?: number;
  };
  parent?: {
    type: string;
    id: string | number;
    label?: string;
  };
  scope: {
    clientId?: number;
    dossierId?: number;
    lawsuitId?: number;
    sessionId?: number;
    taskId?: number;
    missionId?: number;
    personalTaskId?: number;
    financialEntryId?: number;
  };
  // Context resolution fields (for RESOLVE_CONTEXT_AND_CONTINUE)
  originalIntent?: string;
  originalDraftType?: string;
  originalMessage?: string;
  resolvedEntity?: {
    type: string;
    id: string | number;
    label: string;
  };
  pendingOperationId?: string;
  resolutionInput?: {
    entityType?: string;
    id?: string | number;
    reference?: string;
    name?: string;
  };
  resolution?: {
    decision: 'single' | 'multi' | 'all' | 'none';
    selected: Array<{
      entityType: string;
      entityId: string | number;
      label?: string;
      scope?: {
        clientId?: number;
        dossierId?: number;
        lawsuitId?: number;
        sessionId?: number;
        taskId?: number;
        missionId?: number;
        personalTaskId?: number;
        financialEntryId?: number;
      };
    }>;
  };
  filters?: {
    status?: string | null;
    priority?: string | null;
    timeframe?: string | null;
    paymentStatus?: string | null;
    query?: string | null;
    overdue?: boolean | null;
    activity?: string | null;
    direction?: string | null;
    scope?: string | null;
    severity?: string | null;
  };
}

// Semantic signals emitted by deterministic logic (no user-facing text)
export type SemanticSignal =
  | {
      type: 'INTENT_FRAMING';
      action: 'read' | 'list' | 'summarize';
      entity: string;
      scope: 'single' | 'multiple' | 'filtered';
    }
  | {
      type: 'EMPTY_RESULT';
      entityType?: string;
      resultCount?: number;
    }
  | {
      type: 'MULTIPLE_RESULTS';
      entityType?: string;
      resultCount?: number;
    }
  | {
      type: 'AMBIGUOUS_SCOPE';
      entityType?: string;
      resultCount?: number;
    }
  | {
      type: 'MISSING_INFORMATION';
      entityType?: string;
      reason?: string;
    }
  | {
      type: 'CLARIFICATION_REQUIRED';
      reason: string;
      entityType?: string;
      resultCount?: number;
    };

export interface ClarificationOption {
  action:
    | 'LIST'
    | 'FILTER'
    | 'REPEAT'
    | 'SELECT_ONE'
    | 'NARROW_SCOPE'
    | 'PROVIDE_IDENTIFIER'
    | 'OPEN_CONTEXT'
    | 'ENABLE_WEB_SEARCH';
  entityType?: string;
  intent?: string;
  scope?: FollowUpSuggestion['scope'];
  filters?: FollowUpSuggestion['filters'];
}

export interface ClarificationOutput {
  type: 'clarification' | 'routing_clarification';
  message?: string; // For routing_clarification
  reason: {
    type: string;
    entityType?: string;
    resultCount?: number;
  };
  signals?: SemanticSignal[];
  options?: ClarificationOption[];
  candidates?: Array<{ id: string; label: string; entityType?: string }>; // For routing_clarification
  confidence?: number; // For routing_clarification
  prompt?: string;
  searchRequest?: {
    searchIntent?: 'WEB_SEARCH';
    query?: string | null;
    suggestedTrigger?: WebSearchTrigger;
  };
}

// Facts block — what was read
export interface FactsBlock {
  summary: string;
  details: string[];
}

export interface RelatedSummaryItem {
  label: string;
  value: number;
}

export interface RelatedSummarySection {
  title: string;
  items: RelatedSummaryItem[];
}

// Explanation output — NEW mandatory structure
export interface ExplanationOutput {
  type: 'explanation';
  entityId: string;
  entityType: string;

  // Section 1: FACTS — what was read
  facts: FactsBlock;

  // Related summary — lightweight child counts (optional)
  relatedSummary?: RelatedSummarySection[];

  // Section 2: INTERPRETATION — why it matters now (MANDATORY)
  interpretation: InterpretationBlock;

  // Section 3: NAVIGATION — entity role context (MANDATORY)
  navigation: NavigationContext;

  // Section 4: FOLLOW-UPS — guided next steps (MANDATORY, min 2)
  followUps: FollowUpSuggestion[];

  // Legacy fields for backwards compatibility during transition
  title?: string;
  summary?: string;
  details?: string[];
  relatedEntities?: Array<{ type: string; id: number; name: string }>;
}

// Structured follow-up intent (CFI)
export interface FollowUpIntent {
  type: 'FOLLOW_UP_INTENT';
  intent: string;
  entityType: string;
  entityId: string | number;
  origin: {
    entity: string;
    entityId: string | number;
  };
  scope: {
    clientId?: number;
    dossierId?: number;
    lawsuitId?: number;
    sessionId?: number;
    taskId?: number;
    missionId?: number;
    personalTaskId?: number;
    financialEntryId?: number;
  };

  // Context resolution fields (for RESOLVE_CONTEXT_AND_CONTINUE)
  originalIntent?: string;
  originalDraftType?: string;
  originalMessage?: string;
  resolvedEntity?: {
    type: string;
    id: string | number;
    label: string;
  };
  selectionId?: string | number;
  selectionCategory?: string;
  pendingOperationId?: string;
  resolutionInput?: {
    entityType?: string;
    id?: string | number;
    reference?: string;
    name?: string;
  };
  resolution?: {
    decision: 'single' | 'multi' | 'all' | 'none';
    selected: Array<{
      entityType: string;
      entityId: string | number;
      label?: string;
      scope?: {
        clientId?: number;
        dossierId?: number;
        lawsuitId?: number;
        sessionId?: number;
        taskId?: number;
        missionId?: number;
        personalTaskId?: number;
        financialEntryId?: number;
      };
    }>;
  };

  filters?: {
    status?: string | null;
    priority?: string | null;
    timeframe?: string | null;
    paymentStatus?: string | null;
    query?: string | null;
    overdue?: boolean | null;
    activity?: string | null;
    direction?: string | null;
    scope?: string | null;
    severity?: string | null;
  };
}

// Risk item in risk analysis
export interface RiskItem {
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: string;
  description: string;
}

// Risk analysis output
export interface RiskAnalysisOutput {
  type: 'operational_risk_analysis';
  summary: string;
  risks: RiskItem[];
  overallRiskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  overallAssessment?: string;
}

// Draft output
export interface DraftOutput {
  type: 'INVITATION' | 'CLIENT_EMAIL' | 'HEARING_SUMMARY' | 'INTERNAL_NOTE';
  sections: {
    subject?: string;
    greeting?: string;
    body: string;
    closing?: string;
    signature?: string;
  };
  metadata: {
    generatedAt: string;
    language: string;
    targetEntity?: { type: string; id: number };
  };
}

// Action proposal
export interface ActionProposal {
  proposalId: string;
  status: string;
  action: string;
  description: string;
  requiresConfirmation: boolean;
  // V3 fields
  version?: string;
  posture?: string;
  snapshot?: {
    scope: string;
    scopeId: number;
    timestamp: string;
    hash: string;
  };
  userMessageDraft?: string;
  confirmation?: {
    expiresAt?: string;
    extraRiskAck?: boolean;
    warnings?: string[];
    impactSummary?: string[];
    preview?: ConfirmationPreview;
  };
  sessionId?: string;
  actionType?: 'CREATE_ENTITY' | 'UPDATE_ENTITY' | 'DELETE_ENTITY' | 'LINK_ENTITIES' | 'ATTACH_TO_ENTITY' | string;
  toolCategory?: string;
  // Universal operation params (V3)
  params?: {
    // CREATE_ENTITY / UPDATE_ENTITY / DELETE_ENTITY
    entityType?: string;
    payload?: Record<string, any>;
    entityId?: number;
    changes?: Record<string, { from: any; to: any }>;

    // LINK_ENTITIES
    sourceType?: string;
    sourceId?: number;
    targetType?: string;
    targetId?: number;
    linkField?: string;
    mode?: 'add' | 'remove';

    // ATTACH_TO_ENTITY
    target?: { type: string; id: number };
    attachmentType?: 'note' | 'doc_draft' | 'file_ref' | 'generated_document';

    // Legacy params (backward compatibility)
    [key: string]: any;
  };
  reversible?: boolean;
  humanReadableSummary?: string;
  affectedEntities?: Array<{ type: string; id: number; reference?: string }>;
  workflowPreview?: {
    totalSteps: number;
    groupedMode: 'single_entity_type' | 'mixed_entity_types' | string;
    summaryLine: string;
    detailedSummary?: string;
    previewItems: Array<{
      stepId: string;
      index: number;
      actionType: string;
      operation: string;
      entityType: string;
      title?: string | null;
      status?: string | null;
      priority?: string | null;
      parentLinkage?: {
        dossierId?: number | string | null;
        lawsuitId?: number | string | null;
        clientId?: number | string | null;
        dossierReference?: string | null;
        lawsuitReference?: string | null;
        clientReference?: string | null;
      };
      fields?: Record<string, unknown>;
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
    groups?: Array<{
      entityType: string;
      operation: string;
      count: number;
      header: string;
      items: Array<{
        stepId: string;
        index: number;
        title?: string | null;
        status?: string | null;
        priority?: string | null;
      }>;
    }>;
  };
  previewItems?: Array<{
    stepId: string;
    index: number;
    actionType: string;
    operation: string;
    entityType: string;
    title?: string | null;
    status?: string | null;
    priority?: string | null;
    parentLinkage?: Record<string, unknown>;
    fields?: Record<string, unknown>;
  }>;
  preview?: {
    title?: string;
    items?: Array<{
      index?: number;
      entityType?: string | null;
      operation?: string | null;
      title?: string | null;
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
  structured?: StructuredProposal;
  // Frontend-only persisted UI state (stored in chat session history)
  uiState?: {
    status: "pending" | "confirmed" | "cancelled" | "failed";
    error?: string;
    executionResult?: ExecutionResult;
  };
}

// Chat output
export interface ChatOutput {
  type: 'chat';
  message: string;
  timestamp: string;
  source: 'llm' | 'fallback';
}

// Collection item — single entity in a collection result
export interface CollectionItem {
  id: string;
  title: string;
  subtitle?: string;
  status?: string;
  statusSeverity?: 'success' | 'warning' | 'error' | 'neutral';
  priority?: 'critical' | 'high' | 'normal' | 'low';
  date?: string;
  dateLabel?: string;
  metrics?: { label: string; value: string | number }[];
  tags?: string[];
  entityType: string;
  entityId: string;
}

// Collection output — structured multi-entity result
export interface CollectionOutput {
  type: 'collection';
  entityType: string;
  totalCount: number;
  items: CollectionItem[];
  summary: string;
  groupBy?: string;
  sortBy?: string;
  filters?: { field: string; value: string; label: string }[];
  insights?: string[];
  followUps?: FollowUpSuggestion[];
}

// Context Suggestion output — clean contract for entity selection
export interface ContextSuggestionOutput {
  type: 'context_suggestion';
  message: string;
  entityType: string;
  category?: string;
  reason?: 'ambiguous_query' | 'missing_context' | 'multiple_matches';

  // Original execution context (for intent preservation)
  originalIntent?: string;
  originalDraftType?: string;
  originalMessage?: string;
  pendingOperationId?: string;

  suggestions: ContextSuggestionItem[];
  timestamp: string;
  confidence?: number;
  source?: string;

  // Manual override capability
  allowManualInput?: boolean;
  manualInputHint?: string;
  selectionPolicy?: {
    mode: 'single' | 'multi';
    allowAll?: boolean;
    allowNone?: boolean;
    maxChoices?: number;
  };
  actions?: Array<{
    id: string;
    label: string;
    decision: 'single' | 'multi' | 'all' | 'none';
  }>;
}

export interface ContextSuggestionItem {
  id: string;
  entityType: string;
  entityId: number | string;
  label: string;
  subtitle?: string | null;
  metadata: Record<string, string | number>;
  intent: string;
  scope: {
    clientId?: number;
    dossierId?: number;
    lawsuitId?: number;
    sessionId?: number;
    taskId?: number;
    missionId?: number;
    personalTaskId?: number;
    financialEntryId?: number;
  };

  // Resolution context (for intent preservation)
  resolveContext?: {
    originalIntent: string;
    originalDraftType?: string;
    pendingOperationId?: string;
  };
}

// Proposal output — V3 execution proposals
export interface ProposalOutput {
  type: 'proposal';
  proposals: ActionProposal[];
  sessionId: string;
}

export interface EntityCreationFormOutput {
  type: 'entity_creation_form';
  entityType: string;
  prefilled: Record<string, unknown>;
  missingRequired: string[];
  parentSelection?: {
    mode: string;
    options: Array<{ entityType: string; id: number; label: string }>;
  } | null;
}

export interface RecoveryOption {
  label: string;
  action?: string;
  prompt?: string;
}

export interface RecoveryOutput {
  type: 'recovery';
  message: string;
  whatHappened: string;
  canRetry: boolean;
  alternatives: RecoveryOption[];
  suggestedPrompts: string[];
  context?: {
    targetType?: string | null;
    targetId?: number | null;
    reference?: string | null;
    intent?: string | null;
    pendingOperationId?: string | null;
  } | null;
  severity: 'blocking' | 'partial' | 'temporary';
}

export interface DocumentGenerationMissingFieldsOutput {
  type: 'document_generation_missing_fields';
  message: string;
  documentType: string;
  target?: { type: string; id: number };
  missingFields: Array<{
    path: string;
    label: string;
    reason: string;
    example?: string;
  }>;
  schemaVersion?: string;
  templateKey?: string;
}

export interface DocumentGenerationPreviewOutput {
  type: 'document_generation_preview';
  previewId: string;
  documentType: string;
  targetEntity: { type: string; id: number };
  language: string;
  canonicalFormat: string;
  previewFormat: string;
  // Backward compatibility field (equals canonicalFormat).
  format: string;
  templateKey: string;
  schemaVersion: string;
  previewHtml: string;
  contentMarkdown?: string;
  formatSelection?: {
    selectionMode?: 'auto' | 'preference' | 'explicit' | string;
    selectionSource?: string;
    preference?: string;
    artifactKind?: string;
    structureHints?: {
      hasTabularData?: boolean;
      requiresEditing?: boolean;
      intendedForFiling?: boolean;
    };
    warnings?: Array<{ code?: string; message?: string }>;
    [key: string]: unknown;
  };
  storageDecision?: {
    storageHint?: 'inherit' | 'client' | 'dossier' | 'lawsuit' | 'financial_entry' | 'mission' | 'session' | 'task' | string;
    status?: 'resolved' | 'missing' | string;
    resolutionMode?: 'inherit' | 'hint' | string;
    message?: string | null;
    activeScope?: Record<string, unknown> | null;
    resolvedTarget?: { entityType: string; entityId: number } | null;
    [key: string]: unknown;
  };
  structuredSummaryMetadata?: {
    title?: string | null;
    generatedAt?: string | null;
    expiresAt?: string | null;
    status?: string | null;
    [key: string]: unknown;
  };
}

export interface DocumentDraftOutput {
  type: 'document_draft';
  title: string;
  content: string;
  metadata: Record<string, unknown>;
  entityType?: string | null;
  entityId?: number | null;
}

export interface DraftSectionData {
  id: string;
  role: string;
  text?: string;
  label?: string;
}

export interface DraftLayoutData {
  direction: 'ltr' | 'rtl';
  language: string;
  formality: 'formal' | 'standard' | 'casual';
  documentClass: string;
}

export interface DraftVersionEntry {
  version: number;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  content?: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  generatedAt: string;
  instruction?: string;
}

export interface DraftArtifactData {
  type: 'draft_v2';
  draftType: string;
  title: string;
  subtitle?: string;
  metadata?: Record<string, string>;
  sections: DraftSectionData[];
  layout: DraftLayoutData;
  content?: string;
  linkedEntityType?: string;
  linkedEntityId?: number;
  savedDocumentId?: number;
  savedAt?: string;
  generatedAt: string;
  version: number;
  versionHistory?: DraftVersionEntry[];
}

export interface WebSearchResultItem {
  id: string;
  title: string;
  snippet: string;
  url: string;
  source?: string | null;
  publishedDate?: string | null;
}

export interface WebSearchAiSummary {
  shortAnswer: string;
  keyHighlights: string[];
  citations: Array<{ index: number; url: string }>;
}

export interface WebSearchResultsOutput {
  type: 'web_search_results';
  query: string;
  searchIntent: 'WEB_SEARCH';
  triggeredBy: WebSearchTrigger;
  provider: string;
  results: WebSearchResultItem[];
  resultCount: number;
  message?: string | null;
  sources: Array<{ sourceType: string; reference: string; note: string }>;
  timestamp: string;
  status: string;
  aiSummary?: WebSearchAiSummary | null;
  source: string;
  requires_validation: boolean;
}

export interface ChatContextSummaryOutput {
  type: 'chat_context_summary';
  title?: string;
  summary?: string;
  sourceType?: string;
  rows: Array<{ label: string; value: string }>;
}

export interface AssistSuggestionItem {
  actionType: 'CREATE_ENTITY' | 'ADD_NOTE' | 'GENERATE_DOCUMENT' | 'ENRICH_FIELD' | 'DELETE_ENTITY';
  targetEntityType: string | null;
  sourceEntityType: string;
  sourceEntityId: number | string | null;
  label: string;
  reason: string;
  field?: string | null;
  documentType?: string | null;
  domain?: 'draft' | 'execute';
  trigger?: 'implicit_intent' | 'proactive_context';
  prefillData?: Record<string, unknown>;
  followUpPrompt?: string | null;
  decision?: 'accepted' | 'declined';
  decisionAt?: string | null;
  relevanceScore: number;
  finalScore: number;
}

export interface AssistSuggestionsOutput {
  type: 'assist_suggestions';
  suggestions: AssistSuggestionItem[];
  generatedAt: string;
}

// Execution result — V3 execution confirmation result
export interface ExecutionResult {
  type: 'execution_result';
  proposalId: string;
  status: 'success' | 'failed' | 'snapshot_mismatch';
  executedActions?: Array<{
    actionType: string;
    result: Record<string, unknown>;
    executedAt: string;
  }>;
  error?: {
    code: string;
    message: string;
    safeMessage: string;
    requiresReproposal: boolean;
    details?: Record<string, unknown>;
  };
  audit?: {
    userId?: number;
    sessionId?: string;
    executedAt?: string;
    snapshotValidation?: {
      expected: string;
      actual: string;
      matched: boolean;
    };
  };
  idempotent?: boolean;
}

export type AgentOutput =
  | ChatOutput
  | ExplanationOutput
  | RiskAnalysisOutput
  | DraftOutput
  | DraftArtifactData
  | DocumentDraftOutput
  | DocumentGenerationPreviewOutput
  | DocumentGenerationMissingFieldsOutput
  | ClarificationOutput
  | CollectionOutput
  | ContextSuggestionOutput
  | ProposalOutput
  | EntityCreationFormOutput
  | RecoveryOutput
  | WebSearchResultsOutput
  | ChatContextSummaryOutput
  | AssistSuggestionsOutput
  | { type: 'action_plan'; actions: ActionProposal[] };

// Agent response from backend
export interface AgentResponse {
  status: 'ok' | 'error';
  data?: {
    intent: string;
    agentVersion: string;
    reasoner: string;
    output: AgentOutput;
    ledgerEntryId: string;
    contextLifecycle?: ContextLifecycleEvent | null;
  };
  error?: string;
}

// Processed response for UI consumption
export interface ProcessedAgentResponse {
  success: boolean;
  intent: string;
  agentVersion: string;
  // Structured data
  chat?: ChatOutput;
  explanation?: ExplanationOutput;
  risks?: RiskAnalysisOutput;
  draft?: DraftOutput;
  clarification?: ClarificationOutput;
  collection?: CollectionOutput;
  contextSuggestion?: ContextSuggestionOutput;
  proposal?: ProposalOutput;
  entityCreationForm?: EntityCreationFormOutput;
  recovery?: RecoveryOutput;
  documentGenerationPreview?: DocumentGenerationPreviewOutput;
  documentGenerationMissingFields?: DocumentGenerationMissingFieldsOutput;
  webSearchResults?: WebSearchResultsOutput;
  assistSuggestions?: AssistSuggestionsOutput;
  actionProposals?: ActionProposal[];
  // Error info
  error?: string;
  // For display
  displayText: string;
}

/**
 * Send a message to the agent and get a response
 */
export async function sendAgentMessage(
  message: string,
  options: {
    contextScope?: ContextScope;
    contextRefs?: ContextRefs;
    agentVersion?: AgentVersion;
    followUpIntent?: FollowUpIntent;
    metadata?: AgentRequestMetadata;
    sessionId: string; // REQUIRED
  }
): Promise<ProcessedAgentResponse> {
  const {
    contextScope = 'GLOBAL',
    contextRefs = {},
    agentVersion = 'v1',
    followUpIntent,
    metadata,
    sessionId,
  } = options;

  const request: AgentRequest & {
    followUpIntent?: FollowUpIntent;
    metadata?: AgentRequestMetadata;
  } = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
    },
    agentVersion,
    reasoner: 'rule',
    sessionId,
  };
  if (followUpIntent) {
    request.followUpIntent = followUpIntent;
  }
  if (metadata) {
    request.metadata = metadata;
  }

  try {
    const response = await apiClient.post<AgentResponse>('/agent/run', request);

    if (response.status !== 'ok' || !response.data) {
      return {
        success: false,
        intent: 'UNKNOWN',
        agentVersion,
        error: response.error || 'Unknown error',
        displayText: response.error || 'Unknown error',
      };
    }

    const { intent, output } = response.data;

    // Process based on output type
    const processed: ProcessedAgentResponse = {
      success: true,
      intent,
      agentVersion: response.data.agentVersion,
      displayText: '',
    };

    if (output.type === 'chat') {
      processed.chat = output as ChatOutput;
      processed.displayText = (output as ChatOutput).message;
    } else if (output.type === 'explanation') {
      processed.explanation = output as ExplanationOutput;
      processed.displayText = '';
    } else if (output.type === 'operational_risk_analysis') {
      processed.risks = output as RiskAnalysisOutput;
      processed.displayText = '';
    } else if (['INVITATION', 'CLIENT_EMAIL', 'HEARING_SUMMARY', 'INTERNAL_NOTE'].includes(output.type)) {
      processed.draft = output as DraftOutput;
      processed.displayText = '';
    } else if (output.type === 'clarification' || output.type === 'routing_clarification') {
      processed.clarification = output as ClarificationOutput;
      processed.displayText = '';
    } else if (output.type === 'collection') {
      processed.collection = output as CollectionOutput;
      processed.displayText = '';
    } else if (output.type === 'context_suggestion') {
      processed.contextSuggestion = output as ContextSuggestionOutput;
      processed.displayText = '';
    } else if (output.type === 'proposal') {
      processed.proposal = output as ProposalOutput;
      processed.displayText = '';
    } else if (output.type === 'entity_creation_form') {
      processed.entityCreationForm = output as EntityCreationFormOutput;
      processed.displayText = '';
    } else if (output.type === 'recovery') {
      processed.recovery = output as RecoveryOutput;
      processed.displayText = '';
    } else if (output.type === 'document_generation_preview') {
      processed.documentGenerationPreview =
        output as DocumentGenerationPreviewOutput;
      processed.displayText = '';
    } else if (output.type === 'document_generation_missing_fields') {
      processed.documentGenerationMissingFields =
        output as DocumentGenerationMissingFieldsOutput;
      processed.displayText = '';
    } else if (output.type === 'web_search_results') {
      processed.webSearchResults = output as WebSearchResultsOutput;
      processed.displayText = '';
    } else if (output.type === 'action_plan') {
      const actionPlan = output as { type: 'action_plan'; actions: ActionProposal[] };
      processed.actionProposals = actionPlan.actions;
      processed.displayText = '';
    } else if (output.type === 'assist_suggestions') {
      processed.assistSuggestions = output as AssistSuggestionsOutput;
      processed.displayText = '';
    }

    return processed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      intent: 'UNKNOWN',
      agentVersion,
      error: errorMessage,
      displayText: errorMessage,
    };
  }
}

/**
 * Get available intents (for UI hints)
 */
export const AGENT_INTENTS = {
  EXPLAIN_ENTITY_STATE: 'EXPLAIN_ENTITY_STATE',
  SUMMARIZE_SESSION: 'SUMMARIZE_SESSION',
  ANALYZE_OPERATIONAL_RISKS: 'ANALYZE_OPERATIONAL_RISKS',
  DRAFT_INVITATION: 'DRAFT_INVITATION',
  DRAFT_CLIENT_EMAIL: 'DRAFT_CLIENT_EMAIL',
  PROPOSE_ACTIONS: 'PROPOSE_ACTIONS',
} as const;

/**
 * Example prompts for each intent (for quick actions)
 */
export const INTENT_EXAMPLES: Record<string, string[]> = {
  EXPLAIN_ENTITY_STATE: [
    'Explain the current status of this dossier',
    'What is the state of this client account?',
    'Summarize this lawsuit status',
  ],
  ANALYZE_OPERATIONAL_RISKS: [
    'What are the operational risks for this dossier?',
    'Identify potential issues with upcoming deadlines',
    'Analyze risks for overdue tasks',
  ],
  DRAFT_INVITATION: [
    'Draft an invitation for the next hearing',
    'Create a meeting invitation for the client',
  ],
  DRAFT_CLIENT_EMAIL: [
    'Draft an email update for the client',
    'Write a status update email',
  ],
  PROPOSE_ACTIONS: [
    'What actions should I take next?',
    'Suggest next steps for this lawsuit',
  ],
};

/**
 * Confirm and execute a proposal (V3 only)
 *
 * Sends confirmation to backend, which validates snapshot, posture, permissions
 * and executes the action
 *
 * @param proposalId - Proposal ID to confirm
 * @param sessionId - Session ID
 * @returns ExecutionResult
 */
export async function confirmProposal(
  proposalId: string,
  sessionId: string,
  options: { ackRisk?: boolean } = {}
): Promise<ExecutionResult> {
  try {
    const asRecord = (value: unknown): Record<string, unknown> | null => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return null;
      return value as Record<string, unknown>;
    };
    let apiBase = getApiBase();
    if (isElectron()) {
      const backendConfig = getBackendConfig();
      if (backendConfig?.httpApiUrl) {
        apiBase = backendConfig.httpApiUrl;
      } else if (backendConfig?.apiUrl && !backendConfig.apiUrl.startsWith("ipc")) {
        apiBase = backendConfig.apiUrl;
      } else {
        throw new Error("Agent confirmation requires HTTP backend connection.");
      }
    }

    const confirmMessage = options.ackRisk === true ? "yes, confirm and accept risk" : "yes, confirm";
    const requestBody = {
      sessionId,
      turnId: createAgentV2TurnId(),
      message: confirmMessage,
      metadata: buildAgentV2Metadata({
        metadata: {
          requestSource: "proposal_confirm",
          requestTriggerId: `confirm_${Date.now()}`,
        },
        contextScope: "GLOBAL",
        contextRefs: {},
        dataAccess: undefined,
        followUpIntent: undefined,
        agentVersion: "v2",
      }),
    };

    const response = await fetch(`${apiBase}/agent/v2/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok || !response.body) {
      const text = await response.text().catch(() => "");
      throw new Error(text || `Confirmation failed (HTTP ${response.status})`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentEvent = "";
    let currentData = "";
    let resolvedExecution: ExecutionResult | null = null;
    let streamError: string | null = null;

    const processEvent = () => {
      if (!currentEvent || !currentData) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(currentData);
      } catch {
        parsed = null;
      }
      const payload = asRecord(parsed);
      if (currentEvent === "plan_executed") {
        const artifact = asRecord(payload?.artifact);
        const pendingActionId = String(artifact?.pendingActionId || proposalId);
        const stepResultsRaw = Array.isArray(artifact?.stepResults)
          ? artifact.stepResults
          : [];
        const mappedStepResults = stepResultsRaw
          .map((row) => {
            const step = asRecord(row);
            if (!step) return null;
            const stepResult = asRecord(step.result);
            return {
              ...step,
              result: stepResult
                ? {
                    ...stepResult,
                    ok: stepResult.ok === false ? false : step.ok === true,
                  }
                : undefined,
            };
          })
          .filter(Boolean);
        if (artifact?.ok === true) {
          const result = asRecord(artifact?.result);
          const entityType = String(result?.entityType || "").trim().toLowerCase();
          const entityIdNum = Number(result?.entityId);
          const hasEntity = Boolean(entityType) && Number.isInteger(entityIdNum) && entityIdNum > 0;
          const operation = String(result?.operation || "update").trim().toLowerCase();
          const actionType =
            operation === "create"
              ? "CREATE_ENTITY"
              : operation === "delete"
              ? "DELETE_ENTITY"
              : "UPDATE_ENTITY";
          resolvedExecution = {
            type: "execution_result",
            proposalId: pendingActionId,
            status: "success",
            ...(hasEntity
              ? {
                  executedActions: [
                    {
                      actionType,
                      executedAt: new Date().toISOString(),
                      result: {
                        ...(result || {}),
                        entityType,
                        entityId: entityIdNum,
                        operation,
                        ok: true,
                        ...(mappedStepResults.length > 0 ? { stepResults: mappedStepResults } : {}),
                      },
                    },
                  ],
                }
              : {}),
            audit: { executedAt: new Date().toISOString() },
          };
          return;
        }
        const message =
          String(artifact?.errorMessage || "").trim() || "Could not apply that change.";
        resolvedExecution = {
          type: "execution_result",
          proposalId: pendingActionId,
          status: "failed",
          ...(mappedStepResults.length > 0
            ? {
                executedActions: [
                  {
                    actionType: "EXECUTE_MUTATION_WORKFLOW",
                    executedAt: new Date().toISOString(),
                    result: {
                      ok: false,
                      stepResults: mappedStepResults,
                    },
                  },
                ],
              }
            : {}),
          error: {
            code: String(artifact?.errorCode || "PLAN_EXECUTION_FAILED"),
            message,
            safeMessage: toSafeExecutionErrorMessage(message),
            requiresReproposal: false,
          },
        };
        return;
      }
      if (currentEvent === "plan_rejected") {
        const artifact = asRecord(payload?.artifact);
        resolvedExecution = {
          type: "execution_result",
          proposalId: String(artifact?.pendingActionId || proposalId),
          status: "failed",
          error: {
            code: "PLAN_REJECTED",
            message: "Planned action was rejected.",
            safeMessage: "Planned action was rejected.",
            requiresReproposal: false,
          },
        };
        return;
      }
      if (currentEvent === "error") {
        streamError =
          String(payload?.message || payload?.error || "").trim() ||
          "Could not confirm the action. Please try again.";
      }
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const rawLine of lines) {
        const line = rawLine.replace(/\r$/, "");
        if (!line) {
          processEvent();
          currentEvent = "";
          currentData = "";
          continue;
        }
        if (line.startsWith("event:")) {
          currentEvent = line.slice(6).trim();
          continue;
        }
        if (line.startsWith("data:")) {
          currentData = currentData
            ? `${currentData}\n${line.slice(5).trim()}`
            : line.slice(5).trim();
        }
      }
    }

    if (resolvedExecution) {
      return resolvedExecution;
    }
    if (streamError) {
      throw new Error(streamError);
    }
    throw new Error("Could not confirm the action. No execution result returned.");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Return a failed ExecutionResult
    return {
      type: 'execution_result',
      proposalId,
      status: 'failed',
      error: {
        code: 'CONFIRMATION_ERROR',
        message: errorMessage,
        safeMessage: 'Could not confirm the action. Please try again.',
        requiresReproposal: false,
      },
    };
  }
}

export async function confirmDocumentGenerationPreview(
  previewId: string,
  sessionId?: string,
  editedMarkdown?: string
): Promise<ProposalOutput | ContextSuggestionOutput> {
  const response = await apiClient.post<{
    status: string;
    data?: { output?: ProposalOutput | ContextSuggestionOutput };
    error?: string;
  }>('/agent/document-generation/preview/confirm', { previewId, sessionId, editedMarkdown });

  if (response.status !== 'ok' || !response.data?.output) {
    throw new Error(response.error || 'Preview confirmation failed');
  }

  return response.data.output;
}

export async function cancelDocumentGenerationPreview(
  previewId: string
): Promise<{ cancelled: boolean; reason?: string }> {
  const response = await apiClient.post<{
    status: string;
    data?: { cancelled?: boolean; reason?: string };
    error?: string;
  }>('/agent/document-generation/preview/cancel', { previewId });

  if (response.status !== 'ok' || !response.data) {
    throw new Error(response.error || 'Preview cancellation failed');
  }

  return {
    cancelled: Boolean(response.data.cancelled),
    reason: response.data.reason,
  };
}

// ============================================================================
// Slash Commands API
// ============================================================================

/** Slash command definition */
export interface SlashCommand {
  command: string;
  description: string;
  usage: string;
  category: string;
}

/** Cache for commands to avoid repeated fetches */
let commandsCache: SlashCommand[] | null = null;

/**
 * Fetch available slash commands for autocomplete
 */
export async function getSlashCommands(): Promise<SlashCommand[]> {
  if (commandsCache) {
    return commandsCache;
  }

  try {
    const response = await apiClient.get<{ status: string; data: SlashCommand[] }>('/agent/commands');
    if (response.status === 'ok' && response.data) {
      commandsCache = response.data;
      return response.data;
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Filter commands based on user input
 * @param input - Current input text
 * @param commands - Available commands
 */
export function filterCommands(input: string, commands: SlashCommand[]): SlashCommand[] {
  if (!input.startsWith('/')) return [];

  const query = input.toLowerCase();

  // If just "/" show all commands
  if (query === '/') {
    return commands;
  }

  // Filter by command prefix
  return commands.filter(cmd =>
    cmd.command.toLowerCase().startsWith(query) ||
    cmd.command.toLowerCase().includes(query.slice(1))
  );
}

// ============================================================================
// Commentary Layer Types (Agent V1 Intelligence Layer)
// ============================================================================

/**
 * Commentary output — conversational message ABOUT the structured artifact.
 *
 * Commentary is generated AFTER artifacts and:
 * - Acknowledges what was found
 * - Explains relevance if urgent signals exist
 * - Asks clarification if ambiguity exists
 * - Suggests read-only next steps
 *
 * Commentary NEVER:
 * - Repeats facts verbatim
 * - Proposes write actions
 * - Invents urgency
 */
export interface CommentaryOutput {
  message?: string;
  source: 'llm' | 'fallback' | 'skipped' | 'failed';
  kind?: 'commentary';
  lines?: string[];
  options?: Array<{ label: string; value: string }>;
  question?: string | null;
  signals?: SemanticSignal[];
  visibility?: 'visible' | 'metadata';
  interactionMode?: 'conversational' | 'operational';
}

export interface IntentFramingOutput {
  kind: 'intent';
  summary: string;
  contextEcho: string | null;
  nextQuestion: string | null;
  visibility?: 'visible' | 'metadata';
  interactionMode?: 'conversational' | 'operational';
}

// ============================================================================
// Streaming API
// ============================================================================

/** SSE event types from the streaming endpoint */
export type StreamEventType =
  | 'turn.start'
  | 'turn.end'
  | 'action'
  | 'intent.delta'
  | 'intent.final'
  | 'intent.failed'
  | 'artifact.delta'
  | 'artifact.final'
  | 'artifact.failed'
  | 'commentary.delta'
  | 'commentary.final'
  | 'commentary.failed'
  | 'start'
  | 'status'
  | 'intent'
  | 'intent_framing'
  | 'intent_framing_chunk'
  | 'chunk'
  | 'result'
  | 'artifact'
  | 'commentary'
  | 'commentary_chunk'
  | 'done'
  | 'error'
  | 'cancelled'
  | 'entity_mutation_success'
  | 'draft_artifact'
  | 'plan_artifact'
  | 'plan_executed'
  | 'plan_rejected'
  | 'suggestion_artifact'
  | 'pending'
  | 'confirmed'
  | 'disambiguation';

/**
 * Status event data - describes what the agent is currently doing.
 * Emitted during processing to provide real-time feedback.
 */
export interface StatusEventData {
  action: string;      // e.g., "Reading tasks…", "Analyzing dossier status…"
  progress?: number;   // Optional progress percentage (0-100)
  phase?: string;      // Optional phase identifier
}

export interface ChatMutationLifecycleEvent {
  turnKey?: string;
  kind: 'mutation_execution';
  entityType?: string;
  entityId?: number | string;
  operation?: 'create' | 'update' | 'delete' | string;
  label?: string;
}

export interface PlanOperationEventData {
  operation: 'create' | 'update' | 'delete';
  entityType: string;
  entityId?: number | string;
  payload?: Record<string, unknown>;
  changes?: Record<string, unknown>;
  reason?: string;
}

export interface PlanPreviewFieldEventData {
  key: string;
  from?: unknown;
  to?: unknown;
}

export interface PlanPreviewEventData {
  title?: string;
  subtitle?: string;
  fields?: PlanPreviewFieldEventData[];
  warnings?: string[];
  scope?: 'single_entity' | 'workflow' | string;
  root?: {
    type?: string;
    id?: number | null;
    label?: string;
    operation?: string;
  };
  primaryChanges?: ConfirmationPreviewChange[];
  cascadeSummary?: ConfirmationPreviewCascadeGroup[];
  effects?: string[];
  reversibility?: 'reversible' | 'not_reversible' | 'unknown' | string;
  linking?: ConfirmationPreviewLinking;
  decisions?: Array<{
    key: string;
    title: string;
    description: string;
  }>;
}

export interface PlanArtifactEventData {
  pendingActionId: string;
  operation: PlanOperationEventData;
  summary: string;
  preview?: PlanPreviewEventData;
  workflow?: {
    totalSteps: number;
    steps: Array<Record<string, unknown>>;
    requiresUserDecision?: boolean;
  };
}

export interface PlanExecutedEventData {
  pendingActionId: string;
  ok: boolean;
  result?: Record<string, unknown>;
  stepResults?: Array<Record<string, unknown>>;
  failedStepId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: Record<string, unknown>;
}

export interface PlanRejectedEventData {
  pendingActionId: string;
}

export type SuggestionArtifactVersion = 'v1';
export type SuggestionArtifactDomain = 'draft' | 'execute';
export type SuggestionArtifactTrigger = 'implicit_intent' | 'proactive_context';
export type SuggestionArtifactActionType = 'draft' | 'create' | 'update' | 'delete';

export interface SuggestionArtifactEventData {
  version: SuggestionArtifactVersion;
  domain: SuggestionArtifactDomain;
  trigger: SuggestionArtifactTrigger;
  actionType: SuggestionArtifactActionType;
  targetType: string;
  title: string;
  reason: string;
  linkedEntityType?: string;
  linkedEntityId?: number | string;
  prefillData: Record<string, unknown>;
}

function toSuggestionRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toSuggestionText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function parseSuggestionActionType(
  value: unknown,
): SuggestionArtifactActionType | null {
  const normalized = toSuggestionText(value)?.toLowerCase();
  if (normalized === 'generate_document' || normalized === 'generatedocument') return 'draft';
  if (normalized === 'create_entity' || normalized === 'createentity') return 'create';
  if (normalized === 'enrich_field' || normalized === 'enrichfield') return 'update';
  if (normalized === 'update_entity' || normalized === 'updateentity') return 'update';
  if (normalized === 'delete_entity' || normalized === 'deleteentity') return 'delete';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'create') return 'create';
  if (normalized === 'update') return 'update';
  if (normalized === 'delete') return 'delete';
  return null;
}

function parseSuggestionDomain(value: unknown): SuggestionArtifactDomain | null {
  const normalized = toSuggestionText(value)?.toLowerCase();
  if (normalized === 'execution' || normalized === 'plan' || normalized === 'mutation') return 'execute';
  if (normalized === 'document') return 'draft';
  if (normalized === 'draft') return 'draft';
  if (normalized === 'execute') return 'execute';
  return null;
}

function parseSuggestionTrigger(value: unknown): SuggestionArtifactTrigger | null {
  const normalized = toSuggestionText(value)?.toLowerCase();
  if (normalized === 'implicit') return 'implicit_intent';
  if (normalized === 'context') return 'proactive_context';
  if (normalized === 'implicit_intent') return 'implicit_intent';
  if (normalized === 'proactive_context') return 'proactive_context';
  return null;
}

function normalizeSuggestionDomain(
  domain: SuggestionArtifactDomain | null,
  actionType: SuggestionArtifactActionType,
): SuggestionArtifactDomain {
  const inferred: SuggestionArtifactDomain =
    actionType === 'draft' ? 'draft' : 'execute';
  if (!domain) return inferred;
  if (actionType === 'draft' && domain !== 'draft') return inferred;
  if (actionType !== 'draft' && domain !== 'execute') return inferred;
  return domain;
}

function toSuggestionEntityId(value: unknown): number | string | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  const normalized = toSuggestionText(value);
  return normalized ?? undefined;
}

function parseSuggestionArtifactEventData(
  value: unknown,
): SuggestionArtifactEventData | null {
  const artifact = toSuggestionRecord(value);
  if (!artifact) return null;
  const parsedDomain = parseSuggestionDomain(artifact.domain);
  const actionType =
    parseSuggestionActionType(artifact.actionType) ??
    (parsedDomain === 'draft' ? 'draft' : parsedDomain === 'execute' ? 'update' : null);
  const targetType =
    toSuggestionText(artifact.targetType) ||
    toSuggestionText(artifact.targetEntityType) ||
    toSuggestionText(artifact.entityType) ||
    'record';
  const title =
    toSuggestionText(artifact.title) ||
    toSuggestionText(artifact.label) ||
    'Suggested action';
  const reason =
    toSuggestionText(artifact.reason) ||
    toSuggestionText(artifact.rationale) ||
    toSuggestionText(artifact.description) ||
    'Suggested based on current context.';
  if (!actionType) {
    return null;
  }
  const linkedEntityType =
    toSuggestionText(artifact.linkedEntityType) ||
    toSuggestionText(artifact.sourceEntityType);
  const linkedEntityId =
    toSuggestionEntityId(artifact.linkedEntityId) ??
    toSuggestionEntityId(artifact.sourceEntityId) ??
    toSuggestionEntityId(artifact.entityId);
  const prefillData =
    toSuggestionRecord(artifact.prefillData) ??
    toSuggestionRecord(artifact.payload) ??
    toSuggestionRecord(artifact.changes) ??
    {};

  return {
    version: 'v1',
    domain: normalizeSuggestionDomain(parsedDomain, actionType),
    trigger: parseSuggestionTrigger(artifact.trigger) ?? 'proactive_context',
    actionType,
    targetType,
    title,
    reason,
    ...(linkedEntityType ? { linkedEntityType } : {}),
    ...(typeof linkedEntityId !== 'undefined' ? { linkedEntityId } : {}),
    prefillData,
  };
}

export function extractChatMutationLifecycleEvent(
  value: unknown,
): ChatMutationLifecycleEvent | null {
  const payload = ((value as { payload?: unknown } | null | undefined)?.payload ??
    value) as Partial<ChatMutationLifecycleEvent> | null | undefined;
  if (!payload || payload.kind !== 'mutation_execution') return null;
  return payload as ChatMutationLifecycleEvent;
}

/** Callback for stream events */
export interface StreamCallbacks {
  onStart?: (data: { intent: string; agentVersion: string }) => void;
  onStatus?: (data: StatusEventData) => void;
  onChatMutationLifecycle?: (data: ChatMutationLifecycleEvent) => void;
  onIntentFraming?: (data: { message: string; messageType?: string; signal?: SemanticSignal | null; structured?: IntentFramingOutput; visibility?: 'visible' | 'metadata'; interactionMode?: 'conversational' | 'operational' }) => void;
  /** Streaming chunk for intent framing message (for real-time display) */
  onIntentFramingChunk?: (chunk: string) => void;
  onChunk?: (content: string) => void;
  onResult?: (data: { output: AgentOutput; intent: string; contextLifecycle?: ContextLifecycleEvent | null; visibility?: 'visible' | 'metadata'; interactionMode?: 'conversational' | 'operational'; mutationOutcome?: { status?: string; entityType?: string; entityId?: number | string; operation?: string } | null }) => void;
  onCommentary?: (data: CommentaryOutput) => void;
  /** Streaming chunk for commentary message (for real-time display) */
  onCommentaryChunk?: (chunk: string) => void;
  onDone?: (data: { timestamp: string; fullContent?: string; mutationOutcome?: { status?: string; entityType?: string; entityId?: number | string; operation?: string } | null }) => void;
  onDraftArtifact?: (artifact: DraftArtifactData) => void;
  onPlanArtifact?: (artifact: PlanArtifactEventData) => void;
  onPlanExecuted?: (artifact: PlanExecutedEventData) => void;
  onPlanRejected?: (artifact: PlanRejectedEventData) => void;
  onSuggestionArtifact?: (artifact: SuggestionArtifactEventData) => void;
  onMutationEvent?: (event: EntityMutationSuccessEvent) => void;
  onError?: (error: string) => void;
  onCancelled?: () => void;
}

const SUPPRESSED_AUXILIARY_STREAM_EVENTS = new Set<string>([
  'intent.delta',
  'intent.final',
  'intent.failed',
  'commentary.delta',
  'commentary.final',
  'commentary.failed',
  'intent',
  'intent_framing',
  'intent_framing_chunk',
  'commentary',
  'commentary_chunk',
]);

const CHROMIUM_UNSAFE_PORTS = new Set<number>([
  1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79,
  87, 95, 101, 102, 103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137,
  139, 143, 161, 179, 389, 427, 465, 512, 513, 514, 515, 526, 530, 531, 532,
  540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993, 995, 1719, 1720, 1723,
  2049, 3659, 4045, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668, 6669, 6697,
  10080,
]);

function isUnsafeBrowserPortFromBase(apiBase: string): boolean {
  try {
    const parsed = new URL(apiBase);
    const port = Number.parseInt(parsed.port || "", 10);
    return Number.isInteger(port) && CHROMIUM_UNSAFE_PORTS.has(port);
  } catch {
    return false;
  }
}

function buildLocalRecoveryOutput(
  message: string,
  severity: 'blocking' | 'partial' | 'temporary' = 'temporary',
): RecoveryOutput {
  return {
    type: 'recovery',
    message: 'I could not complete that request.',
    whatHappened: message,
    canRetry: true,
    alternatives: [
      { label: 'Retry request', action: 'retry', prompt: 'Retry the same request' },
      { label: 'Narrow scope', action: 'narrow_scope', prompt: 'Try again with a narrower scope' },
    ],
    suggestedPrompts: ['Retry the same request', 'Try again with a narrower scope'],
    context: null,
    severity,
  };
}

function toSafeExecutionErrorMessage(raw: string): string {
  const message = String(raw || '').trim();
  if (!message) return 'Could not apply that change. Please review and try again.';
  const lower = message.toLowerCase();
  if (
    lower.includes('constraint failed') ||
    lower.includes('sqlite') ||
    lower.includes('sql') ||
    lower.includes('not null') ||
    lower.includes('foreign key') ||
    lower.includes('unique')
  ) {
    return 'Could not apply that change because one or more values are not valid.';
  }
  if (message.length > 220) {
    return 'Could not apply that change. Please review and try again.';
  }
  return message;
}

function createAgentV2TurnId(): string {
  return `turn_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function buildAgentV2Metadata(params: {
  metadata?: AgentRequestMetadata;
  contextScope: ContextScope;
  contextRefs: ContextRefs;
  dataAccess?: DataAccessPermissions;
  followUpIntent?: FollowUpIntent;
  agentVersion: AgentVersion;
  documentIds?: number[];
}): Record<string, unknown> {
  const base = { ...(params.metadata || {}) } as Record<string, unknown>;
  base.contextScope = params.contextScope;
  base.contextRefs = params.contextRefs;
  base.dataAccess = params.dataAccess || null;
  base.clientAgentVersion = params.agentVersion;
  if (params.followUpIntent) {
    base.followUpIntent = params.followUpIntent;
  }
  if (Array.isArray(params.documentIds) && params.documentIds.length > 0) {
    base.documentIds = params.documentIds;
  }
  return base;
}

/**
 * Stream a message to the agent with real-time token delivery
 * Uses SSE (Server-Sent Events) via fetch ReadableStream
 *
 * @param message - User message
 * @param options - Request options
 * @param callbacks - Event callbacks for streaming updates
 * @returns AbortController to cancel the stream
 */
export function streamAgentMessage(
  message: string,
  options: {
    contextScope?: ContextScope;
    contextRefs?: ContextRefs;
    agentVersion?: AgentVersion;
    dataAccess?: DataAccessPermissions;
    followUpIntent?: FollowUpIntent;
    metadata?: AgentRequestMetadata;
    /** Agent conversation session ID — REQUIRED for continuity */
    sessionId: string;
    /** Document IDs explicitly attached to this message */
    documentIds?: number[];
  },
  callbacks: StreamCallbacks
): AbortController {
  const { contextScope = 'GLOBAL', contextRefs = {}, agentVersion = 'v1', dataAccess, followUpIntent, metadata, sessionId, documentIds } = options;
  const abortController = new AbortController();
  const useAgentV2Stream = true;
  const v2TurnId = createAgentV2TurnId();

  const request: AgentRequest & {
    dataAccess?: DataAccessPermissions;
    followUpIntent?: FollowUpIntent;
    metadata?: AgentRequestMetadata;
    documentIds?: number[];
  } = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
      dataAccess,
    },
    agentVersion,
    sessionId,
  };
  if (followUpIntent) {
    request.followUpIntent = followUpIntent;
  }
  if (metadata) {
    request.metadata = metadata;
  }
  if (documentIds && documentIds.length > 0) {
    request.documentIds = documentIds;
  }

  const v2Request = {
    sessionId,
    turnId: v2TurnId,
    message,
    metadata: buildAgentV2Metadata({
      metadata,
      contextScope,
      contextRefs,
      dataAccess,
      followUpIntent,
      agentVersion,
      documentIds,
    }),
  };

  // Start streaming in background
  (async () => {
    let clearSmoothingState: (() => void) | null = null;
    try {
      console.info(
        "[AGENT_FRONT_STREAM_REQUEST]",
        JSON.stringify({
          sessionId,
          turnId: v2TurnId,
          requestSource: metadata?.requestSource || "unknown",
          requestTriggerId: metadata?.requestTriggerId || null,
          messagePreview: String(message || "").slice(0, 140),
        }),
      );
      const fallbackToRecovery = async (reason: string) => {
        callbacks.onStart?.({
          intent: 'CHATBOT_AGENT_MODE',
          agentVersion: 'v2',
        });
        callbacks.onResult?.({
          output: buildLocalRecoveryOutput(reason, 'temporary'),
          intent: 'RECOVERY',
          visibility: 'visible',
          interactionMode: 'operational',
        });
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
      };

      // SSE streaming requires a direct HTTP connection; it cannot be proxied
      // through Electron IPC. In Electron mode, we use the HTTP URL directly.
      let apiBase = getApiBase();
      
      if (isElectron()) {
        const backendConfig = getBackendConfig();
        if (backendConfig?.httpApiUrl) {
          // Use the HTTP URL for streaming
          apiBase = backendConfig.httpApiUrl;
        } else if (backendConfig?.apiUrl && !backendConfig.apiUrl.startsWith('ipc')) {
          apiBase = backendConfig.apiUrl;
        } else {
          callbacks.onError?.('Agent streaming requires HTTP connection. Backend not accessible via HTTP.');
          return;
        }
      }

      if (isUnsafeBrowserPortFromBase(apiBase)) {
        await fallbackToRecovery(
          `Streaming endpoint ${apiBase} uses a browser-blocked port. Unable to open Agent v2 stream.`,
        );
        return;
      }

      const streamPath = useAgentV2Stream ? '/agent/v2/stream' : '/agent/chat';
      const streamBody = useAgentV2Stream ? v2Request : request;
      const response = await fetch(`${apiBase}${streamPath}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(streamBody),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        const messageText = text || `The service returned HTTP ${response.status}.`;
        callbacks.onError?.(messageText);
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
        return;
      }

      callbacks.onStart?.({
        intent: 'CHATBOT_AGENT_MODE',
        agentVersion: 'v2',
      });

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError?.('No response body received from the service.');
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let currentData = '';
      let hasStartEnvelope = true;
      let hasResultEnvelope = false;
      let hasErrorEnvelope = false;
      let hasDoneEnvelope = false;
      let hasChunkEnvelope = false;
      let smoothingQueue = '';
      let smoothingTimer: ReturnType<typeof setTimeout> | null = null;
      const pendingTerminalEvents: Array<
        | { type: 'error'; message: string }
        | { type: 'done'; payload: { timestamp: string; fullContent?: string; mutationOutcome?: { status?: string; entityType?: string; entityId?: number | string; operation?: string } | null } }
      > = [];

      clearSmoothingState = () => {
        if (smoothingTimer) {
          clearTimeout(smoothingTimer);
          smoothingTimer = null;
        }
        smoothingQueue = '';
        pendingTerminalEvents.length = 0;
      };

      const charsPerStep = (queueLength: number): number => {
        if (queueLength > 1200) return 20;
        if (queueLength > 700) return 14;
        if (queueLength > 350) return 10;
        if (queueLength > 150) return 7;
        return 4;
      };

      const flushTerminalEventsIfIdle = () => {
        if (smoothingQueue.length > 0) return;
        while (pendingTerminalEvents.length > 0) {
          const next = pendingTerminalEvents.shift();
          if (!next) break;
          if (next.type === 'error') {
            callbacks.onError?.(next.message);
          } else {
            callbacks.onDone?.(next.payload);
          }
        }
      };

      const drainSmoothingQueue = () => {
        smoothingTimer = null;
        if (abortController.signal.aborted) {
          clearSmoothingState?.();
          return;
        }

        if (smoothingQueue.length > 0) {
          const take = Math.min(charsPerStep(smoothingQueue.length), smoothingQueue.length);
          const piece = smoothingQueue.slice(0, take);
          smoothingQueue = smoothingQueue.slice(take);
          callbacks.onChunk?.(piece);
        }

        if (smoothingQueue.length > 0) {
          smoothingTimer = setTimeout(drainSmoothingQueue, 20);
          return;
        }

        flushTerminalEventsIfIdle();
      };

      const scheduleSmoothingDrain = () => {
        if (smoothingTimer) return;
        smoothingTimer = setTimeout(drainSmoothingQueue, 0);
      };

      const enqueueSmoothChunk = (content: string) => {
        if (!content) return;
        smoothingQueue += content;
        scheduleSmoothingDrain();
      };

      const enqueueTerminalEvent = (
        event:
          | { type: 'error'; message: string }
          | { type: 'done'; payload: { timestamp: string; fullContent?: string; mutationOutcome?: { status?: string; entityType?: string; entityId?: number | string; operation?: string } | null } },
      ) => {
        pendingTerminalEvents.push(event);
        flushTerminalEventsIfIdle();
        if (smoothingQueue.length > 0) {
          scheduleSmoothingDrain();
        }
      };

      const processCurrentEvent = () => {
        if (!currentEvent || !currentData) return;
        const dispatchEvent = (eventName: string, data: any) => {
          switch (eventName) {
            case 'text_delta':
              hasChunkEnvelope = true;
              enqueueSmoothChunk(String(data?.delta || ''));
              break;
            case 'tool_start':
              callbacks.onStatus?.({
                action: `Running tool ${String(data?.toolName || 'unknown')}...`,
                phase: 'tool_start',
              });
              break;
            case 'tool_result':
              callbacks.onStatus?.({
                action: `Tool ${String(data?.toolName || 'unknown')} ${data?.ok === true ? 'completed' : 'failed'}.`,
                phase: 'tool_result',
              });
              break;
            case 'draft_artifact':
              if (data?.artifact) {
                console.info("[AGENT_ARTIFACT_TRACE_FRONT_SSE_EVENT]", {
                  event: "draft_artifact",
                  draftType: data.artifact?.draftType,
                  title: data.artifact?.title,
                  version: data.artifact?.version,
                  sectionCount: Array.isArray(data.artifact?.sections)
                    ? data.artifact.sections.length
                    : 0,
                });
                callbacks.onDraftArtifact?.({ ...data.artifact, type: 'draft_v2' });
              }
              break;
            case 'plan_artifact':
              if (data?.artifact) {
                callbacks.onPlanArtifact?.(data.artifact as PlanArtifactEventData);
              }
              break;
            case 'plan_executed':
              if (data?.artifact) {
                callbacks.onPlanExecuted?.(data.artifact as PlanExecutedEventData);
              }
              break;
            case 'plan_rejected':
              if (data?.artifact) {
                callbacks.onPlanRejected?.(data.artifact as PlanRejectedEventData);
              }
              break;
            case 'suggestion_artifact':
              {
                const artifact = parseSuggestionArtifactEventData(data?.artifact);
                if (artifact) {
                  callbacks.onSuggestionArtifact?.(artifact);
                } else {
                  console.warn('[AGENT_SUGGESTION_ARTIFACT_PARSE_FAILED]', {
                    keys:
                      data?.artifact && typeof data.artifact === 'object'
                        ? Object.keys(data.artifact as Record<string, unknown>)
                        : [],
                    preview: String(JSON.stringify(data?.artifact || {})).slice(0, 240),
                  });
                }
              }
              break;
            case 'pending':
              callbacks.onStatus?.({
                action: 'Pending action requires confirmation.',
                phase: 'pending',
              });
              break;
            case 'confirmed':
              callbacks.onStatus?.({
                action: `Confirmed action ${data?.ok === true ? 'completed' : 'failed'}.`,
                phase: 'confirmed',
              });
              break;
            case 'disambiguation':
              hasResultEnvelope = true;
              callbacks.onResult?.({
                output: data?.payload || data,
                intent: 'DISAMBIGUATION',
                visibility: 'visible',
                interactionMode: 'operational',
              });
              break;
            case 'done':
              hasDoneEnvelope = true;
              // Legacy chatbot mode (/agent/chat) can terminate with start -> chunk -> done
              // without artifact/result envelopes.
              if (!useAgentV2Stream && !hasResultEnvelope && (hasErrorEnvelope || !hasChunkEnvelope)) {
                callbacks.onResult?.({
                  output: buildLocalRecoveryOutput(
                    'I could not complete that request in this turn.',
                    'temporary',
                  ),
                  intent: 'RECOVERY',
                  visibility: 'visible',
                  interactionMode: 'operational',
                });
              }
              enqueueTerminalEvent({
                type: 'done',
                payload:
                  data && typeof data === 'object'
                    ? data
                    : { timestamp: new Date().toISOString() },
              });
              break;
            case 'error':
              hasErrorEnvelope = true;
              {
                const errorMessage =
                  (typeof data?.message === 'string' && data.message.trim()) ||
                  (typeof data?.error === 'string' && data.error.trim()) ||
                  'I could not complete that request.';
                enqueueTerminalEvent({ type: 'error', message: errorMessage });
              }
              break;
            default:
              return false;
          }
          return true;
        };
        try {
          let data: any;
          try {
            data = JSON.parse(currentData);
          } catch {
            const raw = String(currentData || '').trim();
            if (currentEvent === 'done') {
              data = {};
            } else if (currentEvent === 'error') {
              data = { message: raw || 'I could not complete that request.' };
            } else if (currentEvent === 'text_delta') {
              data = { delta: currentData };
            } else if (currentEvent === 'tool_start') {
              data = { toolName: raw || 'unknown' };
            } else if (currentEvent === 'tool_result') {
              const lower = raw.toLowerCase();
              data = {
                toolName: 'unknown',
                ok: lower === 'true' || lower === 'ok' || lower === '1',
              };
            } else if (currentEvent === 'pending' || currentEvent === 'confirmed' || currentEvent === 'disambiguation') {
              data = {};
            } else {
              throw new Error(`Non-JSON payload for event "${currentEvent}"`);
            }
          }
          if (SUPPRESSED_AUXILIARY_STREAM_EVENTS.has(currentEvent)) {
            return;
          }
          if (currentEvent === 'agent_event') {
            // In Agent v2 mode we already receive native events (text_delta/tool_*/done/error).
            // Compat envelopes would duplicate chunks/status events in the UI.
            if (useAgentV2Stream) {
              return;
            }
            const compatType =
              typeof data?.type === 'string' ? data.type : typeof data?.payload?.type === 'string' ? data.payload.type : '';
            const compatPayload = (data?.payload && typeof data.payload === 'object') ? data.payload : data;
            if (compatType && dispatchEvent(compatType, compatPayload)) {
              return;
            }
          }
          switch (currentEvent) {
            case 'text_delta':
            case 'tool_start':
            case 'tool_result':
            case 'draft_artifact':
            case 'plan_artifact':
            case 'plan_executed':
            case 'plan_rejected':
            case 'suggestion_artifact':
            case 'pending':
            case 'confirmed':
            case 'disambiguation':
            case 'done':
            case 'error':
              if (dispatchEvent(currentEvent, data)) {
                break;
              }
              return;
            case 'turn.start': {
              const payload = data?.payload || {};
              hasStartEnvelope = true;
              callbacks.onStart?.({
                intent: payload.intent || 'PENDING',
                agentVersion: payload.agentVersion || request.agentVersion || 'v1',
              });
              break;
            }
            case 'turn.end':
              hasDoneEnvelope = true;
              callbacks.onDone?.({
                timestamp: data?.timestamp || new Date().toISOString(),
              });
              break;
            case 'intent.delta':
              break;
            case 'artifact.delta':
              break;
            case 'intent.final': {
              const payload = data?.payload || {};
              const visibility =
                String(payload.visibility || 'visible').toLowerCase() === 'metadata'
                  ? 'metadata'
                  : 'visible';
              const summary = String(payload.summary || '').trim();
              const contextEcho =
                typeof payload.contextEcho === 'string' && payload.contextEcho.trim().length > 0
                  ? payload.contextEcho.trim()
                  : null;
              const nextQuestion =
                typeof payload.nextQuestion === 'string' && payload.nextQuestion.trim().length > 0
                  ? payload.nextQuestion.trim()
                  : null;
              const intentMessage = [summary, nextQuestion].filter(Boolean).join(' ');
              if (visibility === 'visible') {
                callbacks.onIntentFraming?.({
                  message: intentMessage || 'Intent prepared.',
                  visibility,
                  interactionMode:
                    payload.interactionMode === 'conversational'
                      ? 'conversational'
                      : payload.interactionMode === 'operational'
                        ? 'operational'
                        : undefined,
                  structured: {
                    kind: 'intent',
                    summary: summary || 'I understood your request.',
                    contextEcho,
                    nextQuestion,
                    visibility,
                    interactionMode:
                      payload.interactionMode === 'conversational'
                        ? 'conversational'
                        : payload.interactionMode === 'operational'
                          ? 'operational'
                          : undefined,
                  },
                });
              }
              break;
            }
            case 'intent.failed':
              if (String(data?.payload?.visibility || 'visible').toLowerCase() !== 'metadata') {
                callbacks.onIntentFraming?.({
                  message:
                    String(data?.payload?.message || '').trim() ||
                    'Intent stage failed.',
                });
              }
              break;
            case 'artifact.final':
              hasResultEnvelope = true;
              callbacks.onResult?.(data?.payload || {});
              break;
            case 'artifact.failed':
              hasErrorEnvelope = true;
              if (String(data?.payload?.visibility || 'visible').toLowerCase() !== 'metadata') {
                callbacks.onResult?.({
                  output: buildLocalRecoveryOutput(
                    typeof data?.payload?.message === 'string'
                      ? data.payload.message
                      : 'I could not complete the requested action.',
                    'blocking',
                  ),
                  intent: 'RECOVERY',
                  visibility: 'visible',
                  interactionMode: 'operational',
                });
              }
              break;
            case 'commentary.delta':
              break;
            case 'commentary.final': {
              const payload = data?.payload || {};
              const visibility =
                String(payload.visibility || 'visible').toLowerCase() === 'metadata'
                  ? 'metadata'
                  : 'visible';
              const lines = Array.isArray(payload.lines)
                ? payload.lines.map((x: unknown) => String(x || '').trim()).filter(Boolean)
                : [];
              const options = Array.isArray(payload.options)
                ? payload.options
                    .map((item: unknown) => {
                      const row = item as { label?: unknown; value?: unknown };
                      return {
                        label: String(row?.label || '').trim(),
                        value: String(row?.value || '').trim(),
                      };
                    })
                    .filter((row: { label: string; value: string }) => row.label && row.value)
                : [];
              const question =
                typeof payload.question === 'string' && payload.question.trim().length > 0
                  ? payload.question.trim()
                  : null;
              const commentaryMessage = [...lines, question || ''].filter(Boolean).join(' ');
              if (visibility === 'visible') {
                callbacks.onCommentary?.({
                  message: commentaryMessage,
                  source: 'llm',
                  kind: 'commentary',
                  lines,
                  options,
                  question,
                  visibility,
                  interactionMode:
                    payload.interactionMode === 'conversational'
                      ? 'conversational'
                      : payload.interactionMode === 'operational'
                        ? 'operational'
                        : undefined,
                });
              }
              break;
            }
            case 'commentary.failed':
              if (String(data?.payload?.visibility || 'visible').toLowerCase() !== 'metadata') {
                callbacks.onCommentary?.({
                  message: String(data?.payload?.message || '').trim(),
                  source: 'failed',
                });
              }
              break;
            case 'start':
              hasStartEnvelope = true;
              callbacks.onStart?.(data);
              break;
            case 'status':
              callbacks.onStatus?.(data);
              break;
            case 'action': {
              const payload = extractChatMutationLifecycleEvent(data);
              if (payload) callbacks.onChatMutationLifecycle?.(payload);
              break;
            }
            case 'intent':
            case 'intent_framing':
              if (String(data?.visibility || 'visible').toLowerCase() !== 'metadata') {
                callbacks.onIntentFraming?.(data);
              }
              break;
            case 'intent_framing_chunk':
              callbacks.onIntentFramingChunk?.(data.chunk);
              break;
            case 'chunk':
              hasChunkEnvelope = true;
              if (String(data?.visibility || 'visible').toLowerCase() !== 'metadata') {
                enqueueSmoothChunk(String(data?.content || ''));
              }
              break;
            case 'result':
            case 'artifact':
              hasResultEnvelope = true;
              if (String(data?.visibility || 'visible').toLowerCase() !== 'metadata') {
                console.info('[AGENT_STREAM_RESULT_EVENT]', {
                  event: currentEvent,
                  outputType:
                    data?.output && typeof data.output === 'object'
                      ? String((data.output as { type?: unknown }).type || '')
                      : '',
                  intent: String(data?.intent || ''),
                });
                callbacks.onResult?.(data);
              }
              break;
            case 'commentary':
              if (String(data?.visibility || 'visible').toLowerCase() !== 'metadata') {
                callbacks.onCommentary?.(data);
              }
              break;
            case 'commentary_chunk':
              callbacks.onCommentaryChunk?.(data.chunk);
              break;
            case 'cancelled':
              callbacks.onCancelled?.();
              break;
            case 'entity_mutation_success':
              callbacks.onMutationEvent?.(
                (
                  (data && typeof data === 'object' && data.event && typeof data.event === 'object'
                    ? data.event
                    : data) as EntityMutationSuccessEvent
                ),
              );
              break;
            default:
              callbacks.onResult?.({
                output: buildLocalRecoveryOutput(
                  `Unexpected stream event "${currentEvent}" was received.`,
                  'temporary',
                ),
                intent: 'RECOVERY',
                visibility: 'visible',
                interactionMode: 'operational',
              });
              break;
          }
        } catch {
          callbacks.onResult?.({
            output: buildLocalRecoveryOutput(
              `Malformed stream payload for event "${currentEvent}".`,
              'temporary',
            ),
            intent: 'RECOVERY',
            visibility: 'visible',
            interactionMode: 'operational',
          });
        }
        currentEvent = '';
        currentData = '';
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          processCurrentEvent();
          if (!abortController.signal.aborted) {
            if (!hasStartEnvelope) {
              callbacks.onResult?.({
                output: buildLocalRecoveryOutput('Stream ended before initialization.', 'temporary'),
                intent: 'RECOVERY',
                visibility: 'visible',
                interactionMode: 'operational',
              });
            }
            if (!hasDoneEnvelope) {
              callbacks.onResult?.({
                output: buildLocalRecoveryOutput('Stream ended unexpectedly.', 'temporary'),
                intent: 'RECOVERY',
                visibility: 'visible',
                interactionMode: 'operational',
              });
            }
          }
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;

        // Parse SSE events from buffer
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const normalizedLine = line.endsWith('\r') ? line.slice(0, -1) : line;
          // Skip SSE comments (heartbeat/keep-alive)
          if (normalizedLine.startsWith(':')) {
            continue;
          }
          if (normalizedLine.startsWith('event:')) {
            currentEvent = normalizedLine.slice(6).trim();
          } else if (normalizedLine.startsWith('data:')) {
            const dataPart = normalizedLine.slice(5).trimStart();
            currentData = currentData ? `${currentData}\n${dataPart}` : dataPart;
          } else if (normalizedLine === '') {
            // End of event, process it
            processCurrentEvent();
          }
        }
      }
    } catch (err) {
        if ((err as Error).name === 'AbortError') {
        clearSmoothingState?.();
        callbacks.onCancelled?.();
      } else {
        clearSmoothingState?.();
        callbacks.onError?.((err as Error).message || 'Stream error');
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
      }
    }
  })();

  return abortController;
}
