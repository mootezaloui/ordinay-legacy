import { useState, useRef, useEffect } from "react";
import { AgentMessage } from "../types/agentMessage";
import { mockConversation } from "../mock/agentMessages.mock";

export function useAgentState() {
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState<AgentMessage[]>(mockConversation);
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const agentMessage: AgentMessage = {
      id: `a-${Date.now()}`,
      role: "agent",
      content: "Processing your request...",
      timestamp: new Date(Date.now() + 500),
    };

    setConversation((prev) => [...prev, userMessage, agentMessage]);
    setInput("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  };

  const handleExampleClick = (example: string) => {
    setInput(example);
    inputRef.current?.focus();
  };

  return {
    input,
    setInput,
    conversation,
    setConversation,
    showHistorySidebar,
    setShowHistorySidebar,
    showContextSidebar,
    setShowContextSidebar,
    inputRef,
    conversationEndRef,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
  };
}
