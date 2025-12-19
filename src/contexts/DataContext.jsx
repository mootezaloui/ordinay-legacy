import { createContext, useContext, useMemo, useState } from "react";
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
      return next;
    });
  };

  const updateCase = (id, updates) => {
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
    setPersonalTasks((prev) => {
      const next = prev.map((task) =>
        task.id === id ? { ...task, ...updates } : task
      );
      saveToStorage("personalTasks", next);
      return next;
    });
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
