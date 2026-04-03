import type {
  ActionProposal,
  ConfirmationPreview,
  StructuredProposal,
  StructuredProposalField,
} from "../../../../services/api/agent";
import type { SemanticActionMappingInput } from "./types";

export interface DataContextLike {
  clients?: Array<{ id: number; name?: string; reference?: string }>;
  dossiers?: Array<{ id: number; lawsuitNumber?: string; title?: string; clientId?: number }>;
  lawsuits?: Array<{ id: number; lawsuitNumber?: string; title?: string; dossierId?: number }>;
  tasks?: Array<{ id: number; title?: string }>;
  sessions?: Array<{ id: number; title?: string; type?: string }>;
  missions?: Array<{ id: number; missionNumber?: string; title?: string }>;
  financialEntries?: Array<{ id: number; title?: string; description?: string }>;
}

function toTitleCase(value: string): string {
  return String(value || "")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export function labelForEntityType(entityType?: string): string {
  const normalized = String(entityType || "").toLowerCase().trim();
  if (!normalized || normalized === "unknown_target") return "";
  if (normalized === "financial_entry") return "financial entry";
  if (normalized === "personal_task") return "personal task";
  return toTitleCase(normalized).toLowerCase();
}

function sentenceCase(value: string): string {
  const text = String(value || "").trim();
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function normalizeText(value: unknown): string {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeMultilineText(value: unknown): string {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function verbLabel(verb?: string): string {
  const normalized = String(verb || "").trim().toLowerCase();
  if (normalized === "create") return "Create";
  if (normalized === "update") return "Update";
  if (normalized === "delete") return "Delete";
  if (normalized === "attach") return "Attach";
  if (normalized === "link") return "Link";
  return "Apply";
}

function fieldIconForKey(key: string, label?: string) {
  const normalized = `${key} ${label || ""}`.toLowerCase();
  if (normalized.includes("client")) return "client" as const;
  if (normalized.includes("dossier")) return "dossier" as const;
  if (normalized.includes("lawsuit")) return "lawsuit" as const;
  if (normalized.includes("date")) return "calendar" as const;
  if (normalized.includes("status")) return "status" as const;
  if (normalized.includes("type")) return "tag" as const;
  if (normalized.includes("content") || normalized.includes("note") || normalized.includes("description")) return "content" as const;
  if (normalized.includes("reference")) return "link" as const;
  return "generic" as const;
}

function orderStructuredFields(fields: StructuredProposalField[]) {
  const priority: Record<string, number> = {
    type: 0,
    client: 1,
    dossier: 2,
    lawsuit: 3,
    date: 4,
    hearing_date: 5,
    due_date: 6,
    status: 7,
    priority: 8,
    reference: 9,
    title: 10,
  };
  const ordered = [...fields].sort((a, b) => {
    const aScore = priority[String(a.key || "").toLowerCase()] ?? 100;
    const bScore = priority[String(b.key || "").toLowerCase()] ?? 100;
    if (aScore !== bScore) return aScore - bScore;
    return String(a.label || "").localeCompare(String(b.label || ""));
  });
  return ordered.map((field, index) => ({
    key: field.key,
    label: field.label,
    value: field.value,
    icon: fieldIconForKey(field.key, field.label),
    span:
      ordered.length % 2 !== 0 && index === ordered.length - 1
        ? ("full" as const)
        : ("half" as const),
  }));
}

const STRUCTURED_INTERNAL_FIELD_PATTERNS = [
  /agentdraftsnapshot/i,
  /agentdraftprovenance/i,
  /generationuid/i,
  /sourcegenerationuid/i,
  /documentgenerationuid/i,
  /linksource/i,
];

const STRUCTURED_PLACEHOLDER_VALUES = new Set([
  "[draft content placeholder]",
  "__agent_current_draft__",
  "[object object]",
]);

type RelationEntityType =
  | "client"
  | "dossier"
  | "lawsuit"
  | "task"
  | "session"
  | "mission"
  | "financial_entry";

function normalizeFieldIdentity(value: string): string {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function inferRelationEntityTypeFromField(
  fieldKey?: string,
  fieldLabel?: string,
): RelationEntityType | null {
  const keyIdentity = normalizeFieldIdentity(fieldKey || "");
  const labelIdentity = normalizeFieldIdentity(fieldLabel || "");
  const identity = keyIdentity || labelIdentity;

  if (identity === "client" || identity === "clientid") return "client";
  if (identity === "dossier" || identity === "dossierid") return "dossier";
  if (identity === "lawsuit" || identity === "lawsuitid") return "lawsuit";
  if (identity === "task" || identity === "taskid") return "task";
  if (identity === "session" || identity === "sessionid") return "session";
  if (identity === "mission" || identity === "missionid") return "mission";
  if (identity === "financialentry" || identity === "financialentryid") return "financial_entry";
  return null;
}

function isInternalStructuredField(fieldKey?: string, fieldLabel?: string): boolean {
  const keyRaw = String(fieldKey || "").trim();
  const keyIdentity = normalizeFieldIdentity(fieldKey || "");
  const labelIdentity = normalizeFieldIdentity(fieldLabel || "");
  if (!keyIdentity && !labelIdentity) return false;
  if (keyRaw.startsWith("_")) return true;
  if (keyIdentity === "id" || labelIdentity === "id") return true;
  const haystack = `${keyIdentity} ${labelIdentity}`.trim();
  return STRUCTURED_INTERNAL_FIELD_PATTERNS.some((pattern) => pattern.test(haystack));
}

function humanizeStructuredFieldLabel(fieldKey?: string, fieldLabel?: string): string {
  const relationType = inferRelationEntityTypeFromField(fieldKey, fieldLabel);
  if (relationType) return toTitleCase(relationType);
  const source = normalizeText(fieldLabel) || normalizeText(fieldKey);
  if (!source) return "Field";
  const spaced = source
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ");
  return toTitleCase(spaced) || "Field";
}

function coerceEntityId(value: unknown): number | undefined {
  if (typeof value === "number") {
    if (Number.isFinite(value) && value > 0) return Math.trunc(value);
    return undefined;
  }

  const text = normalizeText(value);
  if (!text) return undefined;
  if (/^\d+$/.test(text)) return Number(text);
  if (/^#\d+$/.test(text)) return Number(text.slice(1));

  const prefixedMatch = text.match(
    /^(?:client|dossier|lawsuit|task|session|mission|financial(?:\s|_|-)entry)\s*#?\s*(\d+)$/i,
  );
  if (prefixedMatch?.[1]) return Number(prefixedMatch[1]);
  return undefined;
}

function extractDisplayTextFromObject(value: Record<string, unknown>): string {
  const candidateKeys = ["label", "name", "title", "reference", "display"];
  for (const key of candidateKeys) {
    const candidate = normalizeText(value[key]);
    if (candidate && !STRUCTURED_PLACEHOLDER_VALUES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  if (typeof value.value === "string" || typeof value.value === "number") {
    const candidate = normalizeText(value.value);
    if (candidate && !STRUCTURED_PLACEHOLDER_VALUES.has(candidate.toLowerCase())) {
      return candidate;
    }
  }
  return "";
}

function sanitizeStructuredFieldValue(
  field: StructuredProposalField,
  context: DataContextLike,
): string {
  const relationType = inferRelationEntityTypeFromField(field.key, field.label);
  const rawValue = (field as { value?: unknown }).value;

  const resolveRelation = (candidate: unknown): string => {
    if (!relationType) return "";
    const entityId = coerceEntityId(candidate);
    if (!Number.isFinite(entityId) || !entityId) return "";
    return resolveEntityLabel(relationType, entityId, context) || "";
  };

  if (Array.isArray(rawValue)) {
    const flattened = rawValue
      .map((item) => {
        if (item && typeof item === "object" && !Array.isArray(item)) {
          return extractDisplayTextFromObject(item as Record<string, unknown>);
        }
        const text = normalizeText(item);
        return STRUCTURED_PLACEHOLDER_VALUES.has(text.toLowerCase()) ? "" : text;
      })
      .filter(Boolean);
    return flattened.join(", ");
  }

  if (rawValue && typeof rawValue === "object") {
    const record = rawValue as Record<string, unknown>;
    const resolvedById =
      resolveRelation(record.id) ||
      resolveRelation(record.entityId) ||
      resolveRelation(record.value);
    if (resolvedById) return resolvedById;
    return extractDisplayTextFromObject(record);
  }

  const normalized = normalizeText(rawValue);
  if (!normalized || STRUCTURED_PLACEHOLDER_VALUES.has(normalized.toLowerCase())) return "";

  // Handle diff-format strings like "Current -> 8" or "Current -> [Draft content placeholder]"
  const diffIdx = normalized.indexOf(" -> ");
  if (diffIdx > 0) {
    const beforePart = normalized.slice(0, diffIdx).trim();
    const afterPart = normalized.slice(diffIdx + 4).trim();
    if (!afterPart || STRUCTURED_PLACEHOLDER_VALUES.has(afterPart.toLowerCase())) return "";
    const resolvedAfter = resolveRelation(afterPart);
    if (resolvedAfter) return `${beforePart} -> ${resolvedAfter}`;
    return normalized;
  }

  return resolveRelation(rawValue) || resolveRelation(normalized) || normalized;
}

function sanitizeStructuredFields(
  fields: StructuredProposalField[] | undefined,
  context: DataContextLike,
): StructuredProposalField[] {
  if (!Array.isArray(fields)) return [];
  const sanitized: StructuredProposalField[] = [];
  for (const field of fields) {
    if (!field || typeof field !== "object") continue;
    const key = normalizeText((field as { key?: unknown }).key);
    const label = normalizeText((field as { label?: unknown }).label);
    if (isInternalStructuredField(key, label)) continue;
    const normalizedValue = sanitizeStructuredFieldValue(field, context);
    if (!normalizedValue) continue;
    sanitized.push({
      key: key || normalizeFieldIdentity(label) || "field",
      label: humanizeStructuredFieldLabel(key, label),
      value: normalizedValue,
    });
  }
  return sanitized;
}

function buildStructuredCard(proposal: ActionProposal, context: DataContextLike) {
  const structured = proposal.structured as StructuredProposal | undefined;
  if (!structured || !normalizeText(structured.title)) return undefined;

  const entityLabel = sentenceCase(labelForEntityType(structured.entityType) || structured.entityType || "record");
  const verb = verbLabel(structured.verb);
  const confirmSuffix = verb === "Apply" ? "Apply" : verb;
  const resultEntity = entityLabel || "Item";
  const resultTargetLabel = normalizeText(structured.resultTarget?.label);
  const lowerVerb = verb.toLowerCase();
  const appliedTitle =
    lowerVerb === "create"
      ? `${resultEntity} created successfully`
      : lowerVerb === "delete"
        ? `${resultEntity} deleted successfully`
        : lowerVerb === "update"
          ? `${resultEntity} updated successfully`
          : `${resultEntity} ${lowerVerb}d successfully`;
  const shortcutLabel =
    resultTargetLabel && normalizeText(structured.resultTarget?.type)
      ? `View in ${labelForEntityType(structured.resultTarget?.type) || structured.resultTarget?.type}`
      : undefined;

  return {
    verb,
    entityLabel,
    reversibleLabel:
      structured.reversible === false
        ? "Irreversible"
        : structured.reversible === true
          ? "Reversible"
          : "Review required",
    title: normalizeText(structured.title),
    subtitle: normalizeText(structured.subtitle) || undefined,
    fields: orderStructuredFields(
      sanitizeStructuredFields(
        Array.isArray(structured.fields) ? structured.fields : undefined,
        context,
      ),
    ),
    contentPreview: (() => {
      const rawPreviewText = normalizeMultilineText(structured.contentPreview?.text || "");
      if (!rawPreviewText) return undefined;
      const cleanedText = rawPreviewText
        .split("\n")
        .map((line) => {
          if (!/from payload/i.test(line)) return line;
          const targetMatch = line.match(/Target:\s*(.+?)\.?\s*$/i);
          return targetMatch ? `Linked to ${targetMatch[1].trim()}` : "";
        })
        .filter(Boolean)
        .join("\n");
      return cleanedText
        ? { label: normalizeText(structured.contentPreview?.label) || "Content Preview", text: cleanedText }
        : undefined;
    })(),
    warningHint: "Review before confirming",
    confirmLabel: `Confirm & ${confirmSuffix}`,
    cancelLabel: "Cancel",
    applied: {
      title: appliedTitle,
      subtitle: resultTargetLabel || undefined,
      resultTarget: structured.resultTarget
        ? {
            type: structured.resultTarget.type,
            id: structured.resultTarget.id,
            label: structured.resultTarget.label,
          }
        : undefined,
      shortcutLabel,
    },
    cancelled: {
      title: "Action cancelled",
      subtitle: "No changes were made",
      undoLabel: "Undo",
    },
  };
}

export function resolveEntityLabel(
  entityType: string | undefined,
  entityId: number | undefined,
  context: DataContextLike,
): string | null {
  const type = String(entityType || "").toLowerCase();
  const id = Number(entityId);
  if (!Number.isFinite(id) || id <= 0) return null;

  if (type === "client") {
    const item = context.clients?.find((x) => Number(x.id) === id);
    return item ? item.name || item.reference || `Client #${id}` : `Client #${id}`;
  }
  if (type === "dossier") {
    const item = context.dossiers?.find((x) => Number(x.id) === id);
    return item ? item.title || item.lawsuitNumber || `Dossier #${id}` : `Dossier #${id}`;
  }
  if (type === "lawsuit") {
    const item = context.lawsuits?.find((x) => Number(x.id) === id);
    return item ? item.title || item.lawsuitNumber || `Lawsuit #${id}` : `Lawsuit #${id}`;
  }
  if (type === "task") {
    const item = context.tasks?.find((x) => Number(x.id) === id);
    return item ? item.title || `Task #${id}` : `Task #${id}`;
  }
  if (type === "session") {
    const item = context.sessions?.find((x) => Number(x.id) === id);
    return item ? item.title || item.type || `Session #${id}` : `Session #${id}`;
  }
  if (type === "mission") {
    const item = context.missions?.find((x) => Number(x.id) === id);
    return item ? item.title || item.missionNumber || `Mission #${id}` : `Mission #${id}`;
  }
  if (type === "financial_entry") {
    const item = context.financialEntries?.find((x) => Number(x.id) === id);
    return item ? item.title || item.description || `Financial entry #${id}` : `Financial entry #${id}`;
  }

  return `${toTitleCase(type)} #${id}`;
}

function inferDetectedIntent(proposal: ActionProposal): string {
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  const params = proposal.params || {};
  const entityType = String(params.entityType || "").toUpperCase();
  if (actionType === "DELETE_ENTITY") return `DELETE_${entityType || "UNKNOWN_TARGET"}`;
  if (actionType === "CREATE_ENTITY") return `CREATE_${entityType || "UNKNOWN_TARGET"}`;
  if (actionType === "LINK_ENTITIES") return "LINK_ITEMS";
  if (actionType === "ATTACH_TO_ENTITY") return "ATTACH_DOCUMENT";
  if (actionType === "EXECUTE_MUTATION_WORKFLOW") return "MULTI_STEP_UPDATE";
  const changes = params.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes?.status) return `UPDATE_${entityType || "UNKNOWN_TARGET"}_STATUS`;
  return `UPDATE_${entityType || "UNKNOWN_TARGET"}`;
}

function inferRiskLevel(proposal: ActionProposal): "low" | "medium" | "high" {
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  if (actionType === "DELETE_ENTITY") return "high";
  if (proposal.confirmation?.extraRiskAck === true) return "high";
  if ((proposal.affectedEntities?.length || 0) > 0) return "medium";
  return "low";
}

function deriveActionKind(proposal: ActionProposal): string {
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  if (actionType.includes("DELETE")) return "delete";
  if (actionType.includes("CREATE")) return "create";
  if (actionType.includes("LINK")) return "link";
  if (actionType.includes("ATTACH")) return "attach";
  if (actionType.includes("WORKFLOW")) return "workflow";
  return "update";
}

const PAYLOAD_RELATION_KEYS = new Set(["clientId", "dossierId", "lawsuitId", "officerId"]);

function extractPendingFieldNames(payload: unknown): string[] | undefined {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return undefined;

  const keys = Object.keys(payload as Record<string, unknown>);
  if (keys.length === 0) return undefined;

  const preferredKeys = keys.filter((key) => {
    if (PAYLOAD_RELATION_KEYS.has(key)) return true;
    return !key.toLowerCase().endsWith("id");
  });

  if (preferredKeys.length > 0) return preferredKeys;

  // If the payload only contains internal/id-style keys, preserve relation keys when present.
  const relationKeys = keys.filter((key) => PAYLOAD_RELATION_KEYS.has(key));
  return relationKeys.length > 0 ? relationKeys : undefined;
}

function buildReasonHint(proposal: ActionProposal): string | undefined {
  const changes = proposal.params?.changes as Record<string, { from: unknown; to: unknown }> | undefined;
  if (changes?.status) {
    return `status change to ${String(changes.status.to || "").trim() || "a new value"}`;
  }
  if (String(proposal.actionType || "").toUpperCase() === "DELETE_ENTITY") {
    return "permanent removal";
  }
  return undefined;
}

function normalizeWorkflowRequestedGoalChanges(
  workflow: Record<string, unknown> | undefined,
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!workflow || typeof workflow !== "object") return undefined;
  const requestedGoal =
    workflow.requestedGoal && typeof workflow.requestedGoal === "object"
      ? (workflow.requestedGoal as Record<string, unknown>)
      : undefined;
  if (!requestedGoal) return undefined;
  const operation = String(requestedGoal.operation || "").toLowerCase();
  if (operation !== "update") return undefined;
  const changes =
    requestedGoal.changes && typeof requestedGoal.changes === "object" && !Array.isArray(requestedGoal.changes)
      ? (requestedGoal.changes as Record<string, unknown>)
      : undefined;
  if (!changes) return undefined;
  return normalizeChangesObject(changes);
}

function buildWorkflowStepImpactHints(
  workflow: Record<string, unknown> | undefined,
  context: DataContextLike,
): string[] {
  if (!workflow || typeof workflow !== "object") return [];
  const steps = Array.isArray((workflow as Record<string, unknown>).steps)
    ? ((workflow as Record<string, unknown>).steps as Array<Record<string, unknown>>)
    : [];
  const rootEntity =
    workflow.rootEntity && typeof workflow.rootEntity === "object"
      ? (workflow.rootEntity as Record<string, unknown>)
      : undefined;
  const rootType = String(rootEntity?.type || "").toLowerCase();
  const rootId = Number(rootEntity?.id);

  const hints: string[] = [];
  for (const step of steps) {
    const actionType = String(step?.actionType || step?.action || step?.type || "").toUpperCase();
    if (actionType !== "UPDATE_ENTITY") continue;
    const params =
      step.params && typeof step.params === "object" && !Array.isArray(step.params)
        ? (step.params as Record<string, unknown>)
        : step.payload && typeof step.payload === "object" && !Array.isArray(step.payload)
          ? (step.payload as Record<string, unknown>)
          : {};
    const entityType = String(params.entityType || "").toLowerCase();
    const entityId = Number(params.entityId);
    if (entityType && rootType && entityType === rootType && Number.isFinite(entityId) && entityId === rootId) {
      continue;
    }

    const changes =
      params.changes && typeof params.changes === "object" && !Array.isArray(params.changes)
        ? (params.changes as Record<string, unknown>)
        : {};
    const changeKeys = Object.keys(changes);
    if (changeKeys.length === 0) continue;

    const targetLabel =
      resolveEntityLabel(entityType, Number.isFinite(entityId) ? entityId : undefined, context) ||
      labelForEntityType(entityType) ||
      "related information";

    const fieldSummaries = changeKeys.slice(0, 2).map((field) => {
      const raw = (changes as Record<string, unknown>)[field];
      const nextValue =
        raw && typeof raw === "object" && !Array.isArray(raw) && "to" in (raw as Record<string, unknown>)
          ? (raw as Record<string, unknown>).to
          : raw;
      return `${toTitleCase(field)} -> ${toTitleCase(String(nextValue ?? "updated"))}`;
    });
    const extraCount = changeKeys.length > 2 ? ` (+${changeKeys.length - 2} more)` : "";
    hints.push(`${targetLabel}: ${fieldSummaries.join(", ")}${extraCount}`);
  }

  const reasoningSummary = String((workflow as Record<string, unknown>).reasoningSummary || "").trim();
  if (reasoningSummary) hints.push(reasoningSummary);

  return hints;
}

function getWorkflowPreviewItems(proposal: ActionProposal): Array<Record<string, unknown>> {
  const fromTopLevel = Array.isArray(proposal.workflowPreview?.previewItems)
    ? (proposal.workflowPreview?.previewItems as Array<Record<string, unknown>>)
    : [];
  if (fromTopLevel.length > 0) return fromTopLevel;

  const fromLegacyTopLevel = Array.isArray(proposal.previewItems)
    ? (proposal.previewItems as Array<Record<string, unknown>>)
    : [];
  if (fromLegacyTopLevel.length > 0) return fromLegacyTopLevel;

  const params = proposal.params || {};
  const workflow =
    params.workflow && typeof params.workflow === "object" && !Array.isArray(params.workflow)
      ? (params.workflow as Record<string, unknown>)
      : undefined;
  return Array.isArray(workflow?.previewItems)
    ? (workflow.previewItems as Array<Record<string, unknown>>)
    : [];
}

function normalizeStatusValue(value: unknown): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return toTitleCase(normalized);
}

function normalizePriorityValue(value: unknown): string | null {
  const normalized = String(value || "").trim();
  if (!normalized) return null;
  return toTitleCase(normalized);
}

function resolveParentLabel(
  parentLinkage: Record<string, unknown> | undefined,
  context: DataContextLike,
): string | null {
  if (!parentLinkage || typeof parentLinkage !== "object") return null;

  const lawsuitReference = String(parentLinkage.lawsuitReference || "").trim();
  if (lawsuitReference) return lawsuitReference;
  const dossierReference = String(parentLinkage.dossierReference || "").trim();
  if (dossierReference) return dossierReference;
  const clientReference = String(parentLinkage.clientReference || "").trim();
  if (clientReference) return clientReference;

  const lawsuitId = Number(parentLinkage.lawsuitId);
  if (Number.isFinite(lawsuitId) && lawsuitId > 0) {
    const label = resolveEntityLabel("lawsuit", lawsuitId, context);
    if (label) return label;
  }

  const dossierId = Number(parentLinkage.dossierId);
  if (Number.isFinite(dossierId) && dossierId > 0) {
    const label = resolveEntityLabel("dossier", dossierId, context);
    if (label) return label;
  }

  const clientId = Number(parentLinkage.clientId);
  if (Number.isFinite(clientId) && clientId > 0) {
    const label = resolveEntityLabel("client", clientId, context);
    if (label) return label;
  }

  return null;
}

function buildWorkflowPreviewImpactHints(
  proposal: ActionProposal,
  context: DataContextLike,
): string[] {
  const items = getWorkflowPreviewItems(proposal);
  if (items.length === 0) return [];

  return items.map((item, idx) => {
    const entityType = String(item.entityType || "record").trim().toLowerCase();
    const operation = String(item.operation || item.actionType || "change").trim().toLowerCase();
    const title = String(item.title || "").trim();
    const status = normalizeStatusValue(item.status);
    const priority = normalizePriorityValue(item.priority);
    const parentLabel = resolveParentLabel(
      item.parentLinkage && typeof item.parentLinkage === "object"
        ? (item.parentLinkage as Record<string, unknown>)
        : undefined,
      context,
    );
    const baseLabel = title
      ? `${toTitleCase(entityType)}: ${title}`
      : `${toTitleCase(operation)} ${toTitleCase(entityType)} #${idx + 1}`;
    const metaParts = [
      status ? `status ${status}` : null,
      priority ? `priority ${priority}` : null,
      parentLabel ? `linked to ${parentLabel}` : null,
    ].filter(Boolean);
    if (metaParts.length === 0) return baseLabel;
    return `${baseLabel} (${metaParts.join(", ")})`;
  });
}

function buildCanonicalProposalPreview(proposal: ActionProposal) {
  const explicitPreview =
    proposal.preview && typeof proposal.preview === "object" && !Array.isArray(proposal.preview)
      ? proposal.preview
      : null;
  const explicitItems = Array.isArray(explicitPreview?.items) ? explicitPreview.items : [];
  if (explicitPreview && explicitItems.length > 0) {
    return {
      title: String(explicitPreview.title || proposal.humanReadableSummary || "Planned changes").trim(),
      items: explicitItems
        .map((row, idx) => {
          const title = String(row?.title || "").trim();
          if (!title) return null;
          const parentLinks = Array.isArray(row?.parentLinks)
            ? row.parentLinks.map((value) => String(value || "").trim()).filter(Boolean)
            : [];
          return {
            index: Number.isFinite(Number(row?.index)) ? Number(row.index) : idx + 1,
            entityType: String(row?.entityType || "").trim() || null,
            operation: String(row?.operation || "").trim() || null,
            title,
            status: String(row?.status || "").trim() || null,
            priority: String(row?.priority || "").trim() || null,
            parentLinks: parentLinks.length > 0 ? parentLinks : null,
            explicitFields: Array.isArray(row?.explicitFields) ? row.explicitFields : [],
            defaultedFields: Array.isArray(row?.defaultedFields) ? row.defaultedFields : [],
            inheritedFields: Array.isArray(row?.inheritedFields) ? row.inheritedFields : [],
            inferredFields: Array.isArray(row?.inferredFields) ? row.inferredFields : [],
            correctedFields: Array.isArray(row?.correctedFields) ? row.correctedFields : [],
            fieldDecisionMap:
              row?.fieldDecisionMap && typeof row.fieldDecisionMap === "object" && !Array.isArray(row.fieldDecisionMap)
                ? row.fieldDecisionMap
                : {},
            inferenceSummary:
              row?.inferenceSummary && typeof row.inferenceSummary === "object" && !Array.isArray(row.inferenceSummary)
                ? row.inferenceSummary
                : {},
            warnings: Array.isArray(row?.warnings) ? row.warnings : [],
          };
        })
        .filter(Boolean) as Array<{
        index: number;
        entityType: string | null;
        operation: string | null;
        title: string;
        status: string | null;
        priority: string | null;
        parentLinks: string[] | null;
        explicitFields: string[];
        defaultedFields: string[];
        inheritedFields: string[];
        inferredFields: Array<Record<string, unknown>>;
        correctedFields: Array<Record<string, unknown>>;
        fieldDecisionMap: Record<string, unknown>;
        inferenceSummary: Record<string, unknown>;
        warnings: string[];
      }>,
      warnings: Array.isArray(explicitPreview?.warnings)
        ? explicitPreview.warnings.map((value) => String(value || "").trim()).filter(Boolean)
        : [],
    };
  }

  const workflowItems = getWorkflowPreviewItems(proposal);
  if (workflowItems.length === 0) return null;
  return {
    title:
      String(proposal.workflowPreview?.summaryLine || proposal.humanReadableSummary || "Planned changes").trim() ||
      "Planned changes",
    items: workflowItems
      .map((item, idx) => {
        const title = String(item.title || "").trim();
        if (!title) return null;
        const parentLinks = [
          String((item.parentLinkage as Record<string, unknown> | undefined)?.lawsuitReference || "").trim(),
          String((item.parentLinkage as Record<string, unknown> | undefined)?.dossierReference || "").trim(),
          String((item.parentLinkage as Record<string, unknown> | undefined)?.clientReference || "").trim(),
        ].filter(Boolean);
        return {
          index: idx + 1,
          entityType: String(item.entityType || "").trim() || null,
          operation: String(item.operation || item.actionType || "").trim() || null,
          title,
          status: String(item.status || "").trim() || null,
          priority: String(item.priority || "").trim() || null,
          parentLinks: parentLinks.length ? parentLinks : null,
          explicitFields: Array.isArray(item?.explicitFields) ? item.explicitFields : [],
          defaultedFields: Array.isArray(item?.defaultedFields) ? item.defaultedFields : [],
          inheritedFields: Array.isArray(item?.inheritedFields) ? item.inheritedFields : [],
          inferredFields: Array.isArray(item?.inferredFields) ? item.inferredFields : [],
          correctedFields: Array.isArray(item?.correctedFields) ? item.correctedFields : [],
          fieldDecisionMap:
            item?.fieldDecisionMap && typeof item.fieldDecisionMap === "object" && !Array.isArray(item.fieldDecisionMap)
              ? item.fieldDecisionMap
              : {},
          inferenceSummary:
            item?.inferenceSummary && typeof item.inferenceSummary === "object" && !Array.isArray(item.inferenceSummary)
              ? item.inferenceSummary
              : {},
          warnings: Array.isArray(item?.warnings) ? item.warnings : [],
        };
      })
      .filter(Boolean) as Array<{
      index: number;
      entityType: string | null;
      operation: string | null;
      title: string;
      status: string | null;
      priority: string | null;
      parentLinks: string[] | null;
      explicitFields: string[];
      defaultedFields: string[];
      inheritedFields: string[];
      inferredFields: Array<Record<string, unknown>>;
      correctedFields: Array<Record<string, unknown>>;
      fieldDecisionMap: Record<string, unknown>;
      inferenceSummary: Record<string, unknown>;
      warnings: string[];
    }>,
    warnings: [],
  };
}

function normalizeChangesObject(
  changes: Record<string, unknown> | undefined,
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!changes || typeof changes !== "object" || Array.isArray(changes)) return undefined;
  const normalized: Record<string, { from: unknown; to: unknown }> = {};
  for (const [key, value] of Object.entries(changes)) {
    if (!key) continue;
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if ("to" in record || "from" in record) {
        normalized[key] = { from: record.from, to: record.to };
        continue;
      }
    }
    normalized[key] = { from: undefined, to: value };
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function snakeToCamel(value: string): string {
  return String(value || "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function camelToSnake(value: string): string {
  return String(value || "").replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function getEntityCollection(
  context: DataContextLike,
  entityType: string,
): Array<Record<string, unknown>> {
  const normalized = String(entityType || "").toLowerCase();
  if (normalized === "client") return (context.clients || []) as Array<Record<string, unknown>>;
  if (normalized === "dossier") return (context.dossiers || []) as Array<Record<string, unknown>>;
  if (normalized === "lawsuit") return (context.lawsuits || []) as Array<Record<string, unknown>>;
  if (normalized === "task") return (context.tasks || []) as Array<Record<string, unknown>>;
  if (normalized === "session") return (context.sessions || []) as Array<Record<string, unknown>>;
  if (normalized === "mission") return (context.missions || []) as Array<Record<string, unknown>>;
  if (normalized === "financial_entry") {
    return (context.financialEntries || []) as Array<Record<string, unknown>>;
  }
  return [];
}

function resolveCurrentFieldValue(
  context: DataContextLike,
  entityType: string,
  entityId: number | undefined,
  field: string,
): unknown {
  if (!Number.isFinite(entityId) || Number(entityId) <= 0) return undefined;
  const collection = getEntityCollection(context, entityType);
  if (!Array.isArray(collection) || collection.length === 0) return undefined;

  const row =
    collection.find((item) => Number((item as Record<string, unknown>)?.id) === Number(entityId)) ||
    null;
  if (!row) return undefined;

  const direct = (row as Record<string, unknown>)[field];
  if (!(direct === undefined || direct === null || direct === "")) return direct;

  const camel = snakeToCamel(field);
  const camelValue = (row as Record<string, unknown>)[camel];
  if (!(camelValue === undefined || camelValue === null || camelValue === "")) return camelValue;

  const snake = camelToSnake(field);
  const snakeValue = (row as Record<string, unknown>)[snake];
  if (!(snakeValue === undefined || snakeValue === null || snakeValue === "")) return snakeValue;

  return undefined;
}

function hydrateMissingFromValues(
  changes: Record<string, { from: unknown; to: unknown }> | undefined,
  context: DataContextLike,
  entityType: string,
  entityId: number | undefined,
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!changes || typeof changes !== "object") return changes;
  const hydrated: Record<string, { from: unknown; to: unknown }> = {};
  for (const [field, diff] of Object.entries(changes)) {
    const missingFrom = diff?.from === undefined || diff?.from === null || diff?.from === "";
    if (!missingFrom) {
      hydrated[field] = diff;
      continue;
    }
    const current = resolveCurrentFieldValue(context, entityType, entityId, field);
    hydrated[field] = {
      from: current === undefined ? diff?.from : current,
      to: diff?.to,
    };
  }
  return Object.keys(hydrated).length > 0 ? hydrated : changes;
}

function normalizePreviewPrimaryChanges(
  preview: ConfirmationPreview | undefined,
  entityType: string,
  entityId: number | undefined,
): Record<string, { from: unknown; to: unknown }> | undefined {
  const items = Array.isArray(preview?.primaryChanges) ? preview.primaryChanges : [];
  if (items.length === 0) return undefined;
  const normalized: Record<string, { from: unknown; to: unknown }> = {};
  for (const item of items) {
    const field = String(item?.field || "").trim();
    if (!field) continue;
    const itemType = String(item?.entityType || "").toLowerCase();
    const itemId = Number(item?.entityId);
    const sameType = !itemType || itemType === entityType;
    const sameId = !Number.isFinite(itemId) || (Number.isFinite(entityId) && itemId === entityId);
    if (!sameType || !sameId) continue;
    normalized[field] = { from: item?.from, to: item?.to };
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function extractWorkflowRootStepChanges(
  workflow: Record<string, unknown> | undefined,
): Record<string, { from: unknown; to: unknown }> | undefined {
  if (!workflow || typeof workflow !== "object") return undefined;
  const rootEntity =
    workflow.rootEntity && typeof workflow.rootEntity === "object"
      ? (workflow.rootEntity as Record<string, unknown>)
      : undefined;
  const rootType = String(rootEntity?.type || "").toLowerCase();
  const rootId = Number(rootEntity?.id);
  const steps = Array.isArray(workflow.steps) ? (workflow.steps as Array<Record<string, unknown>>) : [];
  if (!rootType || !Number.isFinite(rootId) || steps.length === 0) return undefined;

  // Prefer the last root UPDATE_ENTITY step because workflow cleanups usually end by applying the requested root change.
  for (let i = steps.length - 1; i >= 0; i -= 1) {
    const step = steps[i];
    const actionType = String(step?.actionType || step?.action || step?.type || "").toUpperCase();
    if (actionType !== "UPDATE_ENTITY") continue;
    const params =
      step.params && typeof step.params === "object" && !Array.isArray(step.params)
        ? (step.params as Record<string, unknown>)
        : undefined;
    if (!params) continue;
    const entityType = String(params.entityType || "").toLowerCase();
    const entityId = Number(params.entityId);
    if (entityType !== rootType || !Number.isFinite(entityId) || entityId !== rootId) continue;
    const changes =
      params.changes && typeof params.changes === "object" && !Array.isArray(params.changes)
        ? (params.changes as Record<string, unknown>)
        : undefined;
    const normalized = normalizeChangesObject(changes);
    if (normalized && Object.keys(normalized).length > 0) return normalized;
  }

  return undefined;
}

export function proposalToSemanticInput(
  proposal: ActionProposal,
  context: DataContextLike,
): SemanticActionMappingInput {
  const params = proposal.params || {};
  const confirmationPreview = proposal.confirmation?.preview;
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  const workflow =
    params.workflow && typeof params.workflow === "object" && !Array.isArray(params.workflow)
      ? (params.workflow as Record<string, unknown>)
      : undefined;
  const primaryAffected = proposal.affectedEntities?.[0];
  const entityType =
    String(
      params.entityType ||
        (workflow?.rootEntity as Record<string, unknown> | undefined)?.type ||
        confirmationPreview?.root?.type ||
        params.targetType ||
        params.sourceType ||
        params.target?.type ||
        primaryAffected?.type ||
        "unknown_target",
    ).toLowerCase() || "unknown_target";

  const entityId = Number(
    params.entityId ||
      (workflow?.rootEntity as Record<string, unknown> | undefined)?.id ||
      confirmationPreview?.root?.id ||
      params.targetId ||
      params.sourceId ||
      params.target?.id ||
      primaryAffected?.id,
  );

  const affectedItems = (proposal.affectedEntities || [])
    .map((item) => ({
      label:
        resolveEntityLabel(item.type, Number(item.id), context) ||
        item.reference ||
        labelForEntityType(item.type),
      type: item.type,
    }))
    .filter((item) => Boolean(item.label));

  const subjectLabel =
    params.entityLabel ||
    params.reference ||
    params.title ||
    params.targetLabel ||
    params.sourceLabel ||
    params.targetTitle ||
    params.sourceTitle ||
    confirmationPreview?.root?.label ||
    resolveEntityLabel(entityType, Number.isFinite(entityId) ? entityId : undefined, context) ||
    affectedItems[0]?.label ||
    undefined;

  const impactHints =
    confirmationPreview && String(confirmationPreview.scope || "").toLowerCase() === "workflow"
      ? []
      : (proposal.confirmation?.impactSummary || [])
          .map((line) => String(line || "").trim())
          .filter(Boolean);
  const workflowImpactHints = confirmationPreview ? [] : buildWorkflowStepImpactHints(workflow, context);
  const proposalPreview = buildCanonicalProposalPreview(proposal);
  const workflowPreviewImpactHints = confirmationPreview
    ? []
    : proposalPreview && proposalPreview.items.length > 0
      ? []
      : buildWorkflowPreviewImpactHints(proposal, context);

  const baseChanges =
    actionType === "UPDATE_ENTITY"
      ? ((params.changes as Record<string, { from: unknown; to: unknown }> | undefined) ||
          normalizePreviewPrimaryChanges(
            confirmationPreview,
            entityType,
            Number.isFinite(entityId) ? entityId : undefined,
          ))
      : actionType === "EXECUTE_MUTATION_WORKFLOW"
        ? normalizePreviewPrimaryChanges(
            confirmationPreview,
            entityType,
            Number.isFinite(entityId) ? entityId : undefined,
          ) ||
          normalizeWorkflowRequestedGoalChanges(workflow) ||
          extractWorkflowRootStepChanges(workflow)
      : undefined;
  const changes = hydrateMissingFromValues(
    baseChanges,
    context,
    entityType,
    Number.isFinite(entityId) ? entityId : undefined,
  );
  const pendingFieldNames =
    actionType === "UPDATE_ENTITY" &&
    (!changes || Object.keys(changes).length === 0) &&
    params.payload
      ? extractPendingFieldNames(params.payload)
      : undefined;

  return {
    entityType,
    detectedIntent: inferDetectedIntent(proposal),
    changes,
    context: {
      subjectLabel: String(subjectLabel || "").trim() || undefined,
      userUtterance: proposal.userMessageDraft,
      affectedItems,
      reversible: typeof proposal.reversible === "boolean" ? proposal.reversible : null,
      riskLevel: inferRiskLevel(proposal),
      reasonHint: buildReasonHint(proposal),
      impactHints: [...impactHints, ...workflowPreviewImpactHints, ...workflowImpactHints],
      pendingFieldNames,
      actionKind: deriveActionKind(proposal),
      requiresRiskAck: proposal.confirmation?.extraRiskAck === true,
      confirmationPreview: confirmationPreview,
      proposalPreview: proposalPreview || undefined,
      structuredCard: buildStructuredCard(proposal, context),
      proposalSummary:
        String(proposal.humanReadableSummary || "").trim() ||
        String(proposal.description || "").trim() ||
        undefined,
    },
  };
}
