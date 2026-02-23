import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ChatbotTurnMutation } from "../../types/agentMessage";

const MIN_PENDING_VISIBLE_MS = 400;

interface ChatbotMutationStatusProps {
  mutation: ChatbotTurnMutation;
}

export function ChatbotMutationStatus({ mutation }: ChatbotMutationStatusProps) {
  const [displayMutation, setDisplayMutation] = useState<ChatbotTurnMutation>(mutation);
  const pendingSinceRef = useRef<number | null>(mutation.state === "pending" ? Date.now() : null);

  useEffect(() => {
    if (mutation.state === "pending") {
      pendingSinceRef.current = Date.now();
      setDisplayMutation(mutation);
      return;
    }

    const pendingSince = pendingSinceRef.current;
    if (!pendingSince || displayMutation.state !== "pending") {
      setDisplayMutation(mutation);
      return;
    }

    const elapsed = Date.now() - pendingSince;
    const remaining = Math.max(0, MIN_PENDING_VISIBLE_MS - elapsed);
    if (remaining <= 0) {
      setDisplayMutation(mutation);
      return;
    }

    const timer = window.setTimeout(() => {
      setDisplayMutation(mutation);
    }, remaining);
    return () => window.clearTimeout(timer);
  }, [mutation, displayMutation.state]);

  if (displayMutation.state === "pending") {
    return (
      <div
        className="agent-message-row"
        data-testid="chatbot-mutation-status"
        data-state="pending"
        aria-live="polite"
      >
        <div className="inline-flex items-center gap-2 rounded-lg border border-slate-200/80 dark:border-slate-700/80 bg-slate-50/80 dark:bg-slate-900/50 px-3 py-2 animate-pulse">
          <Loader2 className="w-3.5 h-3.5 text-slate-500 dark:text-slate-400 animate-spin" />
          <span className="text-xs text-slate-600 dark:text-slate-300">
            {displayMutation.label || "Applying changes..."}
          </span>
        </div>
      </div>
    );
  }

  if (displayMutation.state === "success") {
    return (
      <div
        className="agent-message-row"
        data-testid="chatbot-mutation-status"
        data-state="success"
        aria-live="polite"
      >
        <div className="inline-flex items-center gap-2 rounded-lg border border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/80 dark:bg-emerald-950/30 px-3 py-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          <span className="text-xs text-emerald-700 dark:text-emerald-300">Done</span>
        </div>
      </div>
    );
  }

  return (
    <div
      className="agent-message-row"
      data-testid="chatbot-mutation-status"
      data-state="error"
      aria-live="polite"
    >
      <div className="inline-flex items-center gap-2 rounded-lg border border-rose-200/80 dark:border-rose-800/70 bg-rose-50/80 dark:bg-rose-950/30 px-3 py-2">
        <AlertCircle className="w-3.5 h-3.5 text-rose-600 dark:text-rose-400" />
        <span className="text-xs text-rose-700 dark:text-rose-300">Update failed</span>
      </div>
    </div>
  );
}
