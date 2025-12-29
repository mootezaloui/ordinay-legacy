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
let mockCasesExtended = {};
let mockClientsExtended = {};
let mockClients = [];
let mockDossiers = [];
let mockTasks = [];
let mockCases = [];
let mockSessions = [];
let mockOfficers = [];
let mockOfficersExtended = {};
let financialLedger = [];
let missionsCache = [];
const getAllMissions = () => missionsCache;

import { validateTemporalConstraints } from "./temporalValidation";
import { enrichBlockers } from "./blockerEnrichment";

// Build in-memory snapshots from the live entities supplied in context.entities
const loadContextData = (context = {}) => {
  const entities = context.entities || {};
  mockClients = entities.clients || [];
  mockDossiers = entities.dossiers || [];
  mockCases = entities.cases || [];
  mockTasks = entities.tasks || [];
  mockSessions = entities.sessions || [];
  missionsCache = entities.missions || [];
  mockOfficers = entities.officers || [];
  financialLedger = entities.financialEntries || [];

  const casesById = new Map(mockCases.map((c) => [c.id, c]));

  mockDossiersExtended = mockDossiers.reduce((acc, dossier) => {
    const proceedings = mockCases.filter((c) => c.dossierId === dossier.id);
    const dossierTasks = mockTasks.filter(
      (task) =>
        (task.parentType === "dossier" && task.dossierId === dossier.id) ||
        (task.parentType === "case" &&
          proceedings.some((p) => p.id === task.caseId))
    );
    const dossierSessions = mockSessions.filter(
      (session) =>
        session.dossierId === dossier.id ||
        proceedings.some((p) => p.id === session.caseId)
    );
    const dossierMissions = missionsCache.filter(
      (mission) =>
        (mission.entityType === "dossier" && mission.entityId === dossier.id) ||
        (mission.entityType === "case" &&
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

  mockCasesExtended = mockCases.reduce((acc, caseItem) => {
    acc[caseItem.id] = {
      ...caseItem,
      tasks: mockTasks.filter(
        (task) => task.parentType === "case" && task.caseId === caseItem.id
      ),
      sessions: mockSessions.filter(
        (session) => session.caseId === caseItem.id
      ),
      missions: missionsCache.filter(
        (mission) =>
          mission.entityType === "case" && mission.entityId === caseItem.id
      ),
    };
    return acc;
  }, {});

  mockClientsExtended = mockClients.reduce((acc, client) => {
    const clientDossiers = mockDossiers.filter((d) => d.clientId === client.id);
    const clientCases = mockCases.filter((c) =>
      clientDossiers.some((d) => d.id === c.dossierId)
    );
    acc[client.id] = {
      ...client,
      dossiers: clientDossiers,
      proceedings: clientCases,
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
 * @param {string} entityType - Type of entity (dossier, case, client, etc.)
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

  const actionValidator = validator[action];

  let result = { allowed: true, blockers: [], warnings: [] };

  if (actionValidator) {
    try {
      result = actionValidator(entityId, context);
    } catch (error) {
      console.error(`Error validating ${entityType}.${action}:`, error);
      return {
        allowed: false,
        blockers: ["An unexpected error occurred. Please try again."],
        warnings: [],
      };
    }
  }

  // TEMPORAL VALIDATION: Apply date/time validation to all create and edit actions
  if (
    (action === "create" || action === "add" || action === "edit") &&
    context.newData
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
    case: detectCaseImpact,
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
      field: "Mission Number",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        "• The mission reference will be modified",
        "• All documents and reports will need to be updated",
        "• Financial entries will retain the new reference",
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
        field: "Bailiff",
        from: oldOfficer?.name,
        to: newOfficer?.name,
        impact: [
          "• The mission will be removed from the current bailiff",
          "• Follow-up responsibility will change",
          "• Mission history will be preserved",
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  // Build comprehensive impact summary
  const impactSummary = [];
  changes.forEach((change) => {
    impactSummary.push(
      `**${change.field} actuel** : ${change.from || "Non défini"}`
    );
    impactSummary.push(
      `**${change.field} nouveau** : ${change.to || "Non défini"}`
    );
    impactSummary.push("");
    impactSummary.push("**Impact** :");
    impactSummary.push(...change.impact);
    impactSummary.push("");
  });

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

  // Check for reference/number change
  const referenceField = "caseNumber";
  if (
    referenceField in newData &&
    currentData[referenceField] !== newData[referenceField]
  ) {
    changes.push({
      type: "reference_change",
      field: "Numéro de dossier",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        "• The Dossier reference will be modified",
        "• All linked cases will retain their link with this Dossier",
        "• Documents and reports will need to be updated",
        "• Financial entries will retain the new reference",
      ],
    });
  }

  // Check for client reassignment
  if ("clientId" in newData) {
    const clientIdChanged = currentData.clientId != newData.clientId;

    if (clientIdChanged) {
      // Get client names for better UX
      const oldClient = [].find((c) => c.id == currentData.clientId);
      const newClient = [].find((c) => c.id == newData.clientId);

      changes.push({
        type: "client_reassignment",
        field: "Client",
        from: oldClient?.name,
        to: newClient?.name,
        impact: [
          "• All linked cases will remain attached to this Dossier",
          "• Financial entries will remain associated with the Dossier",
          "• The Dossier will now appear under the new client",
          "• Tracking indicators will be recalculated",
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  // Build comprehensive impact summary
  const impactSummary = [];
  changes.forEach((change) => {
    impactSummary.push(
      `**${change.field} actuel** : ${change.from || "Non défini"}`
    );
    impactSummary.push(
      `**${change.field} nouveau** : ${change.to || "Non défini"}`
    );
    impactSummary.push("");
    impactSummary.push("**Impact** :");
    impactSummary.push(...change.impact);
    impactSummary.push("");
  });

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: changes[0], // Primary change for backward compatibility
  };
}

/**
 * Detect Procès (Case) → Dossier reassignment
 */
function detectCaseImpact(currentData, newData) {
  const changes = [];

  // Check for reference/number change
  const referenceField = "caseNumber";
  if (
    referenceField in newData &&
    currentData[referenceField] !== newData[referenceField]
  ) {
    changes.push({
      type: "reference_change",
      field: "Lawsuit Number",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        "• The case reference will be modified",
        "• All linked sessions will retain their link with this case",
        "• Documents and reports will need to be updated",
        "• Financial entries will retain the new reference",
      ],
    });
  }

  // Check for dossier reassignment
  if ("dossierId" in newData) {
    const dossierIdChanged = currentData.dossierId != newData.dossierId;

    if (dossierIdChanged) {
      // Get dossier info for better UX
      const oldDossier = [].find((d) => d.id == currentData.dossierId);
      const newDossier = [].find((d) => d.id == newData.dossierId);

      changes.push({
        type: "dossier_reassignment",
        field: "Dossier",
        from: `${oldDossier?.caseNumber || "Non assigné"} - ${
          oldDossier?.title || ""
        }`,
        to: `${newDossier?.caseNumber || "Non assigné"} - ${
          newDossier?.title || ""
        }`,
        impact: [
          "• The linked client may change",
          "• Financial entries will be aggregated under the new Dossier",
          "• Tasks and sessions linked to the case will be moved",
          "• Tracking indicators will be recalculated",
        ],
      });
    }
  }

  if (changes.length === 0) {
    return { requiresConfirmation: false };
  }

  // Build comprehensive impact summary
  const impactSummary = [];
  changes.forEach((change) => {
    impactSummary.push(
      `**${change.field} actuel** : ${change.from || "Non défini"}`
    );
    impactSummary.push(
      `**${change.field} nouveau** : ${change.to || "Non défini"}`
    );
    impactSummary.push("");
    impactSummary.push("**Impact** :");
    impactSummary.push(...change.impact);
    impactSummary.push("");
  });

  return {
    requiresConfirmation: true,
    impactSummary,
    changeDetails: changes[0], // Primary change for backward compatibility
  };
}

/**
 * Detect Task → Parent reassignment (Dossier or Procès)
 */
function detectTaskImpact(currentData, newData) {
  // ✅ Only check if parent fields are actually being changed (present in newData)
  const parentTypeInNewData = "parentType" in newData;
  const dossierIdInNewData = "dossierId" in newData;
  const caseIdInNewData = "caseId" in newData;

  // If none of these fields are being changed, no impact
  if (!parentTypeInNewData && !dossierIdInNewData && !caseIdInNewData) {
    return { requiresConfirmation: false };
  }

  // Check if parent type changed
  const parentTypeChanged =
    parentTypeInNewData && currentData.parentType !== newData.parentType;

  // Check if parent ID changed (within same type)
  const dossierIdChanged =
    dossierIdInNewData && currentData.dossierId !== newData.dossierId;
  const caseIdChanged =
    caseIdInNewData && currentData.caseId !== newData.caseId;

  const hasParentChange =
    parentTypeChanged || dossierIdChanged || caseIdChanged;

  if (!hasParentChange) {
    return { requiresConfirmation: false };
  }

  // Determine old and new parent info
  let oldParentLabel = "Not assigned";
  let newParentLabel = "Not assigned";

  if (currentData.parentType === "dossier" && currentData.dossierId) {
    const dossier = [].find((d) => d.id == currentData.dossierId);
    oldParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  } else if (currentData.parentType === "case" && currentData.caseId) {
    const caseData = [].find((c) => c.id == currentData.caseId);
    oldParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  }

  if (newData.parentType === "dossier" && newData.dossierId) {
    const dossier = [].find((d) => d.id == newData.dossierId);
    newParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  } else if (newData.parentType === "case" && newData.caseId) {
    const caseData = [].find((c) => c.id == newData.caseId);
    newParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  }

  const impactSummary = [
    `**Current parent** : ${oldParentLabel}`,
    `**New parent** : ${newParentLabel}`,
    "",
    "**Impact** :",
    "• The task will be removed from its current context",
    "• Tracking indicators will be recalculated",
    "• Task history will be preserved",
  ];

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

/**
 * Detect Session (Audience) → Parent reassignment (Case or Dossier)
 */
function detectSessionImpact(currentData, newData) {
  // ✅ Only check if parent fields are actually being changed (present in newData)
  const caseIdInNewData = "caseId" in newData;
  const dossierIdInNewData = "dossierId" in newData;

  // If neither field is being changed, no impact
  if (!caseIdInNewData && !dossierIdInNewData) {
    return { requiresConfirmation: false };
  }

  // Check if parent changed
  const caseIdChanged = caseIdInNewData && currentData.caseId != newData.caseId;
  const dossierIdChanged =
    dossierIdInNewData && currentData.dossierId != newData.dossierId;

  if (!caseIdChanged && !dossierIdChanged) {
    return { requiresConfirmation: false };
  }

  // Determine old and new parent info
  let oldParentLabel = "Not assigned";
  let newParentLabel = "Not assigned";

  if (currentData.caseId) {
    const caseData = [].find((c) => c.id == currentData.caseId);
    oldParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  } else if (currentData.dossierId) {
    const dossier = [].find((d) => d.id == currentData.dossierId);
    oldParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  }

  if (newData.caseId) {
    const caseData = [].find((c) => c.id == newData.caseId);
    newParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  } else if (newData.dossierId) {
    const dossier = [].find((d) => d.id == newData.dossierId);
    newParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  }

  const impactSummary = [
    `**Current attachment** : ${oldParentLabel}`,
    `**New attachment** : ${newParentLabel}`,
    "",
    "**Impact** :",
    "• The session will be removed from its current context",
    "• Tracking indicators will be recalculated",
    "• Session history will be preserved",
  ];

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
  case: {
    add: validateCaseAdd, // NEW: Prevent creating lawsuit under closed dossier
    close: validateCaseClose,
    delete: validateCaseDelete,
    changeStatus: validateCaseStatusChange,
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
    editCase: validateAccountingEditRestriction,
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

  // 🐛 DEBUG: Log to see what we're receiving
  console.log("🔍 validateDossierAdd DEBUG:", {
    clientsCount: clients.length,
    formData,
    clientIdInForm: formData.clientId,
    contextKeys: Object.keys(context),
    fullContext: context,
  });

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
      (task.parentType === "case" &&
        dossier.proceedings?.some((proc) => proc.id === task.caseId))
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

  // Rule 2: Check for open Procès (cases)
  const allCases = context.cases || context.entities?.cases || mockCases || [];
  const dossierCases = allCases.filter(
    (c) => String(c.dossierId) === String(dossierId)
  );
  const openCases = dossierCases.filter(
    (proc) => proc.status !== "Closed"
  );

  if (openCases.length > 0) {
    blockers.push(
      `${openCases.length} open Lawsuit${openCases.length > 1 ? "s" : ""}:` +
        openCases
          .slice(0, 3)
          .map((c) => `\n  • ${c.caseNumber} - ${c.title} (${c.status})`)
          .join("") +
        (openCases.length > 3
          ? `\n  • ... and ${openCases.length - 3} other${
              openCases.length - 3 > 1 ? "s" : ""
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
      `Unpaid balance: ${Math.abs(clientFinancials.balance).toFixed(2)} TND`
    );
  }

  // Rule 4: Check for upcoming/incomplete sessions (hearings)
  const allSessions =
    context.sessions ||
    context.entities?.sessions ||
    mockSessions ||
    [];

  // Get sessions for this dossier and its related cases
  const dossierSessions = allSessions.filter((session) => {
    if (session.dossierId === dossierId) {
      return true;
    }
    if (session.caseId && dossierCases.some((c) => c.id === session.caseId)) {
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
          .map(
            (s) => `\n  - ${s.type || "Hearing"} on ${s.date} (${s.status})`
          )
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
      mission.entityReference === dossier.caseNumber &&
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
  const warnings = [];
  const affectedEntities = [];

  const tasks = context.tasks || context.entities?.tasks || [];
  const cases = context.cases || context.entities?.cases || [];
  const sessions = context.sessions || context.entities?.sessions || [];
  const missions = context.missions || context.entities?.missions || [];
  const financialEntries =
    context.financialEntries || context.entities?.financialEntries || [];

  // Use enriched data from mockDossiersExtended if available, otherwise fallback to context
  const dossier =
    mockDossiersExtended[dossierId] ||
    mockDossiersExtended[Number(dossierId)] ||
    (context.dossiers || context.entities?.dossiers || []).find(
      (d) => String(d.id) === String(dossierId)
    );

  if (!dossier) {
    // Allow deletion if dossier is already missing (e.g., local-only app, already deleted)
    return { allowed: true, blockers: [], warnings: [] };
  }

  // Check for related Procès (cases)
  const dossierCases = cases.filter(
    (c) => String(c.dossierId) === String(dossierId)
  );
  if (dossierCases.length > 0) {
    affectedEntities.push({
      type: "cases",
      count: dossierCases.length,
      items: dossierCases.slice(0, 5).map((c) => ({
        id: c.id,
        label: `${c.caseNumber} - ${c.title}`,
      })),
    });

    warnings.push(
      `This Dossier contains ${dossierCases.length} case${
        dossierCases.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for related Tasks
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

    warnings.push(
      `This Dossier contains ${dossierTasks.length} task${
        dossierTasks.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for related Sessions
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

    warnings.push(
      `This Dossier contains ${dossierSessions.length} session${
        dossierSessions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for related Missions
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

    warnings.push(
      `This Dossier contains ${dossierMissions.length} mission${
        dossierMissions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for financial entries
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
        label: `${e.description} - ${e.amount} TND`,
      })),
    });

    warnings.push(
      `This Dossier has ${dossierFinancials.length} financial ${
        dossierFinancials.length > 1 ? "entries" : "entry"
      } that will be deleted.`
    );
  }

  // If there are affected entities, require force delete instead of blocking
  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings,
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: `⚠️ Warning: Deleting this Dossier will also delete ${totalCount} linked entit${
        totalCount > 1 ? "ies" : "y"
      } (cases, tasks, sessions, missions, financial entries). This action is irreversible.`,
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

/**
 * Validate status change for Dossier
 *
 * Specific validation when changing status to "Closed"
 */
function validateDossierStatusChange(dossierId, context = {}) {
  const { newValue } = context;

  if (newValue === "Closed") {
    return validateDossierClose(dossierId, context);
  }

  // For other status changes, allow by default
  return { allowed: true, blockers: [], warnings: [] };
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
function validateCaseAdd(caseId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Get entities from context
  const dossiers = context?.entities?.dossiers || mockDossiers || [];

  // Get the parent dossier ID from context
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;

  if (!dossierId) {
    // No dossier specified - check if there are any dossiers available
    if (dossiers.length === 0) {
      blockers.push("Please add a Dossier before creating a case.");
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
  if (dossier.status === "Closed") {
    blockers.push(
      `Cannot create a case under a ${dossier.status.toLowerCase()} Dossier`,
      `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
      `You must first reopen the Dossier to add cases`
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
function validateCaseClose(caseId, context = {}) {
  const blockers = [];
  const warnings = [];

  const sessions =
    context.sessions || context.entities?.sessions || mockSessions || [];
  const tasks = context.tasks || context.entities?.tasks || mockTasks || [];

  // Fetch case data
  const caseData =
    mockCasesExtended[caseId] ||
    mockCasesExtended[Number(caseId)] ||
    (context.cases || context.entities?.cases || []).find(
      (c) => String(c.id) === String(caseId)
    );

  if (!caseData) {
    return { allowed: false, blockers: ["Case not found"], warnings: [] };
  }

  // Rule 1: Check for upcoming or incomplete Séances
  const caseSessions = sessions.filter(
    (session) => String(session.caseId) === String(caseId)
  );

  const today = new Date();
  const upcomingSessions = caseSessions.filter((session) => {
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
  const caseTasks = tasks.filter(
    (task) =>
      task.parentType === "case" && String(task.caseId) === String(caseId)
  );

  const incompleteTasks = caseTasks.filter(
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
  const caseMissions = allMissions.filter(
    (mission) =>
      mission.entityType === "case" &&
      mission.entityReference === caseData.caseNumber &&
      mission.status !== "Completed" &&
      mission.status !== "Cancelled"
  );

  if (caseMissions.length > 0) {
    blockers.push(
      `${caseMissions.length} active bailiff mission${
        caseMissions.length > 1 ? "s" : ""
      } :` +
        caseMissions
          .slice(0, 3)
          .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
          .join("") +
        (caseMissions.length > 3
          ? `\n  • ... and ${caseMissions.length - 3} other${
              caseMissions.length - 3 > 1 ? "s" : ""
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
function validateCaseDelete(caseId, context = {}) {
  const blockers = [];
  const warnings = [];
  const affectedEntities = [];

  const sessions = context.sessions || context.entities?.sessions || [];
  const tasks = context.tasks || context.entities?.tasks || [];
  const missions = context.missions || context.entities?.missions || [];

  const caseData =
    mockCasesExtended[caseId] ||
    mockCasesExtended[Number(caseId)] ||
    (context.cases || context.entities?.cases || []).find(
      (c) => String(c.id) === String(caseId)
    );

  if (!caseData) {
    // Allow deletion if case is already missing (e.g., local-only app, already deleted)
    return { allowed: true, blockers: [], warnings: [] };
  }

  // Check for related Séances
  const caseSessions = sessions.filter(
    (session) => String(session.caseId) === String(caseId)
  );

  if (caseSessions.length > 0) {
    affectedEntities.push({
      type: "sessions",
      count: caseSessions.length,
      items: caseSessions.slice(0, 5).map((s) => ({
        id: s.id,
        label: `${s.type} - ${s.date}`,
      })),
    });

    warnings.push(
      `This case contains ${caseSessions.length} session${
        caseSessions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for related Tasks
  const caseTasks = tasks.filter(
    (task) =>
      task.parentType === "case" && String(task.caseId) === String(caseId)
  );

  if (caseTasks.length > 0) {
    affectedEntities.push({
      type: "tasks",
      count: caseTasks.length,
      items: caseTasks.slice(0, 5).map((t) => ({
        id: t.id,
        label: t.title,
      })),
    });

    warnings.push(
      `This case contains ${caseTasks.length} task${
        caseTasks.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for related Missions
  const caseMissions = missions.filter(
    (mission) =>
      mission.entityType === "case" &&
      String(mission.entityId) === String(caseId)
  );

  if (caseMissions.length > 0) {
    affectedEntities.push({
      type: "missions",
      count: caseMissions.length,
      items: caseMissions.slice(0, 5).map((m) => ({
        id: m.id,
        label: `${m.missionNumber} - ${m.title}`,
      })),
    });

    warnings.push(
      `This case contains ${caseMissions.length} mission${
        caseMissions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // If there are affected entities, require force delete instead of blocking
  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings,
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: `⚠️ Warning: Deleting this case will also delete ${totalCount} linked entit${
        totalCount > 1 ? "ies" : "y"
      } (sessions, tasks, missions). This action is irreversible.`,
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

/**
 * Validate status change for Procès
 */
function validateCaseStatusChange(caseId, context = {}) {
  const { newValue } = context;

  if (newValue === "Closed") {
    return validateCaseClose(caseId, context);
  }

  return { allowed: true, blockers: [], warnings: [] };
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
  const openDossiers = clientDossiers.filter(
    (d) => d.status !== "Closed"
  );

  if (openDossiers.length > 0) {
    blockers.push(
      `${openDossiers.length} open Dossier${
        openDossiers.length > 1 ? "s" : ""
      }:` +
        openDossiers
          .slice(0, 3)
          .map((d) => `\n  • ${d.caseNumber} - ${d.title} (${d.status})`)
          .join("") +
        (openDossiers.length > 3
          ? `\n  • ... and ${openDossiers.length - 3} other${
              openDossiers.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for open Lawsuits (Cases)
  const clientCases = clientExtended.proceedings || [];
  const openCases = clientCases.filter(
    (c) => c.status !== "Closed"
  );

  if (openCases.length > 0) {
    blockers.push(
      `${openCases.length} open Lawsuit${openCases.length > 1 ? "s" : ""}:` +
        openCases
          .slice(0, 3)
          .map((c) => `\n  • ${c.caseNumber} - ${c.title} (${c.status})`)
          .join("") +
        (openCases.length > 3
          ? `\n  • ... and ${openCases.length - 3} other${
              openCases.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 3: Check for open Tasks
  const clientTasks = mockTasks.filter((task) => {
    // Tasks can be linked via dossier or case
    if (task.dossierId) {
      return clientDossiers.some((d) => d.id === task.dossierId);
    }
    if (task.caseId && task.parentType === "case") {
      return clientCases.some((c) => c.id === task.caseId);
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
    context.sessions ||
    context.entities?.sessions ||
    mockSessions ||
    [];
  const clientSessions = sessionsSource.filter((session) => {
    // Sessions can be linked via dossier or case
    if (session.dossierId) {
      return clientDossiers.some((d) => d.id === session.dossierId);
    }
    if (session.caseId) {
      return clientCases.some((c) => c.id === session.caseId);
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
      `Unpaid balance: ${Math.abs(clientFinancials.balance).toFixed(2)} TND`
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
  const warnings = [];
  const affectedEntities = [];

  const client = mockClientsExtended[clientId];
  // PATCH: Allow delete if client is not found (already deleted)
  if (!client) {
    return { allowed: true, blockers: [], warnings: [] };
  }

  const tasks = context.tasks || context.entities?.tasks || [];
  const cases = context.cases || context.entities?.cases || [];
  const sessions = context.sessions || context.entities?.sessions || [];
  const missions = context.missions || context.entities?.missions || [];

  // Check for related Dossiers
  const clientDossiers = client.dossiers || [];
  if (clientDossiers.length > 0) {
    affectedEntities.push({
      type: "dossiers",
      count: clientDossiers.length,
      items: clientDossiers.slice(0, 5).map((d) => ({
        id: d.id,
        label: `${d.caseNumber} - ${d.title}`,
      })),
    });

    warnings.push(
      `This client has ${clientDossiers.length} Dossier${
        clientDossiers.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for cases (lawsuits) under client dossiers
  const clientCases = cases.filter((c) =>
    clientDossiers.some((d) => d.id === c.dossierId)
  );

  if (clientCases.length > 0) {
    affectedEntities.push({
      type: "cases",
      count: clientCases.length,
      items: clientCases.slice(0, 5).map((c) => ({
        id: c.id,
        label: `${c.caseNumber} - ${c.title}`,
      })),
    });

    warnings.push(
      `This client has ${clientCases.length} lawsuit${
        clientCases.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for tasks under client dossiers/cases
  const clientTasks = tasks.filter(
    (task) =>
      (task.parentType === "dossier" &&
        clientDossiers.some((d) => d.id === task.dossierId)) ||
      (task.parentType === "case" &&
        clientCases.some((c) => c.id === task.caseId))
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

    warnings.push(
      `This client has ${clientTasks.length} task${
        clientTasks.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for sessions under client dossiers/cases
  const clientSessions = sessions.filter(
    (session) =>
      clientDossiers.some((d) => d.id === session.dossierId) ||
      clientCases.some((c) => c.id === session.caseId)
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

    warnings.push(
      `This client has ${clientSessions.length} session${
        clientSessions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for missions under client dossiers/cases
  const clientMissions = missions.filter(
    (mission) =>
      (mission.entityType === "dossier" &&
        clientDossiers.some((d) => d.id === mission.entityId)) ||
      (mission.entityType === "case" &&
        clientCases.some((c) => c.id === mission.entityId))
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

    warnings.push(
      `This client has ${clientMissions.length} mission${
        clientMissions.length > 1 ? "s" : ""
      } that will be deleted.`
    );
  }

  // Check for financial entries
  const clientFinancials = financialLedger.filter(
    (entry) => entry.clientId === clientId && entry.status !== "void"
  );

  if (clientFinancials.length > 0) {
    affectedEntities.push({
      type: "financialEntries",
      count: clientFinancials.length,
      items: clientFinancials.slice(0, 5).map((e) => ({
        id: e.id,
        label: `${e.description} - ${e.amount} TND`,
      })),
    });

    warnings.push(
      `This client has ${clientFinancials.length} financial ${
        clientFinancials.length > 1 ? "entries" : "entry"
      } that will be deleted.`
    );
  }

  // If there are affected entities, require force delete instead of blocking
  if (affectedEntities.length > 0) {
    const totalCount = affectedEntities.reduce((sum, e) => sum + e.count, 0);
    return {
      allowed: false,
      blockers: [],
      warnings,
      requiresForceDelete: true,
      affectedEntities,
      forceDeleteMessage: `⚠️ Warning: Deleting this client will also delete ${totalCount} linked entit${
        totalCount > 1 ? "ies" : "y"
      } (dossiers, cases, tasks, sessions, missions, financial entries). This action is irreversible.`,
    };
  }

  return { allowed: true, blockers: [], warnings: [] };
}

/**
 * Validate status change for Client
 */
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
      "Modification prohibited from Accounting screen\n\nThe Accounting screen is a read-only reconciliation surface.\nModifications must be made from the entity's dedicated screen:\n  • Clients → Clients Menu\n  • Dossiers → Dossiers Menu\n  • Cases → Cases Menu\n  • Bailiffs → Bailiffs Menu\n\nYou can click on the entity name to access it directly.",
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
  const cases = context?.entities?.cases || mockCases || [];

  // Get parent info from context (formData for new tasks)
  const parentType = context?.formData?.parentType || context?.data?.parentType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const caseId = context?.formData?.caseId || context?.data?.caseId;

  // If no parent specified and no dossiers exist, block creation
  if (!dossierId && !caseId && dossiers.length === 0) {
    blockers.push("Please add a Dossier before creating a task.");
    return { allowed: false, blockers, warnings: [] };
  }

  // Check parent based on type
  if (parentType === "dossier" && dossierId) {
    const dossier =
      dossiers.find((d) => d.id === parseInt(dossierId)) ||
      mockDossiersExtended[dossierId];
    if (!dossier) {
      warnings.push("Parent Dossier not resolved (check after saving).");
    }

    if (
      dossier &&
      (dossier.status === "Closed")
    ) {
      blockers.push(
        `Cannot create a task under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to add tasks`
      );
    }
  } else if (parentType === "case" && caseId) {
    const caseData =
      cases.find((c) => c.id === parseInt(caseId)) || mockCasesExtended[caseId];
    if (!caseData) {
      warnings.push("Parent case not resolved (check after saving).");
    }

    if (
      caseData &&
      (caseData.status === "Closed")
    ) {
      blockers.push(
        `Cannot create a task under a ${caseData.status.toLowerCase()} case`,
        `Case: ${caseData.caseNumber} - ${caseData.title}`,
        `You must first reopen the case to add tasks`
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
  const task = context.data || [].find((t) => t.id === taskId);
  if (!task) {
    return { allowed: false, blockers: ["Task not found"], warnings: [] };
  }

  // Check parent entity status
  if (task.parentType === "dossier" && task.dossierId) {
    const dossier = mockDossiersExtended[task.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This task belongs to Dossier "${
          dossier.caseNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nModifications are no longer allowed on closed Dossiers.`
      );
    }
  } else if (task.parentType === "case" && task.caseId) {
    const caseData = mockCasesExtended[task.caseId];
    if (caseData && caseData.status === "Closed") {
      blockers.push(
        `This task belongs to case "${caseData.caseNumber}" which is closed.\n\nModifications are no longer allowed on closed cases.`
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
  const cases = context?.entities?.cases || mockCases || [];

  // Get parent info from context
  const linkType = context?.formData?.linkType || context?.data?.linkType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const caseId = context?.formData?.caseId || context?.data?.caseId;

  // If no parent specified and no dossiers exist, block creation
  if (!dossierId && !caseId && dossiers.length === 0) {
    blockers.push("Please add a Dossier before scheduling a hearing.");
    return { allowed: false, blockers, warnings: [] };
  }

  // Check based on link type
  if (linkType === "dossier" && dossierId) {
    const dossier =
      dossiers.find((d) => d.id === parseInt(dossierId)) ||
      mockDossiersExtended[dossierId];
    if (!dossier) {
      // Allow submit to avoid blocking on newly created/unsynced dossier ids
      warnings.push("Parent Dossier not resolved (check after saving).");
    }

    if (
      dossier &&
      (dossier.status === "Closed")
    ) {
      blockers.push(
        `Cannot create a session under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to add sessions`
      );
    }
  } else if (linkType === "case" && caseId) {
    const caseData =
      cases.find((c) => c.id === parseInt(caseId)) || mockCasesExtended[caseId];
    if (!caseData) {
      warnings.push("Parent case not resolved (check after saving).");
    }

    if (
      caseData &&
      (caseData.status === "Closed")
    ) {
      blockers.push(
        `Cannot create a session under a ${caseData.status.toLowerCase()} case`,
        `Case: ${caseData.caseNumber} - ${caseData.title}`,
        `You must first reopen the case to add sessions`
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
  const session = context.data || [].find((s) => s.id === sessionId);
  if (!session) {
    return { allowed: false, blockers: ["Session not found"], warnings: [] };
  }

  // Check if linked to a Procès
  if (session.caseId) {
    const caseData = mockCasesExtended[session.caseId];
    if (caseData && caseData.status === "Closed") {
      blockers.push(
        `This session belongs to case "${caseData.caseNumber}" which is closed.\n\nModifications are no longer allowed on closed cases.`
      );
    }
  }

  // Check if linked directly to a Dossier
  if (session.dossierId) {
    const dossier = mockDossiersExtended[session.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This session belongs to Dossier "${
          dossier.caseNumber
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

  // Get parent info from context
  const entityType = context?.formData?.entityType || context?.data?.entityType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const caseId = context?.formData?.caseId || context?.data?.caseId;

  // Check based on entity type
  if (entityType === "dossier" && dossierId) {
    const dossier = mockDossiersExtended[dossierId];
    if (!dossier) {
      return {
        allowed: false,
        blockers: ["Parent Dossier not found"],
        warnings: [],
      };
    }

    if (dossier.status === "Closed") {
      blockers.push(
        `Cannot create a mission under a ${dossier.status.toLowerCase()} Dossier`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `You must first reopen the Dossier to create missions`
      );
    }
  } else if (entityType === "case" && caseId) {
    const caseData = mockCasesExtended[caseId];
    if (!caseData) {
      return {
        allowed: false,
        blockers: ["Parent case not found"],
        warnings: [],
      };
    }

    if (caseData.status === "Closed") {
      blockers.push(
        `Cannot create a mission under a ${caseData.status.toLowerCase()} case`,
        `Case: ${caseData.caseNumber} - ${caseData.title}`,
        `You must first reopen the case to create missions`
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

  // Check parent entity based on entityType
  if (mission.entityType === "dossier") {
    // Find dossier by caseNumber (entityReference)
    const dossier = mockDossiers.find(
      (d) => d.caseNumber === mission.entityReference
    );

    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This mission is linked to Dossier "${
          dossier.caseNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nModifications are no longer allowed on closed Dossiers.`
      );
    }
  } else if (mission.entityType === "case") {
    // Find case by caseNumber (entityReference)
    const caseData = mockCases.find(
      (c) => c.caseNumber === mission.entityReference
    );

    if (caseData && caseData.status === "Closed") {
      blockers.push(
        `This mission is linked to case "${caseData.caseNumber}" which is closed.\n\nModifications are no longer allowed on closed cases.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting a Mission
 */
function validateMissionDelete(missionId, context = {}) {
  // Same rules as edit
  return validateMissionEdit(missionId, context);
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

  // Check if linked to a closed Dossier
  if (data.dossierId) {
    const dossier = mockDossiersExtended[data.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `Dossier "${
          dossier.caseNumber
        }" is ${dossier.status.toLowerCase()}.\n\nNo new financial entries can be added to closed Dossiers.`
      );
    }
  }

  // Check if linked to a closed Procès
  if (data.caseId) {
    const caseData = mockCasesExtended[data.caseId];
    if (caseData && caseData.status === "Closed") {
      blockers.push(
        `Case "${caseData.caseNumber}" is closed.\n\nNo new financial entries can be added to closed cases.`
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

  // Rule 1: Cannot edit paid/validated entries
  if (entry.status === "Payée" || entry.status === "paid") {
    blockers.push(
      "This financial entry is already paid.\n\nPaid entries cannot be modified to ensure financial integrity."
    );
  }

  // Rule 2: Check parent Dossier
  if (entry.dossierId) {
    const dossier = mockDossiersExtended[entry.dossierId];
    if (dossier && dossier.status === "Closed") {
      blockers.push(
        `This entry is linked to Dossier "${
          dossier.caseNumber
        }" which is ${dossier.status.toLowerCase()}.\n\nEntries from closed Dossiers cannot be modified.`
      );
    }
  }

  // Rule 3: Check parent Procès
  if (entry.caseId) {
    const caseData = mockCasesExtended[entry.caseId];
    if (caseData && caseData.status === "Closed") {
      blockers.push(
        `This entry is linked to case "${caseData.caseNumber}" which is closed.\n\nEntries from closed cases cannot be modified.`
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
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

  // Rule 1: Cannot delete paid entries
  if (entry.status === "Payée" || entry.status === "paid") {
    blockers.push(
      "This financial entry is paid.\n\nPaid entries cannot be deleted. You must create a corrective entry."
    );
  }

  // Use same parent checks as edit
  const editValidation = validateFinancialEntryEdit(entryId, context);
  if (!editValidation.allowed) {
    blockers.push(...editValidation.blockers);
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate changing Financial Entry status
 *
 * Business Rule (PHASE 2):
 * - Same rules as edit
 */
function validateFinancialEntryStatusChange(entryId, context = {}) {
  // Allow marking as paid even if parent is closed (business requirement)
  // But still check if entry is already paid
  const blockers = [];
  const warnings = [];

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

  // If trying to change FROM paid status, block it
  if (entry.status === "Payée" || entry.status === "paid") {
    if (newValue !== "Payée" && newValue !== "paid") {
      blockers.push(
        "This entry is already marked as paid.\n\nPaid entries cannot be reverted to a previous status."
      );
    }
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
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

  // No specific business rules defined yet for officer editing
  // Officers are generally editable unless specific constraints are identified

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate deleting an Officer (Huissier)
 *
 * Business Rules:
 * - Cannot delete if officer has active missions
 * - Cannot delete if officer has financial entries
 */
function validateOfficerDelete(officerId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Check for active missions
  const activeMissions = getAllMissions().filter(
    (m) => m.officerId === officerId && m.status !== "Terminé"
  );

  if (activeMissions.length > 0) {
    blockers.push(
      `This bailiff has ${activeMissions.length} active mission(s).\n\nYou must first complete or reassign these missions before deleting the bailiff.`
    );
  }

  // Check for financial entries linked to missions assigned to this officer
  const missionsWithOfficer = getAllMissions().filter(
    (m) => m.officerId === officerId
  );
  const missionIds = missionsWithOfficer.map((m) => m.id);
  const financialEntries = financialLedger.filter(
    (e) => missionIds.includes(e.missionId) && e.status !== "cancelled"
  );
  if (financialEntries.length > 0) {
    blockers.push(
      `This bailiff is linked to ${financialEntries.length} financial entr${
        financialEntries.length > 1 ? "ies" : "y"
      } via their missions.\n\nDeleting a bailiff with existing entries would compromise data integrity.`
    );
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
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
 * Calculate client financial balance
 *
 * @param {number} clientId - Client ID
 * @param {Array} entriesOverride - Optional financial entries to use instead of the global ledger
 * @returns {object} { totalInvoiced, totalPaid, balance }
 */
function getClientFinancials(clientId, entriesOverride = null) {
  const ledger = entriesOverride || financialLedger || [];
  const paidStatuses = ["paid", "payé", "payée"];
  const clientEntries = ledger.filter(
    (entry) =>
      entry.clientId === clientId &&
      entry.status !== "void" &&
      entry.status !== "cancelled"
  );

  let totalInvoiced = 0;
  let totalPaid = 0;

  clientEntries.forEach((entry) => {
    const amount = entry.amount || 0;

    if (paidStatuses.includes((entry.status || "").toLowerCase())) {
      totalPaid += amount;
    }

    totalInvoiced += amount;
  });

  return {
    totalInvoiced,
    totalPaid,
    balance: totalPaid - totalInvoiced, // Negative means client owes money
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
