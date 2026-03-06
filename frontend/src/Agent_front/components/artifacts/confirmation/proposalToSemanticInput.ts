import type { ActionProposal, ConfirmationPreview } from "../../../../services/api/agent";
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

  const changes =
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
      proposalSummary:
        String(proposal.humanReadableSummary || "").trim() ||
        String(proposal.description || "").trim() ||
        undefined,
    },
  };
}
