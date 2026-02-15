import { Search, Globe, ExternalLink, Clock } from "lucide-react";
import type {
  WebSearchResultsOutput,
  WebDeepSearchResultsOutput,
} from "../../../services/api/agent";
import { useState } from "react";

interface WebSearchResultsArtifactProps {
  data: WebSearchResultsOutput | WebDeepSearchResultsOutput;
}

function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getFaviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;
}

function truncateSnippet(text: string, maxLength: number = 150): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + "...";
}

function formatTimestamp(timestamp: string): string {
  try {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return "Just now";
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  } catch {
    return "Recently";
  }
}

export function WebSearchResultsArtifact({ data }: WebSearchResultsArtifactProps) {
  const [showAll, setShowAll] = useState(false);
  const isDeepSearch = data.type === "web_deep_search_results";

  const statusLabel =
    data.status === "unavailable"
      ? "External search provider is unavailable right now."
      : data.status === "rate_limited"
        ? "External search is currently rate-limited. Please retry shortly."
        : data.status === "error"
          ? "External search failed due to provider authentication/configuration."
          : null;

  const displayResults = showAll ? data.results : data.results.slice(0, 5);
  const hasMore = data.results.length > 5;
  const aiSummary = data.aiSummary || null;

  return (
    <div className="artifact-build agent-artifact-card is-web-search">
      {/* ─── Header Section ─── */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-web-search px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-teal">
            <Search className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 mb-1">
              {data.query}
            </h4>
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="capitalize">{data.triggeredBy.replace(/_/g, " ")}</span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Globe className="w-3 h-3" />
                {data.provider}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {formatTimestamp(data.timestamp)}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="px-5 py-5">
        {/* ─── Status Messages ─── */}
        {statusLabel ? (
          <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50">
            <div className="text-sm text-amber-700 dark:text-amber-300">{statusLabel}</div>
          </div>
        ) : null}

        {data.results.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 text-center py-6">
            {data.message || "No external results found."}
          </div>
        ) : (
          <>
            {/* ─── AI Synthesis Section (only when backend provides validated summary) ─── */}
            {aiSummary && (
              <div className="web-search-synthesis mb-5">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-1 h-4 bg-teal-500 rounded-full" />
                  <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                    AI Summary
                  </h5>
                </div>
                <div className="web-search-synthesis-content">
                  <p className="text-sm text-slate-700 dark:text-slate-200 leading-relaxed mb-3">
                    {aiSummary.shortAnswer}
                  </p>
                  {isDeepSearch && "queries" in data && Array.isArray(data.queries) && data.queries.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      <span className="font-semibold">Expanded Queries:</span> {data.queries.join(" | ")}
                    </div>
                  )}
                  {Array.isArray(aiSummary.keyHighlights) && aiSummary.keyHighlights.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">
                      <span className="font-semibold">Key Highlights:</span>
                      <ul className="list-disc list-inside mt-1 space-y-1 ml-2">
                        {aiSummary.keyHighlights.map((item, idx) => (
                          <li key={idx}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {Array.isArray(aiSummary.citations) && aiSummary.citations.length > 0 && (
                    <div className="text-xs text-slate-600 dark:text-slate-400">
                      <span className="font-semibold">Citations:</span>
                      <div className="mt-1 flex flex-wrap gap-2">
                        {aiSummary.citations.map((citation, idx) => (
                          <a
                            key={`${citation.index}-${idx}`}
                            href={citation.url}
                            target="_blank"
                            rel="noreferrer"
                            className="underline hover:text-teal-600 dark:hover:text-teal-400"
                          >
                            [{citation.index}]
                          </a>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ─── Source Cards ─── */}
            <div className="space-y-3">
              <div className="flex items-center gap-2 mb-3">
                <div className="w-1 h-4 bg-slate-400 rounded-full" />
                <h5 className="text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                  Sources
                </h5>
              </div>

              {displayResults.map((result) => {
                const domain = extractDomain(result.url);
                const faviconUrl = getFaviconUrl(result.url);

                return (
                  <a
                    key={result.id}
                    href={result.url}
                    target="_blank"
                    rel="noreferrer"
                    className="web-search-source-card block group"
                  >
                    <div className="flex items-start gap-3">
                      <img
                        src={faviconUrl}
                        alt=""
                        className="w-5 h-5 mt-0.5 rounded flex-shrink-0"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h6 className="text-sm font-semibold text-slate-800 dark:text-slate-200 group-hover:text-teal-600 dark:group-hover:text-teal-400 transition-colors line-clamp-2">
                            {result.title}
                          </h6>
                          <ExternalLink className="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 mb-1.5">
                          {domain}
                          {result.publishedDate && (
                            <>
                              {" · "}
                              <span>{new Date(result.publishedDate).toLocaleDateString()}</span>
                            </>
                          )}
                        </div>
                        {result.snippet && (
                          <p className="text-sm text-slate-600 dark:text-slate-300 line-clamp-2">
                            {truncateSnippet(result.snippet)}
                          </p>
                        )}
                      </div>
                    </div>
                  </a>
                );
              })}

              {/* ─── View All Button ─── */}
              {hasMore && (
                <button
                  type="button"
                  onClick={() => setShowAll(!showAll)}
                  className="w-full py-2 text-xs font-medium text-teal-600 dark:text-teal-400 hover:text-teal-700 dark:hover:text-teal-300 transition-colors"
                >
                  {showAll ? "Show less" : `View all ${data.results.length} results`}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
