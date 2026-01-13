import { useState } from "react";
import PageLayout from "../components/layout/PageLayout";
import PageHeader from "../components/layout/PageHeader";
import ContentSection from "../components/layout/ContentSection";

const suggestionPrompts = [
  "Summarize current dossier",
  "Prepare a document",
  "Review what needs attention",
];

const mockMessages = [
  {
    id: "m1",
    sender: "user",
    text: "Outline the hearings and build a concise report.",
  },
  {
    id: "m2",
    sender: "agent",
    text: "Draft prepared: Hearing report (6 sessions)",
    action: { label: "View draft", type: "draft" },
  },
  {
    id: "m3",
    sender: "agent",
    text: "Review ready: 3 items need your attention",
    action: { label: "Open review", type: "review" },
  },
];

const mockDraftResult = {
  title: "Draft - Hearing Report",
  badge: "Draft - Requires review",
  sections: {
    header:
      "Case: State vs. Northwind Logistics\nPeriod: May-August 2026\nLead counsel: J. Moreau",
    body:
      "6 hearings summarised with date, presiding judge, key motions, and outcome per session.\nRisks: session 4 exhibits not yet filed; session 5 witness availability unconfirmed.",
    footer:
      "Next: confirm exhibits for session 4; validate witness list; schedule internal review before filing.",
  },
};

const mockReviewItems = [
  {
    id: "r1",
    title: "Overdue task",
    description: "Session 4 evidence set pending filing; due 2 days ago.",
    actionLabel: "View tasks",
  },
  {
    id: "r2",
    title: "Missing document",
    description: "Hearing bundle lacks the expert letter referenced in session 5.",
    actionLabel: "Locate document",
  },
  {
    id: "r3",
    title: "Session preparation gap",
    description: "No briefing assigned for session 6; assign lead and agenda.",
    actionLabel: "Open session prep",
  },
];

export default function ChatBot() {
  const [messages, setMessages] = useState(mockMessages);
  const [inputValue, setInputValue] = useState("");
  const [resultVisible, setResultVisible] = useState(false);
  const [activeResultType, setActiveResultType] = useState(null);
  const [transparencyOpen, setTransparencyOpen] = useState(false);

  const handleSendMessage = (messageText) => {
    const trimmed = messageText.trim();
    if (!trimmed) return;

    setMessages((prev) => [
      ...prev,
      { id: `u-${Date.now()}`, sender: "user", text: trimmed },
      {
        id: `a-${Date.now()}`,
        sender: "agent",
        text: "Request noted. I will place outputs in the Result Panel when ready.",
      },
    ]);

    setInputValue("");
  };

  const handleSuggestion = (prompt) => {
    setInputValue(prompt);
  };

  const handleOpenResult = (type) => {
    setActiveResultType(type);
    setResultVisible(true);
    setTransparencyOpen(false);
  };

  const handleCloseResult = () => {
    setResultVisible(false);
    setActiveResultType(null);
  };

  return (
    <PageLayout>
      <PageHeader
        title="Organia Agent"
        subtitle="Ask Organia to explain, prepare, or review your work"
        icon="fas fa-comments"
      />

      <ContentSection>
        <div className="p-6">
          <div
            className={`grid grid-cols-1 ${
              resultVisible ? "lg:grid-cols-3" : "lg:grid-cols-1"
            } gap-6`}
          >
            <div className={resultVisible ? "lg:col-span-2" : "lg:col-span-1"}>
              <ChatArea
                messages={messages}
                inputValue={inputValue}
                onInputChange={setInputValue}
                onSend={handleSendMessage}
                onSuggestion={handleSuggestion}
                onOpenResult={handleOpenResult}
              />
            </div>

            {resultVisible && (
              <div className="lg:col-span-1">
                <ResultPanel
                  type={activeResultType}
                  draft={mockDraftResult}
                  reviewItems={mockReviewItems}
                  onClose={handleCloseResult}
                  transparencyOpen={transparencyOpen}
                  onToggleTransparency={() =>
                    setTransparencyOpen((prev) => !prev)
                  }
                />
              </div>
            )}
          </div>
        </div>
      </ContentSection>
    </PageLayout>
  );
}

function ChatArea({
  messages,
  inputValue,
  onInputChange,
  onSend,
  onSuggestion,
  onOpenResult,
}) {
  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-[70vh]">
      <div className="flex-1 space-y-3 mb-4">
        {hasMessages ? (
          messages.map((message) => (
            <MessageCard
              key={message.id}
              message={message}
              onOpenResult={onOpenResult}
            />
          ))
        ) : (
          <EmptyState onSuggestion={onSuggestion} />
        )}
      </div>

      <ChatInput
        value={inputValue}
        onChange={onInputChange}
        onSubmit={() => onSend(inputValue)}
      />
    </div>
  );
}

function MessageCard({ message, onOpenResult }) {
  const isUser = message.sender === "user";

  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
      <div className="px-4 py-2 border-b border-slate-200 dark:border-slate-700 flex items-center gap-2">
        <span
          className={`px-2 py-1 text-xs font-semibold rounded-md ${
            isUser
              ? "bg-blue-50 text-blue-800 dark:bg-blue-900/40 dark:text-blue-100"
              : "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100"
          }`}
        >
          {isUser ? "You" : "Agent"}
        </span>
        {!isUser && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Structured response
          </span>
        )}
      </div>

      <div className="px-4 py-3 flex items-start justify-between gap-3">
        <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">
          {message.text}
        </p>

        {message.action && (
          <button
            type="button"
            onClick={() => onOpenResult(message.action.type)}
            className="shrink-0 px-3 py-2 text-sm font-medium text-blue-800 border border-blue-200 rounded-md hover:bg-blue-50 transition-colors dark:text-blue-100 dark:border-blue-800 dark:hover:bg-blue-900/30"
          >
            {message.action.label}
          </button>
        )}
      </div>
    </div>
  );
}

function EmptyState({ onSuggestion }) {
  return (
    <div className="border border-dashed border-slate-300 dark:border-slate-700 rounded-lg p-6 text-center bg-slate-50 dark:bg-slate-800/60">
      <p className="text-sm text-slate-700 dark:text-slate-200">
        Tell the agent what you need. Results will appear in the panel.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {suggestionPrompts.map((prompt) => (
          <button
            key={prompt}
            type="button"
            onClick={() => onSuggestion(prompt)}
            className="px-4 py-2 text-sm border border-slate-300 rounded-full bg-white hover:border-slate-400 transition-colors dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:hover:border-slate-500"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatInput({ value, onChange, onSubmit }) {
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm"
    >
      <div className="p-3">
        <textarea
          rows={3}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className="w-full resize-none border border-slate-200 dark:border-slate-700 rounded-md p-3 text-sm text-slate-800 dark:text-slate-100 dark:bg-slate-900 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-200 dark:focus:ring-blue-900 focus:border-blue-300 dark:focus:border-blue-800"
          placeholder="e.g. Write a report of all hearings in this dossier"
        />
      </div>
      <div className="px-3 pb-3 flex items-center justify-between">
        <span className="text-xs text-slate-500 dark:text-slate-400">
          Actions stay manual. The agent only prepares outputs.
        </span>
        <button
          type="submit"
          className="px-4 py-2 text-sm font-semibold text-white bg-blue-700 rounded-md hover:bg-blue-800 transition-colors dark:bg-blue-600 dark:hover:bg-blue-700"
        >
          Send
        </button>
      </div>
    </form>
  );
}

function ResultPanel({
  type,
  draft,
  reviewItems,
  onClose,
  transparencyOpen,
  onToggleTransparency,
}) {
  const isDraft = type === "draft";
  const isReview = type === "review";

  return (
    <div className="h-full flex flex-col border border-slate-200 dark:border-slate-700 rounded-lg bg-white dark:bg-slate-800 shadow-sm">
      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Result Panel
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {isDraft && "Showing draft output"}
            {isReview && "Showing review findings"}
            {!isDraft && !isReview && "Waiting for selection"}
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="text-sm text-slate-600 dark:text-slate-200 border border-slate-300 dark:border-slate-600 rounded-md px-3 py-1.5 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
        >
          Hide
        </button>
      </div>

      <div className="p-4 flex-1 overflow-y-auto">
        {isDraft && <DraftResult draft={draft} />}
        {isReview && <ReviewResult items={reviewItems} />}
        {!isDraft && !isReview && (
          <div className="text-sm text-slate-600 dark:text-slate-300">
            Select "View draft" or "Open review" from the chat to populate this
            panel.
          </div>
        )}
      </div>

      <TransparencyNotice
        open={transparencyOpen}
        onToggle={onToggleTransparency}
      />
    </div>
  );
}

function DraftResult({ draft }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {draft.title}
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-300">
            Structured draft ready for review
          </p>
        </div>
        <span className="text-xs px-3 py-1 rounded-full bg-amber-100 text-amber-800 border border-amber-200 dark:bg-amber-900/40 dark:text-amber-100 dark:border-amber-800">
          {draft.badge}
        </span>
      </div>

      <div className="space-y-3">
        <SectionCard title="Header" content={draft.sections.header} />
        <SectionCard title="Body" content={draft.sections.body} />
        <SectionCard title="Footer" content={draft.sections.footer} />
      </div>

      <div className="flex flex-wrap gap-2 pt-1">
        {["Save as document", "Attach to dossier", "Create task from draft", "Copy text"].map(
          (label) => (
            <button
              key={label}
              type="button"
              className="px-3 py-2 text-sm border border-slate-300 rounded-md text-slate-800 hover:bg-slate-50 transition-colors dark:text-slate-100 dark:border-slate-700 dark:hover:bg-slate-700/60"
            >
              {label}
            </button>
          )
        )}
      </div>
    </div>
  );
}

function ReviewResult({ items }) {
  return (
    <div className="space-y-3">
      {items.map((item) => (
        <div
          key={item.id}
          className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-slate-50 dark:bg-slate-900"
        >
          <div className="flex items-start gap-3">
            <div className="mt-1 text-slate-500 dark:text-slate-400">
              <i className="fas fa-clipboard-list"></i>
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {item.title}
              </p>
              <p className="text-sm text-slate-700 dark:text-slate-200">
                {item.description}
              </p>
              <button
                type="button"
                className="text-sm text-blue-800 font-medium hover:underline dark:text-blue-200"
              >
                {item.actionLabel}
              </button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionCard({ title, content }) {
  return (
    <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-3 bg-white dark:bg-slate-900">
      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-1">
        {title}
      </p>
      <p className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-line">
        {content}
      </p>
    </div>
  );
}

function TransparencyNotice({ open, onToggle }) {
  return (
    <div className="border-t border-slate-200 dark:border-slate-700 px-4 py-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-xs font-semibold text-slate-700 dark:text-slate-200 hover:underline"
      >
        Why am I seeing this?
      </button>
      {open && (
        <div className="mt-2 text-xs text-slate-600 dark:text-slate-300 space-y-1">
          <p>Based on your current dossier.</p>
          <p>No automatic actions were taken.</p>
        </div>
      )}
    </div>
  );
}
