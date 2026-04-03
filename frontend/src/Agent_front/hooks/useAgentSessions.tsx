/* eslint-disable react-refresh/only-export-components */
import {
  useState,
  useEffect,
  useCallback,
  useRef,
  createContext,
  useContext,
  ReactNode,
} from "react";
import { AgentSession, AgentFolder } from "../types/agentSession";
import { AgentMessage } from "../types/agentMessage";

const STORAGE_KEY = "ordinay_agent_conversations";
const FOLDERS_STORAGE_KEY = "ordinay_agent_folders";

// ============================================================================
// ID Generation
// ============================================================================

function generateId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================================================
// Factory Functions
// ============================================================================

function createEmptySession(
  orderIndex: number,
  folderId: string | null = null,
): AgentSession {
  const now = new Date();
  return {
    id: generateId("conv"),
    title: "New Conversation",
    lastMessage: "",
    timestamp: now,
    messageCount: 0,
    createdAt: now,
    updatedAt: now,
    messages: [],
    pinned: false,
    orderIndex,
    folderId,
    draft: "",
  };
}

function createEmptyFolder(orderIndex: number): AgentFolder {
  const now = new Date();
  return {
    id: generateId("folder"),
    title: "New Folder",
    createdAt: now,
    updatedAt: now,
    orderIndex,
    isExpanded: true,
  };
}

// ============================================================================
// Serialization / Deserialization
// ============================================================================

function serializeSessions(sessions: AgentSession[]): string {
  return JSON.stringify(
    sessions.map((s) => ({
      ...s,
      timestamp: s.timestamp.toISOString(),
      createdAt: s.createdAt.toISOString(),
      updatedAt: s.updatedAt.toISOString(),
      messages: s.messages.map((m) => ({
        ...m,
        timestamp: m.timestamp.toISOString(),
      })),
    })),
  );
}

type SerializedAgentMessage = Omit<AgentMessage, "timestamp"> & {
  timestamp: string;
};
type SerializedAgentSession = Omit<
  AgentSession,
  "timestamp" | "createdAt" | "updatedAt" | "messages"
> & {
  timestamp: string;
  createdAt: string;
  updatedAt: string;
  messages: SerializedAgentMessage[];
};

function deserializeSessions(data: string): AgentSession[] {
  try {
    const parsed = JSON.parse(data) as SerializedAgentSession[];
    return parsed.map((s) => ({
      ...s,
      timestamp: new Date(s.timestamp),
      createdAt: new Date(s.createdAt),
      updatedAt: new Date(s.updatedAt),
      folderId: s.folderId ?? null,
      messages: (s.messages || []).map((m) => ({
        ...m,
        timestamp: new Date(m.timestamp),
      })),
    }));
  } catch {
    return [];
  }
}

function serializeFolders(folders: AgentFolder[]): string {
  return JSON.stringify(
    folders.map((f) => ({
      ...f,
      createdAt: f.createdAt.toISOString(),
      updatedAt: f.updatedAt.toISOString(),
    })),
  );
}

type SerializedAgentFolder = Omit<AgentFolder, "createdAt" | "updatedAt"> & {
  createdAt: string;
  updatedAt: string;
};

function deserializeFolders(data: string): AgentFolder[] {
  try {
    const parsed = JSON.parse(data) as SerializedAgentFolder[];
    return parsed.map((f) => ({
      ...f,
      createdAt: new Date(f.createdAt),
      updatedAt: new Date(f.updatedAt),
    }));
  } catch {
    return [];
  }
}

// ============================================================================
// Storage Operations
// ============================================================================

function loadSessionsFromStorage(): AgentSession[] {
  try {
    const data = localStorage.getItem(STORAGE_KEY);
    if (data) {
      const sessions = deserializeSessions(data);
      if (sessions.length > 0) {
        return sessions.sort((a, b) => a.orderIndex - b.orderIndex);
      }
    }
  } catch (e) {
    console.error("Failed to load agent sessions from storage:", e);
  }
  // Return empty array - session will be created when user sends first message
  return [];
}

function loadFoldersFromStorage(): AgentFolder[] {
  try {
    const data = localStorage.getItem(FOLDERS_STORAGE_KEY);
    if (data) {
      return deserializeFolders(data).sort(
        (a, b) => a.orderIndex - b.orderIndex,
      );
    }
  } catch (e) {
    console.error("Failed to load agent folders from storage:", e);
  }
  return [];
}

function saveSessions(sessions: AgentSession[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, serializeSessions(sessions));
  } catch (e) {
    console.error("Failed to save agent sessions:", e);
  }
}

function saveFolders(folders: AgentFolder[]): void {
  try {
    localStorage.setItem(FOLDERS_STORAGE_KEY, serializeFolders(folders));
  } catch (e) {
    console.error("Failed to save agent folders:", e);
  }
}

// ============================================================================
// Context Interface
// ============================================================================

interface AgentSessionsContextValue {
  // Data
  sessions: AgentSession[];
  folders: AgentFolder[];
  activeSessionId: string;
  activeSession: AgentSession | undefined;

  // Session actions
  setActiveSessionId: (id: string) => void;
  createSession: (folderId?: string | null) => AgentSession;
  deleteSession: (id: string) => void;
  renameSession: (id: string, title: string) => void;
  updateSessionMessages: (id: string, messages: AgentMessage[]) => void;
  updateSessionMessageById: (
    sessionId: string,
    messageId: string,
    updater: (message: AgentMessage) => AgentMessage,
  ) => void;
  updateSessionDraft: (id: string, draft: string) => void;

  // Folder actions
  createFolder: () => AgentFolder;
  deleteFolder: (id: string, moveConversationsToRoot: boolean) => void;
  renameFolder: (id: string, title: string) => void;
  toggleFolderExpanded: (id: string) => void;

  // Move & Reorder actions
  moveSessionToFolder: (
    sessionId: string,
    targetFolderId: string | null,
  ) => void;
  reorderSessionsInFolder: (
    folderId: string | null,
    fromIndex: number,
    toIndex: number,
  ) => void;
  reorderFolders: (fromIndex: number, toIndex: number) => void;

  // Helpers
  getSessionsInFolder: (folderId: string | null) => AgentSession[];
  getRootSessions: () => AgentSession[];
  getRelativeTime: (timestamp: Date) => string;
}

const AgentSessionsContext = createContext<
  AgentSessionsContextValue | undefined
>(undefined);

function buildSessionWithMessages(
  session: AgentSession,
  messages: AgentMessage[],
): AgentSession {
  const userMessages = messages.filter((m) => m.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  let title = session.title;
  if (title === "New Conversation" && userMessages.length > 0) {
    const firstUserMsg = userMessages[0].content;
    title = firstUserMsg.slice(0, 50) + (firstUserMsg.length > 50 ? "..." : "");
  }

  return {
    ...session,
    messages,
    messageCount: messages.length,
    lastMessage: lastUserMessage?.content || "",
    timestamp: new Date(),
    updatedAt: new Date(),
    title,
  };
}

// ============================================================================
// Provider Component
// ============================================================================

export function AgentSessionsProvider({ children }: { children: ReactNode }) {
  const [sessions, setSessions] = useState<AgentSession[]>(
    loadSessionsFromStorage,
  );
  const [folders, setFolders] = useState<AgentFolder[]>(loadFoldersFromStorage);
  const [activeSessionId, setActiveSessionId] = useState<string>(() => "");

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foldersTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestSessionsRef = useRef<AgentSession[]>(sessions);
  const latestFoldersRef = useRef<AgentFolder[]>(folders);

  useEffect(() => {
    latestSessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    latestFoldersRef.current = folders;
  }, [folders]);

  // Persist on change (debounced to 1 save per second)
  useEffect(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveSessions(sessions);
    }, 1000);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [sessions]);

  useEffect(() => {
    if (foldersTimerRef.current) clearTimeout(foldersTimerRef.current);
    foldersTimerRef.current = setTimeout(() => {
      saveFolders(folders);
    }, 1000);
    return () => {
      if (foldersTimerRef.current) clearTimeout(foldersTimerRef.current);
    };
  }, [folders]);

  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (foldersTimerRef.current) {
        clearTimeout(foldersTimerRef.current);
        foldersTimerRef.current = null;
      }
      saveSessions(latestSessionsRef.current);
      saveFolders(latestFoldersRef.current);
    };
  }, []);

  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // ============================================================================
  // Session CRUD
  // ============================================================================

  const createSession = useCallback(
    (folderId: string | null = null) => {
      const sessionsInTarget = sessions.filter((s) => s.folderId === folderId);
      const maxOrder = sessionsInTarget.reduce(
        (max, s) => Math.max(max, s.orderIndex),
        -1,
      );
      const newSession = createEmptySession(maxOrder + 1, folderId);
      setSessions((prev) => [newSession, ...prev]);
      setActiveSessionId(newSession.id);
      return newSession;
    },
    [sessions],
  );

  const deleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const session = prev.find((s) => s.id === id);
        const filtered = prev.filter((s) => s.id !== id);

        if (id === activeSessionId) {
          // Return to chatbot home/options screen after deleting active session.
          // A new session will be created only when the user sends a message.
          setActiveSessionId("");
        }

        // Renumber sessions in the affected folder
        const folderId = session?.folderId ?? null;
        return filtered.map((s, _, arr) => {
          if (s.folderId !== folderId) return s;
          const folderSessions = arr
            .filter((x) => x.folderId === folderId)
            .sort((a, b) => a.orderIndex - b.orderIndex);
          const newIndex = folderSessions.findIndex((x) => x.id === s.id);
          return { ...s, orderIndex: newIndex };
        });
      });
    },
    [activeSessionId],
  );

  const renameSession = useCallback((id: string, title: string) => {
    setSessions((prev) =>
      prev.map((s) =>
        s.id === id ? { ...s, title, updatedAt: new Date() } : s,
      ),
    );
  }, []);

  const updateSessionMessages = useCallback(
    (id: string, messages: AgentMessage[]) => {
      setSessions((prev) => {
        const next = prev.map((s) => {
          if (s.id !== id) return s;
          return buildSessionWithMessages(s, messages);
        });
        latestSessionsRef.current = next;
        return next;
      });
    },
    [],
  );

  const updateSessionMessageById = useCallback(
    (
      sessionId: string,
      messageId: string,
      updater: (message: AgentMessage) => AgentMessage,
    ) => {
      setSessions((prev) => {
        const next = prev.map((session) => {
          if (session.id !== sessionId) return session;

          let touched = false;
          const nextMessages = session.messages.map((message) => {
            if (message.id !== messageId) return message;
            touched = true;
            return updater(message);
          });

          if (!touched) return session;
          return buildSessionWithMessages(session, nextMessages);
        });
        latestSessionsRef.current = next;
        return next;
      });
    },
    [],
  );

  const updateSessionDraft = useCallback((id: string, draft: string) => {
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, draft } : s)));
  }, []);

  // ============================================================================
  // Folder CRUD
  // ============================================================================

  const createFolder = useCallback(() => {
    const maxOrder = folders.reduce(
      (max, f) => Math.max(max, f.orderIndex),
      -1,
    );
    const newFolder = createEmptyFolder(maxOrder + 1);
    setFolders((prev) => [...prev, newFolder]);
    return newFolder;
  }, [folders]);

  const deleteFolder = useCallback(
    (id: string, moveConversationsToRoot: boolean) => {
      if (moveConversationsToRoot) {
        // Move all conversations to root
        setSessions((prev) => {
          const rootSessions = prev.filter((s) => s.folderId === null);
          const maxRootOrder = rootSessions.reduce(
            (max, s) => Math.max(max, s.orderIndex),
            -1,
          );
          let nextOrder = maxRootOrder + 1;

          return prev.map((s) => {
            if (s.folderId !== id) return s;
            const updated = { ...s, folderId: null, orderIndex: nextOrder };
            nextOrder++;
            return updated;
          });
        });
      } else {
        // Delete all conversations in folder
        setSessions((prev) => {
          const toDelete = prev.filter((s) => s.folderId === id);
          const remaining = prev.filter((s) => s.folderId !== id);

          // If we deleted the active session
          if (toDelete.some((s) => s.id === activeSessionId)) {
            if (remaining.length === 0) {
              // Don't create a new session - let it be created when user sends first message
              setActiveSessionId("");
              return [];
            }
            setActiveSessionId(remaining[0].id);
          }

          return remaining;
        });
      }

      // Remove the folder
      setFolders((prev) => {
        const filtered = prev.filter((f) => f.id !== id);
        return filtered.map((f, i) => ({ ...f, orderIndex: i }));
      });
    },
    [activeSessionId],
  );

  const renameFolder = useCallback((id: string, title: string) => {
    setFolders((prev) =>
      prev.map((f) =>
        f.id === id ? { ...f, title, updatedAt: new Date() } : f,
      ),
    );
  }, []);

  const toggleFolderExpanded = useCallback((id: string) => {
    setFolders((prev) =>
      prev.map((f) => (f.id === id ? { ...f, isExpanded: !f.isExpanded } : f)),
    );
  }, []);

  // ============================================================================
  // Move & Reorder Operations
  // ============================================================================

  const moveSessionToFolder = useCallback(
    (sessionId: string, targetFolderId: string | null) => {
      setSessions((prev) => {
        const session = prev.find((s) => s.id === sessionId);
        if (!session || session.folderId === targetFolderId) return prev;

        const sourceFolderId = session.folderId;

        // Calculate new order in target
        const targetSessions = prev.filter(
          (s) => s.folderId === targetFolderId,
        );
        const maxTargetOrder = targetSessions.reduce(
          (max, s) => Math.max(max, s.orderIndex),
          -1,
        );

        // Update the moved session
        const updated = prev.map((s) => {
          if (s.id === sessionId) {
            return {
              ...s,
              folderId: targetFolderId,
              orderIndex: maxTargetOrder + 1,
              updatedAt: new Date(),
            };
          }
          return s;
        });

        // Renumber source folder
        const sourceSessions = updated
          .filter((s) => s.folderId === sourceFolderId && s.id !== sessionId)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        return updated.map((s) => {
          if (s.folderId !== sourceFolderId || s.id === sessionId) return s;
          const newIndex = sourceSessions.findIndex((x) => x.id === s.id);
          return { ...s, orderIndex: newIndex };
        });
      });
    },
    [],
  );

  const reorderSessionsInFolder = useCallback(
    (folderId: string | null, fromIndex: number, toIndex: number) => {
      setSessions((prev) => {
        const folderSessions = prev
          .filter((s) => s.folderId === folderId)
          .sort((a, b) => a.orderIndex - b.orderIndex);

        if (fromIndex < 0 || fromIndex >= folderSessions.length) return prev;
        if (toIndex < 0 || toIndex >= folderSessions.length) return prev;

        const [moved] = folderSessions.splice(fromIndex, 1);
        folderSessions.splice(toIndex, 0, moved);

        // Create a map of new order indices
        const orderMap = new Map<string, number>();
        folderSessions.forEach((s, i) => orderMap.set(s.id, i));

        return prev.map((s) => {
          if (s.folderId !== folderId) return s;
          const newOrder = orderMap.get(s.id);
          if (newOrder !== undefined) {
            return { ...s, orderIndex: newOrder };
          }
          return s;
        });
      });
    },
    [],
  );

  const reorderFolders = useCallback((fromIndex: number, toIndex: number) => {
    setFolders((prev) => {
      const sorted = [...prev].sort((a, b) => a.orderIndex - b.orderIndex);
      if (fromIndex < 0 || fromIndex >= sorted.length) return prev;
      if (toIndex < 0 || toIndex >= sorted.length) return prev;

      const [moved] = sorted.splice(fromIndex, 1);
      sorted.splice(toIndex, 0, moved);

      return sorted.map((f, i) => ({ ...f, orderIndex: i }));
    });
  }, []);

  // ============================================================================
  // Helpers
  // ============================================================================

  const getSessionsInFolder = useCallback(
    (folderId: string | null) => {
      return sessions
        .filter((s) => s.folderId === folderId)
        .sort(
          (a, b) =>
            b.updatedAt.getTime() - a.updatedAt.getTime() ||
            b.createdAt.getTime() - a.createdAt.getTime(),
        );
    },
    [sessions],
  );

  const getRootSessions = useCallback(() => {
    return getSessionsInFolder(null);
  }, [getSessionsInFolder]);

  const getRelativeTime = useCallback((timestamp: Date) => {
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
  }, []);

  // ============================================================================
  // Context Value
  // ============================================================================

  const value: AgentSessionsContextValue = {
    sessions,
    folders,
    activeSessionId,
    activeSession,
    setActiveSessionId,
    createSession,
    deleteSession,
    renameSession,
    updateSessionMessages,
    updateSessionMessageById,
    updateSessionDraft,
    createFolder,
    deleteFolder,
    renameFolder,
    toggleFolderExpanded,
    moveSessionToFolder,
    reorderSessionsInFolder,
    reorderFolders,
    getSessionsInFolder,
    getRootSessions,
    getRelativeTime,
  };

  return (
    <AgentSessionsContext.Provider value={value}>
      {children}
    </AgentSessionsContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useAgentSessions() {
  const context = useContext(AgentSessionsContext);
  if (context === undefined) {
    throw new Error(
      "useAgentSessions must be used within an AgentSessionsProvider",
    );
  }
  return context;
}
