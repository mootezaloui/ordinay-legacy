import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
 * Workspace-style conversation layout.
 *
 * Groups messages into interaction pairs (user command + agent artifact).
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

  const hasPrevious = interactionPairs.length > 1;
  const previousPairs = hasPrevious ? interactionPairs.slice(0, -1) : [];
  const currentPair = interactionPairs[interactionPairs.length - 1] || null;

  return (
    <div className="space-y-2">
      {/* Previous interactions — collapsed log */}
      {previousPairs.length > 0 && (
        <PreviousInteractions
          pairs={previousPairs}
          getRelativeTime={getRelativeTime}
          onFollowUpClick={onFollowUpClick}
          onExampleClick={onExampleClick}
        />
      )}

      {/* Current interaction — full display */}
      {currentPair && (
        <div className="workspace-current-enter">
          {/* User command */}
          {currentPair.user.content && (
            <UserCommand
              message={currentPair.user}
              getRelativeTime={getRelativeTime}
            />
          )}

          {/* Agent artifact */}
          {currentPair.agent && (
            <div className="mt-2">
              <AgentArtifact message={currentPair.agent} onFollowUpClick={onFollowUpClick} onExampleClick={onExampleClick} />
            </div>
          )}
        </div>
      )}

      <div ref={conversationEndRef} className="h-4" />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Previous interactions: collapsed log with expand capability
// ────────────────────────────────────────────────────────────────

interface PreviousInteractionsProps {
  pairs: { user: AgentMessageType; agent?: AgentMessageType }[];
  getRelativeTime: (timestamp: Date) => string;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
}

function PreviousInteractions({
  pairs,
  getRelativeTime,
  onFollowUpClick,
  onExampleClick,
}: PreviousInteractionsProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="mb-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-300 dark:text-slate-600 mb-2 px-1">
        Previous ({pairs.length})
      </div>
      <div className="space-y-1">
        {pairs.map((pair) => {
          const id = pair.user.id;
          const isExpanded = expandedIds.has(id);
          const summary = getInteractionSummary(pair);

          return (
            <div key={id}>
              {/* Collapsed row */}
              <button
                type="button"
                onClick={() => toggleExpand(id)}
                className="w-full flex items-center gap-2 px-3 py-2 rounded hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left group"
              >
                {isExpanded ? (
                  <ChevronDown className="w-3 h-3 text-slate-400 flex-shrink-0" />
                ) : (
                  <ChevronRight className="w-3 h-3 text-slate-400 flex-shrink-0" />
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500 truncate flex-1">
                  {pair.user.content || "—"}
                </span>
                <span className="text-xs text-slate-300 dark:text-slate-600 flex-shrink-0">
                  {summary}
                </span>
                <span className="text-xs text-slate-300 dark:text-slate-600 flex-shrink-0 ml-2">
                  {getRelativeTime(pair.user.timestamp)}
                </span>
              </button>

              {/* Expanded: full rendering */}
              {isExpanded && (
                <div className="ml-5 mt-1 mb-3 pl-3 border-l-2 border-slate-100 dark:border-slate-700/50">
                  {pair.user.content && (
                    <UserCommand
                      message={pair.user}
                      getRelativeTime={getRelativeTime}
                    />
                  )}
                  {pair.agent && (
                    <div className="mt-2">
                      <AgentArtifact message={pair.agent} onFollowUpClick={onFollowUpClick} onExampleClick={onExampleClick} />
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Generates a short summary label for a collapsed interaction.
 */
function getInteractionSummary(pair: {
  user: AgentMessageType;
  agent?: AgentMessageType;
}): string {
  if (!pair.agent) return "pending";

  if (pair.agent.status === "error") return "error";

  const dataType = pair.agent.data?.type;
  if (dataType === "explanation") return "explanation";
  if (dataType === "risks") return "risk analysis";
  if (dataType === "draft") return "draft";
  if (dataType === "actions") return "actions";

  const intent = pair.agent.intent?.toLowerCase().replace(/_/g, " ") || "";
  if (intent.includes("list")) return "list";
  if (intent.includes("read")) return "entity";
  if (intent.includes("summarize")) return "summary";

  return "response";
}
