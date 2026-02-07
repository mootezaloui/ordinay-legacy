import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentMessage, AgentMessageData } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";
import {
  streamAgentMessage,
  ContextScope,
  AgentVersion,
  DataAccessPermissions,
  FollowUpSuggestion,
  FollowUpIntent,
  ExplanationOutput,
  CollectionOutput,
  CommentaryOutput,
  StatusEventData,
} from "../../services/api/agent";
import { uploadAttachments } from "../../services/api/agentDocuments";
import type { AttachedFile } from "../components/AgentInput";
import { buildFollowUpLabel } from "../utils/followUpLabels";

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

const streamRegistry: {
  abortController: AbortController | null;
  sessionId: string | null;
  isStreaming: boolean;
} = {
  abortController: null,
  sessionId: null,
  isStreaming: false,
};

type StreamListener = (state: { isStreaming: boolean; sessionId: string | null }) => void;

const streamListeners = new Set<StreamListener>();

const notifyStreamListeners = () => {
  const snapshot = {
    isStreaming: streamRegistry.isStreaming,
    sessionId: streamRegistry.sessionId,
  };
  streamListeners.forEach((listener) => listener(snapshot));
};

type TransientStatus = {
  sessionId: string;
  action: string;
  phase?: string;
};

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
  const { t } = useTranslation("common");
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
  const [isLoading, setIsLoading] = useState(streamRegistry.isStreaming);
  const [transientStatus, setTransientStatus] = useState<TransientStatus | null>(null);
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
  const isMountedRef = useRef(true);

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

  const activeTransientStatus = useMemo(() => {
    if (!transientStatus || transientStatus.sessionId !== activeSessionId) return null;
    const { sessionId, ...rest } = transientStatus;
    return rest;
  }, [transientStatus, activeSessionId]);

  const safeSetIsLoading = useCallback((value: boolean) => {
    if (isMountedRef.current) {
      setIsLoading(value);
    }
  }, []);

  const safeSetTransientStatus = useCallback((value: TransientStatus | null) => {
    if (isMountedRef.current) {
      setTransientStatus(value);
    }
  }, []);

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

  // Sync with any in-flight stream and avoid aborting on unmount/navigation
  useEffect(() => {
    isMountedRef.current = true;

    const handleStreamUpdate = (state: { isStreaming: boolean; sessionId: string | null }) => {
      if (!isMountedRef.current) return;
      if (state.isStreaming && streamRegistry.abortController) {
        streamAbortRef.current = streamRegistry.abortController;
        streamSessionRef.current = state.sessionId;
        safeSetIsLoading(true);
      } else {
        streamAbortRef.current = null;
        streamSessionRef.current = null;
        safeSetIsLoading(false);
        safeSetTransientStatus(null);
      }
    };

    streamListeners.add(handleStreamUpdate);
    handleStreamUpdate({
      isStreaming: streamRegistry.isStreaming,
      sessionId: streamRegistry.sessionId,
    });

    return () => {
      isMountedRef.current = false;
      streamListeners.delete(handleStreamUpdate);
    };
  }, [safeSetIsLoading, safeSetTransientStatus]);

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

  const registerStream = useCallback((sessionId: string, controller: AbortController) => {
    streamRegistry.abortController = controller;
    streamRegistry.sessionId = sessionId;
    streamRegistry.isStreaming = true;
    streamAbortRef.current = controller;
    streamSessionRef.current = sessionId;
    notifyStreamListeners();
  }, []);

  const clearStreamRegistry = useCallback(() => {
    streamRegistry.abortController = null;
    streamRegistry.sessionId = null;
    streamRegistry.isStreaming = false;
    streamAbortRef.current = null;
    streamSessionRef.current = null;
    notifyStreamListeners();
  }, []);

  // Cancel current stream (can be called from UI)
  const cancelStream = useCallback(() => {
    const controller = streamAbortRef.current || streamRegistry.abortController;
    if (controller) {
      controller.abort();
    }
    clearStreamRegistry();
    safeSetIsLoading(false);
    safeSetTransientStatus(null);
  }, [clearStreamRegistry, safeSetIsLoading, safeSetTransientStatus]);

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

  const setSessionStatus = useCallback(
    (sessionId: string, status: Omit<TransientStatus, "sessionId">) => {
      if (!isMountedRef.current) return;
      setTransientStatus({ sessionId, ...status });
    },
    [],
  );

  const clearSessionStatus = useCallback((sessionId: string) => {
    if (!isMountedRef.current) return;
    setTransientStatus((prev) => {
      if (!prev) return prev;
      if (prev.sessionId !== sessionId) return prev;
      return null;
    });
  }, []);

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

  const handleSubmit = useCallback((e: React.SyntheticEvent, attachments?: AttachedFile[]) => {
    e.preventDefault();
    const trimmed = input.trim();
    // Allow send if there's text OR attachments
    if ((!trimmed && (!attachments || attachments.length === 0)) || isLoading || streamRegistry.isStreaming) return;

    // Use existing session if we have an activeSessionId, otherwise create new
    let sessionId = activeSessionId;
    let currentMessages = conversation;
    if (!activeSessionId || !activeSession) {
      const newSession = createSession();
      sessionId = newSession.id;
      currentMessages = [];
    }

    // Build attachment metadata for visual rendering in chat
    const messageAttachments = attachments && attachments.length > 0
      ? attachments.map(a => ({ id: a.id, name: a.name, type: a.type, size: a.size, preview: a.preview }))
      : undefined;

    const userMessage: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
      attachments: messageAttachments,
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    // Show ACK status instantly, but do not persist it in the conversation.
    const agentMessageId = `a-${Date.now()}`;
    const intentMessageId = `i-${Date.now()}`;
    // Capture current messages for updates
    const baseMessages = [...currentMessages, userMessage];
    let workingMessages = [...baseMessages];
    updateSessionMessages(sessionId, workingMessages);
    setInput("");
    updateSessionDraft(sessionId, "");
    safeSetIsLoading(true);

    // ========== ATTACHMENT UPLOAD + STREAM ORCHESTRATION ==========
    // Upload attachments (if any), then start the agent stream.
    // Document IDs are passed to the stream so the backend can load their text.
    let pendingDocumentIds: number[] = [];

    const launchStream = async () => {
      if (attachments && attachments.length > 0) {
        setSessionStatus(sessionId, { action: "Uploading documents…", phase: "uploading" });
        try {
          const uploadedDocs = await uploadAttachments(
            sessionId,
            attachments.map(a => ({
              type: a.type,
              file: a.file,
              documentId: a.documentId,
              name: a.name,
            })),
            userMessage.id,
          );
          pendingDocumentIds = uploadedDocs.map(d => d.document_id);
          console.log('[Agent] Uploaded', pendingDocumentIds.length, 'documents for session', sessionId);
        } catch (err) {
          console.error('[Agent] Attachment upload failed:', err);
          // Continue without documents — agent will handle gracefully
        }
      }
      setSessionStatus(sessionId, { action: "Analyzing your request…", phase: "init" });
      beginStreaming();
    };

    // Define beginStreaming below (uses pendingDocumentIds from closure)
    const beginStreaming = () => {

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
    let deferredFollowUps: FollowUpSuggestion[] | null = null;
    let commentary: CommentaryOutput | undefined;
    let hasAgentMessage = false;
    let hasIntentMessage = false;
    // Track streaming intent framing content
    let streamedIntentContent = "";
    // Track streaming commentary content
    let streamedCommentaryContent = "";

    const appendMessage = (message: AgentMessage) => {
      workingMessages = [...workingMessages, message];
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? message : msg
      );
      updateSessionMessages(sessionId, workingMessages);
    };

    const upsertIntentMessage = (content: string, intentOverride?: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;
      const intentMessage: AgentMessage = {
        id: intentMessageId,
        role: "agent",
        content: trimmedContent,
        timestamp: new Date(),
        stage: "intent",
        intent: intentOverride || intent,
        messageType: "AGENT_INTENT_MESSAGE",
      };
      const exists = workingMessages.some((msg) => msg.id === intentMessageId);
      if (exists) {
        updateMessage(intentMessage);
      } else {
        appendMessage(intentMessage);
      }
      hasIntentMessage = true;
    };

    // Start streaming
      const abortController = streamAgentMessage(
        trimmed,
        { contextScope, agentVersion, dataAccess, sessionId, documentIds: pendingDocumentIds },
        {
        onStart: (data) => {
          intent = data.intent;
          if (streamSessionRef.current !== sessionId) return;
        },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          if (!data.message || data.message.trim().length === 0) return;
          // Complete intent framing message - use this as final
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message);
        },
        onIntentFramingChunk: (chunk) => {
          // Streaming intent framing - accumulate and update in real-time
          if (streamSessionRef.current !== sessionId) return;
          streamedIntentContent += chunk;
          upsertIntentMessage(streamedIntentContent);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          // Update status action text as processing progresses
          if (streamSessionRef.current !== sessionId) return;
          setSessionStatus(sessionId, { action: data.action, phase: data.phase });
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
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          // Non-streaming structured result (for non-chat intents)
          if (streamSessionRef.current !== sessionId) return;

          const output = data.output;
          intent = data.intent;

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          // The backend should send chat via chunks, but if it arrives as result, handle it
          if (output.type === "chat") {
            streamedContent = (output as import("../../services/api/agent").ChatOutput).message || "";
            // No artifact data for chat - it's purely conversational
            agentData = undefined;
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
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
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          // Receive complete conversational commentary about the artifact
          if (streamSessionRef.current !== sessionId) return;
          commentary = data;
          // Reset streaming content since we have complete commentary
          streamedCommentaryContent = data.message || "";

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
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          // Streaming commentary - accumulate and update in real-time
          if (streamSessionRef.current !== sessionId) return;
          streamedCommentaryContent += chunk;

          // Create temporary commentary object for display
          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          // Update message with streaming commentary
          const messageWithStreamingCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: () => {
          if (streamSessionRef.current !== sessionId) return;

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== sessionId) return;

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: error,
            timestamp: new Date(),
            status: "error",
            data: { type: "error", error },
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
      }
      );

      registerStream(sessionId, abortController);
    }; // end beginStreaming

    // Launch the async upload + stream pipeline
    launchStream();
  }, [
    input,
    activeSessionId,
    activeSession,
    conversation,
    updateSessionMessages,
    updateSessionDraft,
    createSession,
    isLoading,
    contextScope,
    agentVersion,
    dataAccess,
    setInput,
    scrollToBottom,
    setSessionStatus,
    clearSessionStatus,
    safeSetIsLoading,
    registerStream,
    clearStreamRegistry,
  ]);

  const startFollowUpIntent = useCallback((followUp: FollowUpSuggestion) => {
    if (!followUp || isLoading || streamRegistry.isStreaming) return;
    const followUpLabel = buildFollowUpLabel(followUp, t);

    // Use existing session if we have an activeSessionId, otherwise create new
    let sessionId = activeSessionId;
    let currentMessages = conversation;
    if (!activeSessionId || !activeSession) {
      const newSession = createSession();
      sessionId = newSession.id;
      currentMessages = [];
    }

    const userMessage: AgentMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: followUpLabel,
      timestamp: new Date(),
      followUpIntent: buildFollowUpIntent(followUp),
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    const agentMessageId = `a-${Date.now()}`;
    const intentMessageId = `i-${Date.now()}`;
    const baseMessages = [...currentMessages, userMessage];
    let workingMessages = [...baseMessages];
    updateSessionMessages(sessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(sessionId, { action: "Processing follow-up…", phase: "init" });

    const appendMessage = (message: AgentMessage) => {
      workingMessages = [...workingMessages, message];
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? message : msg
      );
      updateSessionMessages(sessionId, workingMessages);
    };

    // Reset user scroll tracking and scroll to bottom
    isUserScrolledUpRef.current = false;
    setTimeout(() => scrollToBottom("smooth"), 50);

    streamSessionRef.current = sessionId;

    let streamedContent = "";
    let intent = followUp.intent || "READ_DATA";
    let agentData: AgentMessageData | undefined;
    let deferredFollowUps: FollowUpSuggestion[] | null = null;
    let commentary: CommentaryOutput | undefined;
    let hasAgentMessage = false;
    let hasIntentMessage = false;
    let streamedIntentContent = "";
    let streamedCommentaryContent = "";

    const upsertIntentMessage = (content: string, intentOverride?: string) => {
      const trimmedContent = content.trim();
      if (!trimmedContent) return;
      const intentMessage: AgentMessage = {
        id: intentMessageId,
        role: "agent",
        content: trimmedContent,
        timestamp: new Date(),
        stage: "intent",
        intent: intentOverride || intent,
        messageType: "AGENT_INTENT_MESSAGE",
      };
      const exists = workingMessages.some((msg) => msg.id === intentMessageId);
      if (exists) {
        updateMessage(intentMessage);
      } else {
        appendMessage(intentMessage);
      }
      hasIntentMessage = true;
    };

    const abortController = streamAgentMessage(
      followUpLabel,
      { contextScope, agentVersion, dataAccess, followUpIntent: userMessage.followUpIntent },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== sessionId) return;
          },
          onIntentFraming: (data) => {
            if (streamSessionRef.current !== sessionId) return;
            if (!data.message || data.message.trim().length === 0) return;
            streamedIntentContent = data.message;
            upsertIntentMessage(data.message);
          },
          onIntentFramingChunk: (chunk) => {
            if (streamSessionRef.current !== sessionId) return;
            streamedIntentContent += chunk;
            upsertIntentMessage(streamedIntentContent);
          },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== sessionId) return;
          setSessionStatus(sessionId, { action: data.action, phase: data.phase });
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
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== sessionId) return;

          const output = data.output;
          intent = data.intent;

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          if (output.type === "chat") {
            streamedContent = (output as import("../../services/api/agent").ChatOutput).message || "";
            agentData = undefined;
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (
            ["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(
              output.type
            )
          ) {
            agentData = {
              type: "draft",
              draft: output as import("../../services/api/agent").DraftOutput,
            };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
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
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== sessionId) return;
          commentary = data;
          streamedCommentaryContent = data.message || "";

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
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          if (streamSessionRef.current !== sessionId) return;
          streamedCommentaryContent += chunk;

          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          const messageWithStreamingCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: () => {
          if (streamSessionRef.current !== sessionId) return;

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== sessionId) return;

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: error,
            timestamp: new Date(),
            status: "error",
            data: { type: "error", error },
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(sessionId);
        },
      }
    );

    registerStream(sessionId, abortController);
  }, [
    activeSessionId,
    activeSession,
    buildFollowUpIntent,
    conversation,
    createSession,
    dataAccess,
    agentVersion,
    contextScope,
    isLoading,
    scrollToBottom,
    updateSessionMessages,
    setSessionStatus,
    clearSessionStatus,
    t,
    safeSetIsLoading,
    registerStream,
    clearStreamRegistry,
  ]);

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
    if (!userContent || !activeSessionId || isLoading || streamRegistry.isStreaming) return;

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    const agentMessageId = `a-${Date.now()}`;
    const intentMessageId = `i-${Date.now()}`;
    const baseMessages = [...(activeSession?.messages || [])];
    let workingMessages = [...baseMessages];
    updateSessionMessages(activeSessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(activeSessionId, { action: "Analyzing your request…", phase: "init" });
    streamSessionRef.current = activeSessionId;

    const appendMessage = (message: AgentMessage) => {
      workingMessages = [...workingMessages, message];
      updateSessionMessages(activeSessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? message : msg
      );
      updateSessionMessages(activeSessionId, workingMessages);
    };

      let streamedContent = "";
      let intent = "GENERAL_CHAT";
      let agentData: AgentMessageData | undefined;
      let deferredFollowUps: FollowUpSuggestion[] | null = null;
      let commentary: CommentaryOutput | undefined;
      let hasAgentMessage = false;
      let hasIntentMessage = false;
      let streamedIntentContent = "";
      let streamedCommentaryContent = "";

      const upsertIntentMessage = (content: string, intentOverride?: string) => {
        const trimmedContent = content.trim();
        if (!trimmedContent) return;
        const intentMessage: AgentMessage = {
          id: intentMessageId,
          role: "agent",
          content: trimmedContent,
          timestamp: new Date(),
          stage: "intent",
          intent: intentOverride || intent,
          messageType: "AGENT_INTENT_MESSAGE",
          retryOf: opts?.retryOf,
        };
        const exists = workingMessages.some((msg) => msg.id === intentMessageId);
        if (exists) {
          updateMessage(intentMessage);
        } else {
          appendMessage(intentMessage);
        }
        hasIntentMessage = true;
      };

      const abortController = streamAgentMessage(
      userContent,
      { contextScope, agentVersion, dataAccess, followUpIntent: opts?.followUpIntent },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== activeSessionId) return;
          },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          if (!data.message || data.message.trim().length === 0) return;
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message);
        },
        onIntentFramingChunk: (chunk) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedIntentContent += chunk;
          upsertIntentMessage(streamedIntentContent);
        },
        onStatus: (data: StatusEventData) => {
          // ========== STAGE 2: STATUS UPDATES ==========
          if (streamSessionRef.current !== activeSessionId) return;
          setSessionStatus(activeSessionId, { action: data.action, phase: data.phase });
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
          if (hasAgentMessage) {
            updateMessage(updatedMessage);
          } else {
            appendMessage(updatedMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onResult: (data) => {
          // ========== STAGE 3: ARTIFACT ==========
          if (streamSessionRef.current !== activeSessionId) return;
          const output = data.output;
          intent = data.intent;

          // TURN COMPLETION INVARIANT: Handle chat outputs defensively
          if (output.type === "chat") {
            streamedContent = (output as import("../../services/api/agent").ChatOutput).message || "";
            agentData = undefined;
          } else if (output.type === "explanation") {
            const explanation = output as ExplanationOutput;
            if (Array.isArray(explanation.followUps) && explanation.followUps.length > 0) {
              deferredFollowUps = explanation.followUps;
              agentData = {
                type: "explanation",
                explanation: { ...explanation, followUps: [] },
              };
            } else {
              agentData = { type: "explanation", explanation };
            }
            streamedContent = "";
          } else if (output.type === "clarification") {
            agentData = { type: "clarification", clarification: output };
            streamedContent = "";
          } else if (output.type === "operational_risk_analysis") {
            agentData = { type: "risks", risks: output };
            streamedContent = "";
          } else if (["INVITATION", "CLIENT_EMAIL", "HEARING_SUMMARY", "INTERNAL_NOTE"].includes(output.type)) {
            agentData = { type: "draft", draft: output as import("../../services/api/agent").DraftOutput };
            streamedContent = "";
          } else if (output.type === "collection") {
            agentData = { type: "collection", collection: output as CollectionOutput };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
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
          if (hasAgentMessage) {
            updateMessage(resultMessage);
          } else {
            appendMessage(resultMessage);
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onCommentary: (data) => {
          // ========== STAGE 4: COMMENTARY ==========
          if (streamSessionRef.current !== activeSessionId) return;
          commentary = data;
          streamedCommentaryContent = data.message || "";

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
          if (hasAgentMessage) {
            updateMessage(messageWithCommentary);
          } else {
            appendMessage(messageWithCommentary);
            hasAgentMessage = true;
          }
        },
        onCommentaryChunk: (chunk) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedCommentaryContent += chunk;

          const streamingCommentary: CommentaryOutput = {
            message: streamedCommentaryContent,
            source: "llm",
            signals: [],
          };

          const messageWithStreamingCommentary: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: "artifact",
            intent,
            data: agentData,
            commentary: streamingCommentary,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(messageWithStreamingCommentary);
          } else {
            appendMessage(messageWithStreamingCommentary);
            hasAgentMessage = true;
          }
        },
        onDone: () => {
          if (streamSessionRef.current !== activeSessionId) return;

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          const finalMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "success",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
            commentary,
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(finalMessage);
          } else {
            appendMessage(finalMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
        onError: (error) => {
          if (streamSessionRef.current !== activeSessionId) return;

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: error,
            timestamp: new Date(),
            status: "error",
            data: { type: "error", error },
            retryOf: opts?.retryOf,
          };
          if (hasAgentMessage) {
            updateMessage(errorMessage);
          } else {
            appendMessage(errorMessage);
            hasAgentMessage = true;
          }
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
        onCancelled: () => {
          safeSetIsLoading(false);
          clearStreamRegistry();
          clearSessionStatus(activeSessionId);
        },
      }
    );

    registerStream(activeSessionId, abortController);
  }, [
    activeSessionId,
    activeSession,
    updateSessionMessages,
    isLoading,
    contextScope,
    agentVersion,
    dataAccess,
    setSessionStatus,
    clearSessionStatus,
    safeSetIsLoading,
    registerStream,
    clearStreamRegistry,
  ]);

  // Handler for clicking example suggestions (populates input)
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
    transientStatus: activeTransientStatus,
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

