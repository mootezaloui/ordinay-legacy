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
    handleSubmit,
    handleKeyDown,
    handleExampleClick,
  } = useAgentState();

  const {
    sessions,
    activeSession,
    setActiveSession,
    handleNewChat,
    getRelativeTime,
  } = useAgentSessions();

  return (
    <div className="fixed inset-0 top-[4.5rem] left-20 lg:left-64 z-0 flex min-h-0 overflow-hidden">
      {showHistorySidebar && (
        <AgentHistorySidebar
          sessions={sessions}
          activeSession={activeSession}
          onSessionClick={setActiveSession}
          onNewChat={handleNewChat}
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
