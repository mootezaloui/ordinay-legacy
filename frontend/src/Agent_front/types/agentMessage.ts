import type {
  ExplanationOutput,
  RiskAnalysisOutput,
  DraftOutput,
  ActionProposal,
  FollowUpIntent,
  CommentaryOutput,
  IntentFramingOutput,
  ClarificationOutput,
  CollectionOutput,
  ProposalOutput,
  DocumentGenerationPreviewOutput,
  WebSearchResultsOutput,
  WebDeepSearchResultsOutput,
  DocumentGenerationMissingFieldsOutput,
  RecoveryOutput,
} from "../../services/api/agent";

export type AgentMessageRole = "user" | "agent";

export type AgentMessageStatus = "sending" | "success" | "error";

/**
 * Message stage types for staged agent responses.
 *
 * The agent emits messages in sequence:
 *   1. ack        - Immediate acknowledgement (no LLM, instant)
 *   2. status     - Processing status updates (no LLM, deterministic)
 *   3. intent     - Intent framing message (LLM, before execution)
 *   4. artifact   - Structured result (facts, interpretation, follow-ups)
 *   5. commentary - Conversational message about the artifact (LLM, streamed)
 *
 * Each stage has distinct rendering and timing requirements.
 */
export type AgentMessageStage = "ack" | "status" | "intent" | "artifact" | "commentary";

export type AgentMessageType = "AGENT_INTENT_MESSAGE";

/** Attachment stored on a user message for visual rendering in chat. */
export interface MessageAttachment {
  id: string;
  name: string;
  type: 'file' | 'document' | 'image';
  size?: number;
  /** Data-URL preview for images */
  preview?: string;
}

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: Date;
  /** Attachments sent with a user message (for visual rendering). */
  attachments?: MessageAttachment[];
  // Agent response metadata
  status?: AgentMessageStatus;
  intent?: string;
  /**
   * Message stage - determines rendering and timing behavior.
   * If not set, defaults to 'artifact' for backwards compatibility.
   */
  stage?: AgentMessageStage;
  /**
   * Optional semantic message type (first-class agent interactions).
   */
  messageType?: AgentMessageType;
  intentFraming?: IntentFramingOutput;
  /**
   * For status messages, the current action being performed.
   * e.g., "Reading tasks…", "Analyzing dossier status…"
   */
  statusAction?: string;
  // Structured data from agent
  data?: AgentMessageData;
  /**
   * Conversational commentary ABOUT the structured artifact.
   * Generated AFTER the artifact, provides intelligence layer.
   * May be absent if:
   * - Artifact type is 'chat' (already conversational)
   * - Commentary generation failed (non-blocking)
   * - LLM unavailable
   */
  commentary?: CommentaryOutput;
  // If present, this agent message was generated as a retry of another agent message
  retryOf?: string;
  // Optional flag set when a user edits their own message
  edited?: boolean;
  // Optional follow-up intent payload for deterministic retries
  followUpIntent?: FollowUpIntent;
}

export interface AgentMessageData {
  type: "explanation" | "risks" | "draft" | "actions" | "clarification" | "collection" | "context_suggestion" | "proposal" | "document_generation_preview" | "document_generation_missing_fields" | "web_search_results" | "web_deep_search_results" | "recovery" | "error";
  explanation?: ExplanationOutput;
  risks?: RiskAnalysisOutput;
  draft?: DraftOutput;
  actionProposals?: ActionProposal[];
  clarification?: ClarificationOutput;
  collection?: CollectionOutput;
  contextSuggestion?: import("../../services/api/agent").ContextSuggestionOutput;
  proposal?: ProposalOutput;
  documentGenerationPreview?: DocumentGenerationPreviewOutput;
  documentGenerationMissingFields?: DocumentGenerationMissingFieldsOutput;
  webSearchResults?: WebSearchResultsOutput | WebDeepSearchResultsOutput;
  recovery?: RecoveryOutput;
  error?: string;
}
