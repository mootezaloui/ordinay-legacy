/**
 * Domain Rules Engine
 *
 * Centralized business logic layer that enforces relational integrity
 * and valid state transitions between entities.
 *
 * PHASE 1: Terminal State Guards
 * - Prevents closing/archiving entities with incomplete children
 * - Enforces financial balance requirements
 *
 * PHASE 2: Relational Mutation Guards
 * - Prevents editing/deleting children of closed parents
 * - Enforces read-only state on closed entities
 * - Protects financial integrity
 *
 * PHASE 2.5: Relational-Impact Confirmations (NEW)
 * - Detects actions that change entity relationships
 * - Requires explicit confirmation with impact explanation
 * - Improves user trust and prevents accidental structural changes
 *
 * Core Concept:
 * - Before any critical action, consult canPerformAction()
 * - Returns { allowed: boolean, blockers?: string[], warnings?: string[],
 *            requiresConfirmation?: boolean, impactSummary?: string[] }
 * - UI must block actions if allowed === false
 * - UI must show confirmation dialog if requiresConfirmation === true
 *
 * Usage:
 * const result = canPerformAction('dossier', dossierId, 'edit', { data, newData });
 * if (!result.allowed) {
 *   showBlockerDialog(result.blockers);
 * } else if (result.requiresConfirmation) {
 *   showConfirmationDialog(result.impactSummary);
 * }
 */

// Live data is provided by callers through the context parameter.
// We keep legacy variable names to avoid touching downstream logic.
let mockDossiersExtended = {};
let mockLawsuitsExtended = {};
let mockClientsExtended = {};
let mockClients = [];
let mockDossiers = [];
let mockTasks = [];
let mockLawsuits = [];
let mockSessions = [];
let mockOfficers = [];
let mockOfficersExtended = {};
let financialLedger = [];
let missionsCache = [];
const getAllMissions = () => missionsCache;

import { validateTemporalConstraints } from "./temporalValidation";
import { enrichBlockers } from "./blockerEnrichment";
import { i18nInstance } from "../i18n";
import { translateStatus } from "../utils/entityTranslations";
import { formatCurrency } from "../utils/currency";
import {
  buildDeleteWarnings,
  buildForceDeleteMessage,
  buildImpactSummary,
} from "./domainRulesI18n";

// Translation helper for domain rules
const t = (key, options = {}) => {
  return i18nInstance.t(key, { ns: "domain", ...options });
};

const norm = (value) => String(value || "").trim().toLowerCase();
const isClosedLike = (value) =>
  ["closed", "archive", "archived", "ferme", "cloture", "clôturé", "completed"].includes(norm(value));
const isInactiveLike = (value) =>
  ["inactive", "in_active", "inactive client", "former_client", "disabled", "suspended"].includes(norm(value));
const isTerminalMissionLike = (value) =>
  ["completed", "cancelled", "closed", "terminee", "terminée"].includes(norm(value));

const findClientById = (id) => mockClients.find((c) => String(c.id) === String(id));
const findDossierById = (id) =>
  mockDossiersExtended[id] || mockDossiers.find((d) => String(d.id) === String(id));
const findLawsuitById = (id) =>
  mockLawsuitsExtended[id] || mockLawsuits.find((l) => String(l.id) === String(id));
const findOfficerById = (id) =>
  mockOfficersExtended[id] || mockOfficers.find((o) => String(o.id) === String(id));

function getAncestorClientForRefs({ clientId = null, dossierId = null, lawsuitId = null }) {
  const lawsuit = lawsuitId ? findLawsuitById(lawsuitId) : null;
  const dossier = dossierId ? findDossierById(dossierId) : lawsuit?.dossierId ? findDossierById(lawsuit.dossierId) : null;
  const client = clientId ? findClientById(clientId) : dossier?.clientId ? findClientById(dossier.clientId) : null;
  return { client, dossier, lawsuit };
}

function buildAncestorMutationBlockers({ childLabel, operation = "modify", clientId = null, dossierId = null, lawsuitId = null }) {
  const blockers = [];
  const { client, dossier, lawsuit } = getAncestorClientForRefs({ clientId, dossierId, lawsuitId });

  if (dossier && isClosedLike(dossier.status)) {
    blockers.push(
      `Cannot ${operation} this ${childLabel} because parent Dossier "${dossier.lawsuitNumber || dossier.reference || dossier.title}" is ${String(dossier.status).toLowerCase()}.`
    );
  }
  if (lawsuit && isClosedLike(lawsuit.status)) {
    blockers.push(
      `Cannot ${operation} this ${childLabel} because parent Lawsuit "${lawsuit.lawsuitNumber || lawsuit.reference || lawsuit.title}" is ${String(lawsuit.status).toLowerCase()}.`
    );
  }
  if (client && isInactiveLike(client.status)) {
    blockers.push(
      `Cannot ${operation} this ${childLabel} because linked Client "${client.name || client.id}" is inactive.`
    );
  }

  return blockers;
}

function pushRelationshipMismatchBlockers(blockers, { clientId = null, dossierId = null, lawsuitId = null }) {
  const client = clientId ? findClientById(clientId) : null;
  const dossier = dossierId ? findDossierById(dossierId) : null;
  const lawsuit = lawsuitId ? findLawsuitById(lawsuitId) : null;
  const hasClientSnapshot = Array.isArray(mockClients) && mockClients.length > 0;
  const hasDossierSnapshot = Array.isArray(mockDossiers) && mockDossiers.length > 0;
  const hasLawsuitSnapshot = Array.isArray(mockLawsuits) && mockLawsuits.length > 0;

  if (clientId && !client && hasClientSnapshot) blockers.push("Selected client was not found.");
  if (dossierId && !dossier && hasDossierSnapshot) blockers.push("Selected dossier was not found.");
  if (lawsuitId && !lawsuit && hasLawsuitSnapshot) blockers.push("Selected lawsuit was not found.");

  if (client && dossier && String(dossier.clientId) !== String(client.id)) {
    blockers.push("Selected dossier does not belong to the selected client.");
  }
  if (lawsuit && dossier && String(lawsuit.dossierId) !== String(dossier.id)) {
    blockers.push("Selected lawsuit does not belong to the selected dossier.");
  }
}

function removeNotFoundSelectionBlockers(blockers = []) {
  return blockers.filter(
    (msg) =>
      ![
        "Selected client was not found.",
        "Selected dossier was not found.",
        "Selected lawsuit was not found.",
      ].includes(msg),
  );
}

// Build in-memory snapshots from the live entities supplied in context.entities
const loadContextData = (context = {}) => {
  const entities = context.entities || {};
  mockClients = entities.clients || [];
  mockDossiers = entities.dossiers || [];
  mockLawsuits = entities.lawsuits || [];
  mockTasks = entities.tasks || [];
  mockSessions = entities.sessions || [];
  missionsCache = entities.missions || [];
  mockOfficers = entities.officers || [];
  financialLedger = entities.financialEntries || [];

  const lawsuitsById = new Map(mockLawsuits.map((c) => [c.id, c]));

  mockDossiersExtended = mockDossiers.reduce((acc, dossier) => {
    const proceedings = mockLawsuits.filter((c) => c.dossierId === dossier.id);
    const dossierTasks = mockTasks.filter(
      (task) =>
        (task.parentType === "dossier" && task.dossierId === dossier.id) ||
        (task.parentType === "lawsuit" &&
          proceedings.some((p) => p.id === task.lawsuitId))
    );
    const dossierSessions = mockSessions.filter(
      (session) =>
        session.dossierId === dossier.id ||
        proceedings.some((p) => p.id === session.lawsuitId)
    );
    const dossierMissions = missionsCache.filter(
      (mission) =>
        (mission.entityType === "dossier" && mission.entityId === dossier.id) ||
        (mission.entityType === "lawsuit" &&
          proceedings.some((p) => p.id === mission.entityId))
    );
    acc[dossier.id] = {
      ...dossier,
      proceedings,
      tasks: dossierTasks,
      sessions: dossierSessions,
      missions: dossierMissions,
    };
    return acc;
  }, {});

  mockLawsuitsExtended = mockLawsuits.reduce((acc, lawsuitItem) => {
    acc[lawsuitItem.id] = {
      ...lawsuitItem,
      tasks: mockTasks.filter(
        (task) => task.parentType === "lawsuit" && task.lawsuitId === lawsuitItem.id
      ),
      sessions: mockSessions.filter(
        (session) => session.lawsuitId === lawsuitItem.id
      ),
      missions: missionsCache.filter(
        (mission) =>
          mission.entityType === "lawsuit" && mission.entityId === lawsuitItem.id
      ),
    };
    return acc;
  }, {});

  mockClientsExtended = mockClients.reduce((acc, client) => {
    const clientDossiers = mockDossiers.filter((d) => d.clientId === client.id);
    const clientLawsuits = mockLawsuits.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId)
    );
    acc[client.id] = {
      ...client,
      dossiers: clientDossiers,
      proceedings: clientLawsuits,
    };
    return acc;
  }, {});

  mockOfficersExtended = mockOfficers.reduce((acc, officer) => {
    acc[officer.id] = {
      ...officer,
      missions: missionsCache.filter(
        (mission) => mission.officerId === officer.id
      ),
    };
    return acc;
  }, {});
};

// ========================================
// CORE RULE ENGINE
// ========================================

/**
 * Main entry point for domain rule validation
 *
 * @param {string} entityType - Type of entity (dossier, lawsuit, client, etc.)
 * @param {number|string} entityId - ID of the entity
 * @param {string} action - Action being attempted (close, archive, delete, edit, etc.)
 * @param {object} context - Additional context (newValue, currentData, etc.)
 * @returns {object} { allowed: boolean, blockers?: string[], warnings?: string[],
 *                      requiresConfirmation?: boolean, impactSummary?: string[],
 *                      changeDetails?: object }
 */
export function canPerformAction(entityType, entityId, action, context = {}) {
  // Refresh in-memory data snapshot from live entities
  loadContextData(context);

  const validator = VALIDATORS[entityType];

  if (!validator) {
    console.warn(`No validator found for entity type: ${entityType}`);
    return { allowed: true, blockers: [], warnings: [] };
  }

  const isStatusBasedEdit =
    action === "edit" &&
    context.data &&
    context.newData &&
    (() => {
      const changedKeys = Object.keys(context.newData).filter(
        (key) => context.newData[key] !== context.data[key]
      );

      if (changedKeys.length === 0) return false;

      const allowedKeys = ["status", "priority"];

      return (
        changedKeys.includes("status") &&
        changedKeys.every((key) => allowedKeys.includes(key))
      );
    })();

  const actionValidator = validator[action];

  let result = { allowed: true, blockers: [], warnings: [] };

  if (actionValidator) {
    try {
      result = actionValidator(entityId, context);
    } catch (error) {
      console.error(`Error validating ${entityType}.${action}:`, error);
      return {
        allowed: false,
        blockers: [t("error.unexpected")],
        warnings: [],
      };
    }
  }

  // TEMPORAL VALIDATION: Apply date/time validation to all create and edit actions
  if (
    (action === "create" || action === "add" || action === "edit") &&
    context.newData &&
    !isStatusBasedEdit
  ) {
    try {
      const temporalResult = validateTemporalConstraints(
        entityType,
        context.newData,
        action,
        context
      );

      // Merge temporal validation results with existing results
      if (temporalResult) {
        if (!temporalResult.allowed) {
          result.allowed = false;
        }
        if (temporalResult.blockers && temporalResult.blockers.length > 0) {
          result.blockers = [
            ...(result.blockers || []),
            ...temporalResult.blockers,
          ];
        }
        if (temporalResult.warnings && temporalResult.warnings.length > 0) {
          result.warnings = [
            ...(result.warnings || []),
            ...temporalResult.warnings,
          ];
        }
      }
    } catch (error) {
      console.error(
        `Error in temporal validation for ${entityType}.${action}:`,
        error
      );
      // Continue with existing validation results
    }
  }

  // Phase 2.5: Detect relational-impact changes (even if no specific validator exists)
  if (result.allowed && action === "edit" && context.data && context.newData) {
    const impactDetection = detectRelationalImpact(
      entityType,
      context.data,
      context.newData
    );
    if (impactDetection.requiresConfirmation) {
      return {
        ...result,
        requiresConfirmation: true,
        impactSummary: impactDetection.impactSummary,
        changeDetails: impactDetection.changeDetails,
      };
    }
  }

  // Enrich blockers with structured, actionable data for the UI
  if (result.blockers && result.blockers.length > 0) {
    result.blockers = enrichBlockers(
      result.blockers,
      entityType,
      entityId,
      action,
      context
    );
  }

  return result;
}

// ========================================
// PHASE 2.5: RELATIONAL-IMPACT DETECTION
// ========================================

/**
 * Detect if an edit action changes critical relationships
 * Returns impact summary if confirmation is required
 *
 * @param {string} entityType - Type of entity being edited
 * @param {object} currentData - Current entity data
 * @param {object} newData - New entity data after edit
 * @returns {object} { requiresConfirmation: boolean, impactSummary?: string[], changeDetails?: object }
 */
function detectRelationalImpact(entityType, currentData, newData) {
  const detectors = {
    mission: detectMissionImpact,
    dossier: detectDossierImpact,
    lawsuit: detectLawsuitImpact,
    task: detectTaskImpact,
    session: detectSessionImpact,
  };

  const detector = detectors[entityType];
  if (!detector) {
    return { requiresConfirmation: false };
  }

  return detector(currentData, newData);
}

/**
 * Detect Mission → Huissier reassignment
 */
function detectMissionImpact(currentData, newData) {
  const changes = [];

  // Check for reference/number change
  const referenceField = "missionNumber";
  if (
    referenceField in newData &&
    currentData[referenceField] !== newData[referenceField]
  ) {
    changes.push({
      type: "reference_change",
      field: t("mission.impact.reference.field"),
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        t("mission.impact.reference.impact1"),
        t("mission.impact.reference.impact2"),
        t("mission.impact.reference.impact3"),
      ],
    });
  }

  // Check for officer reassignment
  if ("officerId" in newData) {
    const officerIdChanged = currentData.officerId !== newData.officerId;

    if (officerIdChanged) {
      // Get officer names for better UX
      const oldOfficer =
        mockOfficersExtended[currentData.officerId] ||
        Object.values(mockOfficersExtended).find(
          (o) => o.id == currentData.officerId
        );
      const newOfficer =
        mockOfficersExtended[newData.officerId] ||
        Object.values(mockOfficersExtended).find(
          (o) => o.id == newData.officerId
        );

      changes.push({
        type: "officer_reassignment",
        field: t("mission.impact.officer.field"),
        from: oldOfficer?.name,
        to: newOfficer?.name,
        impact: [
          t("mission.impact.officer.impact1"),
          t("mission.impact.officer.impact2"),
          t("mission.impact.officer.impact3"),
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  const impactSummary = buildImpactSummary(changes, "mission");

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: changes[0], // Primary change for backward compatibility
  };
}

/**
 * Detect Dossier → Client reassignment
 */
function detectDossierImpact(currentData, newData) {
  const changes = [];

  const referenceField = "lawsuitNumber";
  if (
    referenceField in newData &&
    currentData[referenceField] !== newData[referenceField]
  ) {
    changes.push({
      type: "reference_change",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        t("dossier.impact.reference.impact1"),
        t("dossier.impact.reference.impact2"),
        t("dossier.impact.reference.impact3"),
        t("dossier.impact.reference.impact4"),
      ],
    });
  }

  if ("clientId" in newData) {
    const clientIdChanged = currentData.clientId != newData.clientId;

    if (clientIdChanged) {
      const oldClient = mockClients.find((c) => c.id == currentData.clientId);
      const newClient = mockClients.find((c) => c.id == newData.clientId);

      changes.push({
        type: "client_reassignment",
        from: oldClient?.name || t("dossier.impact.client.unknown"),
        to: newClient?.name || t("dossier.impact.client.unknown"),
        impact: [
          t("dossier.impact.client.impact1"),
          t("dossier.impact.client.impact2"),
          t("dossier.impact.client.impact3"),
          t("dossier.impact.client.impact4"),
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  const impactSummary = buildImpactSummary(changes, "dossier");

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: changes[0], // Primary change for backward compatibility
  };
}
function detectLawsuitImpact(currentData, newData) {
  const changes = [];

  const referenceField = "lawsuitNumber";
  if (
    referenceField in newData &&
    currentData[referenceField] !== newData[referenceField]
  ) {
    changes.push({
      type: "reference_change",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        t("lawsuit.impact.reference.impact1"),
        t("lawsuit.impact.reference.impact2"),
        t("lawsuit.impact.reference.impact3"),
        t("lawsuit.impact.reference.impact4"),
      ],
    });
  }

  if ("dossierId" in newData) {
    const dossierIdChanged = currentData.dossierId != newData.dossierId;

    if (dossierIdChanged) {
      const oldDossier = mockDossiers.find(
        (d) => d.id == currentData.dossierId
      );
      const newDossier = mockDossiers.find((d) => d.id == newData.dossierId);

      const formatDossierLabel = (dossier) => {
        if (!dossier) return t("lawsuit.impact.dossier.notAssigned");
        const label = `${dossier.lawsuitNumber || ""} - ${
          dossier.title || ""
        }`.trim();
        return label || t("lawsuit.impact.dossier.notAssigned");
      };

      changes.push({
        type: "dossier_reassignment",
        from: formatDossierLabel(oldDossier),
        to: formatDossierLabel(newDossier),
        impact: [
          t("lawsuit.impact.dossier.impact1"),
          t("lawsuit.impact.dossier.impact2"),
          t("lawsuit.impact.dossier.impact3"),
          t("lawsuit.impact.dossier.impact4"),
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  const impactSummary = buildImpactSummary(changes, "lawsuit");

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: changes[0], // Primary change for backward compatibility
  };
}
function detectTaskImpact(currentData, newData) {
  const parentTypeInNewData = "parentType" in newData;
  const dossierIdInNewData = "dossierId" in newData;
  const lawsuitIdInNewData = "lawsuitId" in newData;

  if (!parentTypeInNewData && !dossierIdInNewData && !lawsuitIdInNewData) {
    return { requiresConfirmation: false };
  }

  const parentTypeChanged =
    parentTypeInNewData && currentData.parentType !== newData.parentType;

  const dossierIdChanged =
    dossierIdInNewData && currentData.dossierId !== newData.dossierId;
  const lawsuitIdChanged =
    lawsuitIdInNewData && currentData.lawsuitId !== newData.lawsuitId;

  const hasParentChange =
    parentTypeChanged || dossierIdChanged || lawsuitIdChanged;

  if (!hasParentChange) {
    return { requiresConfirmation: false };
  }

  const formatParentLabel = (entityType, entity) => {
    if (!entity) return t("task.impact.parent.notAssigned");
    if (entityType === "dossier") {
      return t("task.impact.parent.dossierLabel", {
        lawsuitNumber: entity.lawsuitNumber || "",
        title: entity.title || "",
      });
    }
    return t("task.impact.parent.lawsuitLabel", {
      lawsuitNumber: entity.lawsuitNumber || "",
      title: entity.title || "",
    });
  };

  let oldParentLabel = t("task.impact.parent.notAssigned");
  let newParentLabel = t("task.impact.parent.notAssigned");

  if (currentData.parentType === "dossier" && currentData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == currentData.dossierId);
    oldParentLabel = formatParentLabel("dossier", dossier);
  } else if (currentData.parentType === "lawsuit" && currentData.lawsuitId) {
    const lawsuitData = mockLawsuits.find((c) => c.id == currentData.lawsuitId);
    oldParentLabel = formatParentLabel("lawsuit", lawsuitData);
  }

  if (newData.parentType === "dossier" && newData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == newData.dossierId);
    newParentLabel = formatParentLabel("dossier", dossier);
  } else if (newData.parentType === "lawsuit" && newData.lawsuitId) {
    const lawsuitData = mockLawsuits.find((c) => c.id == newData.lawsuitId);
    newParentLabel = formatParentLabel("lawsuit", lawsuitData);
  }

  const impactSummary = buildImpactSummary(
    [
      {
        type: "parent_reassignment",
        from: oldParentLabel,
        to: newParentLabel,
        impact: [
          t("task.impact.parent.impact1"),
          t("task.impact.parent.impact2"),
          t("task.impact.parent.impact3"),
        ],
      },
    ],
    "task"
  );

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: {
      type: "parent_reassignment",
      from: oldParentLabel,
      to: newParentLabel,
    },
  };
}
function detectSessionImpact(currentData, newData) {
  const lawsuitIdInNewData = "lawsuitId" in newData;
  const dossierIdInNewData = "dossierId" in newData;

  if (!lawsuitIdInNewData && !dossierIdInNewData) {
    return { requiresConfirmation: false };
  }

  const lawsuitIdChanged = lawsuitIdInNewData && currentData.lawsuitId != newData.lawsuitId;
  const dossierIdChanged =
    dossierIdInNewData && currentData.dossierId != newData.dossierId;

  if (!lawsuitIdChanged && !dossierIdChanged) {
    return { requiresConfirmation: false };
  }

  const formatParentLabel = (entityType, entity) => {
    if (!entity) return t("session.impact.parent.notAssigned");
    if (entityType === "dossier") {
      return t("session.impact.parent.dossierLabel", {
        lawsuitNumber: entity.lawsuitNumber || "",
        title: entity.title || "",
      });
    }
    return t("session.impact.parent.lawsuitLabel", {
      lawsuitNumber: entity.lawsuitNumber || "",
      title: entity.title || "",
    });
  };

  let oldParentLabel = t("session.impact.parent.notAssigned");
  let newParentLabel = t("session.impact.parent.notAssigned");

  if (currentData.lawsuitId) {
    const lawsuitData = mockLawsuits.find((c) => c.id == currentData.lawsuitId);
    oldParentLabel = formatParentLabel("lawsuit", lawsuitData);
  } else if (currentData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == currentData.dossierId);
    oldParentLabel = formatParentLabel("dossier", dossier);
  }

  if (newData.lawsuitId) {
    const lawsuitData = mockLawsuits.find((c) => c.id == newData.lawsuitId);
    newParentLabel = formatParentLabel("lawsuit", lawsuitData);
  } else if (newData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == newData.dossierId);
    newParentLabel = formatParentLabel("dossier", dossier);
  }

  const impactSummary = buildImpactSummary(
    [
      {
        type: "session_parent_reassignment",
        from: oldParentLabel,
        to: newParentLabel,
        impact: [
          t("session.impact.parent.impact1"),
          t("session.impact.parent.impact2"),
          t("session.impact.parent.impact3"),
        ],
      },
    ],
    "session"
  );

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: {
      type: "session_parent_reassignment",
      from: oldParentLabel,
      to: newParentLabel,
    },
  };
}
// ========================================
// VALIDATORS BY ENTITY TYPE
// ========================================

const VALIDATORS = {
  dossier: {
    add: validateDossierAdd,
    close: validateDossierClose,
    archive: validateDossierArchive,
    delete: validateDossierDelete,
    changeStatus: validateDossierStatusChange,
  },
  lawsuit: {
    add: validateLawsuitAdd, // NEW: Prevent creating lawsuit under closed dossier
    close: validateLawsuitClose,
    delete: validateLawsuitDelete,
    changeStatus: validateLawsuitStatusChange,
  },
  client: {
    archive: validateClientArchive,
    delete: validateClientDelete,
    changeStatus: validateClientStatusChange,
    edit: validateClientEdit,
  },
  accounting: {
    editClient: validateAccountingEditRestriction,
    editDossier: validateAccountingEditRestriction,
    editLawsuit: validateAccountingEditRestriction,
    editOfficer: validateAccountingEditRestriction,
  },
  // PHASE 2: Child entity mutation guards
  task: {
    add: validateTaskAdd, // NEW: Prevent creating tasks under closed parents
    edit: validateTaskEdit,
    delete: validateTaskDelete,
    changeStatus: validateTaskStatusChange,
  },
  session: {
    add: validateSessionAdd, // NEW: Prevent creating sessions under closed parents
    edit: validateSessionEdit,
    delete: validateSessionDelete,
  },
  mission: {
    add: validateMissionAdd, // NEW: Prevent creating missions under closed dossiers
    edit: validateMissionEdit,
    delete: validateMissionDelete,
    changeStatus: validateMissionStatusChange,
  },
  financialEntry: {
    add: validateFinancialEntryAdd,
    edit: validateFinancialEntryEdit,
    delete: validateFinancialEntryDelete,
    changeStatus: validateFinancialEntryStatusChange,
  },
  officer: {
    edit: validateOfficerEdit,
    delete: validateOfficerDelete,
  },
  personalTask: {
    edit: validatePersonalTaskEdit,
    delete: validatePersonalTaskDelete,
    changeStatus: validatePersonalTaskStatusChange,
  },
};

// ========================================
// DOSSIER VALIDATORS
// ========================================

/**
 * Validate adding a Dossier
 *
 * Business Rules:
 * - Cannot create if no clients exist
 * - Must have a client selected in the form
 */
function validateDossierAdd(dossierId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get entities from context
  const clients = context?.entities?.clients || mockClients || [];

  // Get formData to check if client is selected
  // Note: FormModal passes form data as 'data' or 'formData' depending on the caller
  const formData = context?.formData || context?.data || {};

  // Check if any clients exist in the system
  if (clients.length === 0) {
    blockers.push("Please add a client before creating a Dossier.");
    return { allowed: false, blockers, warnings: [] };
  }

  // Check if a client was actually selected in the form
  if (!formData.clientId || formData.clientId === "") {
    blockers.push("Please select a client for this Dossier.");
    return { allowed: false, blockers, warnings: [] };
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate closing a Dossier
 *
 * Business Rules:
 * - Cannot close if any related Task is not "Done"
 * - Cannot close if any related Lawsuit is not "Closed"
 * - Cannot close if client has unpaid balance
 * - Cannot close if any active bailiff mission exists
 */
function validateDossierClose(dossierId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get all entities from context
  const allTasks = context.tasks || context.entities?.tasks || mockTasks || [];

  // Prefer live data from context (DetailView / Inline selectors), then fallback to store or mocks
  const dossier =
    context.data ||
    context.currentData ||
    mockDossiersExtended[dossierId] ||
    mockDossiersExtended[Number(dossierId)] ||
    (context.dossiers || context.entities?.dossiers || []).find(
      (d) => String(d.id) === String(dossierId)
    );

  if (!dossier) {
    return { allowed: false, blockers: ["Dossier not found"], warnings: [] };
  }

  // Rule 1: Check for open tasks
  const dossierTasks = allTasks.filter(
    (task) =>
      (task.parentType === "dossier" && task.dossierId === dossierId) ||
      (task.parentType === "lawsuit" &&
        dossier.proceedings?.some((proc) => proc.id === task.lawsuitId))
  );

  const incompleteTasks = dossierTasks.filter(
    (task) => task.status !== "Done" && task.status !== "Cancelled"
  );

  if (incompleteTasks.length > 0) {
    blockers.push(
      `${incompleteTasks.length} open Task${
        incompleteTasks.length > 1 ? "s" : ""
      }:` +
        incompleteTasks
          .slice(0, 3)
          .map((t) => `\n  • ${t.title} (${t.status})`)
          .join("") +
        (incompleteTasks.length > 3
          ? `\n  • ... and ${incompleteTasks.length - 3} other${
              incompleteTasks.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for open Procès (lawsuits)
  const allLawsuits = context.lawsuits || context.entities?.lawsuits || mockLawsuits || [];
  const dossierLawsuits = allLawsuits.filter(
    (c) => String(c.dossierId) === String(dossierId)
  );
  const openLawsuits = dossierLawsuits.filter((proc) => proc.status !== "Closed");

  if (openLawsuits.length > 0) {
    blockers.push(
      `${openLawsuits.length} open Lawsuit${openLawsuits.length > 1 ? "s" : ""}:` +
        openLawsuits
          .slice(0, 3)
          .map((c) => `\n  • ${c.lawsuitNumber} - ${c.title} (${c.status})`)
          .join("") +
        (openLawsuits.length > 3
          ? `\n  • ... and ${openLawsuits.length - 3} other${
              openLawsuits.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 3: Check for unpaid client balance
  const allFinancialEntries =
    context.financialEntries ||
    context.entities?.financialEntries ||
    financialLedger ||
    [];
  const clientFinancials = getClientFinancials(
    dossier.clientId,
    allFinancialEntries
  );

  if (clientFinancials.balance < 0) {
    blockers.push(
      `Unpaid balance: ${formatCurrency(Math.abs(clientFinancials.balance))}`
    );
  }

  // Rule 4: Check for upcoming/incomplete sessions (hearings)
  const allSessions =
    context.sessions || context.entities?.sessions || mockSessions || [];

  // Get sessions for this dossier and its related lawsuits
  const dossierSessions = allSessions.filter((session) => {
    if (session.dossierId === dossierId) {
      return true;
    }
    if (session.lawsuitId && dossierLawsuits.some((c) => c.id === session.lawsuitId)) {
      return true;
    }
    return false;
  });

  const openSessions = dossierSessions.filter(
    (session) =>
      session.status !== "Completed" && session.status !== "Cancelled"
  );

  if (openSessions.length > 0) {
    blockers.push(
      `${openSessions.length} open Hearing${
        openSessions.length > 1 ? "s" : ""
      }:` +
        openSessions
          .slice(0, 3)
          .map((s) => `\n  - ${s.type || "Hearing"} on ${s.date} (${s.status})`)
          .join("") +
        (openSessions.length > 3
          ? `\n  - ... and ${openSessions.length - 3} other${
              openSessions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 5: Check for active Huissier missions
  const allMissions =
    context.missions || context.entities?.missions || missionsCache || [];
  const dossierMissions = allMissions.filter(
    (mission) =>
      mission.entityType === "dossier" &&
      mission.entityReference === dossier.lawsuitNumber &&
      mission.status !== "Completed" &&
      mission.status !== "Cancelled"
  );

  if (dossierMissions.length > 0) {
    blockers.push(
      `${dossierMissions.length} active bailiff mission${
        dossierMissions.length > 1 ? "s" : ""
      } :` +
        dossierMissions
          .slice(0, 3)
          .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
          .join("") +
        (dossierMissions.length > 3
          ? `\n  • ... and ${dossierMissions.length - 3} other${
              dossierMissions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Warnings (non-blocking)
  if (dossier.documents && dossier.documents.length === 0) {
    warnings.push("No documents have been added to this Dossier");
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate archiving a Dossier (same as close for now)
 */
function validateDossierArchive(dossierId, context = {}) {
  return validateDossierClose(dossierId, context);
}

/**
 * Validate deleting a Dossier
 *
 * Business Rules:
 * - Cannot delete if any related entities exist (Procès, Tasks, Missions)
 * - Cannot delete if any financial entries exist
 */
function validateDossierDelete(dossierId, context = {}) {
  const blockers = [];
  const affectedEntities = [];

  const tasks = context.tasks || context.entities?.tasks || [];
  const lawsuits = context.lawsuits || context.entities?.lawsuits || [];
  const sessions = context.sessions || context.entities?.sessions || [];
  const missions = context.missions || context.entities?.missions || [];
  const financialEntries =
    context.financialEntries || context.entities?.financialEntries || [];

  const dossier =
    mockDossiersExtended[dossierId] ||
    mockDossiersExtended[Number(dossierId)] ||
    (context.dossiers || context.entities?.dossiers || []).find(
      (d) => String(d.id) === String(dossierId)
    );

  if (!dossier) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  const dossierLawsuits = lawsuits.filter(
    (c) => String(c.dossierId) === String(dossierId)
  );
  if (dossierLawsuits.length > 0) {
    affectedEntities.push({
      type: "lawsuits",
      count: dossierLawsuits.length,
      items: dossierLawsuits.slice(0, 5).map((c) => ({
        id: c.id,
        label: `${c.lawsuitNumber} - ${c.title}`,
      })),
    });
  }

  const dossierTasks = tasks.filter(
    (task) =>
      task.parentType === "dossier" &&
      String(task.dossierId) === String(dossierId)
  );

  if (dossierTasks.length > 0) {
    affectedEntities.push({
      type: "tasks",
      count: dossierTasks.length,
      items: dossierTasks.slice(0, 5).map((t) => ({
        id: t.id,
        label: t.title,
      })),
    });
  }

  const dossierSessions = sessions.filter(
    (session) => String(session.dossierId) === String(dossierId)
  );

  if (dossierSessions.length > 0) {
    affectedEntities.push({
      type: "sessions",
      count: dossierSessions.length,
      items: dossierSessions.slice(0, 5).map((s) => ({
        id: s.id,
        label: `${s.type} - ${s.date}`,
      })),
    });
  }

  const dossierMissions = missions.filter(
    (mission) =>
      mission.entityType === "dossier" &&
      String(mission.entityId) === String(dossierId)
  );

  if (dossierMissions.length > 0) {
    affectedEntities.push({
      type: "missions",
      count: dossierMissions.length,
      items: dossierMissions.slice(0, 5).map((m) => ({
        id: m.id,
        label: `${m.missionNumber} - ${m.title}`,
      })),
    });
  }

  const dossierFinancials = financialEntries.filter(
    (entry) =>
      String(entry.dossierId) === String(dossierId) && entry.status !== "void"
  );

  if (dossierFinancials.length > 0) {
    affectedEntities.push({
      type: "financialEntries",
      count: dossierFinancials.length,
      items: dossierFinancials.slice(0, 5).map((e) => ({
        id: e.id,
        label: `${e.description} - ${formatCurrency(e.amount)}`,
      })),
    });
  }

  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings: buildDeleteWarnings(affectedEntities, "dossier"),
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: buildForceDeleteMessage(totalCount, "dossier"),
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

function validateDossierStatusChange(dossierId, context = {}) {
  const { newValue } = context;

  const dossier = findDossierById(dossierId) || context?.data;
  const blockers = [];
  if (dossier) {
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "dossier",
        operation: "change status of",
        clientId: dossier.clientId,
      })
    );
  }

  if (newValue === "Closed") {
    const closeValidation = validateDossierClose(dossierId, context);
    closeValidation.blockers = [...(closeValidation.blockers || []), ...blockers];
    closeValidation.allowed = (closeValidation.blockers || []).length === 0;
    return closeValidation;
  }

  return { allowed: blockers.length === 0, blockers, warnings: [] };
}

// ========================================
// PROCÈS (CASE) VALIDATORS
// ========================================

/**
 * Validate creating a new Procès
 *
 * Business Rules:
 * - Cannot create if parent Dossier is closed/archived
 */
function validateLawsuitAdd(lawsuitId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get entities from context
  const dossiers = context?.entities?.dossiers || mockDossiers || [];

  // Get the parent dossier ID from context
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;

  if (!dossierId) {
    // No dossier specified - check if there are any dossiers available
    if (dossiers.length === 0) {
      blockers.push("Please add a Dossier before creating a lawsuit.");
      return { allowed: false, blockers, warnings: [] };
    }
    // No parent validation needed if dossier will be selected
    return { allowed: true, blockers: [], warnings: [] };
  }

  // Check if parent dossier exists
  const dossier =
    dossiers.find((d) => d.id === parseInt(dossierId)) ||
    mockDossiersExtended[dossierId];
  if (!dossier) {
    // If no dossiers are loaded, don't block (data might not be loaded yet)
    if (dossiers.length === 0) {
      return { allowed: true, blockers: [], warnings: [] };
    }
    return {
      allowed: false,
      blockers: ["Parent Dossier not found"],
      warnings: [],
    };
  }

  // Check if parent dossier is closed
  pushRelationshipMismatchBlockers(blockers, { dossierId });
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "lawsuit",
      operation: "create",
      dossierId,
    })
  );

  if (dossier.status === "Closed") {
    blockers.push(
      `Cannot create a lawsuit under a ${dossier.status.toLowerCase()} Dossier`,
      `Dossier: ${dossier.lawsuitNumber} - ${dossier.title}`,
      `You must first reopen the Dossier to add lawsuits`
    );
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate closing a Lawsuit
 *
 * Business Rules:
 * - Cannot close if any related Hearing is upcoming or not completed
 * - Cannot close if any related Task is not "Done"
 */
function validateLawsuitClose(lawsuitId, context = {}) {
  const blockers = [];
  const warnings = [];

  const sessions =
    context.sessions || context.entities?.sessions || mockSessions || [];
  const tasks = context.tasks || context.entities?.tasks || mockTasks || [];

  // Fetch lawsuit data
  const lawsuitData =
    mockLawsuitsExtended[lawsuitId] ||
    mockLawsuitsExtended[Number(lawsuitId)] ||
    (context.lawsuits || context.entities?.lawsuits || []).find(
      (c) => String(c.id) === String(lawsuitId)
    );

  if (!lawsuitData) {
    return { allowed: false, blockers: ["Lawsuit not found"], warnings: [] };
  }

  // Rule 1: Check for upcoming or incomplete Séances
  const lawsuitSessions = sessions.filter(
    (session) => String(session.lawsuitId) === String(lawsuitId)
  );

  const today = new Date();
  const upcomingSessions = lawsuitSessions.filter((session) => {
    const sessionDate = new Date(session.date);
    return (
      sessionDate >= today &&
      session.status !== "Completed" &&
      session.status !== "Cancelled"
    );
  });

  if (upcomingSessions.length > 0) {
    blockers.push(
      `${upcomingSessions.length} open Hearing${
        upcomingSessions.length > 1 ? "s" : ""
      }:` +
        upcomingSessions
          .slice(0, 3)
          .map((s) => `\n  • ${s.title} on ${s.date} (${s.status})`)
          .join("") +
        (upcomingSessions.length > 3
          ? `\n  • ... and ${upcomingSessions.length - 3} other${
              upcomingSessions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for open tasks
  const lawsuitTasks = tasks.filter(
    (task) =>
      task.parentType === "lawsuit" && String(task.lawsuitId) === String(lawsuitId)
  );

  const incompleteTasks = lawsuitTasks.filter(
    (task) => task.status !== "Done" && task.status !== "Cancelled"
  );

  if (incompleteTasks.length > 0) {
    blockers.push(
      `${incompleteTasks.length} open Task${
        incompleteTasks.length > 1 ? "s" : ""
      }:` +
        incompleteTasks
          .slice(0, 3)
          .map((t) => `\n  • ${t.title} (${t.status})`)
          .join("") +
        (incompleteTasks.length > 3
          ? `\n  • ... and ${incompleteTasks.length - 3} other${
              incompleteTasks.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 3: Check for active missions
  const allMissions = getAllMissions();
  const lawsuitMissions = allMissions.filter((mission) => {
    const missionEntityType = mission.entityType || mission.entity_type;
    const missionEntityId = mission.entityId ?? mission.entity_id ?? mission.lawsuitId ?? mission.lawsuit_id;
    const missionLawsuitId = mission.lawsuitId ?? mission.lawsuit_id ?? null;
    const missionRef = mission.entityReference || mission.entity_reference || null;

    const linkedById =
      (missionEntityType === "lawsuit" && String(missionEntityId) === String(lawsuitId)) ||
      (missionLawsuitId != null && String(missionLawsuitId) === String(lawsuitId));

    const linkedByLegacyRef =
      missionEntityType === "lawsuit" &&
      missionRef &&
      lawsuitData?.lawsuitNumber &&
      String(missionRef) === String(lawsuitData.lawsuitNumber);

    return (linkedById || linkedByLegacyRef) && !isTerminalMissionLike(mission.status);
  });

  if (lawsuitMissions.length > 0) {
    blockers.push(
      `${lawsuitMissions.length} active bailiff mission${
        lawsuitMissions.length > 1 ? "s" : ""
      } :` +
        lawsuitMissions
          .slice(0, 3)
          .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
          .join("") +
        (lawsuitMissions.length > 3
          ? `\n  • ... and ${lawsuitMissions.length - 3} other${
              lawsuitMissions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Procès
 */
function validateLawsuitDelete(lawsuitId, context = {}) {
  const blockers = [];
  const affectedEntities = [];

  const sessions = context.sessions || context.entities?.sessions || [];
  const tasks = context.tasks || context.entities?.tasks || [];
  const missions = context.missions || context.entities?.missions || [];

  const lawsuitData =
    mockLawsuitsExtended[lawsuitId] ||
    mockLawsuitsExtended[Number(lawsuitId)] ||
    (context.lawsuits || context.entities?.lawsuits || []).find(
      (c) => String(c.id) === String(lawsuitId)
    );

  if (!lawsuitData) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  const lawsuitSessions = sessions.filter(
    (session) => String(session.lawsuitId) === String(lawsuitId)
  );

  if (lawsuitSessions.length > 0) {
    affectedEntities.push({
      type: "sessions",
      count: lawsuitSessions.length,
      items: lawsuitSessions.slice(0, 5).map((s) => ({
        id: s.id,
        label: `${s.type} - ${s.date}`,
      })),
    });
  }

  const lawsuitTasks = tasks.filter(
    (task) =>
      task.parentType === "lawsuit" && String(task.lawsuitId) === String(lawsuitId)
  );

  if (lawsuitTasks.length > 0) {
    affectedEntities.push({
      type: "tasks",
      count: lawsuitTasks.length,
      items: lawsuitTasks.slice(0, 5).map((t) => ({
        id: t.id,
        label: t.title,
      })),
    });
  }

  const lawsuitMissions = missions.filter(
    (mission) =>
      mission.entityType === "lawsuit" &&
      String(mission.entityId) === String(lawsuitId)
  );

  if (lawsuitMissions.length > 0) {
    affectedEntities.push({
      type: "missions",
      count: lawsuitMissions.length,
      items: lawsuitMissions.slice(0, 5).map((m) => ({
        id: m.id,
        label: `${m.missionNumber} - ${m.title}`,
      })),
    });
  }

  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings: buildDeleteWarnings(affectedEntities, "lawsuit"),
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: buildForceDeleteMessage(totalCount, "lawsuit"),
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

function validateLawsuitStatusChange(lawsuitId, context = {}) {
  const { newValue } = context;
  const lawsuitData = findLawsuitById(lawsuitId) || context?.data;
  const blockers = [];
  if (lawsuitData) {
    pushRelationshipMismatchBlockers(blockers, { dossierId: lawsuitData.dossierId });
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "lawsuit",
        operation: "change status of",
        dossierId: lawsuitData.dossierId,
      })
    );
  }

  if (newValue === "Closed") {
    const closeValidation = validateLawsuitClose(lawsuitId, context);
    closeValidation.blockers = [...(closeValidation.blockers || []), ...blockers];
    closeValidation.allowed = (closeValidation.blockers || []).length === 0;
    return closeValidation;
  }

  return { allowed: blockers.length === 0, blockers, warnings: [] };
}

// ========================================
// CLIENT VALIDATORS
// ========================================

/**
 * Validate archiving a Client
 *
 * Business Rules:
 * - Cannot archive if any Dossier is still open
 * - Cannot archive if unpaid financial balance exists
 */
function validateClientArchive(clientId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Use extended client data (built by loadContextData) which includes related entities
  const clientExtended =
    mockClientsExtended[clientId] || mockClientsExtended[Number(clientId)];

  if (!clientExtended) {
    return { allowed: false, blockers: ["Client not found"], warnings: [] };
  }

  // Rule 1: Check for open Dossiers
  const clientDossiers = clientExtended.dossiers || [];
  const openDossiers = clientDossiers.filter((d) => d.status !== "Closed");

  if (openDossiers.length > 0) {
    const dossierLabel =
      openDossiers.length > 1
        ? t("client.blocker.openDossiers", { count: openDossiers.length })
        : t("client.blocker.openDossier", { count: openDossiers.length });

    const remainingCount = openDossiers.length - 3;
    const andMoreText =
      remainingCount > 0
        ? `\n  • ${t("client.archive.blocked.andMore", {
            count: remainingCount,
          })}`
        : "";

    blockers.push(
      `${dossierLabel}:` +
        openDossiers
          .slice(0, 3)
          .map((d) => {
            const translatedStatus = translateStatus(
              d.status,
              "dossiers",
              (key, options) => i18nInstance.t(key, options)
            );
            return `\n  • ${d.lawsuitNumber} - ${d.title} (${translatedStatus})`;
          })
          .join("") +
        andMoreText
    );
  }

  // Rule 2: Check for open Lawsuits (Procès)
  const clientLawsuits = clientExtended.proceedings || [];
  const openLawsuits = clientLawsuits.filter((c) => c.status !== "Closed");

  if (openLawsuits.length > 0) {
    blockers.push(
      `${openLawsuits.length} open Lawsuit${openLawsuits.length > 1 ? "s" : ""}:` +
        openLawsuits
          .slice(0, 3)
          .map((c) => `\n  • ${c.lawsuitNumber} - ${c.title} (${c.status})`)
          .join("") +
        (openLawsuits.length > 3
          ? `\n  • ... and ${openLawsuits.length - 3} other${
              openLawsuits.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 3: Check for open Tasks
  const clientTasks = mockTasks.filter((task) => {
    // Tasks can be linked via dossier or lawsuit
    if (task.dossierId) {
      return clientDossiers.some((d) => d.id === task.dossierId);
    }
    if (task.lawsuitId && task.parentType === "lawsuit") {
      return clientLawsuits.some((c) => c.id === task.lawsuitId);
    }
    return false;
  });

  const openTasks = clientTasks.filter(
    (t) => t.status !== "Done" && t.status !== "Cancelled"
  );

  if (openTasks.length > 0) {
    blockers.push(
      `${openTasks.length} open Task${openTasks.length > 1 ? "s" : ""}:` +
        openTasks
          .slice(0, 3)
          .map((t) => `\n  • ${t.title} (${t.status})`)
          .join("") +
        (openTasks.length > 3
          ? `\n  • ... and ${openTasks.length - 3} other${
              openTasks.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 4: Check for open Hearings (Sessions)
  const sessionsSource =
    context.sessions || context.entities?.sessions || mockSessions || [];
  const clientSessions = sessionsSource.filter((session) => {
    // Sessions can be linked via dossier or lawsuit
    if (session.dossierId) {
      return clientDossiers.some((d) => d.id === session.dossierId);
    }
    if (session.lawsuitId) {
      return clientLawsuits.some((c) => c.id === session.lawsuitId);
    }
    return false;
  });

  const openSessions = clientSessions.filter(
    (s) => s.status !== "Completed" && s.status !== "Cancelled"
  );

  if (openSessions.length > 0) {
    blockers.push(
      `${openSessions.length} open Hearing${
        openSessions.length > 1 ? "s" : ""
      }:` +
        openSessions
          .slice(0, 3)
          .map((s) => `\n  • ${s.type || "Hearing"} on ${s.date} (${s.status})`)
          .join("") +
        (openSessions.length > 3
          ? `\n  • ... and ${openSessions.length - 3} other${
              openSessions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 5: Check for unpaid balance
  const clientFinancials = getClientFinancials(
    clientId,
    context.financialEntries ||
      context.entities?.financialEntries ||
      financialLedger
  );
  if (clientFinancials.balance < 0) {
    blockers.push(
      `Unpaid balance: ${formatCurrency(Math.abs(clientFinancials.balance))}`
    );
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Client
 */
function validateClientDelete(clientId, context = {}) {
  const blockers = [];
  const affectedEntities = [];

  const client = mockClientsExtended[clientId];
  if (!client) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  const tasks = context.tasks || context.entities?.tasks || [];
  const lawsuits = context.lawsuits || context.entities?.lawsuits || [];
  const sessions = context.sessions || context.entities?.sessions || [];
  const missions = context.missions || context.entities?.missions || [];

  const clientDossiers = client.dossiers || [];
  if (clientDossiers.length > 0) {
    affectedEntities.push({
      type: "dossiers",
      count: clientDossiers.length,
      items: clientDossiers.slice(0, 5).map((d) => ({
        id: d.id,
        label: `${d.lawsuitNumber} - ${d.title}`,
      })),
    });
  }

  const clientLawsuits = lawsuits.filter((c) =>
    clientDossiers.some((d) => d.id === c.dossierId)
  );

  if (clientLawsuits.length > 0) {
    affectedEntities.push({
      type: "lawsuits",
      count: clientLawsuits.length,
      items: clientLawsuits.slice(0, 5).map((c) => ({
        id: c.id,
        label: `${c.lawsuitNumber} - ${c.title}`,
      })),
    });
  }

  const clientTasks = tasks.filter(
    (task) =>
      (task.parentType === "dossier" &&
        clientDossiers.some((d) => d.id === task.dossierId)) ||
      (task.parentType === "lawsuit" &&
        clientLawsuits.some((c) => c.id === task.lawsuitId))
  );

  if (clientTasks.length > 0) {
    affectedEntities.push({
      type: "tasks",
      count: clientTasks.length,
      items: clientTasks.slice(0, 5).map((t) => ({
        id: t.id,
        label: t.title,
      })),
    });
  }

  const clientSessions = sessions.filter(
    (session) =>
      clientDossiers.some((d) => d.id === session.dossierId) ||
      clientLawsuits.some((c) => c.id === session.lawsuitId)
  );

  if (clientSessions.length > 0) {
    affectedEntities.push({
      type: "sessions",
      count: clientSessions.length,
      items: clientSessions.slice(0, 5).map((s) => ({
        id: s.id,
        label: `${s.type} - ${s.date}`,
      })),
    });
  }

  const clientMissions = missions.filter(
    (mission) =>
      (mission.entityType === "dossier" &&
        clientDossiers.some((d) => d.id === mission.entityId)) ||
      (mission.entityType === "lawsuit" &&
        clientLawsuits.some((c) => c.id === mission.entityId))
  );

  if (clientMissions.length > 0) {
    affectedEntities.push({
      type: "missions",
      count: clientMissions.length,
      items: clientMissions.slice(0, 5).map((m) => ({
        id: m.id,
        label: `${m.missionNumber} - ${m.title}`,
      })),
    });
  }

  const clientFinancials = financialLedger.filter(
    (entry) => entry.clientId === clientId && entry.status !== "void"
  );

  if (clientFinancials.length > 0) {
    affectedEntities.push({
      type: "financialEntries",
      count: clientFinancials.length,
      items: clientFinancials.slice(0, 5).map((e) => ({
        id: e.id,
        label: `${e.description} - ${formatCurrency(e.amount)}`,
      })),
    });
  }

  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings: buildDeleteWarnings(affectedEntities, "client"),
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: buildForceDeleteMessage(totalCount, "client"),
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

function validateClientStatusChange(clientId, context = {}) {
  const { newValue } = context;

  if (newValue === "Inactive" || newValue === "inactive") {
    return validateClientArchive(clientId, context);
  }

  return { allowed: true, blockers: [], warnings: [] };
}

/**
 * Validate editing a client
 *
 * Business Rule:
 * - If status is being changed to inActive, check if client has open dossiers
 */
function validateClientEdit(clientId, context = {}) {
  const { data, newData } = context;

  // If status is being changed, use the status change validator
  if (
    newData &&
    data &&
    newData.status !== undefined &&
    newData.status !== data.status
  ) {
    return validateClientStatusChange(clientId, { newValue: newData.status });
  }

  return { allowed: true, blockers: [], warnings: [] };
}

// ========================================
// ACCOUNTING (COMPTABILITÉ) VALIDATORS
// ========================================

/**
 * Validate editing entities from Accounting screen
 *
 * Business Rule:
 * - Accounting is a READ-ONLY reconciliation surface
 * - Users cannot edit Client/Dossier/Procès/Huissier from Accounting
 * - Only navigation (view/go to) is allowed
 */
function validateAccountingEditRestriction(entityId, context = {}) {
  return {
    allowed: false,
    blockers: [
      "Modification prohibited from Accounting screen\n\nThe Accounting screen is a read-only reconciliation surface.\nModifications must be made from the entity's dedicated screen:\n  • Clients → Clients Menu\n  • Dossiers → Dossiers Menu\n  • Lawsuits → Lawsuits Menu\n  • Bailiffs → Bailiffs Menu\n\nYou can click on the entity name to access it directly.",
    ],
    warnings: [],
  };
}

// ========================================
// PHASE 2: TASK MUTATION GUARDS
// ========================================

/**
 * Validate creating a new Task
 *
 * Business Rule:
 * - Cannot create if parent Dossier is closed/archived
 * - Cannot create if parent Procès is closed
 */
function validateTaskAdd(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get entities from context
  const dossiers = context?.entities?.dossiers || mockDossiers || [];
  const lawsuits = context?.entities?.lawsuits || mockLawsuits || [];

  // Get parent info from context (formData for new tasks)
  const parentType = context?.formData?.parentType || context?.data?.parentType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const lawsuitId = context?.formData?.lawsuitId || context?.data?.lawsuitId;

  // If no parent specified and no dossiers exist, block creation
  if (!dossierId && !lawsuitId && dossiers.length === 0) {
    blockers.push("Please add a Dossier before creating a task.");
    return { allowed: false, blockers, warnings: [] };
  }

  // Check parent based on type
  if (parentType === "dossier" && dossierId) {
    pushRelationshipMismatchBlockers(blockers, { dossierId });
    blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "task",
        operation: "create",
        dossierId,
      })
    );
    const dossier =
      dossiers.find((d) => d.id === parseInt(dossierId)) ||
      mockDossiersExtended[dossierId];
    if (!dossier) {
      warnings.push("Parent Dossier not resolved (check after saving).");
    }

    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `Cannot create a task under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.lawsuitNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to add tasks`
      );
    }
  } else if (parentType === "lawsuit" && lawsuitId) {
    pushRelationshipMismatchBlockers(blockers, { lawsuitId });
    blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "task",
        operation: "create",
        lawsuitId,
      })
    );
    const lawsuitData =
      lawsuits.find((c) => c.id === parseInt(lawsuitId)) || mockLawsuitsExtended[lawsuitId];
    if (!lawsuitData) {
      warnings.push("Parent lawsuit not resolved (check after saving).");
    }

    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `Cannot create a task under a ${lawsuitData.status.toLowerCase()} lawsuit`,
        `Lawsuit: ${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`,
        `You must first reopen the lawsuit to add tasks`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate editing a Task
 *
 * Business Rule (PHASE 2):
 * - Cannot edit if parent Dossier is Closed
 * - Cannot edit if parent Lawsuit is Closed
 */
function validateTaskEdit(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // ✅ Use provided task data if available, otherwise look it up
  const task = context.data || mockTasks.find((t) => t.id === taskId);
  if (!task) {
    return { allowed: false, blockers: ["Task not found"], warnings: [] };
  }

  pushRelationshipMismatchBlockers(blockers, {
    dossierId: task.dossierId,
    lawsuitId: task.lawsuitId,
  });
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "task",
      operation: "modify",
      dossierId: task.dossierId,
      lawsuitId: task.lawsuitId,
    })
  );

  // Check parent entity status
  if (task.parentType === "dossier" && task.dossierId) {
    const dossier = mockDossiersExtended[task.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This task belongs to Dossier "${
          dossier.lawsuitNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nModifications are no longer allowed on closed Dossiers.`
      );
    }
  } else if (task.parentType === "lawsuit" && task.lawsuitId) {
    const lawsuitData = mockLawsuitsExtended[task.lawsuitId];
    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `This task belongs to lawsuit "${lawsuitData.lawsuitNumber}" which is closed.\n\nModifications are no longer allowed on closed lawsuits.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Task
 */
function validateTaskDelete(taskId, context = {}) {
  // Same rules as edit
  return validateTaskEdit(taskId, context);
}

/**
 * Validate changing Task status
 */
function validateTaskStatusChange(taskId, context = {}) {
  // Same rules as edit
  return validateTaskEdit(taskId, context);
}

// ========================================
// PHASE 2: SÉANCE (SESSION) MUTATION GUARDS
// ========================================

/**
 * Validate creating a new Séance
 *
 * Business Rule:
 * - Cannot create if parent Dossier is closed/archived
 * - Cannot create if parent Procès is closed
 */
function validateSessionAdd(sessionId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get entities from context
  const dossiers = context?.entities?.dossiers || mockDossiers || [];
  const lawsuits = context?.entities?.lawsuits || mockLawsuits || [];

  // Get parent info from context
  const linkType = context?.formData?.linkType || context?.data?.linkType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const lawsuitId = context?.formData?.lawsuitId || context?.data?.lawsuitId;

  // If no parent specified and no dossiers exist, block creation
  if (!dossierId && !lawsuitId && dossiers.length === 0) {
    blockers.push("Please add a Dossier before scheduling a hearing.");
    return { allowed: false, blockers, warnings: [] };
  }

  // Check based on link type
  if (linkType === "dossier" && dossierId) {
    pushRelationshipMismatchBlockers(blockers, { dossierId });
    blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "hearing/session",
        operation: "create",
        dossierId,
      })
    );
    const dossier =
      dossiers.find((d) => d.id === parseInt(dossierId)) ||
      mockDossiersExtended[dossierId];
    if (!dossier) {
      // Allow submit to avoid blocking on newly created/unsynced dossier ids
      warnings.push("Parent Dossier not resolved (check after saving).");
    }

    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `Cannot create a session under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.lawsuitNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to add sessions`
      );
    }
  } else if (linkType === "lawsuit" && lawsuitId) {
    pushRelationshipMismatchBlockers(blockers, { lawsuitId });
    blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
    blockers.push(
      ...buildAncestorMutationBlockers({
        childLabel: "hearing/session",
        operation: "create",
        lawsuitId,
      })
    );
    const lawsuitData =
      lawsuits.find((c) => c.id === parseInt(lawsuitId)) || mockLawsuitsExtended[lawsuitId];
    if (!lawsuitData) {
      warnings.push("Parent lawsuit not resolved (check after saving).");
    }

    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `Cannot create a session under a ${lawsuitData.status.toLowerCase()} lawsuit`,
        `Lawsuit: ${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`,
        `You must first reopen the lawsuit to add sessions`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate editing a Séance
 *
 * Business Rule (PHASE 2):
 * - Cannot edit if parent Lawsuit is Closed
 * - Cannot edit if parent Dossier is Closed
 */
function validateSessionEdit(sessionId, context = {}) {
  const blockers = [];
  const warnings = [];

  // ✅ Use provided session data if available, otherwise look it up
  const session = context.data || mockSessions.find((s) => s.id === sessionId);
  if (!session) {
    return { allowed: false, blockers: ["Session not found"], warnings: [] };
  }

  const sessionView = {
    ...session,
    ...(context.newData || {}),
  };
  const resolvedLawsuitId =
    sessionView.lawsuitId ??
    sessionView.lawsuit_id ??
    session.lawsuitId ??
    session.lawsuit_id ??
    null;
  const resolvedDossierId =
    sessionView.dossierId ??
    sessionView.dossier_id ??
    session.dossierId ??
    session.dossier_id ??
    null;

  pushRelationshipMismatchBlockers(blockers, {
    dossierId: resolvedDossierId,
    lawsuitId: resolvedLawsuitId,
  });
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "hearing/session",
      operation: "modify",
      dossierId: resolvedDossierId,
      lawsuitId: resolvedLawsuitId,
    })
  );

  // Check if linked to a Procès
  if (resolvedLawsuitId) {
    const lawsuitData = mockLawsuitsExtended[resolvedLawsuitId];
    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `This session belongs to lawsuit "${lawsuitData.lawsuitNumber}" which is closed.\n\nModifications are no longer allowed on closed lawsuits.`
      );
    }
  }

  // Check if linked directly to a Dossier
  if (resolvedDossierId) {
    const dossier = mockDossiersExtended[resolvedDossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This session belongs to Dossier "${
          dossier.lawsuitNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nModifications are no longer allowed on closed Dossiers.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Séance
 */
function validateSessionDelete(sessionId, context = {}) {
  // Same rules as edit
  return validateSessionEdit(sessionId, context);
}

// ========================================
// PHASE 2: MISSION MUTATION GUARDS
// ========================================

/**
 * Validate creating a new Huissier Mission
 *
 * Business Rule:
 * - Cannot create if linked to a closed Dossier
 * - Cannot create if linked to a closed Procès
 */
function validateMissionAdd(missionId, context = {}) {
  const blockers = [];
  const warnings = [];
  const source = context?.formData || context?.newData || context?.data || {};

  // Get parent info from context
  const entityType = source.entityType;
  const dossierId = source.dossierId ?? source.dossier_id;
  const lawsuitId = source.lawsuitId ?? source.lawsuit_id;
  const officerId = source.officerId ?? source.officer_id;

  pushRelationshipMismatchBlockers(blockers, { dossierId, lawsuitId });
  blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "mission",
      operation: "create",
      dossierId,
      lawsuitId,
    })
  );
  if (officerId) {
    const officer = findOfficerById(officerId);
    if (!officer) blockers.push("Selected bailiff/officer was not found.");
    else if (isInactiveLike(officer.status)) {
      blockers.push(`Cannot assign mission to inactive bailiff/officer "${officer.name || officer.id}".`);
    }
  }

  // Check based on entity type
  if (entityType === "dossier" && dossierId) {
    const dossier = mockDossiersExtended[dossierId];
    if (!dossier) {
      warnings.push("Parent Dossier not resolved (check after saving).");
      return { allowed: blockers.length === 0, blockers, warnings };
    }

    if (dossier.status === "Closed") {
      blockers.push(
        `Cannot create a mission under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.lawsuitNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to create missions`
      );
    }
  } else if (entityType === "lawsuit" && lawsuitId) {
    const lawsuitData = mockLawsuitsExtended[lawsuitId];
    if (!lawsuitData) {
      warnings.push("Parent lawsuit not resolved (check after saving).");
      return { allowed: blockers.length === 0, blockers, warnings };
    }

    if (lawsuitData.status === "Closed") {
      blockers.push(
        `Cannot create a mission under a ${lawsuitData.status.toLowerCase()} lawsuit`,
        `Lawsuit: ${lawsuitData.lawsuitNumber} - ${lawsuitData.title}`,
        `You must first reopen the lawsuit to create missions`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate editing a Huissier Mission
 *
 * Business Rule (PHASE 2):
 * - Cannot edit if linked Dossier is Closed
 * - Cannot edit if linked Lawsuit is Closed
 */
function validateMissionEdit(missionId, context = {}) {
  const blockers = [];
  const warnings = [];

  // ✅ Use provided mission data if available, otherwise look it up
  let mission = context.data;
  if (!mission) {
    const allMissions = getAllMissions();
    mission = allMissions.find((m) => m.id === missionId);
  }

  if (!mission) {
    return { allowed: false, blockers: ["Mission not found"], warnings: [] };
  }

  const missionDossierId =
    mission.dossierId || (mission.entityType === "dossier" ? mission.entityId : null);
  const missionLawsuitId =
    mission.lawsuitId || (mission.entityType === "lawsuit" ? mission.entityId : null);
  pushRelationshipMismatchBlockers(blockers, {
    dossierId: missionDossierId,
    lawsuitId: missionLawsuitId,
  });
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "mission",
      operation: "modify",
      dossierId: missionDossierId,
      lawsuitId: missionLawsuitId,
    })
  );

  const nextOfficerId = context?.newData?.officerId ?? mission.officerId;
  if (nextOfficerId) {
    const officer = findOfficerById(nextOfficerId);
    if (!officer) {
      blockers.push("Selected bailiff/officer was not found.");
    } else if (isInactiveLike(officer.status)) {
      blockers.push(`Cannot assign mission to inactive bailiff/officer "${officer.name || officer.id}".`);
    }
  }

  // Check parent entity based on entityType
  if (mission.entityType === "dossier") {
    // Find dossier by lawsuitNumber (entityReference)
    const dossier = mockDossiers.find(
      (d) => d.lawsuitNumber === mission.entityReference
    );

    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This mission is linked to Dossier "${
          dossier.lawsuitNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nModifications are no longer allowed on closed Dossiers.`
      );
    }
  } else if (mission.entityType === "lawsuit") {
    // Find lawsuit by lawsuitNumber (entityReference)
    const lawsuitData = mockLawsuits.find(
      (c) => c.lawsuitNumber === mission.entityReference
    );

    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `This mission is linked to lawsuit "${lawsuitData.lawsuitNumber}" which is closed.\n\nModifications are no longer allowed on closed lawsuits.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate changing a Mission's status
 * Same rules as edit — cannot change status if parent is closed.
 */
function validateMissionStatusChange(missionId, context = {}) {
  return validateMissionEdit(missionId, context);
}

/**
 * Validate deleting a Mission
 *
 * Business Rule:
 * - Cannot delete if mission has dependent entities (financial entries, documents, notes)
 * - If dependencies exist, require force delete with cascade warning
 */
function validateMissionDelete(missionId, context = {}) {
  const blockers = [];
  const affectedEntities = [];

  const missions = context.missions || context.entities?.missions || [];
  const financialEntries =
    context.financialEntries || context.entities?.financialEntries || [];
  const documents = context.documents || context.entities?.documents || [];
  const notes = context.notes || context.entities?.notes || [];

  const mission = missions.find((m) => m.id === missionId);
  if (!mission) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  // Check for financial entries linked to this mission
  const missionFinancials = financialEntries.filter(
    (entry) => entry.missionId === missionId && entry.status !== "void"
  );

  if (missionFinancials.length > 0) {
    affectedEntities.push({
      type: "financialEntries",
      count: missionFinancials.length,
      items: missionFinancials.slice(0, 5).map((e) => ({
        id: e.id,
        label: `${e.description || e.title || "Financial Entry"} - ${formatCurrency(e.amount)}`,
      })),
    });
  }

  // Check for documents linked to this mission
  const missionDocuments = documents.filter(
    (doc) => doc.entityType === "mission" && doc.entityId === missionId
  );

  if (missionDocuments.length > 0) {
    affectedEntities.push({
      type: "documents",
      count: missionDocuments.length,
      items: missionDocuments.slice(0, 5).map((d) => ({
        id: d.id,
        label: d.name || d.fileName || `Document #${d.id}`,
      })),
    });
  }

  // Check for notes linked to this mission
  const missionNotes = notes.filter(
    (note) => note.entityType === "mission" && note.entityId === missionId
  );

  if (missionNotes.length > 0) {
    affectedEntities.push({
      type: "notes",
      count: missionNotes.length,
      items: missionNotes.slice(0, 5).map((n) => ({
        id: n.id,
        label: n.content?.substring(0, 50) || `Note #${n.id}`,
      })),
    });
  }

  // If there are affected entities, require force delete
  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings: buildDeleteWarnings(affectedEntities, "mission"),
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: buildForceDeleteMessage(totalCount, "mission"),
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

// ========================================
// PHASE 2: FINANCIAL ENTRY MUTATION GUARDS
// ========================================

/**
 * Validate adding a Financial Entry
 *
 * Business Rule (PHASE 2):
 * - Cannot add if related Dossier is Closed
 * - Cannot add if related Lawsuit is Closed
 */
function validateFinancialEntryAdd(entryId, context = {}) {
  const blockers = [];
  const warnings = [];

  const { data } = context; // New entry data being added

  if (!data) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  pushRelationshipMismatchBlockers(blockers, {
    clientId: data.clientId,
    dossierId: data.dossierId,
    lawsuitId: data.lawsuitId,
  });
  blockers.splice(0, blockers.length, ...removeNotFoundSelectionBlockers(blockers));
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "financial entry",
      operation: "create",
      clientId: data.clientId,
      dossierId: data.dossierId,
      lawsuitId: data.lawsuitId,
    })
  );

  // Check if linked to a closed Dossier
  if (data.dossierId) {
    const dossier = mockDossiersExtended[data.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `Dossier "${
          dossier.lawsuitNumber
        }" is ${dossier.status.toLowerCase()}.\n\nNo new financial entries can be added to closed Dossiers.`
      );
    }
  }

  // Check if linked to a closed Procès
  if (data.lawsuitId) {
    const lawsuitData = mockLawsuitsExtended[data.lawsuitId];
    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `Lawsuit "${lawsuitData.lawsuitNumber}" is closed.\n\nNo new financial entries can be added to closed lawsuits.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate editing a Financial Entry
 *
 * Business Rule (PHASE 2):
 * - Cannot edit if related Dossier is Fermé
 * - Cannot edit if related Procès is Clos
 * - Cannot edit if entry is already Paid/Validated
 */

const normalizeFinancialEntryId = (entryId) => {
  const parsed = parseInt(entryId, 10);
  return Number.isNaN(parsed) ? entryId : parsed;
};

function validateFinancialEntryEdit(entryId, context = {}) {
  const blockers = [];
  const warnings = [];
  let requiresConfirmation = false;
  const impactSummary = [];

  // Use the data from context if available, otherwise fall back to financialLedger
  const entry =
    context.data ||
    financialLedger.find((e) => e.id === normalizeFinancialEntryId(entryId));

  if (!entry) {
    return {
      allowed: false,
      blockers: ["Financial entry not found"],
      warnings: [],
    };
  }

  pushRelationshipMismatchBlockers(blockers, {
    clientId: entry.clientId,
    dossierId: entry.dossierId,
    lawsuitId: entry.lawsuitId,
  });
  blockers.push(
    ...buildAncestorMutationBlockers({
      childLabel: "financial entry",
      operation: "modify",
      clientId: entry.clientId,
      dossierId: entry.dossierId,
      lawsuitId: entry.lawsuitId,
    })
  );

  // Rule 1: Paid entries are editable but require explicit confirmation
  if (entry.status === "Payée" || entry.status === "paid") {
    warnings.push(t("financialEntry.edit.warning.entryPaid"));
    impactSummary.push(t("financialEntry.edit.warning.lead"));
    impactSummary.push(`- ${t("financialEntry.edit.warning.balanceImpact")}`);
    impactSummary.push(`- ${t("financialEntry.edit.warning.auditTrail")}`);
    impactSummary.push(`- ${t("financialEntry.edit.warning.visibility")}`);
    requiresConfirmation = true;
  }

  // Rule 2: Check parent Dossier
  if (entry.dossierId) {
    const dossier = mockDossiersExtended[entry.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This entry is linked to Dossier "${
          dossier.lawsuitNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nEntries from closed Dossiers cannot be modified.`
      );
    }
  }

  // Rule 3: Check parent Procès
  if (entry.lawsuitId) {
    const lawsuitData = mockLawsuitsExtended[entry.lawsuitId];
    if (lawsuitData && lawsuitData.status === "Closed") {
      blockers.push(
        `This entry is linked to lawsuit "${lawsuitData.lawsuitNumber}" which is closed.\n\nEntries from closed lawsuits cannot be modified.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings, requiresConfirmation, impactSummary };
}

/**
 * Validate deleting a Financial Entry
 *
 * Business Rule (PHASE 2):
 * - Cannot delete if entry is Paid/Validated
 * - Cannot delete if related to closed parent
 */
function validateFinancialEntryDelete(entryId, context = {}) {
  const blockers = [];
  const warnings = [];
  let requiresConfirmation = false;
  const impactSummary = [];

  const entry =
    context.data ||
    financialLedger.find((e) => e.id === normalizeFinancialEntryId(entryId));
  if (!entry) {
    return {
      allowed: false,
      blockers: [t("financialEntry.delete.blocked.entryNotFound")],
      warnings: [],
    };
  }

  const statusValue = (entry.status || "").toLowerCase();
  const paidStatuses = ["payée", "payee", "payé", "paye", "payace", "paid"];
  if (paidStatuses.includes(statusValue)) {
    warnings.push(t("financialEntry.delete.warning.entryPaid"));
    impactSummary.push(t("financialEntry.delete.warning.lead"));
    impactSummary.push(`- ${t("financialEntry.delete.warning.balanceImpact")}`);
    impactSummary.push(`- ${t("financialEntry.delete.warning.auditTrail")}`);
    requiresConfirmation = true;
  }

  const editValidation = validateFinancialEntryEdit(entryId, context);
  if (!editValidation.allowed) {
    blockers.push(...editValidation.blockers);
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings, requiresConfirmation, impactSummary };
}

function validateFinancialEntryStatusChange(entryId, context = {}) {
  // Allow marking as paid even if parent is closed (business requirement)
  // But still check if entry is already paid
  const blockers = [];
  const warnings = [];
  let requiresConfirmation = false;
  const impactSummary = [];

  const entry = financialLedger.find(
    (e) => e.id === normalizeFinancialEntryId(entryId)
  );
  if (!entry) {
    return {
      allowed: false,
      blockers: ["Financial entry not found"],
      warnings: [],
    };
  }

  const { newValue } = context;

  const hierarchyBlockers = buildAncestorMutationBlockers({
    childLabel: "financial entry",
    operation: "change status of",
    clientId: entry.clientId,
    dossierId: entry.dossierId,
    lawsuitId: entry.lawsuitId,
  });
  if (hierarchyBlockers.length > 0) {
    blockers.push(...hierarchyBlockers);
  }

  // If trying to change FROM paid status, require confirmation but allow
  if (entry.status === "Payée" || entry.status === "paid") {
    if (newValue !== "Payée" && newValue !== "paid") {
      warnings.push(t("financialEntry.changeStatus.warning.alreadyPaid"));
      impactSummary.push(t("financialEntry.changeStatus.warning.lead"));
      impactSummary.push(
        `- ${t("financialEntry.changeStatus.warning.balanceImpact")}`
      );
      impactSummary.push(
        `- ${t("financialEntry.changeStatus.warning.auditTrail")}`
      );
      requiresConfirmation = true;
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings, requiresConfirmation, impactSummary };
}

// ========================================
// OFFICER VALIDATORS
// ========================================

/**
 * Validate editing an Officer (Huissier)
 *
 * Business Rules:
 * - For now, officers can be edited without restrictions
 * - Future rules could include: cannot edit if has active missions, etc.
 */
function validateOfficerEdit(officerId, context = {}) {
  const blockers = [];
  const warnings = [];
  const officer = context.data || findOfficerById(officerId);
  if (!officer) {
    return { allowed: false, blockers: ["Officer not found"], warnings: [] };
  }
  const nextStatus = context?.newData?.status;
  if (nextStatus && isInactiveLike(nextStatus)) {
    const activeMissions = getAllMissions().filter(
      (m) =>
        String(m.officerId) === String(officerId) &&
        !["completed", "cancelled", "closed"].includes(norm(m.status))
    );
    if (activeMissions.length > 0) {
      blockers.push(
        `Cannot set this bailiff/officer inactive while ${activeMissions.length} active mission${
          activeMissions.length > 1 ? "s are" : " is"
        } assigned.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting an Officer (Huissier)
 *
 * Business Rules:
 * - Cannot delete if officer has missions
 * - Cannot delete if officer has financial entries (directly or via missions)
 * - These are CASCADE blockers - not resolvable, require explicit confirmation
 */
function validateOfficerDelete(officerId, context = {}) {
  const affectedEntities = [];

  // Get all missions for this officer
  const missionsWithOfficer = getAllMissions().filter(
    (m) => m.officerId === officerId
  );

  // Add missions to affected entities
  if (missionsWithOfficer.length > 0) {
    affectedEntities.push({
      type: "missions",
      count: missionsWithOfficer.length,
      items: missionsWithOfficer.slice(0, 5).map((m) => ({
        id: m.id,
        label: `${m.missionNumber || m.id} - ${m.title || "Mission"}`,
      })),
    });
  }

  // Get financial entries linked to these missions
  const missionIds = missionsWithOfficer.map((m) => m.id);
  const financialEntries = financialLedger.filter(
    (e) => missionIds.includes(e.missionId) && e.status !== "cancelled"
  );

  // Add financial entries to affected entities
  if (financialEntries.length > 0) {
    affectedEntities.push({
      type: "financialEntries",
      count: financialEntries.length,
      items: financialEntries.slice(0, 5).map((e) => ({
        id: e.id,
        label: `${e.description || "Financial entry"} - ${formatCurrency(e.amount)}`,
      })),
    });
  }

  // If there are affected entities, return CASCADE warning with force delete option
  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings: buildDeleteWarnings(affectedEntities, "officer"),
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: buildForceDeleteMessage(totalCount, "officer"),
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

// ========================================
// PERSONAL TASK VALIDATORS
// ========================================

/**
 * Validate editing a Personal Task
 *
 * Business Rules:
 * - For now, personal tasks can be edited without restrictions
 * - Personal tasks are independent and not linked to clients/dossiers
 */
function validatePersonalTaskEdit(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // No specific business rules defined yet for personal task editing
  // Personal tasks are generally editable unless specific constraints are identified

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Personal Task
 *
 * Business Rules:
 * - For now, personal tasks can be deleted without restrictions
 * - Future rules could include: cannot delete completed tasks older than X days, etc.
 */
function validatePersonalTaskDelete(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // No specific business rules defined yet for personal task deletion
  // Personal tasks are generally deletable unless specific constraints are identified

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate changing status of a Personal Task
 *
 * Business Rules:
 * - For now, personal task status can be changed without restrictions
 * - Status changes are always allowed for personal tasks
 */
function validatePersonalTaskStatusChange(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // No specific business rules defined yet for personal task status changes
  // Status transitions are generally allowed for personal tasks

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Determine direction based on entry type and scope
 * Helper for legacy entries that don't have direction set
 * @param {object} entry - Financial entry
 * @returns {string} receivable | payable
 */
function determineEntryDirection(entry) {
  // Use existing direction if set
  if (entry.direction) return entry.direction;

  // Internal scope = firm expense = payable
  if (entry.scope === "internal") return "payable";

  // Client-scoped entries = client owes = receivable
  return "receivable";
}

/**
 * Check if status represents cancelled/void entry
 * @param {string} status - Entry status
 * @returns {boolean}
 */
function isCancelledStatus(status) {
  if (!status) return false;
  const lowered = String(status).toLowerCase();
  return ["void", "cancelled", "annulé"].includes(lowered);
}

/**
 * Check if entry is paid (has paid_at set or status indicates paid)
 * @param {object} entry - Financial entry
 * @returns {boolean}
 */
function isEntryPaid(entry) {
  if (entry.isPaid) return true;
  if (entry.paidAt || entry.paid_at) return true;

  const status = String(entry.status || "").toLowerCase();
  return ["paid", "payé", "payée"].includes(status);
}

/**
 * Calculate client RECEIVABLE balance for closure validation
 *
 * FINANCIAL STABILIZATION (Phase 1):
 * - Only considers receivable entries (client owes money)
 * - Ignores payable/internal entries (firm's expenses, not client's debt)
 * - Excludes cancelled entries
 *
 * @param {number} clientId - Client ID
 * @param {Array} entriesOverride - Optional financial entries to use instead of the global ledger
 * @returns {object} { hasOutstanding, outstandingBalance, unpaidEntries }
 */
function getClientFinancials(clientId, entriesOverride = null) {
  const ledger = entriesOverride || financialLedger || [];

  // Filter to client's receivable entries only (what client owes)
  const clientReceivables = ledger.filter((entry) => {
    // Must belong to this client
    if (entry.clientId !== clientId) return false;

    // Exclude cancelled entries
    if (isCancelledStatus(entry.status)) return false;

    // Only receivable direction (client owes money)
    const direction = determineEntryDirection(entry);
    return direction === "receivable";
  });

  let totalOwed = 0;
  let totalPaid = 0;
  const unpaidEntries = [];

  clientReceivables.forEach((entry) => {
    const amount = Number(entry.amount || 0);
    totalOwed += amount;

    if (isEntryPaid(entry)) {
      totalPaid += amount;
    } else {
      unpaidEntries.push(entry);
    }
  });

  const outstandingBalance = totalOwed - totalPaid;

  return {
    totalInvoiced: totalOwed,
    totalPaid,
    // balance: negative = client owes money (legacy convention kept for compatibility)
    balance: totalPaid - totalOwed,
    // New fields for clarity
    outstandingBalance,
    hasOutstanding: outstandingBalance > 0,
    unpaidEntries,
    unpaidCount: unpaidEntries.length,
  };
}

/**
 * Format blocker messages for display in UI
 *
 * @param {string[]} blockers - Array of blocker messages
 * @returns {string} Formatted message for display
 */
export function formatBlockerMessage(blockers) {
  if (!blockers || blockers.length === 0) {
    return "";
  }

  const header =
    "This action cannot be performed for the following reasons:\n\n";
  const body = blockers
    .map((blocker, index) => {
      // If blocker already has bullet points, keep formatting
      if (blocker.includes("\n  •")) {
        return blocker;
      }
      // Otherwise, add bullet
      return `• ${blocker}`;
    })
    .join("\n\n");

  return header + body;
}

/**
 * Format warning messages for display in UI
 *
 * @param {string[]} warnings - Array of warning messages
 * @returns {string} Formatted message for display
 */
export function formatWarningMessage(warnings) {
  if (!warnings || warnings.length === 0) {
    return "";
  }

  const header = "Warning:\n\n";
  const body = warnings.map((warning) => `⚠ ${warning}`).join("\n");

  return header + body;
}

// Export all validators for testing
export const validators = VALIDATORS;





