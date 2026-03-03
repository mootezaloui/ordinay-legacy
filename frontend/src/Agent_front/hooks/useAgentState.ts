import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { AgentMessage, AgentMessageData } from "../types/agentMessage";
import { useAgentSessions } from "./useAgentSessions";
import {
  streamAgentMessage,
  ChatMutationLifecycleEvent,
  ContextScope,
  AgentVersion,
  DataAccessPermissions,
  AgentRequestMetadata,
  FollowUpSuggestion,
  FollowUpIntent,
  ExplanationOutput,
  CollectionOutput,
  CommentaryOutput,
  StatusEventData,
  WebSearchResultsOutput,
  WebDeepSearchResultsOutput,
} from "../../services/api/agent";
import { uploadAttachments } from "../../services/api/agentDocuments";
import type { AttachedFile } from "../components/AgentInput";
import { buildFollowUpLabel } from "../utils/followUpLabels";
import {
  attachChatbotTurn,
  chatbotTurnReducer,
  resolveChatbotMutationStateFromAssistantResult,
  resolveChatbotMutationStateFromDone,
} from "../utils/chatbotTurnReducer";
import {
  emitEntityMutationFromAgentOutcome,
  emitEntityMutationFromBackendEvent,
} from "../../core/mutationSync";

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
const DATA_ACCESS_STORAGE_KEY = 'ordinay_agent_data_access';
const HISTORY_SIDEBAR_BREAKPOINT = 1024; // lg
const CONTEXT_SIDEBAR_BREAKPOINT = 1536; // 2xl
const HISTORY_SIDEBAR_STORAGE_KEY = "ordinay_agent_history_sidebar";
const CONTEXT_SIDEBAR_STORAGE_KEY = "ordinay_agent_context_sidebar";

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

function createMessageId(prefix: "u" | "a" | "i"): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function mergeUniqueCommentaryLines(existingMessage: string, incomingMessage: string): string {
  const lines = `${String(existingMessage || "").trim()}\n${String(incomingMessage || "").trim()}`
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  const uniqueLines: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const dedupeKey = line.replace(/\s+/g, " ").toLowerCase();
    if (!seen.has(dedupeKey)) {
      seen.add(dedupeKey);
      uniqueLines.push(line);
    }
  }

  return uniqueLines.join("\n");
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

      // Context resolution fields (for RESOLVE_CONTEXT_AND_CONTINUE)
      originalIntent: followUp.originalIntent,
      originalDraftType: followUp.originalDraftType,
      originalMessage: followUp.originalMessage,
      pendingOperationId: followUp.pendingOperationId,
      resolutionInput: followUp.resolutionInput,
      resolvedEntity: followUp.resolvedEntity,
      selectionId: followUp.selectionId,
      selectionCategory: followUp.selectionCategory,
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

  const handleSubmit = useCallback((e: React.SyntheticEvent, attachments?: AttachedFile[], metadata?: AgentRequestMetadata) => {
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
      id: createMessageId("u"),
      role: "user",
      content: trimmed,
      timestamp: new Date(),
      attachments: messageAttachments,
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    // Show ACK status instantly, but do not persist it in the conversation.
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
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
    let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
    // Track streaming intent framing content
    let streamedIntentContent = "";
    // Track streaming commentary content
    let streamedCommentaryContent = "";

    const decorateAgentMessage = (message: AgentMessage) =>
      attachChatbotTurn(message, chatbotTurnState);

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? nextMessage : msg
      );
      updateSessionMessages(sessionId, workingMessages);
    };

    const upsertIntentMessage = (
      content: string,
      intentOverride?: string,
      structured?: import("../../services/api/agent").IntentFramingOutput
    ) => {
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
        intentFraming: structured,
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
        { contextScope, agentVersion, dataAccess, metadata, sessionId, documentIds: pendingDocumentIds },
        {
        onStart: (data) => {
          intent = data.intent;
          if (streamSessionRef.current !== sessionId) return;
        },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          if (data.visibility === "metadata") return;
          if (!data.message || data.message.trim().length === 0) return;
          // Complete intent framing message - use this as final
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message, undefined, data.structured);
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
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== sessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: agentMessageId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
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
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
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
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);

          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

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
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results" || output.type === "web_deep_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput | WebDeepSearchResultsOutput,
            };
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
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
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          // Reset streaming content since we have complete commentary
          streamedCommentaryContent = mergedMessage;

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
        onDone: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

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
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
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
      id: createMessageId("u"),
      role: "user",
      content: followUpLabel,
      timestamp: new Date(),
      followUpIntent: buildFollowUpIntent(followUp),
    };

    // ========== STAGE 1: IMMEDIATE ACKNOWLEDGEMENT (EPHEMERAL) ==========
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
    const baseMessages = [...currentMessages, userMessage];
    let workingMessages = [...baseMessages];
    updateSessionMessages(sessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(sessionId, { action: "Processing follow-up…", phase: "init" });

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(sessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? nextMessage : msg
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
    let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
    let streamedIntentContent = "";
    let streamedCommentaryContent = "";

    const decorateAgentMessage = (message: AgentMessage) =>
      attachChatbotTurn(message, chatbotTurnState);

    const upsertIntentMessage = (
      content: string,
      intentOverride?: string,
      structured?: import("../../services/api/agent").IntentFramingOutput
    ) => {
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
        intentFraming: structured,
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
      {
        contextScope,
        agentVersion,
        dataAccess,
        followUpIntent: userMessage.followUpIntent,
        sessionId,
      },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== sessionId) return;
          },
          onIntentFraming: (data) => {
            if (streamSessionRef.current !== sessionId) return;
            if (data.visibility === "metadata") return;
            if (!data.message || data.message.trim().length === 0) return;
            streamedIntentContent = data.message;
            upsertIntentMessage(data.message, undefined, data.structured);
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
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== sessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === agentMessageId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: agentMessageId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(sessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
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
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
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
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);

          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

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
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results" || output.type === "web_deep_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput | WebDeepSearchResultsOutput,
            };
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
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
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          streamedCommentaryContent = mergedMessage;

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
        onDone: (data) => {
          if (streamSessionRef.current !== sessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

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
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
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
    opts?: {
      retryOf?: string;
      sourceUserId?: string;
      followUpIntent?: FollowUpIntent;
      metadata?: AgentRequestMetadata;
      sessionId?: string;
      replaceMessageId?: string;  // ID of assistant message to replace (for edits)
      editedMessageId?: string;   // ID of user message to update (for edits)
    }
  ) => {
    if (!userContent || !activeSessionId || isLoading || streamRegistry.isStreaming) return;

    // ========== STAGE 1: ATOMIC MESSAGE UPDATE FOR EDITS ==========
    const agentMessageId = createMessageId("a");
    const intentMessageId = agentMessageId;
    const baseMessages = [...(activeSession?.messages || [])];

    // ATOMIC UPDATE: Remove ALL old assistant messages AND update user message (if edit)
    let workingMessages = baseMessages;

    // If this is an edit, remove ALL assistant/agent messages after the edited user message
    if (opts?.editedMessageId) {
      const editedMsgIndex = workingMessages.findIndex(m => m.id === opts.editedMessageId);
      if (editedMsgIndex !== -1) {
        // Remove all assistant/agent messages after the edited user message
        workingMessages = workingMessages.filter((m, idx) => {
          if (idx <= editedMsgIndex) return true;
          // Remove all agent/assistant messages until we hit another user message
          if (m.role === 'agent' || m.role === 'assistant') return false;
          return true;
        });
      }
      // Update user message content and mark as edited
      workingMessages = workingMessages.map(m =>
        m.id === opts.editedMessageId
          ? { ...m, content: userContent.trim(), edited: true }
          : m
      );
    }

    // If this is a regenerate/retry replacement, clear existing assistant message content in place
    // so the old answer disappears immediately and the new stream reuses the same slot.
    if (opts?.replaceMessageId) {
      workingMessages = workingMessages.map((m) =>
        m.id === opts.replaceMessageId
          ? {
              ...m,
              content: "",
              status: "sending",
              stage: "commentary",
              data: undefined,
              commentary: undefined,
              retryOf: opts?.retryOf,
              timestamp: new Date(),
            }
          : m
      );
    }

    updateSessionMessages(activeSessionId, workingMessages);
    safeSetIsLoading(true);
    // Show immediate loading indicator while waiting for backend
    setSessionStatus(activeSessionId, { action: "Analyzing your request…", phase: "init" });
    streamSessionRef.current = activeSessionId;

    const appendMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      const idx = workingMessages.findIndex((m) => m.id === message.id);
      if (idx !== -1) {
        workingMessages = workingMessages.map((m) =>
          m.id === message.id ? nextMessage : m
        );
      } else {
        workingMessages = [...workingMessages, nextMessage];
      }
      updateSessionMessages(activeSessionId, workingMessages);
    };

    const updateMessage = (message: AgentMessage) => {
      const nextMessage = decorateAgentMessage(message);
      workingMessages = workingMessages.map((msg) =>
        msg.id === message.id ? nextMessage : msg
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
      let chatbotTurnState: AgentMessage["chatbotTurn"] | undefined;
      let streamedIntentContent = "";
      let streamedCommentaryContent = "";

      const decorateAgentMessage = (message: AgentMessage) =>
        attachChatbotTurn(message, chatbotTurnState);

      const upsertIntentMessage = (
        content: string,
        intentOverride?: string,
        structured?: import("../../services/api/agent").IntentFramingOutput
      ) => {
        if (opts?.replaceMessageId) return;
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
          intentFraming: structured,
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
      {
        contextScope,
        agentVersion,
        dataAccess,
        followUpIntent: opts?.followUpIntent,
        metadata: opts?.metadata,
        sessionId: activeSessionId,
      },
        {
          onStart: (data) => {
            intent = data.intent;
            if (streamSessionRef.current !== activeSessionId) return;
          },
        onIntentFraming: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          if (data.visibility === "metadata") return;
          if (!data.message || data.message.trim().length === 0) return;
          streamedIntentContent = data.message;
          upsertIntentMessage(data.message, undefined, data.structured);
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
        onChatMutationLifecycle: (action: ChatMutationLifecycleEvent) => {
          if (streamSessionRef.current !== activeSessionId) return;
          chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
            type: "mutation_execution",
            action,
          });
          const targetId = opts?.replaceMessageId || agentMessageId;
          if (hasAgentMessage) {
            const existing = workingMessages.find((msg) => msg.id === targetId);
            if (existing) updateMessage(existing);
          } else {
            appendMessage({
              id: targetId,
              role: "agent",
              content: "",
              timestamp: new Date(),
              status: "sending",
              stage: "artifact",
              intent,
              data: agentData,
              retryOf: opts?.retryOf,
            });
            hasAgentMessage = true;
          }
          clearSessionStatus(activeSessionId);
        },
        onMutationEvent: (event) => {
          emitEntityMutationFromBackendEvent(event);
        },
        onChunk: (content) => {
          if (streamSessionRef.current !== activeSessionId) return;
          streamedContent += content;
          const updatedMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: streamedContent,
            timestamp: new Date(),
            status: "sending",
            stage: agentData ? "artifact" : "commentary",
            intent,
            data: agentData,
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
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const output = data.output;
          intent = data.intent;
          const mutationResolution = resolveChatbotMutationStateFromAssistantResult({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            outputType: output?.type,
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

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
          } else if (output.type === "context_suggestion") {
            agentData = { type: "context_suggestion", contextSuggestion: output as import("../../services/api/agent").ContextSuggestionOutput };
            streamedContent = "";
          } else if (output.type === "proposal") {
            agentData = { type: "proposal", proposal: output };
            streamedContent = "";
          } else if (output.type === "entity_creation_form") {
            agentData = {
              type: "entity_creation_form",
              entityCreationForm: output as import("../../services/api/agent").EntityCreationFormOutput,
            };
            streamedContent = "";
          } else if (output.type === "document_draft") {
            const proposalArtifact =
              (data as { mutationOutcome?: { proposalArtifact?: unknown } | null })?.mutationOutcome
                ?.proposalArtifact;
            agentData = {
              type: "document_draft",
              documentDraft: output as import("../../services/api/agent").DocumentDraftOutput,
              proposal:
                proposalArtifact && typeof proposalArtifact === "object" && (proposalArtifact as { type?: unknown }).type === "proposal"
                  ? (proposalArtifact as import("../../services/api/agent").ProposalOutput)
                  : undefined,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_preview") {
            agentData = {
              type: "document_generation_preview",
              documentGenerationPreview: output,
            };
            streamedContent = "";
          } else if (output.type === "document_generation_missing_fields") {
            agentData = {
              type: "document_generation_missing_fields",
              documentGenerationMissingFields: output,
            };
            streamedContent = "";
          } else if (output.type === "web_search_results" || output.type === "web_deep_search_results") {
            agentData = {
              type: output.type,
              webSearchResults: output as WebSearchResultsOutput | WebDeepSearchResultsOutput,
            };
            streamedContent = "";
          } else if (output.type === "chat_context_summary") {
            agentData = {
              type: "chat_context_summary",
              chatContextSummary: output as import("../../services/api/agent").ChatContextSummaryOutput,
            };
          } else if (output.type === "recovery") {
            agentData = {
              type: "recovery",
              recovery: output,
            };
            streamedContent = "";
          } else if (output.type === "action_plan") {
            agentData = { type: "actions", actionProposals: output.actions };
            streamedContent = "";
          }

          const resultMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
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
          if (data.visibility === "metadata") return;
          const mergedMessage = mergeUniqueCommentaryLines(
            String(commentary?.message || ""),
            String(data?.message || ""),
          );
          commentary = {
            ...(commentary || {}),
            ...(data || {}),
            message: mergedMessage,
          };
          streamedCommentaryContent = mergedMessage;

          // Update message with commentary (artifact already rendered)
          const messageWithCommentary: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
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
            id: opts?.replaceMessageId || agentMessageId,
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
        onDone: (data) => {
          if (streamSessionRef.current !== activeSessionId) return;
          emitEntityMutationFromAgentOutcome((data as { mutationOutcome?: unknown })?.mutationOutcome);
          const mutationResolution = resolveChatbotMutationStateFromDone({
            mutationOutcome: (data as { mutationOutcome?: { status?: string | null } | null })
              ?.mutationOutcome,
            hasPendingMutation: chatbotTurnState?.mutation?.state === "pending",
          });
          if (mutationResolution) {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: mutationResolution,
            });
          }

          if (deferredFollowUps && agentData?.type === "explanation" && agentData.explanation) {
            agentData = {
              ...agentData,
              explanation: { ...agentData.explanation, followUps: deferredFollowUps },
            };
          }

          const finalMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
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
          if (chatbotTurnState?.mutation?.state === "pending") {
            chatbotTurnState = chatbotTurnReducer(chatbotTurnState, {
              type: "mutation_resolved",
              state: "error",
            });
          }

          const errorMessage: AgentMessage = {
            id: opts?.replaceMessageId || agentMessageId,
            role: "agent",
            content: "",
            timestamp: new Date(),
            status: "success",
            stage: "artifact",
            data: {
              type: "recovery",
              recovery: {
                type: "recovery",
                message: "I could not complete that request.",
                whatHappened: String(error || "The request failed during processing."),
                canRetry: true,
                alternatives: [
                  { label: "Retry request", action: "retry", prompt: "Retry the same request" },
                ],
                suggestedPrompts: ["Retry the same request"],
                context: null,
                severity: "temporary",
              },
            },
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

  const confirmWebSearch = useCallback(
    (metadata: AgentRequestMetadata) => {
      const deepRequested =
        metadata?.webDeepSearchEnabled === true ||
        metadata?.webSearchIntent === "DEEP_SEARCH";
      const safeMetadata: AgentRequestMetadata = {
        webSearchEnabled: true,
        webSearchTrigger: metadata?.webSearchTrigger || "user_confirmed",
        webSearchQuery: metadata?.webSearchQuery,
        webSearchIntent: metadata?.webSearchIntent,
        webDeepSearchEnabled: deepRequested,
        webDeepSearchTrigger: deepRequested
          ? metadata?.webDeepSearchTrigger || metadata?.webSearchTrigger || "user_confirmed"
          : undefined,
        webDeepSearchQuery: deepRequested
          ? metadata?.webDeepSearchQuery || metadata?.webSearchQuery
          : undefined,
      };
      const confirmationMessage =
        safeMetadata.webSearchQuery && safeMetadata.webSearchQuery.trim().length > 0
          ? `Search the web for ${safeMetadata.webSearchQuery}`
          : "Yes, search the web.";
      startAgentStream(confirmationMessage, { metadata: safeMetadata });
    },
    [startAgentStream],
  );

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
    confirmWebSearch,
    startFollowUpIntent,
  };
}

