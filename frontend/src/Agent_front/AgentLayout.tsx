import { AgentTopBar } from "./components/AgentTopBar";
import { AgentInput } from "./components/AgentInput";
import { AgentConversation } from "./components/AgentConversation";
import { AgentQuickActions } from "./components/AgentQuickActions";
import { AgentResultPreview } from "./components/AgentResultPreview";
import { AgentHistorySidebar } from "./sidebar/AgentHistorySidebar";
import { useAgentState } from "./hooks/useAgentState";
import { useAgentSessions } from "./hooks/useAgentSessions";

export function AgentLayout() {
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
    cancelStream,
    dataAccess,
    setDataAccess,
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
    <div className="flex h-full min-h-0 w-full overflow-hidden">
      {/* ── Left column: conversation history (desktop — static) ── */}
      {showHistorySidebar && (
        <aside className="hidden lg:flex flex-shrink-0 h-full">
          <AgentHistorySidebar {...sidebarProps} />
        </aside>
      )}

      {/* ── Left column: conversation history (mobile — overlay drawer) ── */}
      {showHistorySidebar && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setShowHistorySidebar(false)}
            aria-label="Close conversation list"
          />
          <aside className="absolute inset-y-0 left-0 w-80 max-w-[85vw] shadow-xl">
            <AgentHistorySidebar {...sidebarProps} />
          </aside>
        </div>
      )}

      {/* ── Center column: agent workspace ── */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        <AgentTopBar
          showHistorySidebar={showHistorySidebar}
          showContextSidebar={showContextSidebar}
          onToggleHistory={() => setShowHistorySidebar(!showHistorySidebar)}
          onToggleContext={() => setShowContextSidebar(!showContextSidebar)}
        />

        <div
          ref={scrollContainerRef}
          className="flex-1 overflow-y-auto min-h-0 scroll-smooth"
        >
          <div className="mx-auto w-full max-w-4xl px-4 py-4 sm:px-6">
            {conversation.length === 0 ? (
              <AgentQuickActions onExampleClick={handleExampleClick} />
            ) : (
              <AgentConversation
                messages={conversation}
                conversationEndRef={conversationEndRef}
                getRelativeTime={getRelativeTime}
              />
            )}
          </div>
        </div>

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

      {/* ── Right column: context panel (desktop — static) ── */}
      {showContextSidebar && (
        <aside className="hidden 2xl:flex flex-shrink-0 h-full">
          <AgentResultPreview {...contextProps} />
        </aside>
      )}

      {/* ── Right column: context panel (mobile — overlay drawer) ── */}
      {showContextSidebar && (
        <div className="fixed inset-0 z-40 2xl:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            onClick={() => setShowContextSidebar(false)}
            aria-label="Close context panel"
          />
          <aside className="absolute inset-y-0 right-0 w-80 max-w-[85vw] shadow-xl">
            <AgentResultPreview {...contextProps} />
          </aside>
        </div>
      )}
    </div>
  );
}
