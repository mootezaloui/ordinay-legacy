import type { PlanOperation } from "../types";
import {
  canonicalizeTargetStatus,
  isClosedLike,
  isFinancialCancelled,
  isFinancialPaid,
  isInactiveLike,
  isMissionTerminal,
  isReceivableEntry,
  isSessionTerminal,
  isTaskTerminal,
  normalizeStatus,
} from "./status.normalizer";

declare const require: (id: string) => unknown;
declare const __dirname: string;
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string };

interface EntityService {
  list?: () => unknown[] | Promise<unknown[]>;
  listByClient?: (clientId: number | string) => unknown[] | Promise<unknown[]>;
  listByDossier?: (dossierId: number | string) => unknown[] | Promise<unknown[]>;
  listByLawsuit?: (lawsuitId: number | string) => unknown[] | Promise<unknown[]>;
  get?: (id: number | string) => unknown | Promise<unknown>;
}

export interface DomainRuleValidationResult {
  allowed: boolean;
  blockerCounts: Record<string, number>;
  notes: string[];
  rootEntityLabel?: string;
}

export interface ClientInactiveBlockers {
  client: Record<string, unknown> | null;
  dossiers: Record<string, unknown>[];
  lawsuits: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  missions: Record<string, unknown>[];
  unpaidReceivables: Record<string, unknown>[];
}

export interface DossierCloseBlockers {
  dossier: Record<string, unknown> | null;
  lawsuits: Record<string, unknown>[];
  tasks: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  missions: Record<string, unknown>[];
  unpaidReceivables: Record<string, unknown>[];
}

export interface LawsuitCloseBlockers {
  lawsuit: Record<string, unknown> | null;
  tasks: Record<string, unknown>[];
  sessions: Record<string, unknown>[];
  missions: Record<string, unknown>[];
}

export class DomainRuleProfile {
  private readonly serviceCache = new Map<string, EntityService | null>();

  async validateOperation(operation: PlanOperation): Promise<DomainRuleValidationResult> {
    const op = String(operation.operation || "").trim().toLowerCase();
    const entityType = String(operation.entityType || "").trim().toLowerCase();
    const entityId = normalizeEntityId(operation.entityId);

    if (!entityType) {
      return {
        allowed: false,
        blockerCounts: { invalid_entity_type: 1 },
        notes: ["Entity type is required for domain validation."],
      };
    }

    if ((op === "update" || op === "delete") && entityId == null) {
      return {
        allowed: false,
        blockerCounts: { invalid_entity_id: 1 },
        notes: ["Entity ID is required for this operation."],
      };
    }

    if (op === "update" && isRecord(operation.changes) && Object.prototype.hasOwnProperty.call(operation.changes, "status")) {
      const targetStatus = canonicalizeTargetStatus(entityType, (operation.changes as Record<string, unknown>).status);
      if (entityType === "client" && targetStatus === "inactive" && entityId != null) {
        return this.validateClientInactive(entityId);
      }
      if (entityType === "dossier" && targetStatus === "closed" && entityId != null) {
        return this.validateDossierClosed(entityId);
      }
      if (entityType === "lawsuit" && targetStatus === "closed" && entityId != null) {
        return this.validateLawsuitClosed(entityId);
      }
      if (entityType === "officer" && targetStatus === "inactive" && entityId != null) {
        return this.validateOfficerInactive(entityId);
      }
    }

    if (op === "delete" && entityId != null) {
      if (entityType === "client") {
        return this.validateClientDelete(entityId);
      }
      if (entityType === "dossier") {
        return this.validateDossierDelete(entityId);
      }
      if (entityType === "lawsuit") {
        return this.validateLawsuitDelete(entityId);
      }
    }

    const ancestorConstraint = await this.validateAncestorConstraint(operation, op, entityType, entityId);
    if (ancestorConstraint) {
      return ancestorConstraint;
    }

    return { allowed: true, blockerCounts: {}, notes: [] };
  }

  async getClientInactiveBlockers(clientId: number | string): Promise<ClientInactiveBlockers> {
    const clientsService = this.getService("clients.service");
    const dossiersService = this.getService("dossiers.service");
    const lawsuitsService = this.getService("lawsuits.service");
    const tasksService = this.getService("tasks.service");
    const sessionsService = this.getService("sessions.service");
    const missionsService = this.getService("missions.service");
    const financialService = this.getService("financial.service");

    const client = toRecord(await callService(clientsService, "get", clientId));
    const dossierRows = await this.listByClient(dossiersService, clientId);
    const dossierIds = new Set(dossierRows.map((row) => row.id).filter((id) => id != null).map(String));

    const lawsuitRows = await this.listByDossierSet(lawsuitsService, dossierIds);
    const lawsuitIds = new Set(lawsuitRows.map((row) => row.id).filter((id) => id != null).map(String));

    const allTasks = await this.listAll(tasksService);
    const allSessions = await this.listAll(sessionsService);
    const allMissions = await this.listAll(missionsService);
    const allFinancialEntries = await this.listAll(financialService);

    const tasks = allTasks.filter((row) => {
      const dossierId = row.dossier_id ?? row.dossierId;
      const lawsuitId = row.lawsuit_id ?? row.lawsuitId;
      return (
        (dossierId != null && dossierIds.has(String(dossierId))) ||
        (lawsuitId != null && lawsuitIds.has(String(lawsuitId)))
      );
    });
    const sessions = allSessions.filter((row) => {
      const dossierId = row.dossier_id ?? row.dossierId;
      const lawsuitId = row.lawsuit_id ?? row.lawsuitId;
      return (
        (dossierId != null && dossierIds.has(String(dossierId))) ||
        (lawsuitId != null && lawsuitIds.has(String(lawsuitId)))
      );
    });
    const missions = allMissions.filter((row) => {
      const dossierId = row.dossier_id ?? row.dossierId;
      const lawsuitId = row.lawsuit_id ?? row.lawsuitId;
      return (
        (dossierId != null && dossierIds.has(String(dossierId))) ||
        (lawsuitId != null && lawsuitIds.has(String(lawsuitId)))
      );
    });

    const unpaidReceivables = allFinancialEntries.filter((entry) => {
      const linkedClientId = entry.client_id ?? entry.clientId;
      if (linkedClientId == null || String(linkedClientId) !== String(clientId)) {
        return false;
      }
      if (!isReceivableEntry(entry)) return false;
      if (isFinancialCancelled(entry.status)) return false;
      return !isFinancialPaid(entry);
    });

    return {
      client,
      dossiers: dossierRows.filter((row) => !isClosedLike(row.status)),
      lawsuits: lawsuitRows.filter((row) => !isClosedLike(row.status)),
      tasks: tasks.filter((row) => !isTaskTerminal(row.status)),
      sessions: sessions.filter((row) => !isSessionTerminal(row.status)),
      missions: missions.filter((row) => !isMissionTerminal(row.status)),
      unpaidReceivables,
    };
  }

  async getDossierCloseBlockers(dossierId: number | string): Promise<DossierCloseBlockers> {
    const dossiersService = this.getService("dossiers.service");
    const lawsuitsService = this.getService("lawsuits.service");
    const tasksService = this.getService("tasks.service");
    const sessionsService = this.getService("sessions.service");
    const missionsService = this.getService("missions.service");
    const financialService = this.getService("financial.service");

    const dossier = toRecord(await callService(dossiersService, "get", dossierId));
    const lawsuitRows = await this.listByDossier(lawsuitsService, dossierId);
    const lawsuitIds = new Set(lawsuitRows.map((row) => row.id).filter((id) => id != null).map(String));

    const tasks = (await this.listAll(tasksService)).filter((row) => {
      const linkedDossier = row.dossier_id ?? row.dossierId;
      const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
      return (
        (linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
        (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit)))
      );
    });

    const sessions = (await this.listAll(sessionsService)).filter((row) => {
      const linkedDossier = row.dossier_id ?? row.dossierId;
      const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
      return (
        (linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
        (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit)))
      );
    });

    const missions = (await this.listAll(missionsService)).filter((row) => {
      const linkedDossier = row.dossier_id ?? row.dossierId;
      const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
      return (
        (linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
        (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit)))
      );
    });

    const clientId = dossier?.client_id ?? dossier?.clientId;
    const financialRows = await this.listAll(financialService);
    const unpaidReceivables = financialRows.filter((entry) => {
      if (clientId == null) return false;
      const linkedClientId = entry.client_id ?? entry.clientId;
      if (linkedClientId == null || String(linkedClientId) !== String(clientId)) {
        return false;
      }
      if (!isReceivableEntry(entry)) return false;
      if (isFinancialCancelled(entry.status)) return false;
      return !isFinancialPaid(entry);
    });

    return {
      dossier,
      lawsuits: lawsuitRows.filter((row) => !isClosedLike(row.status)),
      tasks: tasks.filter((row) => !isTaskTerminal(row.status)),
      sessions: sessions.filter((row) => !isSessionTerminal(row.status)),
      missions: missions.filter((row) => !isMissionTerminal(row.status)),
      unpaidReceivables,
    };
  }

  async getLawsuitCloseBlockers(lawsuitId: number | string): Promise<LawsuitCloseBlockers> {
    const lawsuitsService = this.getService("lawsuits.service");
    const tasksService = this.getService("tasks.service");
    const sessionsService = this.getService("sessions.service");
    const missionsService = this.getService("missions.service");

    const lawsuit = toRecord(await callService(lawsuitsService, "get", lawsuitId));
    const tasks = await this.listByLawsuit(tasksService, lawsuitId);
    const sessions = await this.listByLawsuit(sessionsService, lawsuitId);
    const missions = await this.listByLawsuit(missionsService, lawsuitId);
    return {
      lawsuit,
      tasks: tasks.filter((row) => !isTaskTerminal(row.status)),
      sessions: sessions.filter((row) => !isSessionTerminal(row.status)),
      missions: missions.filter((row) => !isMissionTerminal(row.status)),
    };
  }

  private async validateClientInactive(clientId: number | string): Promise<DomainRuleValidationResult> {
    const blockers = await this.getClientInactiveBlockers(clientId);
    const blockerCounts = {
      open_dossiers: blockers.dossiers.length,
      open_lawsuits: blockers.lawsuits.length,
      open_tasks: blockers.tasks.length,
      open_sessions: blockers.sessions.length,
      active_missions: blockers.missions.length,
      unpaid_receivables: blockers.unpaidReceivables.length,
    };
    const notes: string[] = [];
    if (blockerCounts.open_dossiers > 0) notes.push(`Client has ${blockerCounts.open_dossiers} open dossiers.`);
    if (blockerCounts.open_lawsuits > 0) notes.push(`Client has ${blockerCounts.open_lawsuits} open lawsuits.`);
    if (blockerCounts.open_tasks > 0) notes.push(`Client has ${blockerCounts.open_tasks} non-terminal tasks.`);
    if (blockerCounts.open_sessions > 0) notes.push(`Client has ${blockerCounts.open_sessions} non-terminal sessions.`);
    if (blockerCounts.active_missions > 0) notes.push(`Client has ${blockerCounts.active_missions} active missions.`);
    if (blockerCounts.unpaid_receivables > 0) notes.push(`Client has ${blockerCounts.unpaid_receivables} unpaid receivable entries.`);
    return {
      allowed: notes.length === 0,
      blockerCounts,
      notes,
      rootEntityLabel: asLabel(blockers.client),
    };
  }

  private async validateDossierClosed(dossierId: number | string): Promise<DomainRuleValidationResult> {
    const blockers = await this.getDossierCloseBlockers(dossierId);
    const blockerCounts = {
      open_lawsuits: blockers.lawsuits.length,
      open_tasks: blockers.tasks.length,
      open_sessions: blockers.sessions.length,
      active_missions: blockers.missions.length,
      unpaid_receivables: blockers.unpaidReceivables.length,
    };
    const notes: string[] = [];
    if (blockerCounts.open_lawsuits > 0) notes.push(`Dossier has ${blockerCounts.open_lawsuits} open lawsuits.`);
    if (blockerCounts.open_tasks > 0) notes.push(`Dossier has ${blockerCounts.open_tasks} non-terminal tasks.`);
    if (blockerCounts.open_sessions > 0) notes.push(`Dossier has ${blockerCounts.open_sessions} non-terminal sessions.`);
    if (blockerCounts.active_missions > 0) notes.push(`Dossier has ${blockerCounts.active_missions} active missions.`);
    if (blockerCounts.unpaid_receivables > 0) notes.push(`Client linked to dossier has ${blockerCounts.unpaid_receivables} unpaid receivable entries.`);
    return {
      allowed: notes.length === 0,
      blockerCounts,
      notes,
      rootEntityLabel: asLabel(blockers.dossier),
    };
  }

  private async validateLawsuitClosed(lawsuitId: number | string): Promise<DomainRuleValidationResult> {
    const blockers = await this.getLawsuitCloseBlockers(lawsuitId);
    const blockerCounts = {
      open_tasks: blockers.tasks.length,
      open_sessions: blockers.sessions.length,
      active_missions: blockers.missions.length,
    };
    const notes: string[] = [];
    if (blockerCounts.open_tasks > 0) notes.push(`Lawsuit has ${blockerCounts.open_tasks} non-terminal tasks.`);
    if (blockerCounts.open_sessions > 0) notes.push(`Lawsuit has ${blockerCounts.open_sessions} non-terminal sessions.`);
    if (blockerCounts.active_missions > 0) notes.push(`Lawsuit has ${blockerCounts.active_missions} active missions.`);
    return {
      allowed: notes.length === 0,
      blockerCounts,
      notes,
      rootEntityLabel: asLabel(blockers.lawsuit),
    };
  }

  private async validateOfficerInactive(officerId: number | string): Promise<DomainRuleValidationResult> {
    const missionsService = this.getService("missions.service");
    const officersService = this.getService("officers.service");
    const officer = toRecord(await callService(officersService, "get", officerId));
    const missions = (await this.listAll(missionsService)).filter((row) => {
      const linkedOfficer = row.officer_id ?? row.officerId;
      return linkedOfficer != null && String(linkedOfficer) === String(officerId);
    });
    const activeMissions = missions.filter((row) => !isMissionTerminal(row.status));
    const notes =
      activeMissions.length > 0
        ? [`Officer has ${activeMissions.length} active missions.`]
        : [];
    return {
      allowed: notes.length === 0,
      blockerCounts: { active_missions: activeMissions.length },
      notes,
      rootEntityLabel: asLabel(officer),
    };
  }

  private async validateClientDelete(clientId: number | string): Promise<DomainRuleValidationResult> {
    const dossiers = await this.listByClient(this.getService("dossiers.service"), clientId);
    const notes = dossiers.length > 0 ? [`Client has ${dossiers.length} linked dossiers.`] : [];
    return { allowed: notes.length === 0, blockerCounts: { linked_dossiers: dossiers.length }, notes };
  }

  private async validateDossierDelete(dossierId: number | string): Promise<DomainRuleValidationResult> {
    const lawsuits = await this.listByDossier(this.getService("lawsuits.service"), dossierId);
    const tasks = await this.listByDossier(this.getService("tasks.service"), dossierId);
    const sessions = await this.listByDossier(this.getService("sessions.service"), dossierId);
    const missions = await this.listByDossier(this.getService("missions.service"), dossierId);
    const total = lawsuits.length + tasks.length + sessions.length + missions.length;
    const notes: string[] = [];
    if (lawsuits.length > 0) notes.push(`Dossier has ${lawsuits.length} linked lawsuits.`);
    if (tasks.length > 0) notes.push(`Dossier has ${tasks.length} linked tasks.`);
    if (sessions.length > 0) notes.push(`Dossier has ${sessions.length} linked sessions.`);
    if (missions.length > 0) notes.push(`Dossier has ${missions.length} linked missions.`);
    return {
      allowed: total === 0,
      blockerCounts: {
        linked_lawsuits: lawsuits.length,
        linked_tasks: tasks.length,
        linked_sessions: sessions.length,
        linked_missions: missions.length,
      },
      notes,
    };
  }

  private async validateLawsuitDelete(lawsuitId: number | string): Promise<DomainRuleValidationResult> {
    const tasks = await this.listByLawsuit(this.getService("tasks.service"), lawsuitId);
    const sessions = await this.listByLawsuit(this.getService("sessions.service"), lawsuitId);
    const missions = await this.listByLawsuit(this.getService("missions.service"), lawsuitId);
    const total = tasks.length + sessions.length + missions.length;
    const notes: string[] = [];
    if (tasks.length > 0) notes.push(`Lawsuit has ${tasks.length} linked tasks.`);
    if (sessions.length > 0) notes.push(`Lawsuit has ${sessions.length} linked sessions.`);
    if (missions.length > 0) notes.push(`Lawsuit has ${missions.length} linked missions.`);
    return {
      allowed: total === 0,
      blockerCounts: {
        linked_tasks: tasks.length,
        linked_sessions: sessions.length,
        linked_missions: missions.length,
      },
      notes,
    };
  }

  private async validateAncestorConstraint(
    operation: PlanOperation,
    op: string,
    entityType: string,
    entityId: number | string | null,
  ): Promise<DomainRuleValidationResult | null> {
    if (op !== "create" && op !== "update") {
      return null;
    }
    const guardedTypes = new Set(["dossier", "lawsuit", "task", "session", "mission"]);
    if (!guardedTypes.has(entityType)) {
      return null;
    }

    const refs = await this.resolveOperationRefs(operation, entityType, entityId);
    const clientsService = this.getService("clients.service");
    const dossiersService = this.getService("dossiers.service");
    const lawsuitsService = this.getService("lawsuits.service");

    let client = refs.clientId != null
      ? toRecord(await callService(clientsService, "get", refs.clientId))
      : null;
    let dossier = refs.dossierId != null
      ? toRecord(await callService(dossiersService, "get", refs.dossierId))
      : null;
    let lawsuit = refs.lawsuitId != null
      ? toRecord(await callService(lawsuitsService, "get", refs.lawsuitId))
      : null;

    if (!dossier && lawsuit) {
      const linkedDossierId = normalizeEntityId(lawsuit.dossier_id ?? lawsuit.dossierId);
      if (linkedDossierId != null) {
        dossier = toRecord(await callService(dossiersService, "get", linkedDossierId));
      }
    }
    if (!client && dossier) {
      const linkedClientId = normalizeEntityId(dossier.client_id ?? dossier.clientId);
      if (linkedClientId != null) {
        client = toRecord(await callService(clientsService, "get", linkedClientId));
      }
    }

    const blockerCounts: Record<string, number> = {};
    const notes: string[] = [];

    if (client && isInactiveLike(client.status)) {
      blockerCounts.inactive_client_ancestor = 1;
      notes.push("Linked parent client is inactive.");
    }
    if (entityType !== "dossier" && dossier && isClosedLike(dossier.status)) {
      blockerCounts.closed_dossier_ancestor = 1;
      notes.push("Linked parent dossier is closed.");
    }
    if (entityType !== "lawsuit" && lawsuit && isClosedLike(lawsuit.status)) {
      blockerCounts.closed_lawsuit_ancestor = 1;
      notes.push("Linked parent lawsuit is closed.");
    }

    if (notes.length === 0) {
      return null;
    }

    return {
      allowed: false,
      blockerCounts,
      notes,
      rootEntityLabel: asLabel(client || dossier || lawsuit || null),
    };
  }

  private async resolveOperationRefs(
    operation: PlanOperation,
    entityType: string,
    entityId: number | string | null,
  ): Promise<{ clientId: number | string | null; dossierId: number | string | null; lawsuitId: number | string | null }> {
    const source = await this.readOperationSource(operation, entityType, entityId);

    let clientId = normalizeEntityId(source.client_id ?? source.clientId);
    let dossierId = normalizeEntityId(source.dossier_id ?? source.dossierId);
    let lawsuitId = normalizeEntityId(source.lawsuit_id ?? source.lawsuitId);

    const parentType = normalizeStatus(source.parentType ?? source.parent_type).replace(/_/g, "");
    const parentId = normalizeEntityId(source.parentId ?? source.parent_id);
    if (parentType === "dossier" && dossierId == null) {
      dossierId = parentId;
    }
    if (parentType === "lawsuit" && lawsuitId == null) {
      lawsuitId = parentId;
    }

    const parentEntityType = normalizeStatus(
      source.parentEntityType ?? source.parent_entity_type,
    ).replace(/_/g, "");
    const parentEntityId = normalizeEntityId(source.parentEntityId ?? source.parent_entity_id);
    if (parentEntityType === "dossier" && dossierId == null) {
      dossierId = parentEntityId;
    }
    if (parentEntityType === "lawsuit" && lawsuitId == null) {
      lawsuitId = parentEntityId;
    }

    if (entityType === "mission") {
      const linkedType = normalizeStatus(source.entityType ?? source.entity_type).replace(/_/g, "");
      const linkedId = normalizeEntityId(source.entityId ?? source.entity_id);
      if (linkedType === "dossier" && dossierId == null) {
        dossierId = linkedId;
      }
      if (linkedType === "lawsuit" && lawsuitId == null) {
        lawsuitId = linkedId;
      }
    }

    if (entityType === "client" && clientId == null) {
      clientId = entityId;
    }
    if (entityType === "dossier" && dossierId == null) {
      dossierId = entityId;
    }
    if (entityType === "lawsuit" && lawsuitId == null) {
      lawsuitId = entityId;
    }

    return {
      clientId: clientId ?? null,
      dossierId: dossierId ?? null,
      lawsuitId: lawsuitId ?? null,
    };
  }

  private async readOperationSource(
    operation: PlanOperation,
    entityType: string,
    entityId: number | string | null,
  ): Promise<Record<string, unknown>> {
    const fromPayload = isRecord(operation.payload) ? operation.payload : {};
    const fromChanges = isRecord(operation.changes) ? operation.changes : {};
    if (operation.operation !== "update" || entityId == null) {
      return { ...fromPayload, ...fromChanges };
    }

    const serviceFileByType: Record<string, string | undefined> = {
      dossier: "dossiers.service",
      lawsuit: "lawsuits.service",
      task: "tasks.service",
      session: "sessions.service",
      mission: "missions.service",
    };
    const serviceFile = serviceFileByType[entityType];
    const service = serviceFile ? this.getService(serviceFile) : null;
    const existing = toRecord(await callService(service, "get", entityId));
    return {
      ...(existing || {}),
      ...fromPayload,
      ...fromChanges,
    };
  }

  private getService(fileName: string): EntityService | null {
    if (this.serviceCache.has(fileName)) {
      return this.serviceCache.get(fileName) ?? null;
    }
    try {
      const resolved = _path.resolve(__dirname, "..", "..", "..", "src", "services", fileName);
      const loaded = require(resolved) as EntityService;
      const service = loaded && typeof loaded === "object" ? loaded : null;
      this.serviceCache.set(fileName, service);
      return service;
    } catch {
      this.serviceCache.set(fileName, null);
      return null;
    }
  }

  private async listAll(service: EntityService | null): Promise<Record<string, unknown>[]> {
    const rows = await callService(service, "list");
    return toRecordArray(rows);
  }

  private async listByClient(
    service: EntityService | null,
    clientId: number | string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await callService(service, "listByClient", clientId);
    if (Array.isArray(rows)) return toRecordArray(rows);
    return (await this.listAll(service)).filter((row) => {
      const linkedClient = row.client_id ?? row.clientId;
      return linkedClient != null && String(linkedClient) === String(clientId);
    });
  }

  private async listByDossier(
    service: EntityService | null,
    dossierId: number | string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await callService(service, "listByDossier", dossierId);
    if (Array.isArray(rows)) return toRecordArray(rows);
    return (await this.listAll(service)).filter((row) => {
      const linkedDossier = row.dossier_id ?? row.dossierId;
      return linkedDossier != null && String(linkedDossier) === String(dossierId);
    });
  }

  private async listByDossierSet(
    service: EntityService | null,
    dossierIds: Set<string>,
  ): Promise<Record<string, unknown>[]> {
    if (dossierIds.size === 0) return [];
    const allRows = await this.listAll(service);
    return allRows.filter((row) => {
      const linkedDossier = row.dossier_id ?? row.dossierId;
      return linkedDossier != null && dossierIds.has(String(linkedDossier));
    });
  }

  private async listByLawsuit(
    service: EntityService | null,
    lawsuitId: number | string,
  ): Promise<Record<string, unknown>[]> {
    const rows = await callService(service, "listByLawsuit", lawsuitId);
    if (Array.isArray(rows)) return toRecordArray(rows);
    return (await this.listAll(service)).filter((row) => {
      const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
      return linkedLawsuit != null && String(linkedLawsuit) === String(lawsuitId);
    });
  }
}

async function callService(
  service: EntityService | null,
  method: keyof EntityService,
  ...args: unknown[]
): Promise<unknown> {
  if (!service) return null;
  const fn = service[method];
  if (typeof fn !== "function") return null;
  const callable = fn as (...invokeArgs: unknown[]) => unknown;
  return Promise.resolve(callable(...args));
}

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!isRecord(value)) return null;
  return value;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as Record<string, unknown>[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
      if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return trimmed;
  }
  return null;
}

function asLabel(row: Record<string, unknown> | null): string | undefined {
  if (!row) return undefined;
  const name = String(row.name ?? row.title ?? row.reference ?? row.lawsuit_number ?? "").trim();
  return name || undefined;
}
