import type {
  ExplanationOutput,
  RiskAnalysisOutput,
  DraftOutput,
  ActionProposal,
} from "../../services/api/agent";

export type AgentMessageRole = "user" | "agent";

export type AgentMessageStatus = "sending" | "success" | "error";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: Date;
  // Agent response metadata
  status?: AgentMessageStatus;
  intent?: string;
  // Structured data from agent
  data?: AgentMessageData;
  // If present, this agent message was generated as a retry of another agent message
  retryOf?: string;
  // Optional flag set when a user edits their own message
  edited?: boolean;
}

export interface AgentMessageData {
  type: "explanation" | "risks" | "draft" | "actions" | "error";
  explanation?: ExplanationOutput;
  risks?: RiskAnalysisOutput;
  draft?: DraftOutput;
  actionProposals?: ActionProposal[];
  error?: string;
}
