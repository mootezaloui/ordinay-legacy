import { AgentMessage as AgentMessageType } from "../types/agentMessage";
import { AgentMessage } from "./AgentMessage";

interface AgentConversationProps {
  messages: AgentMessageType[];
  conversationEndRef: React.RefObject<HTMLDivElement>;
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
        <AgentMessage
          key={message.id}
          message={message}
          getRelativeTime={getRelativeTime}
        />
      ))}
      <div ref={conversationEndRef} />
    </div>
  );
}
