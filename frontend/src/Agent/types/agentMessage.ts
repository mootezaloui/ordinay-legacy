export type AgentMessageRole = "user" | "agent";

export interface AgentMessage {
  id: string;
  role: AgentMessageRole;
  content: string;
  timestamp: Date;
  data?: AgentMessageData;
}

export interface AgentMessageData {
  type: "analysis" | "report" | "explanation";
  [key: string]: any;
}
