import { useMemo } from "react";
import { AgentMessage as AgentMessageType } from "../types/agentMessage";
import { UserCommand } from "./UserCommand";
import { AgentArtifact } from "./AgentArtifact";
import type { FollowUpSuggestion } from "../../services/api/agent";

interface AgentConversationProps {
  messages: AgentMessageType[];
  conversationEndRef: React.RefObject<HTMLDivElement | null>;
  getRelativeTime: (timestamp: Date) => string;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  /** Called when user clicks an example query (e.g., from error suggestions) */
  onExampleClick?: (example: string) => void;
}

/**
 * Chat-first conversation layout.
 *
 * Groups messages into interaction pairs (user message + agent response).
 * The most recent pair is displayed prominently.
 * Previous pairs are collapsed into a compact log, expandable on click.
 */
export function AgentConversation({
  messages,
  conversationEndRef,
  getRelativeTime,
  onFollowUpClick,
  onExampleClick,
}: AgentConversationProps) {
  // Group messages into interaction pairs: [user, agent?]
  const interactionPairs = useMemo(() => {
    const pairs: { user: AgentMessageType; agent?: AgentMessageType }[] = [];
    let pendingUser: AgentMessageType | null = null;

    for (const msg of messages) {
      if (msg.role === "user") {
        // If there was a previous user with no agent response, push it alone
        if (pendingUser) {
          pairs.push({ user: pendingUser });
        }
        pendingUser = msg;
      } else {
        // Agent message
        if (pendingUser) {
          pairs.push({ user: pendingUser, agent: msg });
          pendingUser = null;
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
            agent: msg,
          });
        }
      }
    }

    // Trailing user message with no response yet
    if (pendingUser) {
      pairs.push({ user: pendingUser });
    }

    return pairs;
  }, [messages]);

  return (
    <div className="space-y-10">
      {interactionPairs.map((pair, idx) => (
        <div key={`${pair.user.id}-${idx}`} className="workspace-current-enter space-y-3">
          {pair.user.content && (
            <UserCommand
              message={pair.user}
              getRelativeTime={getRelativeTime}
            />
          )}

          {pair.agent && (
            <div className="mt-3">
              <AgentArtifact
                message={pair.agent}
                onFollowUpClick={onFollowUpClick}
                onExampleClick={onExampleClick}
              />
            </div>
          )}

          {idx < interactionPairs.length - 1 && (
            <div className="flex items-center justify-center pt-2">
              <span className="agent-divider" aria-hidden="true" />
            </div>
          )}
        </div>
      ))}

      <div ref={conversationEndRef} className="h-6" />
    </div>
  );
}
