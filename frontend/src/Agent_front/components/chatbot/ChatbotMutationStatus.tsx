import { useEffect, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import type { ChatbotTurnMutation } from "../../types/agentMessage";

const MIN_PENDING_VISIBLE_MS = 400;

interface ChatbotMutationStatusProps {
  mutation: ChatbotTurnMutation;
  variant?: "inline" | "embedded";
  timestampLabel?: string;
  showLoggedBadge?: boolean;
}

function toTitleCase(value: string) {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getMutationEntityPill(mutation: ChatbotTurnMutation): string | null {
  if (!mutation.entityType) return null;
  const label = toTitleCase(mutation.entityType);
  return mutation.entityId ? `${label} #${mutation.entityId}` : label;
}

function getOperationPill(mutation: ChatbotTurnMutation): string | null {
  if (!mutation.operation) return null;
  return toTitleCase(mutation.operation);
}

export function ChatbotMutationStatus({
  mutation,
  variant = "inline",
  timestampLabel,
  showLoggedBadge = false,
}: ChatbotMutationStatusProps) {
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

  const isPending = displayMutation.state === "pending";
  const isSuccess = displayMutation.state === "success";
  const isError = displayMutation.state === "error";
  const entityPill = getMutationEntityPill(displayMutation);
  const operationPill = getOperationPill(displayMutation);

  const primaryText = isPending
    ? displayMutation.label || "Applying changes..."
    : isSuccess
      ? "Done"
      : "Update failed";
  const secondaryText =
    !isPending && displayMutation.label && displayMutation.label !== primaryText
      ? displayMutation.label
      : null;

  const statusTone = isPending
    ? {
        rail: "bg-slate-200/80 dark:bg-slate-800",
        railFill: "bg-slate-500/80 dark:bg-slate-400/80",
        iconWrap:
          "bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300",
        card:
          "border-slate-200/80 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/60",
        statusText: "text-slate-600 dark:text-slate-300",
      }
    : isSuccess
      ? {
          rail: "bg-emerald-100/70 dark:bg-emerald-950/40",
          railFill: "bg-emerald-500/70 dark:bg-emerald-400/70",
          iconWrap:
            "bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200/80 dark:border-emerald-800/70 text-emerald-600 dark:text-emerald-300",
          card:
            "border-emerald-200/80 dark:border-emerald-800/70 bg-emerald-50/40 dark:bg-emerald-950/20",
          statusText: "text-emerald-700 dark:text-emerald-300",
        }
      : {
          rail: "bg-rose-100/70 dark:bg-rose-950/40",
          railFill: "bg-rose-500/70 dark:bg-rose-400/70",
          iconWrap:
            "bg-rose-50 dark:bg-rose-950/40 border border-rose-200/80 dark:border-rose-800/70 text-rose-600 dark:text-rose-300",
          card:
            "border-rose-200/80 dark:border-rose-800/70 bg-rose-50/40 dark:bg-rose-950/20",
          statusText: "text-rose-700 dark:text-rose-300",
        };

  const footerLabel = isPending ? "Executing..." : isSuccess ? "Completed" : "Failed";

  const content = (
    <div
      className={`overflow-hidden rounded-xl border shadow-sm ${statusTone.card}`}
      data-testid="chatbot-mutation-status"
      data-state={displayMutation.state}
      aria-live="polite"
    >
      <div className={`h-0.5 ${statusTone.rail}`}>
        <div
          className={`h-full transition-all duration-300 ${
            isPending ? `w-2/3 ${statusTone.railFill} animate-pulse` : `w-full ${statusTone.railFill}`
          }`}
        />
      </div>

      <div className={`${variant === "embedded" ? "px-3 py-3" : "px-3 py-2.5"} flex items-start gap-3`}>
        <div
          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-all ${
            statusTone.iconWrap
          } ${isPending ? "animate-pulse" : ""}`}
        >
          {isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSuccess ? (
            <CheckCircle2 className="w-4 h-4" />
          ) : (
            <AlertCircle className="w-4 h-4" />
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 leading-5">
            {primaryText}
          </div>

          {secondaryText ? (
            <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-4">
              {secondaryText}
            </div>
          ) : null}

          {(entityPill || operationPill) ? (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {entityPill ? (
                <span className="inline-flex items-center rounded-md border border-black/[0.08] dark:border-white/[0.08] bg-white/80 dark:bg-slate-900/70 px-2 py-0.5 text-[11px] text-slate-600 dark:text-slate-300">
                  {entityPill}
                </span>
              ) : null}
              {operationPill ? (
                <span className="inline-flex items-center rounded-md border border-black/[0.06] dark:border-white/[0.06] bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-[11px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  {operationPill}
                </span>
              ) : null}
            </div>
          ) : null}

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
            <span className={`inline-flex items-center gap-1.5 font-medium ${statusTone.statusText}`}>
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${
                  isPending ? "opacity-60 animate-pulse" : "opacity-100"
                } ${isPending ? "bg-slate-500 dark:bg-slate-400" : isSuccess ? "bg-emerald-500" : "bg-rose-500"}`}
              />
              {footerLabel}
            </span>
            {timestampLabel ? (
              <span>{timestampLabel}</span>
            ) : null}
            {showLoggedBadge && isSuccess ? (
              <span className="inline-flex items-center gap-1 text-slate-500 dark:text-slate-400">
                Logged
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (variant === "embedded") {
    return content;
  }

  if (displayMutation.state === "pending") {
    return <div className="agent-message-row">{content}</div>;
  }

  return <div className="agent-message-row">{content}</div>;
}
