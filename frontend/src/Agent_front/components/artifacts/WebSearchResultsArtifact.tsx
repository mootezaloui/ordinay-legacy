import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brain,
  Check,
  ExternalLink,
  FileText,
  Loader2,
  Search,
} from "lucide-react";
import type {
  WebSearchResultsOutput,
  WebDeepSearchResultsOutput,
  WebSearchAiSummary,
  AgentRequestMetadata,
} from "../../../services/api/agent";

interface WebSearchResultsArtifactProps {
  data: WebSearchResultsOutput | WebDeepSearchResultsOutput;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
  commentaryMessage?: string;
  isLive?: boolean;
}

const QUERY_STAGGER_MS = 720;
const SOURCES_DELAY_MS = 300;
const ANALYZE_PHASE_DELAY_MS = 600;
const ANALYZE_STEP_STAGGER_MS = 650;
const ANSWER_START_DELAY_MS = 300;
const TYPEWRITER_MS = 8;
const RELATED_DELAY_MS = 500;

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function domainInitial(url: string, source?: string | null): string {
  const value = (source || extractDomain(url) || "?").trim();
  return value.charAt(0).toUpperCase() || "?";
}

function sourceLabel(result: { source?: string | null; url: string }): string {
  return (result.source || extractDomain(result.url) || "Source").trim();
}

function faviconUrl(url: string): string {
  const domain = extractDomain(url);
  return `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64`;
}

function statusMessage(data: WebSearchResultsOutput | WebDeepSearchResultsOutput): string | null {
  if (data.status === "unavailable") {
    return "External search provider is unavailable right now.";
  }
  if (data.status === "rate_limited") {
    return "External search is currently rate-limited. Please retry shortly.";
  }
  if (data.status === "error") {
    return "External search failed due to provider authentication or configuration.";
  }
  return null;
}

function buildAnalyzeSteps(resultCount: number): string[] {
  return [
    `Analyzing ${resultCount} source${resultCount === 1 ? "" : "s"} for relevance`,
    "Cross-referencing data across publications",
    "Synthesizing findings",
  ];
}

function buildRelatedQuestions(
  data: WebSearchResultsOutput | WebDeepSearchResultsOutput,
  aiSummary: WebSearchAiSummary | null,
): string[] {
  const base = data.query.trim();
  const highlights = aiSummary?.keyHighlights ?? [];
  const seeded = highlights
    .filter((item) => item && item.trim().length > 0)
    .slice(0, 2)
    .map((item) => `Explain this in more detail: ${item.trim()}`);

  const defaults = [
    `What changed recently about ${base}?`,
    `Compare the most reliable viewpoints on ${base}`,
    `What are the biggest risks or caveats around ${base}?`,
    `Give me a quick timeline for ${base}`,
  ];

  return [...seeded, ...defaults]
    .filter((q, idx, arr) => q && arr.indexOf(q) === idx)
    .slice(0, 4);
}

export function WebSearchResultsArtifact({
  data,
  onConfirmWebSearch,
  commentaryMessage,
  isLive = false,
}: WebSearchResultsArtifactProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const sourceRefs = useRef<Array<HTMLAnchorElement | null>>([]);

  const [visibleQueryCount, setVisibleQueryCount] = useState(0);
  const [searchComplete, setSearchComplete] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [showAnalyzing, setShowAnalyzing] = useState(false);
  const [visibleAnalyzeCount, setVisibleAnalyzeCount] = useState(0);
  const [analyzingComplete, setAnalyzingComplete] = useState(false);
  const [showAnswer, setShowAnswer] = useState(false);
  const [typedLength, setTypedLength] = useState(0);
  const [answerComplete, setAnswerComplete] = useState(false);
  const [showRelated, setShowRelated] = useState(false);
  const [highlightSourceIdx, setHighlightSourceIdx] = useState<number | null>(null);
  const [brokenFavicons, setBrokenFavicons] = useState<Record<string, boolean>>({});

  const aiSummary = data.aiSummary || null;
  const isDeepSearch = data.type === "web_deep_search_results";
  const queries = useMemo(() => {
    if (isDeepSearch && "queries" in data && Array.isArray(data.queries) && data.queries.length > 0) {
      return data.queries;
    }
    return [data.query];
  }, [data, isDeepSearch]);
  const shouldAnimate = isLive;
  const analyzeSteps = useMemo(() => buildAnalyzeSteps(data.results.length), [data.results.length]);
  const relatedQuestions = useMemo(() => buildRelatedQuestions(data, aiSummary), [aiSummary, data]);
  const fallbackStatus = useMemo(() => statusMessage(data), [data]);
  const answerText = useMemo(() => {
    if (aiSummary?.shortAnswer && aiSummary.shortAnswer.trim().length > 0) {
      return aiSummary.shortAnswer.trim();
    }
    if (commentaryMessage && commentaryMessage.trim().length > 0) {
      return commentaryMessage.trim();
    }
    if (fallbackStatus) return fallbackStatus;
    if (data.message && data.message.trim().length > 0) return data.message.trim();
    if (data.results.length > 0) {
      return "Summary unavailable. Please review sources below.";
    }
    return "No external results found.";
  }, [aiSummary, commentaryMessage, data.message, data.results.length, fallbackStatus]);

  const displayVisibleQueryCount = shouldAnimate ? visibleQueryCount : Math.max(queries.length, 1);
  const displaySearchComplete = shouldAnimate ? searchComplete : true;
  const displayShowSources = shouldAnimate ? showSources : true;
  const displayShowAnalyzing = shouldAnimate ? showAnalyzing : true;
  const displayVisibleAnalyzeCount = shouldAnimate ? visibleAnalyzeCount : analyzeSteps.length;
  const displayAnalyzingComplete = shouldAnimate ? analyzingComplete : true;
  const displayShowAnswer = shouldAnimate ? showAnswer : true;
  const displayTypedLength = shouldAnimate ? typedLength : answerText.length;
  const displayAnswerComplete = shouldAnimate ? answerComplete : true;
  const displayShowRelated = shouldAnimate ? showRelated : true;

  const visibleAnswer = useMemo(
    () => answerText.slice(0, displayTypedLength),
    [answerText, displayTypedLength],
  );
  const citationIndices = useMemo(
    () => new Set((aiSummary?.citations || []).map((item) => item.index)),
    [aiSummary?.citations],
  );
  const answerParts = useMemo(() => {
    const parts = visibleAnswer.split(/(\[\d+(?:[,\s]+\d+)*\])/g);
    return parts.map((part) => {
      const match = part.match(/^\[(\d+(?:[,\s]+\d+)*)\]$/);
      if (!match) return { type: "text" as const, text: part };
      const indices = match[1]
        .split(/[,\s]+/)
        .map((value) => Number(value))
        .filter((value) => Number.isFinite(value) && value > 0);
      if (indices.length === 0) return { type: "text" as const, text: "" };
      return { type: "citation" as const, indices };
    });
  }, [visibleAnswer]);

  const handleCitationClick = useCallback((citationIndex: number) => {
    const sourceIndex = citationIndex - 1;
    if (sourceIndex < 0 || sourceIndex >= data.results.length) return;
    setHighlightSourceIdx(sourceIndex);
    sourceRefs.current[sourceIndex]?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "center",
    });
    window.setTimeout(() => setHighlightSourceIdx(null), 1800);
  }, [data.results.length]);

  const triggerFollowUpSearch = useCallback((query: string) => {
    if (!onConfirmWebSearch) return;
    const isDeep = data.searchIntent === "DEEP_SEARCH";
    onConfirmWebSearch({
      webSearchEnabled: true,
      webSearchTrigger: "button",
      webSearchQuery: query,
      webSearchIntent: isDeep ? "DEEP_SEARCH" : "WEB_SEARCH",
      webDeepSearchEnabled: isDeep,
      webDeepSearchTrigger: isDeep ? "button" : undefined,
      webDeepSearchQuery: isDeep ? query : undefined,
    });
  }, [data.searchIntent, onConfirmWebSearch]);

  useEffect(() => {
    if (!shouldAnimate) return;
    const timers: number[] = [];

    const totalQueries = Math.max(queries.length, 1);
    for (let i = 0; i < totalQueries; i += 1) {
      timers.push(window.setTimeout(() => setVisibleQueryCount(i + 1), i * QUERY_STAGGER_MS));
    }
    timers.push(
      window.setTimeout(
        () => setSearchComplete(true),
        (totalQueries - 1) * QUERY_STAGGER_MS + 420,
      ),
    );

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [queries, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) return;
    if (!searchComplete) return;
    const timer = window.setTimeout(() => setShowSources(true), SOURCES_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [searchComplete, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) return;
    if (!showSources) return;
    const timers: number[] = [];
    timers.push(window.setTimeout(() => setShowAnalyzing(true), ANALYZE_PHASE_DELAY_MS));
    for (let i = 0; i < analyzeSteps.length; i += 1) {
      timers.push(
        window.setTimeout(
          () => setVisibleAnalyzeCount(i + 1),
          ANALYZE_PHASE_DELAY_MS + i * ANALYZE_STEP_STAGGER_MS,
        ),
      );
    }
    timers.push(
      window.setTimeout(
        () => setAnalyzingComplete(true),
        ANALYZE_PHASE_DELAY_MS + (analyzeSteps.length - 1) * ANALYZE_STEP_STAGGER_MS + 350,
      ),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [analyzeSteps.length, showSources, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) return;
    if (!analyzingComplete) return;
    const timer = window.setTimeout(() => setShowAnswer(true), ANSWER_START_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [analyzingComplete, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) return;
    if (!showAnswer) return;
    const timer = window.setInterval(() => {
      setTypedLength((prev) => {
        if (prev >= answerText.length) {
          window.clearInterval(timer);
          setAnswerComplete(true);
          return prev;
        }
        return prev + 1;
      });
    }, TYPEWRITER_MS);
    return () => window.clearInterval(timer);
  }, [answerText, showAnswer, shouldAnimate]);

  useEffect(() => {
    if (!shouldAnimate) return;
    if (!answerComplete) return;
    const timer = window.setTimeout(() => setShowRelated(true), RELATED_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [answerComplete, shouldAnimate]);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [
    displayVisibleQueryCount,
    displaySearchComplete,
    displayShowSources,
    displayVisibleAnalyzeCount,
    displayShowAnswer,
    displayTypedLength,
    displayShowRelated,
  ]);

  return (
    <div className="web-search-flow" ref={rootRef}>
      <section className="web-phase">
        <div className="web-phase-header">
          <div className="web-phase-head-left">
            <span className="web-phase-icon web-phase-icon-search">
              <Search className="w-3 h-3" />
            </span>
            <span className="web-phase-label">SEARCHING</span>
          </div>
          {displaySearchComplete && (
            <span className="web-phase-meta">
              {data.results.length} source{data.results.length === 1 ? "" : "s"} found
            </span>
          )}
        </div>
        <div className="web-phase-timeline">
          {queries.slice(0, displayVisibleQueryCount).map((query, idx) => {
            const done = displaySearchComplete || idx < displayVisibleQueryCount - 1;
            return (
              <div
                key={`${query}-${idx}`}
                className="web-timeline-row web-fade-up"
                style={{ animationDelay: `${idx * 80}ms` }}
              >
                <span className="web-row-icon">
                  {done ? <Check className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                </span>
                <span className="web-query-text">{query}</span>
              </div>
            );
          })}
        </div>
      </section>

      {displayShowSources && (
        <section className="web-phase web-fade-up">
          <div className="web-phase-header">
            <div className="web-phase-head-left">
              <span className="web-phase-icon web-phase-icon-source">
                <Search className="w-3 h-3" />
              </span>
              <span className="web-phase-label">SOURCES</span>
            </div>
          </div>
          <div className="web-sources-row">
            {data.results.length === 0 && (
              <div className="web-sources-empty">No source cards available.</div>
            )}
            {data.results.map((result, idx) => {
              const domain = extractDomain(result.url);
              const isHighlighted = highlightSourceIdx === idx;
              const showFallback = !!brokenFavicons[domain];
              return (
                <a
                  key={result.id}
                  ref={(el) => {
                    sourceRefs.current[idx] = el;
                  }}
                  href={result.url}
                  target="_blank"
                  rel="noreferrer"
                  className={`web-source-card web-fade-up ${isHighlighted ? "web-source-highlight" : ""}`}
                  style={{ animationDelay: `${idx * 80}ms` }}
                >
                  <div className="web-source-head">
                    <span className="web-source-brand">
                      {!showFallback ? (
                        <img
                          src={faviconUrl(result.url)}
                          alt=""
                          className="web-source-brand-img"
                          loading="lazy"
                          onError={() => {
                            setBrokenFavicons((prev) => ({ ...prev, [domain]: true }));
                          }}
                        />
                      ) : (
                        domainInitial(result.url, result.source)
                      )}
                    </span>
                    <div className="min-w-0">
                      <div className="web-source-name">{sourceLabel(result)}</div>
                      <div className="web-source-domain">{domain}</div>
                    </div>
                  </div>
                  <h4 className="web-source-title">{result.title}</h4>
                  <p className="web-source-snippet">{result.snippet}</p>
                  <div className="web-source-footer">
                    <span>Read article</span>
                    <ExternalLink className="w-3 h-3" />
                  </div>
                </a>
              );
            })}
          </div>
        </section>
      )}

      {displayShowAnalyzing && (
        <section className="web-phase web-fade-up">
          <div className="web-phase-header">
            <div className="web-phase-head-left">
              <span className="web-phase-icon web-phase-icon-analyze">
                <Brain className="w-3 h-3" />
              </span>
              <span className="web-phase-label">ANALYZING</span>
            </div>
          </div>
          <div className="web-phase-timeline">
            {analyzeSteps.slice(0, displayVisibleAnalyzeCount).map((step, idx) => {
              const done = displayAnalyzingComplete || idx < displayVisibleAnalyzeCount - 1;
              return (
                <div
                  key={step}
                  className="web-timeline-row web-fade-up"
                  style={{ animationDelay: `${idx * 90}ms` }}
                >
                  <span className="web-row-icon">
                    {done ? <Check className="w-3 h-3" /> : <Loader2 className="w-3 h-3 animate-spin" />}
                  </span>
                  <span className="web-analyze-text">{step}</span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {displayShowAnswer && (
        <section className="web-phase web-fade-up">
          <div className="web-phase-header">
            <div className="web-phase-head-left">
              <span className="web-phase-icon web-phase-icon-answer">
                <FileText className="w-3 h-3" />
              </span>
              <span className="web-phase-label">ANSWER</span>
            </div>
          </div>
          <div className="web-answer-body">
            {answerParts.map((part, idx) => {
              if (part.type === "text") {
                return (
                  <span key={`text-${idx}`} className="web-answer-segment">
                    {part.text}
                  </span>
                );
              }
              return (
                <span key={`cite-${idx}`} className="web-citation-group">
                  {part.indices.map((citation) => {
                    const enabled = citationIndices.has(citation);
                    return (
                      <button
                        key={citation}
                        type="button"
                        className="web-search-citation"
                        onClick={() => enabled && handleCitationClick(citation)}
                        disabled={!enabled}
                      >
                        {citation}
                      </button>
                    );
                  })}
                </span>
              );
            })}
            {!displayAnswerComplete && <span className="web-type-cursor" />}
          </div>
        </section>
      )}

      {displayShowRelated && relatedQuestions.length > 0 && (
        <section className="web-related web-fade-up">
          <div className="web-related-label">RELATED</div>
          <div className="web-related-list">
            {relatedQuestions.map((question, idx) => (
              <button
                key={question}
                type="button"
                className="web-related-row web-fade-up"
                style={{ animationDelay: `${idx * 90}ms` }}
                onClick={() => triggerFollowUpSearch(question)}
              >
                <Search className="w-3.5 h-3.5 flex-shrink-0" />
                <span>{question}</span>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
