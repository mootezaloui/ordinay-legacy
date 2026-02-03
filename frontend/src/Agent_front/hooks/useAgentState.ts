import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { AgentMessage, AgentMessageData, AgentMessageStage } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";
import {
  streamAgentMessage,
  ContextScope,
  AgentVersion,
  DataAccessPermissions,
  FollowUpSuggestion,
  FollowUpIntent,
  CommentaryOutput,
  StatusEventData,
} from "../../services/api/agent";
import { getContextualAckPhrase } from "../utils/ackPhrases";

// Default data access - all domains enabled
const DEFAULT_DATA_ACCESS: DataAccessPermissions = {
  clients: true,
  dossiers: true,
  lawsuits: true,
  tasks: true,
  personalTasks: true,
  missions: true,
  sessions: true,
  financialEntries: true,
  notifications: true,
  history: true,
  documents: true,
};

// Storage key for persisting data access permissions
const DATA_ACCESS_STORAGE_KEY = 'organia_agent_data_access';
const HISTORY_SIDEBAR_BREAKPOINT = 1024; // lg
const CONTEXT_SIDEBAR_BREAKPOINT = 1536; // 2xl
const HISTORY_SIDEBAR_STORAGE_KEY = "organia_agent_history_sidebar";
const CONTEXT_SIDEBAR_STORAGE_KEY = "organia_agent_context_sidebar";

function getInitialSidebarVisibility() {
  if (typeof window === "undefined") {
    return { showHistory: true, showContext: true };
  }

  const defaultHistory = window.matchMedia(
    `(min-width: ${HISTORY_SIDEBAR_BREAKPOINT}px)`
  ).matches;
  const defaultContext = window.matchMedia(
    `(min-width: ${CONTEXT_SIDEBAR_BREAKPOINT}px)`
  ).matches;

  try {
    const storedHistory = localStorage.getItem(HISTORY_SIDEBAR_STORAGE_KEY);
    const storedContext = localStorage.getItem(CONTEXT_SIDEBAR_STORAGE_KEY);

    return {
      showHistory:
        storedHistory === null ? defaultHistory : storedHistory === "true",
      showContext:
        storedContext === null ? defaultContext : storedContext === "true",
    };
  } catch {
    return { showHistory: defaultHistory, showContext: defaultContext };
  }
}

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

  const [inputBySession, setInputBySession] = useState<Record<string, string>>(
    {}
  );
  const initialVisibility = useMemo(() => getInitialSidebarVisibility(), []);
  const [showHistorySidebar, setShowHistorySidebar] = useState(
    initialVisibility.showHistory
  );
  const [showContextSidebar, setShowContextSidebar] = useState(
    initialVisibility.showContext
  );
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

  const pendingSessionKey = "__pending__";
  const inputKey = activeSessionId || pendingSessionKey;
  const input = inputBySession[inputKey] ?? activeSession?.draft ?? "";

  const setInput = useCallback(
    (value: string) => {
      setInputBySession((prev) => ({ ...prev, [inputKey]: value }));
    },
    [inputKey]
  );

  // Get messages from active session
  const conversation = useMemo(
    () => activeSession?.messages ?? [],
    [activeSession?.messages]
  );

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

  // Persist sidebar visibility
  useEffect(() => {
    try {
      localStorage.setItem(
        HISTORY_SIDEBAR_STORAGE_KEY,
        String(showHistorySidebar)
      );
      localStorage.setItem(
        CONTEXT_SIDEBAR_STORAGE_KEY,
        String(showContextSidebar)
      );
    } catch {
      // Ignore storage errors
    }
  }, [showHistorySidebar, showContextSidebar]);

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
          // No saved position, scroll to bottom (when opening a session)
          scrollToBottom("smooth");
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

  const buildFollowUpIntent = useCallback(
    (followUp: FollowUpSuggestion): FollowUpIntent => ({
      type: "FOLLOW_UP_INTENT",
      intent: followUp.intent,
      entityType: followUp.entityType,
      entityId: followUp.entityId,
      origin: followUp.origin || {
        entity: followUp.entityType.toUpperCase(),
        entityId: followUp.entityId,
      },
      scope: followUp.scope || {},
      filters: followUp.filters,
    }),
    []
  );

  // Collapse sidebars when the viewport gets too small.
  useEffect(() => {
    if (typeof window === "undefined") return;

    const historyQuery = window.matchMedia(`(min-width: ${HISTORY_SIDEBAR_BREAKPOINT}px)`);
    const contextQuery = window.matchMedia(`(min-width: ${CONTEXT_SIDEBAR_BREAKPOINT}px)`);

    const handleChange = () => {
      if (!historyQuery.matches) {
        setShowHistorySidebar(false);
      }
      if (!contextQuery.matches) {
        setShowContextSidebar(false);
      }
    };

    handleChange();
    if (historyQuery.addEventListener) {
      historyQuery.addEventListener("change", handleChange);
      contextQuery.addEventListener("change", handleChange);
    } else {
      historyQuery.addListener(handleChange);
      contextQuery.addListener(handleChange);
    }

    return () => {
      if (historyQuery.removeEventListener) {
        historyQuery.removeEventListener("change", handleChange);
        contextQuery.removeEventListener("change", handleChange);
      } else {
        historyQuery.removeListener(handleChange);
        contextQuery.removeListener(handleChange);
      }
    };
  }, []);

  // Save draft on input change (debounced)
  useEffect(() => {
    if (!activeSessionId) return;
    const timeout = setTimeout(() => {
      updateSessionDraft(activeSessionId, input);
    }, 300);
    return () => clearTimeout(timeout);
  }, [input, activeSessionId, updateSessionDraft]);

  const handleSubmit = useCallback((e: React.SyntheticEvent) => {
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

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT ==========
    // Show ACK message INSTANTLY, before any API call
    const agentMessageId = `a-${Date.now()}`;
    const ackPhrase = getContextualAckPhrase(trimmed);
    const ackMessage: AgentMessage = {
      id: agentMessageId,
      role: "agent",
      content: ackPhrase,
      timestamp: new Date(),
      status: "sending",
      stage: "ack", // Mark as acknowledgement stage
    };

    // Capture current messages for updates
    const baseMessages = [...currentMessages, userMessage];
    updateSessionMessages(sessionId, [...baseMessages, ackMessage]);
    setInput("");
    updateSessionDraft(sessionId, "");
    setIsLoading(true);

    // Reset user scroll tracking and scroll to bottom immediately when sending a message
    isUserScrolledUpRef.current = false;
    // Use a small delay to ensure DOM has updated with new messages
    setTimeout(() => scrollToBottom("smooth"), 50);

    // Track which session this stream belongs to
    streamSessionRef.current = sessionId;

    // Accumulated content for streaming
    let streamedContent = "";
    let intent = "GENERAL_CHAT";
    let agentData: AgentMessageData | undefined;
    let commentary: CommentaryOutput | undefined;
    let currentStage: AgentMessageStage = "ack";
    let currentStatusAction = ackPhrase;

    // Start streaming
    const abortController = streamAgentMessage(
      trimmed,
      { contextScope, agentVersion, dataAccess },
      {
        onStart: (data) => {
          intent = data.intent;
          // Transition to status stage when intent is known
          if (streamSessionRef.current !== sessionId) return;
          currentStage = "status";
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: currentStatusAction,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: currentStatusAction,
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, statusMessage]);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          // Update status action text as processing progresses
          if (streamSessionRef.current !== sessionId) return;
          currentStage = "status";
          currentStatusAction = data.action;
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: data.action,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: data.action,
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, statusMessage]);
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
            stage: "commentary", // Streaming text is commentary
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, updatedMessage]);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          // Non-streaming structured result (for non-chat intents)
          if (streamSessionRef.current !== sessionId) return;

          const output = data.output;
          intent = data.intent;
          currentStage = "artifact";

          if (output.type === "explanation") {
            agentData = { type: "explanation", explanation: output };
            streamedContent = (output as { facts?: { summary?: string }; summary?: string }).facts?.summary || (output as { summary?: string }).summary || "Entity loaded";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = output.overallAssessment || "Risk analysis complete";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
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
            stage: "artifact",
            intent,
            data: agentData,
          };
          updateSessionMessages(sessionId, [...baseMessages, resultMessage]);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          // Receive conversational commentary about the artifact
          if (streamSessionRef.current !== sessionId) return;
          commentary = data;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact", // Keep as artifact, commentary is additional
            intent,
            data: agentData,
            commentary,
          };
          updateSessionMessages(sessionId, [...baseMessages, messageWithCommentary]);
        },
        onDone: () => {
          if (streamSessionRef.current !== sessionId) return;

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent || "Response complete",
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
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
  }, [input, activeSessionId, activeSession, conversation, updateSessionMessages, updateSessionDraft, createSession, isLoading, contextScope, agentVersion, dataAccess, setInput]);

  const startFollowUpIntent = useCallback((followUp: FollowUpSuggestion) => {
    if (!followUp || isLoading) return;

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
      content: followUp.label,
      timestamp: new Date(),
      followUpIntent: buildFollowUpIntent(followUp),
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT ==========
    const agentMessageId = `a-${Date.now()}`;
    const ackPhrase = getContextualAckPhrase(followUp.label);
    const ackMessage: AgentMessage = {
      id: agentMessageId,
      role: "agent",
      content: ackPhrase,
      timestamp: new Date(),
      status: "sending",
      stage: "ack",
    };

    const baseMessages = [...currentMessages, userMessage];
    updateSessionMessages(sessionId, [...baseMessages, ackMessage]);
    setIsLoading(true);

    // Reset user scroll tracking and scroll to bottom
    isUserScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom("smooth"), 50);

    streamSessionRef.current = sessionId;

    let streamedContent = "";
    let intent = followUp.intent || "READ_DATA";
    let agentData: AgentMessageData | undefined;
    let commentary: CommentaryOutput | undefined;
    let currentStatusAction = ackPhrase;

    const abortController = streamAgentMessage(
      followUp.label,
      { contextScope, agentVersion, dataAccess, followUpIntent: userMessage.followUpIntent },
      {
        onStart: (data) => {
          intent = data.intent;
          if (streamSessionRef.current !== sessionId) return;
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: currentStatusAction,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: currentStatusAction,
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, statusMessage]);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== sessionId) return;
          currentStatusAction = data.action;
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: data.action,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: data.action,
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, statusMessage]);
        },
        onChunk: (content) => {
          if (streamSessionRef.current !== sessionId) return;

          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "commentary",
            intent,
          };
          updateSessionMessages(sessionId, [...baseMessages, updatedMessage]);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== sessionId) return;

          const output = data.output;
          intent = data.intent;

          if (output.type === "explanation") {
            agentData = { type: "explanation", explanation: output };
            streamedContent =
              (output as { facts?: { summary?: string }; summary?: string })
                .facts?.summary ||
              (output as { summary?: string }).summary ||
              "Entity loaded";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = output.overallAssessment || "Risk analysis complete";
          } else if (
            ["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(
              output.type
            )
          ) {
            agentData = {
              type: "draft",
              draft: output as import("../../services/api/agent").DraftOutput,
            };
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
            stage: "artifact",
            intent,
            data: agentData,
          };
          updateSessionMessages(sessionId, [...baseMessages, resultMessage]);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== sessionId) return;
          commentary = data;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary,
          };
          updateSessionMessages(sessionId, [...baseMessages, messageWithCommentary]);
        },
        onDone: () => {
          if (streamSessionRef.current !== sessionId) return;

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent || "Response complete",
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
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
  }, [activeSessionId, activeSession, buildFollowUpIntent, conversation, createSession, dataAccess, agentVersion, contextScope, isLoading, scrollToBottom, updateSessionMessages]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  }, [handleSubmit]);

  // Start a stream for a given user message content (used for Retry/Regenerate actions)
  const startAgentStream = useCallback((
    userContent: string,
    opts?: { retryOf?: string; sourceUserId?: string; followUpIntent?: FollowUpIntent }
  ) => {
    if (!userContent || !activeSessionId || isLoading) return;

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT ==========
    const agentMessageId = `a-${Date.now()}`;
    const ackPhrase = getContextualAckPhrase(userContent);
    const ackMessage: AgentMessage = {
      id: agentMessageId,
      role: "agent",
      content: ackPhrase,
      timestamp: new Date(),
      status: "sending",
      stage: "ack",
      retryOf: opts?.retryOf,
    };

    const baseMessages = [...(activeSession?.messages || [])];
    updateSessionMessages(activeSessionId, [...baseMessages, ackMessage]);
    setIsLoading(true);
    streamSessionRef.current = activeSessionId;

    let streamedContent = "";
    let intent = "GENERAL_CHAT";
    let agentData: AgentMessageData | undefined;
    let commentary: CommentaryOutput | undefined;
    let currentStatusAction = ackPhrase;

    const abortController = streamAgentMessage(
      userContent,
      { contextScope, agentVersion, dataAccess, followUpIntent: opts?.followUpIntent },
      {
        onStart: (data) => {
          intent = data.intent;
          // Transition to status stage when intent is known
          if (streamSessionRef.current !== activeSessionId) return;
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: currentStatusAction,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: currentStatusAction,
            intent,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, statusMessage]);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== activeSessionId) return;
          currentStatusAction = data.action;
          const statusMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: data.action,
            timestamp: new Date(),
            status: "sending",
            stage: "status",
            statusAction: data.action,
            intent,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, statusMessage]);
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
            stage: "commentary",
            intent,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, updatedMessage]);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== activeSessionId) return;
          const output = data.output;
          intent = data.intent;

          if (output.type === "explanation") {
            agentData = { type: "explanation", explanation: output };
            streamedContent = (output as { facts?: { summary?: string }; summary?: string }).facts?.summary || (output as { summary?: string }).summary || "Entity loaded";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = output.overallAssessment || "Risk analysis complete";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
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
            stage: "artifact",
            intent,
            data: agentData,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, resultMessage]);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== activeSessionId) return;
          commentary = data;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary,
            retryOf: opts?.retryOf,
          };
          updateSessionMessages(activeSessionId, [...baseMessages, messageWithCommentary]);
        },
        onDone: () => {
          if (streamSessionRef.current !== activeSessionId) return;

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent || "Response complete",
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
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
  }, [setInput]);

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
    startFollowUpIntent,
  };
}

