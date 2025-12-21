import { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  mockAccounting,
  mockCases,
  mockCasesExtended,
  mockClients,
  mockClientsExtended,
  mockDossiers,
  mockDossiersExtended,
  mockOfficers,
  mockOfficersExtended,
  mockPersonalTasks,
  mockSessions,
  mockSessionsExtended,
  mockTasks,
  mockTasksExtended,
  syncCaseToExtended,
  syncDossierToExtended,
  syncOfficerToExtended,
  syncSessionToExtended,
  syncTaskToExtended,
} from "../utils/mockData";
import { logHistoryEvent, EVENT_TYPES } from "../services/historyService";

const DataContext = createContext(null);
const STORAGE_PREFIX = "lawyer-app:data:";

const loadFromStorage = (key, fallback) => {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(`${STORAGE_PREFIX}${key}`);
    return stored ? JSON.parse(stored) : fallback;
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

const syncArrayRef = (targetArray, nextValue) => {
  if (!Array.isArray(targetArray)) return;
  targetArray.splice(0, targetArray.length, ...nextValue);
};

const rebuildClientsExtended = (clients, dossiers, cases) => {
  // Drop stale entries
  Object.keys(mockClientsExtended).forEach((id) => {
    if (!clients.find((c) => c.id === Number(id))) {
      delete mockClientsExtended[id];
    }
  });

  clients.forEach((client) => {
    const relatedDossiers = dossiers.filter((d) => d.clientId === client.id);
    const relatedCases = cases.filter((c) =>
      relatedDossiers.some((d) => d.id === c.dossierId)
    );
    mockClientsExtended[client.id] = {
      ...client,
      relatedDossiers,
      relatedCases,
      invoices: mockClientsExtended[client.id]?.invoices || [],
      documents: mockClientsExtended[client.id]?.documents || [],
      timeline: mockClientsExtended[client.id]?.timeline || [],
    };
  });
};

const rebuildDossiersExtended = (dossiers, cases, tasks, sessions) => {
  Object.keys(mockDossiersExtended).forEach((id) => {
    if (!dossiers.find((d) => d.id === Number(id))) {
      delete mockDossiersExtended[id];
    }
  });

  dossiers.forEach((dossier) => {
    mockDossiersExtended[dossier.id] = {
      ...dossier,
      proceedings: cases.filter((c) => c.dossierId === dossier.id),
      tasks: tasks.filter(
        (t) =>
          t.dossierId === dossier.id ||
          (t.caseId && cases.find((c) => c.id === t.caseId)?.dossierId === dossier.id)
      ),
      sessions: sessions.filter(
        (s) =>
          s.dossierId === dossier.id ||
          cases.find((c) => c.id === s.caseId)?.dossierId === dossier.id
      ),
      documents: mockDossiersExtended[dossier.id]?.documents || [],
      timeline: mockDossiersExtended[dossier.id]?.timeline || [],
    };
  });
};

const rebuildCasesExtended = (cases, tasks, sessions) => {
  Object.keys(mockCasesExtended).forEach((id) => {
    if (!cases.find((c) => c.id === Number(id))) {
      delete mockCasesExtended[id];
    }
  });

  cases.forEach((caseItem) => {
    mockCasesExtended[caseItem.id] = {
      ...caseItem,
      tasks: tasks.filter((t) => t.caseId === caseItem.id),
      sessions: sessions.filter((s) => s.caseId === caseItem.id),
      documents: mockCasesExtended[caseItem.id]?.documents || [],
      timeline: mockCasesExtended[caseItem.id]?.timeline || [],
    };
  });
};

const logUpdateHistory = (entityType, prevEntity, updates) => {
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
    label: "Mise a jour",
    metadata: changedFields,
  });
};

export function DataProvider({ children }) {
  // Seed state from localStorage when possible, otherwise from mock data.
  const [clients, setClients] = useState(() =>
    loadFromStorage("clients", Object.values(mockClientsExtended))
  );
  const [dossiers, setDossiers] = useState(() =>
    loadFromStorage("dossiers", Object.values(mockDossiersExtended))
  );
  const [cases, setCases] = useState(() =>
    loadFromStorage("cases", Object.values(mockCasesExtended))
  );
  const [sessions, setSessions] = useState(() =>
    loadFromStorage("sessions", mockSessions)
  );
  const [tasks, setTasks] = useState(() =>
    loadFromStorage("tasks", mockTasks)
  );
  const [personalTasks, setPersonalTasks] = useState(() =>
    loadFromStorage("personalTasks", mockPersonalTasks)
  );
  const [officers, setOfficers] = useState(() =>
    loadFromStorage("officers", Object.values(mockOfficersExtended))
  );

  // Keep mockData collections in sync with the live state (important for selectors and templates)
  useEffect(() => {
    syncArrayRef(mockClients, clients);
    rebuildClientsExtended(clients, dossiers, cases);
  }, [clients, dossiers, cases]);

  useEffect(() => {
    syncArrayRef(mockDossiers, dossiers);
    rebuildDossiersExtended(dossiers, cases, tasks, sessions);
  }, [dossiers, cases, tasks, sessions]);

  useEffect(() => {
    syncArrayRef(mockCases, cases);
    rebuildCasesExtended(cases, tasks, sessions);
  }, [cases, tasks, sessions]);

  useEffect(() => {
    syncArrayRef(mockSessions, sessions);
  }, [sessions]);

  useEffect(() => {
    syncArrayRef(mockTasks, tasks);
  }, [tasks]);

  // --- Clients ---
  const addClient = (client) => {
    setClients((prev) => {
      const next = [...prev, client];
      saveToStorage("clients", next);
      syncArrayRef(mockClients, next);
      mockClientsExtended[client.id] = {
        ...client,
        invoices: mockAccounting.filter((inv) => inv.clientId === client.id),
        documents: [],
        timeline: [],
        relatedDossiers: dossiers.filter((d) => d.clientId === client.id),
      };
      return next;
    });
  };

  const updateClient = (id, updates) => {
    const prev = clients.find((c) => c.id === id);
    setClients((prev) => {
      const next = prev.map((client) =>
        client.id === id ? { ...client, ...updates } : client
      );
      saveToStorage("clients", next);
      const idx = mockClients.findIndex((c) => c.id === id);
      if (idx !== -1) mockClients[idx] = { ...mockClients[idx], ...updates };
      if (mockClientsExtended[id]) {
        mockClientsExtended[id] = { ...mockClientsExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("client", prev, updates);
  };

  const deleteClient = (id) => {
    setClients((prev) => {
      const next = prev.filter((client) => client.id !== id);
      saveToStorage("clients", next);
      const idx = mockClients.findIndex((c) => c.id === id);
      if (idx !== -1) mockClients.splice(idx, 1);
      delete mockClientsExtended[id];
      return next;
    });
  };

  // --- Dossiers ---
  const addDossier = (dossier) => {
    setDossiers((prev) => {
      const next = [...prev, dossier];
      saveToStorage("dossiers", next);
      syncArrayRef(mockDossiers, next);
      syncDossierToExtended(dossier);
      return next;
    });
  };

  const updateDossier = (id, updates) => {
    const prev = dossiers.find((d) => d.id === id);
    setDossiers((prev) => {
      const next = prev.map((dossier) =>
        dossier.id === id ? { ...dossier, ...updates } : dossier
      );
      saveToStorage("dossiers", next);
      const idx = mockDossiers.findIndex((d) => d.id === id);
      if (idx !== -1) mockDossiers[idx] = { ...mockDossiers[idx], ...updates };
      if (mockDossiersExtended[id]) {
        mockDossiersExtended[id] = { ...mockDossiersExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("dossier", prev, updates);
  };

  const deleteDossier = (id) => {
    setDossiers((prev) => {
      const next = prev.filter((dossier) => dossier.id !== id);
      saveToStorage("dossiers", next);
      const idx = mockDossiers.findIndex((d) => d.id === id);
      if (idx !== -1) mockDossiers.splice(idx, 1);
      delete mockDossiersExtended[id];
      return next;
    });
  };

  // --- Cases ---
  const addCase = (caseItem) => {
    setCases((prev) => {
      const next = [...prev, caseItem];
      saveToStorage("cases", next);
      syncArrayRef(mockCases, next);
      syncCaseToExtended(caseItem);
      // Log relation on parent dossier so its history shows the new Procès
      if (caseItem.dossierId) {
        logHistoryEvent({
          entityType: "dossier",
          entityId: caseItem.dossierId,
          eventType: EVENT_TYPES.RELATION,
          label: "Procès créé",
          details: caseItem.caseNumber || caseItem.title || "Procès",
          metadata: {
            relatedType: "case",
            relatedId: caseItem.id,
          },
        });
      }
      return next;
    });
  };

  const updateCase = (id, updates) => {
    const prev = cases.find((c) => c.id === id);
    setCases((prev) => {
      const next = prev.map((caseItem) =>
        caseItem.id === id ? { ...caseItem, ...updates } : caseItem
      );
      saveToStorage("cases", next);
      const idx = mockCases.findIndex((c) => c.id === id);
      if (idx !== -1) mockCases[idx] = { ...mockCases[idx], ...updates };
      if (mockCasesExtended[id]) {
        mockCasesExtended[id] = { ...mockCasesExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("case", prev, updates);
  };

  const deleteCase = (id) => {
    setCases((prev) => {
      const next = prev.filter((caseItem) => caseItem.id !== id);
      saveToStorage("cases", next);
      const idx = mockCases.findIndex((c) => c.id === id);
      if (idx !== -1) mockCases.splice(idx, 1);
      delete mockCasesExtended[id];
      return next;
    });
  };

  // --- Sessions ---
  const addSession = (session) => {
    setSessions((prev) => {
      const next = [...prev, session];
      saveToStorage("sessions", next);
      syncArrayRef(mockSessions, next);
      syncSessionToExtended(session);
      return next;
    });
  };

  const updateSession = (id, updates) => {
    const prev = sessions.find((s) => s.id === id);
    setSessions((prev) => {
      const next = prev.map((session) =>
        session.id === id ? { ...session, ...updates } : session
      );
      saveToStorage("sessions", next);
      const idx = mockSessions.findIndex((s) => s.id === id);
      if (idx !== -1) mockSessions[idx] = { ...mockSessions[idx], ...updates };
      if (mockSessionsExtended[id]) {
        mockSessionsExtended[id] = { ...mockSessionsExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("session", prev, updates);
  };

  const deleteSession = (id) => {
    setSessions((prev) => {
      const next = prev.filter((session) => session.id !== id);
      saveToStorage("sessions", next);
      const idx = mockSessions.findIndex((s) => s.id === id);
      if (idx !== -1) mockSessions.splice(idx, 1);
      delete mockSessionsExtended[id];
      return next;
    });
  };

  // --- Tasks (linked to dossiers/cases) ---
  const addTask = (task) => {
    setTasks((prev) => {
      const next = [...prev, task];
      saveToStorage("tasks", next);
      syncArrayRef(mockTasks, next);
      syncTaskToExtended(task);
      return next;
    });
  };

  const updateTask = (id, updates) => {
    const prev = tasks.find((t) => t.id === id);
    setTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      );
      saveToStorage("tasks", next);
      const idx = mockTasks.findIndex((t) => t.id === id);
      if (idx !== -1) mockTasks[idx] = { ...mockTasks[idx], ...updates };
      if (mockTasksExtended[id]) {
        mockTasksExtended[id] = { ...mockTasksExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("task", prev, updates);
  };

  const deleteTask = (id) => {
    setTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      saveToStorage("tasks", next);
      const idx = mockTasks.findIndex((t) => t.id === id);
      if (idx !== -1) mockTasks.splice(idx, 1);
      delete mockTasksExtended[id];
      return next;
    });
  };

  // --- Personal Tasks (non-linked) ---
  const addPersonalTask = (task) => {
    setPersonalTasks((prev) => {
      const next = [...prev, task];
      saveToStorage("personalTasks", next);
      return next;
    });
  };

  const updatePersonalTask = (id, updates) => {
    const prev = personalTasks.find((t) => t.id === id);
    setPersonalTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      );
      saveToStorage("personalTasks", next);
      return next;
    });
    logUpdateHistory("personalTask", prev, updates);
  };

  const deletePersonalTask = (id) => {
    setPersonalTasks((prev) => {
      const next = prev.filter((task) => task.id !== id);
      saveToStorage("personalTasks", next);
      return next;
    });
  };

  // --- Officers ---
  const addOfficer = (officer) => {
    setOfficers((prev) => {
      const next = [...prev, officer];
      saveToStorage("officers", next);
      syncArrayRef(mockOfficers, next);
      syncOfficerToExtended(officer);
      return next;
    });
  };

  const updateOfficer = (id, updates) => {
    const prev = officers.find((o) => o.id === id);
    setOfficers((prev) => {
      const next = prev.map((officer) =>
        officer.id === id ? { ...officer, ...updates } : officer
      );
      saveToStorage("officers", next);
      const idx = mockOfficers.findIndex((o) => o.id === id);
      if (idx !== -1) mockOfficers[idx] = { ...mockOfficers[idx], ...updates };
      if (mockOfficersExtended[id]) {
        mockOfficersExtended[id] = { ...mockOfficersExtended[id], ...updates };
      }
      return next;
    });
    logUpdateHistory("officer", prev, updates);
  };

  const deleteOfficer = (id) => {
    setOfficers((prev) => {
      const next = prev.filter((officer) => officer.id !== id);
      saveToStorage("officers", next);
      const idx = mockOfficers.findIndex((o) => o.id === id);
      if (idx !== -1) mockOfficers.splice(idx, 1);
      delete mockOfficersExtended[id];
      return next;
    });
  };

  const value = useMemo(
    () => ({
      clients,
      dossiers,
      cases,
      sessions,
      tasks,
      personalTasks,
      officers,
      addClient,
      updateClient,
      deleteClient,
      addDossier,
      updateDossier,
      deleteDossier,
      addCase,
      updateCase,
      deleteCase,
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
    }),
    [
      clients,
      dossiers,
      cases,
      sessions,
      tasks,
      personalTasks,
      officers,
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
