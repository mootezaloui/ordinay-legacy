import { useState, useRef, useEffect } from "react";
import { Edit2 } from "lucide-react";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { AgentMessage } from "../types/agentMessage";

interface UserCommandProps {
  message: AgentMessage;
  getRelativeTime: (timestamp: Date) => string;
}

/**
 * Renders a user message as a right-aligned chat bubble.
 * Clear, confident, and visually dominant in the flow.
 */
export function UserCommand({ message, getRelativeTime }: UserCommandProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(message.content || "");
  const originalContentRef = useRef(message.content || "");

  const { updateSessionMessages, activeSession, activeSessionId } =
    useAgentSessions();
  const { isLoading } = useAgentState();
  const editingDisabled = isLoading;

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

  const saveEdit = () => {
    if (!activeSessionId || !activeSession) return;
    if (editContent === originalContentRef.current) {
      setIsEditing(false);
      return;
    }
    const updatedMessages = activeSession.messages.map((m) =>
      m.id === message.id ? { ...m, content: editContent, edited: true } : m
    );
    updateSessionMessages(activeSessionId, updatedMessages);
    setIsEditing(false);
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
          {message.content}
        </div>
        <div className="mt-2 flex items-center justify-end gap-2 text-[11px] text-slate-400 dark:text-slate-500">
          {message.edited && <span>(edited)</span>}
          <span>{getRelativeTime(message.timestamp)}</span>
          <button
            type="button"
            aria-label={editingDisabled ? "Editing disabled" : "Edit command"}
            onClick={startEdit}
            disabled={editingDisabled}
            className={`p-1 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 transition-colors ${
              editingDisabled
                ? "opacity-30 cursor-not-allowed"
                : "opacity-0 group-hover:opacity-100"
            }`}
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
