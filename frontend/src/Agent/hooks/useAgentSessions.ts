import { useState } from "react";
import { AgentSession } from "../types/agentSession";
import { mockSessions } from "../mock/agentSessions.mock";

export function useAgentSessions() {
  const [sessions, setSessions] = useState<AgentSession[]>(mockSessions);
  const [activeSession, setActiveSession] = useState("s1");

  const handleNewChat = () => {
    const newSession: AgentSession = {
      id: `s-${Date.now()}`,
      title: "New Conversation",
      lastMessage: "",
      timestamp: new Date(),
      messageCount: 0,
    };
    setSessions([newSession, ...sessions]);
    setActiveSession(newSession.id);
  };

  const getRelativeTime = (timestamp: Date) => {
    const now = new Date();
    const diff = now.getTime() - timestamp.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  return {
    sessions,
    setSessions,
    activeSession,
    setActiveSession,
    handleNewChat,
    getRelativeTime,
  };
}
