import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { logHistoryEvent, EVENT_TYPES, deleteEntityHistory } from "../services/historyService";
import { canPerformAction } from "../services/domainRules";
import { useToast } from "./ToastContext";
import { logEntityCreation, logLifecycleChange, logStatusChange } from "../services/historyService";
import { apiClient } from "../services/api/client";
import { adaptHistory } from "../services/api/adapters";
import { useTranslation } from "react-i18next";
import { useOperator } from "./OperatorContext";
import {
  adaptCase,
  adaptClient,
  adaptDossier,
  adaptSession,
  adaptTask,
  adaptOfficer,
  adaptFinancialEntry,
  adaptMission,
  adaptPersonalTask,
} from "../services/api/adapters";

const DataContext = createContext(null);
const STORAGE_PREFIX = "lawyer-app:data:";

/**
 * Convert notes array from frontend format (camelCase) to backend format (snake_case)
 * This ensures the backend can properly identify existing notes by their IDs
 */
const notesToBackendFormat = (notes) => {
  if (!notes || !Array.isArray(notes)) return notes;

  return notes.map(note => ({
    id: note.id,
    content: note.content,
    created_at: note.createdAt || note.created_at,
    updated_at: note.updatedAt || note.updated_at,
    created_by: note.createdBy || note.created_by,
    entity_type: note.entityType || note.entity_type,
    entity_id: note.entityId || note.entity_id,
  }));
};

const loadFromStorage = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    const parsed = stored ? JSON.parse(stored) : fallback;

    // Debug logging for dossiers to check if notes are loaded
    if (key === "dossiers" && parsed.length > 0) {
      console.log('[DataContext.loadFromStorage] Loading dossiers from localStorage:',
        parsed.map(d => ({ id: d.id, title: d.title, notes: d.notes, notesCount: d.notes?.length }))
      );
    }

    return parsed;
  } catch (error) {
    console.warn(`[DataContext] Failed to load ${key} from storage`, error);
    return fallback;
  }
};

const saveToStorage = (key, value) => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, JSON.stringify(value));
  } catch (error) {
    console.warn(`[DataContext] Failed to persist ${key} to storage`, error);
  }
};

// Removed rebuild functions - no longer needed as state is backend-driven

const logUpdateHistory = (entityType, prevEntity, updates, actor = null) => {
  if (!prevEntity) return;

  const changedFields = Object.entries(updates || {}).reduce((acc, [key, value]) => {
    const oldVal = prevEntity[key];
    if (oldVal === value) return acc;
    acc[key] = `${oldVal ?? ""} -> ${value ?? ""}`;
    return acc;
  }, {});

  if (Object.keys(changedFields).length === 0) return;

  logHistoryEvent({
    entityType,
    entityId: prevEntity.id,
    eventType: EVENT_TYPES.SYSTEM,
    label: "Update",
    metadata: changedFields,
    actor,
  });
};

const logStatusHistory = (entityType, prevEntity, updates, actor = null) => {
  if (!prevEntity) return;
  if (!Object.prototype.hasOwnProperty.call(updates, "status")) return;
  const oldStatus = prevEntity.status;
  const newStatus = updates.status;
  if (oldStatus === newStatus) return;
  logStatusChange(entityType, prevEntity.id, oldStatus, newStatus, null, actor);
};

const logCreationHistory = (entityType, entity, actor = null) => {
  if (!entity?.id) return;
  const name = entity.name || entity.title || entity.caseNumber || entity.description || `#${entity.id}`;
  logEntityCreation(entityType, entity.id, name, actor);
};

const logDeletionHistory = (entityType, entity, actor = null) => {
  if (!entity?.id) return;
  logLifecycleChange(entityType, entity.id, "deleted", null, actor);
  logHistoryEvent({
    entityType,
    entityId: entity.id,
    eventType: EVENT_TYPES.LIFECYCLE,
    label: "Deletion",
    metadata: { deleted: { id: entity.id } },
    actor,
  });
};

const toTimelineEntries = (historyItems = []) =>
  historyItems.map((item) => item.timelineEntry || {
    type: item.action || "action",
    event: item.description || item.action || "Event",
    date: item.createdAt || item.created_at || "",
  });

const recordHistoryEvent = async (apiClientInstance, { entityType, entityId, action, description, changedFields, actor }) => {
  try {
    const created = await apiClientInstance.post("/history", {
      entity_type: entityType,
      entity_id: entityId,
      action,
      description,
      changed_fields: changedFields,
      actor,
    });
    const adapted = adaptHistory(created);
    return adapted.timelineEntry;
  } catch (err) {
    console.warn("[DataContext] Failed to record history event", err);
    return null;
  }
};

const validateMutation = (entityType, action, entityId, context = {}, integrityIssues = [], skipConfirmation = false) => {
  const relatedIssues = integrityIssues.filter(
    (issue) => issue.entityType === entityType && issue.entityId === entityId
  );

  if (relatedIssues.length > 0) {
    return {
      ok: false,
      result: {
        allowed: false,
        blockers: relatedIssues.map((i) => i.message),
        warnings: [],
      },
    };
  }

  const result = canPerformAction(entityType, entityId, action, {
    ...context,
    entities: context.entities || {},
  });

  // If skipConfirmation is true, allow actions that require confirmation
  if (!result.allowed || (result.requiresConfirmation && !skipConfirmation)) {
    console.warn(`[DataContext] ${entityType}.${action} blocked`, result);
    return { ok: false, result };
  }
  return { ok: true, result };
};

const normalizeId = (value) => {
  if (typeof value === "string") {
    const parsed = parseInt(value, 10);
    return Number.isNaN(parsed) ? value : parsed;
  }
  return value;
};

const reconcileEntities = (clients, dossiers, cases, tasks, sessions) => {
  const issues = [];

  const byId = (arr) => new Map(arr.map((item) => [item.id, item]));

  const clientsById = byId(clients);
  const dossiersById = byId(dossiers);
  const casesById = byId(cases);

  const normalizedClients = clients.map((c) => ({
    ...c,
    id: normalizeId(c.id),
  }));

  const normalizedDossiers = dossiers.map((d) => {
    const normalized = { ...d, id: normalizeId(d.id), clientId: normalizeId(d.clientId) };
    if (normalized.clientId && !clientsById.has(normalized.clientId)) {
      issues.push({
        entityType: "dossier",
        entityId: normalized.id,
        message: "Dossier with no parent client in persisted data.",
      });
    }
    return normalized;
  });

  const normalizedCases = cases.map((c) => {
    const normalized = {
      ...c,
      id: normalizeId(c.id),
      dossierId: normalizeId(c.dossierId),
    };
    if (normalized.dossierId && !dossiersById.has(normalized.dossierId)) {
      issues.push({
        entityType: "case",
        entityId: normalized.id,
        message: "Lawsuit with no parent dossier in persisted data.",
      });
    }
    return normalized;
  });

  const normalizedTasks = tasks.map((t) => {
    const normalized = {
      ...t,
      id: normalizeId(t.id),
      dossierId: normalizeId(t.dossierId),
      caseId: normalizeId(t.caseId),
    };
    if (normalized.parentType === "case" && normalized.caseId && !casesById.has(normalized.caseId)) {
      issues.push({
        entityType: "task",
        entityId: normalized.id,
        message: "Task linked to a missing lawsuit (persisted data).",
      });
    }
    if (normalized.parentType === "dossier" && normalized.dossierId && !dossiersById.has(normalized.dossierId)) {
      issues.push({
        entityType: "task",
        entityId: normalized.id,
        message: "Task linked to a missing dossier (persisted data).",
      });
    }
    return normalized;
  });

  const normalizedSessions = sessions.map((s) => {
    const normalized = {
      ...s,
      id: normalizeId(s.id),
      dossierId: normalizeId(s.dossierId),
      caseId: normalizeId(s.caseId),
    };
    if (normalized.caseId && !casesById.has(normalized.caseId)) {
      issues.push({
        entityType: "session",
        entityId: normalized.id,
        message: "Hearing linked to a missing lawsuit (persisted data).",
      });
    }
    if (normalized.dossierId && !dossiersById.has(normalized.dossierId)) {
      issues.push({
        entityType: "session",
        entityId: normalized.id,
        message: "Hearing linked to a missing dossier (persisted data).",
      });
    }
    return normalized;
  });

  return {
    normalizedClients,
    normalizedDossiers,
    normalizedCases,
    normalizedTasks,
    normalizedSessions,
    issues,
  };
};

export function DataProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useTranslation("common");
  const { operator } = useOperator();

  // Get operator name for history attribution
  const actorName = operator?.name || null;

  // State is initialized from localStorage and then updated from backend
  const [clients, setClients] = useState(() => loadFromStorage("clients", []));
  const [dossiers, setDossiers] = useState(() => loadFromStorage("dossiers", []));
  const [cases, setCases] = useState(() => loadFromStorage("cases", []));
  const [sessions, setSessions] = useState(() => loadFromStorage("sessions", []));
  const [tasks, setTasks] = useState(() => loadFromStorage("tasks", []));
  const [missions, setMissions] = useState(() => loadFromStorage("missions", []));
  const [personalTasks, setPersonalTasks] = useState(() => loadFromStorage("personalTasks", []));
  const [officers, setOfficers] = useState(() => loadFromStorage("officers", []));
  const [financialEntries, setFinancialEntries] = useState(() => loadFromStorage("financial", []));
  const [integrityIssues, setIntegrityIssues] = useState([]);
  const [reconciled, setReconciled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);

  // Read-only fetch from backend (clients -> dossiers -> cases -> tasks -> sessions -> officers -> missions -> financial)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const apiClients = await apiClient.get("/clients");
        const clientsAdapted = apiClients.map(adaptClient);
        const clientsById = Object.fromEntries(clientsAdapted.map((c) => [c.id, c]));

        const apiDossiers = await apiClient.get("/dossiers");
        const dossiersAdapted = apiDossiers.map((d) => adaptDossier(d, clientsById));
        const dossiersById = Object.fromEntries(dossiersAdapted.map((d) => [d.id, d]));

        const apiCases = await apiClient.get("/cases");
        const casesAdapted = apiCases.map((c) => adaptCase(c, dossiersById));
        const casesById = Object.fromEntries(casesAdapted.map((c) => [c.id, c]));

        const apiTasks = await apiClient.get("/tasks");
        const tasksAdapted = apiTasks.map((t) => adaptTask(t, dossiersById, casesById));

        const apiSessions = await apiClient.get("/sessions");
        const sessionsAdapted = apiSessions.map((s) => adaptSession(s, dossiersById, casesById));

        const apiOfficers = await apiClient.get("/officers");
        const officersAdapted = apiOfficers.map(adaptOfficer);
        const officersById = Object.fromEntries(officersAdapted.map((o) => [o.id, o]));

        const apiMissions = await apiClient.get("/missions");
        const missionsAdapted = apiMissions.map((m) => adaptMission(m, dossiersById, casesById));
        const missionsWithOfficer = missionsAdapted.map((mission) => ({
          ...mission,
          officerName: mission.officerId ? officersById[mission.officerId]?.name || "" : "",
        }));

        const apiPersonalTasks = await apiClient.get("/personal-tasks");
        const personalTasksAdapted = apiPersonalTasks.map(adaptPersonalTask);

        const missionsByOfficer = {};
        const missionsByDossier = {};
        const missionsByCase = {};

        missionsWithOfficer.forEach((mission) => {
          if (mission.officerId) {
            missionsByOfficer[mission.officerId] = missionsByOfficer[mission.officerId] || [];
            missionsByOfficer[mission.officerId].push(mission);
          }
          if (mission.entityType === "dossier" && mission.entityId) {
            missionsByDossier[mission.entityId] = missionsByDossier[mission.entityId] || [];
            missionsByDossier[mission.entityId].push(mission);
          }
          if (mission.entityType === "case" && mission.entityId) {
            missionsByCase[mission.entityId] = missionsByCase[mission.entityId] || [];
            missionsByCase[mission.entityId].push(mission);
          }
        });

        const officersWithMissions = officersAdapted.map((officer) => ({
          ...officer,
          missions: missionsByOfficer[officer.id] || [],
        }));

        const apiFinancial = await apiClient.get("/financial");
        const financialAdapted = apiFinancial.map((f) =>
          adaptFinancialEntry(f, clientsById, dossiersById, casesById)
        );

        const apiHistoryClients = await apiClient.get("/history?entity_type=client");
        const historyClientsAdapted = apiHistoryClients.map(adaptHistory);
        const historyByClient = historyClientsAdapted.reduce((acc, evt) => {
          if (!acc[evt.entityId]) acc[evt.entityId] = [];
          acc[evt.entityId].push(evt.timelineEntry);
          return acc;
        }, {});

        const {
          normalizedClients,
          normalizedDossiers,
          normalizedCases,
          normalizedTasks,
          normalizedSessions,
          issues,
        } = reconcileEntities(
          clientsAdapted,
          dossiersAdapted,
          casesAdapted,
          tasksAdapted,
          sessionsAdapted
        );

        const clientsWithTimeline = normalizedClients.map((client) => ({
          ...client,
          timeline: historyByClient[client.id] || [],
        }));

        const dossiersWithMissions = normalizedDossiers.map((dossier) => ({
          ...dossier,
          missions: missionsByDossier[dossier.id] || dossier.missions || [],
        }));

        const casesWithMissions = normalizedCases.map((caseItem) => ({
          ...caseItem,
          missions: missionsByCase[caseItem.id] || caseItem.missions || [],
        }));

        if (cancelled) return;

        console.log('[DataContext] Before saving to localStorage, dossiersWithMissions:',
          dossiersWithMissions.map(d => ({ id: d.id, title: d.title, notes: d.notes }))
        );

        setClients(clientsWithTimeline);
        setDossiers(dossiersWithMissions);
        setCases(casesWithMissions);
        setTasks(normalizedTasks);
        setSessions(normalizedSessions);
        setPersonalTasks(personalTasksAdapted);
        setMissions(missionsWithOfficer);
        setOfficers(officersWithMissions);
        setFinancialEntries(financialAdapted);
        saveToStorage("clients", clientsWithTimeline);
        saveToStorage("dossiers", dossiersWithMissions);
        saveToStorage("cases", casesWithMissions);
        saveToStorage("tasks", normalizedTasks);
        saveToStorage("sessions", normalizedSessions);
        saveToStorage("personalTasks", personalTasksAdapted);
        saveToStorage("missions", missionsWithOfficer);
        saveToStorage("officers", officersWithMissions);
        saveToStorage("financial", financialAdapted);
        setIntegrityIssues(issues);
        setReconciled(true);
      } catch (error) {
        if (cancelled) return;
        console.error("[DataContext] API load failed", error);
        setLoadError(error.message || "Loading Error");
        showToast(t("data.toast.error.loadRemote"), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [showToast]);

  // --- Clients ---
  const addClient = async (client) => {
    const validation = validateMutation("client", "add", client?.id, {
      data: client,
      newData: client,
      entities: { clients, dossiers, cases, tasks, sessions, missions, personalTasks, officers, financialEntries },
    }, integrityIssues);
    if (!validation.ok) return validation;

    const payload = {
      name: client.name,
      email: client.email,
      phone: client.phone,
      alternate_phone: client.alternatePhone,
      address: client.address,
      status: client.status === "Active" ? "active" : client.status === "inActive" ? "inActive" : client.status,
      cin: client.cin,
      date_of_birth: client.dateOfBirth,
      profession: client.profession,
      company: client.company,
      tax_id: client.taxId,
      notes: client.notes,
      join_date: client.joinDate,
    };

    const created = await apiClient.post("/clients", payload);
    const adapted = adaptClient(created);
    // Note: History is logged by the calling screen (Clients.jsx, QuickActions.jsx)
    const adaptedWithTimeline = {
      ...adapted,
      timeline: [],
    };

    setClients((prev) => {
      const next = [...prev, adaptedWithTimeline];
      saveToStorage("clients", next);
      return next;
    });

    logCreationHistory("client", created, actorName);
    return { ok: true, result: validation.result, created: adaptedWithTimeline };
  };

  const updateClient = async (id, updates) => {
    const prev = clients.find((c) => c.id === id);
    const validation = validateMutation("client", "edit", id, { data: prev, newData: { ...prev, ...updates }, entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries } }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateClient] Updating client ID:', id, 'with:', updates);

    const payload = {
      name: updates.name,
      email: updates.email,
      phone: updates.phone,
      alternate_phone: updates.alternatePhone,
      address: updates.address,
      status: updates.status === "Active" ? "active" : updates.status === "Inactive" || updates.status === "inActive" ? "inActive" : updates.status,
      cin: updates.cin,
      date_of_birth: updates.dateOfBirth,
      profession: updates.profession,
      company: updates.company,
      tax_id: updates.taxId,
      notes: updates.notes,
      join_date: updates.joinDate,
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updated = await apiClient.put(`/clients/${id}`, payload);
    const adapted = adaptClient(updated);

    let timelineEntry = null;
    try {
      timelineEntry = await recordHistoryEvent(apiClient, {
        entityType: "client",
        entityId: id,
        action: "updated",
        description: "Client updated",
        changedFields: updates,
        actor: "system",
      });
    } catch (err) {
      // already logged inside recordHistoryEvent
    }

    setClients((prevState) => {
      const next = prevState.map((client) => {
        if (client.id !== id) return client;
        const timeline = timelineEntry
          ? [timelineEntry, ...(client.timeline || [])]
          : client.timeline;
        return { ...adapted, timeline };
      });
      saveToStorage("clients", next);
      return next;
    });
    logUpdateHistory("client", prev, updates, actorName);
    logStatusHistory("client", prev, updates, actorName);

    return validation;
  };

  const deleteClient = async (id) => {
    const prev = clients.find((c) => c.id === id);
    const validation = validateMutation("client", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteClient] Deleting client ID:', id);

    await apiClient.delete(`/clients/${id}`);

    // Delete history for this client
    await deleteEntityHistory('client', id);

    setClients((prev) => {
      const next = prev.filter((client) => client.id !== id);
      saveToStorage("clients", next);
      return next;
    });

    logDeletionHistory("client", prev, actorName);
    return { ok: true, result: validation.result };
  };

  /**
   * CASCADE DELETE: Delete client and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteClientCascade = async (id) => {
    console.log('[DataContext.deleteClientCascade] Force deleting client and all related entities:', id);

    try {
      // Find all related dossiers
      const clientDossiers = dossiers.filter(d => String(d.clientId) === String(id));

      // Delete each dossier (which will cascade delete its children and their history)
      for (const dossier of clientDossiers) {
        await deleteDossierCascade(dossier.id);
      }

      // Find and delete all financial entries for this client
      const clientFinancials = financialEntries.filter(e => String(e.clientId) === String(id));
      for (const entry of clientFinancials) {
        await deleteFinancialEntry(entry.id);
        // Delete history for each financial entry
        await deleteEntityHistory('financial_entry', entry.id);
      }

      // Delete the client from backend
      await apiClient.delete(`/clients/${id}`);

      // Delete all history for this client
      await deleteEntityHistory('client', id);

      setClients((prev) => {
        const next = prev.filter((client) => client.id !== id);
        saveToStorage("clients", next);
        return next;
      });

      const prev = clients.find((c) => c.id === id);
      logDeletionHistory("client", prev, actorName);

      console.log('[DataContext.deleteClientCascade] Successfully deleted client and all related entities');
      return { ok: true, result: { message: 'Client and all child entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteClientCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Dossiers ---
  const addDossier = async (dossier) => {
    const validation = validateMutation("dossier", "add", dossier?.id, {
      data: dossier,
      newData: dossier,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const payload = {
      reference: dossier.reference || dossier.caseNumber,
      case_number: dossier.caseNumber || dossier.reference,
      client_id: dossier.clientId || dossier.client_id || dossier.client?.id,
      title: dossier.title,
      description: dossier.description,
      category: dossier.category,
      phase: dossier.phase,
      adversary_party: dossier.adversaryParty || dossier.adversary_party || dossier.adversary,
      adversary_lawyer: dossier.adversaryLawyer || dossier.adversary_lawyer,
      estimated_value: dossier.estimatedValue || dossier.estimated_value,
      court_reference: dossier.courtReference || dossier.court_reference,
      assigned_lawyer: dossier.assignedLawyer || dossier.assigned_lawyer,
      status: dossier.status === "Open" ? "open" : dossier.status === "On Hold" ? "on_hold" : dossier.status === "Closed" ? "closed" : dossier.status,
      priority: dossier.priority === "High" ? "high" : dossier.priority === "Medium" ? "medium" : dossier.priority === "Low" ? "low" : dossier.priority,
      opened_at: dossier.openDate,
      next_deadline: dossier.nextDeadline || dossier.prochaineEcheance,
    };

    const created = await apiClient.post("/dossiers", payload);
    const adapted = adaptDossier(created, Object.fromEntries(clients.map((c) => [c.id, c])));

    setDossiers((prev) => {
      const next = [...prev, adapted];
      saveToStorage("dossiers", next);
      return next;
    });

    logCreationHistory("dossier", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateDossier = async (id, updates, skipConfirmation = false) => {
    const prev = dossiers.find((d) => d.id === id);
    const validation = validateMutation("dossier", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateDossier] Updating dossier ID:', id, 'with:', updates);

    // 🚨 CRITICAL FIX: Build payload with ONLY the fields present in updates (PATCH semantics)
    const payload = {};

    if (updates.caseNumber !== undefined || updates.reference !== undefined) {
      const refValue = updates.caseNumber || updates.reference;
      payload.reference = refValue;
      payload.case_number = refValue;
    }
    if (updates.clientId !== undefined || updates.client_id !== undefined) {
      payload.client_id = updates.clientId || updates.client_id;
    }
    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = updates.description;
    }
    if (updates.category !== undefined) {
      payload.category = updates.category;
    }
    if (updates.phase !== undefined) {
      payload.phase = updates.phase;
    }
    if (updates.adversaryParty !== undefined || updates.adversary_party !== undefined || updates.adversary !== undefined) {
      payload.adversary_party = updates.adversaryParty || updates.adversary_party || updates.adversary;
    }
    if (updates.adversaryLawyer !== undefined || updates.adversary_lawyer !== undefined) {
      payload.adversary_lawyer = updates.adversaryLawyer || updates.adversary_lawyer;
    }
    if (updates.estimatedValue !== undefined || updates.estimated_value !== undefined) {
      payload.estimated_value = updates.estimatedValue || updates.estimated_value;
    }
    if (updates.courtReference !== undefined || updates.court_reference !== undefined) {
      payload.court_reference = updates.courtReference || updates.court_reference;
    }
    if (updates.assignedLawyer !== undefined || updates.assigned_lawyer !== undefined) {
      payload.assigned_lawyer = updates.assignedLawyer || updates.assigned_lawyer;
    }
    if (updates.status !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.status = updates.status;
    }
    if (updates.priority !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.priority = updates.priority;
    }
    if (updates.openDate !== undefined) {
      payload.opened_at = updates.openDate;
    }
    if (updates.nextDeadline !== undefined || updates.prochaineEcheance !== undefined) {
      payload.next_deadline = updates.nextDeadline || updates.prochaineEcheance;
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    // Safety check: ensure we have at least one field to update
    if (Object.keys(payload).length === 0) {
      console.warn('[DataContext.updateDossier] No valid dossier fields to update, skipping API call');
      return validation;
    }

    console.log('[DataContext.updateDossier] Sending PATCH payload:', payload);

    const updated = await apiClient.put(`/dossiers/${id}`, payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const adapted = adaptDossier(updated, clientsById);

    setDossiers((prev) => {
      const next = prev.map((dossier) =>
        dossier.id === id ? adapted : dossier
      );
      saveToStorage("dossiers", next);
      return next;
    });
    logUpdateHistory("dossier", prev, updates, actorName);
    logStatusHistory("dossier", prev, updates, actorName);

    return validation;
  };

  const deleteDossier = async (id) => {
    const prev = dossiers.find((d) => d.id === id);
    const validation = validateMutation("dossier", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteDossier] Deleting dossier ID:', id);

    await apiClient.delete(`/dossiers/${id}`);

    // Delete history for this dossier
    await deleteEntityHistory('dossier', id);

    setDossiers((prev) => {
      const next = prev.filter((dossier) => dossier.id !== id);
      saveToStorage("dossiers", next);
      return next;
    });

    logDeletionHistory("dossier", prev, actorName);
    return { ok: true, result: validation.result };
  };

  /**
   * CASCADE DELETE: Delete dossier and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteDossierCascade = async (id) => {
    console.log('[DataContext.deleteDossierCascade] Force deleting dossier and all related entities:', id);

    try {
      // Find all related cases
      const dossierCases = cases.filter(c => String(c.dossierId) === String(id));

      // Delete each case (which will cascade delete its children and their history)
      for (const caseItem of dossierCases) {
        await deleteCaseCascade(caseItem.id);
      }

      // Find and delete all missions for this dossier
      const dossierMissions = missions.filter(m => String(m.dossierId) === String(id));
      for (const mission of dossierMissions) {
        await deleteMission(mission.id);
        // Delete history for each mission
        await deleteEntityHistory('mission', mission.id);
      }

      // Find and delete all tasks for this dossier
      const dossierTasks = tasks.filter(t => t.parentType === 'dossier' && String(t.dossierId) === String(id));
      for (const task of dossierTasks) {
        await deleteTask(task.id);
        // Delete history for each task
        await deleteEntityHistory('task', task.id);
      }

      // Find and delete all sessions for this dossier
      const dossierSessions = sessions.filter(s => String(s.dossierId) === String(id) && !s.caseId);
      for (const session of dossierSessions) {
        await deleteSession(session.id);
        // Delete history for each session
        await deleteEntityHistory('session', session.id);
      }

      // Find and delete all financial entries for this dossier
      const dossierFinancials = financialEntries.filter(e => String(e.dossierId) === String(id));
      for (const entry of dossierFinancials) {
        await deleteFinancialEntry(entry.id);
        // Delete history for each financial entry
        await deleteEntityHistory('financial_entry', entry.id);
      }

      // Delete the dossier from backend
      await apiClient.delete(`/dossiers/${id}`);

      // Delete all history for this dossier
      await deleteEntityHistory('dossier', id);

      setDossiers((prev) => {
        const next = prev.filter((dossier) => dossier.id !== id);
        saveToStorage("dossiers", next);
        return next;
      });

      const prev = dossiers.find((d) => d.id === id);
      logDeletionHistory("dossier", prev, actorName);

      console.log('[DataContext.deleteDossierCascade] Successfully deleted dossier and all related entities');
      return { ok: true, result: { message: 'Dossier and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteDossierCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Cases ---
  const addCase = async (caseItem) => {
    const validation = validateMutation("case", "add", caseItem?.id, {
      data: caseItem,
      newData: caseItem,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    // Helper to convert empty strings to null
    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    const payload = {
      dossier_id: caseItem.dossierId || caseItem.dossier_id,
      title: caseItem.title,
      description: emptyToNull(caseItem.description),
      adversary: emptyToNull(caseItem.adversaire || caseItem.adversary),
      adversary_party: emptyToNull(caseItem.adversaryParty || caseItem.adversary_party),
      adversary_lawyer: emptyToNull(caseItem.adversaryLawyer || caseItem.adversary_lawyer),
      court: emptyToNull(caseItem.court),
      filing_date: emptyToNull(caseItem.filingDate),
      next_hearing: emptyToNull(caseItem.nextHearing),
      reference_number: emptyToNull(caseItem.courtReference || caseItem.reference_number),
      status: caseItem.status,
      priority: caseItem.priority === "High" ? "high" : caseItem.priority === "Medium" ? "medium" : caseItem.priority === "Low" ? "low" : caseItem.priority,
      opened_at: emptyToNull(caseItem.openDate),
      reference: emptyToNull(caseItem.caseNumber),
      case_number: emptyToNull(caseItem.caseNumber),
    };

    const created = await apiClient.post("/cases", payload);
    const adapted = adaptCase(created, Object.fromEntries(dossiers.map((d) => [d.id, d])));

    setCases((prev) => {
      const next = [...prev, adapted];
      saveToStorage("cases", next);
      if (adapted.dossierId) {
        const title = adapted.title || "";
        const reference = adapted.caseNumber || "";
        const caseDescription = title && reference ? `${title} (${reference})` : title || reference || t("entities.lawsuits");
        logHistoryEvent({
          entityType: "dossier",
          entityId: adapted.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: `${t("detail.history.labels.lawsuitCreated")}: ${caseDescription}`,
          details: `${t("detail.history.labels.lawsuitCreated")}: ${caseDescription}`,
          metadata: {
            childType: "case",
            childId: adapted.id,
          },
        });
      }
      return next;
    });

    logCreationHistory("case", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateCase = async (id, updates) => {
    const prev = cases.find((c) => c.id === id);
    const validation = validateMutation("case", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateCase] Updating case ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    const payload = {};

    // Only include fields that are actually being updated
    if (updates.dossierId !== undefined || updates.dossier_id !== undefined) {
      payload.dossier_id = updates.dossierId || updates.dossier_id;
    }
    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = emptyToNull(updates.description);
    }
    if (updates.adversaire !== undefined || updates.adversary !== undefined) {
      payload.adversary = emptyToNull(updates.adversaire || updates.adversary);
    }
    if (updates.adversaryParty !== undefined || updates.adversary_party !== undefined) {
      payload.adversary_party = emptyToNull(updates.adversaryParty || updates.adversary_party);
    }
    if (updates.adversaryLawyer !== undefined || updates.adversary_lawyer !== undefined) {
      payload.adversary_lawyer = emptyToNull(updates.adversaryLawyer || updates.adversary_lawyer);
    }
    if (updates.court !== undefined) {
      payload.court = emptyToNull(updates.court);
    }
    if (updates.filingDate !== undefined) {
      payload.filing_date = emptyToNull(updates.filingDate);
    }
    if (updates.nextHearing !== undefined) {
      payload.next_hearing = emptyToNull(updates.nextHearing);
    }
    if (updates.courtReference !== undefined) {
      payload.reference_number = emptyToNull(updates.courtReference);
    }
    if (updates.status !== undefined) {
      payload.status = updates.status;
    }
    if (updates.priority !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.priority = updates.priority;
    }
    if (updates.openDate !== undefined) {
      payload.opened_at = emptyToNull(updates.openDate);
    }
    if (updates.caseNumber !== undefined) {
      payload.reference = emptyToNull(updates.caseNumber);
      payload.case_number = emptyToNull(updates.caseNumber);
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    const updated = await apiClient.put(`/cases/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const adapted = adaptCase(updated, dossiersById);

    setCases((prev) => {
      const next = prev.map((caseItem) =>
        caseItem.id === id ? adapted : caseItem
      );
      saveToStorage("cases", next);
      return next;
    });
    logUpdateHistory("case", prev, updates, actorName);
    logStatusHistory("case", prev, updates, actorName);

    return validation;
  };

  const deleteCase = async (id) => {
    const prev = cases.find((c) => c.id === id);
    const validation = validateMutation("case", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteCase] Deleting case ID:', id);

    await apiClient.delete(`/cases/${id}`);

    // Delete history for this case
    await deleteEntityHistory('case', id);

    setCases((prev) => {
      const next = prev.filter((caseItem) => caseItem.id !== id);
      saveToStorage("cases", next);
      return next;
    });

    logDeletionHistory("case", prev, actorName);
    return { ok: true, result: validation.result };
  };

  /**
   * CASCADE DELETE: Delete case and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteCaseCascade = async (id) => {
    console.log('[DataContext.deleteCaseCascade] Force deleting case and all related entities:', id);

    try {
      // Find and delete all missions for this case
      const caseMissions = missions.filter(m => String(m.caseId) === String(id));
      for (const mission of caseMissions) {
        await deleteMission(mission.id);
        // Delete history for each mission
        await deleteEntityHistory('mission', mission.id);
      }

      // Find and delete all sessions for this case
      const caseSessions = sessions.filter(s => String(s.caseId) === String(id));
      for (const session of caseSessions) {
        await deleteSession(session.id);
        // Delete history for each session
        await deleteEntityHistory('session', session.id);
      }

      // Find and delete all tasks for this case
      const caseTasks = tasks.filter(t => t.parentType === 'case' && String(t.caseId) === String(id));
      for (const task of caseTasks) {
        await deleteTask(task.id);
        // Delete history for each task
        await deleteEntityHistory('task', task.id);
      }

      // Delete the case from backend
      await apiClient.delete(`/cases/${id}`);

      // Delete all history for this case
      await deleteEntityHistory('case', id);

      setCases((prev) => {
        const next = prev.filter((caseItem) => caseItem.id !== id);
        saveToStorage("cases", next);
        return next;
      });

      const prev = cases.find((c) => c.id === id);
      logDeletionHistory("case", prev, actorName);

      console.log('[DataContext.deleteCaseCascade] Successfully deleted case and all related entities');
      return { ok: true, result: { message: 'Case and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteCaseCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Sessions ---
  const addSession = async (sessionItem) => {
    const validation = validateMutation("session", "add", sessionItem?.id, {
      data: sessionItem,
      newData: sessionItem,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addSession] Incoming sessionItem:', sessionItem);

    const normalizeTxt = (val) =>
      (val || "")
        .toLowerCase()
        .replace(/[éèê]/g, "e")
        .replace(/[àâ]/g, "a")
        .replace(/[ùû]/g, "u")
        .replace(/[ô]/g, "o")
        .replace(/[îï]/g, "i");

    const mapSessionType = (raw) => {
      const v = normalizeTxt(raw);
      if (["audience", "hearing"].includes(v)) return "hearing";
      if (["consultation"].includes(v)) return "consultation";
      if (["mediation"].includes(v)) return "mediation";
      if (["expertise", "expertassessment", "expert assessment"].includes(v)) return "expertise";
      if (["telephone", "tel", "phone", "phonecall", "phone call"].includes(v)) return "phone";
      if (["autre", "other"].includes(v)) return "other";
      return v || "hearing";
    };

    const payload = {
      title: emptyToNull(sessionItem.title),
      session_type: mapSessionType(sessionItem.type || sessionItem.session_type),
      status: (() => {
        const st = normalizeTxt(sessionItem.status);
        if (["programmee", "progremmee", "confirmee", "confirmee"].includes(st)) return "scheduled";
        if (["terminee", "termine"].includes(st)) return "completed";
        if (["annulee", "annule"].includes(st)) return "cancelled";
        if (["reportee", "reporee", "postponed"].includes(st)) return "postponed";
        return sessionItem.status;
      })(),
      scheduled_at:
        sessionItem.scheduledAt ||
        sessionItem.scheduled_at ||
        (sessionItem.date ? `${sessionItem.date}T${sessionItem.time || "00:00"}:00` : null),
      location: emptyToNull(sessionItem.location),
      court_room: emptyToNull(sessionItem.courtRoom || sessionItem.court_room),
      judge: emptyToNull(sessionItem.judge),
      duration: emptyToNull(sessionItem.duration),
      outcome: emptyToNull(sessionItem.outcome),
      description: emptyToNull(sessionItem.description),
      notes: emptyToNull(sessionItem.notes),
      participants: Array.isArray(sessionItem.participants) ? sessionItem.participants : emptyToNull(sessionItem.participants),
    };

    // Only include dossier_id OR case_id, not both (backend requires XOR)
    const caseId = emptyToNull(sessionItem.caseId || sessionItem.case_id);
    const dossierId = emptyToNull(sessionItem.dossierId || sessionItem.dossier_id);
    // Prefer explicit case linkage when both exist (e.g., hearings added from a lawsuit tab)
    if (caseId) {
      payload.case_id = caseId;
    } else if (dossierId) {
      payload.dossier_id = dossierId;
    }

    console.log('[DataContext.addSession] Sending payload:', payload);

    const created = await apiClient.post("/sessions", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptSession(created, dossiersById, casesById);

    setSessions((prev) => {
      const next = [...prev, adapted];
      saveToStorage("sessions", next);
      return next;
    });

    logCreationHistory("session", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateSession = async (id, updates, options = {}) => {
    const { skipConfirmation = false } = options;
    const prev = sessions.find((s) => s.id === id);
    const validation = validateMutation("session", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateSession] Updating session ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    const normalizeTxt = (val) =>
      (val || "")
        .toLowerCase()
        .replace(/[éèê]/g, "e")
        .replace(/[àâ]/g, "a")
        .replace(/[ùû]/g, "u")
        .replace(/[ô]/g, "o")
        .replace(/[îï]/g, "i");

    const mapSessionType = (raw) => {
      const v = normalizeTxt(raw);
      if (["audience", "hearing"].includes(v)) return "hearing";
      if (["consultation"].includes(v)) return "consultation";
      if (["mediation"].includes(v)) return "mediation";
      if (["expertise", "expertassessment", "expert assessment"].includes(v)) return "expertise";
      if (["telephone", "tel", "phone", "phonecall", "phone call"].includes(v)) return "phone";
      if (["autre", "other"].includes(v)) return "other";
      return v || "hearing";
    };

    const payload = {};
    if (updates.title !== undefined) {
      payload.title = emptyToNull(updates.title);
    }
    if (updates.type !== undefined || updates.session_type !== undefined) {
      payload.session_type = mapSessionType(updates.type || updates.session_type);
    }
    if (updates.status !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.status = updates.status;
    }
    if (updates.scheduledAt !== undefined || updates.scheduled_at !== undefined || updates.date !== undefined) {
      payload.scheduled_at =
        updates.scheduledAt ||
        updates.scheduled_at ||
        (updates.date ? `${updates.date}T${updates.time || "00:00"}:00` : undefined);
    }
    if (updates.location !== undefined) {
      payload.location = emptyToNull(updates.location);
    }
    if (updates.courtRoom !== undefined || updates.court_room !== undefined) {
      payload.court_room = emptyToNull(updates.courtRoom || updates.court_room);
    }
    if (updates.judge !== undefined) {
      payload.judge = emptyToNull(updates.judge);
    }
    if (updates.duration !== undefined) {
      payload.duration = emptyToNull(updates.duration);
    }
    if (updates.outcome !== undefined) {
      payload.outcome = emptyToNull(updates.outcome);
    }
    if (updates.description !== undefined) {
      payload.description = emptyToNull(updates.description);
    }
    if (updates.participants !== undefined) {
      payload.participants = updates.participants;
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }
    if (updates.dossierId !== undefined || updates.dossier_id !== undefined) {
      payload.dossier_id = emptyToNull(updates.dossierId || updates.dossier_id);
    }
    if (updates.caseId !== undefined || updates.case_id !== undefined) {
      payload.case_id = emptyToNull(updates.caseId || updates.case_id);
    }

    // Remove undefined values (though they shouldn't be there now)
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updated = await apiClient.put(`/sessions/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptSession(updated, dossiersById, casesById);

    setSessions((prev) => {
      const next = prev.map((session) =>
        session.id === id ? adapted : session
      );
      saveToStorage("sessions", next);
      return next;
    });
    logUpdateHistory("session", prev, updates, actorName);
    logStatusHistory("session", prev, updates, actorName);

    return validation;
  };

  const deleteSession = async (id) => {
    const prev = sessions.find((s) => s.id === id);
    const validation = validateMutation("session", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteSession] Deleting session ID:', id);

    await apiClient.delete(`/sessions/${id}`);

    // Delete history for this session
    await deleteEntityHistory('session', id);

    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id);
      saveToStorage("sessions", next);
      return next;
    });

    logDeletionHistory("session", prev, actorName);
    return { ok: true, result: validation.result };
  };

  // --- Tasks (linked to dossiers/cases) ---
  const addTask = async (taskItem) => {
    const validation = validateMutation("task", "add", taskItem?.id, {
      data: taskItem,
      newData: taskItem,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addTask] Incoming taskItem:', taskItem);

    const payload = {
      title: taskItem.title || "Nouvelle tâche",
      description: emptyToNull(taskItem.description),
      assigned_to: emptyToNull(taskItem.assignedTo || taskItem.assigned_to),
      due_date: emptyToNull(taskItem.dueDate || taskItem.due_date),
      estimated_time: emptyToNull(taskItem.estimatedTime || taskItem.estimated_time),
      status: taskItem.status || "Non commencee",
      priority: taskItem.priority || "Moyenne",
    };

    // Only include dossier_id OR case_id, not both (backend requires XOR)
    const caseId = emptyToNull(taskItem.caseId || taskItem.case_id);
    const dossierId = emptyToNull(taskItem.dossierId || taskItem.dossier_id);
    // Prefer explicit case linkage when both exist (tasks added from a lawsuit tab)
    if (caseId) {
      payload.case_id = caseId;
    } else if (dossierId) {
      payload.dossier_id = dossierId;
    }

    const created = await apiClient.post("/tasks", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptTask(created, dossiersById, casesById);

    setTasks((prev) => {
      const next = [...prev, adapted];
      saveToStorage("tasks", next);
      return next;
    });

    logCreationHistory("task", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateTask = async (id, updates, options = {}) => {
    const { skipConfirmation = false } = options;
    const prev = tasks.find((t) => t.id === id);
    const validation = validateMutation("task", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateTask] Updating task ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    const payload = {};

    // Only include fields that are being updated
    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = emptyToNull(updates.description);
    }
    if (updates.dossierId !== undefined || updates.dossier_id !== undefined) {
      payload.dossier_id = emptyToNull(updates.dossierId || updates.dossier_id);
    }
    if (updates.caseId !== undefined || updates.case_id !== undefined) {
      payload.case_id = emptyToNull(updates.caseId || updates.case_id);
    }
    if (updates.assignedTo !== undefined || updates.assigned_to !== undefined) {
      payload.assigned_to = emptyToNull(updates.assignedTo || updates.assigned_to);
    }
    if (updates.dueDate !== undefined || updates.due_date !== undefined) {
      payload.due_date = emptyToNull(updates.dueDate || updates.due_date);
    }
    if (updates.estimatedTime !== undefined || updates.estimated_time !== undefined) {
      payload.estimated_time = emptyToNull(updates.estimatedTime || updates.estimated_time);
    }
    if (updates.status !== undefined) {
      // Backend expects French statuses WITHOUT accents
      const statusMap = {
        "Non commencée": "Non commencee",
        "En cours": "En cours",
        "Bloqué": "Bloqué",
        "Terminée": "Terminee",
        "Annulé": "Annulé",
        "En attente": "En attente",
        "Planifiée": "Planifiee",
      };
      payload.status = statusMap[updates.status] || updates.status;
    }
    if (updates.priority !== undefined) {
      // Backend expects French priorities, send as-is
      payload.priority = updates.priority;
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    const updated = await apiClient.put(`/tasks/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptTask(updated, dossiersById, casesById);

    setTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? adapted : task
      );
      saveToStorage("tasks", next);
      return next;
    });
    logUpdateHistory("task", prev, updates, actorName);
    logStatusHistory("task", prev, updates, actorName);

    return validation;
  };

  const deleteTask = async (id) => {
    const prev = tasks.find((t) => t.id === id);
    const validation = validateMutation("task", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteTask] Deleting task ID:', id);

    await apiClient.delete(`/tasks/${id}`);

    // Delete history for this task
    await deleteEntityHistory('task', id);

    setTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      saveToStorage("tasks", next);
      return next;
    });

    logDeletionHistory("task", prev, actorName);
    return { ok: true, result: validation.result };
  };

  // --- Personal Tasks (non-linked) ---
  const addPersonalTask = async (task) => {
    const validation = validateMutation("personalTask", "add", task?.id, {
      data: task,
      newData: task,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries, personalTasks }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addPersonalTask] Incoming task:', task);

    // Map status from French to English (case-insensitive)
    const normalizeStatus = (status) => {
      const normalized = (status || "").toLowerCase().trim();
      const statusMap = {
        "todo": "todo",
        "pending": "todo",
        "not started": "todo",
        "en cours": "in_progress",
        "in_progress": "in_progress",
        "in progress": "in_progress",
        "bloqué": "blocked",
        "blocked": "blocked",
        "terminé": "done",
        "done": "done",
        "completed": "done",
        "annulé": "cancelled",
        "cancelled": "cancelled",
        "canceled": "cancelled",
        "scheduled": "scheduled",
      };
      return statusMap[normalized] || "todo";
    };

    // Map priority from French to English (case-insensitive)
    const normalizePriority = (priority) => {
      const normalized = (priority || "").toLowerCase().trim();
      const priorityMap = {
        "basse": "low",
        "low": "low",
        "moyenne": "medium",
        "medium": "medium",
        "haute": "high",
        "high": "high",
        "urgent": "urgent",
      };
      return priorityMap[normalized] || "medium";
    };

    // Normalize category from any case to lowercase
    const normalizeCategory = (category) => {
      if (!category) return null;
      return category.toLowerCase();
    };

    const statusMap = {
      "todo": "todo",
      "not started": "todo",
      "pending": "todo",
      "en cours": "in_progress",
      "in progress": "in_progress",
      "in_progress": "in_progress",
      "bloqué": "blocked",
      "blocked": "blocked",
      "terminé": "done",
      "done": "done",
      "completed": "done",
      "annulé": "cancelled",
      "cancelled": "cancelled",
      "canceled": "cancelled",
      "scheduled": "scheduled",
    };


    const payload = {
      title: task.title,
      description: emptyToNull(task.description),
      category: emptyToNull(task.category),
      status: normalizeStatus(task.status),
      priority: normalizePriority(task.priority),
      due_date: emptyToNull(task.dueDate || task.due_date),
      completed_at: emptyToNull(task.completedAt || task.completed_at),
      notes: emptyToNull(task.notes),
    };

    console.log('[DataContext.addPersonalTask] Sending payload:', payload);

    const created = await apiClient.post("/personal-tasks", payload);
    const adapted = adaptPersonalTask(created);

    setPersonalTasks((prev) => {
      const next = [...prev, adapted];
      saveToStorage("personalTasks", next);
      return next;
    });

    logCreationHistory("personalTask", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updatePersonalTask = async (id, updates) => {
    const prev = personalTasks.find((t) => t.id === id);
    const validation = validateMutation("personalTask", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.updatePersonalTask] Updating personal task ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    // Map status from French to English (case-insensitive)
    const normalizeStatus = (status) => {
      const normalized = (status || "").toLowerCase().trim();
      const statusMap = {
        "todo": "todo",
        "pending": "todo",
        "en cours": "in_progress",
        "in_progress": "in_progress",
        "in progress": "in_progress",
        "bloqué": "blocked",
        "blocked": "blocked",
        "terminé": "done",
        "done": "done",
        "completed": "done",
        "annulé": "cancelled",
        "cancelled": "cancelled",
        "canceled": "cancelled",
        "scheduled": "scheduled",
      };
      return statusMap[normalized] || "todo";
    };

    // Map priority from French to English (case-insensitive)
    const normalizePriority = (priority) => {
      const normalized = (priority || "").toLowerCase().trim();
      const priorityMap = {
        "basse": "low",
        "low": "low",
        "moyenne": "medium",
        "medium": "medium",
        "haute": "high",
        "high": "high",
        "urgent": "urgent",
      };
      return priorityMap[normalized] || "medium";
    };

    // Normalize category to backend lowercase values
    const normalizeCategory = (category) => {
      if (!category) return null;
      const map = {
        invoices: "invoices",
        Invoices: "invoices",
        office: "office",
        Office: "office",
        personal: "personal",
        Personal: "personal",
        it: "it",
        IT: "it",
        administrative: "administrative",
        Administrative: "administrative",
        other: "other",
        Other: "other",
      };
      return map[category] || category.toLowerCase();
    };

    const payload = {};

    // Only include fields that are being updated
    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = emptyToNull(updates.description);
    }
    if (updates.category !== undefined) {
      payload.category = normalizeCategory(updates.category);
    }
    if (updates.status !== undefined) {
      payload.status = normalizeStatus(updates.status);
    }
    if (updates.priority !== undefined) {
      payload.priority = normalizePriority(updates.priority);
    }
    if (updates.dueDate !== undefined || updates.due_date !== undefined) {
      payload.due_date = emptyToNull(updates.dueDate || updates.due_date);
    }
    if (updates.completedAt !== undefined || updates.completed_at !== undefined) {
      payload.completed_at = emptyToNull(updates.completedAt || updates.completed_at);
    }
    if (updates.notes !== undefined) {
      // Ensure notes is stored as a string or null for SQLite binding
      if (Array.isArray(updates.notes)) {
        payload.notes = emptyToNull(JSON.stringify(updates.notes));
      } else {
        payload.notes = emptyToNull(updates.notes);
      }
    }

    const updated = await apiClient.put(`/personal-tasks/${id}`, payload);
    const adapted = adaptPersonalTask(updated);

    setPersonalTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? adapted : task
      );
      saveToStorage("personalTasks", next);
      return next;
    });
    logUpdateHistory("personalTask", prev, updates, actorName);
    logStatusHistory("personalTask", prev, updates, actorName);

    return validation;
  };

  const deletePersonalTask = async (id) => {
    const prev = personalTasks.find((t) => t.id === id);
    const validation = validateMutation("personalTask", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deletePersonalTask] Deleting personal task ID:', id);

    await apiClient.delete(`/personal-tasks/${id}`);

    setPersonalTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      saveToStorage("personalTasks", next);
      return next;
    });

    logDeletionHistory("personalTask", prev, actorName);
    return { ok: true, result: validation.result };
  };

  // --- Officers ---
  const addOfficer = async (officer) => {
    const validation = validateMutation("officer", "add", officer?.id, {
      data: officer,
      newData: officer,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addOfficer] Incoming officer:', officer);

    // Normalize status to match database constraint: 'active','busy','inActive'
    const normalizeOfficerStatus = (status) => {
      const normalized = (status || "").toLowerCase().trim();
      if (normalized === "active" || normalized === "disponible") return "active";
      if (normalized === "busy" || normalized === "occupe" || normalized === "occupé") return "busy";
      if (normalized === "inactive" || normalized === "inactif") return "inActive";
      return "active"; // default
    };

    // Map frontend field names to backend expectations
    const payload = {
      name: officer.name,
      email: emptyToNull(officer.email),
      phone: emptyToNull(officer.phone),
      alternate_phone: emptyToNull(officer.alternatePhone || officer.alternate_phone),
      address: emptyToNull(officer.address),
      location: emptyToNull(officer.location),
      agency: emptyToNull(officer.agency),
      status: normalizeOfficerStatus(officer.status),
      notes: emptyToNull(officer.notes),
    };

    console.log('[DataContext.addOfficer] Sending payload:', payload);

    const created = await apiClient.post("/officers", payload);
    const adapted = adaptOfficer(created);

    setOfficers((prev) => {
      const next = [...prev, adapted];
      saveToStorage("officers", next);
      return next;
    });

    logCreationHistory("officer", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateOfficer = async (id, updates) => {
    const prev = officers.find((o) => o.id === id);
    const validation = validateMutation("officer", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateOfficer] Updating officer ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    // 🚨 CRITICAL FIX: Build payload with ONLY the fields present in updates (PATCH semantics)
    // This prevents sending undefined/null for fields that weren't changed
    const payload = {};

    if (updates.name !== undefined) {
      payload.name = updates.name;
    }
    if (updates.email !== undefined) {
      payload.email = emptyToNull(updates.email);
    }
    if (updates.phone !== undefined) {
      payload.phone = emptyToNull(updates.phone);
    }
    if (updates.alternatePhone !== undefined || updates.alternate_phone !== undefined) {
      payload.alternate_phone = emptyToNull(updates.alternatePhone || updates.alternate_phone);
    }
    if (updates.address !== undefined) {
      payload.address = emptyToNull(updates.address);
    }
    if (updates.location !== undefined) {
      payload.location = emptyToNull(updates.location);
    }
    if (updates.agency !== undefined) {
      payload.agency = emptyToNull(updates.agency);
    }
    if (updates.registrationNumber !== undefined || updates.registration_number !== undefined) {
      payload.registration_number = emptyToNull(updates.registrationNumber || updates.registration_number);
    }
    if (updates.status !== undefined) {
      // Normalize status to match database constraint: 'active','busy','inActive'
      const normalizeOfficerStatus = (status) => {
        const normalized = (status || "").toLowerCase().trim();
        if (normalized === "active" || normalized === "disponible") return "active";
        if (normalized === "busy" || normalized === "occupe" || normalized === "occupé") return "busy";
        if (normalized === "inactive" || normalized === "inactif") return "inActive";
        return "active"; // default
      };
      payload.status = normalizeOfficerStatus(updates.status);
    }
    if (updates.notes !== undefined) {
      payload.notes = emptyToNull(updates.notes);
    }

    // Safety check: ensure we have at least one field to update
    if (Object.keys(payload).length === 0) {
      console.warn('[DataContext.updateOfficer] No valid officer fields to update, skipping API call');
      return validation;
    }

    console.log('[DataContext.updateOfficer] Sending PATCH payload:', payload);

    const updated = await apiClient.put(`/officers/${id}`, payload);
    const adapted = adaptOfficer(updated);

    setOfficers((prev) => {
      const next = prev.map((officer) =>
        officer.id === id ? adapted : officer
      );
      saveToStorage("officers", next);
      return next;
    });
    logUpdateHistory("officer", prev, updates, actorName);
    logStatusHistory("officer", prev, updates, actorName);

    return validation;
  };

  const deleteOfficer = async (id) => {
    const prev = officers.find((o) => o.id === id);
    const validation = validateMutation("officer", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteOfficer] Deleting officer ID:', id);

    await apiClient.delete(`/officers/${id}`);

    setOfficers((prev) => {
      const next = prev.filter((officer) => officer.id !== id);
      saveToStorage("officers", next);
      return next;
    });

    logDeletionHistory("officer", prev, actorName);
    return { ok: true, result: validation.result };
  };

  /**
   * CASCADE DELETE: Delete officer and all related entities
   * Called when user confirms force delete from BlockerModal
   *
   * CRITICAL: This function MUST delete all missions or fail completely.
   * Orphaned missions (missions without a bailiff) are INVALID domain state.
   */
  const deleteOfficerCascade = async (id) => {
    console.log('[DataContext.deleteOfficerCascade] Force deleting officer and all related entities:', id);

    try {
      // Find all missions for this officer (use String comparison for type safety)
      const officerMissions = missions.filter(m => String(m.officerId) === String(id));
      console.log(`[DataContext.deleteOfficerCascade] Found ${officerMissions.length} missions to delete:`, officerMissions.map(m => m.id));

      // Delete each mission (which will cascade delete their financial entries and history)
      for (const mission of officerMissions) {
        console.log(`[DataContext.deleteOfficerCascade] Deleting mission ${mission.id}...`);
        const result = await deleteMissionCascade(mission.id);

        // CRITICAL: If mission deletion fails, abort the entire cascade
        if (!result || !result.ok) {
          console.error(`[DataContext.deleteOfficerCascade] Failed to delete mission ${mission.id}:`, result);
          throw new Error(`Failed to delete mission ${mission.id}. Aborting officer cascade delete to prevent orphaned missions.`);
        }
        console.log(`[DataContext.deleteOfficerCascade] Successfully deleted mission ${mission.id}`);
      }

      // Delete any direct financial entries linked to this officer (if any)
      const directFinancialEntries = financialEntries.filter(
        (entry) => String(entry.officerId) === String(id) && entry.scope === 'client'
      );

      console.log(`[DataContext.deleteOfficerCascade] Found ${directFinancialEntries.length} direct financial entries to delete`);
      for (const entry of directFinancialEntries) {
        await deleteFinancialEntry(entry.id);
      }

      // Finally, delete the officer itself from backend
      console.log(`[DataContext.deleteOfficerCascade] Deleting officer ${id} from backend...`);
      await apiClient.delete(`/officers/${id}`);

      // Update frontend state
      setOfficers((prev) => {
        const next = prev.filter((officer) => officer.id !== id);
        saveToStorage("officers", next);
        return next;
      });

      const prev = officers.find((o) => o.id === id);
      logDeletionHistory("officer", prev, actorName);

      console.log('[DataContext.deleteOfficerCascade] Successfully deleted officer and all related entities');
      return { ok: true, result: { message: 'Officer and all child entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteOfficerCascade] CRITICAL ERROR during cascade delete:', error);
      console.error('[DataContext.deleteOfficerCascade] Officer may have been partially deleted. Manual cleanup may be required.');
      return { ok: false, result: { message: `Error during cascade delete: ${error.message}` } };
    }
  };

  // --- Missions ---
  const addMission = async (mission) => {
    const validation = validateMutation("mission", "add", mission?.id, {
      data: mission,
      newData: mission,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addMission] Incoming mission:', mission);

    // Determine which entity to link based on entityType or which ID is provided
    const entityType = mission.entityType;
    const dossierId = emptyToNull(mission.dossierId ?? mission.dossier_id);
    const caseId = emptyToNull(mission.caseId ?? mission.case_id);

    // Backend requires EITHER dossier_id OR case_id (exclusive)
    // Prefer the explicit entityType, otherwise mirror the task XOR rule (case wins ties)
    let finalDossierId = null;
    let finalCaseId = null;

    if (entityType === "case") {
      finalCaseId = caseId || null;
      if (!finalCaseId && dossierId) {
        finalDossierId = dossierId;
      }
    } else if (entityType === "dossier") {
      finalDossierId = dossierId || null;
      if (!finalDossierId && caseId) {
        finalCaseId = caseId;
      }
    } else if (caseId && dossierId) {
      // Ambiguous: default to case linkage to align with tasks
      finalCaseId = caseId;
    } else if (caseId) {
      finalCaseId = caseId;
    } else if (dossierId) {
      finalDossierId = dossierId;
    }

    // Map frontend field names to backend expectations
    const payload = {
      title: mission.title,
      description: emptyToNull(mission.description),
      mission_type: emptyToNull(mission.missionType || mission.mission_type),
      status:
        mission.status === "Programmée" || mission.status === "Programmee" || mission.status === "Planifiée" || mission.status === "Planifiee" || mission.status === "Planned" || mission.status === "Scheduled"
          ? "planned"
          : mission.status === "En cours" || mission.status === "In Progress"
            ? "in_progress"
            : mission.status === "Terminée" || mission.status === "Terminee" || mission.status === "Completed"
              ? "completed"
              : mission.status === "Annulée" || mission.status === "Annulee" || mission.status === "Cancelled"
                ? "cancelled"
                : mission.status?.toLowerCase(),
      priority:
        mission.priority === "Haute" || mission.priority === "High" ? "high"
          : mission.priority === "Moyenne" || mission.priority === "Medium" ? "medium"
            : mission.priority === "Basse" || mission.priority === "Low" ? "low"
              : mission.priority === "Urgent" ? "urgent"
                : mission.priority?.toLowerCase(),
      assign_date: emptyToNull(mission.assignDate || mission.assign_date),
      due_date: emptyToNull(mission.dueDate || mission.due_date),
      completion_date: emptyToNull(mission.completionDate || mission.completion_date),
      closed_at: emptyToNull(mission.closedAt || mission.closed_at),
      result: emptyToNull(mission.result),
      notes: emptyToNull(mission.notes),
      dossier_id: finalDossierId,
      case_id: finalCaseId,
      officer_id: emptyToNull(mission.officerId || mission.officer_id),
      reference: emptyToNull(mission.missionNumber || mission.reference),
    };

    console.log('[DataContext.addMission] Sending payload:', payload);

    const created = await apiClient.post("/missions", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptMission(created, dossiersById, casesById);

    setMissions((prev) => {
      const next = [...prev, adapted];
      saveToStorage("missions", next);
      return next;
    });

    // Update parent dossier or case with the new mission
    if (adapted.entityType === "dossier" && adapted.dossierId) {
      setDossiers((prev) => {
        const next = prev.map((d) =>
          d.id === adapted.dossierId
            ? { ...d, missions: [...(d.missions || []), adapted] }
            : d
        );
        saveToStorage("dossiers", next);
        return next;
      });
    } else if (adapted.entityType === "case" && adapted.caseId) {
      setCases((prev) => {
        const next = prev.map((c) =>
          c.id === adapted.caseId
            ? { ...c, missions: [...(c.missions || []), adapted] }
            : c
        );
        saveToStorage("cases", next);
        return next;
      });
    }

    logCreationHistory("mission", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateMission = async (id, updates, skipConfirmation = false) => {
    const prev = missions.find((m) => m.id === id);
    const validation = validateMutation("mission", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateMission] Updating mission ID:', id, 'with:', updates);

    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    // Build payload with ONLY the fields present in updates (PATCH semantics)
    const payload = {};

    if (updates.title !== undefined) {
      payload.title = updates.title;
    }
    if (updates.description !== undefined) {
      payload.description = emptyToNull(updates.description);
    }
    if (updates.missionType !== undefined || updates.mission_type !== undefined) {
      payload.mission_type = emptyToNull(updates.missionType || updates.mission_type);
    }
    if (updates.status !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.status = updates.status;
    }
    if (updates.priority !== undefined) {
      // ✅ Send display value as-is - backend normalizeData will transform it
      payload.priority = updates.priority;
    }
    if (updates.assignDate !== undefined || updates.assign_date !== undefined) {
      payload.assign_date = emptyToNull(updates.assignDate || updates.assign_date);
    }
    if (updates.dueDate !== undefined || updates.due_date !== undefined) {
      payload.due_date = emptyToNull(updates.dueDate || updates.due_date);
    }
    if (updates.completionDate !== undefined || updates.completion_date !== undefined) {
      payload.completion_date = emptyToNull(updates.completionDate || updates.completion_date);
    }
    if (updates.closedAt !== undefined || updates.closed_at !== undefined) {
      payload.closed_at = emptyToNull(updates.closedAt || updates.closed_at);
    }
    if (updates.result !== undefined) {
      payload.result = emptyToNull(updates.result);
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }
    if (updates.dossierId !== undefined || updates.dossier_id !== undefined) {
      payload.dossier_id = emptyToNull(updates.dossierId || updates.dossier_id);
    }
    if (updates.caseId !== undefined || updates.case_id !== undefined) {
      payload.case_id = emptyToNull(updates.caseId || updates.case_id);
    }
    if (updates.officerId !== undefined || updates.officer_id !== undefined) {
      payload.officer_id = emptyToNull(updates.officerId || updates.officer_id);
    }
    if (updates.missionNumber !== undefined || updates.reference !== undefined) {
      payload.reference = emptyToNull(updates.missionNumber || updates.reference);
    }

    const updated = await apiClient.put(`/missions/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptMission(updated, dossiersById, casesById);

    setMissions((prev) => {
      const next = prev.map((mission) =>
        mission.id === id ? adapted : mission
      );
      saveToStorage("missions", next);
      return next;
    });
    logUpdateHistory("mission", prev, updates, actorName);
    logStatusHistory("mission", prev, updates, actorName);

    return adapted;
  };

  const deleteMission = async (id) => {
    const prev = missions.find((m) => m.id === id);
    const validation = validateMutation("mission", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteMission] Deleting mission ID:', id);

    await apiClient.delete(`/missions/${id}`);

    setMissions((prev) => {
      const next = prev.filter((mission) => mission.id !== id);
      saveToStorage("missions", next);
      return next;
    });

    logDeletionHistory("mission", prev, actorName);
    return { ok: true, result: validation.result };
  };

  const deleteMissionCascade = async (id) => {
    console.log('[DataContext.deleteMissionCascade] Force deleting mission and all related entities:', id);

    try {
      // Find all financial entries for this mission
      const missionFinancials = financialEntries.filter(e => String(e.missionId) === String(id));
      for (const entry of missionFinancials) {
        await deleteFinancialEntry(entry.id);
        // Delete history for each financial entry
        await deleteEntityHistory('financial_entry', entry.id);
      }

      // Note: Documents and notes deletion skipped as these features are not yet implemented
      // When documents/notes are added, uncomment the following code:
      // const missionDocuments = documents.filter(d => d.entityType === 'mission' && String(d.entityId) === String(id));
      // for (const doc of missionDocuments) {
      //   await deleteDocument(doc.id);
      //   await deleteEntityHistory('document', doc.id);
      // }
      // const missionNotes = notes.filter(n => n.entityType === 'mission' && String(n.entityId) === String(id));
      // for (const note of missionNotes) {
      //   await deleteNote(note.id);
      //   await deleteEntityHistory('note', note.id);
      // }

      // Delete the mission from backend
      await apiClient.delete(`/missions/${id}`);

      // Delete all history for this mission
      await deleteEntityHistory('mission', id);

      setMissions((prev) => {
        const next = prev.filter((mission) => mission.id !== id);
        saveToStorage("missions", next);
        return next;
      });

      const prev = missions.find((m) => m.id === id);
      logDeletionHistory("mission", prev, actorName);

      console.log('[DataContext.deleteMissionCascade] Successfully deleted mission and all related entities');
      return { ok: true, result: { message: 'Mission and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteMissionCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Financial Entries ---
  const addFinancialEntry = async (entry) => {
    const validation = validateMutation("financialEntry", "add", entry?.id, {
      data: entry,
      newData: entry,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    console.log('[DataContext.addFinancialEntry] Incoming entry:', entry);

    // Map status from French to English
    const statusMap = {
      "Brouillon": "pending",
      "draft": "pending",
      "Confirmé": "posted",
      "confirmed": "posted",
      "Payé": "paid",
      "paid": "paid",
      "Annulé": "cancelled",
      "cancelled": "cancelled",
    };

    // Map type: frontend uses "revenue"/"expense", backend uses "income"/"expense"
    const entryType = entry.type || entry.entry_type || entry.category;
    const backendType = entryType === "revenue" ? "income" : "expense";

    // Map frontend field names to backend expectations
    const payload = {
      scope: entry.scope || "client", // Default to client scope if not specified
      client_id: emptyToNull(entry.clientId || entry.client_id),
      dossier_id: emptyToNull(entry.dossierId || entry.dossier_id),
      case_id: emptyToNull(entry.caseId || entry.case_id),
      mission_id: emptyToNull(entry.missionId || entry.mission_id),
      entry_type: backendType,
      status: statusMap[entry.status] || entry.status || "pending",
      category: emptyToNull(entry.category),
      amount: entry.amount,
      currency: entry.currency || "TND",
      due_date: emptyToNull(entry.dueDate || entry.due_date || entry.date),
      paid_at: emptyToNull(entry.paidAt || entry.paid_at),
      title: emptyToNull(entry.title),
      description: emptyToNull(entry.description),
      reference: emptyToNull(entry.reference),
    };

    console.log('[DataContext.addFinancialEntry] Sending payload:', payload);

    const created = await apiClient.post("/financial", payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptFinancialEntry(created, clientsById, dossiersById, casesById);

    setFinancialEntries((prev) => {
      const next = [...prev, adapted];
      saveToStorage("financialEntries", next);
      return next;
    });

    logCreationHistory("financialEntry", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  };

  const updateFinancialEntry = async (id, updates) => {
    const prev = financialEntries.find((e) => e.id === id);
    const validation = validateMutation("financialEntry", "edit", id, {
      data: prev,
      newData: { ...prev, ...updates },
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues);
    if (!validation.ok) return validation;

    console.log('[DataContext.updateFinancialEntry] Updating financial entry ID:', id, 'with:', updates);

    const payload = {
      client_id: updates.clientId,
      dossier_id: updates.dossierId,
      case_id: updates.caseId,
      entry_type: updates.type || updates.entryType,
      status: updates.status,
      amount: updates.amount,
      currency: updates.currency || 'TND',
      due_date: updates.dueDate,
      paid_at: updates.paidAt,
      description: updates.description,
      reference: updates.reference,
    };

    // Remove undefined values
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updated = await apiClient.put(`/financial/${id}`, payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const casesById = Object.fromEntries(cases.map((c) => [c.id, c]));
    const adapted = adaptFinancialEntry(updated, clientsById, dossiersById, casesById);

    setFinancialEntries((prev) => {
      const next = prev.map((entry) =>
        entry.id === id ? adapted : entry
      );
      saveToStorage("financialEntries", next);
      return next;
    });

    logUpdateHistory("financialEntry", prev, updates, actorName);
    logStatusHistory("financialEntry", prev, updates, actorName);

    return validation;
  };

  const deleteFinancialEntry = async (id, { skipConfirmation = false } = {}) => {
    const prev = financialEntries.find((e) => e.id === id);
    const validation = validateMutation("financialEntry", "delete", id, {
      data: prev,
      entities: { clients, dossiers, cases, tasks, sessions, officers, missions, financialEntries }
    }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    console.log('[DataContext.deleteFinancialEntry] Deleting financial entry ID:', id);

    await apiClient.delete(`/financial/${id}`);

    // Delete history for this financial entry
    await deleteEntityHistory('financial_entry', id);

    setFinancialEntries((prev) => {
      const next = prev.filter((entry) => entry.id !== id);
      saveToStorage("financialEntries", next);
      return next;
    });

    logDeletionHistory("financialEntry", prev, actorName);
    return { ok: true, result: validation.result };
  };

  const value = useMemo(
    () => ({
      clients,
      dossiers,
      cases,
      sessions,
      tasks,
      missions,
      personalTasks,
      officers,
      financialEntries,
      loading,
      loadError,
      addClient,
      updateClient,
      deleteClient,
      deleteClientCascade,
      addDossier,
      updateDossier,
      deleteDossier,
      deleteDossierCascade,
      addCase,
      updateCase,
      deleteCase,
      deleteCaseCascade,
      addSession,
      updateSession,
      deleteSession,
      addTask,
      updateTask,
      deleteTask,
      addPersonalTask,
      updatePersonalTask,
      deletePersonalTask,
      addOfficer,
      updateOfficer,
      deleteOfficer,
      deleteOfficerCascade,
      addMission,
      updateMission,
      deleteMission,
      deleteMissionCascade,
      addFinancialEntry,
      updateFinancialEntry,
      deleteFinancialEntry,
      integrityIssues,
      reconciled,
    }),
    [
      clients,
      dossiers,
      cases,
      sessions,
      tasks,
      missions,
      personalTasks,
      officers,
      financialEntries,
      loading,
      loadError,
      integrityIssues,
      reconciled,
    ]
  );

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error("useData must be used within a DataProvider");
  }
  return context;
};
