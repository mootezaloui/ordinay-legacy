/**
 * FINANCIAL LEDGER SYSTEM
 *
 * Single Source of Truth for ALL financial data in the application.
 *
 * Core Principles:
 * 1. Every money movement is a FinancialEntry in this ledger
 * 2. All balances are COMPUTED, never stored
 * 3. All screens derive totals by querying this ledger
 * 4. Financial scope (client vs internal) determines visibility
 *
 * Entry Types:
 * - revenue: Money coming in (advances, honoraires, payments)
 * - expense: Money going out (judicial fees, bailiff fees, office expenses)
 *
 * Categories:
 * - honoraires: Legal fees/honoraires
 * - advance: Client advance payment
 * - frais_judiciaires: Judicial court fees
 * - frais_huissier: Bailiff/process server fees
 * - frais_bureau: Internal office expenses
 * - other: Other expenses/revenues
 *
 * Financial Scope:
 * - client: Affects client balances (linked to clientId)
 * - internal: Office expenses only (Personal Tasks, etc.)
 *
 * Status:
 * - draft: Not yet confirmed
 * - confirmed: Confirmed but not paid
 * - paid: Payment completed
 * - cancelled: Cancelled entry
 */

import {
  logEntityCreation,
  logHistoryEvent,
  EVENT_TYPES,
} from "../services/historyService";

// Financial Entry ID counter
let nextFinancialId = 1;

/**
 * Financial Ledger - Single Source of Truth
 * Each entry represents a financial event
 */
export const financialLedger = [
  // Client 1 (Amira Ben Ali) - Dossier D-2024-001
  {
    id: nextFinancialId++,
    type: "revenue", // revenue or expense
    category: "advance", // honoraires, advance, frais_judiciaires, frais_huissier, frais_bureau, other
    amount: 2000,
    currency: "TND",
    date: "2024-01-15",
    description: "Avance initiale sur honoraires",
    status: "paid", // draft, confirmed, paid, cancelled

    // Financial scope
    scope: "client", // client or internal

    // Linking (traceability)
    clientId: 1,
    clientName: "Amira Ben Ali", // Denormalized for display
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: null,
    caseReference: null,

    // Source tracking (what generated this entry)
    sourceType: null, // 'task', 'mission', 'session', 'manual', etc.
    sourceId: null,

    // Metadata
    createdAt: "2024-01-15T10:00:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_judiciaires",
    amount: 1500,
    currency: "TND",
    date: "2024-01-20",
    description: "Frais de dépôt au tribunal - Affaire P-2024-001",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: 1,
    caseReference: "P-2024-001",
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-01-20T14:30:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_huissier",
    amount: 800,
    currency: "TND",
    date: "2024-01-25",
    description: "Frais d'huissier - Signification assignation",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: 1,
    caseReference: "P-2024-001",
    officerId: 1,
    officerName: "Me. Karim Jlassi",
    sourceType: "mission",
    sourceId: 1, // Mission ID
    createdAt: "2024-01-25T09:15:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "honoraires",
    amount: 15000,
    currency: "TND",
    date: "2024-02-01",
    description: "Honoraires convenus - Dossier D-2024-001",
    status: "confirmed",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-02-01T11:00:00",
    createdBy: "System",
  },

  // Client 2 (Mohamed Trabelsi) - Dossier D-2024-002
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "advance",
    amount: 5000,
    currency: "TND",
    date: "2024-02-10",
    description: "Avance client",
    status: "paid",
    scope: "client",
    clientId: 2,
    clientName: "Mohamed Trabelsi",
    dossierId: 2,
    dossierReference: "D-2024-002",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-02-10T15:20:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_judiciaires",
    amount: 2200,
    currency: "TND",
    date: "2024-02-15",
    description: "Frais judiciaires - Procès P-2024-002",
    status: "paid",
    scope: "client",
    clientId: 2,
    clientName: "Mohamed Trabelsi",
    dossierId: 2,
    dossierReference: "D-2024-002",
    caseId: 2,
    caseReference: "P-2024-002",
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-02-15T10:45:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "honoraires",
    amount: 25000,
    currency: "TND",
    date: "2024-02-10",
    description: "Honoraires affaire commerciale",
    status: "confirmed",
    scope: "client",
    clientId: 2,
    clientName: "Mohamed Trabelsi",
    dossierId: 2,
    dossierReference: "D-2024-002",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-02-10T15:20:00",
    createdBy: "System",
  },

  // Client 3 (Société TechCorp) - Dossier D-2024-003
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "advance",
    amount: 10000,
    currency: "TND",
    date: "2024-03-01",
    description: "Avance sur honoraires - Contentieux commercial",
    status: "paid",
    scope: "client",
    clientId: 3,
    clientName: "Société TechCorp",
    dossierId: 3,
    dossierReference: "D-2024-003",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-03-01T09:00:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_judiciaires",
    amount: 3500,
    currency: "TND",
    date: "2024-03-05",
    description: "Frais de greffe et timbres fiscaux",
    status: "paid",
    scope: "client",
    clientId: 3,
    clientName: "Société TechCorp",
    dossierId: 3,
    dossierReference: "D-2024-003",
    caseId: 3,
    caseReference: "P-2024-003",
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-03-05T11:30:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "honoraires",
    amount: 35000,
    currency: "TND",
    date: "2024-03-01",
    description: "Honoraires contentieux commercial",
    status: "confirmed",
    scope: "client",
    clientId: 3,
    clientName: "Société TechCorp",
    dossierId: 3,
    dossierReference: "D-2024-003",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-03-01T09:00:00",
    createdBy: "System",
  },

  // Internal expenses (Personal Tasks - Office expenses)
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_bureau",
    amount: 450,
    currency: "TND",
    date: "2024-01-10",
    description: "Fournitures de bureau",
    status: "paid",
    scope: "internal", // Internal expense - does NOT affect any client
    clientId: null,
    clientName: null,
    dossierId: null,
    dossierReference: null,
    caseId: null,
    caseReference: null,
    sourceType: "personal_task",
    sourceId: 1, // Personal Task ID
    createdAt: "2024-01-10T14:00:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_bureau",
    amount: 1200,
    currency: "TND",
    date: "2024-02-05",
    description: "Abonnement logiciel juridique",
    status: "paid",
    scope: "internal",
    clientId: null,
    clientName: null,
    dossierId: null,
    dossierReference: null,
    caseId: null,
    caseReference: null,
    sourceType: "personal_task",
    sourceId: 2,
    createdAt: "2024-02-05T10:00:00",
    createdBy: "System",
  },
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_bureau",
    amount: 300,
    currency: "TND",
    date: "2024-03-12",
    description: "Frais de déplacement - formation",
    status: "confirmed",
    scope: "internal",
    clientId: null,
    clientName: null,
    dossierId: null,
    dossierReference: null,
    caseId: null,
    caseReference: null,
    sourceType: "personal_task",
    sourceId: 3,
    createdAt: "2024-03-12T16:30:00",
    createdBy: "System",
  },

  // Additional client entries
  {
    id: nextFinancialId++,
    type: "revenue",
    category: "advance",
    amount: 3000,
    currency: "TND",
    date: "2024-03-10",
    description: "Complément avance",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: null,
    caseReference: null,
    sourceType: "manual",
    sourceId: null,
    createdAt: "2024-03-10T14:00:00",
    createdBy: "System",
  },

  // ============================================
  // MISSION-RELATED FINANCIAL ENTRIES
  // ============================================
  // Missions generate expenses only (huissiers are paid by clients, never pay us)
  // Each mission's expenses are linked to: missionId, officerId, and parent entity (dossier/case)

  // Mission 1 - Signification (DOS-2024-001)
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_huissier",
    amount: 800,
    currency: "TND",
    date: "2024-11-14",
    description:
      "Frais huissier - Signification acte judiciaire (MIS-2024-001)",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: null,
    caseReference: null,
    sourceType: "mission",
    sourceId: 1, // Mission ID
    missionId: 1,
    missionNumber: "MIS-2024-001",
    officerId: 1,
    officerName: "Me. Karim Jlassi",
    createdAt: "2024-11-14T15:00:00",
    createdBy: "System",
  },

  // Mission 2 - Constat (DOS-2024-001)
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_huissier",
    amount: 1200,
    currency: "TND",
    date: "2024-11-20",
    description: "Frais huissier - Constat domicile (MIS-2024-002)",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: null,
    caseReference: null,
    sourceType: "mission",
    sourceId: 2,
    missionId: 2,
    missionNumber: "MIS-2024-002",
    officerId: 1,
    officerName: "Me. Karim Jlassi",
    createdAt: "2024-11-20T10:30:00",
    createdBy: "System",
  },

  // Mission 3 - Signification (DOS-2024-002)
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_huissier",
    amount: 650,
    currency: "TND",
    date: "2024-12-05",
    description:
      "Frais huissier - Signification assignation divorce (MIS-2024-003)",
    status: "confirmed",
    scope: "client",
    clientId: 2,
    clientName: "Mohamed Trabelsi",
    dossierId: 2,
    dossierReference: "D-2024-002",
    caseId: null,
    caseReference: null,
    sourceType: "mission",
    sourceId: 3,
    missionId: 3,
    missionNumber: "MIS-2024-003",
    officerId: 2,
    officerName: "Me. Rania Mbarek",
    createdAt: "2024-12-05T14:00:00",
    createdBy: "System",
  },

  // Mission 4 - Exécution (PRO-2024-001)
  {
    id: nextFinancialId++,
    type: "expense",
    category: "frais_huissier",
    amount: 1500,
    currency: "TND",
    date: "2024-12-10",
    description: "Frais huissier - Exécution jugement (MIS-2024-004)",
    status: "paid",
    scope: "client",
    clientId: 1,
    clientName: "Amira Ben Ali",
    dossierId: 1,
    dossierReference: "D-2024-001",
    caseId: 1,
    caseReference: "P-2024-001",
    sourceType: "mission",
    sourceId: 4,
    missionId: 4,
    missionNumber: "MIS-2024-004",
    officerId: 2,
    officerName: "Me. Rania Mbarek",
    createdAt: "2024-12-10T09:00:00",
    createdBy: "System",
  },
];

/**
 * Get next available financial entry ID
 */
export const getNextFinancialId = () => {
  return nextFinancialId++;
};

/**
 * Add a new financial entry to the ledger
 */
export const addFinancialEntry = (entry) => {
  const newEntry = {
    id: getNextFinancialId(),
    createdAt: new Date().toISOString(),
    createdBy: "User",
    currency: "TND",
    status: "confirmed",
    ...entry,
  };

  financialLedger.push(newEntry);

  // History: creation of the financial entry itself
  logEntityCreation("financialEntry", newEntry.id, newEntry.description || "Écriture");

  // History: relations on linked entities
  const relationPayload = {
    eventType: EVENT_TYPES.FINANCE,
    label: "Écriture comptable ajoutée",
    details: newEntry.description,
    metadata: {
      amount: `${newEntry.amount} ${newEntry.currency || "TND"}`,
      relatedType: "financialEntry",
      relatedId: newEntry.id,
    },
  };

  if (newEntry.clientId) {
    logHistoryEvent({
      ...relationPayload,
      entityType: "client",
      entityId: newEntry.clientId,
    });
  }
  if (newEntry.dossierId) {
    logHistoryEvent({
      ...relationPayload,
      entityType: "dossier",
      entityId: newEntry.dossierId,
    });
  }
  if (newEntry.caseId) {
    logHistoryEvent({
      ...relationPayload,
      entityType: "case",
      entityId: newEntry.caseId,
    });
  }

  return newEntry;
};

/**
 * Update an existing financial entry
 */
export const updateFinancialEntry = (id, updates) => {
  const index = financialLedger.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    financialLedger[index] = {
      ...financialLedger[index],
      ...updates,
    };
    return financialLedger[index];
  }
  return null;
};

/**
 * Delete a financial entry (set as cancelled)
 */
export const deleteFinancialEntry = (id) => {
  const index = financialLedger.findIndex((entry) => entry.id === id);
  if (index !== -1) {
    financialLedger[index].status = "cancelled";
    return true;
  }
  return false;
};

// Category metadata
export const financialCategories = {
  honoraires: {
    label: "Honoraires",
    type: "revenue",
    icon: "fas fa-money-bill-wave",
    color: "emerald",
  },
  advance: {
    label: "Avance client",
    type: "revenue",
    icon: "fas fa-hand-holding-usd",
    color: "blue",
  },
  frais_judiciaires: {
    label: "Frais judiciaires",
    type: "expense",
    icon: "fas fa-gavel",
    color: "orange",
  },
  frais_huissier: {
    label: "Frais d'huissier",
    type: "expense",
    icon: "fas fa-file-invoice",
    color: "purple",
  },
  frais_bureau: {
    label: "Frais de bureau",
    type: "expense",
    icon: "fas fa-building",
    color: "gray",
  },
  other: {
    label: "Autre",
    type: "both",
    icon: "fas fa-ellipsis-h",
    color: "slate",
  },
};

// Status metadata
export const financialStatuses = {
  draft: {
    label: "Brouillon",
    color: "slate",
    icon: "fas fa-file",
  },
  confirmed: {
    label: "Confirmé",
    color: "blue",
    icon: "fas fa-check-circle",
  },
  paid: {
    label: "Payé",
    color: "green",
    icon: "fas fa-check-double",
  },
  cancelled: {
    label: "Annulé",
    color: "red",
    icon: "fas fa-times-circle",
  },
};

export default financialLedger;
