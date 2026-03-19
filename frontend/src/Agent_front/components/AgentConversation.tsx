import { useMemo, memo } from "react";
import { AgentMessage as AgentMessageType } from "../types/agentMessage";
import { UserCommand } from "./UserCommand";
import { AgentArtifact } from "./AgentArtifact";
import { StatusMessage } from "./messages/StatusMessage";
import type { AgentRequestMetadata, FollowUpSuggestion } from "../../services/api/agent";

type TransientStatus = {
  action: string;
  phase?: string;
};

interface AgentConversationProps {
  messages: AgentMessageType[];
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  getRelativeTime: (timestamp: Date) => string;
  transientStatus?: TransientStatus | null;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
  onSubmitMessage?: (message: string, metadata?: AgentRequestMetadata) => void;
}

/**
 * Chat-first conversation layout.
 *
 * Groups messages into interaction pairs (user message + agent response).
 * The most recent pair is displayed prominently.
 * Previous pairs are collapsed into a compact log, expandable on click.
 */
export const AgentConversation = memo(function AgentConversation({
  messages,
  conversationEndRef,
  getRelativeTime,
  transientStatus,
  onFollowUpClick,
  onExampleClick,
  onConfirmWebSearch,
  onSubmitMessage,
}: AgentConversationProps) {
  // Group messages into interaction pairs: [user, agent?]
  const interactionPairs = useMemo(() => {
    const pairs: { user: AgentMessageType; agents: AgentMessageType[] }[] = [];
    let pendingUser: AgentMessageType | null = null;
    let pendingAgents: AgentMessageType[] = [];

    for (const msg of messages) {
      if (msg.role === "user") {
        // If there was a previous user with no agent response, push it alone
        if (pendingUser) {
          pairs.push({ user: pendingUser, agents: pendingAgents });
        }
        pendingUser = msg;
        pendingAgents = [];
      } else {
        // Agent message
        if (pendingUser) {
          pendingAgents.push(msg);
        } else {
          // Orphan agent message (retry without matching user) —
          // create a synthetic pair with a blank user
          pairs.push({
            user: {
              id: `synthetic-${msg.id}`,
              role: "user",
              content: "",
              timestamp: msg.timestamp,
            },
            agents: [msg],
          });
        }
      }
    }

    // Trailing user message with no response yet
    if (pendingUser) {
      pairs.push({ user: pendingUser, agents: pendingAgents });
    }

    return pairs;
  }, [messages]);

  return (
    <div className="space-y-10">
      {interactionPairs.map((pair, idx) => {
        const isLastPair = idx === interactionPairs.length - 1;
          return (
            <div
              key={`${pair.user.id}-${idx}`}
              className="workspace-current-enter space-y-3"
            >
            {(pair.user.content ||
              (pair.user.attachments && pair.user.attachments.length > 0)) && (
              <UserCommand
                message={pair.user}
                getRelativeTime={getRelativeTime}
                isLastUserMessage={isLastPair}
              />
            )}

            {pair.agents.length > 0 && (
              <div className="mt-3 space-y-3">
                {pair.agents.map((agent) => (
                  <AgentArtifact
                    key={agent.id}
                    message={agent}
                    onFollowUpClick={onFollowUpClick}
                    onExampleClick={onExampleClick}
                    onConfirmWebSearch={onConfirmWebSearch}
                    onSubmitMessage={onSubmitMessage}
                  />
                ))}
              </div>
            )}

            {idx < interactionPairs.length - 1 && (
              <div className="flex items-center justify-center pt-2">
                <span className="agent-divider" aria-hidden="true" />
              </div>
            )}
          </div>
        );
      })}

      {transientStatus && (
        <div className="space-y-2">
          <StatusMessage
            action={transientStatus.action}
            phase={transientStatus.phase}
          />
        </div>
      )}

      <div ref={conversationEndRef} className="h-6" />
    </div>
  );
});
