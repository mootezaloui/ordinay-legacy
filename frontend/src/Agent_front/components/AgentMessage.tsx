import React, { useRef, useState, useEffect } from "react";
import {
  AlertCircle,
  FileText,
  Shield,
  Lightbulb,
  ListTodo,
  Copy,
  Check,
  Edit2,
  RotateCw,
} from "lucide-react";
import {
  AgentMessage as AgentMessageType,
} from "../types/agentMessage";
import { ChatMessageAttachments } from "./messages/ChatMessageAttachments";
import type {
  ActionProposal,
  DraftOutput,
  ExplanationOutput,
  RiskAnalysisOutput,
  RiskItem,
} from "../../services/api/agent";
import { MarkdownOutput } from "../../components/MarkdownOutput";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { getApiBase, isElectron, getBackendConfig } from "../../lib/apiConfig";

interface AgentMessageProps {
  message: AgentMessageType;
  getRelativeTime: (timestamp: Date) => string;
  isLastUserMessage?: boolean;
}

export function AgentMessage({
  message,
  getRelativeTime,
  isLastUserMessage = false,
}: AgentMessageProps) {
  const isUser = message.role === "user";
  const isStreaming = message.status === "sending";
  const isError = message.status === "error";
  const hasContent = message.content && message.content.length > 0;

  // Copy-to-clipboard refs and state (assistant messages only)
  const contentRef = useRef<HTMLDivElement | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const canCopy = !isUser && (hasContent || !!message.data);

  // Edit state for user messages
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const originalContentRef = useRef(message.content || "");

  // Access session update functions and global streaming state
  const { updateSessionMessages, activeSession, activeSessionId } =
    useAgentSessions();
  const { isLoading, startAgentStream } = useAgentState();
  const editingDisabled = isLoading || !isLastUserMessage; // disable edits while any response is streaming OR if not last user message

  useEffect(() => {
    setEditContent(message.content || "");
  }, [message.content]);

  const startEdit = () => {
    if (editingDisabled) return;
    originalContentRef.current = message.content || "";
    setEditContent(message.content || "");
    setIsEditing(true);
  };

  const cancelEdit = () => {
    setEditContent(originalContentRef.current);
    setIsEditing(false);
  };

  const saveEdit = async () => {
    if (!activeSessionId || !activeSession) return;
    if (editContent.trim() === originalContentRef.current.trim()) {
      setIsEditing(false);
      return;
    }

    try {
      // Call backend /agent/edit endpoint
      const backendConfig = getBackendConfig();
      let result;

      if (isElectron() && backendConfig?.useIPC) {
        // Use IPC transport
        const ipcResponse = await window.electronAPI!.apiRequest(
          "POST",
          "/agent/edit",
          {
            message: editContent.trim(),
            sessionId: activeSessionId,
            userId: "default", // TODO: Get from auth context
          },
        );

        // IPC response format: { status: 200, data: { status: 'ok', ... } }
        if (ipcResponse.status !== 200 || ipcResponse.data?.status !== "ok") {
          console.error("[Edit] Failed to edit message:", ipcResponse);
          // TODO: Show error to user
          return;
        }

        result = ipcResponse.data;
      } else {
        // Use HTTP transport
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/agent/edit`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: editContent.trim(),
            sessionId: activeSessionId,
            userId: "default", // TODO: Get from auth context
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error("[Edit] Failed to edit message:", error);
          // TODO: Show error to user
          return;
        }

        result = await response.json();
      }

      setIsEditing(false);

      // Trigger new agent stream with edited message
      // editedMessageId triggers automatic removal of ALL assistant messages after it
      await startAgentStream(editContent.trim(), {
        sessionId: activeSessionId,
        editedMessageId: message.id,
      });
    } catch (err) {
      console.error("[Edit] Error editing message:", err);
      // TODO: Show error to user
    }
  };

  const handleCopy = async () => {
    if (!contentRef.current) return;
    const text = contentRef.current.innerText.trim();
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      if (copyTimeoutRef.current) {
        window.clearTimeout(copyTimeoutRef.current);
      }
      copyTimeoutRef.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.focus();
      textarea.select();
      try {
        document.execCommand("copy");
        setCopied(true);
        if (copyTimeoutRef.current) {
          window.clearTimeout(copyTimeoutRef.current);
        }
        copyTimeoutRef.current = window.setTimeout(
          () => setCopied(false),
          1500,
        );
      } finally {
        document.body.removeChild(textarea);
      }
    }
  };

  return (
    <div
      className={`group flex w-full items-start ${isUser ? "justify-end" : "justify-start"}`}
    >
      <div
        className={`flex flex-col ${isUser ? "max-w-[70%] items-end" : "max-w-[85%] items-start"}`}
      >
        <div
          className={`${
            isUser
              ? "bg-gradient-to-br from-blue-600 to-purple-600 user-message-bubble text-white shadow-lg"
              : isError
                ? "bg-red-50 dark:bg-red-900/20 text-[#0f172a] dark:text-[#f1f5f9] border border-red-200 dark:border-red-800 shadow-sm"
                : "bg-white dark:bg-[#1e293b] text-[#0f172a] dark:text-[#f1f5f9] border border-black/[0.06] dark:border-white/[0.06] shadow-sm"
          } w-fit max-w-full break-words rounded-2xl px-6 py-4`}
        >
          {/* Streaming: show content with cursor, or spinner if no content yet */}
          <div ref={contentRef}>
            {isStreaming && !hasContent && (
              <div className="flex items-center gap-3 text-slate-500 dark:text-slate-400 py-1">
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full agent-working-dot" />
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full agent-working-dot" />
                  <span className="w-1.5 h-1.5 bg-blue-500 rounded-full agent-working-dot" />
                </div>
                <span className="text-sm">Thinking...</span>
              </div>
            )}

            {/* Streaming with content: show text with blinking cursor */}

            {isStreaming && hasContent && (
              <div className="text-sm leading-relaxed mb-2 relative">
                <MarkdownOutput content={message.content} />
                <span className="inline-block w-2 h-4 ml-0.5 bg-blue-500 animate-pulse absolute top-0 right-0" />
              </div>
            )}

            {/* Error state */}
            {isError && (
              <div className="flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm leading-relaxed text-red-700 dark:text-red-300">
                  <MarkdownOutput content={message.content} />
                </div>
              </div>
            )}

            {/* Normal completed message content (and editable UI for user messages) */}
            {!isStreaming && !isError && (
              <div className="text-sm leading-relaxed mb-2">
                {/* Inline attachment previews for user messages */}
                {isUser &&
                  message.attachments &&
                  message.attachments.length > 0 && (
                    <ChatMessageAttachments
                      attachments={message.attachments}
                      variant={isUser ? "user" : "neutral"}
                    />
                  )}
                {isUser && isEditing ? (
                  <div>
                    <textarea
                      aria-label="Edit your message"
                      className="w-full min-h-[4rem] p-3 rounded-md border border-black/[0.06] dark:border-white/[0.06] bg-white dark:bg-[#1e293b] text-sm text-[#0f172a] dark:text-[#f1f5f9] resize-vertical"
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700"
                        onClick={saveEdit}
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        className="px-3 py-1.5 bg-white dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06]"
                        onClick={cancelEdit}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <MarkdownOutput content={message.content} />
                )}
              </div>
            )}

            {/* Structured data rendering */}
            {!isUser && !isStreaming && message.data && (
              <div className="mt-4">
                {/* Explanation */}
                {message.data.type === "explanation" &&
                  message.data.explanation && (
                    <ExplanationSection data={message.data.explanation} />
                  )}

                {/* Risk Analysis */}
                {message.data.type === "risks" && message.data.risks && (
                  <RiskSection data={message.data.risks} />
                )}

                {/* Draft */}
                {message.data.type === "draft" && message.data.draft && (
                  <DraftSection data={message.data.draft} />
                )}

                {/* Action Proposals */}
                {message.data.type === "actions" &&
                  message.data.actionProposals && (
                    <ActionsSection data={message.data.actionProposals} />
                  )}
              </div>
            )}
          </div>

          {/* Intent badge for agent messages */}
          {!isUser && message.intent && !isStreaming && (
            <div className="flex items-center gap-2 mt-3 pt-3 border-t border-black/[0.06] dark:border-white/[0.06]">
              <span className="text-xs px-2 py-1 bg-black/[0.04] dark:bg-white/[0.06] text-slate-600 dark:text-slate-400 rounded-full">
                {message.intent.replace(/_/g, " ").toLowerCase()}
              </span>
            </div>
          )}
        </div>

        {/* Footer row: timestamp + action aligned; outside bubble */}
        <div
          className={`mt-2 flex items-center text-xs ${
            isUser
              ? "w-fit max-w-full self-end gap-2"
              : "w-full justify-between"
          }`}
        >
          <div
            className={`${
              isUser ? "text-blue-100" : "text-slate-500 dark:text-slate-400"
            }`}
          >
            <span className="whitespace-nowrap">
              {getRelativeTime(message.timestamp)}
            </span>
            {message.edited && (
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                · edited
              </span>
            )}
            {message.retryOf && (
              <span className="text-slate-400 dark:text-slate-500 ml-2">
                · retry
              </span>
            )}
          </div>

          {isUser ? (
            isLastUserMessage && (
              <button
                type="button"
                aria-label={
                  isLoading
                    ? "Editing disabled while response is streaming"
                    : "Edit message"
                }
                onClick={startEdit}
                disabled={editingDisabled || isEditing}
                className={`p-1 rounded text-slate-500 bg-black/[0.04] dark:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 ${
                  isLoading
                    ? "opacity-40 cursor-not-allowed"
                    : "opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-events-none group-hover:pointer-events-auto focus:pointer-events-auto"
                }`}
              >
                <Edit2 className="w-4 h-4" />
              </button>
            )
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label={copied ? "Copied" : "Copy assistant message"}
                onClick={handleCopy}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleCopy();
                  }
                }}
                disabled={!canCopy}
                className={`p-1 rounded text-slate-500 bg-black/[0.04] dark:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 ${
                  !canCopy
                    ? "opacity-40 cursor-not-allowed"
                    : "opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-events-none group-hover:pointer-events-auto focus:pointer-events-auto"
                }`}
              >
                {copied ? (
                  <Check className="w-4 h-4 text-green-600" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
                <span className="sr-only" aria-live="polite">
                  {copied ? "Copied" : ""}
                </span>
              </button>

              <RetryButton message={message} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Retry button component for assistant messages
function RetryButton({ message }: { message: AgentMessageType }) {
  const { activeSession } = useAgentSessions();
  const { startAgentStream, isLoading } = useAgentState();

  const isStreaming = message.status === "sending";
  const disabled = isLoading || isStreaming;

  const handleRetry = () => {
    if (disabled) return;
    if (!activeSession) return;

    // Find the user message that this assistant message responds to (search backwards)
    const msgs = activeSession.messages || [];
    const idx = msgs.findIndex((m) => m.id === message.id);
    if (idx === -1) return;
    let userMsg: AgentMessageType | null = null;
    for (let i = idx - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        userMsg = msgs[i];
        break;
      }
    }

    if (!userMsg) {
      // No corresponding user message found
      window.alert("Unable to retry: original user message not found.");
      return;
    }

    // Start a new stream using the found user message content
    startAgentStream?.(userMsg.content, {
      retryOf: message.id,
      sourceUserId: userMsg.id,
      followUpIntent: userMsg.followUpIntent,
      replaceMessageId: message.id,
    });
  };

  return (
    <button
      type="button"
      aria-label={
        disabled ? "Retry disabled while streaming" : "Retry response"
      }
      onClick={handleRetry}
      disabled={disabled}
      className={`p-1 rounded text-slate-500 bg-black/[0.04] dark:bg-white/[0.05] focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-slate-300 ${
        disabled
          ? "opacity-40 cursor-not-allowed"
          : "opacity-0 group-hover:opacity-100 focus:opacity-100 pointer-events-none group-hover:pointer-events-auto focus:pointer-events-auto"
      }`}
    >
      <RotateCw className="w-4 h-4" />
    </button>
  );
}

// Explanation Section Component
function ExplanationSection({ data }: { data: ExplanationOutput }) {
  return (
    <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] agent-animate-scaffold">
      <div className="flex items-center gap-2 mb-3 agent-animate-item agent-animate-item-delay-1">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          {data.title || "Explanation"}
        </span>
      </div>
      <div className="p-4 bg-[#f9fafb] dark:bg-[#0f172a] rounded-xl border border-black/[0.06] dark:border-white/[0.06] agent-animate-item agent-animate-item-delay-2">
        <p className="text-sm text-[#0f172a] dark:text-[#f1f5f9] mb-3">
          {data.summary}
        </p>
        {data.details && data.details.length > 0 && (
          <ul className="space-y-2">
            {data.details.map((detail: string, idx: number) => (
              <li
                key={idx}
                className={`text-xs text-slate-600 dark:text-slate-400 pl-4 relative before:content-['•'] before:absolute before:left-0 agent-animate-item agent-animate-item-delay-${Math.min(idx + 3, 8)}`}
              >
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// Risk Section Component
function RiskSection({ data }: { data: RiskAnalysisOutput }) {
  const severityColors: Record<string, string> = {
    CRITICAL:
      "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    HIGH: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
    MEDIUM:
      "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
    LOW: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800",
  };

  return (
    <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] agent-animate-scaffold">
      <div className="flex items-center justify-between mb-3 agent-animate-item agent-animate-item-delay-1">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-orange-500" />
          <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
            Risk Analysis
          </span>
        </div>
        <span
          className={`px-2 py-1 text-xs font-medium rounded-full border ${
            severityColors[data.overallRiskLevel] || severityColors.LOW
          }`}
        >
          {data.overallRiskLevel}
        </span>
      </div>
      <div className="space-y-3">
        {data.risks?.map((risk: RiskItem, idx: number) => (
          <div
            key={idx}
            className={`p-4 bg-[#f9fafb] dark:bg-[#0f172a] rounded-xl border border-black/[0.06] dark:border-white/[0.06] agent-animate-item agent-animate-item-delay-${Math.min(idx + 2, 8)}`}
          >
            <div className="flex items-start justify-between mb-2">
              <h4 className="text-sm font-semibold text-[#0f172a] dark:text-[#f1f5f9]">
                {risk.category}
              </h4>
              <span
                className={`px-2 py-1 text-xs font-medium rounded-full border ${
                  severityColors[risk.severity] || severityColors.LOW
                }`}
              >
                {risk.severity}
              </span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mb-2">
              {risk.description}
            </p>
            {risk.recommendation && (
              <p className="text-xs text-blue-600 dark:text-blue-400">
                Recommendation: {risk.recommendation}
              </p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// Draft Section Component
function DraftSection({ data }: { data: DraftOutput }) {
  return (
    <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] agent-animate-scaffold">
      <div className="flex items-center gap-2 mb-3 agent-animate-item agent-animate-item-delay-1">
        <FileText className="w-4 h-4 text-blue-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Draft: {data.type?.replace("_", " ")}
        </span>
      </div>
      <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200 dark:border-blue-800 agent-animate-item agent-animate-item-delay-2">
        {data.sections?.subject && (
          <div className="mb-3 agent-animate-item agent-animate-item-delay-3">
            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
              Subject:
            </span>
            <p className="text-sm font-medium text-[#0f172a] dark:text-[#f1f5f9]">
              {data.sections.subject}
            </p>
          </div>
        )}
        {data.sections?.greeting && (
          <p className="text-sm text-slate-700 dark:text-slate-300 mb-2 agent-animate-item agent-animate-item-delay-4">
            {data.sections.greeting}
          </p>
        )}
        <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap agent-animate-item agent-animate-item-delay-5">
          {data.sections?.body}
        </p>
        {data.sections?.closing && (
          <p className="text-sm text-slate-700 dark:text-slate-300 mt-2 agent-animate-item agent-animate-item-delay-6">
            {data.sections.closing}
          </p>
        )}
        {data.sections?.signature && (
          <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 italic agent-animate-item agent-animate-item-delay-7">
            {data.sections.signature}
          </p>
        )}
        <div className="flex gap-2 mt-4 agent-animate-item agent-animate-item-delay-8">
          <button
            type="button"
            className="flex-1 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors"
          >
            Copy Draft
          </button>
          <button
            type="button"
            className="px-4 py-2 bg-white dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-black/[0.03] dark:hover:bg-white/[0.08] transition-colors border border-black/[0.06] dark:border-white/[0.06]"
          >
            Edit
          </button>
        </div>
      </div>
    </div>
  );
}

// Actions Section Component
function ActionsSection({ data }: { data: ActionProposal[] }) {
  return (
    <div className="pt-3 border-t border-black/[0.06] dark:border-white/[0.06] agent-animate-scaffold">
      <div className="flex items-center gap-2 mb-3 agent-animate-item agent-animate-item-delay-1">
        <ListTodo className="w-4 h-4 text-green-500" />
        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
          Proposed Actions ({data.length})
        </span>
      </div>
      <div className="space-y-2">
        {data.map((action: ActionProposal, idx: number) => (
          <div
            key={idx}
            className={`p-3 bg-[#f9fafb] dark:bg-[#0f172a] rounded-lg border border-black/[0.06] dark:border-white/[0.06] flex items-center justify-between agent-animate-item agent-animate-item-delay-${Math.min(idx + 2, 8)}`}
          >
            <div>
              <p className="text-sm font-medium text-[#0f172a] dark:text-[#f1f5f9]">
                {action.action}
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {action.description}
              </p>
            </div>
            {action.requiresConfirmation && (
              <button
                type="button"
                className="px-3 py-1.5 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 transition-colors"
              >
                Approve
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
