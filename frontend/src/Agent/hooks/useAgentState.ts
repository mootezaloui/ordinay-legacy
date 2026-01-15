import { useState, useRef, useEffect, useCallback } from "react";
import { AgentMessage } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";

export function useAgentState() {
  const {
    activeSessionId,
    activeSession,
    updateSessionMessages,
    updateSessionDraft,
    getRelativeTime,
  } = useAgentSessions();

  const [input, setInput] = useState("");
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});

  // Get messages from active session
  const conversation = activeSession?.messages || [];

  // Restore input draft when switching sessions
  useEffect(() => {
    if (activeSession?.draft !== undefined) {
      setInput(activeSession.draft);
    } else {
      setInput("");
    }
  }, [activeSessionId]);

  // Save scroll position before switching sessions
  const saveScrollPosition = useCallback(() => {
    const container = conversationEndRef.current?.parentElement?.parentElement;
    if (container && activeSessionId) {
      scrollPositions.current[activeSessionId] = container.scrollTop;
    }
  }, [activeSessionId]);

  // Restore scroll position after switching sessions
  useEffect(() => {
    const container = conversationEndRef.current?.parentElement?.parentElement;
    if (container && activeSessionId) {
      const savedPos = scrollPositions.current[activeSessionId];
      if (savedPos !== undefined) {
        container.scrollTop = savedPos;
      }
    }
  }, [activeSessionId]);

  // Scroll to end when new messages arrive
  useEffect(() => {
    if (conversation.length > 0) {
      conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [conversation.length]);

  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  // Save draft on input change (debounced)
  useEffect(() => {
    if (!activeSessionId) return;
    const timeout = setTimeout(() => {
      updateSessionDraft(activeSessionId, input);
    }, 300);
    return () => clearTimeout(timeout);
  }, [input, activeSessionId, updateSessionDraft]);

  const handleSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || !activeSessionId) return;

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

    const newMessages = [...conversation, userMessage, agentMessage];
    updateSessionMessages(activeSessionId, newMessages);
    setInput("");
    updateSessionDraft(activeSessionId, "");
  }, [input, activeSessionId, conversation, updateSessionMessages, updateSessionDraft]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }, [handleSubmit]);

  const handleExampleClick = useCallback((example: string) => {
    setInput(example);
    inputRef.current?.focus();
  }, []);

  return {
    input,
    setInput,
    conversation,
    showHistorySidebar,
    setShowHistorySidebar,
    showContextSidebar,
    setShowContextSidebar,
    inputRef,
    conversationEndRef,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    saveScrollPosition,
    getRelativeTime,
  };
}
