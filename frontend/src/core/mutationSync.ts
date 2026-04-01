export type MutationOperation = "create" | "update" | "delete" | "attach";

export interface MutationScope {
  clientId?: number;
  dossierId?: number;
  lawsuitId?: number;
  parentEntityType?: string;
  parentEntityId?: number;
}

export interface MutationLinkParentRef {
  entityType: string;
  entityId: number;
  field?: string;
}

export interface MutationLinkingMetadata {
  sourceTrace?: "explicit" | "resolved" | "fallback";
  resolutionStatus?: "unchanged" | "resolved" | "ambiguous" | "unresolved";
  parentLinks?: MutationLinkParentRef[];
}

export interface EntityMutationSuccessEvent {
  type: "ENTITY_MUTATION_SUCCESS";
  entityType: string;
  entityId: number | null;
  operation: MutationOperation;
  scope: MutationScope;
  linking?: MutationLinkingMetadata;
  source?: "agent" | "api" | "manual" | "unknown";
  sessionId?: string | null;
  timestamp?: string;
}

export interface MutationInvalidationPlan {
  keys: string[];
  scopeKeys: string[];
}

const ENTITY_MUTATION_EVENT_NAME = "ordinay:entity-mutation-success";
const recentMutationEvents = new Map<string, number>();

/*
BEFORE (manual refresh scattered):
Agent/Component -> local callback -> ad-hoc setState/refetch -> partial UI sync

AFTER (global mutation sync):
Agent SSE / API mutation -> mutationSync.emit -> mutationSync listener -> centralized invalidation/refetch
*/
export const ENTITY_INVALIDATION_MAP: Record<string, string[]> = {
  client: ["clients", "clientDetails", "clientDossiers", "clientTimeline"],
  dossier: ["dossiers", "dossierDetails", "dossierTasks", "dossierDocuments", "dossierMissions"],
  lawsuit: ["lawsuits", "lawsuitDetails", "lawsuitTasks", "lawsuitDocuments", "lawsuitSessions"],
  task: ["tasks", "taskDetails", "dossierTasks", "lawsuitTasks"],
  session: ["sessions", "sessionDetails", "dossierSessions", "lawsuitSessions"],
  mission: ["missions", "missionDetails", "dossierMissions", "lawsuitMissions"],
  officer: ["officers", "officerDetails", "officerMissions"],
  financial_entry: ["financialEntries", "financialDetails", "entityFinancialEntries"],
  document: ["documents", "documentDetails", "entityDocuments"],
  personal_task: ["personalTasks", "personalTaskDetails"],
  note: ["notes", "entityNotes"],
  notification: ["notifications", "sidebarCounters"],
};

const ROUTE_ENTITY_MAP: Record<string, string> = {
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  sessions: "session",
  missions: "mission",
  officers: "officer",
  financial: "financial_entry",
  documents: "document",
  "personal-tasks": "personal_task",
  notes: "note",
  notifications: "notification",
};

function toPositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  if (Number.isInteger(parsed) && parsed > 0) return parsed;
  return undefined;
}

function normalizeEntityType(value: unknown): string | null {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized || null;
}

function normalizeOperation(value: unknown, fallback: MutationOperation = "update"): MutationOperation {
  const operation = String(value || fallback).trim().toLowerCase();
  if (operation === "create" || operation === "update" || operation === "delete" || operation === "attach") {
    return operation;
  }
  return fallback;
}

function normalizeScope(input: unknown): MutationScope {
  if (!input || typeof input !== "object") return {};
  const scope = input as Record<string, unknown>;
  return {
    clientId: toPositiveInt(scope.clientId ?? scope.client_id),
    dossierId: toPositiveInt(scope.dossierId ?? scope.dossier_id),
    lawsuitId: toPositiveInt(scope.lawsuitId ?? scope.lawsuit_id),
    parentEntityType: normalizeEntityType(scope.parentEntityType ?? scope.parent_entity_type) || undefined,
    parentEntityId: toPositiveInt(scope.parentEntityId ?? scope.parent_entity_id),
  };
}

function normalizeLinking(input: unknown): MutationLinkingMetadata | undefined {
  if (!input || typeof input !== "object") return undefined;
  const linking = input as Record<string, unknown>;
  const sourceTraceRaw = String(linking.sourceTrace || "").trim().toLowerCase();
  const sourceTrace =
    sourceTraceRaw === "explicit" || sourceTraceRaw === "resolved" || sourceTraceRaw === "fallback"
      ? (sourceTraceRaw as MutationLinkingMetadata["sourceTrace"])
      : undefined;
  const resolutionStatusRaw = String(linking.resolutionStatus || "").trim().toLowerCase();
  const resolutionStatus =
    resolutionStatusRaw === "unchanged" ||
    resolutionStatusRaw === "resolved" ||
    resolutionStatusRaw === "ambiguous" ||
    resolutionStatusRaw === "unresolved"
      ? (resolutionStatusRaw as MutationLinkingMetadata["resolutionStatus"])
      : undefined;
  const parentLinks = Array.isArray(linking.parentLinks)
    ? linking.parentLinks
        .map((row) => {
          if (!row || typeof row !== "object") return null;
          const record = row as Record<string, unknown>;
          const entityType = normalizeEntityType(record.entityType);
          const entityId = toPositiveInt(record.entityId);
          if (!entityType || !entityId) return null;
          const field =
            typeof record.field === "string" && record.field.trim().length > 0
              ? record.field.trim()
              : undefined;
          return {
            entityType,
            entityId,
            ...(field ? { field } : {}),
          } as MutationLinkParentRef;
        })
        .filter((row): row is MutationLinkParentRef => Boolean(row))
    : [];
  if (!sourceTrace && !resolutionStatus && parentLinks.length === 0) {
    return undefined;
  }
  return {
    ...(sourceTrace ? { sourceTrace } : {}),
    ...(resolutionStatus ? { resolutionStatus } : {}),
    ...(parentLinks.length > 0 ? { parentLinks } : {}),
  };
}

function normalizeMutationEvent(input: unknown): EntityMutationSuccessEvent | null {
  if (!input || typeof input !== "object") return null;
  const raw = input as Record<string, unknown>;
  if (String(raw.type || "").toUpperCase() !== "ENTITY_MUTATION_SUCCESS") return null;
  const entityType = normalizeEntityType(raw.entityType);
  if (!entityType) return null;
  const entityId = toPositiveInt(raw.entityId) ?? null;
  const linking = normalizeLinking(raw.linking);
  return {
    type: "ENTITY_MUTATION_SUCCESS",
    entityType,
    entityId,
    operation: normalizeOperation(raw.operation),
    scope: normalizeScope(raw.scope),
    ...(linking ? { linking } : {}),
    source: (String(raw.source || "").toLowerCase() as EntityMutationSuccessEvent["source"]) || "unknown",
    sessionId: typeof raw.sessionId === "string" ? raw.sessionId : null,
    timestamp: typeof raw.timestamp === "string" ? raw.timestamp : new Date().toISOString(),
  };
}

export function buildMutationInvalidationPlan(event: EntityMutationSuccessEvent): MutationInvalidationPlan {
  const keys = new Set<string>(["sidebarCounters"]);
  const entityKeys = ENTITY_INVALIDATION_MAP[event.entityType] || [];
  for (const key of entityKeys) keys.add(key);
  keys.add("activeScope");
  keys.add("activeEntityLists");
  const scopeKeys = new Set<string>();
  if (event.scope.clientId) scopeKeys.add(`client:${event.scope.clientId}`);
  if (event.scope.dossierId) scopeKeys.add(`dossier:${event.scope.dossierId}`);
  if (event.scope.lawsuitId) scopeKeys.add(`lawsuit:${event.scope.lawsuitId}`);
  if (event.scope.parentEntityType && event.scope.parentEntityId) {
    scopeKeys.add(`${event.scope.parentEntityType}:${event.scope.parentEntityId}`);
  }
  if (Array.isArray(event.linking?.parentLinks)) {
    for (const link of event.linking.parentLinks) {
      if (!link.entityType || !link.entityId) continue;
      scopeKeys.add(`${link.entityType}:${link.entityId}`);
    }
  }
  return {
    keys: [...keys],
    scopeKeys: [...scopeKeys],
  };
}

export function emitEntityMutationSuccess(event: EntityMutationSuccessEvent): void {
  if (typeof window === "undefined" || typeof window.dispatchEvent !== "function") return;
  const dedupeKey = `${event.entityType}:${event.entityId ?? "null"}:${event.operation}`;
  const now = Date.now();
  const previous = recentMutationEvents.get(dedupeKey) || 0;
  if (now - previous < 250) return;
  recentMutationEvents.set(dedupeKey, now);
  window.dispatchEvent(
    new CustomEvent(ENTITY_MUTATION_EVENT_NAME, {
      detail: event,
    }),
  );
}

export function emitEntityMutationFromBackendEvent(input: unknown): void {
  const event = normalizeMutationEvent(input);
  if (!event) return;
  emitEntityMutationSuccess(event);
}

export function emitEntityMutationFromAgentOutcome(input: unknown): void {
  if (!input || typeof input !== "object") return;
  const payload = input as Record<string, unknown>;
  if (String(payload.status || "").toUpperCase() !== "EXECUTED") return;
  const entityType = normalizeEntityType(payload.entityType);
  const entityId = toPositiveInt(payload.entityId) ?? null;
  if (!entityType || entityId == null) return;
  emitEntityMutationSuccess({
    type: "ENTITY_MUTATION_SUCCESS",
    entityType,
    entityId,
    operation: normalizeOperation(payload.operation, "update"),
    scope: normalizeScope(payload.scope),
    source: "agent",
    timestamp: new Date().toISOString(),
  });
}

export function emitEntityMutationFromApiResponse({
  method,
  path,
  response,
  requestBody,
}: {
  method: string;
  path: string;
  response: unknown;
  requestBody?: unknown;
}): void {
  const normalizedPath = String(path || "").split("?")[0];
  const parts = normalizedPath.split("/").filter(Boolean);
  const segment = parts[0];
  const entityType = ROUTE_ENTITY_MAP[segment];
  if (!entityType) return;
  const operation = normalizeOperation(
    method.toUpperCase() === "POST"
      ? "create"
      : method.toUpperCase() === "DELETE"
        ? "delete"
        : "update",
  );
  const responseObj = response && typeof response === "object" ? (response as Record<string, unknown>) : {};
  const bodyObj = requestBody && typeof requestBody === "object" ? (requestBody as Record<string, unknown>) : {};
  const pathId = parts.length > 1 ? toPositiveInt(parts[1]) : undefined;
  const entityId = toPositiveInt(responseObj.id) ?? pathId ?? null;
  emitEntityMutationSuccess({
    type: "ENTITY_MUTATION_SUCCESS",
    entityType,
    entityId,
    operation,
    scope: normalizeScope({
      ...bodyObj,
      ...responseObj,
    }),
    source: "api",
    timestamp: new Date().toISOString(),
  });
}

export function subscribeEntityMutationSuccess(
  handler: (event: EntityMutationSuccessEvent, plan: MutationInvalidationPlan) => void,
): () => void {
  if (typeof window === "undefined" || typeof window.addEventListener !== "function") {
    return () => {};
  }
  const listener = (evt: Event) => {
    const detail = (evt as CustomEvent).detail;
    const normalized = normalizeMutationEvent(detail);
    if (!normalized) return;
    handler(normalized, buildMutationInvalidationPlan(normalized));
  };
  window.addEventListener(ENTITY_MUTATION_EVENT_NAME, listener);
  return () => window.removeEventListener(ENTITY_MUTATION_EVENT_NAME, listener);
}
