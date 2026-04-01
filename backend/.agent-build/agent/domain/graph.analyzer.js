"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainGraphAnalyzer = void 0;
const rule_profile_1 = require("./rule.profile");
const status_normalizer_1 = require("./status.normalizer");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path");
class DomainGraphAnalyzer {
    rules;
    serviceCache = new Map();
    graphHandler;
    constructor(rules = new rule_profile_1.DomainRuleProfile(), graphHandler) {
        this.rules = rules;
        this.graphHandler = graphHandler || this.resolveGraphHandler();
    }
    async getClientInactiveBlockers(clientId) {
        const graph = await this.getGraph("client", clientId);
        return {
            client: toRecord(graph.root),
            dossiers: toRecordArray(graph.children?.dossiers).filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            lawsuits: toRecordArray(graph.children?.lawsuits).filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            tasks: toRecordArray(graph.children?.tasks).filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: toRecordArray(graph.children?.sessions).filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: toRecordArray(graph.children?.missions).filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
            unpaidReceivables: await this.listUnpaidReceivablesForClient(clientId),
        };
    }
    async getDossierCloseBlockers(dossierId) {
        const graph = await this.getGraph("dossier", dossierId);
        const dossier = toRecord(graph.root);
        const clientId = this.resolveClientIdForDossier(dossierId, dossier);
        return {
            dossier,
            lawsuits: toRecordArray(graph.children?.lawsuits).filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            tasks: toRecordArray(graph.children?.tasks).filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: toRecordArray(graph.children?.sessions).filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: toRecordArray(graph.children?.missions).filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
            unpaidReceivables: clientId != null ? await this.listUnpaidReceivablesForClient(clientId) : [],
        };
    }
    async getLawsuitCloseBlockers(lawsuitId) {
        const graph = await this.getGraph("lawsuit", lawsuitId);
        return {
            lawsuit: toRecord(graph.root),
            tasks: toRecordArray(graph.children?.tasks).filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: toRecordArray(graph.children?.sessions).filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: toRecordArray(graph.children?.missions).filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
        };
    }
    async analyzeOperation(operation) {
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
    async getGraph(entityType, entityId) {
        const numericId = Number(entityId);
        if (!Number.isInteger(numericId) || numericId <= 0) {
            return {};
        }
        const snapshot = await Promise.resolve(this.graphHandler({
            entityType,
            entityId: numericId,
            depth: 2,
            direction: "down",
        }, {}));
        if (!isRecord(snapshot))
            return {};
        return snapshot;
    }
    resolveGraphHandler() {
        const candidates = [
            _path.resolve(__dirname, "..", "..", "..", "src", "agent", "tools", "read", "getEntityGraph.tool"),
            _path.resolve(process.cwd(), "src", "agent", "tools", "read", "getEntityGraph.tool"),
            _path.resolve(process.cwd(), "backend", "src", "agent", "tools", "read", "getEntityGraph.tool"),
        ];
        for (const candidate of candidates) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const tool = require(candidate);
                const handler = tool?.handler || tool?.getEntityGraph;
                if (typeof handler === "function") {
                    return handler;
                }
            }
            catch {
                continue;
            }
        }
        throw new Error("getEntityGraph handler is unavailable for domain analysis.");
    }
    getService(fileName) {
        if (this.serviceCache.has(fileName)) {
            return this.serviceCache.get(fileName) ?? null;
        }
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const loaded = require(`../../../src/services/${fileName}`);
            const service = loaded && typeof loaded === "object" ? loaded : null;
            this.serviceCache.set(fileName, service);
            return service;
        }
        catch {
            this.serviceCache.set(fileName, null);
            return null;
        }
    }
    async listUnpaidReceivablesForClient(clientId) {
        const numericClientId = Number(clientId);
        if (!Number.isInteger(numericClientId) || numericClientId <= 0)
            return [];
        const financialService = this.getService("financial.service");
        const filteredRows = await callService(financialService, "listFiltered", {
            clientId: numericClientId,
            direction: "receivable",
            paymentStatus: "unpaid",
            limit: 500,
        });
        if (Array.isArray(filteredRows)) {
            return toRecordArray(filteredRows).filter((row) => {
                if (!(0, status_normalizer_1.isReceivableEntry)(row))
                    return false;
                if ((0, status_normalizer_1.isFinancialCancelled)(row.status))
                    return false;
                return !(0, status_normalizer_1.isFinancialPaid)(row);
            });
        }
        const allRows = await callService(financialService, "list");
        return toRecordArray(allRows).filter((row) => {
            const linkedClientId = row.client_id ?? row.clientId;
            if (linkedClientId == null || String(linkedClientId) !== String(numericClientId)) {
                return false;
            }
            if (!(0, status_normalizer_1.isReceivableEntry)(row))
                return false;
            if ((0, status_normalizer_1.isFinancialCancelled)(row.status))
                return false;
            return !(0, status_normalizer_1.isFinancialPaid)(row);
        });
    }
    resolveClientIdForDossier(dossierId, dossierRow) {
        const direct = normalizeEntityId(dossierRow?.client_id ?? dossierRow?.clientId);
        if (direct != null)
            return direct;
        const dossiersService = this.getService("dossiers.service");
        if (!dossiersService || typeof dossiersService.get !== "function") {
            return null;
        }
        try {
            const fetched = dossiersService.get(dossierId);
            const resolved = fetched && typeof fetched.then === "function"
                ? null
                : normalizeEntityId(fetched?.client_id ?? fetched?.clientId);
            return resolved;
        }
        catch {
            return null;
        }
    }
}
exports.DomainGraphAnalyzer = DomainGraphAnalyzer;
async function callService(service, method, ...args) {
    if (!service)
        return null;
    const fn = service[method];
    if (typeof fn !== "function")
        return null;
    const callable = fn;
    return Promise.resolve(callable(...args));
}
function toRecord(value) {
    return isRecord(value) ? value : null;
}
function toRecordArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter(isRecord);
}
function normalizeEntityId(value) {
    if (typeof value === "number" && Number.isFinite(value) && value > 0) {
        return Math.floor(value);
    }
    if (typeof value === "string") {
        const trimmed = value.trim();
        if (!trimmed)
            return null;
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
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
