import { AgentMessage as AgentMessageType } from "../types/agentMessage";
import { AgentMessage } from "./AgentMessage";

interface AgentConversationProps {
  messages: AgentMessageType[];
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentConversation({
  messages,
  conversationEndRef,
  getRelativeTime,
}: AgentConversationProps) {
  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <div key={message.id} className="agent-message-enter">
          <AgentMessage
            message={message}
            getRelativeTime={getRelativeTime}
          />
        </div>
      ))}
      <div ref={conversationEndRef} className="h-4" />
    </div>
  );
}
