import { useCallback, useState } from "react";
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

interface AgentLayoutProps {
  isGlobalSidebarCollapsed?: boolean;
}

export function AgentLayout({
  isGlobalSidebarCollapsed = false,
}: AgentLayoutProps = {}) {
  const [rightPanelTab, setRightPanelTab] = useState<"context" | "documents">(
    "context",
  );
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
    <div className="relative w-full h-full flex gap-0 bg-[#f8fafc] dark:bg-[#0f172a]">
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
          className="flex-1 overflow-y-auto scroll-smooth agent-thread"
          style={{ minHeight: 0 }}
        >
          <div className="mx-auto w-full max-w-[52rem] px-4 py-6 sm:px-8">
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
              />
            )}
          </div>
        </div>

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
