import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { useRef } from "react";
import { logHistoryEvent, EVENT_TYPES, deleteEntityHistory } from "../services/historyService";
import { canPerformAction } from "../services/domainRules";
import { useToast } from "./ToastContext";
import { useConfirm } from "./ConfirmContext";
import { logEntityCreation, logLifecycleChange, logStatusChange } from "../services/historyService";
import { apiClient } from "../services/api/client";
import { adaptHistory } from "../services/api/adapters";
import { useTranslation } from "react-i18next";
import { useSettings } from "./SettingsContext";
import { useOperator } from "./OperatorContext";
import { useLicense } from "./LicenseContext";
import { checkFreePlanLimit } from "../services/licenseService";
import {
  adaptLawsuit,
  adaptClient,
  adaptDossier,
  adaptSession,
  adaptTask,
  adaptOfficer,
  adaptFinancialEntry,
  adaptMission,
  adaptPersonalTask,
} from "../services/api/adapters";
import { subscribeEntityMutationSuccess } from "../core/mutationSync";

const DataContext = createContext(null);
const STORAGE_PREFIX = "lawyer-app:data:";
const MUTATION_ENTITY_ROUTE_MAP = {
  client: "/clients",
  dossier: "/dossiers",
  lawsuit: "/lawsuits",
  task: "/tasks",
  session: "/sessions",
  mission: "/missions",
  officer: "/officers",
  financial_entry: "/financial",
  personal_task: "/personal-tasks",
};

const upsertEntityById = (list, item) => {
  if (!item || item.id == null) return list;
  const next = Array.isArray(list) ? [...list] : [];
  const idx = next.findIndex((row) => Number(row?.id) === Number(item.id));
  if (idx >= 0) {
    next[idx] = item;
    return next;
  }
  return [item, ...next];
};

const removeEntityById = (list, id) =>
  (Array.isArray(list) ? list : []).filter((row) => Number(row?.id) !== Number(id));

/**
 * Convert notes array from frontend format (camelCase) to backend format (snake_case)
 * This ensures the backend can properly identify existing notes by their IDs
 */
const notesToBackendFormat = (notes) => {
  if (notes === undefined || notes === null) return notes;
  if (typeof notes === "string") {
    const trimmed = notes.trim();
    return trimmed ? [{ content: trimmed }] : [];
  }
  if (!Array.isArray(notes)) return notes;

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

/**
 * Build a change summary for parent history events
 * Returns { label, changes } where changes contains the field-level diff
 */
const buildChangeSummary = (entityType, entityName, prevEntity, updates) => {
  if (!prevEntity || !updates) return null;

  const changes = {};
  const changeParts = [];

  // Track important field changes
  const fieldLabels = {
    status: "Statut",
    title: "Titre",
    amount: "Montant",
    session_type: "Type",
    scheduled_at: "Date prévue",
    session_date: "Date",
    location: "Lieu",
    outcome: "Résultat",
    priority: "Priorité",
    due_date: "Échéance",
    assigned_to: "Assigné à",
    description: "Description",
  };

  Object.entries(updates).forEach(([key, newVal]) => {
    const oldVal = prevEntity[key];
    if (oldVal === newVal) return;
    if (newVal === undefined) return;

    // Store raw change for metadata
    changes[`previous_${key}`] = oldVal;
    changes[`new_${key}`] = newVal;

    // Build human-readable part for important fields
    if (fieldLabels[key]) {
      if (key === "status") {
        changeParts.push(`${fieldLabels[key]}: ${oldVal || "-"} → ${newVal}`);
      } else if (key === "amount") {
        changeParts.push(`${fieldLabels[key]}: ${oldVal || 0} → ${newVal}`);
      } else {
        changeParts.push(fieldLabels[key]);
      }
    }
  });

  if (Object.keys(changes).length === 0) return null;

  // Build descriptive label
  let label;
  if (changeParts.length > 0) {
    label = `${entityType} modifié: ${entityName} (${changeParts.slice(0, 2).join(", ")}${changeParts.length > 2 ? "..." : ""})`;
  } else {
    label = `${entityType} modifié: ${entityName}`;
  }

  return { label, changes };
};

const logCreationHistory = (entityType, entity, actor = null) => {
  if (!entity?.id) return;
  const name = entity.name || entity.title || entity.lawsuitNumber || entity.description || `#${entity.id}`;
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

const isReadOnlyImport = (entity) =>
  entity?.imported === true && entity?.validated === false;

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

const reconcileEntities = (clients, dossiers, lawsuits, tasks, sessions) => {
  const issues = [];

  const byId = (arr) => new Map(arr.map((item) => [item.id, item]));

  const clientsById = byId(clients);
  const dossiersById = byId(dossiers);
  const lawsuitsById = byId(lawsuits);

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

  const normalizedLawsuits = lawsuits.map((c) => {
    const normalized = {
      ...c,
      id: normalizeId(c.id),
      dossierId: normalizeId(c.dossierId),
    };
    if (normalized.dossierId && !dossiersById.has(normalized.dossierId)) {
      issues.push({
        entityType: "lawsuit",
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
      lawsuitId: normalizeId(t.lawsuitId),
    };
    if (normalized.parentType === "lawsuit" && normalized.lawsuitId && !lawsuitsById.has(normalized.lawsuitId)) {
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
      lawsuitId: normalizeId(s.lawsuitId),
    };
    if (normalized.lawsuitId && !lawsuitsById.has(normalized.lawsuitId)) {
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
    normalizedLawsuits,
    normalizedTasks,
    normalizedSessions,
    issues,
  };
};

export function DataProvider({ children }) {
  const { showToast } = useToast();
  const { t } = useTranslation(["common", "license"]);
  const { currency, formatCurrency } = useSettings();
  const { operator } = useOperator();
  const { licenseState } = useLicense();
  const { confirm } = useConfirm();
  const showToastRef = useRef(showToast);
  const tRef = useRef(t);

  // State is initialized from localStorage and then updated from backend
  const [clients, setClients] = useState(() => loadFromStorage("clients", []));
  const [dossiers, setDossiers] = useState(() => loadFromStorage("dossiers", []));
  const [lawsuits, setLawsuits] = useState(() => loadFromStorage("lawsuits", []));
  const [sessions, setSessions] = useState(() => loadFromStorage("sessions", []));
  const [tasks, setTasks] = useState(() => loadFromStorage("tasks", []));
  const [missions, setMissions] = useState(() => loadFromStorage("missions", []));
  const [personalTasks, setPersonalTasks] = useState(() => loadFromStorage("personalTasks", []));
  const [officers, setOfficers] = useState(() => loadFromStorage("officers", []));
  const [financialEntries, setFinancialEntries] = useState(() => loadFromStorage("financial", []));
  const [integrityIssues, setIntegrityIssues] = useState([]);

  // Debounce localStorage writes to prevent UI freezes (1 write per second max per entity type)
  const saveTimersRef = useRef({});
  const debouncedSaveToStorage = useCallback((key, value) => {
    if (saveTimersRef.current[key]) clearTimeout(saveTimersRef.current[key]);
    saveTimersRef.current[key] = setTimeout(() => {
      saveToStorage(key, value);
      delete saveTimersRef.current[key];
    }, 1000);
  }, []);
  const [reconciled, setReconciled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [syncTick, setSyncTick] = useState(0);
  const entityCacheRef = useRef({
    clients: [],
    dossiers: [],
    lawsuits: [],
    tasks: [],
    sessions: [],
    missions: [],
    officers: [],
    financialEntries: [],
    personalTasks: [],
  });

  const isLicenseLocked = useMemo(
    () => ["ACTIVATING", "ERROR"].includes(licenseState),
    [licenseState]
  );
  const blockWrite = useCallback(
    (actionLabel) => {
      if (!isLicenseLocked) return false;
      const translate = tRef.current || t;
      showToastRef.current(translate("license:toast.inactive.message"), "error", {
        title: translate("license:toast.inactive.title"),
        addToBell: false,
      });
      console.warn(`[DataContext] ${actionLabel} blocked: license inactive`);
      return true;
    },
    [isLicenseLocked, t]
  );

  const blockFreeLimit = useCallback(
    (entityType, entityData) => {
      const limitResult = checkFreePlanLimit({
        licenseState,
        clients,
        dossiers,
        lawsuits,
        tasks,
        entityType,
        entityData,
      });
      if (limitResult.allowed) return false;
      const translate = tRef.current || t;
      const message = translate("license:freeLimit.message", {
        label: limitResult.label,
        limit: limitResult.limit,
      });
      confirm({
        title: translate("license:freeLimit.title"),
        message,
        confirmText: translate("license:freeLimit.confirm"),
        cancelText: translate("license:freeLimit.cancel"),
        variant: "warning",
      }).then((accepted) => {
        if (accepted && typeof window !== "undefined") {
          window.location.href = "/settings?tab=security";
        }
      });
      console.warn(`[DataContext] ${entityType} blocked: free plan limit reached`);
      return { ok: false, result: { message, limit: limitResult.limit, current: limitResult.current } };
    },
    [confirm, clients, dossiers, licenseState, lawsuits, tasks, t]
  );

  // Get operator name for history attribution
  const actorName = operator?.name || null;

  const entities = useMemo(
    () => ({
      clients,
      dossiers,
      lawsuits,
      sessions,
      tasks,
      missions,
      personalTasks,
      officers,
      financialEntries,
    }),
    [
      clients,
      dossiers,
      lawsuits,
      sessions,
      tasks,
      missions,
      personalTasks,
      officers,
      financialEntries,
    ]
  );

  useEffect(() => {
    entityCacheRef.current = {
      clients,
      dossiers,
      lawsuits,
      tasks,
      sessions,
      missions,
      officers,
      financialEntries,
      personalTasks,
    };
  }, [
    clients,
    dossiers,
    lawsuits,
    tasks,
    sessions,
    missions,
    officers,
    financialEntries,
    personalTasks,
  ]);

  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  useEffect(() => {
    tRef.current = t;
  }, [t]);

  // Read-only fetch from backend (PARALLEL LOADING for 3-5x faster startup)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        // WAVE 1: Independent entities (load in parallel)
        const [apiClients, apiOfficers, apiPersonalTasks] = await Promise.all([
          apiClient.get("/clients"),
          apiClient.get("/officers"),
          apiClient.get("/personal-tasks"),
        ]);

        const clientsAdapted = apiClients.map(adaptClient);
        const clientsById = Object.fromEntries(clientsAdapted.map((c) => [c.id, c]));
        const officersAdapted = apiOfficers.map(adaptOfficer);
        const officersById = Object.fromEntries(officersAdapted.map((o) => [o.id, o]));
        const personalTasksAdapted = apiPersonalTasks.map(adaptPersonalTask);

        // WAVE 2: Entities depending on clients (load in parallel)
        const [apiDossiers, apiLawsuits] = await Promise.all([
          apiClient.get("/dossiers"),
          apiClient.get("/lawsuits"),
        ]);

        const dossiersAdapted = apiDossiers.map((d) => adaptDossier(d, clientsById));
        const dossiersById = Object.fromEntries(dossiersAdapted.map((d) => [d.id, d]));
        const lawsuitsAdapted = apiLawsuits.map((c) => adaptLawsuit(c, dossiersById));
        const lawsuitsById = Object.fromEntries(lawsuitsAdapted.map((c) => [c.id, c]));

        // WAVE 3: Entities depending on dossiers/lawsuits (load in parallel)
        const [apiTasks, apiSessions, apiMissions, apiFinancial, apiHistoryClients] = await Promise.all([
          apiClient.get("/tasks"),
          apiClient.get("/sessions"),
          apiClient.get("/missions"),
          apiClient.get("/financial"),
          apiClient.get("/history?entity_type=client"),
        ]);

        const tasksAdapted = apiTasks.map((t) => adaptTask(t, dossiersById, lawsuitsById));
        const sessionsAdapted = apiSessions.map((s) => adaptSession(s, dossiersById, lawsuitsById));
        const missionsAdapted = apiMissions.map((m) => adaptMission(m, dossiersById, lawsuitsById));
        const missionsWithOfficer = missionsAdapted.map((mission) => ({
          ...mission,
          officerName: mission.officerId ? officersById[mission.officerId]?.name || "" : "",
        }));
        const financialAdapted = apiFinancial.map((f) =>
          adaptFinancialEntry(f, clientsById, dossiersById, lawsuitsById)
        );
        const historyClientsAdapted = apiHistoryClients.map(adaptHistory);
        const historyByClient = historyClientsAdapted.reduce((acc, evt) => {
          if (!acc[evt.entityId]) acc[evt.entityId] = [];
          acc[evt.entityId].push(evt.timelineEntry);
          return acc;
        }, {});

        const missionsByOfficer = {};
        const missionsByDossier = {};
        const missionsByLawsuit = {};

        missionsWithOfficer.forEach((mission) => {
          if (mission.officerId) {
            missionsByOfficer[mission.officerId] = missionsByOfficer[mission.officerId] || [];
            missionsByOfficer[mission.officerId].push(mission);
          }
          if (mission.entityType === "dossier" && mission.entityId) {
            missionsByDossier[mission.entityId] = missionsByDossier[mission.entityId] || [];
            missionsByDossier[mission.entityId].push(mission);
          }
          if (mission.entityType === "lawsuit" && mission.entityId) {
            missionsByLawsuit[mission.entityId] = missionsByLawsuit[mission.entityId] || [];
            missionsByLawsuit[mission.entityId].push(mission);
          }
        });

        const officersWithMissions = officersAdapted.map((officer) => ({
          ...officer,
          missions: missionsByOfficer[officer.id] || [],
        }));

        const {
          normalizedClients,
          normalizedDossiers,
          normalizedLawsuits,
          normalizedTasks,
          normalizedSessions,
          issues,
        } = reconcileEntities(
          clientsAdapted,
          dossiersAdapted,
          lawsuitsAdapted,
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

        const lawsuitsWithMissions = normalizedLawsuits.map((lawsuitItem) => ({
          ...lawsuitItem,
          missions: missionsByLawsuit[lawsuitItem.id] || lawsuitItem.missions || [],
        }));

        if (cancelled) return;

        setClients(clientsWithTimeline);
        setDossiers(dossiersWithMissions);
        setLawsuits(lawsuitsWithMissions);
        setTasks(normalizedTasks);
        setSessions(normalizedSessions);
        setPersonalTasks(personalTasksAdapted);
        setMissions(missionsWithOfficer);
        setOfficers(officersWithMissions);
        setFinancialEntries(financialAdapted);
        saveToStorage("clients", clientsWithTimeline);
        saveToStorage("dossiers", dossiersWithMissions);
        saveToStorage("lawsuits", lawsuitsWithMissions);
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
        console.error("[DataContext] API load failed!");
        console.error("[DataContext] Error name:", error?.name);
        console.error("[DataContext] Error message:", error?.message);
        console.error("[DataContext] Full error:", error);
        setLoadError(error.message || "Loading Error");
        showToastRef.current(tRef.current("data.toast.error.loadRemote"), "error");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, [syncTick]);

  const applyTargetedMutationSync = useCallback(
    async (event) => {
      const entityType = String(event?.entityType || "").trim().toLowerCase();
      const operation = String(event?.operation || "update").trim().toLowerCase();
      const entityId = Number(event?.entityId || 0);
      if (!entityType) return true;

      if (operation === "delete" && Number.isInteger(entityId) && entityId > 0) {
        if (entityType === "client") {
          setClients((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("clients", next);
            return next;
          });
          return true;
        }
        if (entityType === "dossier") {
          setDossiers((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("dossiers", next);
            return next;
          });
          return true;
        }
        if (entityType === "lawsuit") {
          setLawsuits((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("lawsuits", next);
            return next;
          });
          return true;
        }
        if (entityType === "task") {
          setTasks((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("tasks", next);
            return next;
          });
          return true;
        }
        if (entityType === "session") {
          setSessions((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("sessions", next);
            return next;
          });
          return true;
        }
        if (entityType === "mission") {
          setMissions((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("missions", next);
            return next;
          });
          return true;
        }
        if (entityType === "officer") {
          setOfficers((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("officers", next);
            return next;
          });
          return true;
        }
        if (entityType === "financial_entry") {
          setFinancialEntries((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("financial", next);
            return next;
          });
          return true;
        }
        if (entityType === "personal_task") {
          setPersonalTasks((prev) => {
            const next = removeEntityById(prev, entityId);
            debouncedSaveToStorage("personalTasks", next);
            return next;
          });
          return true;
        }
        return true;
      }

      const route = MUTATION_ENTITY_ROUTE_MAP[entityType];
      if (!route) return true;
      if (!Number.isInteger(entityId) || entityId <= 0) return false;

      let fetched;
      try {
        fetched = await apiClient.get(`${route}/${entityId}`);
      } catch {
        return false;
      }

      const current = entityCacheRef.current || {};
      const clientsById = Object.fromEntries((current.clients || []).map((row) => [row.id, row]));
      const dossiersById = Object.fromEntries((current.dossiers || []).map((row) => [row.id, row]));
      const lawsuitsById = Object.fromEntries((current.lawsuits || []).map((row) => [row.id, row]));

      if (entityType === "client") {
        const adapted = adaptClient(fetched);
        setClients((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("clients", next);
          return next;
        });
        return true;
      }

      if (entityType === "dossier") {
        const adapted = adaptDossier(fetched, clientsById);
        setDossiers((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("dossiers", next);
          return next;
        });
        return true;
      }

      if (entityType === "lawsuit") {
        const adapted = adaptLawsuit(fetched, dossiersById);
        setLawsuits((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("lawsuits", next);
          return next;
        });
        return true;
      }

      if (entityType === "task") {
        const adapted = adaptTask(fetched, dossiersById, lawsuitsById);
        setTasks((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("tasks", next);
          return next;
        });
        return true;
      }

      if (entityType === "session") {
        const adapted = adaptSession(fetched, dossiersById, lawsuitsById);
        setSessions((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("sessions", next);
          return next;
        });
        return true;
      }

      if (entityType === "mission") {
        const adapted = adaptMission(fetched, dossiersById, lawsuitsById);
        setMissions((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("missions", next);
          return next;
        });
        return true;
      }

      if (entityType === "officer") {
        const adapted = adaptOfficer(fetched);
        setOfficers((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("officers", next);
          return next;
        });
        return true;
      }

      if (entityType === "financial_entry") {
        const adapted = adaptFinancialEntry(fetched, clientsById, dossiersById, lawsuitsById);
        setFinancialEntries((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("financial", next);
          return next;
        });
        return true;
      }

      if (entityType === "personal_task") {
        const adapted = adaptPersonalTask(fetched);
        setPersonalTasks((prev) => {
          const next = upsertEntityById(prev, adapted);
          debouncedSaveToStorage("personalTasks", next);
          return next;
        });
        return true;
      }

      return false;
    },
    [debouncedSaveToStorage],
  );

  // Global mutation sync subscription:
  // 1) apply targeted entity refresh immediately for UX responsiveness
  // 2) fallback to full context reload when targeted sync misses/fails
  useEffect(() => {
    let flushTimer = null;
    let fallbackTimer = null;
    let running = false;
    const queue = [];

    const scheduleFallbackReload = () => {
      if (fallbackTimer) clearTimeout(fallbackTimer);
      fallbackTimer = setTimeout(() => {
        setSyncTick((prev) => prev + 1);
      }, 80);
    };

    const flushQueue = async () => {
      if (running) return;
      if (queue.length === 0) return;
      running = true;
      const batch = queue.splice(0, queue.length);
      const deduped = new Map();
      for (const event of batch) {
        const key = `${String(event?.entityType || "")}:${String(event?.entityId ?? "null")}:${String(event?.operation || "update")}`;
        deduped.set(key, event);
      }
      const results = await Promise.all(
        [...deduped.values()].map((event) =>
          applyTargetedMutationSync(event).catch(() => false),
        ),
      );
      running = false;
      if (results.some((ok) => ok !== true)) {
        scheduleFallbackReload();
      }
      if (queue.length > 0) {
        if (flushTimer) clearTimeout(flushTimer);
        flushTimer = setTimeout(() => {
          void flushQueue();
        }, 30);
      }
    };

    const unsubscribe = subscribeEntityMutationSuccess((event) => {
      queue.push(event);
      if (flushTimer) clearTimeout(flushTimer);
      flushTimer = setTimeout(() => {
        void flushQueue();
      }, 30);
    });

    return () => {
      if (flushTimer) clearTimeout(flushTimer);
      if (fallbackTimer) clearTimeout(fallbackTimer);
      unsubscribe();
    };
  }, [applyTargetedMutationSync]);

  // --- Clients ---
  const addClient = useCallback(async (client) => {
    if (blockWrite("add client")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const limitBlock = blockFreeLimit("client", client);
    if (limitBlock) return limitBlock;
    const validation = validateMutation("client", "add", client?.id, {
      data: client,
      newData: client,
      entities,
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
      notes: notesToBackendFormat(client.notes),
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
      debouncedSaveToStorage("clients", next);
      return next;
    });

    logCreationHistory("client", created, actorName);
    return { ok: true, result: validation.result, created: adaptedWithTimeline };
  }, [actorName, blockFreeLimit, blockWrite, entities, integrityIssues]);

  const updateClient = useCallback(async (id, updates) => {
    if (blockWrite("update client")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = clients.find((c) => c.id === id);
    const validation = validateMutation("client", "edit", id, {
      data: prev,
      newData: { ...prev, ...updates },
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

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
      notes: updates.notes !== undefined ? notesToBackendFormat(updates.notes) : undefined,
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
      debouncedSaveToStorage("clients", next);
      return next;
    });
    logUpdateHistory("client", prev, updates, actorName);
    logStatusHistory("client", prev, updates, actorName);

    return validation;
  }, [actorName, blockWrite, clients, entities, integrityIssues]);

  const deleteClient = useCallback(async (id) => {
    if (blockWrite("delete client")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = clients.find((c) => c.id === id);
    const validation = validateMutation("client", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/clients/${id}`);

    // Delete history for this client
    await deleteEntityHistory('client', id);

    setClients((prev) => {
      const next = prev.filter((client) => client.id !== id);
      debouncedSaveToStorage("clients", next);
      return next;
    });

    logDeletionHistory("client", prev, actorName);
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, clients, entities, integrityIssues]);

  /**
   * CASCADE DELETE: Delete client and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteClientCascade = async (id) => {
    if (blockWrite("delete client cascade")) {
      return { ok: false, result: { message: "License inactive" } };
    }
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
        debouncedSaveToStorage("clients", next);
        return next;
      });

      const prev = clients.find((c) => c.id === id);
      logDeletionHistory("client", prev, actorName);

      return { ok: true, result: { message: 'Client and all child entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteClientCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Dossiers ---
  const addDossier = useCallback(async (dossier) => {
    if (blockWrite("add dossier")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const limitBlock = blockFreeLimit("dossier", dossier);
    if (limitBlock) return limitBlock;
    const validation = validateMutation("dossier", "add", dossier?.id, {
      data: dossier,
      newData: dossier,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const payload = {
      reference: dossier.reference || dossier.lawsuitNumber,
      lawsuit_number: dossier.lawsuitNumber || dossier.reference,
      client_id: dossier.clientId || dossier.client_id || dossier.client?.id,
      title: dossier.title,
      description: dossier.description,
      category: dossier.category,
      phase: dossier.phase,
      adversary_party: dossier.adversaryParty || dossier.adversary_party || dossier.adversary,
      adversary_name: dossier.adversaryName || dossier.adversary_name || dossier.adversaryParty || dossier.adversary_party || dossier.adversary,
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
      debouncedSaveToStorage("dossiers", next);
      return next;
    });

    logCreationHistory("dossier", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockFreeLimit, blockWrite, clients, entities, integrityIssues]);

  const updateDossier = useCallback(async (id, updates, skipConfirmation = false) => {
    if (blockWrite("update dossier")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = dossiers.find((d) => d.id === id);
    const validation = validateMutation("dossier", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    // 🚨 CRITICAL FIX: Build payload with ONLY the fields present in updates (PATCH semantics)
    const payload = {};

    if (updates.lawsuitNumber !== undefined || updates.reference !== undefined) {
      const refValue = updates.lawsuitNumber || updates.reference;
      payload.reference = refValue;
      payload.lawsuit_number = refValue;
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
    if (updates.adversaryName !== undefined || updates.adversary_name !== undefined || updates.adversaryParty !== undefined || updates.adversary_party !== undefined || updates.adversary !== undefined) {
      payload.adversary_name =
        updates.adversaryName ||
        updates.adversary_name ||
        updates.adversaryParty ||
        updates.adversary_party ||
        updates.adversary;
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

    const updated = await apiClient.put(`/dossiers/${id}`, payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const adapted = adaptDossier(updated, clientsById);

    setDossiers((prev) => {
      const next = prev.map((dossier) =>
        dossier.id === id ? adapted : dossier
      );
      debouncedSaveToStorage("dossiers", next);
      return next;
    });
    logUpdateHistory("dossier", prev, updates, actorName);
    logStatusHistory("dossier", prev, updates, actorName);

    return validation;
  }, [actorName, blockWrite, clients, dossiers, integrityIssues]);

  const deleteDossier = useCallback(async (id) => {
    if (blockWrite("delete dossier")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = dossiers.find((d) => d.id === id);
    const validation = validateMutation("dossier", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/dossiers/${id}`);

    // Delete history for this dossier
    await deleteEntityHistory('dossier', id);

    setDossiers((prev) => {
      const next = prev.filter((dossier) => dossier.id !== id);
      debouncedSaveToStorage("dossiers", next);
      return next;
    });

    logDeletionHistory("dossier", prev, actorName);
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, dossiers, entities, integrityIssues]);

  /**
   * CASCADE DELETE: Delete dossier and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteDossierCascade = async (id) => {
    if (blockWrite("delete dossier cascade")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    try {
      // Find all related lawsuits
      const dossierLawsuits = lawsuits.filter(lawsuit => String(lawsuit.dossierId) === String(id));

      // Delete each lawsuit (which will cascade delete its children and their history)
      for (const lawsuitItem of dossierLawsuits) {
        await deleteLawsuitCascade(lawsuitItem.id);
      }

      // Find and delete all missions for this dossier
      const dossierMissions = missions.filter(m => String(m.dossierId) === String(id));
      for (const mission of dossierMissions) {
        await deleteMissionCascade(mission.id);
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
      const dossierSessions = sessions.filter(s => String(s.dossierId) === String(id) && !s.lawsuitId);
      for (const session of dossierSessions) {
        await deleteSession(session.id);
        // Delete history for each session
        await deleteEntityHistory('session', session.id);
      }

      // Find and delete all financial entries for this dossier
      const dossierFinancials = financialEntries.filter(e => String(e.dossierId) === String(id)
        && !e.missionId
        && !e.lawsuitId
        && !e.taskId);
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
        debouncedSaveToStorage("dossiers", next);
        return next;
      });

      const prev = dossiers.find((d) => d.id === id);
      logDeletionHistory("dossier", prev, actorName);

      return { ok: true, result: { message: 'Dossier and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteDossierCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Lawsuits ---
  const addLawsuit = useCallback(async (lawsuitItem) => {
    if (blockWrite("add lawsuit")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const limitBlock = blockFreeLimit("lawsuit", lawsuitItem);
    if (limitBlock) return limitBlock;
    const validation = validateMutation("lawsuit", "add", lawsuitItem?.id, {
      data: lawsuitItem,
      newData: lawsuitItem,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    // Helper to convert empty strings to null
    const emptyToNull = (value) => (value === "" || value === undefined) ? null : value;

    const payload = {
      dossier_id: lawsuitItem.dossierId || lawsuitItem.dossier_id,
      title: lawsuitItem.title,
      description: emptyToNull(lawsuitItem.description),
      adversary: emptyToNull(lawsuitItem.adversaire || lawsuitItem.adversary),
      adversary_party: emptyToNull(lawsuitItem.adversaryParty || lawsuitItem.adversary_party),
      adversary_name: emptyToNull(
        lawsuitItem.adversaryName ||
        lawsuitItem.adversary_name ||
        lawsuitItem.adversaryParty ||
        lawsuitItem.adversary_party ||
        lawsuitItem.adversaire ||
        lawsuitItem.adversary
      ),
      adversary_lawyer: emptyToNull(lawsuitItem.adversaryLawyer || lawsuitItem.adversary_lawyer),
      court: emptyToNull(lawsuitItem.court),
      filing_date: emptyToNull(lawsuitItem.filingDate),
      next_hearing: emptyToNull(lawsuitItem.nextHearing),
      judgment_number: emptyToNull(lawsuitItem.judgmentNumber || lawsuitItem.judgment_number),
      judgment_date: emptyToNull(lawsuitItem.judgmentDate || lawsuitItem.judgment_date),
      reference_number: emptyToNull(lawsuitItem.courtReference || lawsuitItem.reference_number),
      status: lawsuitItem.status,
      priority: lawsuitItem.priority === "High" ? "high" : lawsuitItem.priority === "Medium" ? "medium" : lawsuitItem.priority === "Low" ? "low" : lawsuitItem.priority,
      opened_at: emptyToNull(lawsuitItem.openDate),
      reference: emptyToNull(lawsuitItem.lawsuitNumber),
      lawsuit_number: emptyToNull(lawsuitItem.lawsuitNumber),
    };

    const created = await apiClient.post("/lawsuits", payload);
    const adapted = adaptLawsuit(created, Object.fromEntries(dossiers.map((d) => [d.id, d])));
    const translate = tRef.current || t;

    setLawsuits((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("lawsuits", next);
      if (adapted.dossierId) {
        const title = adapted.title || "";
        const reference = adapted.lawsuitNumber || "";
        const lawsuitDescription = title && reference ? `${title} (${reference})` : title || reference || translate("entities.lawsuits");
        logHistoryEvent({
          entityType: "dossier",
          entityId: adapted.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: `${translate("detail.history.labels.lawsuitCreated")}: ${lawsuitDescription}`,
          details: `${translate("detail.history.labels.lawsuitCreated")}: ${lawsuitDescription}`,
          metadata: {
            childType: "lawsuit",
            childId: adapted.id,
          },
        });
      }
      return next;
    });

    logCreationHistory("lawsuit", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockFreeLimit, blockWrite, dossiers, entities, integrityIssues, t]);

  const updateLawsuit = useCallback(async (id, updates) => {
    if (blockWrite("update lawsuit")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = lawsuits.find((c) => c.id === id);
    const validation = validateMutation("lawsuit", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

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
    if (
      updates.adversaryName !== undefined ||
      updates.adversary_name !== undefined ||
      updates.adversaryParty !== undefined ||
      updates.adversary_party !== undefined ||
      updates.adversaire !== undefined ||
      updates.adversary !== undefined
    ) {
      payload.adversary_name = emptyToNull(
        updates.adversaryName ||
        updates.adversary_name ||
        updates.adversaryParty ||
        updates.adversary_party ||
        updates.adversaire ||
        updates.adversary
      );
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
    if (updates.judgmentNumber !== undefined || updates.judgment_number !== undefined) {
      payload.judgment_number = emptyToNull(updates.judgmentNumber || updates.judgment_number);
    }
    if (updates.judgmentDate !== undefined || updates.judgment_date !== undefined) {
      payload.judgment_date = emptyToNull(updates.judgmentDate || updates.judgment_date);
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
    if (updates.lawsuitNumber !== undefined) {
      payload.reference = emptyToNull(updates.lawsuitNumber);
      payload.lawsuit_number = emptyToNull(updates.lawsuitNumber);
    }
    if (updates.notes !== undefined) {
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    const updated = await apiClient.put(`/lawsuits/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const adapted = adaptLawsuit(updated, dossiersById);

    setLawsuits((prev) => {
      const next = prev.map((lawsuitItem) =>
        lawsuitItem.id === id ? adapted : lawsuitItem
      );
      debouncedSaveToStorage("lawsuits", next);
      return next;
    });
    logUpdateHistory("lawsuit", prev, updates, actorName);
    logStatusHistory("lawsuit", prev, updates, actorName);

    // Log to parent dossier with change details
    if (adapted.dossierId) {
      const lawsuitTitle = adapted.title || adapted.lawsuitNumber || prev?.title || "lawsuit";
      const changeSummary = buildChangeSummary("Affaire", lawsuitTitle, prev, updates);
      const lawsuitUpdateLabel = changeSummary?.label || `Affaire modifiée: ${lawsuitTitle}`;
      const changeMetadata = changeSummary?.changes || {};
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: lawsuitUpdateLabel,
        details: lawsuitUpdateLabel,
        metadata: { childType: "lawsuit", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }

    return validation;
  }, [actorName, blockWrite, dossiers, integrityIssues, lawsuits]);

  const deleteLawsuit = useCallback(async (id) => {
    if (blockWrite("delete lawsuit")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = lawsuits.find((c) => c.id === id);
    const validation = validateMutation("lawsuit", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/lawsuits/${id}`);

    // Delete history for this lawsuit
    await deleteEntityHistory('lawsuit', id);

    setLawsuits((prev) => {
      const next = prev.filter((lawsuitItem) => lawsuitItem.id !== id);
      debouncedSaveToStorage("lawsuits", next);
      return next;
    });

    logDeletionHistory("lawsuit", prev, actorName);
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, lawsuits]);

  /**
   * CASCADE DELETE: Delete lawsuit and all related entities
   * Called when user confirms force delete from BlockerModal
   */
  const deleteLawsuitCascade = async (id) => {
    if (blockWrite("delete lawsuit cascade")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    try {
      // Find and delete all missions for this lawsuit
      const lawsuitMissions = missions.filter(m => String(m.lawsuitId) === String(id));
      for (const mission of lawsuitMissions) {
        await deleteMission(mission.id);
        // Delete history for each mission
        await deleteEntityHistory('mission', mission.id);
      }

      // Find and delete all sessions for this lawsuit
      const lawsuitSessions = sessions.filter(s => String(s.lawsuitId) === String(id));
      for (const session of lawsuitSessions) {
        await deleteSession(session.id);
        // Delete history for each session
        await deleteEntityHistory('session', session.id);
      }

      // Find and delete all tasks for this lawsuit
      const lawsuitTasks = tasks.filter(t => t.parentType === 'lawsuit' && String(t.lawsuitId) === String(id));
      for (const task of lawsuitTasks) {
        await deleteTask(task.id);
        // Delete history for each task
        await deleteEntityHistory('task', task.id);
      }

      // Delete the lawsuit from backend
      await apiClient.delete(`/lawsuits/${id}`);

      // Delete all history for this lawsuit
      await deleteEntityHistory('lawsuit', id);

      setLawsuits((prev) => {
        const next = prev.filter((lawsuitItem) => lawsuitItem.id !== id);
        debouncedSaveToStorage("lawsuits", next);
        return next;
      });

      const prev = lawsuits.find((c) => c.id === id);
      logDeletionHistory("lawsuit", prev, actorName);

      return { ok: true, result: { message: 'Case and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteLawsuitCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  // --- Sessions ---
  const addSession = useCallback(async (sessionItem) => {
    if (blockWrite("add session")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const validation = validateMutation("session", "add", sessionItem?.id, {
      data: sessionItem,
      newData: sessionItem,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

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
      session_date:
        sessionItem.sessionDate ||
        sessionItem.session_date ||
        sessionItem.date ||
        (sessionItem.scheduledAt ? sessionItem.scheduledAt.split("T")[0] : null),
      location: emptyToNull(sessionItem.location),
      court_room: emptyToNull(sessionItem.courtRoom || sessionItem.court_room),
      judge: emptyToNull(sessionItem.judge),
      duration: emptyToNull(sessionItem.duration),
      outcome: emptyToNull(sessionItem.outcome),
      description: emptyToNull(sessionItem.description),
      // Backend expects an array for notes (even if empty)
      notes: notesToBackendFormat(sessionItem.notes ?? []),
      participants: Array.isArray(sessionItem.participants) ? sessionItem.participants : emptyToNull(sessionItem.participants),
    };

    // Only include dossier_id OR lawsuit_id, not both (backend requires XOR)
    const lawsuitId = emptyToNull(sessionItem.lawsuitId || sessionItem.lawsuit_id);
    const dossierId = emptyToNull(sessionItem.dossierId || sessionItem.dossier_id);
    // Prefer explicit lawsuit linkage when both exist (e.g., hearings added from a lawsuit tab)
    if (lawsuitId) {
      payload.lawsuit_id = lawsuitId;
    } else if (dossierId) {
      payload.dossier_id = dossierId;
    }

    const created = await apiClient.post("/sessions", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptSession(created, dossiersById, lawsuitsById);

    setSessions((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("sessions", next);
      return next;
    });

    logCreationHistory("session", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockWrite, dossiers, entities, integrityIssues, lawsuits]);

  const updateSession = useCallback(async (id, updates, options = {}) => {
    if (blockWrite("update session")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const { skipConfirmation = false } = options;
    const prev = sessions.find((s) => s.id === id);
    const validation = validateMutation("session", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

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
    if (
      updates.sessionDate !== undefined ||
      updates.session_date !== undefined ||
      updates.date !== undefined ||
      updates.scheduledAt !== undefined ||
      updates.scheduled_at !== undefined
    ) {
      const derivedDate =
        updates.sessionDate ||
        updates.session_date ||
        updates.date ||
        (updates.scheduledAt ? updates.scheduledAt.split("T")[0] : null) ||
        (updates.scheduled_at ? updates.scheduled_at.split("T")[0] : null);
      payload.session_date = emptyToNull(derivedDate);
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
    if (updates.lawsuitId !== undefined || updates.lawsuit_id !== undefined) {
      payload.lawsuit_id = emptyToNull(updates.lawsuitId || updates.lawsuit_id);
    }

    // Remove undefined values (though they shouldn't be there now)
    Object.keys(payload).forEach(key => payload[key] === undefined && delete payload[key]);

    const updated = await apiClient.put(`/sessions/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptSession(updated, dossiersById, lawsuitsById);

    setSessions((prev) => {
      const next = prev.map((session) =>
        session.id === id ? adapted : session
      );
      debouncedSaveToStorage("sessions", next);
      return next;
    });
    logUpdateHistory("session", prev, updates, actorName);
    logStatusHistory("session", prev, updates, actorName);
    const sessionTitle = adapted.title || prev?.title || updates?.title || "Session";
    const changeSummary = buildChangeSummary("Session", sessionTitle, prev, updates);
    const updateLabel = changeSummary?.label || `Session modifié: ${sessionTitle}`;
    const changeMetadata = changeSummary?.changes || {};
    if (adapted.lawsuitId) {
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: adapted.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: updateLabel,
        details: updateLabel,
        metadata: { childType: "session", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(adapted.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${updateLabel} (${lawsuitRef})` : updateLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "session", relatedId: adapted.id, ...changeMetadata },
          actor: actorName,
        });
      }
    } else if (adapted.dossierId) {
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: updateLabel,
        details: updateLabel,
        metadata: { childType: "session", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }

    return validation;
  }, [actorName, blockWrite, dossiers, integrityIssues, lawsuits, sessions]);

  const deleteSession = useCallback(async (id) => {
    if (blockWrite("delete session")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = sessions.find((s) => s.id === id);
    const validation = validateMutation("session", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/sessions/${id}`);

    // Delete history for this session
    await deleteEntityHistory('session', id);

    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id);
      debouncedSaveToStorage("sessions", next);
      return next;
    });

    logDeletionHistory("session", prev, actorName);
    if (prev?.lawsuitId) {
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(prev.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const sessionTitle = prev.title || "Session";
        const deleteLabel = `Session deleted: ${sessionTitle}`;
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${deleteLabel} (${lawsuitRef})` : deleteLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "session", relatedId: prev.id },
          actor: actorName,
        });
      }
    }
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, lawsuits, sessions]);

  // --- Tasks (linked to dossiers/lawsuits) ---
  const addTask = useCallback(async (taskItem) => {
    if (blockWrite("add task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const limitBlock = blockFreeLimit("task", taskItem);
    if (limitBlock) return limitBlock;
    const validation = validateMutation("task", "add", taskItem?.id, {
      data: taskItem,
      newData: taskItem,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    const payload = {
      title: taskItem.title || "Nouvelle tâche",
      description: emptyToNull(taskItem.description),
      assigned_to: emptyToNull(taskItem.assignedTo || taskItem.assigned_to),
      due_date: emptyToNull(taskItem.dueDate || taskItem.due_date),
      estimated_time: emptyToNull(taskItem.estimatedTime || taskItem.estimated_time),
      status: taskItem.status || "Non commencee",
      priority: taskItem.priority || "Moyenne",
    };

    // Only include dossier_id OR lawsuit_id, not both (backend requires XOR)
    const lawsuitId = emptyToNull(taskItem.lawsuitId || taskItem.lawsuit_id);
    const dossierId = emptyToNull(taskItem.dossierId || taskItem.dossier_id);
    // Prefer explicit lawsuit linkage when both exist (tasks added from a lawsuit tab)
    if (lawsuitId) {
      payload.lawsuit_id = lawsuitId;
    } else if (dossierId) {
      payload.dossier_id = dossierId;
    }

    const created = await apiClient.post("/tasks", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptTask(created, dossiersById, lawsuitsById);

    setTasks((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("tasks", next);
      return next;
    });

    logCreationHistory("task", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockFreeLimit, blockWrite, dossiers, entities, integrityIssues, lawsuits]);

  const updateTask = useCallback(async (id, updates, options = {}) => {
    if (blockWrite("update task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const { skipConfirmation = false } = options;
    const prev = tasks.find((t) => t.id === id);
    const validation = validateMutation("task", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

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
    if (updates.lawsuitId !== undefined || updates.lawsuit_id !== undefined) {
      payload.lawsuit_id = emptyToNull(updates.lawsuitId || updates.lawsuit_id);
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
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptTask(updated, dossiersById, lawsuitsById);

    setTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? adapted : task
      );
      debouncedSaveToStorage("tasks", next);
      return next;
    });
    logUpdateHistory("task", prev, updates, actorName);
    logStatusHistory("task", prev, updates, actorName);
    const taskTitle = adapted.title || prev?.title || updates?.title || "Task";
    const changeSummary = buildChangeSummary("Tâche", taskTitle, prev, updates);
    const updateLabel = changeSummary?.label || `Tâche modifiée: ${taskTitle}`;
    const changeMetadata = changeSummary?.changes || {};
    if (adapted.lawsuitId) {
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: adapted.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: updateLabel,
        details: updateLabel,
        metadata: { childType: "task", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(adapted.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${updateLabel} (${lawsuitRef})` : updateLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "task", relatedId: adapted.id, ...changeMetadata },
          actor: actorName,
        });
      }
    } else if (adapted.dossierId) {
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: updateLabel,
        details: updateLabel,
        metadata: { childType: "task", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }

    return validation;
  }, [actorName, blockWrite, dossiers, integrityIssues, lawsuits, tasks]);

  const deleteTask = useCallback(async (id) => {
    if (blockWrite("delete task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = tasks.find((t) => t.id === id);
    const validation = validateMutation("task", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/tasks/${id}`);

    // Delete history for this task
    await deleteEntityHistory('task', id);

    setTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      debouncedSaveToStorage("tasks", next);
      return next;
    });

    logDeletionHistory("task", prev, actorName);
    if (prev?.lawsuitId) {
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(prev.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const taskTitle = prev.title || "Task";
        const deleteLabel = `Task deleted: ${taskTitle}`;
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${deleteLabel} (${lawsuitRef})` : deleteLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "task", relatedId: prev.id },
          actor: actorName,
        });
      }
    }
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, lawsuits, tasks]);

  // --- Personal Tasks (non-linked) ---
  const addPersonalTask = useCallback(async (task) => {
    if (blockWrite("add personal task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const validation = validateMutation("personalTask", "add", task?.id, {
      data: task,
      newData: task,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

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
      // Backend expects an array for notes (even if empty)
      notes: notesToBackendFormat(task.notes ?? []),
    };

    const created = await apiClient.post("/personal-tasks", payload);
    const adapted = adaptPersonalTask(created);

    setPersonalTasks((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("personalTasks", next);
      return next;
    });

    logCreationHistory("personalTask", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockWrite, entities, integrityIssues]);

  const updatePersonalTask = useCallback(async (id, updates) => {
    if (blockWrite("update personal task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = personalTasks.find((t) => t.id === id);
    const validation = validateMutation("personalTask", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

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
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    const updated = await apiClient.put(`/personal-tasks/${id}`, payload);
    const adapted = adaptPersonalTask(updated);

    setPersonalTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? adapted : task
      );
      debouncedSaveToStorage("personalTasks", next);
      return next;
    });
    logUpdateHistory("personalTask", prev, updates, actorName);
    logStatusHistory("personalTask", prev, updates, actorName);

    return validation;
  }, [actorName, blockWrite, integrityIssues, personalTasks]);

  const deletePersonalTask = useCallback(async (id) => {
    if (blockWrite("delete personal task")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = personalTasks.find((t) => t.id === id);
    const validation = validateMutation("personalTask", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/personal-tasks/${id}`);

    setPersonalTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      debouncedSaveToStorage("personalTasks", next);
      return next;
    });

    logDeletionHistory("personalTask", prev, actorName);
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, personalTasks]);

  // --- Officers ---
  const addOfficer = useCallback(async (officer) => {
    if (blockWrite("add officer")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const validation = validateMutation("officer", "add", officer?.id, {
      data: officer,
      newData: officer,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

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
      // Backend expects an array for notes (even if empty)
      notes: notesToBackendFormat(officer.notes ?? []),
    };

    const created = await apiClient.post("/officers", payload);
    const adapted = adaptOfficer(created);

    setOfficers((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("officers", next);
      return next;
    });

    logCreationHistory("officer", created, actorName);
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockWrite, entities, integrityIssues]);

  const updateOfficer = useCallback(async (id, updates) => {
    if (blockWrite("update officer")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = officers.find((o) => o.id === id);
    const validation = validateMutation("officer", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues);
    if (!validation.ok) return validation;

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
      // ✅ Convert notes to backend format (camelCase → snake_case)
      payload.notes = notesToBackendFormat(updates.notes);
    }

    // Safety check: ensure we have at least one field to update
    if (Object.keys(payload).length === 0) {
      console.warn('[DataContext.updateOfficer] No valid officer fields to update, skipping API call');
      return validation;
    }

    const updated = await apiClient.put(`/officers/${id}`, payload);
    const adapted = adaptOfficer(updated);

    setOfficers((prev) => {
      const next = prev.map((officer) =>
        officer.id === id ? adapted : officer
      );
      debouncedSaveToStorage("officers", next);
      return next;
    });
    logUpdateHistory("officer", prev, updates, actorName);
    logStatusHistory("officer", prev, updates, actorName);

    return validation;
  }, [actorName, blockWrite, integrityIssues, officers]);

  const deleteOfficer = useCallback(async (id) => {
    if (blockWrite("delete officer")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = officers.find((o) => o.id === id);
    const validation = validateMutation("officer", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/officers/${id}`);

    setOfficers((prev) => {
      const next = prev.filter((officer) => officer.id !== id);
      debouncedSaveToStorage("officers", next);
      return next;
    });

    logDeletionHistory("officer", prev, actorName);
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, officers]);

  /**
   * CASCADE DELETE: Delete officer and all related entities
   * Called when user confirms force delete from BlockerModal
   *
   * CRITICAL: This function MUST delete all missions or fail completely.
   * Orphaned missions (missions without a bailiff) are INVALID domain state.
   */
  const deleteOfficerCascade = async (id) => {
    if (blockWrite("delete officer cascade")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    try {
      // Find all missions for this officer (use String comparison for type safety)
      const officerMissions = missions.filter(m => String(m.officerId) === String(id));
      // Delete each mission (which will cascade delete their financial entries and history)
      for (const mission of officerMissions) {
        const result = await deleteMissionCascade(mission.id);

        // CRITICAL: If mission deletion fails, abort the entire cascade
        if (!result || !result.ok) {
          console.error(`[DataContext.deleteOfficerCascade] Failed to delete mission ${mission.id}:`, result);
          throw new Error(`Failed to delete mission ${mission.id}. Aborting officer cascade delete to prevent orphaned missions.`);
        }
      }

      // Delete any direct financial entries linked to this officer (if any)
      const directFinancialEntries = financialEntries.filter(
        (entry) => String(entry.officerId) === String(id) && entry.scope === 'client'
      );

      for (const entry of directFinancialEntries) {
        await deleteFinancialEntry(entry.id);
      }

      // Finally, delete the officer itself from backend
      await apiClient.delete(`/officers/${id}`);

      // Update frontend state
      setOfficers((prev) => {
        const next = prev.filter((officer) => officer.id !== id);
        debouncedSaveToStorage("officers", next);
        return next;
      });

      const prev = officers.find((o) => o.id === id);
      logDeletionHistory("officer", prev, actorName);

      return { ok: true, result: { message: 'Officer and all child entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteOfficerCascade] CRITICAL ERROR during cascade delete:', error);
      console.error('[DataContext.deleteOfficerCascade] Officer may have been partially deleted. Manual cleanup may be required.');
      return { ok: false, result: { message: `Error during cascade delete: ${error.message}` } };
    }
  };

  // --- Missions ---
  const addMission = useCallback(async (mission) => {
    if (blockWrite("add mission")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const validation = validateMutation("mission", "add", mission?.id, {
      data: mission,
      newData: mission,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

    // Determine which entity to link based on entityType or which ID is provided
    const entityType = mission.entityType;
    const dossierId = emptyToNull(mission.dossierId ?? mission.dossier_id);
    const lawsuitId = emptyToNull(mission.lawsuitId ?? mission.lawsuit_id);

    // Backend requires EITHER dossier_id OR lawsuit_id (exclusive)
    // Prefer the explicit entityType, otherwise mirror the task XOR rule (lawsuit wins ties)
    let finalDossierId = null;
    let finallawsuitId = null;

    if (entityType === "lawsuit") {
      finallawsuitId = lawsuitId || null;
      if (!finallawsuitId && dossierId) {
        finalDossierId = dossierId;
      }
    } else if (entityType === "dossier") {
      finalDossierId = dossierId || null;
      if (!finalDossierId && lawsuitId) {
        finallawsuitId = lawsuitId;
      }
    } else if (lawsuitId && dossierId) {
      // Ambiguous: default to lawsuit linkage to align with tasks
      finallawsuitId = lawsuitId;
    } else if (lawsuitId) {
      finallawsuitId = lawsuitId;
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
      lawsuit_id: finallawsuitId,
      officer_id: emptyToNull(mission.officerId || mission.officer_id),
      reference: emptyToNull(mission.missionNumber || mission.reference),
    };

    const created = await apiClient.post("/missions", payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptMission(created, dossiersById, lawsuitsById);

    setMissions((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("missions", next);
      return next;
    });

    // Update parent dossier or lawsuit with the new mission
    if (adapted.entityType === "dossier" && adapted.dossierId) {
      setDossiers((prev) => {
        const next = prev.map((d) =>
          d.id === adapted.dossierId
            ? { ...d, missions: [...(d.missions || []), adapted] }
            : d
        );
        debouncedSaveToStorage("dossiers", next);
        return next;
      });
    } else if (adapted.entityType === "lawsuit" && adapted.lawsuitId) {
      setLawsuits((prev) => {
        const next = prev.map((c) =>
          c.id === adapted.lawsuitId
            ? { ...c, missions: [...(c.missions || []), adapted] }
            : c
        );
        debouncedSaveToStorage("lawsuits", next);
        return next;
      });
    }

    logCreationHistory("mission", created, actorName);
    const createdTitle = adapted.title || created.title || "Mission";
    const missionCreateLabel = `Mission created: ${createdTitle}`;
    if (adapted.lawsuitId) {
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: adapted.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: missionCreateLabel,
        details: missionCreateLabel,
        metadata: { childType: "mission", childId: adapted.id },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(adapted.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${missionCreateLabel} (${lawsuitRef})` : missionCreateLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "mission", relatedId: adapted.id },
          actor: actorName,
        });
      }
    } else if (adapted.dossierId) {
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: missionCreateLabel,
        details: missionCreateLabel,
        metadata: { childType: "mission", childId: adapted.id },
        actor: actorName,
      });
    }
    if (adapted.officerId) {
      const createLabel = `Mission created: ${createdTitle}`;
      logHistoryEvent({
        entityType: "officer",
        entityId: adapted.officerId,
        eventType: EVENT_TYPES.RELATION,
        label: createLabel,
        details: createLabel,
        metadata: { childType: "mission", childId: adapted.id },
        actor: actorName,
      });
    }
    return { ok: true, result: validation.result, created: adapted };
  }, [actorName, blockWrite, dossiers, entities, integrityIssues, lawsuits]);

  const updateMission = async (id, updates, skipConfirmation = false) => {
    if (blockWrite("update mission")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const updateKeys = Object.keys(updates || {});
    if (updateKeys.length === 1 && updateKeys[0] === "status") {
      return updateMissionStatus(id, updates.status, skipConfirmation);
    }

    const prev = missions.find((m) => m.id === id);
    const validation = validateMutation("mission", "edit", id, { data: prev, newData: { ...prev, ...updates } }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

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
    if (updates.lawsuitId !== undefined || updates.lawsuit_id !== undefined) {
      payload.lawsuit_id = emptyToNull(updates.lawsuitId || updates.lawsuit_id);
    }
    if (updates.officerId !== undefined || updates.officer_id !== undefined) {
      payload.officer_id = emptyToNull(updates.officerId || updates.officer_id);
    }
    if (updates.missionNumber !== undefined || updates.reference !== undefined) {
      payload.reference = emptyToNull(updates.missionNumber || updates.reference);
    }

    const updated = await apiClient.put(`/missions/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptMission(updated, dossiersById, lawsuitsById);

    setMissions((prev) => {
      const next = prev.map((mission) =>
        mission.id === id ? adapted : mission
      );
      debouncedSaveToStorage("missions", next);
      return next;
    });
    logUpdateHistory("mission", prev, updates, actorName);
    logStatusHistory("mission", prev, updates, actorName);
    const updatedTitle = adapted.title || prev?.title || "Mission";
    const changeSummary = buildChangeSummary("Mission", updatedTitle, prev, updates);
    const missionUpdateLabel = changeSummary?.label || `Mission modifiée: ${updatedTitle}`;
    const changeMetadata = changeSummary?.changes || {};
    if (adapted.lawsuitId) {
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: adapted.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(adapted.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${missionUpdateLabel} (${lawsuitRef})` : missionUpdateLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "mission", relatedId: adapted.id, ...changeMetadata },
          actor: actorName,
        });
      }
    } else if (adapted.dossierId) {
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }
    if (adapted.officerId) {
      logHistoryEvent({
        entityType: "officer",
        entityId: adapted.officerId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }

    return adapted;
  };

  const updateMissionStatus = useCallback(async (id, status, skipConfirmation = false) => {
    if (blockWrite("update mission status")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = missions.find((m) => m.id === id);
    const updates = { status };
    const validation = validateMutation(
      "mission",
      "changeStatus",
      id,
      { data: prev, newData: { ...prev, ...updates } },
      integrityIssues,
      skipConfirmation
    );
    if (!validation.ok) return validation;

    const payload = { status };
    const updated = await apiClient.put(`/missions/${id}`, payload);
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptMission(updated, dossiersById, lawsuitsById);

    setMissions((prevMissions) => {
      const next = prevMissions.map((mission) =>
        mission.id === id ? adapted : mission
      );
      debouncedSaveToStorage("missions", next);
      return next;
    });
    logUpdateHistory("mission", prev, updates, actorName);
    logStatusHistory("mission", prev, updates, actorName);
    const updatedTitle = adapted.title || prev?.title || updates?.title || "Mission";
    const changeSummary = buildChangeSummary("Mission", updatedTitle, prev, updates);
    const missionUpdateLabel = changeSummary?.label || `Mission modifiée: ${updatedTitle}`;
    const changeMetadata = changeSummary?.changes || {};
    if (adapted.lawsuitId) {
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: adapted.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(adapted.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${missionUpdateLabel} (${lawsuitRef})` : missionUpdateLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "mission", relatedId: adapted.id, ...changeMetadata },
          actor: actorName,
        });
      }
    } else if (adapted.dossierId) {
      logHistoryEvent({
        entityType: "dossier",
        entityId: adapted.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }
    if (adapted.officerId) {
      logHistoryEvent({
        entityType: "officer",
        entityId: adapted.officerId,
        eventType: EVENT_TYPES.RELATION,
        label: missionUpdateLabel,
        details: missionUpdateLabel,
        metadata: { childType: "mission", childId: adapted.id, ...changeMetadata },
        actor: actorName,
      });
    }

    return adapted;
  }, [actorName, blockWrite, dossiers, integrityIssues, lawsuits, missions]);

  const deleteMission = useCallback(async (id) => {
    if (blockWrite("delete mission")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = missions.find((m) => m.id === id);
    const validation = validateMutation("mission", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    await apiClient.delete(`/missions/${id}`);

    setMissions((prev) => {
      const next = prev.filter((mission) => mission.id !== id);
      debouncedSaveToStorage("missions", next);
      return next;
    });

    logDeletionHistory("mission", prev, actorName);
    if (prev?.lawsuitId) {
      const deleteTitle = prev.title || "Mission";
      const missionDeleteLabel = `Mission deleted: ${deleteTitle}`;
      logHistoryEvent({
        entityType: "lawsuit",
        entityId: prev.lawsuitId,
        eventType: EVENT_TYPES.RELATION,
        label: missionDeleteLabel,
        details: missionDeleteLabel,
        metadata: { childType: "mission", childId: prev.id },
        actor: actorName,
      });
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(prev.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${missionDeleteLabel} (${lawsuitRef})` : missionDeleteLabel;
        logHistoryEvent({
          entityType: "dossier",
          entityId: lawsuitItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: dossierLabel,
          details: dossierLabel,
          metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "mission", relatedId: prev.id },
          actor: actorName,
        });
      }
    } else if (prev?.dossierId) {
      const deleteTitle = prev.title || "Mission";
      const missionDeleteLabel = `Mission deleted: ${deleteTitle}`;
      logHistoryEvent({
        entityType: "dossier",
        entityId: prev.dossierId,
        eventType: EVENT_TYPES.RELATION,
        label: missionDeleteLabel,
        details: missionDeleteLabel,
        metadata: { childType: "mission", childId: prev.id },
        actor: actorName,
      });
    }
    if (prev?.officerId) {
      const deleteTitle = prev.title || "Mission";
      const deleteLabel = `Mission deleted: ${deleteTitle}`;
      logHistoryEvent({
        entityType: "officer",
        entityId: prev.officerId,
        eventType: EVENT_TYPES.RELATION,
        label: deleteLabel,
        details: deleteLabel,
        metadata: { childType: "mission", childId: prev.id },
        actor: actorName,
      });
    }
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, integrityIssues, lawsuits, missions]);

  const deleteMissionCascade = async (id) => {
    if (blockWrite("delete mission cascade")) {
      return { ok: false, result: { message: "License inactive" } };
    }
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
        debouncedSaveToStorage("missions", next);
        return next;
      });

      const prev = missions.find((m) => m.id === id);
      logDeletionHistory("mission", prev, actorName);
      if (prev?.lawsuitId) {
        const deleteTitle = prev.title || "Mission";
        const missionDeleteLabel = `Mission deleted: ${deleteTitle}`;
        logHistoryEvent({
          entityType: "lawsuit",
          entityId: prev.lawsuitId,
          eventType: EVENT_TYPES.RELATION,
          label: missionDeleteLabel,
          details: missionDeleteLabel,
          metadata: { childType: "mission", childId: prev.id },
          actor: actorName,
        });
        const lawsuitItem = lawsuits.find((c) => String(c.id) === String(prev.lawsuitId));
        if (lawsuitItem?.dossierId) {
          const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
          const dossierLabel = lawsuitRef ? `${missionDeleteLabel} (${lawsuitRef})` : missionDeleteLabel;
          logHistoryEvent({
            entityType: "dossier",
            entityId: lawsuitItem.dossierId,
            eventType: EVENT_TYPES.RELATION,
            label: dossierLabel,
            details: dossierLabel,
            metadata: { childType: "lawsuit", childId: lawsuitItem.id, relatedType: "mission", relatedId: prev.id },
            actor: actorName,
          });
        }
      } else if (prev?.dossierId) {
        const deleteTitle = prev.title || "Mission";
        const missionDeleteLabel = `Mission deleted: ${deleteTitle}`;
        logHistoryEvent({
          entityType: "dossier",
          entityId: prev.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: missionDeleteLabel,
          details: missionDeleteLabel,
          metadata: { childType: "mission", childId: prev.id },
          actor: actorName,
        });
      }
      if (prev?.officerId) {
        const deleteTitle = prev.title || "Mission";
        const deleteLabel = `Mission deleted: ${deleteTitle}`;
        logHistoryEvent({
          entityType: "officer",
          entityId: prev.officerId,
          eventType: EVENT_TYPES.RELATION,
          label: deleteLabel,
          details: deleteLabel,
          metadata: { childType: "mission", childId: prev.id },
          actor: actorName,
        });
      }

      return { ok: true, result: { message: 'Mission and all related entities deleted successfully' } };
    } catch (error) {
      console.error('[DataContext.deleteMissionCascade] Error during cascade delete:', error);
      return { ok: false, result: { message: 'Error during cascade delete' } };
    }
  };

  const logFinancialEntryParentHistory = useCallback((entry, actionLabel) => {
    if (!entry?.id) return;
    const amountLabel =
      entry?.amount !== null && entry?.amount !== undefined
        ? formatCurrency(entry.amount)
        : "";
    const entryDesc =
      entry.title ||
      entry.description ||
      `${entry.type || entry.entryType || entry.entry_type || "Entry"}${amountLabel ? ` - ${amountLabel}` : ""
        }`.trim();
    const baseLabel = entryDesc ? `${actionLabel}: ${entryDesc}` : actionLabel;
    const loggedTargets = new Set();
    const logTarget = (entityType, entityId, label = baseLabel, metadata = {}) => {
      if (!entityType || !entityId) return;
      const key = `${entityType}:${entityId}`;
      if (loggedTargets.has(key)) return;
      loggedTargets.add(key);
      logHistoryEvent({
        entityType,
        entityId,
        eventType: EVENT_TYPES.FINANCE,
        label,
        details: label,
        metadata: {
          childType: "financial_entry",
          childId: entry.id,
          amount: entry.amount,
          ...metadata,
        },
        actor: actorName,
      });
    };

    if (entry.clientId) {
      logTarget("client", entry.clientId);
    }
    if (entry.dossierId) {
      logTarget("dossier", entry.dossierId);
    }
    if (entry.lawsuitId) {
      logTarget("lawsuit", entry.lawsuitId);
      const lawsuitItem = lawsuits.find((c) => String(c.id) === String(entry.lawsuitId));
      if (lawsuitItem?.dossierId) {
        const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
        const dossierLabel = lawsuitRef ? `${baseLabel} (${lawsuitRef})` : baseLabel;
        logTarget("dossier", lawsuitItem.dossierId, dossierLabel, {
          childType: "lawsuit",
          childId: lawsuitItem.id,
          relatedType: "financial_entry",
          relatedId: entry.id,
        });
      }
    }
    if (entry.missionId) {
      logTarget("mission", entry.missionId);
      const missionItem = missions.find((m) => String(m.id) === String(entry.missionId));
      if (missionItem?.entityType === "lawsuit" && missionItem?.entityId) {
        const lawsuitRef = missionItem.entityReference || "";
        const lawsuitLabel = lawsuitRef ? `${baseLabel} (${lawsuitRef})` : baseLabel;
        logTarget("lawsuit", missionItem.entityId, lawsuitLabel, {
          childType: "mission",
          childId: missionItem.id,
          relatedType: "financial_entry",
          relatedId: entry.id,
        });
        const lawsuitItem = lawsuits.find((c) => String(c.id) === String(missionItem.entityId));
        if (lawsuitItem?.dossierId) {
          const dossierLabel = lawsuitRef ? `${baseLabel} (${lawsuitRef})` : baseLabel;
          logTarget("dossier", lawsuitItem.dossierId, dossierLabel, {
            childType: "lawsuit",
            childId: lawsuitItem.id,
            relatedType: "financial_entry",
            relatedId: entry.id,
          });
        }
      } else if (missionItem?.entityType === "dossier" && missionItem?.entityId) {
        const dossierLabel = missionItem.entityReference ? `${baseLabel} (${missionItem.entityReference})` : baseLabel;
        logTarget("dossier", missionItem.entityId, dossierLabel, {
          childType: "mission",
          childId: missionItem.id,
          relatedType: "financial_entry",
          relatedId: entry.id,
        });
      }
      if (missionItem?.officerId) {
        const officerLabel = missionItem.missionNumber ? `${baseLabel} (${missionItem.missionNumber})` : baseLabel;
        logTarget("officer", missionItem.officerId, officerLabel, {
          childType: "mission",
          childId: missionItem.id,
          relatedType: "financial_entry",
          relatedId: entry.id,
        });
      }
    }
    if (entry.taskId) {
      logTarget("task", entry.taskId);
      const taskItem = tasks.find((t) => String(t.id) === String(entry.taskId));
      if (taskItem?.lawsuitId) {
        const lawsuitItem = lawsuits.find((c) => String(c.id) === String(taskItem.lawsuitId));
        if (lawsuitItem) {
          const lawsuitRef = lawsuitItem.lawsuitNumber || lawsuitItem.title || "";
          const lawsuitLabel = lawsuitRef ? `${baseLabel} (${lawsuitRef})` : baseLabel;
          logTarget("lawsuit", lawsuitItem.id, lawsuitLabel, {
            childType: "task",
            childId: taskItem.id,
            relatedType: "financial_entry",
            relatedId: entry.id,
          });
          if (lawsuitItem.dossierId) {
            const dossierLabel = lawsuitRef ? `${baseLabel} (${lawsuitRef})` : baseLabel;
            logTarget("dossier", lawsuitItem.dossierId, dossierLabel, {
              childType: "lawsuit",
              childId: lawsuitItem.id,
              relatedType: "financial_entry",
              relatedId: entry.id,
            });
          }
        }
      } else if (taskItem?.dossierId) {
        logTarget("dossier", taskItem.dossierId);
      }
    }
    if (entry.personalTaskId) {
      logTarget("personalTask", entry.personalTaskId);
    }
  }, [actorName, formatCurrency, lawsuits, missions, tasks]);

  // --- Financial Entries ---
  const addFinancialEntry = useCallback(async (entry) => {
    if (blockWrite("add financial entry")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const validation = validateMutation("financialEntry", "add", entry?.id, {
      data: entry,
      newData: entry,
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const emptyToNull = (value) => (value === "" || value === undefined ? null : value);

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
    const todayIso = new Date().toISOString().split("T")[0];

    const payload = {
      scope: entry.scope || "client", // Default to client scope if not specified
      client_id: emptyToNull(entry.clientId || entry.client_id),
      dossier_id: emptyToNull(entry.dossierId || entry.dossier_id),
      lawsuit_id: emptyToNull(entry.lawsuitId || entry.lawsuit_id),
      mission_id: emptyToNull(entry.missionId || entry.mission_id),
      task_id: emptyToNull(entry.taskId || entry.task_id),
      personal_task_id: emptyToNull(entry.personalTaskId || entry.personal_task_id),
      entry_type: backendType,
      status: statusMap[entry.status] || entry.status || "pending",
      category: emptyToNull(entry.category),
      amount: entry.amount,
      currency,
      occurred_at: emptyToNull(entry.date || entry.occurred_at || todayIso),
      due_date: emptyToNull(entry.dueDate || entry.due_date || entry.date || todayIso),
      paid_at: emptyToNull(entry.paidAt || entry.paid_at),
      title: emptyToNull(entry.title),
      description: emptyToNull(entry.description),
      reference: emptyToNull(entry.reference),
    };

    const created = await apiClient.post("/financial", payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptFinancialEntry(created, clientsById, dossiersById, lawsuitsById);

    setFinancialEntries((prev) => {
      const next = [...prev, adapted];
      debouncedSaveToStorage("financialEntries", next);
      return next;
    });

    logCreationHistory("financialEntry", created, actorName);
    logFinancialEntryParentHistory(adapted, "Financial entry added");
    return { ok: true, result: validation.result, created: adapted };
  }, [
    actorName,
    blockWrite,
    clients,
    dossiers,
    entities,
    integrityIssues,
    currency,
    lawsuits,
    logFinancialEntryParentHistory,
  ]);

  const updateFinancialEntry = async (id, updates) => {
    if (blockWrite("update financial entry")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const updateKeys = Object.keys(updates || {});
    if (updateKeys.length === 1 && updateKeys[0] === "status") {
      return updateFinancialEntryStatus(id, updates.status, true);
    }

    const prev = financialEntries.find((e) => e.id === id);
    const validation = validateMutation("financialEntry", "edit", id, {
      data: prev,
      newData: { ...prev, ...updates },
      entities,
    }, integrityIssues);
    if (!validation.ok) return validation;

    const payload = {
      client_id: updates.clientId,
      dossier_id: updates.dossierId,
      lawsuit_id: updates.lawsuitId,
      task_id: updates.taskId,
      personal_task_id: updates.personalTaskId,
      entry_type: updates.type || updates.entryType,
      status: updates.status,
      amount: updates.amount,
      currency,
      occurred_at: updates.date || updates.occurred_at,
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
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptFinancialEntry(updated, clientsById, dossiersById, lawsuitsById);

    setFinancialEntries((prev) => {
      const next = prev.map((entry) =>
        entry.id === id ? adapted : entry
      );
      debouncedSaveToStorage("financialEntries", next);
      return next;
    });

    logUpdateHistory("financialEntry", prev, updates, actorName);
    logStatusHistory("financialEntry", prev, updates, actorName);
    logFinancialEntryParentHistory(adapted, "Financial entry updated");

    return validation;
  };

  const updateFinancialEntryStatus = useCallback(async (id, status, skipConfirmation = false) => {
    if (blockWrite("update financial entry status")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = financialEntries.find((e) => e.id === id);
    const updates = {
      status,
      ...(status === "paid" || status === "Paid"
        ? { paidAt: new Date().toISOString() }
        : {}),
    };
    const validation = validateMutation("financialEntry", "changeStatus", id, {
      data: prev,
      newData: { ...prev, ...updates },
      entities,
    }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    const payload = {
      status,
      ...(updates.paidAt ? { paid_at: updates.paidAt } : {}),
    };

    const updated = await apiClient.put(`/financial/${id}`, payload);
    const clientsById = Object.fromEntries(clients.map((c) => [c.id, c]));
    const dossiersById = Object.fromEntries(dossiers.map((d) => [d.id, d]));
    const lawsuitsById = Object.fromEntries(lawsuits.map((c) => [c.id, c]));
    const adapted = adaptFinancialEntry(updated, clientsById, dossiersById, lawsuitsById);

    setFinancialEntries((prevEntries) => {
      const next = prevEntries.map((entry) =>
        entry.id === id ? adapted : entry
      );
      debouncedSaveToStorage("financialEntries", next);
      return next;
    });

    logUpdateHistory("financialEntry", prev, updates, actorName);
    logStatusHistory("financialEntry", prev, updates, actorName);
    logFinancialEntryParentHistory(adapted, "Financial entry updated");

    return adapted;
  }, [
    actorName,
    blockWrite,
    clients,
    dossiers,
    entities,
    financialEntries,
    integrityIssues,
    lawsuits,
    logFinancialEntryParentHistory,
  ]);

  const deleteFinancialEntry = useCallback(async (id, { skipConfirmation = false } = {}) => {
    if (blockWrite("delete financial entry")) {
      return { ok: false, result: { message: "License inactive" } };
    }
    const prev = financialEntries.find((e) => e.id === id);
    const validation = validateMutation("financialEntry", "delete", id, {
      data: prev,
      entities,
    }, integrityIssues, skipConfirmation);
    if (!validation.ok) return validation;

    try {
      await apiClient.delete(`/financial/${id}`);
    } catch (error) {
      if (!String(error?.message || error).includes("API error 404")) {
        throw error;
      }
    }

    // Delete history for this financial entry
    await deleteEntityHistory('financial_entry', id);

    setFinancialEntries((prev) => {
      const next = prev.filter((entry) => entry.id !== id);
      debouncedSaveToStorage("financialEntries", next);
      return next;
    });

    logDeletionHistory("financialEntry", prev, actorName);
    logFinancialEntryParentHistory(prev, "Financial entry deleted");
    return { ok: true, result: validation.result };
  }, [actorName, blockWrite, entities, financialEntries, integrityIssues, logFinancialEntryParentHistory]);

  const value = useMemo(
    () => ({
      clients,
      dossiers,
      lawsuits,
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
      addLawsuit,
      updateLawsuit,
      deleteLawsuit,
      deleteLawsuitCascade,
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
      updateMissionStatus,
      deleteMission,
      deleteMissionCascade,
      addFinancialEntry,
      updateFinancialEntry,
      updateFinancialEntryStatus,
      deleteFinancialEntry,
      integrityIssues,
      reconciled,
    }),
    [
      clients,
      dossiers,
      lawsuits,
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



