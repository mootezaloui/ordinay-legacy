/**
 * Agent Control Bar (ZONE A)
 *
 * Phase C.2 - Visual clarity: light, compact, non-distracting
 *
 * Displays:
 * - Current agent version (v1/v2/v3)
 * - Current context scope (GLOBAL/CLIENT/DOSSIER/CASE/SESSION/TASK)
 * - Language indicator
 */

export default function AgentControlBar({
  agentVersion,
  contextScope,
  language,
  onVersionChange,
  onScopeChange,
  onLanguageChange,
}) {
  const versions = ["v1", "v2", "v3"];
  const scopes = ["GLOBAL", "CLIENT", "DOSSIER", "CASE", "SESSION", "TASK"];
  const languages = ["fr", "en", "ar"];

  const versionDescriptions = {
    v1: "Analysis and explanations only",
    v2: "Analysis with draft generation",
    v3: "Full capabilities with confirmation",
  };

  return (
    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4 dark:bg-slate-800 dark:border-slate-700">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Agent Version */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
            Agent Version
          </label>
          <select
            value={agentVersion}
            onChange={(e) => onVersionChange(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-blue-900"
          >
            {versions.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1.5 dark:text-slate-400">
            {versionDescriptions[agentVersion]}
          </div>
        </div>

        {/* Context Scope */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
            Context Scope
          </label>
          <select
            value={contextScope}
            onChange={(e) => onScopeChange(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-blue-900"
          >
            {scopes.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1.5 dark:text-slate-400">
            Analysis scope
          </div>
        </div>

        {/* Language */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 uppercase tracking-wide mb-2 dark:text-slate-300">
            Output Language
          </label>
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            className="w-full bg-white border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-blue-900"
          >
            {languages.map((lang) => (
              <option key={lang} value={lang}>
                {lang.toUpperCase()}
              </option>
            ))}
          </select>
          <div className="text-xs text-gray-500 mt-1.5 dark:text-slate-400">
            Response language
          </div>
        </div>
      </div>
    </div>
  );
}
