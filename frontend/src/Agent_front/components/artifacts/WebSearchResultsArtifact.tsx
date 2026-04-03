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
  WebSearchAiSummary,
  AgentRequestMetadata,
} from "../../../services/api/agent";
import { openExternalLink } from "../../../lib/externalLink";

interface WebSearchResultsArtifactProps {
  data: WebSearchResultsOutput;
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

function normalizeWhitespace(value: string): string {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function stripMarkdownInline(value: string): string {
  return normalizeWhitespace(
    String(value || "")
      .replace(/\[(.*?)\]\((.*?)\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1")
      .replace(/\*\*([^*]+)\*\*/g, "$1")
      .replace(/\*([^*]+)\*/g, "$1")
      .replace(/~~([^~]+)~~/g, "$1")
      .replace(/<br\s*\/?>/gi, " ")
      .replace(/<\/?[^>]+>/g, " ")
  );
}

function ensureSentence(value: string): string {
  const text = normalizeWhitespace(value);
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function buildSourceDrivenFallbackSummary(
  results: Array<{ source?: string | null; title: string; snippet: string; url: string }>,
): string {
  if (!Array.isArray(results) || results.length === 0) {
    return "";
  }
  const top = results.slice(0, 3);
  const paragraphs = top
    .map((result, idx) => {
      const source = sourceLabel(result);
      const detail = stripMarkdownInline(result.snippet || result.title || "No detail available");
      if (!detail) return "";
      return `${ensureSentence(`${source} reports ${detail}`)} [${idx + 1}]`;
    })
    .filter(Boolean);
  if (paragraphs.length === 0) return "";
  if (results.length > 3) {
    const remaining = results.length - 3;
    paragraphs.push(
      ensureSentence(
        `Additional corroborating context is available in ${remaining} more source${
          remaining === 1 ? "" : "s"
        }`,
      ),
    );
  }
  return paragraphs.join("\n\n");
}

function parseMarkdownTableRows(markdown: string): string[][] {
  const rows: string[][] = [];
  for (const rawLine of String(markdown || "").split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("|") || !line.endsWith("|")) continue;
    const columns = line
      .slice(1, -1)
      .split("|")
      .map((cell) => stripMarkdownInline(cell));
    if (columns.length < 2) continue;
    const isSeparator = columns.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, "")));
    if (isSeparator) continue;
    rows.push(columns);
  }
  if (rows.length <= 1) return [];
  const [header, ...body] = rows;
  const headerJoined = header.join(" ").toLowerCase();
  const hasLikelyHeader =
    headerJoined.includes("topic") ||
    headerJoined.includes("key") ||
    headerJoined.includes("source");
  return hasLikelyHeader ? body : rows;
}

function sourceDomainTokens(result: { source?: string | null; title: string; url: string }): string[] {
  const domain = extractDomain(result.url);
  const source = String(result.source || "").trim();
  const hostToken = domain.split(".")[0] || "";
  return [domain, source, hostToken, result.title]
    .map((item) => normalizeWhitespace(item).toLowerCase())
    .filter(Boolean);
}

function guessCitationIndex(
  sourceText: string,
  pointsText: string,
  results: Array<{ source?: string | null; title: string; url: string }>,
  rowIndex: number,
): number | null {
  if (results.length === 0) return null;
  const sourceNorm = normalizeWhitespace(sourceText).toLowerCase();
  const pointsNorm = normalizeWhitespace(pointsText).toLowerCase();
  let bestScore = -1;
  let bestIndex = -1;

  results.forEach((result, idx) => {
    let score = 0;
    for (const token of sourceDomainTokens(result)) {
      if (!token) continue;
      if (sourceNorm.includes(token) || token.includes(sourceNorm)) score += 4;
      if (pointsNorm.includes(token)) score += 2;
    }
    const titleWords = normalizeWhitespace(result.title)
      .toLowerCase()
      .split(" ")
      .filter((word) => word.length > 4)
      .slice(0, 6);
    for (const word of titleWords) {
      if (pointsNorm.includes(word)) score += 1;
    }
    if (score > bestScore) {
      bestScore = score;
      bestIndex = idx;
    }
  });

  if (bestScore > 0 && bestIndex >= 0) return bestIndex + 1;
  if (rowIndex < results.length) return rowIndex + 1;
  return null;
}

function cleanStandaloneMarkdownSummary(rawText: string): string {
  const lines = String(rawText || "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
    .filter((line) => !/^related$/i.test(line));
  const output: string[] = [];
  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) {
      output.push(ensureSentence(stripMarkdownInline(line.replace(/^[-*]\s+/, ""))));
      continue;
    }
    if (/^\d+\.\s+/.test(line)) {
      output.push(ensureSentence(stripMarkdownInline(line.replace(/^\d+\.\s+/, ""))));
      continue;
    }
    if (/^#{1,6}\s*/.test(line)) {
      output.push(ensureSentence(stripMarkdownInline(line.replace(/^#{1,6}\s*/, ""))));
      continue;
    }
    output.push(ensureSentence(stripMarkdownInline(line)));
  }
  return output.join("\n\n").trim();
}

function normalizeAnswerToNarrative(
  rawText: string,
  results: Array<{ source?: string | null; title: string; url: string }>,
): string {
  const text = String(rawText || "").trim();
  if (!text) return "";

  const takeawayMatch = text.match(/(?:\*\*)?\s*Take[-‑]away:\s*(.+)$/i);
  const bodyWithoutTakeaway = takeawayMatch ? text.slice(0, takeawayMatch.index).trim() : text;
  const takeawaySentence = takeawayMatch ? ensureSentence(stripMarkdownInline(takeawayMatch[1])) : "";

  const tableRows = parseMarkdownTableRows(bodyWithoutTakeaway);
  if (tableRows.length > 0) {
    const paragraphs = tableRows
      .map((columns, rowIndex) => {
        const topic = stripMarkdownInline(columns[0] || "");
        const keyPoints = stripMarkdownInline(columns[1] || "");
        const source = stripMarkdownInline(columns[2] || "");
        if (!topic && !keyPoints) return "";
        const core = topic ? `${topic}: ${keyPoints || "No additional detail available"}` : keyPoints;
        const citation = guessCitationIndex(source, `${topic} ${keyPoints}`, results, rowIndex);
        const sourceText = source ? ` Source: ${source}.` : "";
        const citationText = citation ? ` [${citation}]` : "";
        return `${ensureSentence(core)}${sourceText}${citationText}`.trim();
      })
      .filter(Boolean);

    if (takeawaySentence) {
      const citationSet = Array.from(
        new Set(
          paragraphs
            .map((paragraph) => [...paragraph.matchAll(/\[(\d+)\]/g)].map((match) => Number(match[1])))
            .flat()
            .filter((num) => Number.isFinite(num) && num > 0),
        ),
      );
      const takeawayCitations =
        citationSet.length > 0 ? ` ${citationSet.map((num) => `[${num}]`).join(" ")}` : "";
      paragraphs.push(`${takeawaySentence}${takeawayCitations}`.trim());
    }
    return paragraphs.join("\n\n");
  }

  const fallbackNarrative = cleanStandaloneMarkdownSummary(bodyWithoutTakeaway);
  if (!fallbackNarrative) {
    return takeawaySentence;
  }
  return takeawaySentence ? `${fallbackNarrative}\n\n${takeawaySentence}` : fallbackNarrative;
}

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

function statusMessage(data: WebSearchResultsOutput): string | null {
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
  data: WebSearchResultsOutput,
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
  const queries = useMemo(() => [data.query], [data.query]);
  const shouldAnimate = isLive;
  const analyzeSteps = useMemo(() => buildAnalyzeSteps(data.results.length), [data.results.length]);
  const relatedQuestions = useMemo(() => buildRelatedQuestions(data, aiSummary), [aiSummary, data]);
  const fallbackStatus = useMemo(() => statusMessage(data), [data]);
  const rawAnswerText = useMemo(() => {
    if (aiSummary?.shortAnswer && aiSummary.shortAnswer.trim().length > 0) {
      return aiSummary.shortAnswer.trim();
    }
    if (commentaryMessage && commentaryMessage.trim().length > 0) {
      return commentaryMessage.trim();
    }
    if (fallbackStatus) return fallbackStatus;
    if (data.message && data.message.trim().length > 0) return data.message.trim();
    if (data.results.length > 0) {
      return buildSourceDrivenFallbackSummary(data.results);
    }
    return "No external results found.";
  }, [aiSummary, commentaryMessage, data.message, data.results, fallbackStatus]);
  const answerText = useMemo(() => {
    if (!rawAnswerText) return rawAnswerText;
    return normalizeAnswerToNarrative(rawAnswerText, data.results);
  }, [rawAnswerText, data.results]);

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
    () =>
      aiSummary?.citations?.length
        ? new Set((aiSummary.citations || []).map((item) => item.index))
        : new Set(data.results.map((_, idx) => idx + 1)),
    [aiSummary?.citations, data.results],
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
    onConfirmWebSearch({
      webSearchEnabled: true,
      webSearchTrigger: "button",
      webSearchQuery: query,
      webSearchIntent: "WEB_SEARCH",
    });
  }, [onConfirmWebSearch]);

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
                  rel="noopener noreferrer nofollow"
                  onClick={(event) => {
                    event.preventDefault();
                    void openExternalLink(result.url, "agent_source");
                  }}
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
