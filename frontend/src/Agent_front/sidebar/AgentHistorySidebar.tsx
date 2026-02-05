import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, FolderPlus, Check, X } from "lucide-react";
import { AgentSession, AgentFolder } from "../types/agentSession";
import { AgentSessionItem } from "./AgentSessionItem";
import { AgentFolderItem } from "./AgentFolderItem";

// Drag data types
const DRAG_TYPE_SESSION = "agent/session";
const DRAG_TYPE_FOLDER = "agent/folder";

interface DragState {
  type: typeof DRAG_TYPE_SESSION | typeof DRAG_TYPE_FOLDER;
  id: string;
  sourceFolderId: string | null;
  sourceIndex: number;
}

interface AgentHistorySidebarProps {
  folders: AgentFolder[];
  activeSessionId: string;
  onSessionClick: (sessionId: string) => void;
  onNewChat: (folderId?: string | null) => void;
  onCreateFolder: () => AgentFolder;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameFolder: (folderId: string, title: string) => void;
  onDeleteFolder: (folderId: string, moveToRoot: boolean) => void;
  onToggleFolderExpanded: (folderId: string) => void;
  onMoveSession: (sessionId: string, targetFolderId: string | null) => void;
  onReorderSessions: (
    folderId: string | null,
    fromIndex: number,
    toIndex: number
  ) => void;
  onReorderFolders: (fromIndex: number, toIndex: number) => void;
  getSessionsInFolder: (folderId: string | null) => AgentSession[];
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentHistorySidebar({
  folders,
  activeSessionId,
  onSessionClick,
  onNewChat,
  onCreateFolder,
  onRenameSession,
  onDeleteSession,
  onRenameFolder,
  onDeleteFolder,
  onToggleFolderExpanded,
  onMoveSession,
  onReorderSessions,
  onReorderFolders,
  getSessionsInFolder,
  getRelativeTime,
}: AgentHistorySidebarProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [dropTargetFolderId, setDropTargetFolderId] = useState<
    string | null | "root"
  >(null);
  const [dropTargetSessionId, setDropTargetSessionId] = useState<string | null>(
    null
  );
  // Pending folder creation state
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [pendingFolderName, setPendingFolderName] = useState("");
  const pendingInputRef = useRef<HTMLInputElement>(null);
  // Focus the input when starting folder creation
  useEffect(() => {
    if (isCreatingFolder && pendingInputRef.current) {
      pendingInputRef.current.focus();
      pendingInputRef.current.select();
    }
  }, [isCreatingFolder]);

  // Use ref for dragState to avoid stale closure issues in drag handlers
  const dragStateRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  // Sort folders by most recently used session inside, or by updatedAt if empty
  const sortedFolders = [...folders].sort((a, b) => {
    const aSessions = getSessionsInFolder(a.id);
    const bSessions = getSessionsInFolder(b.id);
    const aRecent = aSessions[0]?.updatedAt?.getTime() || a.updatedAt.getTime();
    const bRecent = bSessions[0]?.updatedAt?.getTime() || b.updatedAt.getTime();
    return bRecent - aRecent;
  });
  const rootSessions = getSessionsInFolder(null);

  // ============================================================================
  // Session Drag Handlers
  // ============================================================================

  const handleSessionDragStart = useCallback(
    (e: React.DragEvent, session: AgentSession, index: number) => {
      const newDragState: DragState = {
        type: DRAG_TYPE_SESSION,
        id: session.id,
        sourceFolderId: session.folderId,
        sourceIndex: index,
      };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify(newDragState));
      // Update both state and ref immediately
      dragStateRef.current = newDragState;
      setDragState(newDragState);
    },
    []
  );

  const handleSessionDragEnd = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, []);

  // ============================================================================
  // Session Drop Handlers (for reordering within same folder)
  // ============================================================================

  const handleSessionDragOver = useCallback(
    (e: React.DragEvent, targetSession: AgentSession) => {
      e.preventDefault();
      e.stopPropagation();
      const currentDrag = dragStateRef.current;
      if (
        currentDrag?.type === DRAG_TYPE_SESSION &&
        currentDrag.id !== targetSession.id
      ) {
        e.dataTransfer.dropEffect = "move";
        setDropTargetSessionId(targetSession.id);
      }
    },
    []
  );

  const handleSessionDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetSessionId(null);
  }, []);

  const handleSessionDrop = useCallback(
    (e: React.DragEvent, targetSession: AgentSession, targetIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const currentDrag = dragStateRef.current;
      if (
        !currentDrag ||
        currentDrag.type !== DRAG_TYPE_SESSION ||
        currentDrag.id === targetSession.id
      )
        return;

      // If same folder, reorder within folder
      if (currentDrag.sourceFolderId === targetSession.folderId) {
        onReorderSessions(
          currentDrag.sourceFolderId,
          currentDrag.sourceIndex,
          targetIndex
        );
      } else {
        // Different folders - move to target's folder first
        onMoveSession(currentDrag.id, targetSession.folderId);
      }

      dragStateRef.current = null;
      setDragState(null);
      setDropTargetFolderId(null);
      setDropTargetSessionId(null);
    },
    [onReorderSessions, onMoveSession]
  );

  // ============================================================================
  // Folder Drag Handlers
  // ============================================================================

  const handleFolderDragStart = useCallback(
    (e: React.DragEvent, folder: AgentFolder, index: number) => {
      const newDragState: DragState = {
        type: DRAG_TYPE_FOLDER,
        id: folder.id,
        sourceFolderId: null,
        sourceIndex: index,
      };
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", JSON.stringify(newDragState));
      dragStateRef.current = newDragState;
      setDragState(newDragState);
    },
    []
  );

  const handleFolderDragEnd = useCallback(() => {
    dragStateRef.current = null;
    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, []);

  // ============================================================================
  // Drop Handlers for Folders (receiving sessions)
  // ============================================================================

  const handleFolderDragOver = useCallback(
    (e: React.DragEvent, folderId: string) => {
      e.preventDefault();
      e.stopPropagation();
      const currentDrag = dragStateRef.current;
      if (currentDrag?.type === DRAG_TYPE_SESSION) {
        e.dataTransfer.dropEffect = "move";
        setDropTargetFolderId(folderId);
      } else if (
        currentDrag?.type === DRAG_TYPE_FOLDER &&
        currentDrag.id !== folderId
      ) {
        e.dataTransfer.dropEffect = "move";
      }
    },
    []
  );

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetFolderId(null);
  }, []);

  const handleFolderDrop = useCallback(
    (e: React.DragEvent, targetFolderId: string, targetFolderIndex: number) => {
      e.preventDefault();
      e.stopPropagation();

      const currentDrag = dragStateRef.current;
      if (!currentDrag) return;

      if (currentDrag.type === DRAG_TYPE_SESSION) {
        // Move session to this folder
        if (currentDrag.sourceFolderId !== targetFolderId) {
          onMoveSession(currentDrag.id, targetFolderId);
        }
      } else if (
        currentDrag.type === DRAG_TYPE_FOLDER &&
        currentDrag.id !== targetFolderId
      ) {
        // Reorder folders
        onReorderFolders(currentDrag.sourceIndex, targetFolderIndex);
      }

      dragStateRef.current = null;
      setDragState(null);
      setDropTargetFolderId(null);
      setDropTargetSessionId(null);
    },
    [onMoveSession, onReorderFolders]
  );

  // ============================================================================
  // Drop Handlers for Root Area (moving sessions out of folders)
  // ============================================================================

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const currentDrag = dragStateRef.current;
    if (
      currentDrag?.type === DRAG_TYPE_SESSION &&
      currentDrag.sourceFolderId !== null
    ) {
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolderId("root");
    }
  }, []);

  const handleRootDragLeave = useCallback(() => {
    setDropTargetFolderId(null);
  }, []);

  const handleRootDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();

      const currentDrag = dragStateRef.current;
      if (
        currentDrag?.type === DRAG_TYPE_SESSION &&
        currentDrag.sourceFolderId !== null
      ) {
        onMoveSession(currentDrag.id, null);
      }

      dragStateRef.current = null;
      setDragState(null);
      setDropTargetFolderId(null);
      setDropTargetSessionId(null);
    },
    [onMoveSession]
  );

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="h-full w-full flex flex-col border-r border-slate-200/70 dark:border-slate-800/80 bg-white dark:bg-slate-950 agent-ui-text">
      {/* Header with actions */}
      <div className="p-4 border-b border-slate-200/70 dark:border-slate-800/80 space-y-2 flex-shrink-0">
        <button
          type="button"
          onClick={() => onNewChat(null)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 text-sm font-semibold rounded-xl hover:bg-slate-800 dark:hover:bg-white transition-all shadow-sm"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
        <button
          type="button"
          onClick={() => {
            setIsCreatingFolder(true);
            setPendingFolderName("");
          }}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-xl border border-slate-200/80 dark:border-slate-700/70 bg-white/80 dark:bg-slate-900/60 hover:bg-white dark:hover:bg-slate-900 transition-colors"
          disabled={isCreatingFolder}
        >
          <FolderPlus className="w-4 h-4" />
          New Folder
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Pending folder input */}
        {isCreatingFolder && (
          <div className="space-y-1 mb-4">
            <div className="flex items-center px-3 py-2 rounded-2xl bg-white/80 dark:bg-slate-900/60 border border-slate-200/70 dark:border-slate-700/60 shadow-sm gap-2">
              <FolderPlus className="w-4.5 h-4.5 text-slate-500 flex-shrink-0" />
              <input
                ref={pendingInputRef}
                className="flex-1 h-8 px-2 rounded bg-transparent text-sm outline-none border-none focus:ring-2 focus:ring-slate-400/20 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                placeholder="Folder name"
                value={pendingFolderName}
                onChange={(e) => setPendingFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    const name = pendingFolderName.trim();
                    if (name) {
                      const folder = onCreateFolder();
                      onRenameFolder(folder.id, name);
                      setIsCreatingFolder(false);
                      setPendingFolderName("");
                    }
                  } else if (e.key === "Escape") {
                    setIsCreatingFolder(false);
                    setPendingFolderName("");
                  }
                }}
                maxLength={50}
                style={{ minWidth: 0 }}
              />
              <button
                type="button"
                className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors ml-1"
                title="Create folder"
                onClick={() => {
                  const name = pendingFolderName.trim();
                  if (name) {
                    const folder = onCreateFolder();
                    onRenameFolder(folder.id, name);
                    setIsCreatingFolder(false);
                    setPendingFolderName("");
                  }
                }}
                tabIndex={-1}
              >
                <Check className="w-4 h-4 text-emerald-600" />
              </button>
              <button
                type="button"
                className="flex items-center justify-center w-7 h-7 rounded-full hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors"
                title="Cancel"
                onClick={() => {
                  setIsCreatingFolder(false);
                  setPendingFolderName("");
                }}
                tabIndex={-1}
              >
                <X className="w-4 h-4 text-red-500" />
              </button>
            </div>
          </div>
        )}
        {/* Folders */}
        {sortedFolders.length > 0 && (
          <div className="space-y-1 mb-4">
            {sortedFolders.map((folder, folderIndex) => {
              const folderSessions = getSessionsInFolder(folder.id);
              return (
                <AgentFolderItem
                  key={folder.id}
                  folder={folder}
                  isExpanded={folder.isExpanded}
                  onToggleExpand={() => onToggleFolderExpanded(folder.id)}
                  onRename={(title) => onRenameFolder(folder.id, title)}
                  onDelete={(moveToRoot) =>
                    onDeleteFolder(folder.id, moveToRoot)
                  }
                  conversationCount={folderSessions.length}
                  isDragging={
                    dragState?.type === DRAG_TYPE_FOLDER &&
                    dragState.id === folder.id
                  }
                  isDropTarget={dropTargetFolderId === folder.id}
                  onDragStart={(e) =>
                    handleFolderDragStart(e, folder, folderIndex)
                  }
                  onDragEnd={handleFolderDragEnd}
                  onDragOver={(e) => handleFolderDragOver(e, folder.id)}
                  onDragLeave={handleFolderDragLeave}
                  onDrop={(e) => handleFolderDrop(e, folder.id, folderIndex)}
                >
                  {folderSessions.map((session, sessionIndex) => (
                    <AgentSessionItem
                      key={session.id}
                      session={session}
                      active={activeSessionId === session.id}
                      onClick={() => onSessionClick(session.id)}
                      onRename={(title) => onRenameSession(session.id, title)}
                      onDelete={() => onDeleteSession(session.id)}
                      getRelativeTime={getRelativeTime}
                      isDragging={
                        dragState?.type === DRAG_TYPE_SESSION &&
                        dragState.id === session.id
                      }
                      isDropTarget={dropTargetSessionId === session.id}
                      onDragStart={(e) =>
                        handleSessionDragStart(e, session, sessionIndex)
                      }
                      onDragEnd={handleSessionDragEnd}
                      onDragOver={(e) =>
                        handleSessionDragOver(e, session, sessionIndex)
                      }
                      onDragLeave={handleSessionDragLeave}
                      onDrop={(e) =>
                        handleSessionDrop(e, session, sessionIndex)
                      }
                    />
                  ))}
                </AgentFolderItem>
              );
            })}
          </div>
        )}

        {/* Root sessions (no folder) */}
        {rootSessions.length > 0 && (
          <div
            className={`space-y-1 ${
              dropTargetFolderId === "root"
                ? "ring-2 ring-slate-300/70 dark:ring-slate-600/70 ring-inset rounded-2xl p-2 bg-white/80 dark:bg-slate-900/50"
                : ""
            }`}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {sortedFolders.length > 0 && (
              <div className="text-[11px] text-slate-400 dark:text-slate-500 px-2 py-1 font-semibold uppercase tracking-[0.18em]">
                Ungrouped
              </div>
            )}
            {rootSessions.map((session, sessionIndex) => (
              <AgentSessionItem
                key={session.id}
                session={session}
                active={activeSessionId === session.id}
                onClick={() => onSessionClick(session.id)}
                onRename={(title) => onRenameSession(session.id, title)}
                onDelete={() => onDeleteSession(session.id)}
                getRelativeTime={getRelativeTime}
                isDragging={
                  dragState?.type === DRAG_TYPE_SESSION &&
                  dragState.id === session.id
                }
                isDropTarget={dropTargetSessionId === session.id}
                onDragStart={(e) =>
                  handleSessionDragStart(e, session, sessionIndex)
                }
                onDragEnd={handleSessionDragEnd}
                onDragOver={(e) =>
                  handleSessionDragOver(e, session, sessionIndex)
                }
                onDragLeave={handleSessionDragLeave}
                onDrop={(e) => handleSessionDrop(e, session, sessionIndex)}
              />
            ))}
          </div>
        )}

        {/* Empty state */}
        {rootSessions.length === 0 && sortedFolders.length === 0 && (
          <div className="text-center text-sm text-slate-400 dark:text-slate-500 py-8">
            No conversations yet
          </div>
        )}

        {/* Drop zone when dragging session from folder to root */}
        {dragState?.type === DRAG_TYPE_SESSION &&
          dragState.sourceFolderId !== null &&
          rootSessions.length === 0 && (
            <div
              className={`border border-dashed rounded-2xl p-4 text-center text-sm transition-colors ${
                dropTargetFolderId === "root"
                  ? "border-slate-300/80 bg-white/80 dark:bg-slate-900/60 text-slate-600"
                  : "border-slate-300/70 dark:border-slate-600/70 text-slate-400"
              }`}
              onDragOver={handleRootDragOver}
              onDragLeave={handleRootDragLeave}
              onDrop={handleRootDrop}
            >
              Drop here to move to root
            </div>
          )}
      </div>
    </div>
  );
}
