import { useCallback, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("common");
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
    modelPreference,
    setModelPreference,
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
    (message: string, metadata?: import("../services/api/agent").AgentRequestMetadata) => {
      const text = String(message || "").trim();
      if (!text) return;
      const replaceMessageId =
        typeof metadata?.replaceMessageId === "string" && metadata.replaceMessageId.trim().length > 0
          ? metadata.replaceMessageId.trim()
          : undefined;
      const cleanedMetadata = metadata
        ? (() => {
            const { replaceMessageId: _omit, ...rest } = metadata;
            return rest;
          })()
        : undefined;
      startAgentStream(text, {
        metadata: cleanedMetadata,
        ...(replaceMessageId
          ? {
              replaceMessageId,
              retryOf: replaceMessageId,
            }
          : {}),
      });
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
    dataAccess,
    setDataAccess,
  };

  return (
    <div className="agent-flat-mode relative w-full h-full flex gap-0 bg-[#f8fafc] dark:bg-[#0f172a]">
      {/* 
          LEFT SIDEBAR - Conversation History
          Desktop: Animated slide-in | Mobile: Animated overlay drawer
      */}

      {/* Desktop Sidebar with Animation */}
      <div 
        className={`hidden lg:block h-full flex-shrink-0 overflow-hidden transition-[width] duration-260 ease-[cubic-bezier(0.2,0,0,1)] ${
          showHistorySidebar ? "w-72" : "w-0"
        }`}
      >
        <div className="w-72 h-full">
          <AgentHistorySidebar 
            {...sidebarProps} 
            onToggleCollapse={() => setShowHistorySidebar(!showHistorySidebar)}
          />
        </div>
      </div>

      {/* Mobile Sidebar with Animation */}
      <div 
        className={`lg:hidden fixed inset-0 z-50 transition-[visibility] duration-200 ${
          showHistorySidebar ? "visible" : "invisible pointer-events-none"
        }`}
      >
        <div 
          className={`absolute inset-0 bg-black/40 transition-opacity duration-220 ${
            showHistorySidebar ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setShowHistorySidebar(false)}
        />
        <div 
          className={`absolute inset-y-0 left-0 w-80 max-w-[85vw] bg-[#f9fafb] dark:bg-[#0f172a] shadow-2xl transition-transform duration-220 ease-[cubic-bezier(0.2,0,0,1)] ${
            showHistorySidebar ? "translate-x-0" : "-translate-x-full"
          }`}
        >
          <AgentHistorySidebar 
            {...sidebarProps} 
            onToggleCollapse={() => setShowHistorySidebar(false)}
          />
        </div>
      </div>

      {/* CENTER COLUMN - Main Chat Area */}
      <div className="flex-1 min-w-0 flex flex-col h-full agent-ui-text">
        <div className="flex-shrink-0">
          <AgentTopBar
            showHistorySidebar={showHistorySidebar}
            showContextSidebar={showContextSidebar}
            onToggleHistory={() => setShowHistorySidebar(!showHistorySidebar)}
            onToggleContext={() => setShowContextSidebar(!showContextSidebar)}
            modelPreference={modelPreference}
            onModelPreferenceChange={setModelPreference}
            isStreaming={isLoading}
          />
        </div>

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

        {isOffline && (
          <div className="flex-shrink-0 flex items-center justify-center gap-2 px-4 py-2 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-700/40 text-amber-800 dark:text-amber-300 text-xs font-medium">
            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 5.636a9 9 0 010 12.728M15.536 8.464a5 5 0 010 7.072M6.343 6.343a9 9 0 000 12.728M9.172 9.172a5 5 0 000 7.071M12 12h.01" />
            </svg>
            {t("agent.layout.offline")}
          </div>
        )}

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

      {/* RIGHT SIDEBAR - Context Panel */}
      <div 
        className={`hidden 2xl:block h-full flex-shrink-0 overflow-hidden relative transition-[width] duration-260 ease-[cubic-bezier(0.2,0,0,1)] ${
          showContextSidebar ? "w-80" : "w-0"
        }`}
      >
        <div 
          className="absolute -left-4 top-[10%] bottom-[10%] w-4 cursor-pointer group/toggle flex items-center justify-center z-50 overflow-visible"
          onClick={() => setShowContextSidebar(!showContextSidebar)}
          title={showContextSidebar ? t("agent.layout.collapsePanel") : t("agent.layout.expandPanel")}
        >
          <div className="h-20 w-1.5 bg-black/[0.1] dark:bg-white/[0.1] rounded-full flex items-center justify-center group-hover/toggle:h-32 group-hover/toggle:w-4 group-hover/toggle:bg-indigo-500/20 transition-all duration-300 ease-[cubic-bezier(0.34,1.56,0.64,1)] border border-transparent group-hover/toggle:border-indigo-500/30 group-hover/toggle:shadow-[0_0_12px_rgba(79,70,229,0.15)] relative overflow-hidden">
               <i className={`fas ${showContextSidebar ? "fa-chevron-right" : "fa-chevron-left"} text-[8px] text-indigo-500 opacity-0 group-hover/toggle:opacity-100 transition-opacity duration-300 absolute`}></i>
          </div>
        </div>

        <div className="w-80 h-full overflow-hidden flex flex-col">
          <div className="flex-shrink-0 p-2 border-b border-black/[0.05] dark:border-white/[0.04] bg-[#f8fafc] dark:bg-[#0f172a]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRightPanelTab("context")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 font-medium ${
                  rightPanelTab === "context"
                    ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                }`}
              >
                {t("agent.layout.contextTab")}
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab("documents")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 font-medium ${
                  rightPanelTab === "documents"
                    ? "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                }`}
              >
                {t("agent.layout.documentsTab")}
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

      {/* Mobile/Tablet Context Overlay */}
      <div 
        className={`2xl:hidden fixed inset-0 z-50 transition-[visibility] duration-200 ${
          showContextSidebar ? "visible" : "invisible pointer-events-none"
        }`}
      >
        <div 
          className={`absolute inset-0 bg-black/40 transition-opacity duration-220 ${
            showContextSidebar ? "opacity-100" : "opacity-0"
          }`}
          onClick={() => setShowContextSidebar(false)}
        />
        <div 
          className={`absolute inset-y-0 right-0 w-80 max-w-[85vw] bg-[#f9fafb] dark:bg-[#0f172a] shadow-2xl transition-transform duration-220 ease-[cubic-bezier(0.2,0,0,1)] flex flex-col ${
            showContextSidebar ? "translate-x-0" : "translate-x-full"
          }`}
        >
          <div className="flex-shrink-0 p-2 border-b border-black/[0.05] dark:border-white/[0.04]">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setRightPanelTab("context")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 font-medium ${
                  rightPanelTab === "context"
                    ? "bg-blue-500 text-white border-blue-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                }`}
              >
                {t("agent.layout.contextTab")}
              </button>
              <button
                type="button"
                onClick={() => setRightPanelTab("documents")}
                className={`text-xs px-3 py-1.5 rounded-lg border transition-all duration-200 font-medium ${
                  rightPanelTab === "documents"
                    ? "bg-indigo-500 text-white border-indigo-600 shadow-sm"
                    : "bg-white text-slate-600 border-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-800"
                }`}
              >
                {t("agent.layout.documentsTab")}
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
  );
}
