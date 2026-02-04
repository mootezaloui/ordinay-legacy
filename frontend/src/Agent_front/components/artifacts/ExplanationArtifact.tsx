import { FileText } from "lucide-react";
import type { ExplanationOutput, FollowUpSuggestion } from "../../../services/api/agent";
import { InterpretationBlock } from "./InterpretationBlock";
import { NavigationContext } from "./NavigationContext";

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
 *   2. INTERPRETATION — why it matters now (MANDATORY)
 *   3. NAVIGATION — entity role context (MANDATORY)
 *   4. FOLLOW-UPS — guided next steps (shown separately by parent)
 */
export function ExplanationArtifact({
  data,
  intent,
  onFollowUpClick,
}: ExplanationArtifactProps) {
  // Derive entity label from intent or data
  const entityLabel = data.entityType
    ? data.entityType.charAt(0).toUpperCase() + data.entityType.slice(1)
    : intent
      ? intent
          .replace(/^EXPLAIN_|^SUMMARIZE_|_STATE$/g, "")
          .replace(/_/g, " ")
          .toLowerCase()
          .replace(/^\w/, (c) => c.toUpperCase())
      : "Entity";

  const entityIdLabel =
    data.entityId && !data.entityId.startsWith("list:")
      ? data.entityId
      : null;

  // Check if we have the new mandatory structure
  const hasNewStructure = data.facts && data.interpretation && data.navigation;

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

  return (
    <div className="artifact-build agent-artifact-card">
      {/* Header - appears first after card shell */}
      <div className="artifact-build-header agent-artifact-header flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {entityLabel}
          </span>
          {entityIdLabel && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {entityIdLabel}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4">
        {/* ─── Section 1: FACTS ─── */}
        <div className="artifact-build-section artifact-build-section-1">
          <p className="artifact-build-summary text-sm font-medium text-slate-900 dark:text-white leading-relaxed">
            {data.facts.summary}
          </p>

          {data.facts.details && data.facts.details.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700/50">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 block">
                Facts
              </span>
              <ul className="space-y-1">
                {data.facts.details.map((detail: string, idx: number) => (
                  <li
                    key={idx}
                    className="artifact-build-item text-sm text-slate-600 dark:text-slate-300 pl-4 relative before:content-[''] before:absolute before:left-0 before:top-[0.55em] before:w-1.5 before:h-1.5 before:rounded-full before:bg-slate-300 dark:before:bg-slate-600"
                  >
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* ─── Related Summary (Child Counts) ─── */}
        {data.relatedSummary && data.relatedSummary.length > 0 && (
          <div className="artifact-build-section artifact-build-section-related mt-4 pt-4 border-t border-slate-100 dark:border-slate-700/50">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2 block">
              Related Summary
            </span>
            <div className="space-y-3">
              {data.relatedSummary.map((section, idx) => (
                <div
                  key={`${section.title}-${idx}`}
                  className="rounded-lg border border-slate-100 dark:border-slate-700/60 bg-slate-50 dark:bg-slate-900/40 p-3"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                    {section.title}
                  </div>
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    {section.items.map((item, itemIdx) => (
                      <div
                        key={`${section.title}-${item.label}-${itemIdx}`}
                        className="flex items-center justify-between rounded-md bg-white/60 dark:bg-slate-900/60 px-2 py-1.5 text-xs text-slate-600 dark:text-slate-300"
                      >
                        <span className="text-slate-500 dark:text-slate-400">
                          {item.label}
                        </span>
                        <span className="text-sm font-semibold text-slate-900 dark:text-white">
                          {item.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Section 2: INTERPRETATION (MANDATORY) ─── */}
        <div className="artifact-build-section artifact-build-section-2">
          <InterpretationBlock interpretation={data.interpretation} />
        </div>

        {/* ─── Section 3: NAVIGATION (MANDATORY) ─── */}
        <div className="artifact-build-section artifact-build-section-3">
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
    <div className="artifact-enter agent-artifact-card">
      <div className="agent-artifact-header flex items-center justify-between px-5 py-3">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-500" />
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
            {data.title || entityLabel}
          </span>
        </div>
      </div>
      <div className="px-5 py-4">
        <p className="text-sm font-medium text-slate-900 dark:text-white">
          {data.summary || "No summary available"}
        </p>
        {data.details && data.details.length > 0 && (
          <ul className="mt-3 space-y-1">
            {data.details.map((detail, idx) => (
              <li key={idx} className="text-sm text-slate-600 dark:text-slate-300">
                {detail}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
