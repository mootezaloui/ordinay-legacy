import { AgentMessage as AgentMessageType } from "../types/agentMessage";
import { DraftCard } from "../cards/DraftCard";
import { ReviewCard } from "../cards/ReviewCard";
import { ExplanationCard } from "../cards/ExplanationCard";

interface AgentMessageProps {
  message: AgentMessageType;
  getRelativeTime: (timestamp: Date) => string;
}

export function AgentMessage({ message, getRelativeTime }: AgentMessageProps) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] ${
          isUser
            ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg"
            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm"
        } rounded-2xl px-6 py-4`}
      >
        <p className="text-sm leading-relaxed mb-2">{message.content}</p>

        {!isUser && message.data && (
          <div className="mt-4">
            {message.data.type === "analysis" && (
              <ReviewCard data={message.data as any} />
            )}
            {message.data.type === "report" && (
              <DraftCard data={message.data as any} />
            )}
            {message.data.type === "explanation" && (
              <ExplanationCard data={message.data as any} />
            )}
          </div>
        )}

        <div
          className={`text-xs mt-2 ${
            isUser ? "text-blue-100" : "text-slate-500 dark:text-slate-400"
          }`}
        >
          {getRelativeTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}
