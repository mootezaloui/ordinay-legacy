/**
 * Agent API Service
 *
 * Handles communication with the backend Agent Engine.
 * Maps frontend requests to backend contract format.
 */

import { apiClient } from './client';
import { getApiBase, getBackendConfig, isElectron } from '../../lib/apiConfig';

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

// Agent request to backend
export interface AgentRequest {
  message: string;
  context?: ContextRefs & { scope?: ContextScope };
  agentVersion?: AgentVersion;
  reasoner?: string;
  followUpIntent?: FollowUpIntent;
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
    | 'OPEN_CONTEXT';
  entityType?: string;
  intent?: string;
  scope?: FollowUpSuggestion['scope'];
  filters?: FollowUpSuggestion['filters'];
}

export interface ClarificationOutput {
  type: 'clarification';
  reason: {
    type: string;
    entityType?: string;
    resultCount?: number;
  };
  signals?: SemanticSignal[];
  options?: ClarificationOption[];
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
  recommendation?: string;
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

export type AgentOutput =
  | ChatOutput
  | ExplanationOutput
  | RiskAnalysisOutput
  | DraftOutput
  | ClarificationOutput
  | CollectionOutput
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
  } = {}
): Promise<ProcessedAgentResponse> {
  const { contextScope = 'GLOBAL', contextRefs = {}, agentVersion = 'v1', followUpIntent } = options;

  const request: AgentRequest & { followUpIntent?: FollowUpIntent } = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
    },
    agentVersion,
    reasoner: 'rule',
  };
  if (followUpIntent) {
    request.followUpIntent = followUpIntent;
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
    } else if (output.type === 'clarification') {
      processed.clarification = output as ClarificationOutput;
      processed.displayText = '';
    } else if (output.type === 'collection') {
      processed.collection = output as CollectionOutput;
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
  message: string;
  source: 'llm' | 'fallback' | 'skipped' | 'failed';
  signals?: SemanticSignal[];
}

// ============================================================================
// Streaming API
// ============================================================================

/** SSE event types from the streaming endpoint */
export type StreamEventType =
  | 'start'
  | 'status'
  | 'intent_framing'
  | 'intent_framing_chunk'
  | 'chunk'
  | 'result'
  | 'commentary'
  | 'commentary_chunk'
  | 'done'
  | 'error'
  | 'cancelled';

/**
 * Status event data - describes what the agent is currently doing.
 * Emitted during processing to provide real-time feedback.
 */
export interface StatusEventData {
  action: string;      // e.g., "Reading tasks…", "Analyzing dossier status…"
  progress?: number;   // Optional progress percentage (0-100)
  phase?: string;      // Optional phase identifier
}

/** Callback for stream events */
export interface StreamCallbacks {
  onStart?: (data: { intent: string; agentVersion: string }) => void;
  onStatus?: (data: StatusEventData) => void;
  onIntentFraming?: (data: { message: string; messageType?: string; signal?: SemanticSignal | null }) => void;
  /** Streaming chunk for intent framing message (for real-time display) */
  onIntentFramingChunk?: (chunk: string) => void;
  onChunk?: (content: string) => void;
  onResult?: (data: { output: AgentOutput; intent: string }) => void;
  onCommentary?: (data: CommentaryOutput) => void;
  /** Streaming chunk for commentary message (for real-time display) */
  onCommentaryChunk?: (chunk: string) => void;
  onDone?: (data: { timestamp: string; fullContent?: string }) => void;
  onError?: (error: string) => void;
  onCancelled?: () => void;
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
    /** Agent conversation session ID — used to load session-bound documents */
    sessionId?: string;
    /** Document IDs explicitly attached to this message */
    documentIds?: number[];
  } = {},
  callbacks: StreamCallbacks
): AbortController {
  const { contextScope = 'GLOBAL', contextRefs = {}, agentVersion = 'v1', dataAccess, followUpIntent, sessionId, documentIds } = options;
  const abortController = new AbortController();

  const request: AgentRequest & {
    dataAccess?: DataAccessPermissions;
    followUpIntent?: FollowUpIntent;
    sessionId?: string;
    documentIds?: number[];
  } = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
      dataAccess,
    },
    agentVersion,
  };
  if (followUpIntent) {
    request.followUpIntent = followUpIntent;
  }
  if (sessionId) {
    request.sessionId = sessionId;
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
      
      console.log('[SSE Client] Starting fetch to:', `${apiBase}/agent/stream`);
      const response = await fetch(`${apiBase}/agent/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: abortController.signal,
      });
      console.log('[SSE Client] Fetch completed, status:', response.status);

      if (!response.ok) {
        const text = await response.text();
        callbacks.onError?.(text || `HTTP error ${response.status}`);
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        callbacks.onError?.('No response body');
        return;
      }

      console.log('[SSE Client] Got reader, starting to read...');
      const decoder = new TextDecoder();
      let buffer = '';
      let currentEvent = '';
      let currentData = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log('[SSE Client] Stream done');
          break;
        }

        const chunk = decoder.decode(value, { stream: true });
        console.log('[SSE Client] Received chunk:', chunk.slice(0, 100));
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
            currentData = line.slice(6);
          } else if (line === '' && currentEvent && currentData) {
            // End of event, process it
            console.log('[SSE Client] Processing event:', currentEvent);
            try {
              const data = JSON.parse(currentData);
              switch (currentEvent) {
                case 'start':
                  callbacks.onStart?.(data);
                  break;
                case 'status':
                  callbacks.onStatus?.(data);
                  break;
                case 'intent_framing':
                  callbacks.onIntentFraming?.(data);
                  break;
                case 'intent_framing_chunk':
                  callbacks.onIntentFramingChunk?.(data.chunk);
                  break;
                case 'chunk':
                  callbacks.onChunk?.(data.content);
                  break;
                case 'result':
                  callbacks.onResult?.(data);
                  break;
                case 'commentary':
                  callbacks.onCommentary?.(data);
                  break;
                case 'commentary_chunk':
                  callbacks.onCommentaryChunk?.(data.chunk);
                  break;
                case 'done':
                  callbacks.onDone?.(data);
                  break;
                case 'error':
                  callbacks.onError?.(data.error);
                  break;
                case 'cancelled':
                  callbacks.onCancelled?.();
                  break;
              }
            } catch {
              // Skip malformed JSON
            }
            currentEvent = '';
            currentData = '';
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        callbacks.onError?.((err as Error).message || 'Stream error');
      }
    }
  })();

  return abortController;
}
