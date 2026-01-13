import { useState, useRef, useEffect } from "react";
import {
  Sparkles,
  FolderOpen,
  Users,
  CheckSquare,
  Calendar,
  FileText,
  TrendingUp,
  Lightbulb,
  Search,
  Zap,
  Database,
  ArrowRight,
  Download,
  Share2,
  Eye,
  MessageSquare,
  Plus,
  ChevronLeft,
  ChevronRight,
  MoreVertical,
  Trash2,
  Edit2,
} from "lucide-react";
import PageLayout from "../components/layout/PageLayout";

const dataSources = [
  { id: "dossiers", label: "12 Dossiers", icon: FolderOpen, active: true },
  { id: "clients", label: "47 Clients", icon: Users, active: true },
  { id: "tasks", label: "23 Tasks", icon: CheckSquare, active: true },
  { id: "sessions", label: "8 Sessions", icon: Calendar, active: true },
  { id: "documents", label: "156 Documents", icon: FileText, active: true },
];

const capabilities = [
  {
    id: "analysis",
    title: "Analysis & Insights",
    icon: TrendingUp,
    examples: [
      "Which dossiers need urgent attention?",
      "Show me overdue tasks by client",
      "Analyze my workload for next week",
    ],
  },
  {
    id: "reporting",
    title: "Reports & Summaries",
    icon: FileText,
    examples: [
      "Prepare a summary of the Dupont case",
      "Generate monthly activity report",
      "Summarize all hearings in January",
    ],
  },
  {
    id: "planning",
    title: "Planning & Strategy",
    icon: Lightbulb,
    examples: [
      "What should I prioritize today?",
      "Help me plan the upcoming trial",
      "Suggest next steps for stalled cases",
    ],
  },
  {
    id: "search",
    title: "Smart Search",
    icon: Search,
    examples: [
      "Find all documents related to Client X",
      "Show tasks assigned to me this month",
      "Search for precedents in similar cases",
    ],
  },
];

const mockSessions = [
  {
    id: "s1",
    title: "Case Analysis - Dupont",
    lastMessage: "Prepare a summary of the Dupont case",
    timestamp: new Date(Date.now() - 3600000),
    messageCount: 8,
  },
  {
    id: "s2",
    title: "Weekly Planning",
    lastMessage: "What are my priorities this week?",
    timestamp: new Date(Date.now() - 86400000),
    messageCount: 5,
  },
  {
    id: "s3",
    title: "Client Reports",
    lastMessage: "Generate monthly activity report",
    timestamp: new Date(Date.now() - 172800000),
    messageCount: 12,
  },
  {
    id: "s4",
    title: "Task Overview",
    lastMessage: "Show me overdue tasks",
    timestamp: new Date(Date.now() - 259200000),
    messageCount: 3,
  },
];

const mockConversation = [
  {
    id: "1",
    role: "user",
    content: "Which dossiers need urgent attention this week?",
    timestamp: new Date(Date.now() - 300000),
  },
  {
    id: "2",
    role: "agent",
    content:
      "I've analyzed your active dossiers and found 3 that require urgent attention:",
    timestamp: new Date(Date.now() - 240000),
    data: {
      type: "analysis",
      items: [
        {
          title: "Dupont vs. Northwind Logistics",
          status: "Critical",
          reason: "Hearing in 2 days, 3 documents pending",
          dossier_id: "D-2024-001",
        },
        {
          title: "Martin Estate Settlement",
          status: "High",
          reason: "Deadline tomorrow, final review needed",
          dossier_id: "D-2024-015",
        },
        {
          title: "Tech Corp Contract Dispute",
          status: "Medium",
          reason: "Client meeting Friday, prep incomplete",
          dossier_id: "D-2024-008",
        },
      ],
    },
  },
  {
    id: "3",
    role: "user",
    content: "Prepare a summary of the Dupont case",
    timestamp: new Date(Date.now() - 120000),
  },
  {
    id: "4",
    role: "agent",
    content: "I've prepared a comprehensive summary of the Dupont case:",
    timestamp: new Date(Date.now() - 60000),
    data: {
      type: "report",
      title: "Dupont vs. Northwind Logistics - Case Summary",
      sections: [
        { label: "Case Overview", words: 247 },
        { label: "Timeline", words: 156 },
        { label: "Key Arguments", words: 412 },
        { label: "Evidence Summary", words: 289 },
        { label: "Next Steps", words: 134 },
      ],
      totalWords: 1238,
      generated: true,
    },
  },
];

export default function ChatBot() {
  const [input, setInput] = useState("");
  const [conversation, setConversation] = useState(mockConversation);
  const [sessions, setSessions] = useState(mockSessions);
  const [activeSession, setActiveSession] = useState("s1");
  const [showHistorySidebar, setShowHistorySidebar] = useState(true);
  const [showContextSidebar, setShowContextSidebar] = useState(true);
  const inputRef = useRef(null);
  const conversationEndRef = useRef(null);

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversation]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed) return;

    const userMessage = {
      id: `u-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: new Date(),
    };

    const agentMessage = {
      id: `a-${Date.now()}`,
      role: "agent",
      content: "Processing your request...",
      timestamp: new Date(Date.now() + 500),
    };

    setConversation((prev) => [...prev, userMessage, agentMessage]);
    setInput("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleExampleClick = (example) => {
    setInput(example);
    inputRef.current?.focus();
  };

  const handleNewChat = () => {
    const newSession = {
      id: `s-${Date.now()}`,
      title: "New Conversation",
      lastMessage: "",
      timestamp: new Date(),
      messageCount: 0,
    };
    setSessions([newSession, ...sessions]);
    setActiveSession(newSession.id);
    setConversation([]);
    setInput("");
  };

  const getRelativeTime = (timestamp) => {
    const now = new Date();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days < 7) return `${days}d ago`;
    return timestamp.toLocaleDateString();
  };

  return (
    <PageLayout>
      <div className="fixed inset-0 top-[4.5rem] left-20 lg:left-64 z-0 flex min-h-0 overflow-hidden">
        {/* Left Sidebar - Chat History */}
        {showHistorySidebar && (
          <div className="w-72 flex-shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col">
            {/* Header */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <button
                onClick={handleNewChat}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-purple-700 transition-all shadow-lg hover:shadow-xl"
              >
                <Plus className="w-4 h-4" />
                New Conversation
              </button>
            </div>

            {/* Sessions List */}
            <div className="flex-1 overflow-y-auto p-3">
              <div className="space-y-1">
                {sessions.map((session) => (
                  <SessionCard
                    key={session.id}
                    session={session}
                    active={activeSession === session.id}
                    onClick={() => setActiveSession(session.id)}
                    getRelativeTime={getRelativeTime}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Center - Main Conversation */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Top Bar */}
          <div className="h-14 flex-shrink-0 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              {!showHistorySidebar && (
                <button
                  onClick={() => setShowHistorySidebar(true)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ChevronRight className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
              )}
              {showHistorySidebar && (
                <button
                  onClick={() => setShowHistorySidebar(false)}
                  className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                >
                  <ChevronLeft className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                </button>
              )}
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg">
                  <Sparkles className="w-3.5 h-3.5 text-white" />
                </div>
                <span className="text-sm font-semibold text-slate-900 dark:text-white">
                  Organia Intelligence
                </span>
              </div>
            </div>

            <button
              onClick={() => setShowContextSidebar(!showContextSidebar)}
              className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
            >
              <Database className="w-3.5 h-3.5" />
              {showContextSidebar ? "Hide Context" : "Show Context"}
            </button>
          </div>

          {/* Conversation Area */}
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-4xl mx-auto px-6 py-6">
              {/* Welcome State */}
              {conversation.length === 0 && <WelcomeState onExampleClick={handleExampleClick} />}

              {/* Conversation */}
              <div className="space-y-6">
                {conversation.map((message) => (
                  <ConversationMessage
                    key={message.id}
                    message={message}
                    getRelativeTime={getRelativeTime}
                  />
                ))}
                <div ref={conversationEndRef} />
              </div>
            </div>
          </div>

          {/* Input Area */}
          <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <div className="max-w-4xl mx-auto px-6 py-4">
              <form onSubmit={handleSubmit}>
                <div className="relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    rows={3}
                    placeholder="Ask Organia anything about your cases, clients, tasks, or request reports and analysis..."
                    className="w-full resize-none rounded-2xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-3.5 pr-24 text-sm text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10 transition-all"
                  />
                  <button
                    type="submit"
                    disabled={!input.trim()}
                    className="absolute bottom-3 right-3 px-4 py-2 bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-medium rounded-xl hover:from-blue-700 hover:to-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md hover:shadow-lg"
                  >
                    Send
                  </button>
                </div>
              </form>
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 text-center">
                Press Enter to send • Shift + Enter for new line
              </p>
            </div>
          </div>
        </div>

        {/* Right Sidebar - Context Panel */}
        {showContextSidebar && (
          <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-hidden">
            {/* Status Indicator */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 px-3 py-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-xs font-medium text-green-700 dark:text-green-300">
                  Connected to your data
                </span>
              </div>
            </div>

            {/* Data Sources */}
            <div className="p-4 border-b border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2 mb-3">
                <Database className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Data Access
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {dataSources.map((source) => {
                  const IconComponent = source.icon;
                  return (
                    <div
                      key={source.id}
                      className="relative p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                    >
                      <div className="absolute top-2 right-2 w-1.5 h-1.5 bg-green-500 rounded-full"></div>
                      <IconComponent className="w-4 h-4 text-slate-600 dark:text-slate-400 mb-2" />
                      <div className="text-xs font-medium text-slate-900 dark:text-white">
                        {source.label.split(" ")[0]}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400">
                        {source.label.split(" ")[1]}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Capabilities */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-slate-600 dark:text-slate-400" />
                <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wide">
                  Capabilities
                </h3>
              </div>
              <div className="space-y-3">
                {capabilities.map((capability) => {
                  const IconComponent = capability.icon;
                  return (
                    <div
                      key={capability.id}
                      className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-750 transition-colors"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <IconComponent className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
                        <span className="text-xs font-semibold text-slate-900 dark:text-white">
                          {capability.title}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {capability.examples.slice(0, 2).map((example, idx) => (
                          <button
                            key={idx}
                            onClick={() => handleExampleClick(example)}
                            className="block w-full text-left text-xs text-slate-600 dark:text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                          >
                            • {example}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    </PageLayout>
  );
}

/**
 * SessionCard Component
 */
function SessionCard({ session, active, onClick, getRelativeTime }) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div
      onClick={onClick}
      className={`group relative p-3 rounded-lg cursor-pointer transition-all ${active
          ? "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
          : "hover:bg-slate-50 dark:hover:bg-slate-800"
        }`}
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <MessageSquare className={`w-3.5 h-3.5 flex-shrink-0 ${active ? "text-blue-600 dark:text-blue-400" : "text-slate-400"}`} />
          <h4 className={`text-sm font-medium truncate ${active ? "text-blue-900 dark:text-blue-100" : "text-slate-900 dark:text-white"}`}>
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

      {/* Context Menu */}
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

/**
 * WelcomeState Component
 */
function WelcomeState({ onExampleClick }) {
  const examples = [
    {
      category: "Analysis",
      prompt: "What are my top priorities this week?",
      icon: TrendingUp,
    },
    {
      category: "Reporting",
      prompt: "Generate a summary of all active dossiers",
      icon: FileText,
    },
    {
      category: "Planning",
      prompt: "Help me prepare for the upcoming hearing",
      icon: Lightbulb,
    },
    {
      category: "Search",
      prompt: "Find all overdue tasks by client",
      icon: Search,
    },
  ];

  return (
    <div className="py-16">
      <div className="text-center mb-12">
        <div className="inline-flex p-4 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl mb-4 shadow-lg">
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2 className="text-3xl font-bold text-slate-900 dark:text-white mb-3">
          What can I help you with?
        </h2>
        <p className="text-slate-600 dark:text-slate-400 max-w-2xl mx-auto">
          I have access to all your dossiers, clients, tasks, and documents. Ask
          me to analyze your work, prepare reports, or help you plan your next
          steps.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 max-w-3xl mx-auto">
        {examples.map((example, idx) => {
          const IconComponent = example.icon;
          return (
            <button
              key={idx}
              onClick={() => onExampleClick(example.prompt)}
              className="group p-6 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all text-left"
            >
              <div className="flex items-start gap-3">
                <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg group-hover:bg-blue-100 dark:group-hover:bg-blue-900/40 transition-colors">
                  <IconComponent className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-blue-600 dark:text-blue-400 mb-1">
                    {example.category}
                  </div>
                  <div className="text-sm text-slate-900 dark:text-white font-medium">
                    {example.prompt}
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-400 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * ConversationMessage Component
 */
function ConversationMessage({ message, getRelativeTime }) {
  const isUser = message.role === "user";

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] ${isUser
            ? "bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow-lg"
            : "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-sm"
          } rounded-2xl px-6 py-4`}
      >
        {/* Message Content */}
        <p className="text-sm leading-relaxed mb-2">{message.content}</p>

        {/* Data Display */}
        {!isUser && message.data && (
          <div className="mt-4">
            {message.data.type === "analysis" && (
              <AnalysisResult data={message.data} />
            )}
            {message.data.type === "report" && (
              <ReportResult data={message.data} />
            )}
          </div>
        )}

        {/* Timestamp */}
        <div
          className={`text-xs mt-2 ${isUser ? "text-blue-100" : "text-slate-500 dark:text-slate-400"
            }`}
        >
          {getRelativeTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

/**
 * AnalysisResult Component
 */
function AnalysisResult({ data }) {
  const statusColors = {
    Critical: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800",
    High: "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800",
    Medium: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800",
  };

  return (
    <div className="space-y-3 pt-3 border-t border-slate-200 dark:border-slate-700">
      {data.items.map((item, idx) => (
        <div
          key={idx}
          className="p-4 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700"
        >
          <div className="flex items-start justify-between mb-2">
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white">
              {item.title}
            </h4>
            <span
              className={`px-2 py-1 text-xs font-medium rounded-full border ${statusColors[item.status]
                }`}
            >
              {item.status}
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-400 mb-3">
            {item.reason}
          </p>
          <button className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1">
            <Eye className="w-3 h-3" />
            Open dossier
          </button>
        </div>
      ))}
    </div>
  );
}

/**
 * ReportResult Component
 */
function ReportResult({ data }) {
  return (
    <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
      <div className="p-4 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-xl border border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between mb-3">
          <div>
            <h4 className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
              {data.title}
            </h4>
            <p className="text-xs text-slate-600 dark:text-slate-400">
              {data.totalWords} words • {data.sections.length} sections
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300 rounded-full">
            Ready
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {data.sections.map((section, idx) => (
            <div
              key={idx}
              className="px-3 py-2 bg-white dark:bg-slate-800 rounded-lg"
            >
              <div className="text-xs font-medium text-slate-900 dark:text-white">
                {section.label}
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {section.words} words
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 text-white text-xs font-medium rounded-lg hover:bg-blue-700 transition-colors">
            <Eye className="w-3 h-3" />
            View Report
          </button>
          <button className="px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
            <Download className="w-3 h-3" />
          </button>
          <button className="px-4 py-2 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-medium rounded-lg hover:bg-slate-50 dark:hover:bg-slate-600 transition-colors">
            <Share2 className="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>
  );
}
