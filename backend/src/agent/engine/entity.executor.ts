import type { PendingActionPlan } from "../types";

declare const require: (id: string) => unknown;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string };

interface EntityService {
  create?: (payload: Record<string, unknown>) => unknown | Promise<unknown>;
  update?: (id: number | string, payload: Record<string, unknown>) => unknown | Promise<unknown>;
  remove?: (id: number | string) => unknown | Promise<unknown>;
}

export interface EntityExecutionResult {
  ok: boolean;
  result?: Record<string, unknown>;
  errorCode?: string;
  errorMessage?: string;
}

const SERVICE_BY_ENTITY: Record<string, string> = {
  client: "clients.service",
  dossier: "dossiers.service",
  lawsuit: "lawsuits.service",
  task: "tasks.service",
  personal_task: "personalTasks.service",
  mission: "missions.service",
  session: "sessions.service",
  document: "documents.service",
  officer: "officers.service",
  notification: "notifications.service",
  financial_entry: "financial.service",
  history_event: "history.service",
};

const ENTITY_ALIASES: Record<string, string> = {
  clients: "client",
  dossiers: "dossier",
  lawsuits: "lawsuit",
  tasks: "task",
  personaltask: "personal_task",
  personaltasks: "personal_task",
  personal_tasks: "personal_task",
  missions: "mission",
  sessions: "session",
  documents: "document",
  officers: "officer",
  notifications: "notification",
  financialentry: "financial_entry",
  financialentries: "financial_entry",
  financial_entries: "financial_entry",
  historyevent: "history_event",
  historyevents: "history_event",
  history_events: "history_event",
};

export class EntityExecutor {
  private readonly serviceCache = new Map<string, EntityService | null>();

  async execute(plan: PendingActionPlan): Promise<EntityExecutionResult> {
    const operation = normalizePlanOperation(plan);
    if (!operation) {
      return {
        ok: false,
        errorCode: "INVALID_PLAN_OPERATION",
        errorMessage: "Pending plan operation payload is invalid.",
      };
    }

    const entityType = canonicalEntityType(operation.entityType);
    if (!entityType) {
      return {
        ok: false,
        errorCode: "UNSUPPORTED_ENTITY_TYPE",
        errorMessage: `Unsupported entity type "${String(operation.entityType)}".`,
      };
    }

    const service = this.getService(entityType);
    if (!service) {
      return {
        ok: false,
        errorCode: "ENTITY_SERVICE_UNAVAILABLE",
        errorMessage: `Entity service for "${entityType}" is unavailable.`,
      };
    }

    try {
      if (operation.operation === "create") {
        const payload = isRecord(operation.payload) ? operation.payload : null;
        if (!payload) {
          return {
            ok: false,
            errorCode: "INVALID_CREATE_PAYLOAD",
            errorMessage: "Create operation requires a payload object.",
          };
        }
        if (typeof service.create !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const created = await Promise.resolve(service.create(payload));
        const entityId = extractEntityId(created);
        return {
          ok: true,
          result: {
            operation: "create",
            entityType,
            ...(entityId != null ? { entityId } : {}),
            ...(isRecord(created) ? { entity: created } : { value: created }),
          },
        };
      }

      if (operation.operation === "update") {
        const entityId = coerceEntityId(operation.entityId);
        if (entityId == null) {
          return {
            ok: false,
            errorCode: "INVALID_ENTITY_ID",
            errorMessage: "Update operation requires a valid entityId.",
          };
        }
        const changes = isRecord(operation.changes)
          ? operation.changes
          : isRecord(operation.payload)
          ? operation.payload
          : null;
        if (!changes || Object.keys(changes).length === 0) {
          return {
            ok: false,
            errorCode: "INVALID_UPDATE_CHANGES",
            errorMessage: "Update operation requires a non-empty changes object.",
          };
        }
        if (typeof service.update !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const updated = await Promise.resolve(service.update(entityId, changes));
        if (updated == null) {
          return {
            ok: false,
            errorCode: "ENTITY_NOT_FOUND",
            errorMessage: `${entityType} ${String(entityId)} was not found for update.`,
          };
        }
        const resolvedId = extractEntityId(updated) ?? entityId;
        return {
          ok: true,
          result: {
            operation: "update",
            entityType,
            entityId: resolvedId,
            ...(isRecord(updated) ? { entity: updated } : { value: updated }),
          },
        };
      }

      if (operation.operation === "delete") {
        const entityId = coerceEntityId(operation.entityId);
        if (entityId == null) {
          return {
            ok: false,
            errorCode: "INVALID_ENTITY_ID",
            errorMessage: "Delete operation requires a valid entityId.",
          };
        }
        if (typeof service.remove !== "function") {
          return unsupportedOperation(entityType, operation.operation);
        }
        const removed = await Promise.resolve(service.remove(entityId));
        const deleted = normalizeDeleteOutcome(removed);
        if (!deleted) {
          return {
            ok: false,
            errorCode: "ENTITY_NOT_FOUND",
            errorMessage: `${entityType} ${String(entityId)} was not found for deletion.`,
          };
        }
        return {
          ok: true,
          result: {
            operation: "delete",
            entityType,
            entityId,
            deleted: true,
          },
        };
      }

      return {
        ok: false,
        errorCode: "UNSUPPORTED_OPERATION",
        errorMessage: `Unsupported operation "${operation.operation}".`,
      };
    } catch (error) {
      return normalizeExecutionError(error);
    }
  }

  private getService(entityType: string): EntityService | null {
    if (this.serviceCache.has(entityType)) {
      return this.serviceCache.get(entityType) ?? null;
    }

    const fileName = SERVICE_BY_ENTITY[entityType];
    if (!fileName) {
      this.serviceCache.set(entityType, null);
      return null;
    }

    try {
      const resolved = _path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "services",
        fileName,
      );
      const loaded = require(resolved) as EntityService;
      const service = loaded && typeof loaded === "object" ? loaded : null;
      this.serviceCache.set(entityType, service);
      return service;
    } catch {
      this.serviceCache.set(entityType, null);
      return null;
    }
  }
}

function normalizePlanOperation(
  plan: PendingActionPlan | null | undefined,
): PendingActionPlan["operation"] | null {
  if (!plan || !isRecord(plan.operation)) {
    return null;
  }
  const operationRaw = String(plan.operation.operation || "").trim().toLowerCase();
  if (
    operationRaw !== "create" &&
    operationRaw !== "update" &&
    operationRaw !== "delete"
  ) {
    return null;
  }
  const entityType = String(plan.operation.entityType || "").trim();
  if (!entityType) {
    return null;
  }
  return {
    operation: operationRaw,
    entityType,
    entityId: plan.operation.entityId,
    payload: plan.operation.payload,
    changes: plan.operation.changes,
    reason: plan.operation.reason,
  };
}

function canonicalEntityType(value: string): string | null {
  const raw = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!raw) {
    return null;
  }
  const canonical = ENTITY_ALIASES[raw] || raw;
  return SERVICE_BY_ENTITY[canonical] ? canonical : null;
}

function unsupportedOperation(
  entityType: string,
  operation: "create" | "update" | "delete",
): EntityExecutionResult {
  return {
    ok: false,
    errorCode: "UNSUPPORTED_OPERATION",
    errorMessage: `Operation "${operation}" is not supported for entity type "${entityType}".`,
  };
}

function extractEntityId(value: unknown): number | string | null {
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "id")) {
    return coerceEntityId(value.id);
  }
  if (isRecord(value) && Object.prototype.hasOwnProperty.call(value, "entityId")) {
    return coerceEntityId(value.entityId);
  }
  return null;
}

function coerceEntityId(value: unknown): number | string | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
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

function normalizeDeleteOutcome(value: unknown): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "number") {
    return value > 0;
  }
  if (isRecord(value)) {
    if (typeof value.deleted === "boolean") {
      return value.deleted;
    }
    if (typeof value.changes === "number") {
      return value.changes > 0;
    }
    if (typeof value.ok === "boolean") {
      return value.ok;
    }
  }
  return Boolean(value);
}

function normalizeExecutionError(error: unknown): EntityExecutionResult {
  const message =
    error instanceof Error && error.message.trim().length > 0
      ? error.message
      : String(error || "Entity execution failed.");
  const lowered = message.toLowerCase();
  const code =
    lowered.includes("required") ||
    lowered.includes("invalid") ||
    lowered.includes("no fields provided")
      ? "ENTITY_VALIDATION_ERROR"
      : "ENTITY_EXECUTION_ERROR";
  return {
    ok: false,
    errorCode: code,
    errorMessage: message,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
