import { AgentTopBar } from "./components/AgentTopBar";
import { AgentInput } from "./components/AgentInput";
import { AgentConversation } from "./components/AgentConversation";
import { AgentQuickActions } from "./components/AgentQuickActions";
import { AgentResultPreview } from "./components/AgentResultPreview";
import { AgentHistorySidebar } from "./sidebar/AgentHistorySidebar";
import { useAgentState } from "./hooks/useAgentState";
import { useAgentSessions } from "./hooks/useAgentSessions";
import { useSidebar } from "@/contexts/SidebarContext";

export function AgentLayout() {
  const { isCollapsed } = useSidebar();
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
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
    saveScrollPosition,
    getRelativeTime,
  } = useAgentState();

  const {
    sessions,
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

  return (
    <div className={`fixed inset-0 top-[4.5rem] ${isCollapsed ? "left-20" : "left-64"} z-0 flex min-h-0 overflow-hidden transition-all duration-300`}>
      {showHistorySidebar && (
        <AgentHistorySidebar
          sessions={sessions}
          folders={folders}
          activeSessionId={activeSessionId}
          onSessionClick={handleSessionClick}
          onNewChat={createSession}
          onCreateFolder={createFolder}
          onRenameSession={renameSession}
          onDeleteSession={deleteSession}
          onRenameFolder={renameFolder}
          onDeleteFolder={deleteFolder}
          onToggleFolderExpanded={toggleFolderExpanded}
          onMoveSession={moveSessionToFolder}
          onReorderSessions={reorderSessionsInFolder}
          onReorderFolders={reorderFolders}
          getSessionsInFolder={getSessionsInFolder}
          getRelativeTime={getRelativeTime}
        />
      )}

      <div className="flex-1 flex flex-col min-w-0">
        <AgentTopBar
          showHistorySidebar={showHistorySidebar}
          showContextSidebar={showContextSidebar}
          onToggleHistory={() => setShowHistorySidebar(!showHistorySidebar)}
          onToggleContext={() => setShowContextSidebar(!showContextSidebar)}
        />

        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-6 py-6">
            {conversation.length === 0 && (
              <AgentQuickActions onExampleClick={handleExampleClick} />
            )}
            {conversation.length > 0 && (
              <AgentConversation
                messages={conversation}
                conversationEndRef={conversationEndRef}
                getRelativeTime={getRelativeTime}
              />
            )}
          </div>
        </div>

        <AgentInput
          input={input}
          setInput={setInput}
          inputRef={inputRef}
          onSubmit={handleSubmit}
          onKeyDown={handleKeyDown}
        />
      </div>

      {showContextSidebar && (
        <AgentResultPreview onExampleClick={handleExampleClick} />
      )}
    </div>
  );
}
