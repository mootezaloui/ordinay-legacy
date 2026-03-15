import { useCallback, useState, useEffect } from "react";
import { AgentTopBar } from "./components/AgentTopBar";
import { AgentInput } from "./components/AgentInput";
import { AgentConversation } from "./components/AgentConversation";
import { AgentQuickActions } from "./components/AgentQuickActions";
import { AgentResultPreview } from "./components/AgentResultPreview";
import { AgentSessionDocumentsPanel } from "./components/AgentSessionDocumentsPanel";
import { AgentHistorySidebar } from "./sidebar/AgentHistorySidebar";
import { useAgentState } from "./hooks/useAgentState";
import { useAgentSessions } from "./hooks/useAgentSessions";
import type { FollowUpSuggestion } from "../services/api/agent";
import { apiClient } from "../services/api/client";

interface AgentLayoutProps {
  isGlobalSidebarCollapsed?: boolean;
}

export function AgentLayout({
  isGlobalSidebarCollapsed = false,
}: AgentLayoutProps = {}) {
  const [rightPanelTab, setRightPanelTab] = useState<"context" | "documents">(
    "context",
  );
  const [isOffline, setIsOffline] = useState(false);

  useEffect(() => {
    const check = () => {
      apiClient
        .get<{ online: boolean }>("/ping")
        .then((r) => setIsOffline(!r.online))
        .catch(() => setIsOffline(true));
    };

    check();
    const timer = setInterval(check, 10000);
    window.addEventListener("online", check);
    window.addEventListener("offline", check);

    return () => {
      clearInterval(timer);
      window.removeEventListener("online", check);
      window.removeEventListener("offline", check);
    };
  }, []);
  const {
    input,
    setInput,
    conversation,
    showHistorySidebar,
    setShowHistorySidebar,
    showContextSidebar,
    setShowContextSidebar,
    inputRef,
    conversationEndRef,
    scrollContainerRef,
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    saveScrollPosition,
    getRelativeTime,
    isLoading,
    transientStatus,
    cancelStream,
    dataAccess,
    setDataAccess,
    startFollowUpIntent,
    confirmWebSearch,
    startAgentStream,
  } = useAgentState();

  const {
    folders,
    activeSessionId,
    setActiveSessionId,
    createSession,
    deleteSession,
    renameSession,
    createFolder,
    deleteFolder,
    renameFolder,
    toggleFolderExpanded,
    moveSessionToFolder,
    reorderSessionsInFolder,
    reorderFolders,
    getSessionsInFolder,
  } = useAgentSessions();

  const handleSessionClick = (sessionId: string) => {
    if (sessionId !== activeSessionId) {
      saveScrollPosition();
      setActiveSessionId(sessionId);
    }
  };

  // Follow-up click handler — executes a structured, scoped follow-up intent
  const handleFollowUpClick = useCallback(
    (followUp: FollowUpSuggestion) => {
      startFollowUpIntent?.(followUp);
    },
    [startFollowUpIntent],
  );

  const handleSubmitMessage = useCallback(
    (message: string) => {
      const text = String(message || "").trim();
      if (!text) return;
      startAgentStream(text);
    },
    [startAgentStream],
  );

  /* Shared props — avoids duplicating between desktop & mobile renders */
  const sidebarProps = {
    folders,
    activeSessionId,
    onSessionClick: handleSessionClick,
    onNewChat: createSession,
    onCreateFolder: createFolder,
    onRenameSession: renameSession,
    onDeleteSession: deleteSession,
    onRenameFolder: renameFolder,
    onDeleteFolder: deleteFolder,
    onToggleFolderExpanded: toggleFolderExpanded,
    onMoveSession: moveSessionToFolder,
    onReorderSessions: reorderSessionsInFolder,
    onReorderFolders: reorderFolders,
    getSessionsInFolder,
    getRelativeTime,
  };

  const contextProps = {
    onExampleClick: handleExampleClick,
    dataAccess,
    setDataAccess,
  };

  return (
    <div className="agent-flat-mode relative w-full h-full flex gap-0 bg-[#f8fafc] dark:bg-[#0f172a]">
      {/* ══════════════════════════════════════════════════════════════════
          LEFT SIDEBAR - Conversation History
          Desktop: Static column | Mobile: Overlay drawer
      ══════════════════════════════════════════════════════════════════ */}

      {/* Desktop - Static */}
      {showHistorySidebar && (
        <div className="hidden lg:block w-72 flex-shrink-0 h-full">
          <AgentHistorySidebar {...sidebarProps} />
        </div>
      )}

      {/* Mobile - Overlay */}
      {showHistorySidebar && (
        <div className="absolute inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowHistorySidebar(false)}
          />
          <div className="absolute inset-y-0 left-0 w-80 max-w-[85vw]">
            <AgentHistorySidebar {...sidebarProps} />
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          CENTER COLUMN - Main Chat Area
          Fixed height, scrollable conversation, sticky input
      ══════════════════════════════════════════════════════════════════ */}

      <div className="flex-1 min-w-0 flex flex-col h-full agent-ui-text">
        {/* Top Bar - Fixed */}
        <div className="flex-shrink-0">
          <AgentTopBar
            showHistorySidebar={showHistorySidebar}
            showContextSidebar={showContextSidebar}
            onToggleHistory={() => setShowHistorySidebar(!showHistorySidebar)}
            onToggleContext={() => setShowContextSidebar(!showContextSidebar)}
          />
        </div>

        {/* Conversation - Scrollable */}
        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth agent-thread"
          style={{ minHeight: 0 }}
        >
          <div className="mx-auto w-full max-w-[52rem] xl:max-w-[68rem] 2xl:max-w-[80rem] px-4 py-6 sm:px-8 overflow-hidden">
            {conversation.length === 0 ? (
              <AgentQuickActions onExampleClick={handleExampleClick} />
            ) : (
              <AgentConversation
                messages={conversation}
                conversationEndRef={conversationEndRef}
                getRelativeTime={getRelativeTime}
                transientStatus={transientStatus}
                onFollowUpClick={handleFollowUpClick}
                onExampleClick={handleExampleClick}
                onConfirmWebSearch={confirmWebSearch}
                onSubmitMessage={handleSubmitMessage}
              />
            )}
          </div>
        </div>

        {/* Offline Banner */}
        {isOffline && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728M9.172 9.172a5 5 0 000 7.071M12 12h.01" />
            </svg>
            No internet connection — Agent is unavailable
          </div>
        )}

        {/* Input - Fixed */}
        <div className="flex-shrink-0">
          <AgentInput
            input={input}
            setInput={setInput}
            inputRef={inputRef}
            onSubmit={handleSubmit}
            onKeyDown={handleKeyDown}
            isStreaming={isLoading}
            onStopGeneration={cancelStream}
            onClear={() => setInput("")}
            isOffline={isOffline}
          />
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          RIGHT SIDEBAR - Context Panel
          Desktop: Static column | Mobile: Overlay drawer
      ══════════════════════════════════════════════════════════════════ */}

      {/* Desktop - Static */}
      {showContextSidebar && (
        <div className="hidden 2xl:block w-80 flex-shrink-0 h-full">
          <div className="h-full flex flex-col">
            <div className="flex-shrink-0 p-2 border-l border-b border-black/[0.05] dark:border-white/[0.04] bg-[#f8fafc] dark:bg-[#0f172a]">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRightPanelTab("context")}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    rightPanelTab === "context"
                      ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                      : "bg-white text-slate-600 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                  }`}
                >
                  Context
                </button>
                <button
                  type="button"
                  onClick={() => setRightPanelTab("documents")}
                  className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                    rightPanelTab === "documents"
                      ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700"
                      : "bg-white text-slate-600 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                  }`}
                >
                  Documents
                </button>
              </div>
            </div>
            <div className="flex-1 min-h-0">
              {rightPanelTab === "context" ? (
                <AgentResultPreview {...contextProps} />
              ) : (
                <AgentSessionDocumentsPanel sessionId={activeSessionId} />
              )}
            </div>
          </div>
        </div>
      )}

      {/* Mobile - Overlay */}
      {showContextSidebar && (
        <div className="absolute inset-0 z-40 2xl:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setShowContextSidebar(false)}
          />
          <div className="absolute inset-y-0 right-0 w-80 max-w-[85vw]">
            <div className="h-full flex flex-col">
              <div className="flex-shrink-0 p-2 border-l border-b border-black/[0.05] dark:border-white/[0.04] bg-[#f8fafc] dark:bg-[#0f172a]">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("context")}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      rightPanelTab === "context"
                        ? "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-700"
                        : "bg-white text-slate-600 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Context
                  </button>
                  <button
                    type="button"
                    onClick={() => setRightPanelTab("documents")}
                    className={`text-xs px-3 py-1.5 rounded border transition-colors ${
                      rightPanelTab === "documents"
                        ? "bg-indigo-100 text-indigo-700 border-indigo-300 dark:bg-indigo-900/20 dark:text-indigo-300 dark:border-indigo-700"
                        : "bg-white text-slate-600 border-slate-300 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700"
                    }`}
                  >
                    Documents
                  </button>
                </div>
              </div>
              <div className="flex-1 min-h-0">
                {rightPanelTab === "context" ? (
                  <AgentResultPreview {...contextProps} />
                ) : (
                  <AgentSessionDocumentsPanel sessionId={activeSessionId} />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
