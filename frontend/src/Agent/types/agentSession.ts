import { AgentMessage } from "./agentMessage";

export interface AgentFolder {
  id: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
  orderIndex: number;
  isExpanded: boolean;
}

export interface AgentSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messageCount: number;
  createdAt: Date;
  updatedAt: Date;
  messages: AgentMessage[];
  pinned: boolean;
  orderIndex: number;
  folderId: string | null;
  draft?: string;
}
