import { FileText, Clock, Activity, CheckCircle2, Calendar, Hash, FileBox, Briefcase, AlertCircle, CircleDot, ArrowUpRight, Tag } from "lucide-react";
import type { ExplanationOutput, FollowUpSuggestion } from "../../../services/api/agent";
import { InterpretationBlock } from "./InterpretationBlock";
import { NavigationContext } from "./NavigationContext";

// ─────────────────────────────────────────────────────────────────
// Smart Fact Parser — Intelligently parses and categorizes facts
// ─────────────────────────────────────────────────────────────────

type FactType = "status" | "count" | "activity" | "date" | "summary" | "text";

interface ParsedFact {
  type: FactType;
  label: string;
  value: string | number;
  items?: { label: string; value: string | number; status?: "success" | "warning" | "neutral" }[];
  activities?: { timestamp: string; type: string }[];
  status?: "success" | "warning" | "error" | "neutral";
}

/** Hero fact labels that get promoted to header badges */
const HERO_LABELS = new Set(["status", "priority", "phase"]);

/** Status value → badge class mapping */
function statusBadgeClass(value: string): string {
  const v = String(value).toLowerCase().replace(/[_\s]+/g, "_");
  if (["open", "active", "completed", "done"].includes(v)) return "agent-entity-badge-success";
  if (["in_progress", "in progress", "investigation"].includes(v)) return "agent-entity-badge-progress";
  if (["blocked", "on_hold", "on hold", "urgent", "overdue"].includes(v)) return "agent-entity-badge-urgent";
  if (["high", "critical"].includes(v)) return "agent-entity-badge-high";
  if (["closed", "archived", "cancelled"].includes(v)) return "agent-entity-badge-muted";
  return "agent-entity-badge-neutral";
}

/**
 * Parses a detail string into a structured fact object.
 */
function parseFact(detail: string): ParsedFact {
  const trimmed = detail.trim();

  // Pattern: "Recent activity: timestamp — type | timestamp — type | ..."
  if (/^(?:recent\s+)?activity:/i.test(trimmed)) {
    const content = trimmed.replace(/^(?:recent\s+)?activity:\s*/i, "");
    const activities = content.split(" | ").map((item) => {
      const match = item.trim().match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*—\s*(.+)$/);
      if (match) return { timestamp: match[1], type: match[2] };
      const altMatch = item.trim().match(/^(.+?)\s*—\s*(.+)$/);
      if (altMatch) return { timestamp: altMatch[1], type: altMatch[2] };
      return { timestamp: "", type: item.trim() };
    }).filter(a => a.type);

    return { type: "activity", label: "Recent Activity", value: activities.length, activities };
  }

  // Pattern: "Summary: status X, N item(s), N item(s), ..."
  if (/^summary:/i.test(trimmed)) {
    const content = trimmed.replace(/^summary:\s*/i, "");
    const parts = content.split(/,\s*/);
    const items: ParsedFact["items"] = [];

    for (const part of parts) {
      // "status open" or "status: open"
      const statusMatch = part.match(/^status[:\s]+(\w+)/i);
      if (statusMatch) {
        const statusVal = statusMatch[1].toLowerCase();
        items.push({
          label: "Status",
          value: statusVal.charAt(0).toUpperCase() + statusVal.slice(1),
          status: statusVal === "open" || statusVal === "active" ? "success" :
                  statusVal === "closed" || statusVal === "blocked" ? "warning" : "neutral"
        });
        continue;
      }

      // "N task(s)" or "N session(s)" etc.
      const countMatch = part.match(/^(\d+)\s+(\w+?)(?:\(.*?\))?$/i);
      if (countMatch) {
        const count = parseInt(countMatch[1], 10);
        const label = countMatch[2].replace(/_/g, " ");
        items.push({
          label: label.charAt(0).toUpperCase() + label.slice(1) + "s",
          value: count,
          status: count === 0 ? "neutral" : "success"
        });
        continue;
      }

      // Generic "label: value" or just text
      const kvMatch = part.match(/^([^:]+):\s*(.+)$/);
      if (kvMatch) {
        items.push({ label: kvMatch[1].trim(), value: kvMatch[2].trim(), status: "neutral" });
      } else if (part.trim()) {
        items.push({ label: part.trim(), value: "", status: "neutral" });
      }
    }

    return { type: "summary", label: "Overview", value: items.length, items };
  }

  // Pattern: "Label: N items" or "Label: value"
  const labelValueMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
  if (labelValueMatch) {
    const label = labelValueMatch[1].trim();
    const value = labelValueMatch[2].trim();

    // Check if it's a date
    if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
      return { type: "date", label, value };
    }

    // Check if value starts with a number (supports thousands separators)
    const numMatch = value.match(/^(\d{1,3}(?:,\d{3})*|\d+)(?:\s|$)/);
    if (numMatch) {
      const parsed = parseInt(numMatch[1].replace(/,/g, ""), 10);
      if (!Number.isNaN(parsed)) {
        return {
          type: "count",
          label,
          value: parsed,
          status: parsed === 0 ? "neutral" : "success"
        };
      }
    }

    // Check if it's a status-like value
    const statusWords = ["open", "closed", "active", "inactive", "pending", "completed", "blocked", "on_hold"];
    if (statusWords.includes(value.toLowerCase())) {
      return {
        type: "status",
        label,
        value: value.charAt(0).toUpperCase() + value.slice(1).toLowerCase(),
        status: ["open", "active", "completed"].includes(value.toLowerCase()) ? "success" :
                ["blocked", "closed"].includes(value.toLowerCase()) ? "warning" : "neutral"
      };
    }

    return { type: "text", label, value };
  }

  // Default: plain text
  return { type: "text", label: "", value: trimmed };
}

/**
 * Renders an expanded fact card — used only for activity and summary types.
 */
function ExpandedFactRenderer({ fact }: { fact: ParsedFact }) {
  // Activity timeline
  if (fact.type === "activity" && fact.activities && fact.activities.length > 0) {
    return (
      <div className="agent-fact-card agent-fact-activity">
        <div className="agent-fact-header">
          <Activity className="w-4 h-4 text-[#3b82f6]" />
          <span className="agent-fact-label">{fact.label}</span>
        </div>
        <div className="agent-activity-list">
          {fact.activities.slice(0, 4).map((item, idx) => (
            <div key={idx} className="agent-activity-row">
              <div className="agent-activity-dot-small" />
              <span className="agent-activity-type-small">{item.type}</span>
              {item.timestamp && (
                <span className="agent-activity-time-small">
                  <Clock className="w-3 h-3" />
                  {item.timestamp}
                </span>
              )}
            </div>
          ))}
          {fact.activities.length > 4 && (
            <div className="agent-activity-overflow">
              +{fact.activities.length - 4} more
            </div>
          )}
        </div>
      </div>
    );
  }

  // Summary with multiple items (status, counts, etc.)
  if (fact.type === "summary" && fact.items && fact.items.length > 0) {
    return (
      <div className="agent-fact-card agent-fact-summary">
        <div className="agent-fact-header">
          <Briefcase className="w-4 h-4 text-slate-500" />
          <span className="agent-fact-label">{fact.label}</span>
        </div>
        <div className="agent-summary-grid">
          {fact.items.map((item, idx) => (
            <div key={idx} className="agent-summary-item">
              <span className="agent-summary-item-label">{item.label}</span>
              <span className={`agent-summary-item-value ${
                item.status === "success" ? "is-success" :
                item.status === "warning" ? "is-warning" : ""
              }`}>
                {typeof item.value === "number" ? (
                  <span className="agent-summary-count">{item.value}</span>
                ) : item.value ? (
                  <>
                    {item.status === "success" && <CheckCircle2 className="w-3.5 h-3.5" />}
                    {item.status === "warning" && <AlertCircle className="w-3.5 h-3.5" />}
                    {item.value}
                  </>
                ) : "—"}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return null;
}

interface ExplanationArtifactProps {
  data: ExplanationOutput;
  intent?: string;
  onFollowUpClick?: (followUp: FollowUpSuggestion) => void;
}

/**
 * Renders a structured entity explanation with MANDATORY sections.
 *
 * This is NOT a search result. This is contextual assistance.
 *
 * Structure:
 *   1. FACTS — what was read
 *   2. INTERPRETATION — why it matters now (conditional on meaningful signals)
 *   3. NAVIGATION — entity role context (mandatory)
 *   4. FOLLOW-UPS — guided next steps (shown separately by parent)
 */
export function ExplanationArtifact({
  data,
  intent,
  onFollowUpClick,
}: ExplanationArtifactProps) {
  // Derive entity label from intent or data
  const entityLabel = data.entityType
    ? data.entityType
        .replace(/_/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase())
    : intent
      ? intent
          .replace(/^EXPLAIN_|^SUMMARIZE_|_STATE$/g, "")
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/^\w/, (c) => c.toUpperCase())
      : "Entity";

  // Check if we have the new mandatory structure
  const hasNewStructure = data.facts && data.interpretation && data.navigation;
  const hasInterpretation =
    data.interpretation &&
    Array.isArray(data.interpretation.statements) &&
    data.interpretation.statements.length > 0;

  const parentFollowUp =
    data.navigation?.parentPath && data.followUps
      ? data.followUps.find(
          (followUp) => {
            const parentType = data.navigation.parentPath?.type;
            const parentId = data.navigation.parentPath?.id;
            const targetMatch =
              followUp.target?.type === parentType &&
              (parentId === undefined ||
                String(followUp.target?.id ?? "") === String(parentId));
            if (targetMatch && followUp.labelKey === "view") return true;
            if (targetMatch && followUp.intent?.startsWith("READ_")) return true;
            return followUp.label === `View ${parentType}`;
          },
        )
      : undefined;

  // Fallback for legacy responses (backwards compatibility)
  if (!hasNewStructure) {
    return <LegacyExplanationArtifact data={data} entityLabel={entityLabel} />;
  }

  // Parse all facts and separate hero facts (status/priority/phase) from detail facts
  const allParsed: ParsedFact[] = (data.facts.details || []).map(parseFact);
  const heroFacts = allParsed.filter(f => f.label && HERO_LABELS.has(f.label.toLowerCase()));
  const detailFacts = allParsed.filter(f => !f.label || !HERO_LABELS.has(f.label.toLowerCase()));
  const gridFacts = detailFacts.filter(f => f.type !== "activity" && f.type !== "summary");
  const expandedFacts = detailFacts.filter(f => f.type === "activity" || f.type === "summary");

  return (
    <div className="artifact-build agent-artifact-card is-explanation">
      {/* ─── Header with inline badges ─── */}
      <div className="artifact-build-header agent-artifact-header agent-artifact-header-explanation px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-indigo">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {entityLabel}
              </h4>
              {/* Hero badges inline in header */}
              {heroFacts.map((hf, idx) => (
                <span key={idx} className={`agent-entity-badge ${statusBadgeClass(String(hf.value))}`}>
                  {String(hf.value).replace(/_/g, " ")}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-5">
        {/* ─── Section 1: FACTS ─── */}
        <div className="artifact-build-section artifact-build-section-1">
          <p className="artifact-build-summary text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
            {data.facts.summary}
          </p>

          {/* Compact property grid for simple facts */}
          {gridFacts.length > 0 && (
            <div className="agent-entity-props mt-4">
              {gridFacts.map((fact, idx) => (
                <div key={idx} className="agent-entity-prop">
                  <span className="agent-entity-prop-label">
                    {fact.type === "date" && <Calendar className="w-3 h-3" />}
                    {fact.type === "count" && <Hash className="w-3 h-3" />}
                    {fact.type === "text" && fact.label && <Tag className="w-3 h-3" />}
                    {fact.type === "status" && <CircleDot className="w-3 h-3" />}
                    {fact.label || "—"}
                  </span>
                  <span className={`agent-entity-prop-value ${
                    fact.type === "status" ? statusBadgeClass(String(fact.value)) : ""
                  } ${fact.type === "count" ? "font-semibold tabular-nums" : ""}`}>
                    {fact.type === "date" ? String(fact.value).split(" ")[0] : String(fact.value).replace(/_/g, " ")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Expanded facts (activity, summary) — full width */}
          {expandedFacts.length > 0 && (
            <div className="agent-facts-container mt-4">
              {expandedFacts.map((fact, idx) => (
                <ExpandedFactRenderer key={idx} fact={fact} />
              ))}
            </div>
          )}
        </div>

        {/* ─── Related Summary (Child Counts) ─── */}
        {data.relatedSummary && data.relatedSummary.length > 0 && (
          <div className="artifact-build-section artifact-build-section-related mt-5 pt-5 border-t border-black/[0.05] dark:border-white/[0.05]">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3 block">
              Related Summary
            </span>
            <div className="agent-entity-related-grid">
              {data.relatedSummary.map((section, idx) => (
                <div
                  key={`${section.title}-${idx}`}
                  className="agent-entity-related-section"
                >
                  <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-3">
                    {section.title}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {section.items.map((item, itemIdx) => (
                      <div
                        key={`${section.title}-${item.label}-${itemIdx}`}
                        className="agent-entity-stat-cell"
                      >
                        <span className="agent-entity-stat-label">{item.label}</span>
                        <span className="agent-entity-stat-value">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Section 2: INTERPRETATION (Conditional) ─── */}
        {hasInterpretation && (
          <div className="artifact-build-section artifact-build-section-2 mt-5">
            <InterpretationBlock interpretation={data.interpretation} />
          </div>
        )}

        {/* ─── Section 3: NAVIGATION (MANDATORY) ─── */}
        <div className="artifact-build-section artifact-build-section-3 mt-5">
          <NavigationContext
            navigation={data.navigation}
            parentFollowUp={parentFollowUp}
            onNavigate={onFollowUpClick}
          />
        </div>
      </div>
    </div>
  );
}

/**
 * Legacy fallback for old-style responses during transition.
 */
function LegacyExplanationArtifact({
  data,
  entityLabel,
}: {
  data: ExplanationOutput;
  entityLabel: string;
}) {
  return (
    <div className="artifact-enter agent-artifact-card is-explanation">
      <div className="agent-artifact-header agent-artifact-header-explanation flex items-center justify-between px-5 py-4">
        <div className="flex items-center gap-3">
          <div className="agent-icon-container agent-icon-container-indigo">
            <FileText className="w-5 h-5 text-white" />
          </div>
          <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {data.title || entityLabel}
          </h4>
        </div>
      </div>
      <div className="px-5 py-5">
        {data.summary && (
          <p className="text-[15px] font-medium text-slate-800 dark:text-slate-200 leading-relaxed">
            {data.summary}
          </p>
        )}
        {data.details && data.details.length > 0 && (
          <div className="mt-4 pt-4 border-t border-black/[0.05] dark:border-white/[0.05]">
            <div className="agent-facts-grid">
              {data.details.map((detail, idx) => (
                <div key={idx} className="agent-fact-card">
                  <p className="text-sm text-slate-700 dark:text-slate-200">
                    {detail}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
