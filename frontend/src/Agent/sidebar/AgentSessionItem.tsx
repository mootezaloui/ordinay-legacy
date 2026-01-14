import { useState } from "react";
import { MessageSquare, MoreVertical, Edit2, Trash2 } from "lucide-react";
import { AgentSession } from "../types/agentSession";

interface AgentSessionItemProps {
  session: AgentSession;
  active: boolean;
  onClick: () => void;
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentSessionItem({
  session,
  active,
  onClick,
  getRelativeTime,
}: AgentSessionItemProps) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onClick}
      className={`group relative p-3 rounded-lg cursor-pointer transition-all ${
        active
          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
          : "hover:bg-slate-50 dark:hover:bg-slate-800"
      }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MessageSquare
            className={`w-3.5 h-3.5 flex-shrink-0 ${
              active ? "text-blue-600 dark:text-blue-400" : "text-slate-400"
            }`}
          />
          <h4
            className={`text-sm font-medium truncate ${
              active
                ? "text-blue-900 dark:text-blue-100"
                : "text-slate-900 dark:text-white"
            }`}
          >
            {session.title}
          </h4>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowMenu(!showMenu);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-200 dark:hover:bg-slate-700 rounded transition-all"
        >
          <MoreVertical className="w-3.5 h-3.5 text-slate-400" />
        </button>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 truncate mb-1">
        {session.lastMessage || "No messages yet"}
      </p>
      <div className="flex items-center justify-between text-xs text-slate-400">
        <span>{session.messageCount} messages</span>
        <span>{getRelativeTime(session.timestamp)}</span>
      </div>

      {showMenu && (
        <div className="absolute right-2 top-12 z-10 w-40 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-lg py-1">
          <button className="w-full px-3 py-2 text-left text-xs text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 flex items-center gap-2">
            <Edit2 className="w-3 h-3" />
            Rename
          </button>
          <button className="w-full px-3 py-2 text-left text-xs text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 flex items-center gap-2">
            <Trash2 className="w-3 h-3" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
