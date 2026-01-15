interface AgentInputProps {
  input: string;
  setInput: (value: string) => void;
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
  onSubmit: (e: React.FormEvent) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

export function AgentInput({
  input,
  setInput,
  inputRef,
  onSubmit,
  onKeyDown,
}: AgentInputProps) {
  return (
    <div className="flex-shrink-0 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
      <div className="max-w-4xl mx-auto px-6 py-4">
        <form onSubmit={onSubmit}>
          <div className="relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={onKeyDown}
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
  );
}
