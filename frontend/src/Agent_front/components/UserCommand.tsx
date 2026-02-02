import { useState, useRef, useEffect } from "react";
import { Edit2, CornerDownRight } from "lucide-react";
import { useAgentSessions } from "../hooks/useAgentSessions";
import { useAgentState } from "../hooks/useAgentState";
import { AgentMessage } from "../types/agentMessage";

interface UserCommandProps {
  message: AgentMessage;
  getRelativeTime: (timestamp: Date) => string;
}

/**
 * Renders a user message as a compact command line, not a chat bubble.
 * Left-aligned, muted — it's a label for the result below it,
 * not one side of a conversation.
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
      <div className="py-2">
        <textarea
          aria-label="Edit your message"
          className="w-full min-h-[3rem] p-3 rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white resize-vertical focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/30"
          value={editContent}
          onChange={(e) => setEditContent(e.target.value)}
          autoFocus
        />
        <div className="flex gap-2 mt-2">
          <button
            type="button"
            className="px-3 py-1.5 bg-blue-600 text-white text-xs font-medium rounded hover:bg-blue-700 transition-colors"
            onClick={saveEdit}
          >
            Save
          </button>
          <button
            type="button"
            className="px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600 transition-colors"
            onClick={cancelEdit}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="group flex items-start gap-2 py-2">
      <CornerDownRight className="w-3.5 h-3.5 text-slate-300 dark:text-slate-600 mt-0.5 flex-shrink-0" />
      <div className="flex-1 min-w-0">
        <span className="text-sm text-slate-500 dark:text-slate-400">
          {message.content}
        </span>
        {message.edited && (
          <span className="text-xs text-slate-300 dark:text-slate-600 ml-2">
            (edited)
          </span>
        )}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <span className="text-xs text-slate-300 dark:text-slate-600">
          {getRelativeTime(message.timestamp)}
        </span>
        <button
          type="button"
          aria-label={editingDisabled ? "Editing disabled" : "Edit command"}
          onClick={startEdit}
          disabled={editingDisabled}
          className={`p-1 rounded text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors ${
            editingDisabled
              ? "opacity-30 cursor-not-allowed"
              : "opacity-0 group-hover:opacity-100"
          }`}
        >
          <Edit2 className="w-3 h-3" />
        </button>
      </div>
    </div>
  );
}
