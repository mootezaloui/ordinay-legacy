import { useState, useRef, useEffect } from "react";
import { Edit2, FileText, Image, Paperclip } from "lucide-react";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { AgentMessage, MessageAttachment } from "../types/agentMessage";
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
export function UserCommand({ message, getRelativeTime, isLastUserMessage = false }: UserCommandProps) {
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
        const ipcResponse = await window.electronAPI!.apiRequest('POST', '/agent/edit', {
          message: editContent.trim(),
          sessionId: activeSessionId,
          userId: 'default', // TODO: Get from auth context
        });

        // IPC response format: { status: 200, data: { status: 'ok', ... } }
        if (ipcResponse.status !== 200 || ipcResponse.data?.status !== 'ok') {
          console.error('[Edit] Failed to edit message:', ipcResponse);
          // TODO: Show error to user
          return;
        }

        result = ipcResponse.data;
      } else {
        // Use HTTP transport
        const apiBase = getApiBase();
        const response = await fetch(`${apiBase}/agent/edit`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: editContent.trim(),
            sessionId: activeSessionId,
            userId: 'default', // TODO: Get from auth context
          }),
        });

        if (!response.ok) {
          const error = await response.json();
          console.error('[Edit] Failed to edit message:', error);
          // TODO: Show error to user
          return;
        }

        result = await response.json();
      }

      console.log('[Edit] Message edited successfully:', result);

      setIsEditing(false);

      // Trigger new agent stream with edited message
      // editedMessageId triggers automatic removal of ALL assistant messages after it
      await startAgentStream(editContent.trim(), {
        sessionId: activeSessionId,
        editedMessageId: message.id
      });
    } catch (err) {
      console.error('[Edit] Error editing message:', err);
      // TODO: Show error to user
    }
  };

  if (isEditing) {
    return (
      <div className="py-3 user-message-row">
        <div className="w-full max-w-[44rem]">
          <textarea
            aria-label="Edit your message"
            className="w-full min-h-[4rem] p-4 rounded-2xl border border-slate-200/80 dark:border-slate-700/70 bg-white/90 dark:bg-slate-900/70 text-sm text-slate-900 dark:text-white resize-vertical focus:outline-none focus:border-slate-400 focus:ring-2 focus:ring-slate-400/20"
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            autoFocus
          />
          <div className="flex gap-2 mt-2 justify-end">
            <button
              type="button"
              className="px-3 py-1.5 bg-slate-900 text-white text-xs font-medium rounded-full hover:bg-slate-800 transition-colors"
              onClick={saveEdit}
            >
              Save
            </button>
            <button
              type="button"
              className="px-3 py-1.5 bg-white/80 dark:bg-slate-800/70 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-full hover:bg-slate-50 dark:hover:bg-slate-700 border border-slate-200/80 dark:border-slate-600 transition-colors"
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
    <div className="user-message-row">
      <div className="group max-w-full">
        <div className="user-bubble agent-chat-text text-[15px] leading-relaxed">
          {/* Attachment previews */}
          {message.attachments && message.attachments.length > 0 && (
            <MessageAttachments attachments={message.attachments} />
          )}
          {message.content && <span>{message.content}</span>}
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          {message.edited && <span>(edited)</span>}
          <span>{getRelativeTime(message.timestamp)}</span>
          {isLastUserMessage && (
            <button
              type="button"
              aria-label={isLoading ? "Editing disabled while loading" : "Edit command"}
              onClick={startEdit}
              disabled={editingDisabled}
              className={`p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors ${
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

// ---------------------------------------------------------------------------
// Attachment rendering helpers
// ---------------------------------------------------------------------------

function getAttachmentIcon(type: string) {
  switch (type) {
    case "image":
      return <Image className="w-4 h-4" />;
    case "document":
      return <FileText className="w-4 h-4" />;
    default:
      return <Paperclip className="w-4 h-4" />;
  }
}

function formatFileSize(bytes?: number) {
  if (!bytes) return "";
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

/**
 * Renders message attachments inline: images as thumbnails, files as cards.
 * Mirrors the visual style from AgentInput's attachment preview.
 */
function MessageAttachments({
  attachments,
}: {
  attachments: MessageAttachment[];
}) {
  const [expandedImage, setExpandedImage] = useState<string | null>(null);

  return (
    <>
      <div className="flex flex-wrap gap-2 mb-2">
        {attachments.map((att) => (
          <div key={att.id}>
            {att.type === "image" && att.preview ? (
              <button
                type="button"
                className="block rounded-xl overflow-hidden border border-transparent hover:opacity-80 transition-opacity focus:outline-none"
                onClick={() => setExpandedImage(att.preview!)}
                aria-label={`View ${att.name}`}
              >
                <img
                  src={att.preview}
                  alt={att.name}
                  className="max-w-[240px] max-h-[180px] object-cover rounded-xl"
                />
              </button>
            ) : (
              <div className="flex items-center gap-2 px-3 py-2 bg-current/10 border border-current/20 rounded-xl user-attachment-card">
                <div className="opacity-70">{getAttachmentIcon(att.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-medium truncate max-w-[180px]">
                    {att.name}
                  </div>
                  {att.size != null && att.size > 0 && (
                    <div className="text-[11px] opacity-60">
                      {formatFileSize(att.size)}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox for expanded image */}
      {expandedImage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={() => setExpandedImage(null)}
          onKeyDown={(e) => e.key === "Escape" && setExpandedImage(null)}
          role="dialog"
          aria-label="Image preview"
        >
          <img
            src={expandedImage}
            alt="Expanded preview"
            className="max-w-[90vw] max-h-[85vh] object-contain rounded-2xl shadow-2xl"
          />
        </div>
      )}
    </>
  );
}
