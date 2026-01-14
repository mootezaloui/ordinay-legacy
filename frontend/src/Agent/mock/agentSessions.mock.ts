import { AgentSession } from "../types/agentSession";

export const mockSessions: AgentSession[] = [
  {
    id: "s1",
    title: "Case Analysis - Dupont",
    lastMessage: "Prepare a summary of the Dupont case",
    timestamp: new Date(Date.now() - 3600000),
    messageCount: 8,
  },
  {
    id: "s2",
    title: "Weekly Planning",
    lastMessage: "What are my priorities this week?",
    timestamp: new Date(Date.now() - 86400000),
    messageCount: 5,
  },
  {
    id: "s3",
    title: "Client Reports",
    lastMessage: "Generate monthly activity report",
    timestamp: new Date(Date.now() - 172800000),
    messageCount: 12,
  },
  {
    id: "s4",
    title: "Task Overview",
    lastMessage: "Show me overdue tasks",
    timestamp: new Date(Date.now() - 259200000),
    messageCount: 3,
  },
];
