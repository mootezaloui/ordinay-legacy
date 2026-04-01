import type { PlanOperation } from "../types";
import type {
  ClientInactiveBlockers,
  DossierCloseBlockers,
  LawsuitCloseBlockers,
} from "./rule.profile";
import { DomainRuleProfile } from "./rule.profile";
import {
  isClosedLike,
  isFinancialCancelled,
  isFinancialPaid,
  isMissionTerminal,
  isReceivableEntry,
  isSessionTerminal,
  isTaskTerminal,
} from "./status.normalizer";

declare const require: (id: string) => unknown;
declare const __dirname: string;

// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path") as { resolve: (...args: string[]) => string };

interface EntityService {
  list?: () => unknown[] | Promise<unknown[]>;
  listFiltered?: (filters: Record<string, unknown>) => unknown[] | Promise<unknown[]>;
  get?: (id: number | string) => unknown | Promise<unknown>;
}

type GraphRootType = "client" | "dossier" | "lawsuit";

interface GraphNode {
  id?: number | string;
  status?: unknown;
  [key: string]: unknown;
}

interface GraphSnapshot {
  root?: GraphNode;
  children?: {
    dossiers?: GraphNode[];
    lawsuits?: GraphNode[];
    tasks?: GraphNode[];
    sessions?: GraphNode[];
    missions?: GraphNode[];
  };
}

type GraphHandler = (
  args: Record<string, unknown>,
  executionContext?: Record<string, unknown>,
) => unknown | Promise<unknown>;

export class DomainGraphAnalyzer {
  private readonly serviceCache = new Map<string, EntityService | null>();
  private readonly graphHandler: GraphHandler;

  constructor(
    private readonly rules: DomainRuleProfile = new DomainRuleProfile(),
    graphHandler?: GraphHandler,
  ) {
    this.graphHandler = graphHandler || this.resolveGraphHandler();
  }

  async getClientInactiveBlockers(clientId: number | string): Promise<ClientInactiveBlockers> {
    const graph = await this.getGraph("client", clientId);
    return {
      client: toRecord(graph.root),
      dossiers: toRecordArray(graph.children?.dossiers).filter((row) => !isClosedLike(row.status)),
      lawsuits: toRecordArray(graph.children?.lawsuits).filter((row) => !isClosedLike(row.status)),
      tasks: toRecordArray(graph.children?.tasks).filter((row) => !isTaskTerminal(row.status)),
      sessions: toRecordArray(graph.children?.sessions).filter((row) => !isSessionTerminal(row.status)),
      missions: toRecordArray(graph.children?.missions).filter((row) => !isMissionTerminal(row.status)),
      unpaidReceivables: await this.listUnpaidReceivablesForClient(clientId),
    };
  }

  async getDossierCloseBlockers(dossierId: number | string): Promise<DossierCloseBlockers> {
    const graph = await this.getGraph("dossier", dossierId);
    const dossier = toRecord(graph.root);
    const clientId = this.resolveClientIdForDossier(dossierId, dossier);
    return {
      dossier,
      lawsuits: toRecordArray(graph.children?.lawsuits).filter((row) => !isClosedLike(row.status)),
      tasks: toRecordArray(graph.children?.tasks).filter((row) => !isTaskTerminal(row.status)),
      sessions: toRecordArray(graph.children?.sessions).filter((row) => !isSessionTerminal(row.status)),
      missions: toRecordArray(graph.children?.missions).filter((row) => !isMissionTerminal(row.status)),
      unpaidReceivables:
        clientId != null ? await this.listUnpaidReceivablesForClient(clientId) : [],
    };
  }

  async getLawsuitCloseBlockers(lawsuitId: number | string): Promise<LawsuitCloseBlockers> {
    const graph = await this.getGraph("lawsuit", lawsuitId);
    return {
      lawsuit: toRecord(graph.root),
      tasks: toRecordArray(graph.children?.tasks).filter((row) => !isTaskTerminal(row.status)),
      sessions: toRecordArray(graph.children?.sessions).filter((row) => !isSessionTerminal(row.status)),
      missions: toRecordArray(graph.children?.missions).filter((row) => !isMissionTerminal(row.status)),
    };
  }

  async analyzeOperation(operation: PlanOperation): Promise<Record<string, number>> {
    const op = String(operation.operation || "").trim().toLowerCase();
    const entityType = String(operation.entityType || "").trim().toLowerCase();
    if (op !== "update" || !isRecord(operation.changes)) {
      const validation = await this.rules.validateOperation(operation);
      return { ...validation.blockerCounts };
    }

    const entityId = normalizeEntityId(operation.entityId);
    if (entityId == null) {
      const validation = await this.rules.validateOperation(operation);
      return { ...validation.blockerCounts };
    }

    const targetStatus = operation.changes.status;
    if (entityType === "client" && String(targetStatus || "").toLowerCase().includes("inactive")) {
      const blockers = await this.getClientInactiveBlockers(entityId);
      return {
        open_dossiers: blockers.dossiers.length,
        open_lawsuits: blockers.lawsuits.length,
        open_tasks: blockers.tasks.length,
        open_sessions: blockers.sessions.length,
        active_missions: blockers.missions.length,
        unpaid_receivables: blockers.unpaidReceivables.length,
      };
    }
    if (entityType === "dossier" && String(targetStatus || "").toLowerCase().includes("closed")) {
      const blockers = await this.getDossierCloseBlockers(entityId);
      return {
        open_lawsuits: blockers.lawsuits.length,
        open_tasks: blockers.tasks.length,
        open_sessions: blockers.sessions.length,
        active_missions: blockers.missions.length,
        unpaid_receivables: blockers.unpaidReceivables.length,
      };
    }
    if (entityType === "lawsuit" && String(targetStatus || "").toLowerCase().includes("closed")) {
      const blockers = await this.getLawsuitCloseBlockers(entityId);
      return {
        open_tasks: blockers.tasks.length,
        open_sessions: blockers.sessions.length,
        active_missions: blockers.missions.length,
      };
    }

    const validation = await this.rules.validateOperation(operation);
    return { ...validation.blockerCounts };
  }

  private async getGraph(entityType: GraphRootType, entityId: number | string): Promise<GraphSnapshot> {
    const numericId = Number(entityId);
    if (!Number.isInteger(numericId) || numericId <= 0) {
      return {};
    }
    const snapshot = await Promise.resolve(
      this.graphHandler(
        {
          entityType,
          entityId: numericId,
          depth: 2,
          direction: "down",
        },
        {},
      ),
    );
    if (!isRecord(snapshot)) return {};
    return snapshot as GraphSnapshot;
  }

  private resolveGraphHandler(): GraphHandler {
    const candidates = [
      _path.resolve(__dirname, "..", "..", "..", "src", "agent", "tools", "read", "getEntityGraph.tool"),
      _path.resolve(process.cwd(), "src", "agent", "tools", "read", "getEntityGraph.tool"),
      _path.resolve(process.cwd(), "backend", "src", "agent", "tools", "read", "getEntityGraph.tool"),
    ];
    for (const candidate of candidates) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const tool = require(candidate) as {
          handler?: GraphHandler;
          getEntityGraph?: GraphHandler;
        };
        const handler = tool?.handler || tool?.getEntityGraph;
        if (typeof handler === "function") {
          return handler;
        }
      } catch {
        continue;
      }
    }
    throw new Error("getEntityGraph handler is unavailable for domain analysis.");
  }

  private getService(fileName: string): EntityService | null {
    if (this.serviceCache.has(fileName)) {
      return this.serviceCache.get(fileName) ?? null;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const loaded = require(`../../../src/services/${fileName}`) as EntityService;
      const service = loaded && typeof loaded === "object" ? loaded : null;
      this.serviceCache.set(fileName, service);
      return service;
    } catch {
      this.serviceCache.set(fileName, null);
      return null;
    }
  }

  private async listUnpaidReceivablesForClient(clientId: number | string): Promise<Record<string, unknown>[]> {
    const numericClientId = Number(clientId);
    if (!Number.isInteger(numericClientId) || numericClientId <= 0) return [];

    const financialService = this.getService("financial.service");
    const filteredRows = await callService(financialService, "listFiltered", {
      clientId: numericClientId,
      direction: "receivable",
      paymentStatus: "unpaid",
      limit: 500,
    });

    if (Array.isArray(filteredRows)) {
      return toRecordArray(filteredRows).filter((row) => {
        if (!isReceivableEntry(row)) return false;
        if (isFinancialCancelled(row.status)) return false;
        return !isFinancialPaid(row);
      });
    }

    const allRows = await callService(financialService, "list");
    return toRecordArray(allRows).filter((row) => {
      const linkedClientId = row.client_id ?? row.clientId;
      if (linkedClientId == null || String(linkedClientId) !== String(numericClientId)) {
        return false;
      }
      if (!isReceivableEntry(row)) return false;
      if (isFinancialCancelled(row.status)) return false;
      return !isFinancialPaid(row);
    });
  }

  private resolveClientIdForDossier(
    dossierId: number | string,
    dossierRow: Record<string, unknown> | null,
  ): number | string | null {
    const direct = normalizeEntityId(dossierRow?.client_id ?? dossierRow?.clientId);
    if (direct != null) return direct;
    const dossiersService = this.getService("dossiers.service");
    if (!dossiersService || typeof dossiersService.get !== "function") {
      return null;
    }
    try {
      const fetched = dossiersService.get(dossierId);
      const resolved =
        fetched && typeof (fetched as Promise<unknown>).then === "function"
          ? null
          : normalizeEntityId((fetched as Record<string, unknown>)?.client_id ?? (fetched as Record<string, unknown>)?.clientId);
      return resolved;
    } catch {
      return null;
    }
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
  return isRecord(value) ? value : null;
}

function toRecordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isRecord) as Record<string, unknown>[];
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
