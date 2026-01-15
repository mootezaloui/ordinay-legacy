import { useState, useCallback, useRef, useEffect } from "react";
import { Plus, FolderPlus } from "lucide-react";
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
  sessions: AgentSession[];
  folders: AgentFolder[];
  activeSessionId: string;
  onSessionClick: (sessionId: string) => void;
  onNewChat: (folderId?: string | null) => void;
  onCreateFolder: () => void;
  onRenameSession: (sessionId: string, title: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onRenameFolder: (folderId: string, title: string) => void;
  onDeleteFolder: (folderId: string, moveToRoot: boolean) => void;
  onToggleFolderExpanded: (folderId: string) => void;
  onMoveSession: (sessionId: string, targetFolderId: string | null) => void;
  onReorderSessions: (folderId: string | null, fromIndex: number, toIndex: number) => void;
  onReorderFolders: (fromIndex: number, toIndex: number) => void;
  getSessionsInFolder: (folderId: string | null) => AgentSession[];
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentHistorySidebar({
  sessions,
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
  const [dropTargetFolderId, setDropTargetFolderId] = useState<string | null | "root">(null);
  const [dropTargetSessionId, setDropTargetSessionId] = useState<string | null>(null);

  // Use ref for dragState to avoid stale closure issues in drag handlers
  const dragStateRef = useRef<DragState | null>(null);
  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  const sortedFolders = [...folders].sort((a, b) => a.orderIndex - b.orderIndex);
  const rootSessions = getSessionsInFolder(null);

  // ============================================================================
  // Session Drag Handlers
  // ============================================================================

  const handleSessionDragStart = useCallback((e: React.DragEvent, session: AgentSession, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({
      type: DRAG_TYPE_SESSION,
      id: session.id,
      sourceFolderId: session.folderId,
      sourceIndex: index,
    }));
    setDragState({
      type: DRAG_TYPE_SESSION,
      id: session.id,
      sourceFolderId: session.folderId,
      sourceIndex: index,
    });
  }, []);

  const handleSessionDragEnd = useCallback(() => {
    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, []);

  // ============================================================================
  // Session Drop Handlers (for reordering within same folder)
  // ============================================================================

  const handleSessionDragOver = useCallback((e: React.DragEvent, targetSession: AgentSession, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState?.type === DRAG_TYPE_SESSION && dragState.id !== targetSession.id) {
      e.dataTransfer.dropEffect = "move";
      setDropTargetSessionId(targetSession.id);
    }
  }, [dragState]);

  const handleSessionDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetSessionId(null);
  }, []);

  const handleSessionDrop = useCallback((e: React.DragEvent, targetSession: AgentSession, targetIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragState || dragState.type !== DRAG_TYPE_SESSION || dragState.id === targetSession.id) return;

    // If same folder, reorder within folder
    if (dragState.sourceFolderId === targetSession.folderId) {
      onReorderSessions(dragState.sourceFolderId, dragState.sourceIndex, targetIndex);
    } else {
      // Different folders - move to target's folder first
      onMoveSession(dragState.id, targetSession.folderId);
    }

    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, [dragState, onReorderSessions, onMoveSession]);

  // ============================================================================
  // Folder Drag Handlers
  // ============================================================================

  const handleFolderDragStart = useCallback((e: React.DragEvent, folder: AgentFolder, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", JSON.stringify({
      type: DRAG_TYPE_FOLDER,
      id: folder.id,
      sourceFolderId: null,
      sourceIndex: index,
    }));
    setDragState({
      type: DRAG_TYPE_FOLDER,
      id: folder.id,
      sourceFolderId: null,
      sourceIndex: index,
    });
  }, []);

  const handleFolderDragEnd = useCallback(() => {
    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, []);

  // ============================================================================
  // Drop Handlers for Folders (receiving sessions)
  // ============================================================================

  const handleFolderDragOver = useCallback((e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragState?.type === DRAG_TYPE_SESSION) {
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolderId(folderId);
    } else if (dragState?.type === DRAG_TYPE_FOLDER && dragState.id !== folderId) {
      e.dataTransfer.dropEffect = "move";
    }
  }, [dragState]);

  const handleFolderDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDropTargetFolderId(null);
  }, []);

  const handleFolderDrop = useCallback((e: React.DragEvent, targetFolderId: string, targetFolderIndex: number) => {
    e.preventDefault();
    e.stopPropagation();

    if (!dragState) return;

    if (dragState.type === DRAG_TYPE_SESSION) {
      // Move session to this folder
      if (dragState.sourceFolderId !== targetFolderId) {
        onMoveSession(dragState.id, targetFolderId);
      }
    } else if (dragState.type === DRAG_TYPE_FOLDER && dragState.id !== targetFolderId) {
      // Reorder folders
      onReorderFolders(dragState.sourceIndex, targetFolderIndex);
    }

    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, [dragState, onMoveSession, onReorderFolders]);

  // ============================================================================
  // Drop Handlers for Root Area (moving sessions out of folders)
  // ============================================================================

  const handleRootDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (dragState?.type === DRAG_TYPE_SESSION && dragState.sourceFolderId !== null) {
      e.dataTransfer.dropEffect = "move";
      setDropTargetFolderId("root");
    }
  }, [dragState]);

  const handleRootDragLeave = useCallback(() => {
    setDropTargetFolderId(null);
  }, []);

  const handleRootDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();

    if (dragState?.type === DRAG_TYPE_SESSION && dragState.sourceFolderId !== null) {
      onMoveSession(dragState.id, null);
    }

    setDragState(null);
    setDropTargetFolderId(null);
    setDropTargetSessionId(null);
  }, [dragState, onMoveSession]);

  // ============================================================================
  // Render
  // ============================================================================

  return (
    <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      {/* Header with actions */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 space-y-2">
        <button
          type="button"
          onClick={() => onNewChat(null)}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
        <button
          type="button"
          onClick={onCreateFolder}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 text-slate-600 dark:text-slate-300 text-sm font-medium rounded-lg border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
        >
          <FolderPlus className="w-4 h-4" />
          New Folder
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-3">
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
                  onDelete={(moveToRoot) => onDeleteFolder(folder.id, moveToRoot)}
                  conversationCount={folderSessions.length}
                  isDragging={dragState?.type === DRAG_TYPE_FOLDER && dragState.id === folder.id}
                  isDropTarget={dropTargetFolderId === folder.id}
                  onDragStart={(e) => handleFolderDragStart(e, folder, folderIndex)}
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
                      isDragging={dragState?.type === DRAG_TYPE_SESSION && dragState.id === session.id}
                      isDropTarget={dropTargetSessionId === session.id}
                      onDragStart={(e) => handleSessionDragStart(e, session, sessionIndex)}
                      onDragEnd={handleSessionDragEnd}
                      onDragOver={(e) => handleSessionDragOver(e, session, sessionIndex)}
                      onDragLeave={handleSessionDragLeave}
                      onDrop={(e) => handleSessionDrop(e, session, sessionIndex)}
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
                ? "ring-2 ring-blue-400 ring-inset rounded-lg p-2 bg-blue-50 dark:bg-blue-900/20"
                : ""
            }`}
            onDragOver={handleRootDragOver}
            onDragLeave={handleRootDragLeave}
            onDrop={handleRootDrop}
          >
            {sortedFolders.length > 0 && (
              <div className="text-xs text-slate-400 dark:text-slate-500 px-2 py-1 font-medium">
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
                isDragging={dragState?.type === DRAG_TYPE_SESSION && dragState.id === session.id}
                isDropTarget={dropTargetSessionId === session.id}
                onDragStart={(e) => handleSessionDragStart(e, session, sessionIndex)}
                onDragEnd={handleSessionDragEnd}
                onDragOver={(e) => handleSessionDragOver(e, session, sessionIndex)}
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
        {dragState?.type === DRAG_TYPE_SESSION && dragState.sourceFolderId !== null && rootSessions.length === 0 && (
          <div
            className={`border-2 border-dashed rounded-lg p-4 text-center text-sm transition-colors ${
              dropTargetFolderId === "root"
                ? "border-blue-400 bg-blue-50 dark:bg-blue-900/20 text-blue-600"
                : "border-slate-300 dark:border-slate-600 text-slate-400"
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
