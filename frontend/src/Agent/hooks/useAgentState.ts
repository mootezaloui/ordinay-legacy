import { useState, useRef, useEffect, useCallback } from "react";
import { AgentMessage, AgentMessageData } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";
import { streamAgentMessage, ContextScope, AgentVersion, DataAccessPermissions } from "../../services/api/agent";

// Default data access - all domains enabled
const DEFAULT_DATA_ACCESS: DataAccessPermissions = {
  clients: true,
  dossiers: true,
  lawsuits: true,
  tasks: true,
  personalTasks: true,
  missions: true,
  sessions: true,
  documents: true,
};

// Storage key for persisting data access permissions
const DATA_ACCESS_STORAGE_KEY = 'organia_agent_data_access';

/**
 * Load data access permissions from localStorage
 * Returns DEFAULT_DATA_ACCESS if no saved state exists
 */
function loadDataAccessFromStorage(): DataAccessPermissions {
  try {
    const stored = localStorage.getItem(DATA_ACCESS_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Validate structure - ensure all required keys exist
      const validated: DataAccessPermissions = { ...DEFAULT_DATA_ACCESS };
      for (const key of Object.keys(DEFAULT_DATA_ACCESS) as Array<keyof DataAccessPermissions>) {
        if (typeof parsed[key] === 'boolean') {
          validated[key] = parsed[key];
        }
      }
      return validated;
    }
  } catch {
    // Ignore parse errors, return default
  }
  return DEFAULT_DATA_ACCESS;
}

/**
 * Save data access permissions to localStorage
 */
function saveDataAccessToStorage(dataAccess: DataAccessPermissions): void {
  try {
    localStorage.setItem(DATA_ACCESS_STORAGE_KEY, JSON.stringify(dataAccess));
  } catch {
    // Ignore storage errors
  }
}

export function useAgentState() {
  const {
    activeSessionId,
    activeSession,
    updateSessionMessages,
    updateSessionDraft,
    getRelativeTime,
    createSession,
  } = useAgentSessions();

  const [input, setInput] = useState("");
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [agentVersion, setAgentVersion] = useState<AgentVersion>("v1");
  const [contextScope, setContextScope] = useState<ContextScope>("GLOBAL");
  // CRITICAL: Load data access permissions from localStorage on init
  const [dataAccess, setDataAccess] = useState<DataAccessPermissions>(loadDataAccessFromStorage);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const conversationEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollPositions = useRef<Record<string, number>>({});
  const streamAbortRef = useRef<AbortController | null>(null);
  const streamSessionRef = useRef<string | null>(null);
  const lastMessageContentRef = useRef<string>("");
  const isUserScrolledUpRef = useRef(false);

  // Get messages from active session
  const conversation = activeSession?.messages || [];

  // Scroll to bottom utility
  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const container = scrollContainerRef.current;
    if (container) {
      // Use requestAnimationFrame to ensure DOM has updated
      requestAnimationFrame(() => {
        container.scrollTo({
          top: container.scrollHeight,
          behavior,
        });
      });
    }
  }, []);

  // Track user scroll position to detect if they scrolled up
  const handleScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    // User is "scrolled up" if they're more than 100px from bottom
    isUserScrolledUpRef.current = distanceFromBottom > 100;
  }, []);

  // Restore input draft when switching sessions
  useEffect(() => {
    if (activeSession?.draft !== undefined) {
      setInput(activeSession.draft);
    } else {
      setInput("");
    }
  }, [activeSessionId]);

  // Abort any active stream when session changes
  useEffect(() => {
    if (streamSessionRef.current && streamSessionRef.current !== activeSessionId) {
      streamAbortRef.current?.abort();
      streamAbortRef.current = null;
      streamSessionRef.current = null;
    }
  }, [activeSessionId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamAbortRef.current?.abort();
    };
  }, []);

  // CRITICAL: Persist data access permissions to localStorage on change
  useEffect(() => {
    saveDataAccessToStorage(dataAccess);
  }, [dataAccess]);

  // Cancel current stream (can be called from UI)
  const cancelStream = useCallback(() => {
    if (streamAbortRef.current) {
      streamAbortRef.current.abort();
      streamAbortRef.current = null;
      streamSessionRef.current = null;
      setIsLoading(false);
    }
  }, []);

  // Save scroll position before switching sessions
  const saveScrollPosition = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container && activeSessionId) {
      scrollPositions.current[activeSessionId] = container.scrollTop;
    }
  }, [activeSessionId]);

  // Attach scroll listener to track user scroll position
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Scroll to bottom when switching sessions (after a brief delay for render)
  useEffect(() => {
    if (!activeSessionId) return;

    // Reset user scroll tracking when switching sessions
    isUserScrolledUpRef.current = false;

    // Small delay to ensure messages have rendered
    const timer = setTimeout(() => {
      const savedPos = scrollPositions.current[activeSessionId];
      const container = scrollContainerRef.current;
      if (container) {
        if (savedPos !== undefined) {
          // Restore saved position
          container.scrollTop = savedPos;
        } else {
          // No saved position, scroll to bottom
          scrollToBottom("instant");
        }
      }
    }, 50);

    return () => clearTimeout(timer);
  }, [activeSessionId, scrollToBottom]);

  // Scroll to bottom when new messages are added (not during streaming)
  useEffect(() => {
    if (conversation.length > 0 && !isLoading) {
      // Only auto-scroll if user hasn't scrolled up
      if (!isUserScrolledUpRef.current) {
        scrollToBottom("smooth");
      }
    }
  }, [conversation.length, isLoading, scrollToBottom]);

  // Auto-scroll during streaming when content grows
  useEffect(() => {
    if (!isLoading || conversation.length === 0) {
      lastMessageContentRef.current = "";
      return;
    }

    const lastMessage = conversation[conversation.length - 1];
    const currentContent = lastMessage?.content || "";

    // Only scroll if content has changed and user hasn't scrolled up
    if (currentContent !== lastMessageContentRef.current && !isUserScrolledUpRef.current) {
      lastMessageContentRef.current = currentContent;
      scrollToBottom("smooth");
    }
  }, [conversation, isLoading, scrollToBottom]);

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
    if (!trimmed || isLoading) return;

    // Bootstrap session if none exists
    let sessionId = activeSessionId;
    let currentMessages = conversation;
    if (!activeSession) {
      const newSession = createSession();
      sessionId = newSession.id;
      currentMessages = [];
    }

    const userMessage: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    // Add user message and an empty streaming placeholder for agent
    const agentMessageId = `a-${Date.now()}`;
    const streamingMessage: AgentMessage = {
      id: agentMessageId,
      role: "agent",
      content: "",
      timestamp: new Date(),
      status: "sending",
    };

    // Capture current messages for updates
    const baseMessages = [...currentMessages, userMessage];
    updateSessionMessages(sessionId, [...baseMessages, streamingMessage]);
    setInput("");
    updateSessionDraft(sessionId, "");
    setIsLoading(true);

    // Track which session this stream belongs to
    streamSessionRef.current = sessionId;

    // Accumulated content for streaming
    let streamedContent = "";
    let intent = "GENERAL_CHAT";
    let agentData: AgentMessageData | undefined;

    // Start streaming
    const abortController = streamAgentMessage(
      trimmed,
      { contextScope, agentVersion, dataAccess },
      {
        onStart: (data) => {
          intent = data.intent;
        },
        onChunk: (content) => {
          // Ignore if session changed
          if (streamSessionRef.current !== sessionId) return;

          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, updatedMessage]);
        },
        onResult: (data) => {
          // Non-streaming structured result (for non-chat intents)
          if (streamSessionRef.current !== sessionId) return;

          const output = data.output;
          intent = data.intent;

          if (output.type === "explanation") {
            agentData = { type: "explanation", explanation: output };
            streamedContent = output.summary;
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = output.overallAssessment || "Risk analysis complete";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output };
            streamedContent = `Draft ${output.type.toLowerCase().replace("_", " ")} generated`;
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = `${output.actions?.length || 0} action(s) proposed`;
          }

          const resultMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            intent,
            data: agentData,
          };
          updateSessionMessages(sessionId, [...baseMessages, resultMessage]);
        },
        onDone: () => {
          if (streamSessionRef.current !== sessionId) return;

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent || "Response complete",
            timestamp: new Date(),
            status: "success",
            intent,
            data: agentData,
          };
          updateSessionMessages(sessionId, [...baseMessages, finalMessage]);
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
        onError: (error) => {
          if (streamSessionRef.current !== sessionId) return;

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: `Error: ${error}`,
            timestamp: new Date(),
            status: "error",
            data: { type: "error", error },
          };
          updateSessionMessages(sessionId, [...baseMessages, errorMessage]);
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
        onCancelled: () => {
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
      }
    );

    streamAbortRef.current = abortController;
  }, [input, activeSessionId, activeSession, conversation, updateSessionMessages, updateSessionDraft, createSession, isLoading, contextScope, agentVersion, dataAccess]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e as any);
    }
  }, [handleSubmit]);

  // Start a stream for a given user message content (used for Retry/Regenerate actions)
  const startAgentStream = useCallback((userContent: string, opts?: { retryOf?: string; sourceUserId?: string }) => {
    if (!userContent || !activeSessionId || isLoading) return;

    const agentMessageId = `a-${Date.now()}`;
    const streamingMessage: AgentMessage = {
      id: agentMessageId,
      role: "agent",
      content: "",
      timestamp: new Date(),
      status: "sending",
      retryOf: opts?.retryOf,
    };

    const baseMessages = [...(activeSession?.messages || [])];
    updateSessionMessages(activeSessionId, [...baseMessages, streamingMessage]);
    setIsLoading(true);
    streamSessionRef.current = activeSessionId;

    let streamedContent = "";
    let intent = "GENERAL_CHAT";
    let agentData: AgentMessageData | undefined;

    const abortController = streamAgentMessage(
      userContent,
      { contextScope, agentVersion, dataAccess },
      {
        onStart: (data) => {
          intent = data.intent;
        },
        onChunk: (content) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            intent,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, updatedMessage]);
        },
        onResult: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          const output = data.output;
          intent = data.intent;

          if (output.type === "explanation") {
            agentData = { type: "explanation", explanation: output };
            streamedContent = output.summary;
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = output.overallAssessment || "Risk analysis complete";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output };
            streamedContent = `Draft ${output.type.toLowerCase().replace("_", " ")} generated`;
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = `${output.actions?.length || 0} action(s) proposed`;
          }

          const resultMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, resultMessage]);
        },
        onDone: () => {
          if (streamSessionRef.current !== activeSessionId) return;

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent || "Response complete",
            timestamp: new Date(),
            status: "success",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, finalMessage]);
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
        onError: (error) => {
          if (streamSessionRef.current !== activeSessionId) return;

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: `Error: ${error}`,
            timestamp: new Date(),
            status: "error",
            data: { type: "error", error },
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, errorMessage]);
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
        onCancelled: () => {
          setIsLoading(false);
          streamAbortRef.current = null;
          streamSessionRef.current = null;
        },
      }
    );

    streamAbortRef.current = abortController;
  }, [activeSessionId, activeSession, updateSessionMessages, isLoading, contextScope, agentVersion, dataAccess]);


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
    isLoading,
    agentVersion,
    setAgentVersion,
    contextScope,
    setContextScope,
    dataAccess,
    setDataAccess,
    inputRef,
    conversationEndRef,
    scrollContainerRef,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    saveScrollPosition,
    scrollToBottom,
    getRelativeTime,
    cancelStream,
    startAgentStream,
  };
}

