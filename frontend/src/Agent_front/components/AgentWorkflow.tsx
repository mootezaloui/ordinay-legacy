import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Loader2 } from "lucide-react";
import { AgentMessage } from "../types/agentMessage";
import type { FollowUpSuggestion } from "../../services/api/agent";

// Artifact renderers
import { ExplanationArtifact } from "./artifacts/ExplanationArtifact";
import { RiskArtifact } from "./artifacts/RiskArtifact";
import { DraftArtifact } from "./artifacts/DraftArtifact";
import { ActionArtifact } from "./artifacts/ActionArtifact";
import { ChatArtifact } from "./artifacts/ChatArtifact";
import { ErrorArtifact } from "./artifacts/ErrorArtifact";
import { ClarificationArtifact } from "./artifacts/ClarificationArtifact";
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
// Working Phase — the heart of the "agent doing work" experience
// ────────────────────────────────────────────────────────────────

function WorkingPhase({
  intent,
  resultArrived,
}: {
  intent?: string;
  resultArrived: boolean;
}) {
  const steps = getWorkSteps(intent);

  // Progress through steps over time to create sense of movement
  const [visibleSteps, setVisibleSteps] = useState(1);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    // Reveal one step every 350ms
    intervalRef.current = setInterval(() => {
      setVisibleSteps((prev) => {
        const next = prev + 1;
        // If result arrived and we've shown all steps, stop
        if (next >= steps.length) {
          if (intervalRef.current) clearInterval(intervalRef.current);
        }
        return Math.min(next, steps.length);
      });
    }, 350);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [steps.length]);

  // When result arrives, fast-forward to all steps complete
  useEffect(() => {
    if (resultArrived) {
      const timer = setTimeout(() => setVisibleSteps(steps.length), 150);
      return () => clearTimeout(timer);
    }
  }, [resultArrived, steps.length]);

  const acknowledgment = getAcknowledgment(intent);

  return (
    <div className="workflow-phase-enter agent-message-row">
      <div className="agent-progress-card space-y-3">
        {/* Acknowledgment line */}
        <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
          {acknowledgment}
        </p>

        {/* Work steps */}
        <div className="space-y-1 pl-0.5">
          {steps.map((step, idx) => {
            if (idx >= visibleSteps) return null;

            const isLast = idx === visibleSteps - 1;
            const isDone = !isLast || resultArrived;

            return (
              <div
                key={idx}
                className="workflow-step-enter flex items-center gap-2 text-xs"
              >
                {isDone ? (
                  <Check className="w-3 h-3 text-emerald-500 flex-shrink-0" />
                ) : (
                  <Loader2 className="w-3 h-3 text-slate-400 dark:text-slate-500 animate-spin flex-shrink-0" />
                )}
                <span
                  className={
                    isDone
                      ? "text-slate-400 dark:text-slate-500"
                      : "text-slate-600 dark:text-slate-300"
                  }
                >
                  {step}
                </span>
              </div>
            );
          })}
        </div>
      </div>
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
