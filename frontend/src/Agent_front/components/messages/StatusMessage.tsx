import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { Brain, Globe, Database, Terminal, FileText, Upload } from "lucide-react";

interface StatusMessageProps {
  action: string;
  phase?: string;
}

type LoaderVariant = "thinking" | "web-search" | "data-retrieval" | "analysis" | "draft" | "uploading";

function deriveLoaderVariant(phase?: string, action?: string): LoaderVariant {
  const a = (action || "").toLowerCase();

  if (phase === "uploading") return "uploading";

  if (phase === "fetching") {
    if (a.includes("web")) return "web-search";
    return "data-retrieval";
  }

  if (phase === "analyzing") {
    if (a.includes("draft")) return "draft";
    return "analysis";
  }

  // init, classifying, interpreting, commentary, undefined
  return "thinking";
}

/**
 * Status Message — State-Aware Agent Loader
 *
 * Renders the current processing status from the backend
 * with a visual treatment that matches what the agent is doing.
 *
 * Each processing phase gets its own distinct loader variant:
 * - thinking: animated dots + ghost shimmer lines
 * - web-search: scan bar + source placeholder cards + timer
 * - data-retrieval: database icon + scan line
 * - analysis: terminal aesthetic with blinking cursor
 * - draft: document icon + shimmer lines
 * - uploading: indeterminate progress bar
 */
export function StatusMessage({ action, phase }: StatusMessageProps) {
  const variant = deriveLoaderVariant(phase, action);

  return (
    <div className="status-message agent-loader-row agent-message-row workflow-phase-enter">
      {/* Agent avatar with pulsing ring */}
      <div className="agent-loader-avatar">
        <div className="agent-loader-avatar-ring" />
        <div className="agent-icon-container agent-icon-container-indigo">
          <Brain className="w-5 h-5 text-white" />
        </div>
      </div>

      {/* Loader content — flows inline with chat */}
      <div className="agent-loader-content">
        {variant === "thinking" && <ThinkingLoader action={action} />}
        {variant === "web-search" && <WebSearchLoader action={action} />}
        {variant === "data-retrieval" && <DataRetrievalLoader action={action} />}
        {variant === "analysis" && <AnalysisLoader action={action} />}
        {variant === "draft" && <DraftLoader action={action} />}
        {variant === "uploading" && <UploadingLoader action={action} />}
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Thinking — lightest state (dots + rotating label + ghost lines)
// ────────────────────────────────────────────────────────────────

function ThinkingLoader({ action }: { action: string }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <div className="agent-loader-dots">
          <span />
          <span />
          <span />
        </div>
        <div className="agent-loader-label-slot">
          <span
            key={action}
            className="agent-loader-label-text text-xs text-slate-600 dark:text-slate-300"
          >
            {action}
          </span>
        </div>
      </div>
      <div className="agent-loader-ghost-lines">
        <div className="agent-loader-ghost-line" style={{ width: "85%" }} />
        <div className="agent-loader-ghost-line" style={{ width: "60%", animationDelay: "0.3s" }} />
        <div className="agent-loader-ghost-line" style={{ width: "72%", animationDelay: "0.6s" }} />
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Web Search — scan bar + source cards + elapsed timer
// ────────────────────────────────────────────────────────────────

function WebSearchLoader({ action }: { action: string }) {
  const { t } = useTranslation("common");
  const mountRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsed(Math.floor((Date.now() - mountRef.current) / 100) / 10);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <>
      {/* Scan bar */}
      <div className="agent-loader-scan-bar">
        <Globe className="w-3.5 h-3.5 text-teal-500 dark:text-teal-400 flex-shrink-0" />
        <div className="agent-loader-scan-track">
          <div className="agent-loader-scan-beam" />
        </div>
        <span className="text-[10px] font-medium uppercase tracking-wider text-slate-400 dark:text-slate-500 flex-shrink-0">
          {t("agent.status.searching")}
        </span>
      </div>

      {/* Label */}
      <div className="agent-loader-label-slot mt-1.5">
        <span
          key={action}
          className="agent-loader-label-text text-xs text-slate-600 dark:text-slate-300"
        >
          {action}
        </span>
      </div>

      {/* Source placeholder cards */}
      <div className="agent-loader-source-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="agent-loader-source-card">
            <div className="agent-loader-source-favicon" />
            <div className="agent-loader-source-line" style={{ width: "80%" }} />
            <div className="agent-loader-source-line" style={{ width: "55%" }} />
          </div>
        ))}
      </div>

      {/* Elapsed timer */}
      <div className="agent-loader-timer">{elapsed.toFixed(1)}s</div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Data Retrieval — database icon + scan line + label
// ────────────────────────────────────────────────────────────────

function DataRetrievalLoader({ action }: { action: string }) {
  return (
    <>
      <div className="agent-loader-retrieval">
        <Database className="w-3.5 h-3.5 text-violet-500 dark:text-violet-400 flex-shrink-0" />
        <div className="agent-loader-retrieval-bar">
          <div className="agent-loader-retrieval-beam" />
        </div>
      </div>
      <div className="agent-loader-label-slot mt-1.5">
        <span
          key={action}
          className="agent-loader-label-text text-xs text-slate-600 dark:text-slate-300"
        >
          {action}
        </span>
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Analysis — terminal/code block aesthetic
// ────────────────────────────────────────────────────────────────

function AnalysisLoader({ action }: { action: string }) {
  return (
    <div className="agent-loader-terminal">
      <div className="agent-loader-cursor" />
      <div className="agent-loader-label-slot" style={{ height: "auto" }}>
        <span
          key={action}
          className="agent-loader-label-text agent-loader-terminal-text"
        >
          {action}
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────
// Draft — document icon + shimmer lines
// ────────────────────────────────────────────────────────────────

function DraftLoader({ action }: { action: string }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <FileText className="w-3.5 h-3.5 text-emerald-500 dark:text-emerald-400 flex-shrink-0" />
        <div className="agent-loader-label-slot">
          <span
            key={action}
            className="agent-loader-label-text text-xs text-slate-600 dark:text-slate-300"
          >
            {action}
          </span>
        </div>
      </div>
      <div className="agent-loader-draft-lines">
        <div className="agent-loader-draft-line" style={{ width: "90%" }} />
        <div className="agent-loader-draft-line" style={{ width: "65%" }} />
        <div className="agent-loader-draft-line" style={{ width: "78%" }} />
      </div>
    </>
  );
}

// ────────────────────────────────────────────────────────────────
// Uploading — upload icon + indeterminate progress bar
// ────────────────────────────────────────────────────────────────

function UploadingLoader({ action }: { action: string }) {
  return (
    <>
      <div className="flex items-center gap-2">
        <Upload className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400 flex-shrink-0" />
        <div className="agent-loader-label-slot">
          <span
            key={action}
            className="agent-loader-label-text text-xs text-slate-600 dark:text-slate-300"
          >
            {action}
          </span>
        </div>
      </div>
      <div className="agent-loader-upload-track">
        <div className="agent-loader-upload-fill" />
      </div>
    </>
  );
}
