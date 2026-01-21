import { useRef, useEffect, useState } from "react";
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
  // Track which message IDs we've already seen to animate only new ones
  const seenIdsRef = useRef<Set<string>>(new Set());
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const newIds = new Set<string>();
    messages.forEach((msg) => {
      if (!seenIdsRef.current.has(msg.id)) {
        newIds.add(msg.id);
        seenIdsRef.current.add(msg.id);
      }
    });

    if (newIds.size > 0) {
      setAnimatingIds((prev) => new Set([...prev, ...newIds]));
      // Remove animation class after animation completes
      const timer = setTimeout(() => {
        setAnimatingIds((prev) => {
          const next = new Set(prev);
          newIds.forEach((id) => next.delete(id));
          return next;
        });
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [messages]);

  return (
    <div className="space-y-6">
      {messages.map((message) => (
        <div
          key={message.id}
          className={animatingIds.has(message.id) ? "agent-message-enter" : ""}
        >
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
