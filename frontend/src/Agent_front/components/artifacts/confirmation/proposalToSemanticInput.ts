import type { ActionProposal } from "../../../../services/api/agent";
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

export function proposalToSemanticInput(
  proposal: ActionProposal,
  context: DataContextLike,
): SemanticActionMappingInput {
  const params = proposal.params || {};
  const actionType = String(proposal.actionType || proposal.action || "").toUpperCase();
  const primaryAffected = proposal.affectedEntities?.[0];
  const entityType =
    String(
      params.entityType ||
        params.targetType ||
        params.sourceType ||
        params.target?.type ||
        primaryAffected?.type ||
        "unknown_target",
    ).toLowerCase() || "unknown_target";

  const entityId = Number(
    params.entityId ||
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
    resolveEntityLabel(entityType, Number.isFinite(entityId) ? entityId : undefined, context) ||
    affectedItems[0]?.label ||
    undefined;

  const impactHints = (proposal.confirmation?.impactSummary || [])
    .map((line) => String(line || "").trim())
    .filter(Boolean);

  const changes =
    actionType === "UPDATE_ENTITY"
      ? (params.changes as Record<string, { from: unknown; to: unknown }> | undefined)
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
      impactHints,
      pendingFieldNames,
      actionKind: deriveActionKind(proposal),
      requiresRiskAck: proposal.confirmation?.extraRiskAck === true,
    },
  };
}
