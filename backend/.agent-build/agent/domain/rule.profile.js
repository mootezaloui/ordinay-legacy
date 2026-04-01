"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DomainRuleProfile = void 0;
const status_normalizer_1 = require("./status.normalizer");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const _path = require("path");
class DomainRuleProfile {
    serviceCache = new Map();
    async validateOperation(operation) {
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
            const targetStatus = (0, status_normalizer_1.canonicalizeTargetStatus)(entityType, operation.changes.status);
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
    async getClientInactiveBlockers(clientId) {
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
            return ((dossierId != null && dossierIds.has(String(dossierId))) ||
                (lawsuitId != null && lawsuitIds.has(String(lawsuitId))));
        });
        const sessions = allSessions.filter((row) => {
            const dossierId = row.dossier_id ?? row.dossierId;
            const lawsuitId = row.lawsuit_id ?? row.lawsuitId;
            return ((dossierId != null && dossierIds.has(String(dossierId))) ||
                (lawsuitId != null && lawsuitIds.has(String(lawsuitId))));
        });
        const missions = allMissions.filter((row) => {
            const dossierId = row.dossier_id ?? row.dossierId;
            const lawsuitId = row.lawsuit_id ?? row.lawsuitId;
            return ((dossierId != null && dossierIds.has(String(dossierId))) ||
                (lawsuitId != null && lawsuitIds.has(String(lawsuitId))));
        });
        const unpaidReceivables = allFinancialEntries.filter((entry) => {
            const linkedClientId = entry.client_id ?? entry.clientId;
            if (linkedClientId == null || String(linkedClientId) !== String(clientId)) {
                return false;
            }
            if (!(0, status_normalizer_1.isReceivableEntry)(entry))
                return false;
            if ((0, status_normalizer_1.isFinancialCancelled)(entry.status))
                return false;
            return !(0, status_normalizer_1.isFinancialPaid)(entry);
        });
        return {
            client,
            dossiers: dossierRows.filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            lawsuits: lawsuitRows.filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            tasks: tasks.filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: sessions.filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: missions.filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
            unpaidReceivables,
        };
    }
    async getDossierCloseBlockers(dossierId) {
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
            return ((linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
                (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit))));
        });
        const sessions = (await this.listAll(sessionsService)).filter((row) => {
            const linkedDossier = row.dossier_id ?? row.dossierId;
            const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
            return ((linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
                (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit))));
        });
        const missions = (await this.listAll(missionsService)).filter((row) => {
            const linkedDossier = row.dossier_id ?? row.dossierId;
            const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
            return ((linkedDossier != null && String(linkedDossier) === String(dossierId)) ||
                (linkedLawsuit != null && lawsuitIds.has(String(linkedLawsuit))));
        });
        const clientId = dossier?.client_id ?? dossier?.clientId;
        const financialRows = await this.listAll(financialService);
        const unpaidReceivables = financialRows.filter((entry) => {
            if (clientId == null)
                return false;
            const linkedClientId = entry.client_id ?? entry.clientId;
            if (linkedClientId == null || String(linkedClientId) !== String(clientId)) {
                return false;
            }
            if (!(0, status_normalizer_1.isReceivableEntry)(entry))
                return false;
            if ((0, status_normalizer_1.isFinancialCancelled)(entry.status))
                return false;
            return !(0, status_normalizer_1.isFinancialPaid)(entry);
        });
        return {
            dossier,
            lawsuits: lawsuitRows.filter((row) => !(0, status_normalizer_1.isClosedLike)(row.status)),
            tasks: tasks.filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: sessions.filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: missions.filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
            unpaidReceivables,
        };
    }
    async getLawsuitCloseBlockers(lawsuitId) {
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
            tasks: tasks.filter((row) => !(0, status_normalizer_1.isTaskTerminal)(row.status)),
            sessions: sessions.filter((row) => !(0, status_normalizer_1.isSessionTerminal)(row.status)),
            missions: missions.filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status)),
        };
    }
    async validateClientInactive(clientId) {
        const blockers = await this.getClientInactiveBlockers(clientId);
        const blockerCounts = {
            open_dossiers: blockers.dossiers.length,
            open_lawsuits: blockers.lawsuits.length,
            open_tasks: blockers.tasks.length,
            open_sessions: blockers.sessions.length,
            active_missions: blockers.missions.length,
            unpaid_receivables: blockers.unpaidReceivables.length,
        };
        const notes = [];
        if (blockerCounts.open_dossiers > 0)
            notes.push(`Client has ${blockerCounts.open_dossiers} open dossiers.`);
        if (blockerCounts.open_lawsuits > 0)
            notes.push(`Client has ${blockerCounts.open_lawsuits} open lawsuits.`);
        if (blockerCounts.open_tasks > 0)
            notes.push(`Client has ${blockerCounts.open_tasks} non-terminal tasks.`);
        if (blockerCounts.open_sessions > 0)
            notes.push(`Client has ${blockerCounts.open_sessions} non-terminal sessions.`);
        if (blockerCounts.active_missions > 0)
            notes.push(`Client has ${blockerCounts.active_missions} active missions.`);
        if (blockerCounts.unpaid_receivables > 0)
            notes.push(`Client has ${blockerCounts.unpaid_receivables} unpaid receivable entries.`);
        return {
            allowed: notes.length === 0,
            blockerCounts,
            notes,
            rootEntityLabel: asLabel(blockers.client),
        };
    }
    async validateDossierClosed(dossierId) {
        const blockers = await this.getDossierCloseBlockers(dossierId);
        const blockerCounts = {
            open_lawsuits: blockers.lawsuits.length,
            open_tasks: blockers.tasks.length,
            open_sessions: blockers.sessions.length,
            active_missions: blockers.missions.length,
            unpaid_receivables: blockers.unpaidReceivables.length,
        };
        const notes = [];
        if (blockerCounts.open_lawsuits > 0)
            notes.push(`Dossier has ${blockerCounts.open_lawsuits} open lawsuits.`);
        if (blockerCounts.open_tasks > 0)
            notes.push(`Dossier has ${blockerCounts.open_tasks} non-terminal tasks.`);
        if (blockerCounts.open_sessions > 0)
            notes.push(`Dossier has ${blockerCounts.open_sessions} non-terminal sessions.`);
        if (blockerCounts.active_missions > 0)
            notes.push(`Dossier has ${blockerCounts.active_missions} active missions.`);
        if (blockerCounts.unpaid_receivables > 0)
            notes.push(`Client linked to dossier has ${blockerCounts.unpaid_receivables} unpaid receivable entries.`);
        return {
            allowed: notes.length === 0,
            blockerCounts,
            notes,
            rootEntityLabel: asLabel(blockers.dossier),
        };
    }
    async validateLawsuitClosed(lawsuitId) {
        const blockers = await this.getLawsuitCloseBlockers(lawsuitId);
        const blockerCounts = {
            open_tasks: blockers.tasks.length,
            open_sessions: blockers.sessions.length,
            active_missions: blockers.missions.length,
        };
        const notes = [];
        if (blockerCounts.open_tasks > 0)
            notes.push(`Lawsuit has ${blockerCounts.open_tasks} non-terminal tasks.`);
        if (blockerCounts.open_sessions > 0)
            notes.push(`Lawsuit has ${blockerCounts.open_sessions} non-terminal sessions.`);
        if (blockerCounts.active_missions > 0)
            notes.push(`Lawsuit has ${blockerCounts.active_missions} active missions.`);
        return {
            allowed: notes.length === 0,
            blockerCounts,
            notes,
            rootEntityLabel: asLabel(blockers.lawsuit),
        };
    }
    async validateOfficerInactive(officerId) {
        const missionsService = this.getService("missions.service");
        const officersService = this.getService("officers.service");
        const officer = toRecord(await callService(officersService, "get", officerId));
        const missions = (await this.listAll(missionsService)).filter((row) => {
            const linkedOfficer = row.officer_id ?? row.officerId;
            return linkedOfficer != null && String(linkedOfficer) === String(officerId);
        });
        const activeMissions = missions.filter((row) => !(0, status_normalizer_1.isMissionTerminal)(row.status));
        const notes = activeMissions.length > 0
            ? [`Officer has ${activeMissions.length} active missions.`]
            : [];
        return {
            allowed: notes.length === 0,
            blockerCounts: { active_missions: activeMissions.length },
            notes,
            rootEntityLabel: asLabel(officer),
        };
    }
    async validateClientDelete(clientId) {
        const dossiers = await this.listByClient(this.getService("dossiers.service"), clientId);
        const notes = dossiers.length > 0 ? [`Client has ${dossiers.length} linked dossiers.`] : [];
        return { allowed: notes.length === 0, blockerCounts: { linked_dossiers: dossiers.length }, notes };
    }
    async validateDossierDelete(dossierId) {
        const lawsuits = await this.listByDossier(this.getService("lawsuits.service"), dossierId);
        const tasks = await this.listByDossier(this.getService("tasks.service"), dossierId);
        const sessions = await this.listByDossier(this.getService("sessions.service"), dossierId);
        const missions = await this.listByDossier(this.getService("missions.service"), dossierId);
        const total = lawsuits.length + tasks.length + sessions.length + missions.length;
        const notes = [];
        if (lawsuits.length > 0)
            notes.push(`Dossier has ${lawsuits.length} linked lawsuits.`);
        if (tasks.length > 0)
            notes.push(`Dossier has ${tasks.length} linked tasks.`);
        if (sessions.length > 0)
            notes.push(`Dossier has ${sessions.length} linked sessions.`);
        if (missions.length > 0)
            notes.push(`Dossier has ${missions.length} linked missions.`);
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
    async validateLawsuitDelete(lawsuitId) {
        const tasks = await this.listByLawsuit(this.getService("tasks.service"), lawsuitId);
        const sessions = await this.listByLawsuit(this.getService("sessions.service"), lawsuitId);
        const missions = await this.listByLawsuit(this.getService("missions.service"), lawsuitId);
        const total = tasks.length + sessions.length + missions.length;
        const notes = [];
        if (tasks.length > 0)
            notes.push(`Lawsuit has ${tasks.length} linked tasks.`);
        if (sessions.length > 0)
            notes.push(`Lawsuit has ${sessions.length} linked sessions.`);
        if (missions.length > 0)
            notes.push(`Lawsuit has ${missions.length} linked missions.`);
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
    async validateAncestorConstraint(operation, op, entityType, entityId) {
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
        const blockerCounts = {};
        const notes = [];
        if (client && (0, status_normalizer_1.isInactiveLike)(client.status)) {
            blockerCounts.inactive_client_ancestor = 1;
            notes.push("Linked parent client is inactive.");
        }
        if (entityType !== "dossier" && dossier && (0, status_normalizer_1.isClosedLike)(dossier.status)) {
            blockerCounts.closed_dossier_ancestor = 1;
            notes.push("Linked parent dossier is closed.");
        }
        if (entityType !== "lawsuit" && lawsuit && (0, status_normalizer_1.isClosedLike)(lawsuit.status)) {
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
    async resolveOperationRefs(operation, entityType, entityId) {
        const source = await this.readOperationSource(operation, entityType, entityId);
        let clientId = normalizeEntityId(source.client_id ?? source.clientId);
        let dossierId = normalizeEntityId(source.dossier_id ?? source.dossierId);
        let lawsuitId = normalizeEntityId(source.lawsuit_id ?? source.lawsuitId);
        const parentType = (0, status_normalizer_1.normalizeStatus)(source.parentType ?? source.parent_type).replace(/_/g, "");
        const parentId = normalizeEntityId(source.parentId ?? source.parent_id);
        if (parentType === "dossier" && dossierId == null) {
            dossierId = parentId;
        }
        if (parentType === "lawsuit" && lawsuitId == null) {
            lawsuitId = parentId;
        }
        const parentEntityType = (0, status_normalizer_1.normalizeStatus)(source.parentEntityType ?? source.parent_entity_type).replace(/_/g, "");
        const parentEntityId = normalizeEntityId(source.parentEntityId ?? source.parent_entity_id);
        if (parentEntityType === "dossier" && dossierId == null) {
            dossierId = parentEntityId;
        }
        if (parentEntityType === "lawsuit" && lawsuitId == null) {
            lawsuitId = parentEntityId;
        }
        if (entityType === "mission") {
            const linkedType = (0, status_normalizer_1.normalizeStatus)(source.entityType ?? source.entity_type).replace(/_/g, "");
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
    async readOperationSource(operation, entityType, entityId) {
        const fromPayload = isRecord(operation.payload) ? operation.payload : {};
        const fromChanges = isRecord(operation.changes) ? operation.changes : {};
        if (operation.operation !== "update" || entityId == null) {
            return { ...fromPayload, ...fromChanges };
        }
        const serviceFileByType = {
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
    getService(fileName) {
        if (this.serviceCache.has(fileName)) {
            return this.serviceCache.get(fileName) ?? null;
        }
        try {
            const resolved = _path.resolve(__dirname, "..", "..", "..", "src", "services", fileName);
            const loaded = require(resolved);
            const service = loaded && typeof loaded === "object" ? loaded : null;
            this.serviceCache.set(fileName, service);
            return service;
        }
        catch {
            this.serviceCache.set(fileName, null);
            return null;
        }
    }
    async listAll(service) {
        const rows = await callService(service, "list");
        return toRecordArray(rows);
    }
    async listByClient(service, clientId) {
        const rows = await callService(service, "listByClient", clientId);
        if (Array.isArray(rows))
            return toRecordArray(rows);
        return (await this.listAll(service)).filter((row) => {
            const linkedClient = row.client_id ?? row.clientId;
            return linkedClient != null && String(linkedClient) === String(clientId);
        });
    }
    async listByDossier(service, dossierId) {
        const rows = await callService(service, "listByDossier", dossierId);
        if (Array.isArray(rows))
            return toRecordArray(rows);
        return (await this.listAll(service)).filter((row) => {
            const linkedDossier = row.dossier_id ?? row.dossierId;
            return linkedDossier != null && String(linkedDossier) === String(dossierId);
        });
    }
    async listByDossierSet(service, dossierIds) {
        if (dossierIds.size === 0)
            return [];
        const allRows = await this.listAll(service);
        return allRows.filter((row) => {
            const linkedDossier = row.dossier_id ?? row.dossierId;
            return linkedDossier != null && dossierIds.has(String(linkedDossier));
        });
    }
    async listByLawsuit(service, lawsuitId) {
        const rows = await callService(service, "listByLawsuit", lawsuitId);
        if (Array.isArray(rows))
            return toRecordArray(rows);
        return (await this.listAll(service)).filter((row) => {
            const linkedLawsuit = row.lawsuit_id ?? row.lawsuitId;
            return linkedLawsuit != null && String(linkedLawsuit) === String(lawsuitId);
        });
    }
}
exports.DomainRuleProfile = DomainRuleProfile;
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
    if (!isRecord(value))
        return null;
    return value;
}
function toRecordArray(value) {
    if (!Array.isArray(value))
        return [];
    return value.filter(isRecord);
}
function isRecord(value) {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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
            if (Number.isFinite(parsed) && parsed > 0)
                return parsed;
        }
        return trimmed;
    }
    return null;
}
function asLabel(row) {
    if (!row)
        return undefined;
    const name = String(row.name ?? row.title ?? row.reference ?? row.lawsuit_number ?? "").trim();
    return name || undefined;
}
