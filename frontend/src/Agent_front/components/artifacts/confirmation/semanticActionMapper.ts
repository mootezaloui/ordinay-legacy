import {
  sanitizeConfirmationViewModel,
  validateConfirmationViewModelCopy,
} from "./confirmationCopyGuard";
import {
  assertNonGenericSemanticCopy,
  assertSemanticActionViewModel,
  SemanticMappingError,
} from "./semanticGuards";
import type {
  SemanticActionMappingInput,
  SemanticActionViewModel,
  SemanticImpactItem,
  SemanticToneVariant,
} from "./types";

const HUMAN_FIELD_LABELS: Record<string, string> = {
  clientId: "Assigned client",
  dossierId: "Linked dossier",
  lawsuitId: "Linked lawsuit",
  officerId: "Assigned lawyer",
  status: "Status",
  isPaid: "Payment status",
  isActive: "Active",
  lawsuitNumber: "Lawsuit number",
  missionNumber: "Mission number",
  dueDate: "Due date",
  startDate: "Start date",
  endDate: "End date",
  hearingDate: "Hearing date",
  amount: "Amount",
  title: "Title",
  description: "Description",
  type: "Type",
  priority: "Priority",
};

const SENSITIVE_KEYWORDS = [
  "deceased",
  "dead",
  "décédé",
  "décédée",
  "death",
  "passed away",
  "hospitalized",
  "hospitalised",
  "incarcerated",
  "imprisoned",
];

const BEREAVEMENT_KEYWORDS = ["deceased", "dead", "death", "passed away", "décédé", "décédée"];

const RELATION_FIELD_KEYS = new Set(["clientId", "dossierId", "lawsuitId", "officerId"]);
const SUBJECT_FALLBACK_LABELS: Record<string, string> = {
  client: "this client",
  dossier: "this dossier",
  lawsuit: "this lawsuit",
  task: "this task",
  personal_task: "this task",
  session: "this session",
  mission: "this mission",
  financial_entry: "this financial entry",
  document: "this document",
  note: "this note",
};

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

function humanFieldLabel(field: string): string {
  return HUMAN_FIELD_LABELS[field] || toTitleCase(field);
}

function reassignmentLabel(field: string): string {
  return humanFieldLabel(field).replace(/^(assigned|linked)\s+/i, "").trim().toLowerCase();
}

function formatFieldValue(value: unknown, field?: string): string {
  if (value === null || value === undefined || value === "") return "None";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "number" && field && field.toLowerCase().endsWith("id")) return `#${value}`;
  return toTitleCase(String(value));
}

function escapeRegex(value: string): string {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function textContainsKeyword(text: string, keyword: string): boolean {
  const normalizedText = String(text || "").toLowerCase();
  const normalizedKeyword = String(keyword || "").toLowerCase().trim();
  if (!normalizedText || !normalizedKeyword) return false;
  const pattern = new RegExp(
    `(^|[^\\p{L}\\p{N}])${escapeRegex(normalizedKeyword)}([^\\p{L}\\p{N}]|$)`,
    "iu",
  );
  return pattern.test(normalizedText);
}

function containsSensitiveContext(input: SemanticActionMappingInput): boolean {
  const hintText = `${input.context.reasonHint || ""}`.toLowerCase();
  if (SENSITIVE_KEYWORDS.some((keyword) => textContainsKeyword(hintText, keyword))) return true;
  const impactText = (input.context.impactHints || []).join(" ").toLowerCase();
  if (SENSITIVE_KEYWORDS.some((keyword) => textContainsKeyword(impactText, keyword))) return true;
  const utterance = `${input.context.userUtterance || ""}`.toLowerCase();
  if (SENSITIVE_KEYWORDS.some((keyword) => textContainsKeyword(utterance, keyword))) return true;
  const statusTo = String(input.changes?.status?.to || "").toLowerCase();
  return SENSITIVE_KEYWORDS.some((keyword) => textContainsKeyword(statusTo, keyword));
}

function containsBereavementContext(input: SemanticActionMappingInput): boolean {
  const hintText = `${input.context.reasonHint || ""}`.toLowerCase();
  if (BEREAVEMENT_KEYWORDS.some((keyword) => textContainsKeyword(hintText, keyword))) return true;
  const impactText = (input.context.impactHints || []).join(" ").toLowerCase();
  if (BEREAVEMENT_KEYWORDS.some((keyword) => textContainsKeyword(impactText, keyword))) return true;
  const utterance = `${input.context.userUtterance || ""}`.toLowerCase();
  if (BEREAVEMENT_KEYWORDS.some((keyword) => textContainsKeyword(utterance, keyword))) return true;
  const statusTo = String(input.changes?.status?.to || "").toLowerCase();
  return BEREAVEMENT_KEYWORDS.some((keyword) => textContainsKeyword(statusTo, keyword));
}

function classifyTone(input: SemanticActionMappingInput): SemanticToneVariant {
  if (input.context.reversible === false) return "destructive";
  if (containsSensitiveContext(input)) return "sensitive";
  if (
    input.context.requiresRiskAck ||
    input.context.riskLevel === "high" ||
    input.context.riskLevel === "medium" ||
    (input.context.affectedItems?.length || 0) > 0
  ) {
    return "caution";
  }
  return "neutral";
}

function dedupeImpact(items: SemanticImpactItem[]): SemanticImpactItem[] {
  const seen = new Set<string>();
  const result: SemanticImpactItem[] = [];
  for (const item of items) {
    const key = `${item.kind}:${(item.title || "").toLowerCase()}:${item.detail.toLowerCase()}:${(item.before || "").toLowerCase()}:${(item.after || "").toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

function buildChangeImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const items: SemanticImpactItem[] = [];
  const changes = input.changes || {};
  for (const [field, diff] of Object.entries(changes)) {
    const hasBefore = !(diff.from === null || diff.from === undefined || diff.from === "");
    const hasAfter = !(diff.to === null || diff.to === undefined || diff.to === "");
    const beforeLabel = hasBefore ? formatFieldValue(diff.from, field) : "Current";
    const afterLabel = hasAfter ? formatFieldValue(diff.to, field) : "Updated";
    const detail = hasBefore
      ? `${humanFieldLabel(field)} will change from ${beforeLabel} to ${afterLabel}.`
      : `${humanFieldLabel(field)} will be set to ${afterLabel}.`;
    items.push({
      kind: "change",
      title: humanFieldLabel(field),
      before: beforeLabel,
      after: afterLabel,
      detail,
    });
  }
  return items;
}

function buildPreviewPrimaryAndCascadeChangeImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const preview = input.context.confirmationPreview;
  if (!preview || preview.scope !== "workflow") return [];

  const items: SemanticImpactItem[] = [];
  const rootType = String(preview.root?.type || "").toLowerCase();
  const rootId = Number(preview.root?.id);

  const primaryChanges = Array.isArray(preview.primaryChanges) ? preview.primaryChanges : [];
  for (const change of primaryChanges) {
    const field = String(change?.field || "").trim();
    if (!field) continue;
    const changeType = String(change?.entityType || "").toLowerCase();
      const changeId = Number(change?.entityId);
      const isRoot = (!rootType || changeType === rootType) && (!Number.isFinite(rootId) || changeId === rootId);
      if (!isRoot) continue;
      const hasBefore = !(change?.from === null || change?.from === undefined || change?.from === "");
      const hasAfter = !(change?.to === null || change?.to === undefined || change?.to === "");
      items.push({
        kind: "change",
        title: humanFieldLabel(field),
        before: hasBefore ? formatFieldValue(change?.from, field) : undefined,
        after: hasAfter ? formatFieldValue(change?.to, field) : undefined,
        detail: hasBefore
          ? `${humanFieldLabel(field)} will change from ${formatFieldValue(change?.from, field)} to ${formatFieldValue(change?.to, field)}.`
          : `${humanFieldLabel(field)} will be set to ${formatFieldValue(change?.to, field)}.`,
      });
    }

  const cascadeSummary = Array.isArray(preview.cascadeSummary) ? preview.cascadeSummary : [];
  for (const group of cascadeSummary) {
    const examples = Array.isArray(group?.examples) ? group.examples : [];
    for (const example of examples) {
      const field = String(example?.field || "").trim();
      if (!field) continue;
      const entityLabel = String(example?.entityLabel || "").trim() || `${toTitleCase(String(example?.entityType || "item"))} #${String(example?.entityId || "?")}`;
      const hasBefore = !(example?.from === null || example?.from === undefined || example?.from === "");
      const hasAfter = !(example?.to === null || example?.to === undefined || example?.to === "");
      items.push({
        kind: "change",
        title: `${entityLabel} (${humanFieldLabel(field)})`,
        before: hasBefore ? formatFieldValue(example?.from, field) : undefined,
        after: hasAfter ? formatFieldValue(example?.to, field) : undefined,
        detail: hasBefore
          ? `${entityLabel} ${humanFieldLabel(field).toLowerCase()} will change.`
          : `${entityLabel} ${humanFieldLabel(field).toLowerCase()} will be updated.`,
      });
    }
  }

  return items;
}

function punctuateSentence(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
}

function lowerFirst(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toLowerCase() + text.slice(1);
}

function actionVerb(actionKind?: string): string {
  const kind = String(actionKind || "").toLowerCase();
  if (kind === "delete") return "delete";
  if (kind === "create") return "create";
  if (kind === "attach") return "attach";
  if (kind === "link") return "change the link for";
  if (kind === "workflow") return "carry out the requested updates for";
  return "apply this change for";
}

function fallbackActionSummary(input: SemanticActionMappingInput, targetPhrase: string): string {
  const kind = String(input.context.actionKind || "").toLowerCase();
  if (kind === "delete") return `Permanently delete ${targetPhrase}`;
  if (kind === "create") return `Create ${targetPhrase}`;
  if (kind === "attach") return `Attach the document to ${targetPhrase}`;
  if (kind === "link") return `Update the link for ${targetPhrase}`;
  if (kind === "workflow") return `Apply the requested updates for ${targetPhrase}`;
  return `Apply the requested change for ${targetPhrase}`;
}

function normalizeProposalSummary(input: SemanticActionMappingInput): string | undefined {
  const summary = String(input.context.proposalSummary || "").trim();
  return summary || undefined;
}

function getPlannerPreview(input: SemanticActionMappingInput) {
  const planner = input.context.confirmationPreview?.planner;
  return planner && typeof planner === "object" ? planner : null;
}

function hasLegalCreatePlannerPreview(input: SemanticActionMappingInput): boolean {
  if (String(input.context.actionKind || "").toLowerCase() !== "create") return false;
  const planner = getPlannerPreview(input) as { legalSummary?: unknown } | null;
  return Boolean(typeof planner?.legalSummary === "string" && planner.legalSummary.trim());
}

function buildFallbackPlannedChangeImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  if (hasLegalCreatePlannerPreview(input)) return [];
  const hasExplicitChanges = Object.keys(input.changes || {}).length > 0;
  const pendingFields = (input.context.pendingFieldNames || []).filter(Boolean);
  if (hasExplicitChanges || pendingFields.length > 0) return [];

  const targetPhrase = hasKnownTarget(input) ? subjectLabelOrSemanticFallback(input, "fallback") : "the selected information";
  const summary = normalizeProposalSummary(input) || fallbackActionSummary(input, targetPhrase);
  if (!summary) return [];

  // When no structured diff is available, surface the backend proposal summary inside "What changes".
  return [
    {
      kind: "change",
      title: "Planned change",
      detail: punctuateSentence(summary),
    },
  ];
}

function buildAffectedImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const preview = input.context.confirmationPreview;
  if (Array.isArray(preview?.cascadeSummary) && preview.cascadeSummary.length > 0) return [];
  const affected = input.context.affectedItems || [];
  const subjectLabel = String(input.context.subjectLabel || "").trim().toLowerCase();
  const labels = affected
    .map((a) => String(a.label || "").trim())
    .filter(Boolean)
    .filter((label) => !(subjectLabel && label.toLowerCase() === subjectLabel));
  if (labels.length === 0) return [];
  return [
    {
      kind: "consequence",
      detail:
        labels.length === 1
          ? `Related information connected to ${labels[0]} will be updated as part of this change.`
          : `Related information connected to ${labels.slice(0, 3).join(", ")}${labels.length > 3 ? ` and ${labels.length - 3} more` : ""} will also be updated.`,
    },
  ];
}

function buildHintImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const hints = (input.context.impactHints || [])
    .map((h) => String(h || "").trim())
    .filter(Boolean);
  const items: SemanticImpactItem[] = [];

  for (const hint of hints) {
    const lower = hint.toLowerCase();
    if (lower.includes("cannot be undone") || lower.includes("permanent")) {
      items.push({ kind: "warning", detail: "This is a permanent change and cannot be undone." });
      continue;
    }
    if (lower.includes("total")) {
      items.push({ kind: "consequence", detail: "Related totals will be recalculated." });
      continue;
    }
    items.push({ kind: "consequence", detail: hint });
  }

  if (input.context.reversible === false) {
    items.push({ kind: "warning", detail: "This is a permanent change and cannot be undone." });
  }
  if (
    input.entityType === "client" &&
    containsBereavementContext(input) &&
    !input.changes?.status &&
    !items.some((item) => item.detail.toLowerCase().includes("active-client views"))
  ) {
    items.push({
      kind: "consequence",
      detail: "This person will no longer appear in active-client views and routine follow-up suggestions.",
    });
  }
  if (input.context.requiresRiskAck) {
    items.push({
      kind: "warning",
      detail: "This change has elevated impact and needs your confirmation.",
    });
  }

  return items;
}

function buildReversibilityImpact(input: SemanticActionMappingInput): SemanticImpactItem {
  if (input.context.reversible === false) {
    return { kind: "reversibility", detail: "Not reversible." };
  }
  if (input.context.reversible === true) {
    return { kind: "reversibility", detail: "This can be changed later if entered in error." };
  }
  return { kind: "reversibility", detail: "If needed, this can be changed later." };
}

function buildPreviewCascadeSummaryImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const preview = input.context.confirmationPreview;
  const cascadeSummary = Array.isArray(preview?.cascadeSummary) ? preview.cascadeSummary : [];
  if (cascadeSummary.length === 0) return [];

  const items: SemanticImpactItem[] = [];
  for (const group of cascadeSummary.slice(0, 6)) {
    const entityType = toTitleCase(String(group?.entityType || "item"));
    const totalCount = Number(group?.totalCount);
    const changedFields = (Array.isArray(group?.changedFields) ? group.changedFields : [])
      .map((field) => humanFieldLabel(String(field || "")))
      .filter(Boolean);
    const fieldText =
      changedFields.length > 0
        ? ` Fields updated: ${changedFields.slice(0, 3).join(", ")}${changedFields.length > 3 ? ` (+${changedFields.length - 3} more)` : ""}.`
        : "";
    const examplesCount = Array.isArray(group?.examples) ? group.examples.length : 0;
    const examplesText = examplesCount > 0 ? ` Showing ${examplesCount} example${examplesCount > 1 ? "s" : ""} above.` : "";
    items.push({
      kind: "consequence",
      detail: `${Number.isFinite(totalCount) ? totalCount : "Multiple"} ${entityType.toLowerCase()}${Number(totalCount) === 1 ? "" : "s"} will also be updated.${fieldText}${examplesText}`,
    });
  }
  return items;
}

function buildPreviewEffectsImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const preview = input.context.confirmationPreview;
  const effects = (Array.isArray(preview?.effects) ? preview.effects : [])
    .map(formatPreviewEffectValue)
    .filter(Boolean);
  return effects
    .map((detail) => normalizePreviewEffectCopy(detail))
    .filter(Boolean)
    .map((detail) => ({ kind: "consequence", detail }));
}

function buildPlannerPreviewImpact(input: SemanticActionMappingInput): SemanticImpactItem[] {
  const planner = input.context.confirmationPreview?.planner;
  const profile = planner?.semanticProfile;
  const legalSummary = typeof planner?.legalSummary === "string" ? planner.legalSummary.trim() : "";
  const caseFocusPoints = Array.isArray(planner?.caseFocusPoints)
    ? planner.caseFocusPoints.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const suggestedNextSteps = Array.isArray(planner?.suggestedNextSteps)
    ? planner.suggestedNextSteps.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  const isCreate = String(input.context.actionKind || "").toLowerCase() === "create";
  if (isCreate && (legalSummary || caseFocusPoints.length > 0 || suggestedNextSteps.length > 0)) {
    const createItems: SemanticImpactItem[] = [];
    for (const point of caseFocusPoints.slice(0, 6)) {
      createItems.push({ kind: "consequence", detail: punctuateSentence(point) });
    }
    for (const step of suggestedNextSteps.slice(0, 5)) {
      createItems.push({ kind: "warning", detail: punctuateSentence(step) });
    }
    const plannerConfidence = Number(planner?.confidence);
    if (Number.isFinite(plannerConfidence)) {
      createItems.push({
        kind: "consequence",
        title: "Planning confidence",
        detail: punctuateSentence(`${Math.round(plannerConfidence * 100)}%`),
      });
    }
    return createItems;
  }

  if (!profile || typeof profile !== "object") return [];

  const items: SemanticImpactItem[] = [];

  const assumptions = Array.isArray(profile.assumptions)
    ? profile.assumptions.map((v) => String(v || "").trim()).filter(Boolean)
    : [];
  for (const assumption of assumptions.slice(0, 4)) {
    items.push({
      kind: "consequence",
      title: "Assumption used",
      detail: punctuateSentence(assumption),
    });
  }

  const missingOptional = Array.isArray(profile.missingOptional)
    ? profile.missingOptional.map((v) => humanFieldLabel(String(v || ""))).filter(Boolean)
    : [];
  if (missingOptional.length > 0) {
    items.push({
      kind: "consequence",
      title: "Optional details to refine later",
      detail: punctuateSentence(
        `You can add later: ${missingOptional.slice(0, 5).join(", ")}${
          missingOptional.length > 5 ? ` (+${missingOptional.length - 5} more)` : ""
        }`,
      ),
    });
  }

  const missingCritical = Array.isArray(profile.missingCritical)
    ? profile.missingCritical.map((v) => humanFieldLabel(String(v || ""))).filter(Boolean)
    : [];
  if (missingCritical.length > 0) {
    items.push({
      kind: "warning",
      title: "Still needed before creation",
      detail: punctuateSentence(
        `${missingCritical.slice(0, 4).join(", ")} must be confirmed before this can be created`,
      ),
    });
  }

  const plannerConfidence = Number(planner?.confidence);
  if (Number.isFinite(plannerConfidence)) {
    const pct = Math.round(plannerConfidence * 100);
    const source = String(planner?.source || "").trim();
    items.push({
      kind: "consequence",
      title: "Planning confidence",
      detail: punctuateSentence(
        source ? `${pct}% (${source.replace(/_/g, " ")})` : `${pct}%`,
      ),
    });
  }

  return items;
}

function formatPreviewEffectValue(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return String(value || "").trim();
  }
  const rec = value as { type?: unknown; message?: unknown; count?: unknown };
  const type = String(rec.type || "").trim().toLowerCase();
  const message = typeof rec.message === "string" ? rec.message.trim() : "";
  if (message) return message;
  if (type === "suggested_children") {
    const count = Number(rec.count);
    if (Number.isFinite(count) && count > 0) {
      return `${count} suggested follow-up item${count === 1 ? "" : "s"} can be prepared after creation.`;
    }
    return "Suggested follow-up items are available after creation.";
  }
  if (type === "planner_summary") {
    return "";
  }
  return "";
}

function normalizePreviewEffectCopy(detail: string): string {
  let next = String(detail || "").trim();
  if (!next) return "";

  // Rewrite backend reasoning phrasing into user-facing confirmation copy.
  next = next.replace(/^user requested\b[^;:.-]*[;:,-]\s*/i, "");
  next = next.replace(/\bworkflow\b/gi, "steps");
  next = next.replace(/\boperation\b/gi, "change");
  next = next.replace(/\bentity\b/gi, "information");
  next = next.replace(/\brequired before final status update\b/gi, "needed before the final status change");
  next = next.replace(/\brequired before\b/gi, "needed before");

  // Keep a strong, natural fallback if the line becomes too terse after normalization.
  if (!next || next.length < 12) {
    return "Related records will be updated first so the final change can be applied safely.";
  }

  // Ensure sentence case starts cleanly after stripping prefixes.
  next = next.charAt(0).toUpperCase() + next.slice(1);
  return punctuateSentence(next);
}

function requireSubjectLabel(input: SemanticActionMappingInput, actionKind: string): string {
  const subjectLabel = String(input.context.subjectLabel || "").trim();
  if (!subjectLabel) {
    throw new SemanticMappingError("Missing subject label for semantic confirmation.", {
      actionKind,
      entityType: input.entityType,
      detectedIntent: input.detectedIntent,
    });
  }
  return subjectLabel;
}

function subjectLabelOrSemanticFallback(
  input: SemanticActionMappingInput,
  actionKind: string,
): string {
  const subjectLabel = String(input.context.subjectLabel || "").trim();
  if (subjectLabel) return subjectLabel;

  const entityType = String(input.entityType || "").toLowerCase().trim();
  const fallback = SUBJECT_FALLBACK_LABELS[entityType];
  if (fallback) return fallback;

  const entityLabel = toTitleCase(entityType);
  if (entityLabel && entityLabel !== "Unknown Target") {
    return `this ${entityLabel.toLowerCase()}`;
  }

  return requireSubjectLabel(input, actionKind);
}

function buildNarrative(
  input: SemanticActionMappingInput,
  toneVariant: SemanticToneVariant,
): Omit<SemanticActionViewModel, "impact" | "toneVariant" | "sections"> {
  const entityType = String(input.entityType || "").toLowerCase().trim();
  const statusTo = String(input.changes?.status?.to || "").trim();
  const statusFrom = String(input.changes?.status?.from || "").trim();
  const changeKeys = Object.keys(input.changes || {});
  const pendingFieldNames = (input.context.pendingFieldNames || []).filter(Boolean);
  const semanticFields = changeKeys.length > 0 ? changeKeys : pendingFieldNames;
  const hasStatusChange = Boolean(input.changes?.status);
  const relationField = semanticFields.find((field) => RELATION_FIELD_KEYS.has(field));
  const singleField = semanticFields.length === 1 ? humanFieldLabel(semanticFields[0]) : null;
  const targetPhrase = hasKnownTarget(input) ? subjectLabelOrSemanticFallback(input, "confirm") : "the selected information";
  const actionKind = String(input.context.actionKind || "").toLowerCase();
  const rawProposalSummary = normalizeProposalSummary(input);
  const proposalSummary =
    !hasStatusChange && semanticFields.length === 0 && (isExplicitFallbackActionKind(actionKind) || input.context.reversible === false)
      ? rawProposalSummary
      : undefined;
  const hasAnySemanticTarget = Boolean(
    String(input.context.subjectLabel || "").trim() ||
      (entityType && entityType !== "unknown_target"),
  );
  const isBereavement = containsBereavementContext(input) && (entityType === "client" || hasAnySemanticTarget);
  const semanticStatusLabel = isBereavement ? "Deceased" : "Updated";
  const toLabel = statusTo ? toTitleCase(statusTo) : semanticStatusLabel;
  const fromLabel = statusFrom ? toTitleCase(statusFrom) : "Current";
  const isPermanent = input.context.reversible === false;
  const statusSemanticChange = hasStatusChange || isBereavement;
  const fallbackSummary = fallbackActionSummary(input, targetPhrase);
  const planner = getPlannerPreview(input) as
    | {
        legalSummary?: unknown;
        semanticProfile?: { category?: unknown; subtype?: unknown } | null;
      }
    | null;
  const plannerLegalSummary =
    typeof planner?.legalSummary === "string" ? planner.legalSummary.trim() : "";
  const plannerCategory =
    typeof planner?.semanticProfile?.category === "string"
      ? planner.semanticProfile.category.trim()
      : "";
  const plannerSubtype =
    typeof planner?.semanticProfile?.subtype === "string"
      ? planner.semanticProfile.subtype.trim()
      : "";

  if (actionKind === "create" && plannerLegalSummary) {
    const headlineLabel = proposalSummary || `Create ${entityType.replace(/_/g, " ")}`;
    const categoryLabel = [plannerCategory, plannerSubtype].filter(Boolean).join(" - ");
    return {
      assistantMessage: `${punctuateSentence(plannerLegalSummary)} Please confirm and I will prepare this ${entityType.replace(/_/g, " ")} now.`,
      headline: `Confirm: ${toTitleCase(headlineLabel)}`,
      description: categoryLabel
        ? `Initial setup prepared for ${categoryLabel.toLowerCase()}.`
        : `Initial setup prepared for this ${entityType.replace(/_/g, " ")}.`,
      confirmLabel: "Confirm Create",
      cancelLabel: "Keep Current Information",
    };
  }

  const headline = buildHeadline({
    targetPhrase,
    hasStatusChange: statusSemanticChange,
    toLabel,
    relationField,
    singleField,
    isPermanent,
    isBereavement,
    hasAnySemanticTarget,
    proposalSummary,
    fallbackSummary,
  });

  const assistantMessage = buildAssistantMessage({
    toneVariant,
    targetPhrase,
    hasStatusChange: statusSemanticChange,
    toLabel,
    relationField,
    singleField,
    isPermanent,
    isBereavement,
    hasAnySemanticTarget,
    proposalSummary,
    fallbackSummary,
    actionKind,
  });

  const description = buildDescription({
    toneVariant,
    targetPhrase,
    hasStatusChange: statusSemanticChange,
    fromLabel,
    toLabel,
    relationField,
    singleField,
    semanticFieldCount: semanticFields.length,
    isPermanent,
    isBereavement,
    proposalSummary,
    fallbackSummary,
  });

  const confirmLabel = buildConfirmLabel({
    hasStatusChange: statusSemanticChange,
    toLabel,
    singleField,
    relationField,
    isBereavement,
    isPermanent,
  });

  const cancelLabel = buildCancelLabel({
    hasStatusChange: statusSemanticChange,
    relationField,
    hasFieldChanges: semanticFields.length > 0,
    isPermanent,
  });

  return {
    assistantMessage,
    headline,
    description,
    confirmLabel,
    cancelLabel,
  };
}

function isExplicitFallbackActionKind(actionKind: string): boolean {
  return actionKind === "delete" || actionKind === "create" || actionKind === "link" || actionKind === "attach" || actionKind === "workflow";
}

function hasKnownTarget(input: SemanticActionMappingInput): boolean {
  const subjectLabel = String(input.context.subjectLabel || "").trim();
  if (subjectLabel) return true;
  const entityType = String(input.entityType || "").trim().toLowerCase();
  return Boolean(entityType && entityType !== "unknown_target");
}

function buildHeadline(args: {
  targetPhrase: string;
  hasStatusChange: boolean;
  toLabel: string;
  relationField?: string;
  singleField: string | null;
  isPermanent: boolean;
  isBereavement: boolean;
  hasAnySemanticTarget: boolean;
  proposalSummary?: string;
  fallbackSummary: string;
}): string {
  const { targetPhrase, hasStatusChange, toLabel, relationField, singleField, isPermanent, isBereavement, hasAnySemanticTarget, proposalSummary, fallbackSummary } = args;

  if (hasStatusChange && isBereavement) return `Mark ${targetPhrase} as ${toLabel}`;
  if (hasStatusChange) return `Confirm Status Update for ${targetPhrase}`;
  if (relationField) return `Confirm ${toTitleCase(reassignmentLabel(relationField))} Change for ${targetPhrase}`;
  if (singleField) return `Confirm ${singleField} Change for ${targetPhrase}`;
  if (proposalSummary) return `Confirm: ${toTitleCase(proposalSummary)}`;
  if (isPermanent) return `Confirm: ${toTitleCase(fallbackSummary)}`;
  if (isPermanent && hasAnySemanticTarget) return `Confirm Permanent Change for ${targetPhrase}`;
  if (hasAnySemanticTarget) return `Confirm Changes for ${targetPhrase}`;
  return "Confirm Requested Changes";
}

function buildAssistantMessage(args: {
  toneVariant: SemanticToneVariant;
  targetPhrase: string;
  hasStatusChange: boolean;
  toLabel: string;
  relationField?: string;
  singleField: string | null;
  isPermanent: boolean;
  isBereavement: boolean;
  hasAnySemanticTarget: boolean;
  proposalSummary?: string;
  fallbackSummary: string;
  actionKind: string;
}): string {
  const { toneVariant, targetPhrase, hasStatusChange, toLabel, relationField, singleField, isPermanent, isBereavement, hasAnySemanticTarget, proposalSummary, fallbackSummary, actionKind } = args;
  const targetRef = hasAnySemanticTarget ? targetPhrase : "the selected information";

  if (toneVariant === "sensitive" && isBereavement && hasStatusChange) {
    return `I'm sorry. I can mark ${targetRef} as ${toLabel.toLowerCase()} so future follow-ups reflect this correctly. Please confirm before I apply that change.`;
  }

  if (toneVariant === "sensitive") {
    return `I'm sorry. I can apply this change for ${targetRef}. Please confirm before I continue.`;
  }

  if (hasStatusChange) {
    return isPermanent
      ? `I can update the status for ${targetRef}, and this change is permanent. Please confirm before I apply it.`
      : `I can update the status for ${targetRef}. Please confirm before I apply that change.`;
  }

  if (relationField) {
    return `I can update the ${reassignmentLabel(relationField)} for ${targetRef}. Please confirm before I apply that change.`;
  }

  if (singleField) {
    return `I can update the ${singleField.toLowerCase()} for ${targetRef}. Please confirm before I apply that change.`;
  }

  if (proposalSummary) {
    return `I can ${lowerFirst(proposalSummary)}. Please confirm before I apply that change.`;
  }

  if (isPermanent) {
    const verb = actionVerb(actionKind);
    if (verb.endsWith(" for")) {
      return `I can ${verb} ${targetRef}, but it is permanent. Please confirm before I continue.`;
    }
    return `I can ${lowerFirst(fallbackSummary)}, but it is permanent. Please confirm before I continue.`;
  }

  return `I can apply this change for ${targetRef}. Please confirm before I continue.`;
}

function buildDescription(args: {
  toneVariant: SemanticToneVariant;
  targetPhrase: string;
  hasStatusChange: boolean;
  fromLabel: string;
  toLabel: string;
  relationField?: string;
  singleField: string | null;
  semanticFieldCount: number;
  isPermanent: boolean;
  isBereavement: boolean;
  proposalSummary?: string;
  fallbackSummary: string;
}): string {
  const { toneVariant, targetPhrase, hasStatusChange, fromLabel, toLabel, relationField, singleField, semanticFieldCount, isPermanent, isBereavement, proposalSummary, fallbackSummary } = args;

  if (hasStatusChange && isBereavement && toneVariant === "sensitive") {
    return "You said this person has passed away. This updates the status so the assistant no longer treats them as an active client.";
  }
  if (hasStatusChange) {
    return `This updates the status for ${targetPhrase} from ${fromLabel} to ${toLabel}.`;
  }
  if (relationField) {
    return `This updates the linked ${reassignmentLabel(relationField)} for ${targetPhrase}.`;
  }
  if (singleField) {
    return `This updates the ${singleField.toLowerCase()} for ${targetPhrase}.`;
  }
  if (semanticFieldCount > 1) {
    return `This updates the selected information for ${targetPhrase}.`;
  }
  if (proposalSummary) {
    return `This will ${lowerFirst(punctuateSentence(proposalSummary)).replace(/\.$/, "")}.`;
  }
  if (isPermanent) {
    return `This will ${lowerFirst(punctuateSentence(fallbackSummary)).replace(/\.$/, "")}.`;
  }
  return `This applies the requested change for ${targetPhrase}.`;
}

function buildConfirmLabel(args: {
  hasStatusChange: boolean;
  toLabel: string;
  singleField: string | null;
  relationField?: string;
  isBereavement: boolean;
  isPermanent: boolean;
}): string {
  const { hasStatusChange, toLabel, singleField, relationField, isBereavement, isPermanent } = args;
  if (hasStatusChange && isBereavement) return `Mark as ${toLabel}`;
  if (hasStatusChange) return `Set Status to ${toLabel}`;
  if (relationField) return "Confirm Assignment Change";
  if (singleField) return `Confirm ${singleField} Change`;
  if (isPermanent) return "Apply Permanent Change";
  return "Confirm Changes";
}

function buildCancelLabel(args: {
  hasStatusChange: boolean;
  relationField?: string;
  hasFieldChanges: boolean;
  isPermanent: boolean;
}): string {
  const { hasStatusChange, relationField, hasFieldChanges, isPermanent } = args;
  if (hasStatusChange) return "Keep Current Status";
  if (relationField) return "Keep Current Assignment";
  if (hasFieldChanges) return "Keep Current Information";
  if (isPermanent) return "Keep As Is";
  return "Keep Current Information";
}

export function mapSemanticAction(input: SemanticActionMappingInput): SemanticActionViewModel {
  if (input.context.structuredCard) {
    return {
      assistantMessage: "",
      headline: input.context.structuredCard.title,
      description: input.context.structuredCard.subtitle || "",
      impact: [],
      confirmLabel: input.context.structuredCard.confirmLabel,
      cancelLabel: input.context.structuredCard.cancelLabel,
      toneVariant: classifyTone(input),
      sections: {
        changesLabel: "What changes",
        consequencesLabel: "What this affects",
        warningsLabel: "Warnings",
        reversibilityLabel: "Can this be undone?",
      },
      card: input.context.structuredCard,
    };
  }

  const toneVariant = classifyTone(input);
  const narrative = buildNarrative(input, toneVariant);
  const impact = dedupeImpact([
    ...buildPreviewPrimaryAndCascadeChangeImpact(input),
    ...buildChangeImpact(input),
    ...buildFallbackPlannedChangeImpact(input),
    ...buildPreviewCascadeSummaryImpact(input),
    ...buildPreviewEffectsImpact(input),
    ...buildPlannerPreviewImpact(input),
    ...buildHintImpact(input),
    ...buildAffectedImpact(input),
    buildReversibilityImpact(input),
  ]);
  const proposalPreview =
    input?.context?.proposalPreview &&
    Array.isArray(input.context.proposalPreview.items) &&
    input.context.proposalPreview.items.length > 0
      ? {
          title: String(input.context.proposalPreview.title || "Planned changes").trim() || "Planned changes",
          items: input.context.proposalPreview.items,
          warnings: Array.isArray(input.context.proposalPreview.warnings)
            ? input.context.proposalPreview.warnings.map((line) => String(line || "").trim()).filter(Boolean)
            : [],
        }
      : undefined;

  const viewModel = sanitizeConfirmationViewModel({
    ...narrative,
    impact,
    toneVariant,
    sections: {
      changesLabel: hasLegalCreatePlannerPreview(input) ? "Initial setup" : "What changes",
      consequencesLabel: hasLegalCreatePlannerPreview(input) ? "Case focus" : "What this affects",
      warningsLabel: hasLegalCreatePlannerPreview(input) ? "Suggested next steps" : "What this affects",
      reversibilityLabel: "Can this be undone?",
    },
    preview: proposalPreview,
  });

  const validation = validateConfirmationViewModelCopy(viewModel);
  if (!validation.valid) {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      console.error("[CONFIRM_DEBUG][frontend][semanticValidationFailed]", {
        offendingText: validation.offendingText,
        detectedIntent: input.detectedIntent,
        entityType: input.entityType,
        input,
        viewModelBeforeThrow: viewModel,
      });
    }
    throw new SemanticMappingError("Semantic confirmation copy failed validation.", {
      offendingText: validation.offendingText,
      detectedIntent: input.detectedIntent,
      entityType: input.entityType,
    });
  }

  assertSemanticActionViewModel(viewModel);
  assertNonGenericSemanticCopy(viewModel);
  return viewModel;
}
