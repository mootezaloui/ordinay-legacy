import { useState, useEffect, useRef, useMemo } from "react";
import {
  Check,
  Loader2,
  Brain,
  Database,
  Search,
  Shield,
  FileOutput,
  X,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import type { AgentMessage, AgentMessageData } from "../types/agentMessage";
import type {
  FollowUpSuggestion,
  ExplanationOutput,
  CollectionOutput,
  CollectionItem,
  AgentRequestMetadata,
  ChatContextSummaryOutput,
} from "../../services/api/agent";
import {
  cancelDocumentGenerationPreview,
  confirmDocumentGenerationPreview,
  confirmProposal,
} from "../../services/api/agent";

// Artifact renderers
import { ExplanationArtifact } from "./artifacts/ExplanationArtifact";
import { RiskArtifact } from "./artifacts/RiskArtifact";
import { DraftArtifact } from "./artifacts/DraftArtifact";
import { DocumentDraftArtifact } from "./artifacts/DocumentDraftArtifact";
import { ActionArtifact } from "./artifacts/ActionArtifact";
import { ProposalArtifact } from "./artifacts/ProposalArtifact";
import { SemanticConfirmationErrorBoundary } from "./artifacts/confirmation/SemanticConfirmationErrorBoundary";
import { ChatArtifact } from "./artifacts/ChatArtifact";
import { ClarificationArtifact } from "./artifacts/ClarificationArtifact";
import { CollectionArtifact } from "./artifacts/CollectionArtifact";
import { WebSearchResultsArtifact } from "./artifacts/WebSearchResultsArtifact";
import { DocumentGenerationPreviewArtifact } from "./artifacts/DocumentGenerationPreviewArtifact";
import { RecoveryArtifact } from "./artifacts/RecoveryArtifact";
import { ContextSuggestionRenderer } from "./artifacts/ContextSuggestionRenderer";
import { ChatbotMutationStatus } from "./chatbot/ChatbotMutationStatus";
import { MarkdownOutput } from "../../components/MarkdownOutput";
import { useAgentSessions } from "../hooks/useAgentSessions";

// Staged message renderers
import { AckMessage } from "./messages/AckMessage";
import { StatusMessage } from "./messages/StatusMessage";
import { IntentFramingMessage } from "./messages/IntentFramingMessage";

/**
 * Workflow phases — derived from the message state,
 * but paced with timing so the user always perceives a process.
 *
 *   classifying → acknowledged → working → revealing → complete
 *
 * "classifying"   — intent not yet known (initial empty state)
 * "acknowledged"  — intent known, showing what we're about to do
 * "working"       — processing steps visible
 * "streaming"     — text content is streaming in (chat intents)
 * "revealing"     — result arrived, artifact expanding into view
 * "complete"      — done, artifact fully visible
 */
type Phase =
  | "classifying"
  | "acknowledged"
  | "working"
  | "streaming"
  | "revealing"
  | "complete";

// How long the working phase must be visible (ms)
// so the user always perceives the agent doing work.
const MIN_WORKING_DURATION = 150;

// How long the reveal animation takes before we consider it "complete"
const REVEAL_DURATION = 400;

interface AgentWorkflowProps {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
}

/**
 * Orchestrates the full agent response lifecycle.
 *
 * Instead of showing a blank void during processing then dumping the result,
 * this component creates a visible, phased workflow:
 *
 * 1. Acknowledges what it understood
 * 2. Shows working steps that progress
 * 3. Reveals the artifact with an opening animation
 *
 * The result: the agent feels like it's doing work FOR you,
 * not just returning a database query.
 */
export function AgentWorkflow({
  message,
  onFollowUpClick,
  onExampleClick,
  onConfirmWebSearch,
}: AgentWorkflowProps) {
  const { activeSessionId, activeSession, updateSessionMessages } =
    useAgentSessions();
  const isStreaming = message.status === "sending";
  const isError = message.status === "error";
  const isComplete = message.status === "success";
  const hasContent = !!(message.content && message.content.length > 0);
  const hasData = !!message.data;
  const hasStructuredResult = hasData && message.data?.type !== "error";

  // ── Phase derivation ──

  // Track when the working phase started, so we can enforce minimum duration
  const workingStartRef = useRef<number | null>(null);
  const [minWorkingMet, setMinWorkingMet] = useState(false);
  const [revealTriggered, setRevealTriggered] = useState(false);
  const resultArrivedRef = useRef(false);

  // Derive the "raw" phase from message state (what SHOULD we show?)
  const rawPhase = useMemo<Phase>(() => {
    if (isError) return "complete";
    if (isComplete) return "complete";

    // Still streaming
    if (isStreaming) {
      if (!message.intent) return "classifying";
      if (hasStructuredResult) return "revealing";
      if (hasContent && !hasStructuredResult) return "streaming"; // text chunks arriving
      return "working"; // intent known, no result yet
    }

    return "complete";
  }, [
    isStreaming,
    isComplete,
    isError,
    message.intent,
    hasContent,
    hasStructuredResult,
  ]);

  // Track when result arrives during working phase
  useEffect(() => {
    if (rawPhase === "revealing" && !resultArrivedRef.current) {
      resultArrivedRef.current = true;
    }
  }, [rawPhase]);

  // Start working timer when we enter working phase
  useEffect(() => {
    if (rawPhase === "working" && workingStartRef.current === null) {
      workingStartRef.current = Date.now();
      setMinWorkingMet(false);
    }
  }, [rawPhase]);

  // Enforce minimum working duration
  useEffect(() => {
    if (rawPhase === "working") return; // still working, no timer needed yet

    // Result arrived (or we jumped to complete) — check if minimum was met
    if (workingStartRef.current !== null && !minWorkingMet) {
      const elapsed = Date.now() - workingStartRef.current;
      const remaining = MIN_WORKING_DURATION - elapsed;

      if (remaining <= 0) {
        setMinWorkingMet(true);
      } else {
        const timer = setTimeout(() => setMinWorkingMet(true), remaining);
        return () => clearTimeout(timer);
      }
    }
  }, [rawPhase, minWorkingMet]);

  // Trigger reveal animation after minimum working
  useEffect(() => {
    if (minWorkingMet && resultArrivedRef.current && !revealTriggered) {
      setRevealTriggered(true);
    }
  }, [minWorkingMet, revealTriggered]);

  // Determine the DISPLAYED phase (respects minimum timings)
  const displayPhase = useMemo<Phase>(() => {
    // For completed messages (scrolling back to old results), skip all animation
    if (isComplete || isError) return "complete";

    // Streaming text — show it immediately
    if (rawPhase === "streaming") return "streaming";

    // Classifying — show immediately
    if (rawPhase === "classifying") return "classifying";

    // If we never entered a working phase (status is handled elsewhere),
    // reveal immediately when the result arrives.
    if (rawPhase === "revealing" && workingStartRef.current === null) {
      return "revealing";
    }

    // Working — show working
    if (rawPhase === "working") return "working";

    // Result arrived but minimum working not met — keep showing working
    if (rawPhase === "revealing" && !minWorkingMet) return "working";

    // Minimum met and reveal triggered
    if (revealTriggered) return "revealing";

    // Still in acknowledged/working
    return rawPhase === "revealing" ? "working" : rawPhase;
  }, [rawPhase, isComplete, isError, minWorkingMet, revealTriggered]);

  // ── Render based on message stage (if set) ──
  // The `stage` field from backend SSE takes precedence over computed phases.
  // This provides immediate feedback before the phase logic kicks in.

  // Stage: ack — immediate acknowledgement, shown before any processing
  if (message.stage === "ack") {
    return <AckMessage content={message.content} />;
  }

  // Stage: status — deterministic status updates during processing
  if (message.stage === "status" && message.statusAction) {
    return <StatusMessage action={message.statusAction} />;
  }

  // Stage: intent framing — short LLM message before execution
  if (message.stage === "intent") {
    return (
      <IntentFramingMessage
        content={message.content}
        structured={message.intentFraming}
      />
    );
  }

  // For other stages (artifact, commentary, or undefined), continue with phase-based rendering

  // ── Render based on display phase ──

  // Phase: classifying
  if (displayPhase === "classifying") {
    return (
      <div className="workflow-phase-enter agent-message-row">
        <div className="agent-status-line">
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            Working...
          </span>
        </div>
      </div>
    );
  }

  // Phase: streaming text (chat)
  if (displayPhase === "streaming") {
    return (
      <div className="agent-message-row">
        <div className="agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200 px-1">
          <MarkdownOutput content={message.content} />
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-slate-400 dark:bg-slate-500 animate-pulse rounded-sm align-text-bottom" />
        </div>
      </div>
    );
  }

  // Phase: working (acknowledged + work steps)
  if (displayPhase === "working") {
    const statusText = getAcknowledgment(message.intent)
      .replace(/\.\.\.$/, "...")
      .replace(/^[A-Z]/, (c) => c);
    return (
      <div className="workflow-phase-enter agent-message-row">
        <div className="agent-status-line">
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {statusText}
          </span>
        </div>
      </div>
    );
  }

  // Phase: revealing (artifact expanding into view)
  if (displayPhase === "revealing") {
    return (
      <div className="space-y-2">
        <MinimalChatbotTurn
          message={message}
          onFollowUpClick={onFollowUpClick}
          onExampleClick={onExampleClick}
          onConfirmWebSearch={onConfirmWebSearch}
          activeSessionId={activeSessionId}
          activeSessionMessages={activeSession?.messages}
          updateSessionMessages={updateSessionMessages}
        />
      </div>
    );
  }

  // Phase: complete
  return (
    <div className="space-y-2">
      <MinimalChatbotTurn
        message={message}
        onFollowUpClick={onFollowUpClick}
        onExampleClick={onExampleClick}
        onConfirmWebSearch={onConfirmWebSearch}
        activeSessionId={activeSessionId}
        activeSessionMessages={activeSession?.messages}
        updateSessionMessages={updateSessionMessages}
      />
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Working Phase — 5-Stage Processing Pipeline Visualization
// ────────────────────────────────────────────────────────────────

interface PipelineStage {
  id: string;
  label: string;
  description: string;
  icon: typeof Brain;
  color: string;
}

const PIPELINE_STAGES: PipelineStage[] = [
  {
    id: "intent",
    label: "Intent Recognition",
    description: "Analyzing natural language input",
    icon: Brain,
    color: "indigo",
  },
  {
    id: "query",
    label: "Query Generation",
    description: "Converting to data queries",
    icon: Search,
    color: "violet",
  },
  {
    id: "retrieval",
    label: "Data Retrieval",
    description: "Fetching from knowledge base",
    icon: Database,
    color: "blue",
  },
  {
    id: "analysis",
    label: "Analysis",
    description: "AI pattern recognition",
    icon: Shield,
    color: "amber",
  },
  {
    id: "generation",
    label: "Artifact Generation",
    description: "Formatting results",
    icon: FileOutput,
    color: "emerald",
  },
];

function WorkingPhase({
  intent,
  resultArrived,
  onCancel,
}: {
  intent?: string;
  resultArrived: boolean;
  onCancel?: () => void;
}) {
  // Expanded details panel
  const [showDetails, setShowDetails] = useState(false);
  const [, forceUpdate] = useState({});
  const mountTimeRef = useRef(Date.now());

  // Force one re-render per second for smooth visual feedback (instead of 10+/sec)
  useEffect(() => {
    if (resultArrived) return;
    const timer = setInterval(() => forceUpdate({}), 1000);
    return () => clearInterval(timer);
  }, [resultArrived]);

  // Calculate stage and progress based on elapsed time (no state updates in loops)
  const elapsedMs = Date.now() - mountTimeRef.current;
  const activeStage = resultArrived
    ? PIPELINE_STAGES.length - 1
    : Math.min(PIPELINE_STAGES.length - 1, Math.floor(elapsedMs / 600));

  const stageProgress = resultArrived
    ? [100, 100, 100, 100, 100]
    : Array.from({ length: 5 }, (_, i) => {
        if (i < activeStage) return 100;
        if (i === activeStage) {
          const stageElapsed = elapsedMs - i * 600;
          return Math.min(Math.floor((stageElapsed / 600) * 85), 85);
        }
        return 0;
      });

  const acknowledgment = getAcknowledgment(intent);
  const totalProgress = Math.round(
    stageProgress.reduce((a, b) => a + b, 0) / 5,
  );

  return (
    <div className="workflow-phase-enter agent-message-row">
      <div className="agent-pipeline-card">
        {/* Header with overall progress */}
        <div className="agent-pipeline-header">
          <div className="flex items-center gap-3">
            <div className="agent-pipeline-loader">
              <svg className="w-10 h-10" viewBox="0 0 40 40">
                <circle
                  className="text-slate-200 dark:text-slate-700"
                  strokeWidth="3"
                  stroke="currentColor"
                  fill="transparent"
                  r="16"
                  cx="20"
                  cy="20"
                />
                <circle
                  className="text-[#3b82f6] dark:text-[#60a5fa] agent-pipeline-progress-ring"
                  strokeWidth="3"
                  strokeLinecap="round"
                  stroke="currentColor"
                  fill="transparent"
                  r="16"
                  cx="20"
                  cy="20"
                  style={{
                    strokeDasharray: `${totalProgress} 100`,
                    transform: "rotate(-90deg)",
                    transformOrigin: "center",
                  }}
                />
              </svg>
              <span className="agent-pipeline-percent">{totalProgress}%</span>
            </div>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {acknowledgment}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Stage {activeStage + 1} of {PIPELINE_STAGES.length}:{" "}
                {PIPELINE_STAGES[activeStage].label}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="agent-pipeline-toggle"
            >
              {showDetails ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              <span className="text-xs">
                {showDetails ? "Hide" : "Details"}
              </span>
            </button>
            {onCancel && (
              <button
                type="button"
                onClick={onCancel}
                className="agent-pipeline-cancel"
                title="Cancel processing"
                aria-label="Cancel processing"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Pipeline visualization */}
        <div className="agent-pipeline-stages">
          {PIPELINE_STAGES.map((stage, idx) => {
            const StageIcon = stage.icon;
            const isComplete =
              idx < activeStage || (idx === activeStage && resultArrived);
            const isActive = idx === activeStage && !resultArrived;
            const isPending = idx > activeStage;
            const progress = stageProgress[idx];

            return (
              <div
                key={stage.id}
                className={`agent-pipeline-stage ${
                  isComplete
                    ? "is-complete"
                    : isActive
                      ? "is-active"
                      : "is-pending"
                }`}
              >
                {/* Connector line */}
                {idx > 0 && (
                  <div className="agent-pipeline-connector">
                    <div
                      className="agent-pipeline-connector-fill"
                      style={{ width: isComplete || isActive ? "100%" : "0%" }}
                    />
                  </div>
                )}

                {/* Stage node */}
                <div
                  className={`agent-pipeline-node agent-pipeline-node-${stage.color}`}
                >
                  {isComplete ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : isActive ? (
                    <StageIcon className="w-4 h-4 text-white animate-pulse" />
                  ) : (
                    <StageIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  )}
                </div>

                {/* Stage label */}
                <span
                  className={`agent-pipeline-label ${
                    isComplete
                      ? "text-slate-600 dark:text-slate-300"
                      : isActive
                        ? "text-slate-800 dark:text-slate-200 font-medium"
                        : "text-slate-400 dark:text-slate-500"
                  }`}
                >
                  {stage.label}
                </span>

                {/* Progress indicator for active stage */}
                {isActive && (
                  <div className="agent-pipeline-stage-progress">
                    <div
                      className="agent-pipeline-stage-progress-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Expanded details panel */}
        {showDetails && (
          <div className="agent-pipeline-details">
            <div className="agent-pipeline-details-grid">
              {PIPELINE_STAGES.map((stage, idx) => {
                const isComplete =
                  idx < activeStage || (idx === activeStage && resultArrived);
                const isActive = idx === activeStage && !resultArrived;
                const StageIcon = stage.icon;

                return (
                  <div
                    key={stage.id}
                    className={`agent-pipeline-detail-card ${
                      isComplete
                        ? "is-complete"
                        : isActive
                          ? "is-active"
                          : "is-pending"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <StageIcon
                        className={`w-4 h-4 ${
                          isComplete
                            ? "text-emerald-500"
                            : isActive
                              ? "text-[#3b82f6] animate-pulse"
                              : "text-slate-400"
                        }`}
                      />
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {stage.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {stage.description}
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-black/[0.04] dark:bg-white/[0.06] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isComplete
                            ? "bg-emerald-500"
                            : isActive
                              ? "bg-[#3b82f6]"
                              : "bg-slate-300 dark:bg-slate-600"
                        }`}
                        style={{ width: `${stageProgress[idx]}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Data flow visualization */}
            <div className="agent-pipeline-dataflow">
              <div className="agent-pipeline-dataflow-item">
                <span className="text-xs text-slate-400">Input</span>
                <div className="agent-pipeline-dataflow-box">
                  Natural Language Query
                </div>
              </div>
              <div className="agent-pipeline-dataflow-arrow">→</div>
              <div className="agent-pipeline-dataflow-item">
                <span className="text-xs text-slate-400">Processing</span>
                <div className="agent-pipeline-dataflow-box is-active">
                  {PIPELINE_STAGES[activeStage].label}
                </div>
              </div>
              <div className="agent-pipeline-dataflow-arrow">→</div>
              <div className="agent-pipeline-dataflow-item">
                <span className="text-xs text-slate-400">Output</span>
                <div className="agent-pipeline-dataflow-box">
                  Structured Artifact
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Activity indicator */}
        {!resultArrived && (
          <div className="agent-pipeline-activity">
            <div className="agent-activity-dots">
              <div className="agent-activity-dot" />
              <div className="agent-activity-dot" />
              <div className="agent-activity-dot" />
            </div>
            <p className="text-sm text-[#2563eb] dark:text-[#93c5fd]">
              {PIPELINE_STAGES[activeStage].description}...
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// List-to-Collection Adapter
// ────────────────────────────────────────────────────────────────

/**
 * Detects list-shaped ExplanationOutput (entityId starts with "list:",
 * multiple facts.details entries) and converts to CollectionOutput
 * so the CollectionArtifact renders instead of a linear dump.
 *
 * Returns null if the explanation is not a list.
 */
const STATUS_CANONICAL: Record<string, string> = {
  active: "active",
  inactive: "inactive",
  "in active": "inactive",
  open: "open",
  closed: "closed",
  "in progress": "in progress",
  in_progress: "in progress",
  pending: "pending",
  scheduled: "scheduled",
  todo: "todo",
  done: "done",
  completed: "completed",
  cancelled: "cancelled",
  canceled: "cancelled",
  draft: "draft",
  planned: "planned",
  overdue: "overdue",
  blocked: "blocked",
  unread: "unread",
  paid: "paid",
  resolved: "resolved",
};

function normalizeToken(value?: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function looksLikeDate(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  return (
    /\b\d{4}-\d{2}-\d{2}\b/.test(text) ||
    /\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/.test(text) ||
    /\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b/i.test(
      text,
    )
  );
}

function looksLikePhone(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/@/.test(text)) return false;
  const digits = text.replace(/\D/g, "");
  return digits.length >= 7 && digits.length <= 15;
}

function looksLikeReference(value: string): boolean {
  const text = String(value || "").trim();
  if (!text) return false;
  if (/\s/.test(text) && !/\d/.test(text)) return false;
  return (
    /[0-9]/.test(text) ||
    /[_/-]/.test(text) ||
    /^[A-Z]{2,}[A-Z0-9_-]*$/.test(text)
  );
}

function sanitizePublicIdentifier(value?: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  if (/^id\s*[:#-]?\s*\d+$/i.test(normalized)) return "";
  if (/^\d+$/.test(normalized)) return "";
  return normalized;
}

function extractStatusWithRemainder(segment: string): {
  status?: string;
  remainder: string;
} {
  const trimmed = String(segment || "").trim();
  if (!trimmed) return { remainder: "" };
  const normalized = normalizeToken(trimmed);
  const orderedStatuses = Object.keys(STATUS_CANONICAL).sort(
    (a, b) => b.length - a.length,
  );
  for (const key of orderedStatuses) {
    const canonical = STATUS_CANONICAL[key];
    if (normalized === key) {
      return { status: canonical, remainder: "" };
    }
    if (normalized.startsWith(`${key} `)) {
      const prefixMatch = trimmed.match(
        new RegExp(`^${key.replace(/\s+/g, "\\s+")}\\s+`, "i"),
      );
      const remainder = prefixMatch
        ? trimmed.slice(prefixMatch[0].length).trim()
        : "";
      return { status: canonical, remainder };
    }
  }
  return { remainder: trimmed };
}

function extractPriority(
  value: string,
): CollectionItem["priority"] | undefined {
  const normalized = normalizeToken(value);
  if (!normalized) return undefined;
  if (normalized === "critical") return "critical";
  if (normalized === "high") return "high";
  if (normalized === "low") return "low";
  if (normalized === "medium" || normalized === "normal") return "normal";
  if (normalized.startsWith("priority ")) {
    return mapPriority(normalized.replace(/^priority\s+/, ""));
  }
  return undefined;
}

function extractDateInfo(
  value: string,
): { date: string; dateLabel?: string } | null {
  const trimmed = String(value || "").trim();
  if (!trimmed) return null;
  const due = trimmed.match(/^due\s+(.+)$/i);
  if (due) return { date: due[1].trim(), dateLabel: "Due" };
  const scheduled = trimmed.match(/^scheduled(?:\s+at)?\s+(.+)$/i);
  if (scheduled) return { date: scheduled[1].trim(), dateLabel: "Scheduled" };
  if (looksLikeDate(trimmed)) return { date: trimmed };
  return null;
}

function parseListDetailToItem(
  detail: string,
  entityType: string,
  index: number,
): CollectionItem | null {
  const raw = String(detail || "").trim();
  if (!raw) return null;

  const dashMatch = raw.match(/^(.+?)\s+—\s+(.+)$/);
  if (!dashMatch) {
    const kvMatch = raw.match(/^([^:]+):\s*(.+)$/);
    return {
      id: `${index}`,
      title: kvMatch ? kvMatch[2].trim() : raw,
      subtitle: kvMatch ? kvMatch[1].trim() : undefined,
      entityType,
      entityId: "",
      statusSeverity: "neutral",
    };
  }

  const left = dashMatch[1].trim();
  let right = dashMatch[2].trim();
  let parenMeta: string[] = [];

  const parenMatch = right.match(/^(.*)\(([^()]*)\)\s*$/);
  if (parenMatch) {
    right = parenMatch[1].trim();
    parenMeta = parenMatch[2]
      .split(/\s*,\s*/)
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const rightParts = right
    ? right
        .split(/\s*•\s*/)
        .map((s) => s.trim())
        .filter(Boolean)
    : [];
  const metadataParts = [...rightParts, ...parenMeta];

  let status: string | undefined;
  let priority: CollectionItem["priority"] | undefined;
  let date: string | undefined;
  let dateLabel: string | undefined;
  let titleFromRight: string | undefined;
  const metrics: { label: string; value: string | number }[] = [];

  const registerDetailMetric = (value: string) => {
    if (!value) return;
    if (
      !metrics.some(
        (m) => String(m.value).toLowerCase() === value.toLowerCase(),
      )
    ) {
      metrics.push({ label: "Detail", value });
    }
  };

  const consumePart = (value: string) => {
    let part = String(value || "").trim();
    if (!part) return;

    const keyValueMetric = part.match(/^([^:]+):\s*(.+)$/);
    if (keyValueMetric) {
      metrics.push({
        label: keyValueMetric[1].trim(),
        value: keyValueMetric[2].trim(),
      });
      return;
    }

    if (part.includes("@")) {
      metrics.push({ label: "Email", value: part });
      return;
    }
    if (looksLikePhone(part)) {
      metrics.push({ label: "Phone", value: part });
      return;
    }

    if (!status) {
      const extracted = extractStatusWithRemainder(part);
      if (extracted.status) {
        status = extracted.status;
        part = extracted.remainder;
      }
    }

    if (!priority) {
      const extractedPriority = extractPriority(part);
      if (extractedPriority) {
        priority = extractedPriority;
        return;
      }
    }

    if (!date) {
      const dueTail = part.match(/^(.*)\bdue\s+(.+)$/i);
      if (dueTail) {
        const beforeDue = dueTail[1].trim();
        if (beforeDue) registerDetailMetric(beforeDue);
        date = dueTail[2].trim();
        dateLabel = "Due";
        return;
      }
      const extractedDate = extractDateInfo(part);
      if (extractedDate) {
        date = extractedDate.date;
        dateLabel = extractedDate.dateLabel;
        return;
      }
    }

    if (!titleFromRight && !status && !priority && !date) {
      titleFromRight = part;
      return;
    }

    registerDetailMetric(part);
  };

  for (const part of metadataParts) {
    consumePart(part);
  }

  const leftIdentifier = sanitizePublicIdentifier(left);
  const title = titleFromRight || left;

  let subtitle: string | undefined;
  if (
    titleFromRight &&
    leftIdentifier &&
    leftIdentifier !== title &&
    looksLikeReference(left)
  ) {
    subtitle = leftIdentifier;
  } else {
    const emailMetric = metrics.find((m) => m.label === "Email");
    if (emailMetric) subtitle = String(emailMetric.value);
  }

  const entityId = looksLikeReference(leftIdentifier) ? leftIdentifier : "";

  return {
    id: `${index}`,
    title,
    subtitle,
    status,
    statusSeverity: mapStatusSeverity(status),
    priority,
    date,
    dateLabel,
    metrics: metrics.length > 0 ? metrics : undefined,
    entityType,
    entityId,
  };
}

function tryConvertToCollection(
  explanation: ExplanationOutput,
): CollectionOutput | null {
  if (!explanation.entityId?.startsWith("list:")) return null;

  const details = explanation.facts?.details;
  if (!details || details.length < 2) return null;

  const entityType = explanation.entityType || "item";
  const items: CollectionItem[] = [];

  for (let i = 0; i < details.length; i++) {
    const detail = details[i].trim();
    if (!detail) continue;
    const parsed = parseListDetailToItem(detail, entityType, i);
    if (parsed) items.push(parsed);
  }

  if (items.length < 2) return null;

  // Extract insights from interpretation statements
  const insights: string[] = [];
  if (explanation.interpretation?.statements) {
    for (const stmt of explanation.interpretation.statements) {
      insights.push(stmt.statement);
    }
  }

  const canGroupByStatus = items.every(
    (item) => typeof item.status === "string" && item.status.trim().length > 0,
  );
  const canGroupByPriority = items.every(
    (item) =>
      typeof item.priority === "string" && item.priority.trim().length > 0,
  );

  return {
    type: "collection",
    entityType,
    totalCount: items.length,
    items,
    summary:
      explanation.facts?.summary || `${items.length} ${entityType}(s) found.`,
    groupBy: canGroupByStatus
      ? "status"
      : canGroupByPriority
        ? "priority"
        : undefined,
    insights: insights.length > 0 ? insights : undefined,
    followUps: explanation.followUps,
  };
}

function mapStatusSeverity(status?: string): CollectionItem["statusSeverity"] {
  if (!status) return "neutral";
  const s = status.toLowerCase().replace(/_/g, " ");
  if (["overdue", "blocked", "failed", "rejected"].includes(s)) return "error";
  if (["on hold", "on_hold", "pending", "urgent"].includes(s)) return "warning";
  if (["active", "open", "in progress", "in_progress"].includes(s))
    return "success";
  if (["completed", "closed", "done", "resolved"].includes(s)) return "success";
  return "neutral";
}

function mapPriority(priority?: string): CollectionItem["priority"] {
  if (!priority) return undefined;
  const p = priority.toLowerCase().trim();
  if (p === "critical") return "critical";
  if (p === "high") return "high";
  if (p === "low") return "low";
  return "normal";
}

function isChatbotActionBlockType(dataType?: string): boolean {
  return (
    dataType === "proposal" ||
    dataType === "document_generation_preview" ||
    dataType === "document_generation_missing_fields" ||
    dataType === "context_suggestion" ||
    dataType === "clarification"
  );
}

function isProposalMessageData(
  data: AgentMessageData | undefined,
): data is AgentMessageData & { type: "proposal"; proposal: NonNullable<AgentMessageData["proposal"]> } {
  return data?.type === "proposal" && Boolean(data.proposal);
}

function buildGenericContextRows(message: AgentMessage): Array<{ label: string; value: string }> {
  const rows: Array<{ label: string; value: string }> = [];
  const dataType = message.data?.type;
  if (!dataType) return rows;
  rows.push({ label: "Type", value: dataType.replace(/_/g, " ") });

  if (dataType === "web_search_results" || dataType === "web_deep_search_results") {
    const data = message.data.webSearchResults;
    if (data) {
      rows.push({ label: "Sources", value: String(data.results?.length || 0) });
      if (data.query) rows.push({ label: "Query", value: String(data.query) });
      if (data.status) rows.push({ label: "Status", value: String(data.status) });
    }
    return rows;
  }

  if (dataType === "collection" && message.data.collection) {
    rows.push({ label: "Items", value: String(message.data.collection.items?.length || 0) });
    if (message.data.collection.entityType) {
      rows.push({ label: "Entity", value: String(message.data.collection.entityType) });
    }
    return rows;
  }

  if (dataType === "explanation" && message.data.explanation) {
    if (message.data.explanation.entityType) {
      rows.push({ label: "Entity", value: String(message.data.explanation.entityType) });
    }
    if (message.data.explanation.entityId) {
      rows.push({ label: "Reference", value: String(message.data.explanation.entityId) });
    }
    const detailCount = message.data.explanation.facts?.details?.length || 0;
    if (detailCount > 0) rows.push({ label: "Facts", value: String(detailCount) });
    return rows;
  }

  if (dataType === "recovery" && message.data.recovery) {
    rows.push({
      label: "Retry",
      value: message.data.recovery.canRetry ? "available" : "not available",
    });
    return rows;
  }

  return rows;
}

function ChatbotContextPanel({
  summary,
}: {
  summary: ChatContextSummaryOutput | { title?: string; summary?: string; rows: Array<{ label: string; value: string }> };
}) {
  const rows = Array.isArray(summary?.rows) ? summary.rows.filter((r) => r?.label && r?.value) : [];
  if (rows.length === 0) return null;
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {summary.title || "Context"}
          </div>
          {summary.summary ? (
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {summary.summary}
            </div>
          ) : null}
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-slate-400" />
        ) : (
          <ChevronDown className="w-4 h-4 text-slate-400" />
        )}
      </button>
      {open ? (
        <div className="px-3 pb-3 grid gap-1.5">
          {rows.map((row, idx) => (
            <div key={`${row.label}-${idx}`} className="flex items-start justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400">{row.label}</span>
              <span className="text-slate-800 dark:text-slate-200 text-right break-words">
                {row.value}
              </span>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function MinimalChatbotTurn(props: {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
  activeSessionId?: string;
  activeSessionMessages?: AgentMessage[];
  updateSessionMessages?: (id: string, messages: AgentMessage[]) => void;
}) {
  const { message } = props;
  const dataType = message.data?.type;
  const hasContent = Boolean(message.content && message.content.trim().length > 0);
  const suppressStandaloneChatBubble = dataType === "proposal" && Boolean(message.data?.proposal);
  const mutationStatus = !isProposalMessageData(message.data) && message.chatbotTurn?.mutation ? (
    <ChatbotMutationStatus mutation={message.chatbotTurn.mutation} />
  ) : null;

  let attachment: JSX.Element | null = null;
  if (message.data) {
    if (isChatbotActionBlockType(dataType)) {
      attachment = <ArtifactBody {...props} />;
    }
  }

  if (!hasContent && attachment) {
    return (
      <div className="space-y-2">
        {attachment}
        {mutationStatus}
      </div>
    );
  }

  if (!hasContent && message.data) {
    return (
      <div className="space-y-2">
        <ArtifactBody {...props} />
        {mutationStatus}
      </div>
    );
  }

  if (!hasContent && !attachment && mutationStatus) {
    return mutationStatus;
  }

  return (
    <div className="space-y-2">
      {hasContent && !suppressStandaloneChatBubble ? <ChatArtifact content={message.content} /> : null}
      {mutationStatus}
      {attachment}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Artifact Body — renders the correct artifact based on data type
// ────────────────────────────────────────────────────────────────

function ArtifactBody({
  message,
  onFollowUpClick,
  onExampleClick,
  onConfirmWebSearch,
  activeSessionId,
  activeSessionMessages,
  updateSessionMessages,
}: {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
  onConfirmWebSearch?: (metadata: AgentRequestMetadata) => void;
  activeSessionId?: string;
  activeSessionMessages?: AgentMessage[];
  updateSessionMessages?: (id: string, messages: AgentMessage[]) => void;
}) {
  const isError = message.status === "error";
  const hasContent = !!(message.content && message.content.length > 0);
  const dataType = message.data?.type;

  if (isError) {
    const fallbackRecovery = {
      type: "recovery" as const,
      message: "I could not complete that request.",
      whatHappened: message.content || "The request failed during processing.",
      canRetry: true,
      alternatives: [
        { label: "Retry request", action: "retry", prompt: "Retry the same request" },
      ],
      suggestedPrompts: ["Retry the same request"],
      context: null,
      severity: "temporary" as const,
    };
    return (
      <RecoveryArtifact
        data={fallbackRecovery}
        onExampleClick={onExampleClick}
      />
    );
  }

  // ── CLEAN CONTRACT: Context Suggestions ──
  // Driven ONLY by output.type, no nested field inspection
  if (dataType === "context_suggestion" && message.data?.contextSuggestion) {
    return (
      <ContextSuggestionRenderer
        data={message.data.contextSuggestion}
        onSelect={(suggestion) => {
          const selectionDisplayLabel = [
            String(suggestion.label || "").trim(),
            String(suggestion.subtitle || "").trim(),
          ]
            .filter(Boolean)
            .join("\n");
          const selectionCategory = message.data?.contextSuggestion?.category;
          const isInvoiceSelection = selectionCategory === "invoice_selection";
          const selectionClientId = suggestion.scope?.clientId;
          const resolvedEntity =
            isInvoiceSelection && selectionClientId
              ? {
                  type: "client",
                  id: selectionClientId,
                  label: selectionDisplayLabel || suggestion.label || "Selected client",
                }
              : {
                  type: suggestion.entityType,
                  id: suggestion.entityId,
                  label: selectionDisplayLabel || suggestion.label,
                };
          // Send resolution payload preserving original intent
          const payload = {
            intent: "RESOLVE_CONTEXT_AND_CONTINUE",
            originalIntent: message.data.contextSuggestion.originalIntent,
            originalDraftType: message.data.contextSuggestion.originalDraftType,
            originalMessage: message.data.contextSuggestion.originalMessage,
            pendingOperationId: message.data.contextSuggestion.pendingOperationId,
            resolvedEntity,
            entityType: suggestion.entityType,
            entityId: suggestion.entityId,
            scope: suggestion.scope,
            resolutionInput: {
              entityType: suggestion.entityType,
              id: suggestion.entityId,
              reference: suggestion.subtitle || undefined,
              name: suggestion.label || undefined,
            },
            label: selectionDisplayLabel || suggestion.label,
            selectionId: isInvoiceSelection
              ? String(suggestion.entityId ?? suggestion.id)
              : suggestion.id,
            selectionCategory,
            reason: "User selected context suggestion",
            origin: {
              entity: suggestion.entityType.toUpperCase(),
              entityId: suggestion.entityId,
            },
          };
          console.log("[DEBUG] Sending context resolution payload:", payload);
          console.log(
            "[DEBUG] contextSuggestion data:",
            message.data.contextSuggestion,
          );
          onFollowUpClick?.(payload);
        }}
      />
    );
  }

  if (dataType === "explanation" && message.data?.explanation) {
    // Detect list-shaped explanations and route to CollectionArtifact
    const collectionData = tryConvertToCollection(message.data.explanation);
    if (collectionData) {
      return (
        <CollectionArtifact
          data={collectionData}
          onFollowUpClick={onFollowUpClick}
        />
      );
    }
    return (
      <ExplanationArtifact
        data={message.data.explanation}
        intent={message.intent}
        onFollowUpClick={onFollowUpClick}
      />
    );
  }
  if (dataType === "risks" && message.data?.risks) {
    return <RiskArtifact data={message.data.risks} />;
  }
  if (dataType === "draft" && message.data?.draft) {
    return (
      <DraftArtifact
        data={message.data.draft}
        onSave={(sections) => {
          if (!activeSessionId || !activeSessionMessages) return;
          const updatedMessages = activeSessionMessages.map((msg) => {
            if (msg.id !== message.id) return msg;
            if (msg.data?.type !== "draft" || !msg.data?.draft) return msg;
            return {
              ...msg,
              data: {
                ...msg.data,
                draft: {
                  ...msg.data.draft,
                  sections: {
                    ...msg.data.draft.sections,
                    subject: sections.subject,
                    greeting: sections.greeting,
                    body: sections.body,
                    closing: sections.closing,
                    signature: sections.signature,
                  },
                },
              },
            };
          });
          if (updateSessionMessages) {
            updateSessionMessages(activeSessionId, updatedMessages);
          }
        }}
      />
    );
  }
  if (dataType === "document_draft" && message.data?.documentDraft) {
    const draftData = message.data.documentDraft;
    const proposalData = message.data.proposal;
    return (
      <div className="space-y-3">
        <DocumentDraftArtifact
          data={draftData}
          onSave={({ title, content }) => {
            if (!activeSessionId || !activeSessionMessages || !updateSessionMessages) return;
            const updatedMessages = activeSessionMessages.map((msg) => {
              if (msg.id !== message.id) return msg;
              if (msg.data?.type !== "document_draft" || !msg.data?.documentDraft) return msg;
              return {
                ...msg,
                data: {
                  ...msg.data,
                  documentDraft: {
                    ...msg.data.documentDraft,
                    title,
                    content,
                  },
                },
              };
            });
            updateSessionMessages(activeSessionId, updatedMessages);
          }}
        />
        {proposalData ? (
          <SemanticConfirmationErrorBoundary>
            <ProposalArtifact
              data={proposalData}
              onConfirm={async (proposalId, options) => {
                const sessionId = proposalData.sessionId;
                const execResult = await confirmProposal(proposalId, sessionId, options);
                if (activeSessionId && activeSessionMessages && updateSessionMessages) {
                  const safeMsg =
                    execResult.error?.safeMessage ||
                    execResult.error?.message ||
                    "Execution failed";
                  const nextMessages = activeSessionMessages.map((msg) => {
                    if (msg.id !== message.id) return msg;
                    if (!msg.data?.proposal) return msg;
                    return {
                      ...msg,
                      data: {
                        ...msg.data,
                        proposal: {
                          ...msg.data.proposal,
                          proposals: (msg.data.proposal.proposals || []).map((p) =>
                            p.proposalId !== proposalId
                              ? p
                              : {
                                  ...p,
                                  uiState:
                                    execResult.status === "success"
                                      ? { status: "confirmed" as const, executionResult: execResult }
                                      : {
                                          status: "failed" as const,
                                          error: safeMsg,
                                          executionResult: execResult,
                                        },
                                },
                          ),
                        },
                      },
                    };
                  });
                  updateSessionMessages(activeSessionId, nextMessages);
                }
                return execResult;
              }}
              onCancel={(proposalId) => {
                if (activeSessionId && activeSessionMessages && updateSessionMessages) {
                  const nextMessages = activeSessionMessages.map((msg) => {
                    if (msg.id !== message.id) return msg;
                    if (!msg.data?.proposal) return msg;
                    return {
                      ...msg,
                      data: {
                        ...msg.data,
                        proposal: {
                          ...msg.data.proposal,
                          proposals: (msg.data.proposal.proposals || []).map((p) =>
                            p.proposalId !== proposalId
                              ? p
                              : { ...p, uiState: { status: "cancelled" as const } },
                          ),
                        },
                      },
                    };
                  });
                  updateSessionMessages(activeSessionId, nextMessages);
                }
              }}
            />
          </SemanticConfirmationErrorBoundary>
        ) : null}
      </div>
    );
  }
  if (dataType === "actions" && message.data?.actionProposals) {
    return (
      <ActionArtifact
        data={message.data.actionProposals}
        onExecute={(proposalId, sessionId) =>
          confirmProposal(proposalId, sessionId)
        }
      />
    );
  }
  if (dataType === "collection" && message.data?.collection) {
    return (
      <CollectionArtifact
        data={message.data.collection}
        onFollowUpClick={onFollowUpClick}
      />
    );
  }
  if (dataType === "clarification" && message.data?.clarification) {
    const searchRequest = message.data.clarification.searchRequest;
    return (
      <ClarificationArtifact
        data={message.data.clarification}
        onConfirmWebSearch={
          onConfirmWebSearch
            ? () =>
                onConfirmWebSearch({
                  webSearchEnabled: true,
                  webSearchTrigger: "user_confirmed",
                  webSearchQuery: searchRequest?.query || message.content || "",
                  webSearchIntent: searchRequest?.searchIntent || "WEB_SEARCH",
                  webDeepSearchEnabled:
                    (searchRequest?.searchIntent || "WEB_SEARCH") ===
                    "DEEP_SEARCH",
                  webDeepSearchTrigger:
                    (searchRequest?.searchIntent || "WEB_SEARCH") ===
                    "DEEP_SEARCH"
                      ? "user_confirmed"
                      : undefined,
                  webDeepSearchQuery:
                    (searchRequest?.searchIntent || "WEB_SEARCH") ===
                    "DEEP_SEARCH"
                      ? searchRequest?.query || message.content || ""
                      : undefined,
                })
            : undefined
        }
      />
    );
  }
  if (
    (dataType === "web_search_results" ||
      dataType === "web_deep_search_results") &&
    message.data?.webSearchResults
  ) {
    return (
      <WebSearchResultsArtifact
        data={message.data.webSearchResults}
        onConfirmWebSearch={onConfirmWebSearch}
        commentaryMessage={message.commentary?.message}
        isLive={message.status === "sending"}
      />
    );
  }
  if (
    dataType === "document_generation_preview" &&
    message.data?.documentGenerationPreview
  ) {
    return (
      <DocumentGenerationPreviewArtifact
        data={message.data.documentGenerationPreview}
        onConfirm={async (editedMarkdown?: string) => {
          if (!activeSessionId || !activeSessionMessages || !updateSessionMessages) {
            throw new Error("Session not available for preview confirmation");
          }
          const proposal = await confirmDocumentGenerationPreview(
            message.data!.documentGenerationPreview!.previewId,
            activeSessionId,
            editedMarkdown,
          );
          const updatedMessages = activeSessionMessages.map((msg) => {
            if (msg.id !== message.id) return msg;
            return {
              ...msg,
              data: {
                type: "proposal" as const,
                proposal,
              },
            };
          });
          updateSessionMessages(activeSessionId, updatedMessages);
        }}
        onCancel={async () => {
          await cancelDocumentGenerationPreview(
            message.data!.documentGenerationPreview!.previewId,
          );
          if (activeSessionId && activeSessionMessages && updateSessionMessages) {
            const updatedMessages = activeSessionMessages.map((msg) => {
              if (msg.id !== message.id) return msg;
              return {
                ...msg,
                data: {
                  ...msg.data!,
                  documentGenerationPreview: {
                    ...msg.data!.documentGenerationPreview!,
                    structuredSummaryMetadata: {
                      ...msg.data!.documentGenerationPreview!.structuredSummaryMetadata,
                      status: "cancelled",
                    },
                  },
                },
              };
            });
            updateSessionMessages(activeSessionId, updatedMessages);
          }
        }}
      />
    );
  }
  if (isProposalMessageData(message.data)) {
    return (
      <SemanticConfirmationErrorBoundary>
        <ProposalArtifact
          data={message.data.proposal}
          onConfirm={async (proposalId, options) => {
            const sessionId = message.data.proposal.sessionId;
            const execResult = await confirmProposal(proposalId, sessionId, options);
            if (activeSessionId && activeSessionMessages && updateSessionMessages) {
              const safeMsg =
                execResult.error?.safeMessage ||
                execResult.error?.message ||
                "Execution failed";
              const nextMessages = activeSessionMessages.map((msg) => {
                if (msg.id !== message.id) return msg;
                if (msg.data?.type !== "proposal" || !msg.data?.proposal) return msg;
                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    proposal: {
                      ...msg.data.proposal,
                      proposals: (msg.data.proposal.proposals || []).map((p) =>
                        p.proposalId !== proposalId
                          ? p
                          : {
                              ...p,
                              uiState:
                                execResult.status === "success"
                                  ? { status: "confirmed" as const, executionResult: execResult }
                                  : {
                                      status: "failed" as const,
                                      error: safeMsg,
                                      executionResult: execResult,
                                    },
                            },
                      ),
                    },
                  },
                };
              });
              updateSessionMessages(activeSessionId, nextMessages);
            }
            return execResult;
          }}
          onCancel={(proposalId) => {
            if (activeSessionId && activeSessionMessages && updateSessionMessages) {
              const nextMessages = activeSessionMessages.map((msg) => {
                if (msg.id !== message.id) return msg;
                if (msg.data?.type !== "proposal" || !msg.data?.proposal) return msg;
                return {
                  ...msg,
                  data: {
                    ...msg.data,
                    proposal: {
                      ...msg.data.proposal,
                      proposals: (msg.data.proposal.proposals || []).map((p) =>
                        p.proposalId !== proposalId
                          ? p
                          : { ...p, uiState: { status: "cancelled" as const } },
                      ),
                    },
                  },
                };
              });
              updateSessionMessages(activeSessionId, nextMessages);
            }
            // Cancel is UI-only — proposal expires server-side after 5 minutes
          }}
        />
      </SemanticConfirmationErrorBoundary>
    );
  }
  if (dataType === "recovery" && message.data?.recovery) {
    return (
      <RecoveryArtifact
        data={message.data.recovery}
        onExampleClick={onExampleClick}
      />
    );
  }
  if (
    dataType === "document_generation_missing_fields" &&
    message.data?.documentGenerationMissingFields
  ) {
    const missing = message.data.documentGenerationMissingFields.missingFields || [];
    const targetField = missing.find((f) =>
      String(f.reason || "").toLowerCase().includes("target_not_found"),
    );
    const receivedRefMatch = String(targetField?.example || "").match(/received:\s*([^)]+)/i);
    const receivedRef = receivedRefMatch?.[1]?.trim() || null;
    const prompts = missing
      .map((f) => String(f.example || "").trim())
      .filter(Boolean)
      .slice(0, 4);
    const targetNotFoundMessage = receivedRef
      ? `Sorry, I couldn't find a matching dossier for "${receivedRef}".`
      : "Sorry, I couldn't find the target dossier for this request.";
    return (
      <RecoveryArtifact
        data={{
          type: "recovery",
          message: targetField ? targetNotFoundMessage : message.data.documentGenerationMissingFields.message,
          whatHappened: targetField
            ? "I can still help right away if you pick an existing dossier or choose an alternative path."
            : "I can continue as soon as the missing details are provided.",
          canRetry: true,
          alternatives: targetField
            ? [
                {
                  label: "Choose another existing dossier",
                  action: "select_existing_dossier",
                  prompt: "Show recent dossiers so I can choose one",
                },
                {
                  label: "Create this dossier first",
                  action: "create_dossier",
                  prompt: `Create a new dossier${receivedRef ? ` with reference ${receivedRef}` : ""}`,
                },
                {
                  label: "Generate a generic version without dossier link",
                  action: "generate_generic_document",
                  prompt: "Generate this letter as a generic template without linking it to a dossier",
                },
              ]
            : missing.map((f) => ({
                label: f.label || f.path,
                action: "provide_missing_field",
                prompt: f.example || undefined,
              })),
          suggestedPrompts: targetField
            ? [
                "Show recent dossiers so I can choose one",
                `Create a new dossier${receivedRef ? ` with reference ${receivedRef}` : ""}`,
                "Generate this letter as a generic template without linking it to a dossier",
              ]
            : prompts,
          context: null,
          severity: "blocking",
        }}
        onExampleClick={onExampleClick}
      />
    );
  }
  if (hasContent) {
    return <ChatArtifact content={message.content} />;
  }

  return null;
}

// ────────────────────────────────────────────────────────────────
// Helpers — intent to human-readable text
// ────────────────────────────────────────────────────────────────

/**
 * Generates a contextual acknowledgment line.
 * Not "I'll help you" (chatbot), but a direct statement of what's happening.
 */
function getAcknowledgment(intent?: string): string {
  if (!intent) return "Processing request...";

  const n = intent.toUpperCase();

  if (n.includes("SEARCH_DEEP_WEB")) return "Running deep legal research...";
  if (n.includes("WEB_SEARCH")) return "Searching public web sources...";
  if (n.includes("SEARCH_WEB")) return "Searching public web sources...";
  if (n.includes("DEEP_SEARCH")) return "Running deep legal research...";

  // Read intents
  if (n.includes("READ_CLIENT") || n.includes("LIST_CLIENT"))
    return "Retrieving client information...";
  if (n.includes("READ_DOSSIER") || n.includes("LIST_DOSSIER"))
    return "Retrieving dossier records...";
  if (n.includes("READ_LAWSUIT") || n.includes("LIST_LAWSUIT"))
    return "Retrieving lawsuit details...";
  if (n.includes("READ_SESSION") || n.includes("LIST_SESSION"))
    return "Retrieving session data...";
  if (n.includes("READ_TASK") || n.includes("LIST_TASK"))
    return "Retrieving task records...";

  // Explain intents
  if (n.includes("EXPLAIN_CLIENT")) return "Analyzing client state...";
  if (n.includes("EXPLAIN_DOSSIER")) return "Analyzing dossier state...";
  if (n.includes("EXPLAIN_LAWSUIT")) return "Analyzing lawsuit state...";
  if (n.includes("EXPLAIN_SESSION")) return "Analyzing session state...";
  if (n.includes("EXPLAIN_TASK")) return "Analyzing task state...";
  if (n.includes("EXPLAIN")) return "Analyzing entity state...";

  // Summarize intents
  if (n.includes("SUMMARIZE_CLIENT")) return "Compiling client summary...";
  if (n.includes("SUMMARIZE_DOSSIER")) return "Compiling dossier summary...";
  if (n.includes("SUMMARIZE_LAWSUIT")) return "Compiling lawsuit summary...";
  if (n.includes("SUMMARIZE_SESSION")) return "Compiling session summary...";
  if (n.includes("SUMMARIZE")) return "Compiling summary...";

  // Risk analysis
  if (n.includes("RISK") || n.includes("ANALYZE"))
    return "Running risk analysis...";

  // Drafts
  if (n.includes("DRAFT_INVITATION")) return "Preparing invitation draft...";
  if (n.includes("DRAFT_CLIENT_EMAIL")) return "Preparing email draft...";
  if (n.includes("DRAFT")) return "Generating draft document...";

  // Actions
  if (n.includes("PROPOSE") || n.includes("ACTION"))
    return "Evaluating possible actions...";

  // Commands and follow-ups
  if (n === "COMMAND") return "Executing command...";
  if (n === "FOLLOW_UP") return "Processing follow-up...";

  // General
  if (n.includes("LIST")) return "Querying records...";
  if (n === "GENERAL_CHAT") return "Preparing response...";

  return "Processing request...";
}

/**
 * Maps intents to concrete work steps.
 * These reflect actual backend operations.
 */
function getWorkSteps(intent?: string): string[] {
  if (!intent) return ["Classifying request"];

  const n = intent.toUpperCase();

  if (n.includes("SEARCH_DEEP_WEB")) {
    return [
      "Request classified",
      "Checking deep-search activation",
      "Running explicit deep search",
      "Aggregating expanded queries",
      "Formatting deep-search results",
    ];
  }
  if (n.includes("WEB_SEARCH")) {
    return [
      "Request classified",
      "Running explicit web search",
      "Collecting cited sources",
      "Formatting search results",
    ];
  }
  if (n.includes("SEARCH_WEB")) {
    return [
      "Request classified",
      "Checking external-search activation",
      "Running explicit web search",
      "Collecting cited sources",
      "Formatting search results",
    ];
  }

  if (n.includes("DEEP_SEARCH")) {
    return [
      "Request classified",
      "Running explicit deep search",
      "Collecting legal citations",
      "Highlighting uncertainties",
      "Formatting research output",
    ];
  }

  if (n.includes("READ") || n.includes("LIST")) {
    return [
      "Request classified",
      "Querying database",
      "Evaluating context",
      "Formatting results",
    ];
  }

  if (n.includes("EXPLAIN")) {
    return [
      "Request classified",
      "Loading entity data",
      "Fetching related records",
      "Evaluating context",
      "Building explanation",
    ];
  }

  if (n.includes("SUMMARIZE")) {
    return [
      "Request classified",
      "Loading entity data",
      "Loading related sessions and tasks",
      "Loading financial records",
      "Compiling summary",
    ];
  }

  if (n.includes("RISK") || n.includes("ANALYZE")) {
    return [
      "Request classified",
      "Loading entity data",
      "Checking deadlines and dependencies",
      "Scanning for inconsistencies",
      "Computing risk scores",
    ];
  }

  if (n.includes("DRAFT")) {
    return [
      "Request classified",
      "Loading context and entity data",
      "Selecting template and tone",
      "Generating draft content",
    ];
  }

  if (n.includes("PROPOSE") || n.includes("ACTION")) {
    return [
      "Request classified",
      "Analyzing current state",
      "Identifying available actions",
      "Checking permissions and policies",
    ];
  }

  if (n === "COMMAND" || n === "FOLLOW_UP") {
    return ["Processing command", "Executing"];
  }

  return ["Request classified", "Preparing response"];
}
