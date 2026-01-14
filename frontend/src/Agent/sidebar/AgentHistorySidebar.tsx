import { Plus } from "lucide-react";
import { AgentSession } from "../types/agentSession";
import { AgentSessionItem } from "./AgentSessionItem";

interface AgentHistorySidebarProps {
  sessions: AgentSession[];
  activeSession: string;
  onSessionClick: (sessionId: string) => void;
  onNewChat: () => void;
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentHistorySidebar({
  sessions,
  activeSession,
  onSessionClick,
  onNewChat,
  getRelativeTime,
}: AgentHistorySidebarProps) {
  return (
    <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800">
        <button
          onClick={onNewChat}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
        >
          <Plus className="w-4 h-4" />
          New Conversation
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        <div className="space-y-1">
          {sessions.map((session) => (
            <AgentSessionItem
              key={session.id}
              session={session}
              active={activeSession === session.id}
              onClick={() => onSessionClick(session.id)}
              getRelativeTime={getRelativeTime}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
