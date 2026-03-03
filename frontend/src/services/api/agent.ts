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
}

export interface AgentRequestMetadata {
  webSearchEnabled?: boolean;
  webSearchTrigger?: WebSearchTrigger;
  webSearchQuery?: string;
  webSearchIntent?: 'WEB_SEARCH' | 'DEEP_SEARCH';
  webDeepSearchEnabled?: boolean;
  webDeepSearchTrigger?: WebSearchTrigger;
  webDeepSearchQuery?: string;
  streamingEnabled?: boolean;
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
    searchIntent?: 'WEB_SEARCH' | 'DEEP_SEARCH';
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
    mode?: string;
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
  searchIntent: 'WEB_SEARCH' | 'DEEP_SEARCH';
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

export interface WebDeepSearchResultsOutput {
  type: 'web_deep_search_results';
  query: string;
  searchIntent: 'DEEP_SEARCH';
  triggeredBy: WebSearchTrigger;
  provider: string;
  queries: string[];
  results: WebSearchResultItem[];
  resultCount: number;
  message?: string | null;
  totalEstimatedMatches: number;
  sources: Array<{ sourceType: string; reference: string; note: string }>;
  timestamp: string;
  status: string;
  reason?: string | null;
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
  | WebDeepSearchResultsOutput
  | ChatContextSummaryOutput
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
  webSearchResults?: WebSearchResultsOutput | WebDeepSearchResultsOutput;
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
    } else if (output.type === 'web_search_results' || output.type === 'web_deep_search_results') {
      processed.webSearchResults = output as WebSearchResultsOutput | WebDeepSearchResultsOutput;
      processed.displayText = '';
    } else if (output.type === 'action_plan') {
      const actionPlan = output as { type: 'action_plan'; actions: ActionProposal[] };
      processed.actionProposals = actionPlan.actions;
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
    const response = await apiClient.post<{ status: string; data: ExecutionResult }>(
      '/agent/confirm',
      { proposalId, sessionId, ackRisk: options.ackRisk === true }
    );

    if (response.status !== 'ok' || !response.data) {
      throw new Error(response.error || 'Confirmation failed');
    }

    return response.data;
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
  | 'entity_mutation_success';

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

  // Start streaming in background
  (async () => {
    try {
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
      
      const response = await fetch(`${apiBase}/agent/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        callbacks.onResult?.({
          output: buildLocalRecoveryOutput(
            text || `The service returned HTTP ${response.status}.`,
            'temporary',
          ),
          intent: 'RECOVERY',
          visibility: 'visible',
          interactionMode: 'operational',
        });
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onResult?.({
          output: buildLocalRecoveryOutput('No response body received from the service.', 'temporary'),
          intent: 'RECOVERY',
          visibility: 'visible',
          interactionMode: 'operational',
        });
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let currentData = '';
      let hasStartEnvelope = false;
      let hasResultEnvelope = false;
      let hasErrorEnvelope = false;
      let hasDoneEnvelope = false;
      let hasChunkEnvelope = false;

      const processCurrentEvent = () => {
        if (!currentEvent || !currentData) return;
        try {
          const data = JSON.parse(currentData);
          if (SUPPRESSED_AUXILIARY_STREAM_EVENTS.has(currentEvent)) {
            return;
          }
          switch (currentEvent) {
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
                callbacks.onChunk?.(data.content);
              }
              break;
            case 'result':
            case 'artifact':
              hasResultEnvelope = true;
              if (String(data?.visibility || 'visible').toLowerCase() !== 'metadata') {
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
            case 'done':
              hasDoneEnvelope = true;
              // Chatbot mode (/agent/chat) can validly terminate with start -> chunk -> done
              // without artifact/result envelopes.
              if (!hasResultEnvelope && (hasErrorEnvelope || !hasChunkEnvelope)) {
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
              callbacks.onDone?.(data);
              break;
            case 'error':
              hasErrorEnvelope = true;
              if (String(data?.visibility || 'metadata').toLowerCase() !== 'metadata') {
                callbacks.onResult?.({
                  output: buildLocalRecoveryOutput(
                    typeof data?.error === 'string' && data.error.trim()
                      ? data.error
                      : 'I could not complete that request.',
                    'temporary',
                  ),
                  intent: 'RECOVERY',
                  visibility: 'visible',
                  interactionMode: 'operational',
                });
              }
              break;
            case 'cancelled':
              callbacks.onCancelled?.();
              break;
            case 'entity_mutation_success':
              callbacks.onMutationEvent?.(data as EntityMutationSuccessEvent);
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
          // Skip SSE comments (heartbeat/keep-alive)
          if (line.startsWith(':')) {
            continue;
          }
          if (line.startsWith('event: ')) {
            currentEvent = line.slice(7).trim();
          } else if (line.startsWith('data: ')) {
            const dataPart = line.slice(6);
            currentData = currentData ? `${currentData}\n${dataPart}` : dataPart;
          } else if (line === '') {
            // End of event, process it
            processCurrentEvent();
          }
        }
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') {
        callbacks.onCancelled?.();
      } else {
        callbacks.onResult?.({
          output: buildLocalRecoveryOutput(
            (err as Error).message || 'Stream error',
            'temporary',
          ),
          intent: 'RECOVERY',
          visibility: 'visible',
          interactionMode: 'operational',
        });
        callbacks.onDone?.({ timestamp: new Date().toISOString() });
      }
    }
  })();

  return abortController;
}
