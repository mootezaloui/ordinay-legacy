/**
 * Agent Input Panel
 *
 * Phase C.2 - Clear, explicit request submission (NOT chat)
 *
 * Structured input (NOT a chat interface):
 * - Explicit intent selector
 * - Message field
 * - Context scope (read-only, derived from control bar)
 * - Language (read-only, derived from control bar)
 *
 * NO free-form chat, NO slash commands, NO implicit intent detection
 * Maps to AgentRequest contract from Phase C.0
 */

import { useState } from "react";

export default function AgentInputPanel({ onSubmit, contextScope, language }) {
  const [intent, setIntent] = useState("EXPLAIN_ENTITY_STATE");
  const [message, setMessage] = useState("");

  const intents = [
    {
      value: "EXPLAIN_ENTITY_STATE",
      label: "Explain Entity State",
      description: "Get analysis of current entity status",
    },
    {
      value: "SUMMARIZE_SESSION",
      label: "Summarize Session",
      description: "Generate session summary",
    },
    {
      value: "DRAFT_INVITATION",
      label: "Draft Invitation",
      description: "Prepare meeting invitation",
    },
    {
      value: "DRAFT_CLIENT_EMAIL",
      label: "Draft Client Email",
      description: "Prepare client communication",
    },
    {
      value: "ANALYZE_OPERATIONAL_RISKS",
      label: "Analyze Operational Risks",
      description: "Detect operational concerns",
    },
    {
      value: "PROPOSE_ACTIONS",
      label: "Propose Actions",
      description: "Suggest next steps",
    },
  ];

  const selectedIntent = intents.find((i) => i.value === intent);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!message.trim()) {
      return;
    }

    // Build AgentRequest-compatible structure
    const request = {
      userId: 1, // TODO: Get from auth context
      agentVersion: "v1", // TODO: Get from control bar state
      intent,
      contextScope,
      contextRefs: {}, // TODO: Derive from contextScope
      userMessage: message.trim(),
      language,
    };

    onSubmit(request);

    // Clear message after submit
    setMessage("");
  };

  return (
    <div>
      <div className="mb-4">
        <h4 className="text-sm font-semibold text-gray-800 mb-2 dark:text-slate-100">
          Submit Agent Request
        </h4>
        <p className="text-xs text-gray-600 dark:text-slate-400">
          Structured request submission. Select intent and provide context.
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Intent Selector */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
            Intent <span className="text-red-600">*</span>
          </label>
          <select
            value={intent}
            onChange={(e) => setIntent(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-blue-900"
          >
            {intents.map((i) => (
              <option key={i.value} value={i.value}>
                {i.label}
              </option>
            ))}
          </select>
          {selectedIntent && (
            <div className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
              {selectedIntent.description}
            </div>
          )}
        </div>

        {/* Message Field */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
            Request Details <span className="text-red-600">*</span>
          </label>
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Describe what you need. Be specific and explicit..."
            rows={4}
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-blue-900"
          />
          <div className="mt-1.5 text-xs text-gray-500 dark:text-slate-400">
            This is not a chat interface. Provide structured, explicit requests.
          </div>
        </div>

        {/* Read-only Context Info */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
              Context Scope
            </label>
            <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm font-mono text-gray-700 dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
              {contextScope}
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
              Output Language
            </label>
            <div className="px-3 py-2 bg-gray-100 border border-gray-300 rounded-md text-sm font-mono text-gray-700 uppercase dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100">
              {language}
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <div className="flex items-center justify-between pt-2">
          <div className="text-xs text-gray-500 dark:text-slate-400">
            <span className="text-red-600">*</span> Required fields
          </div>
          <button
            type="submit"
            disabled={!message.trim()}
            className={`px-5 py-2.5 rounded-md text-sm font-semibold transition-colors ${
              message.trim()
                ? "bg-blue-600 text-white hover:bg-blue-700 dark:bg-blue-500 dark:hover:bg-blue-600"
                : "bg-gray-300 text-gray-500 cursor-not-allowed dark:bg-slate-700 dark:text-slate-400"
            }`}
          >
            Submit Request
          </button>
        </div>
      </form>
    </div>
  );
}
