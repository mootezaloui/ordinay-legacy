/**
 * Agent API Service
 *
 * Handles communication with the backend Agent Engine.
 * Maps frontend requests to backend contract format.
 */

import { apiClient } from './client';
import { getApiBase } from '../../lib/apiConfig';

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
  documents: boolean;
}

// Agent request to backend
export interface AgentRequest {
  message: string;
  context?: ContextRefs & { scope?: ContextScope };
  agentVersion?: AgentVersion;
  reasoner?: string;
}

// Explanation output
export interface ExplanationOutput {
  type: 'explanation';
  title: string;
  summary: string;
  details?: string[];
  relatedEntities?: Array<{ type: string; id: number; name: string }>;
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

// Agent response from backend
export interface AgentResponse {
  status: 'ok' | 'error';
  data?: {
    intent: string;
    agentVersion: string;
    reasoner: string;
    output: ChatOutput | ExplanationOutput | RiskAnalysisOutput | DraftOutput | { type: 'action_plan'; actions: ActionProposal[] };
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
  } = {}
): Promise<ProcessedAgentResponse> {
  const { contextScope = 'GLOBAL', contextRefs = {}, agentVersion = 'v1' } = options;

  const request: AgentRequest = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
    },
    agentVersion,
    reasoner: 'rule',
  };

  try {
    const response = await apiClient.post<AgentResponse>('/agent/run', request);

    if (response.status !== 'ok' || !response.data) {
      return {
        success: false,
        intent: 'UNKNOWN',
        agentVersion,
        error: response.error || 'Unknown error',
        displayText: `Error: ${response.error || 'Unknown error'}`,
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
      processed.displayText = (output as ExplanationOutput).summary;
    } else if (output.type === 'operational_risk_analysis') {
      processed.risks = output as RiskAnalysisOutput;
      processed.displayText = (output as RiskAnalysisOutput).summary;
    } else if (['INVITATION', 'CLIENT_EMAIL', 'HEARING_SUMMARY', 'INTERNAL_NOTE'].includes(output.type)) {
      processed.draft = output as DraftOutput;
      processed.displayText = `Draft ${output.type.toLowerCase().replace('_', ' ')} generated`;
    } else if (output.type === 'action_plan') {
      const actionPlan = output as { type: 'action_plan'; actions: ActionProposal[] };
      processed.actionProposals = actionPlan.actions;
      processed.displayText = `${actionPlan.actions.length} action(s) proposed`;
    }

    return processed;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      success: false,
      intent: 'UNKNOWN',
      agentVersion,
      error: errorMessage,
      displayText: `Error: ${errorMessage}`,
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
// Streaming API
// ============================================================================

/** SSE event types from the streaming endpoint */
export type StreamEventType = 'start' | 'chunk' | 'result' | 'done' | 'error' | 'cancelled';

/** Callback for stream events */
export interface StreamCallbacks {
  onStart?: (data: { intent: string; agentVersion: string }) => void;
  onChunk?: (content: string) => void;
  onResult?: (data: { output: unknown; intent: string }) => void;
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
  } = {},
  callbacks: StreamCallbacks
): AbortController {
  const { contextScope = 'GLOBAL', contextRefs = {}, agentVersion = 'v1', dataAccess } = options;
  const abortController = new AbortController();

  const request = {
    message,
    context: {
      ...contextRefs,
      scope: contextScope,
      dataAccess,
    },
    agentVersion,
  };

  // Start streaming in background
  (async () => {
    try {
      const apiBase = getApiBase();
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
                case 'chunk':
                  callbacks.onChunk?.(data.content);
                  break;
                case 'result':
                  callbacks.onResult?.(data);
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



