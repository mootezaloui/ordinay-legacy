import type {
  DraftArtifact,
  LinkResolutionCandidate,
  LinkResolutionDiagnostic,
  PlanOperation,
} from "../types";

type LinkSource = "payload" | "draft_context" | "active_entities";

interface SessionEntityContext {
  type?: unknown;
  id?: unknown;
  label?: unknown;
  lastMentionedAt?: unknown;
}

export interface LinkResolverContext {
  activeEntities?: SessionEntityContext[];
  currentDraft?: DraftArtifact | null;
}

export type LinkResolutionStatus = "unchanged" | "resolved" | "ambiguous" | "unresolved";

export interface LinkResolutionResult {
  status: LinkResolutionStatus;
  operation: PlanOperation;
  diagnostic: LinkResolutionDiagnostic;
  message?: string;
}

const LINK_FIELD_BY_ENTITY_TYPE: Record<string, string> = {
  client: "client_id",
  dossier: "dossier_id",
  lawsuit: "lawsuit_id",
  mission: "mission_id",
  task: "task_id",
  session: "session_id",
  personal_task: "personal_task_id",
  financial_entry: "financial_entry_id",
  officer: "officer_id",
};

const RELATION_LINK_RULES: Record<string, string[]> = {
  task: ["dossier", "lawsuit"],
  session: ["dossier", "lawsuit"],
  mission: ["dossier", "lawsuit"],
  document: [
    "client",
    "dossier",
    "lawsuit",
    "mission",
    "task",
    "session",
    "personal_task",
    "financial_entry",
    "officer",
  ],
};

const ENTITY_TYPE_ALIASES: Record<string, string> = {
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  sessions: "session",
  missions: "mission",
  documents: "document",
  officers: "officer",
  personaltask: "personal_task",
  personaltasks: "personal_task",
  personal_tasks: "personal_task",
  financialentry: "financial_entry",
  financialentries: "financial_entry",
  financial_entries: "financial_entry",
};

const LINK_TYPE_PRIORITY: Record<string, number> = {
  dossier: 1,
  lawsuit: 2,
  client: 3,
  mission: 4,
  task: 5,
  session: 6,
  personal_task: 7,
  financial_entry: 8,
  officer: 9,
};

export class LinkResolver {
  resolve(
    operation: PlanOperation,
    context: LinkResolverContext,
  ): LinkResolutionResult {
    const normalized = normalizeCreateOperation(operation);
    if (!normalized) {
      return {
        status: "unchanged",
        operation,
        diagnostic: {
          status: "unchanged",
          reason: "non_create_operation",
        },
      };
    }

    const allowedLinkTypes = RELATION_LINK_RULES[normalized.entityType] || [];
    if (allowedLinkTypes.length === 0) {
      return {
        status: "unchanged",
        operation: normalized,
        diagnostic: {
          status: "unchanged",
          reason: "entity_has_no_link_resolution_rule",
        },
      };
    }

    const payload = isRecord(normalized.payload) ? { ...normalized.payload } : {};
    const explicitLinks = collectExplicitLinks(payload, allowedLinkTypes);
    if (explicitLinks.length === 1) {
      const explicit = explicitLinks[0];
      const explicitLabel = resolveContextCandidateLabel(
        explicit.entityType,
        explicit.entityId,
        context,
      );
      const explicitCandidate: LinkResolutionCandidate = {
        entityType: explicit.entityType,
        entityId: explicit.entityId,
        source: "payload",
        ...(explicitLabel ? { label: explicitLabel } : {}),
      };
      return {
        status: "unchanged",
        operation: { ...normalized, payload },
        diagnostic: {
          status: "unchanged",
          source: "payload",
          field: explicit.field,
          entityType: explicit.entityType,
          entityId: explicit.entityId,
          candidates: [explicitCandidate],
          message:
            `Parent link preserved from payload: ${explicit.entityType} ${String(explicit.entityId)}.`,
        },
      };
    }

    if (explicitLinks.length > 1) {
      const candidates = explicitLinks.map((row) => ({
        entityType: row.entityType,
        entityId: row.entityId,
        source: "payload",
      })) as LinkResolutionCandidate[];
      return {
        status: "ambiguous",
        operation: { ...normalized, payload },
        message:
          `Create ${normalized.entityType} includes multiple parent links in payload. ` +
          "Keep exactly one parent reference.",
        diagnostic: {
          status: "ambiguous",
          reason: "multiple_payload_links",
          candidates,
          message:
            `Multiple payload parent links detected for create ${normalized.entityType}.`,
        },
      };
    }

    const contextCandidates = collectContextCandidates(allowedLinkTypes, context);
    if (contextCandidates.length === 0) {
      return {
        status: "unresolved",
        operation: { ...normalized, payload },
        diagnostic: {
          status: "unresolved",
          reason: "no_context_candidate",
          message: `No deterministic parent candidate found for create ${normalized.entityType}.`,
        },
      };
    }

    if (contextCandidates.length > 1) {
      const labelParts = contextCandidates
        .slice(0, 5)
        .map((row) => `${row.entityType} ${String(row.entityId)}`);
      return {
        status: "ambiguous",
        operation: { ...normalized, payload },
        message:
          `Could not determine a single parent for create ${normalized.entityType}. ` +
          `Candidates: ${labelParts.join(", ")}.`,
        diagnostic: {
          status: "ambiguous",
          reason: "multiple_context_candidates",
          candidates: contextCandidates,
          message:
            `Multiple parent candidates detected for create ${normalized.entityType}.`,
        },
      };
    }

    const winner = contextCandidates[0];
    const field = LINK_FIELD_BY_ENTITY_TYPE[winner.entityType];
    if (!field) {
      return {
        status: "unresolved",
        operation: { ...normalized, payload },
        diagnostic: {
          status: "unresolved",
          reason: "missing_field_mapping",
          message: `No link field mapping configured for ${winner.entityType}.`,
        },
      };
    }

    payload[field] = winner.entityId;
    const source = winner.source || "active_entities";
    return {
      status: "resolved",
      operation: { ...normalized, payload },
      diagnostic: {
        status: "resolved",
        source,
        field,
        entityType: winner.entityType,
        entityId: winner.entityId,
        candidates: [winner],
        message:
          `Resolved parent link for create ${normalized.entityType}: ` +
          `${winner.entityType} ${String(winner.entityId)} from ${source}.`,
      },
    };
  }
}

function normalizeCreateOperation(operation: PlanOperation): PlanOperation | null {
  if (!isRecord(operation)) return null;
  const op = String(operation.operation || "").trim().toLowerCase();
  if (op !== "create") return null;
  const entityType = canonicalEntityType(operation.entityType);
  if (!entityType) return null;
  const normalized: PlanOperation = {
    operation: "create",
    entityType,
  };
  if (isRecord(operation.payload)) {
    normalized.payload = { ...operation.payload };
  }
  if (typeof operation.reason === "string" && operation.reason.trim().length > 0) {
    normalized.reason = operation.reason.trim();
  }
  return normalized;
}

function collectExplicitLinks(
  payload: Record<string, unknown>,
  allowedLinkTypes: string[],
): Array<{ entityType: string; entityId: number | string; field: string }> {
  const links: Array<{ entityType: string; entityId: number | string; field: string }> = [];
  for (const entityType of allowedLinkTypes) {
    const field = LINK_FIELD_BY_ENTITY_TYPE[entityType];
    if (!field) continue;
    const camel = snakeToCamel(field);
    const value = payload[field] ?? payload[camel];
    const entityId = normalizeEntityId(value);
    if (entityId == null) continue;
    links.push({ entityType, entityId, field });
  }
  return links;
}

function collectContextCandidates(
  allowedLinkTypes: string[],
  context: LinkResolverContext,
): LinkResolutionCandidate[] {
  const candidates: LinkResolutionCandidate[] = [];
  const dedupe = new Set<string>();

  const draftType = canonicalEntityType(context.currentDraft?.linkedEntityType);
  const draftId = normalizeEntityId(context.currentDraft?.linkedEntityId);
  if (draftType && draftId != null && allowedLinkTypes.includes(draftType)) {
    const key = `${draftType}:${String(draftId)}`;
    dedupe.add(key);
    candidates.push({
      entityType: draftType,
      entityId: draftId,
      source: "draft_context",
    });
  }

  const activeRows = Array.isArray(context.activeEntities) ? context.activeEntities : [];
  for (const row of sortActiveEntities(activeRows)) {
    const entityType = canonicalEntityType(row.type);
    const entityId = normalizeEntityId(row.id);
    if (!entityType || entityId == null) continue;
    if (!allowedLinkTypes.includes(entityType)) continue;
    const key = `${entityType}:${String(entityId)}`;
    if (dedupe.has(key)) continue;
    dedupe.add(key);
    const label =
      typeof row.label === "string" && row.label.trim().length > 0
        ? row.label.trim()
        : undefined;
    candidates.push({
      entityType,
      entityId,
      ...(label ? { label } : {}),
      source: "active_entities",
    });
  }

  return candidates;
}

function resolveContextCandidateLabel(
  entityType: string,
  entityId: number | string,
  context: LinkResolverContext,
): string | undefined {
  const activeRows = Array.isArray(context.activeEntities) ? context.activeEntities : [];
  const match = activeRows.find((row) => {
    const type = canonicalEntityType(row?.type);
    if (type !== entityType) return false;
    const id = normalizeEntityId(row?.id);
    if (id == null) return false;
    return String(id) === String(entityId);
  });
  if (match && typeof match.label === "string" && match.label.trim().length > 0) {
    return match.label.trim();
  }
  return undefined;
}

function sortActiveEntities(rows: SessionEntityContext[]): SessionEntityContext[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    const aType = canonicalEntityType(a.type);
    const bType = canonicalEntityType(b.type);
    const aPriority = aType ? LINK_TYPE_PRIORITY[aType] || 99 : 99;
    const bPriority = bType ? LINK_TYPE_PRIORITY[bType] || 99 : 99;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aMentioned = normalizeTimestamp(a.lastMentionedAt);
    const bMentioned = normalizeTimestamp(b.lastMentionedAt);
    if (aMentioned !== bMentioned) return bMentioned - aMentioned;
    return String(a.id ?? "").localeCompare(String(b.id ?? ""));
  });
  return copy;
}

function normalizeTimestamp(value: unknown): number {
  if (typeof value !== "string" || value.trim().length === 0) return 0;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function canonicalEntityType(value: unknown): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) return null;
  const canonical = ENTITY_TYPE_ALIASES[raw] || raw;
  return LINK_FIELD_BY_ENTITY_TYPE[canonical] || RELATION_LINK_RULES[canonical]
    ? canonical
    : null;
}

function normalizeEntityId(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
    return trimmed;
  }
  return null;
}

function snakeToCamel(value: string): string {
  return String(value || "").replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
