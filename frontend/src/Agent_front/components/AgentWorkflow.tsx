import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Loader2, Brain, Database, Search, Shield, FileOutput, X, ChevronDown, ChevronUp } from "lucide-react";
import { AgentMessage } from "../types/agentMessage";
import type { FollowUpSuggestion, ExplanationOutput, CollectionOutput, CollectionItem } from "../../services/api/agent";

// Artifact renderers
import { ExplanationArtifact } from "./artifacts/ExplanationArtifact";
import { RiskArtifact } from "./artifacts/RiskArtifact";
import { DraftArtifact } from "./artifacts/DraftArtifact";
import { ActionArtifact } from "./artifacts/ActionArtifact";
import { ChatArtifact } from "./artifacts/ChatArtifact";
import { ErrorArtifact } from "./artifacts/ErrorArtifact";
import { ClarificationArtifact } from "./artifacts/ClarificationArtifact";
import { CollectionArtifact } from "./artifacts/CollectionArtifact";
import { FollowUpSuggestions } from "./artifacts/FollowUpSuggestions";
import { CommentaryBubble } from "./artifacts/CommentaryBubble";
import { MarkdownOutput } from "../../components/MarkdownOutput";
import { decideCommentary, filterFollowUps, getResultCountFromMessage } from "../utils/responsePolicy";

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
const MIN_WORKING_DURATION = 900;

// How long the reveal animation takes before we consider it "complete"
const REVEAL_DURATION = 400;

interface AgentWorkflowProps {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
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
export function AgentWorkflow({ message, onFollowUpClick, onExampleClick }: AgentWorkflowProps) {
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
  }, [isStreaming, isComplete, isError, message.intent, hasContent, hasStructuredResult]);

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
    return <IntentFramingMessage content={message.content} />;
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
            Analyzing request...
          </span>
        </div>
      </div>
    );
  }

  // Phase: streaming text (chat)
  if (displayPhase === "streaming") {
    return (
      <div className="agent-message-row">
        <div className="agent-bubble agent-chat-text text-[15px] leading-relaxed text-slate-800 dark:text-slate-200">
          <MarkdownOutput content={message.content} />
          <span className="inline-block w-1.5 h-4 ml-0.5 bg-slate-400 dark:bg-slate-500 animate-pulse rounded-sm align-text-bottom" />
        </div>
      </div>
    );
  }

  // Phase: working (acknowledged + work steps)
  if (displayPhase === "working") {
    return (
      <WorkingPhase
        intent={message.intent}
        resultArrived={resultArrivedRef.current}
      />
    );
  }

  // Phase: revealing (artifact expanding into view)
  if (displayPhase === "revealing") {
    const followUps = message.data?.explanation?.followUps;
    const resultCount = getResultCountFromMessage(message);
    const safeCommentary = decideCommentary(message);
    const filteredFollowUps = filterFollowUps(followUps, resultCount);

    return (
      <div className="space-y-4">
        {/* Artifact reveal */}
        <div className="artifact-reveal agent-artifact-focus">
          <ArtifactBody message={message} onFollowUpClick={onFollowUpClick} onExampleClick={onExampleClick} />
        </div>

        {/* Conversational commentary — appears AFTER artifact, BEFORE follow-ups */}
        {safeCommentary && (
          <CommentaryBubble commentary={safeCommentary} />
        )}
      </div>
    );
  }

  // Phase: complete
  const followUps = message.data?.explanation?.followUps;
  const resultCount = getResultCountFromMessage(message);
  const safeCommentary = decideCommentary(message);
  const filteredFollowUps = filterFollowUps(followUps, resultCount);

  const allowFollowUps = isComplete && filteredFollowUps.length > 0 && onFollowUpClick;

  return (
    <div className="space-y-4">
      <ArtifactBody message={message} onFollowUpClick={onFollowUpClick} onExampleClick={onExampleClick} />

      {/* Conversational commentary — appears AFTER artifact, BEFORE follow-ups */}
      {safeCommentary && (
        <CommentaryBubble commentary={safeCommentary} />
      )}

      {/* Follow-up suggestions — shown OUTSIDE the artifact card */}
      {allowFollowUps && (
        <FollowUpSuggestions
          followUps={filteredFollowUps}
          onFollowUpClick={onFollowUpClick}
        />
      )}
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
  // Track which stage we're on (0-4)
  const [activeStage, setActiveStage] = useState(0);
  // Track stage progress percentages
  const [stageProgress, setStageProgress] = useState<number[]>([0, 0, 0, 0, 0]);
  // Expanded details panel
  const [showDetails, setShowDetails] = useState(false);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const progressRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Progress through stages
  useEffect(() => {
    // Advance stage every 600ms
    intervalRef.current = setInterval(() => {
      setActiveStage((prev) => {
        if (prev >= PIPELINE_STAGES.length - 1) {
          if (intervalRef.current) clearInterval(intervalRef.current);
          return prev;
        }
        return prev + 1;
      });
    }, 600);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  // Animate progress bars
  useEffect(() => {
    progressRef.current = setInterval(() => {
      setStageProgress((prev) => {
        const next = [...prev];
        for (let i = 0; i <= activeStage; i++) {
          if (i < activeStage) {
            next[i] = 100; // Completed stages
          } else if (i === activeStage) {
            // Active stage progresses
            next[i] = Math.min(next[i] + 8, resultArrived ? 100 : 85);
          }
        }
        return next;
      });
    }, 100);

    return () => {
      if (progressRef.current) clearInterval(progressRef.current);
    };
  }, [activeStage, resultArrived]);

  // Fast-forward when result arrives
  useEffect(() => {
    if (resultArrived) {
      setActiveStage(PIPELINE_STAGES.length - 1);
      setStageProgress([100, 100, 100, 100, 100]);
    }
  }, [resultArrived]);

  const acknowledgment = getAcknowledgment(intent);
  const totalProgress = Math.round(stageProgress.reduce((a, b) => a + b, 0) / 5);

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
                  className="text-indigo-500 dark:text-indigo-400 agent-pipeline-progress-ring"
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
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                {acknowledgment}
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Stage {activeStage + 1} of {PIPELINE_STAGES.length}: {PIPELINE_STAGES[activeStage].label}
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
              <span className="text-xs">{showDetails ? "Hide" : "Details"}</span>
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
            const isComplete = idx < activeStage || (idx === activeStage && resultArrived);
            const isActive = idx === activeStage && !resultArrived;
            const isPending = idx > activeStage;
            const progress = stageProgress[idx];

            return (
              <div
                key={stage.id}
                className={`agent-pipeline-stage ${
                  isComplete ? "is-complete" : isActive ? "is-active" : "is-pending"
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
                <div className={`agent-pipeline-node agent-pipeline-node-${stage.color}`}>
                  {isComplete ? (
                    <Check className="w-4 h-4 text-white" />
                  ) : isActive ? (
                    <StageIcon className="w-4 h-4 text-white animate-pulse" />
                  ) : (
                    <StageIcon className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                  )}
                </div>

                {/* Stage label */}
                <span className={`agent-pipeline-label ${
                  isComplete
                    ? "text-slate-600 dark:text-slate-300"
                    : isActive
                      ? "text-slate-800 dark:text-slate-100 font-medium"
                      : "text-slate-400 dark:text-slate-500"
                }`}>
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
                const isComplete = idx < activeStage || (idx === activeStage && resultArrived);
                const isActive = idx === activeStage && !resultArrived;
                const StageIcon = stage.icon;

                return (
                  <div
                    key={stage.id}
                    className={`agent-pipeline-detail-card ${
                      isComplete ? "is-complete" : isActive ? "is-active" : "is-pending"
                    }`}
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <StageIcon className={`w-4 h-4 ${
                        isComplete
                          ? "text-emerald-500"
                          : isActive
                            ? "text-indigo-500 animate-pulse"
                            : "text-slate-400"
                      }`} />
                      <span className="text-xs font-semibold uppercase tracking-wide">
                        {stage.label}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {stage.description}
                    </p>
                    <div className="mt-2 h-1 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-300 ${
                          isComplete
                            ? "bg-emerald-500"
                            : isActive
                              ? "bg-indigo-500"
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
            <p className="text-sm text-indigo-700 dark:text-indigo-300">
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
function tryConvertToCollection(explanation: ExplanationOutput): CollectionOutput | null {
  if (!explanation.entityId?.startsWith("list:")) return null;

  const details = explanation.facts?.details;
  if (!details || details.length < 2) return null;

  const entityType = explanation.entityType || "item";
  const items: CollectionItem[] = [];

  for (let i = 0; i < details.length; i++) {
    const detail = details[i].trim();
    if (!detail) continue;

    // Parse pattern: "ID — Title (status, priority)"
    const match = detail.match(/^([^\s—]+)\s*—\s*(.+?)\s*\(([^)]+)\)\s*$/);
    if (match) {
      const id = match[1];
      const title = match[2].trim();
      const meta = match[3].split(/,\s*/);
      const status = meta[0] || undefined;
      const priority = meta[1] as CollectionItem["priority"] || undefined;

      items.push({
        id: `${i}`,
        title,
        subtitle: id,
        status,
        statusSeverity: mapStatusSeverity(status),
        priority: mapPriority(priority),
        entityType,
        entityId: id,
      });
    } else {
      // Fallback: try "Label: Value" or plain text
      const kvMatch = detail.match(/^([^:]+):\s*(.+)$/);
      items.push({
        id: `${i}`,
        title: kvMatch ? kvMatch[2].trim() : detail,
        subtitle: kvMatch ? kvMatch[1].trim() : undefined,
        entityType,
        entityId: `${i}`,
        statusSeverity: "neutral",
      });
    }
  }

  if (items.length < 2) return null;

  // Extract insights from interpretation statements
  const insights: string[] = [];
  if (explanation.interpretation?.statements) {
    for (const stmt of explanation.interpretation.statements) {
      insights.push(stmt.statement);
    }
  }

  return {
    type: "collection",
    entityType,
    totalCount: items.length,
    items,
    summary: explanation.facts?.summary || `${items.length} ${entityType}(s) found.`,
    groupBy: "status",
    insights: insights.length > 0 ? insights : undefined,
    followUps: explanation.followUps,
  };
}

function mapStatusSeverity(status?: string): CollectionItem["statusSeverity"] {
  if (!status) return "neutral";
  const s = status.toLowerCase().replace(/_/g, " ");
  if (["overdue", "blocked", "failed", "rejected"].includes(s)) return "error";
  if (["on hold", "on_hold", "pending", "urgent"].includes(s)) return "warning";
  if (["active", "open", "in progress", "in_progress"].includes(s)) return "success";
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

// ────────────────────────────────────────────────────────────────
// Artifact Body — renders the correct artifact based on data type
// ────────────────────────────────────────────────────────────────

function ArtifactBody({
  message,
  onFollowUpClick,
  onExampleClick,
}: {
  message: AgentMessage;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
  onExampleClick?: (example: string) => void;
}) {
  const isError = message.status === "error";
  const hasContent = !!(message.content && message.content.length > 0);
  const dataType = message.data?.type;

  if (isError) {
    return <ErrorArtifact content={message.content} onExampleClick={onExampleClick} />;
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
    return <DraftArtifact data={message.data.draft} />;
  }
  if (dataType === "actions" && message.data?.actionProposals) {
    return <ActionArtifact data={message.data.actionProposals} />;
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
    return <ClarificationArtifact data={message.data.clarification} />;
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

  if (n.includes("WEB_SEARCH")) return "Searching public web sources...";
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

  if (n.includes("WEB_SEARCH")) {
    return [
      "Request classified",
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
    return [
      "Processing command",
      "Executing",
    ];
  }

  return [
    "Request classified",
    "Preparing response",
  ];
}
