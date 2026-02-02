import { useState, useEffect, useRef, useMemo } from "react";
import { Check, Loader2, ChevronDown } from "lucide-react";
import { AgentMessage } from "../types/agentMessage";

// Artifact renderers
import { ExplanationArtifact } from "./artifacts/ExplanationArtifact";
import { RiskArtifact } from "./artifacts/RiskArtifact";
import { DraftArtifact } from "./artifacts/DraftArtifact";
import { ActionArtifact } from "./artifacts/ActionArtifact";
import { ChatArtifact } from "./artifacts/ChatArtifact";
import { ErrorArtifact } from "./artifacts/ErrorArtifact";
import { MarkdownOutput } from "../../components/MarkdownOutput";

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
export function AgentWorkflow({ message }: AgentWorkflowProps) {
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

    // Working — show working
    if (rawPhase === "working") return "working";

    // Result arrived but minimum working not met — keep showing working
    if (rawPhase === "revealing" && !minWorkingMet) return "working";

    // Minimum met and reveal triggered
    if (revealTriggered) return "revealing";

    // Still in acknowledged/working
    return rawPhase === "revealing" ? "working" : rawPhase;
  }, [rawPhase, isComplete, isError, minWorkingMet, revealTriggered]);

  // ── Render based on display phase ──

  // Phase: classifying
  if (displayPhase === "classifying") {
    return (
      <div className="workflow-phase-enter px-1 py-3">
        <div className="flex items-center gap-2.5">
          <Loader2 className="w-3.5 h-3.5 text-slate-400 animate-spin" />
          <span className="text-sm text-slate-400 dark:text-slate-500">
            Analyzing request...
          </span>
        </div>
      </div>
    );
  }

  // Phase: streaming text (chat)
  if (displayPhase === "streaming") {
    return (
      <div className="px-1 py-2">
        <div className="text-sm leading-relaxed text-slate-700 dark:text-slate-300 max-w-prose">
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
    return (
      <div className="space-y-3">
        {/* Collapsed work summary */}
        <WorkSummary intent={message.intent} />

        {/* Artifact reveal */}
        <div className="artifact-reveal">
          <ArtifactBody message={message} />
        </div>
      </div>
    );
  }

  // Phase: complete
  return (
    <div>
      <ArtifactBody message={message} />
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
    <div className="workflow-phase-enter px-1 py-3 space-y-3">
      {/* Acknowledgment line */}
      <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
        {acknowledgment}
      </p>

      {/* Work steps */}
      <div className="space-y-1 pl-1">
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
                <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
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
  );
}

// ────────────────────────────────────────────────────────────────
// Work Summary — collapsed line shown above revealed artifact
// ────────────────────────────────────────────────────────────────

function WorkSummary({ intent }: { intent?: string }) {
  const [collapsed, setCollapsed] = useState(true);
  const steps = getWorkSteps(intent);
  const acknowledgment = getAcknowledgment(intent);

  if (collapsed) {
    return (
      <button
        type="button"
        onClick={() => setCollapsed(false)}
        className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 dark:hover:text-slate-400 transition-colors px-1"
      >
        <ChevronDown className="w-3 h-3" />
        <span>{acknowledgment}</span>
        <span className="text-slate-300 dark:text-slate-600">
          — {steps.length} steps completed
        </span>
      </button>
    );
  }

  return (
    <div className="px-1 py-2 space-y-2">
      <button
        type="button"
        onClick={() => setCollapsed(true)}
        className="text-xs text-slate-400 dark:text-slate-500 hover:text-slate-500 transition-colors"
      >
        <span>{acknowledgment}</span>
      </button>
      <div className="space-y-0.5 pl-1">
        {steps.map((step, idx) => (
          <div key={idx} className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
            <Check className="w-3 h-3 text-green-500 flex-shrink-0" />
            <span>{step}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Artifact Body — renders the correct artifact based on data type
// ────────────────────────────────────────────────────────────────

function ArtifactBody({ message }: { message: AgentMessage }) {
  const isError = message.status === "error";
  const hasContent = !!(message.content && message.content.length > 0);
  const dataType = message.data?.type;

  if (isError) {
    return <ErrorArtifact content={message.content} />;
  }

  if (dataType === "explanation" && message.data?.explanation) {
    return <ExplanationArtifact data={message.data.explanation} intent={message.intent} />;
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
      "Formatting results",
    ];
  }

  if (n.includes("EXPLAIN")) {
    return [
      "Request classified",
      "Loading entity data",
      "Fetching related records",
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
