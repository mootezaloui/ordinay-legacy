import { useRef, useState, useEffect, memo } from "react";
import { Copy, Check, RotateCw } from "lucide-react";
import { AgentMessage } from "../types/agentMessage";
import type { AgentRequestMetadata, FollowUpSuggestion } from "../../services/api/agent";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { AgentWorkflow } from "./AgentWorkflow";

interface AgentArtifactProps {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
  onSubmitMessage?: (message: string, metadata?: AgentRequestMetadata) => void;
}

/**
 * Top-level wrapper for an agent response.
 *
 * Delegates the entire lifecycle (classifying → working → reveal → complete)
 * to AgentWorkflow, which handles phased transitions.
 *
 * This component just adds the shared footer (copy, retry).
 */
export const AgentArtifact = memo(function AgentArtifact({ message, onFollowUpClick, onExampleClick, onConfirmWebSearch, onSubmitMessage }: AgentArtifactProps) {
  const isStreaming = message.status === "sending";

  return (
    <div className="agent-artifact-wrapper">
      <AgentWorkflow
        message={message}
        onFollowUpClick={onFollowUpClick}
        onExampleClick={onExampleClick}
        onConfirmWebSearch={onConfirmWebSearch}
        onSubmitMessage={onSubmitMessage}
      />
      {/* Footer actions — only visible on completed, non-streaming responses */}
      {!isStreaming && message.status !== undefined && (
        <ArtifactFooter message={message} />
      )}
    </div>
  );
});

/**
 * Shared footer for completed artifacts: copy + retry actions.
 * Minimal, only visible on hover.
 */
function ArtifactFooter({ message }: { message: AgentMessage }) {
  const { activeSession } = useAgentSessions();
  const { startAgentStream, isLoading } = useAgentState();
  const contentRef = useRef<HTMLDivElement>(null);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  const handleCopy = async () => {
    const wrapper = contentRef.current?.closest(".agent-artifact-wrapper");
    if (!wrapper) return;
    const text = (wrapper as HTMLElement).innerText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current) window.clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // silent
    }
  };

  const handleRetry = () => {
    if (isLoading || !activeSession) return;
    const msgs = activeSession.messages || [];
    const idx = msgs.findIndex((m) => m.id === message.id);
    if (idx === -1) return;
    let userMsg: AgentMessage | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        userMsg = msgs[i];
        break;
      }
    }
    if (!userMsg) return;
    startAgentStream?.(userMsg.content, {
      retryOf: message.id,
      sourceUserId: userMsg.id,
      replaceMessageId: message.id,
    });
  };

  return (
    <div
      ref={contentRef}
      className="group/footer flex items-center gap-2 mt-1.5 opacity-0 hover:opacity-100 focus-within:opacity-100 transition-opacity"
    >
      <button
        type="button"
        aria-label={copied ? "Copied" : "Copy"}
        onClick={handleCopy}
        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors"
      >
        {copied ? (
          <Check className="w-3.5 h-3.5 text-green-600" />
        ) : (
          <Copy className="w-3.5 h-3.5" />
        )}
      </button>
      <button
        type="button"
        aria-label="Retry"
        onClick={handleRetry}
        disabled={isLoading}
        className="p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-black/[0.04] dark:hover:bg-white/[0.06] transition-colors disabled:opacity-30"
      >
        <RotateCw className="w-3.5 h-3.5" />
      </button>
      {message.retryOf && (
        <span className="text-xs text-slate-300 dark:text-slate-600">
          retry
        </span>
      )}
    </div>
  );
}
