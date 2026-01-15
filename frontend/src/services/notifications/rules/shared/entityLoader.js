/**
 * Entity loader and accessor for notification rules
 * Provides centralized access to entity data
 */

// Live entities are provided by callers (scheduler/context) via a context object.
export let entities = {
  tasks: [],
  personalTasks: [],
  sessions: [],
  missions: [],
  dossiers: [],
  cases: [],
  clients: [],
  officers: [],
  financialEntries: [],
};

export function loadEntities(context = {}) {
  entities = {
    tasks: context.entities?.tasks || context.tasks || [],
    personalTasks:
      context.entities?.personalTasks || context.personalTasks || [],
    sessions: context.entities?.sessions || context.sessions || [],
    missions: context.entities?.missions || context.missions || [],
    dossiers: context.entities?.dossiers || context.dossiers || [],
    cases: context.entities?.cases || context.cases || [],
    clients: context.entities?.clients || context.clients || [],
    officers: context.entities?.officers || context.officers || [],
    financialEntries:
      context.entities?.financialEntries || context.financialEntries || [],
  };
}

export function getEntities() {
  return entities;
}

export function getAllMissions() {
  return entities.missions || [];
}

export function getAllDossiers() {
  return entities.dossiers || [];
}

export function getAllCases() {
  return entities.cases || [];
}

export function getAllTasks() {
  return entities.tasks || [];
}

export function getAllPersonalTasks() {
  return entities.personalTasks || [];
}

export function getAllSessions() {
  return entities.sessions || [];
}

export function getAllClients() {
  return entities.clients || [];
}

export function getAllOfficers() {
  return entities.officers || [];
}

export function getAllFinancialEntries() {
  return entities.financialEntries || [];
}
