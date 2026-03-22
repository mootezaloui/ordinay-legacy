import { useState, useRef, useEffect } from "react";
import { Edit2 } from "lucide-react";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { AgentMessage } from "../types/agentMessage";
import { ChatMessageAttachments } from "./messages/ChatMessageAttachments";
import { getApiBase, isElectron, getBackendConfig } from "../../lib/apiConfig";

interface UserCommandProps {
  message: AgentMessage;
  getRelativeTime: (timestamp: Date) => string;
  isLastUserMessage?: boolean;
}

/**
 * Renders a user message as a right-aligned chat bubble.
 * Clear, confident, and visually dominant in the flow.
 */
export function UserCommand({
  message,
  getRelativeTime,
  isLastUserMessage = false,
}: UserCommandProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const originalContentRef = useRef(message.content || "");

  const { updateSessionMessages, activeSession, activeSessionId } =
    useAgentSessions();
  const { isLoading, startAgentStream } = useAgentState();
  const editingDisabled = isLoading || !isLastUserMessage;

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

  if (isEditing) {
    return (
      <div className="py-3 user-message-row w-full">
        <div className="w-full max-w-[70%]">
          <textarea
            aria-label="Edit your message"
            className="w-full min-h-[4rem] p-4 rounded-2xl border border-black/[0.06] dark:border-white/[0.06] bg-white/90 dark:bg-[#0f172a]/70 text-sm text-[#0f172a] dark:text-[#f1f5f9] resize-vertical focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              type="button"
              className="px-3 py-1.5 bg-[#0f172a] text-white text-xs font-medium rounded-full hover:bg-[#334155] transition-colors"
              onClick={saveEdit}
            >
              Save
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-white/80 dark:bg-white/[0.06] text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-black/[0.03] dark:hover:bg-white/[0.08] border border-black/[0.06] dark:border-white/[0.06] transition-colors"
              onClick={cancelEdit}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-message-row w-full user-message-enter">
      <div className="user-message-wrapper group w-full max-w-[70%]">
        <div className="user-bubble agent-chat-text w-fit max-w-full break-words text-[15px] leading-relaxed">
          {/* Attachment previews */}
          {message.attachments && message.attachments.length > 0 && (
            <ChatMessageAttachments
              attachments={message.attachments}
              variant="user"
            />
          )}
          {message.content && <span>{message.content}</span>}
        </div>
        <div className="mt-2 flex w-fit max-w-full items-center gap-2 self-end text-[11px] text-slate-400 dark:text-slate-500">
          {message.edited && <span>(edited)</span>}
          <span className="whitespace-nowrap">
            {getRelativeTime(message.timestamp)}
          </span>
          {isLastUserMessage && (
            <button
              type="button"
              aria-label={
                isLoading ? "Editing disabled while loading" : "Edit command"
              }
              onClick={startEdit}
              disabled={editingDisabled}
              className={`p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/70 dark:hover:bg-white/[0.05] transition-colors ${
                isLoading
                  ? "opacity-30 cursor-not-allowed"
                  : "opacity-0 group-hover:opacity-100"
              }`}
            >
              <Edit2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
