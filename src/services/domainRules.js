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

import {
  mockDossiersExtended,
  mockCasesExtended,
  mockClientsExtended,
  mockClients,
  mockDossiers,
  mockTasks,
  mockCases,
  mockSessions,
  getAllMissions,
  mockOfficers,
  mockOfficersExtended,
} from "../utils/mockData";
import { financialLedger } from "../utils/financialData";
import { validateTemporalConstraints } from "./temporalValidation";

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
        blockers: ["Une erreur inattendue s'est produite. Veuillez réessayer."],
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
      field: "Numéro de mission",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        "• La référence de la mission sera modifiée",
        "• Tous les documents et rapports devront être mis à jour",
        "• Les écritures comptables conserveront la nouvelle référence",
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
        field: "Huissier",
        from: oldOfficer?.name,
        to: newOfficer?.name,
        impact: [
          "• La mission sera retirée de l'huissier actuel",
          "• La responsabilité de suivi changera",
          "• L'historique de la mission sera préservé",
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
        "• La référence du dossier sera modifiée",
        "• Tous les procès liés conserveront leur lien avec ce dossier",
        "• Les documents et rapports devront être mis à jour",
        "• Les écritures comptables conserveront la nouvelle référence",
      ],
    });
  }

  // Check for client reassignment
  if ("clientId" in newData) {
    const clientIdChanged = currentData.clientId != newData.clientId;

    if (clientIdChanged) {
      // Get client names for better UX
      const oldClient = mockClients.find((c) => c.id == currentData.clientId);
      const newClient = mockClients.find((c) => c.id == newData.clientId);

      changes.push({
        type: "client_reassignment",
        field: "Client",
        from: oldClient?.name,
        to: newClient?.name,
        impact: [
          "• Tous les procès liés resteront attachés à ce dossier",
          "• Les écritures comptables resteront associées au dossier",
          "• Le dossier apparaîtra désormais sous le nouveau client",
          "• Les indicateurs de suivi seront recalculés",
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
      field: "Numéro de procès",
      from: currentData[referenceField],
      to: newData[referenceField],
      impact: [
        "• La référence du procès sera modifiée",
        "• Toutes les séances liées conserveront leur lien avec ce procès",
        "• Les documents et rapports devront être mis à jour",
        "• Les écritures comptables conserveront la nouvelle référence",
      ],
    });
  }

  // Check for dossier reassignment
  if ("dossierId" in newData) {
    const dossierIdChanged = currentData.dossierId != newData.dossierId;

    if (dossierIdChanged) {
      // Get dossier info for better UX
      const oldDossier = mockDossiers.find(
        (d) => d.id == currentData.dossierId
      );
      const newDossier = mockDossiers.find((d) => d.id == newData.dossierId);

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
          "• Le client de rattachement pourra changer",
          "• Les écritures comptables seront agrégées sous le nouveau dossier",
          "• Les tâches et séances liées au procès seront déplacées",
          "• Les indicateurs de suivi seront recalculés",
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
  let oldParentLabel = "Non assignée";
  let newParentLabel = "Non assignée";

  if (currentData.parentType === "dossier" && currentData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == currentData.dossierId);
    oldParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  } else if (currentData.parentType === "case" && currentData.caseId) {
    const caseData = mockCases.find((c) => c.id == currentData.caseId);
    oldParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  }

  if (newData.parentType === "dossier" && newData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == newData.dossierId);
    newParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  } else if (newData.parentType === "case" && newData.caseId) {
    const caseData = mockCases.find((c) => c.id == newData.caseId);
    newParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  }

  const impactSummary = [
    `**Parent actuel** : ${oldParentLabel}`,
    `**Nouveau parent** : ${newParentLabel}`,
    "",
    "**Impact** :",
    "• La tâche sera retirée de son contexte actuel",
    "• Les indicateurs de suivi seront recalculés",
    "• L'historique de la tâche sera préservé",
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
  let oldParentLabel = "Non assignée";
  let newParentLabel = "Non assignée";

  if (currentData.caseId) {
    const caseData = mockCases.find((c) => c.id == currentData.caseId);
    oldParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  } else if (currentData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == currentData.dossierId);
    oldParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  }

  if (newData.caseId) {
    const caseData = mockCases.find((c) => c.id == newData.caseId);
    newParentLabel = `Procès ${caseData?.caseNumber || ""} - ${
      caseData?.title || ""
    }`;
  } else if (newData.dossierId) {
    const dossier = mockDossiers.find((d) => d.id == newData.dossierId);
    newParentLabel = `Dossier ${dossier?.caseNumber || ""} - ${
      dossier?.title || ""
    }`;
  }

  const impactSummary = [
    `**Rattachement actuel** : ${oldParentLabel}`,
    `**Nouveau rattachement** : ${newParentLabel}`,
    "",
    "**Impact** :",
    "• L'audience sera retirée de son contexte actuel",
    "• Les indicateurs de suivi seront recalculés",
    "• L'historique de l'audience sera préservé",
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
    close: validateDossierClose,
    archive: validateDossierArchive,
    delete: validateDossierDelete,
    changeStatus: validateDossierStatusChange,
  },
  case: {
    add: validateCaseAdd, // NEW: Prevent creating procès under closed dossier
    close: validateCaseClose,
    delete: validateCaseDelete,
    changeStatus: validateCaseStatusChange,
  },
  client: {
    archive: validateClientArchive,
    delete: validateClientDelete,
    changeStatus: validateClientStatusChange,
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
 * Validate closing a Dossier
 *
 * Business Rules:
 * - Cannot close if any related Task is not "Terminée"
 * - Cannot close if any related Procès is not "Clos"
 * - Cannot close if client has unpaid balance
 * - Cannot close if any active Huissier mission exists
 */
function validateDossierClose(dossierId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Fetch dossier data
  const dossier = mockDossiersExtended[dossierId];
  if (!dossier) {
    return { allowed: false, blockers: ["Dossier introuvable"], warnings: [] };
  }

  // Rule 1: Check for open tasks
  const dossierTasks = mockTasks.filter(
    (task) =>
      (task.parentType === "dossier" && task.dossierId === dossierId) ||
      (task.parentType === "case" &&
        dossier.proceedings?.some((proc) => proc.id === task.caseId))
  );

  const incompleteTasks = dossierTasks.filter(
    (task) => task.status !== "Terminée"
  );

  if (incompleteTasks.length > 0) {
    blockers.push(
      `${incompleteTasks.length} tâche${
        incompleteTasks.length > 1 ? "s" : ""
      } non terminée${incompleteTasks.length > 1 ? "s" : ""} :` +
        incompleteTasks
          .slice(0, 3)
          .map((t) => `\n  • ${t.title} (${t.status})`)
          .join("") +
        (incompleteTasks.length > 3
          ? `\n  • ... et ${incompleteTasks.length - 3} autre${
              incompleteTasks.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for open Procès (cases)
  const openCases =
    dossier.proceedings?.filter(
      (proc) => proc.status !== "Clos" && proc.status !== "Terminé"
    ) || [];

  if (openCases.length > 0) {
    blockers.push(
      `${openCases.length} procès non clos :` +
        openCases
          .slice(0, 3)
          .map((c) => `\n  • ${c.caseNumber} - ${c.title} (${c.status})`)
          .join("") +
        (openCases.length > 3
          ? `\n  • ... et ${openCases.length - 3} autre${
              openCases.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 3: Check for unpaid client balance
  const clientFinancials = getClientFinancials(dossier.clientId);
  if (clientFinancials.balance < 0) {
    blockers.push(
      `Solde client impayé : ${Math.abs(clientFinancials.balance).toFixed(
        2
      )} TND`
    );
  }

  // Rule 4: Check for active Huissier missions
  const allMissions = getAllMissions();
  const dossierMissions = allMissions.filter(
    (mission) =>
      mission.entityType === "dossier" &&
      mission.entityReference === dossier.caseNumber &&
      mission.status !== "Terminée" &&
      mission.status !== "Annulée"
  );

  if (dossierMissions.length > 0) {
    blockers.push(
      `${dossierMissions.length} mission${
        dossierMissions.length > 1 ? "s" : ""
      } d'huissier en cours :` +
        dossierMissions
          .slice(0, 3)
          .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
          .join("") +
        (dossierMissions.length > 3
          ? `\n  • ... et ${dossierMissions.length - 3} autre${
              dossierMissions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Warnings (non-blocking)
  if (dossier.documents && dossier.documents.length === 0) {
    warnings.push("Aucun document n'a été ajouté à ce dossier");
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

  const dossier = mockDossiersExtended[dossierId];
  if (!dossier) {
    return { allowed: false, blockers: ["Dossier introuvable"], warnings: [] };
  }

  // Check for related Procès
  if (dossier.proceedings && dossier.proceedings.length > 0) {
    blockers.push(
      `Ce dossier contient ${dossier.proceedings.length} procès. Veuillez d'abord les supprimer.`
    );
  }

  // Check for related Tasks
  const dossierTasks = mockTasks.filter(
    (task) => task.parentType === "dossier" && task.dossierId === dossierId
  );

  if (dossierTasks.length > 0) {
    blockers.push(
      `Ce dossier contient ${dossierTasks.length} tâche${
        dossierTasks.length > 1 ? "s" : ""
      }. Veuillez d'abord les supprimer.`
    );
  }

  // Check for financial entries
  const dossierFinancials = financialLedger.filter(
    (entry) => entry.dossierId === dossierId && entry.status !== "cancelled"
  );

  if (dossierFinancials.length > 0) {
    blockers.push(
      `Ce dossier a ${dossierFinancials.length} écriture${
        dossierFinancials.length > 1 ? "s" : ""
      } comptable${
        dossierFinancials.length > 1 ? "s" : ""
      }. Suppression impossible.`
    );
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate status change for Dossier
 *
 * Specific validation when changing status to "Fermé"
 */
function validateDossierStatusChange(dossierId, context = {}) {
  const { newValue } = context;

  if (newValue === "Fermé" || newValue === "Clos") {
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

  // Get the parent dossier ID from context
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;

  if (!dossierId) {
    // No parent validation needed if no dossier specified
    return { allowed: true, blockers: [], warnings: [] };
  }

  // Check if parent dossier is closed
  const dossier = mockDossiersExtended[dossierId];
  if (!dossier) {
    return {
      allowed: false,
      blockers: ["Dossier parent introuvable"],
      warnings: [],
    };
  }

  if (dossier.status === "Fermé" || dossier.status === "Archivé") {
    blockers.push(
      `Impossible de créer un procès sous un dossier ${dossier.status.toLowerCase()}`,
      `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
      `Vous devez d'abord rouvrir le dossier pour ajouter des procès`
    );
  }

  const allowed = blockers.length === 0;
  return { allowed, blockers, warnings };
}

/**
 * Validate closing a Procès
 *
 * Business Rules:
 * - Cannot close if any related Séance is upcoming or not completed
 * - Cannot close if any related Task is not "Terminée"
 */
function validateCaseClose(caseId, context = {}) {
  const blockers = [];
  const warnings = [];

  // Fetch case data
  const caseData = mockCasesExtended[caseId];
  if (!caseData) {
    return { allowed: false, blockers: ["Procès introuvable"], warnings: [] };
  }

  // Rule 1: Check for upcoming or incomplete Séances
  const caseSessions = mockSessions.filter(
    (session) => session.caseId === caseId
  );

  const today = new Date();
  const upcomingSessions = caseSessions.filter((session) => {
    const sessionDate = new Date(session.date);
    return (
      sessionDate >= today &&
      session.status !== "Terminée" &&
      session.status !== "Annulée"
    );
  });

  if (upcomingSessions.length > 0) {
    blockers.push(
      `${upcomingSessions.length} séance${
        upcomingSessions.length > 1 ? "s" : ""
      } à venir ou non terminée${upcomingSessions.length > 1 ? "s" : ""} :` +
        upcomingSessions
          .slice(0, 3)
          .map((s) => `\n  • ${s.title} le ${s.date} (${s.status})`)
          .join("") +
        (upcomingSessions.length > 3
          ? `\n  • ... et ${upcomingSessions.length - 3} autre${
              upcomingSessions.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for open tasks
  const caseTasks = mockTasks.filter(
    (task) => task.parentType === "case" && task.caseId === caseId
  );

  const incompleteTasks = caseTasks.filter(
    (task) => task.status !== "Terminée"
  );

  if (incompleteTasks.length > 0) {
    blockers.push(
      `${incompleteTasks.length} tâche${
        incompleteTasks.length > 1 ? "s" : ""
      } non terminée${incompleteTasks.length > 1 ? "s" : ""} :` +
        incompleteTasks
          .slice(0, 3)
          .map((t) => `\n  • ${t.title} (${t.status})`)
          .join("") +
        (incompleteTasks.length > 3
          ? `\n  • ... et ${incompleteTasks.length - 3} autre${
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
      mission.status !== "Terminée" &&
      mission.status !== "Annulée"
  );

  if (caseMissions.length > 0) {
    blockers.push(
      `${caseMissions.length} mission${
        caseMissions.length > 1 ? "s" : ""
      } d'huissier en cours :` +
        caseMissions
          .slice(0, 3)
          .map((m) => `\n  • ${m.missionNumber} - ${m.title} (${m.status})`)
          .join("") +
        (caseMissions.length > 3
          ? `\n  • ... et ${caseMissions.length - 3} autre${
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

  const caseData = mockCasesExtended[caseId];
  if (!caseData) {
    return { allowed: false, blockers: ["Procès introuvable"], warnings: [] };
  }

  // Check for related Séances
  const caseSessions = mockSessions.filter(
    (session) => session.caseId === caseId
  );

  if (caseSessions.length > 0) {
    blockers.push(
      `Ce procès contient ${caseSessions.length} séance${
        caseSessions.length > 1 ? "s" : ""
      }. Veuillez d'abord les supprimer.`
    );
  }

  // Check for related Tasks
  const caseTasks = mockTasks.filter(
    (task) => task.parentType === "case" && task.caseId === caseId
  );

  if (caseTasks.length > 0) {
    blockers.push(
      `Ce procès contient ${caseTasks.length} tâche${
        caseTasks.length > 1 ? "s" : ""
      }. Veuillez d'abord les supprimer.`
    );
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate status change for Procès
 */
function validateCaseStatusChange(caseId, context = {}) {
  const { newValue } = context;

  if (newValue === "Clos" || newValue === "Terminé") {
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

  const client = mockClientsExtended[clientId];
  if (!client) {
    return { allowed: false, blockers: ["Client introuvable"], warnings: [] };
  }

  // Rule 1: Check for open Dossiers
  const clientDossiers = client.relatedDossiers || [];
  const openDossiers = clientDossiers.filter(
    (d) => d.status !== "Fermé" && d.status !== "Clos"
  );

  if (openDossiers.length > 0) {
    blockers.push(
      `${openDossiers.length} dossier${
        openDossiers.length > 1 ? "s" : ""
      } encore ouvert${openDossiers.length > 1 ? "s" : ""} :` +
        openDossiers
          .slice(0, 3)
          .map((d) => `\n  • ${d.caseNumber} - ${d.title} (${d.status})`)
          .join("") +
        (openDossiers.length > 3
          ? `\n  • ... et ${openDossiers.length - 3} autre${
              openDossiers.length - 3 > 1 ? "s" : ""
            }`
          : "")
    );
  }

  // Rule 2: Check for unpaid balance
  const clientFinancials = getClientFinancials(clientId);
  if (clientFinancials.balance < 0) {
    blockers.push(
      `Solde impayé : ${Math.abs(clientFinancials.balance).toFixed(2)} TND`
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

  const client = mockClientsExtended[clientId];
  if (!client) {
    return { allowed: false, blockers: ["Client introuvable"], warnings: [] };
  }

  // Check for related Dossiers
  const clientDossiers = client.relatedDossiers || [];
  if (clientDossiers.length > 0) {
    blockers.push(
      `Ce client a ${clientDossiers.length} dossier${
        clientDossiers.length > 1 ? "s" : ""
      }. Veuillez d'abord les supprimer.`
    );
  }

  // Check for financial entries
  const clientFinancials = financialLedger.filter(
    (entry) => entry.clientId === clientId && entry.status !== "cancelled"
  );

  if (clientFinancials.length > 0) {
    blockers.push(
      `Ce client a ${clientFinancials.length} écriture${
        clientFinancials.length > 1 ? "s" : ""
      } comptable${
        clientFinancials.length > 1 ? "s" : ""
      }. Suppression impossible.`
    );
  }

  const allowed = blockers.length === 0;

  return { allowed, blockers, warnings };
}

/**
 * Validate status change for Client
 */
function validateClientStatusChange(clientId, context = {}) {
  const { newValue } = context;

  if (newValue === "Inactif" || newValue === "Archivé") {
    return validateClientArchive(clientId, context);
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
      "Modification interdite depuis l'écran Comptabilité\n\nL'écran Comptabilité est une surface de consultation et de réconciliation.\nLes modifications doivent être effectuées depuis l'écran de l'entité concernée :\n  • Clients → Menu Clients\n  • Dossiers → Menu Dossiers\n  • Procès → Menu Procès\n  • Huissiers → Menu Huissiers\n\nVous pouvez cliquer sur le nom de l'entité pour y accéder directement.",
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

  // Get parent info from context (formData for new tasks)
  const parentType = context?.formData?.parentType || context?.data?.parentType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const caseId = context?.formData?.caseId || context?.data?.caseId;

  // Check parent based on type
  if (parentType === "dossier" && dossierId) {
    const dossier = mockDossiersExtended[dossierId];
    if (!dossier) {
      return {
        allowed: false,
        blockers: ["Dossier parent introuvable"],
        warnings: [],
      };
    }

    if (dossier.status === "Fermé" || dossier.status === "Archivé") {
      blockers.push(
        `Impossible de créer une tâche sous un dossier ${dossier.status.toLowerCase()}`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `Vous devez d'abord rouvrir le dossier pour ajouter des tâches`
      );
    }
  } else if (parentType === "case" && caseId) {
    const caseData = mockCasesExtended[caseId];
    if (!caseData) {
      return {
        allowed: false,
        blockers: ["Procès parent introuvable"],
        warnings: [],
      };
    }

    if (caseData.status === "Clos" || caseData.status === "Terminé") {
      blockers.push(
        `Impossible de créer une tâche sous un procès ${caseData.status.toLowerCase()}`,
        `Procès: ${caseData.caseNumber} - ${caseData.title}`,
        `Vous devez d'abord rouvrir le procès pour ajouter des tâches`
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
 * - Cannot edit if parent Dossier is Fermé
 * - Cannot edit if parent Procès is Clos
 */
function validateTaskEdit(taskId, context = {}) {
  const blockers = [];
  const warnings = [];

  // ✅ Use provided task data if available, otherwise look it up
  const task = context.data || mockTasks.find((t) => t.id === taskId);
  if (!task) {
    return { allowed: false, blockers: ["Tâche introuvable"], warnings: [] };
  }

  // Check parent entity status
  if (task.parentType === "dossier" && task.dossierId) {
    const dossier = mockDossiersExtended[task.dossierId];
    if (dossier && (dossier.status === "Fermé" || dossier.status === "Clos")) {
      blockers.push(
        `Cette tâche appartient au dossier "${
          dossier.caseNumber
        }" qui est ${dossier.status.toLowerCase()}.\n\nLes modifications ne sont plus autorisées sur les dossiers fermés.`
      );
    }
  } else if (task.parentType === "case" && task.caseId) {
    const caseData = mockCasesExtended[task.caseId];
    if (caseData && caseData.status === "Clos") {
      blockers.push(
        `Cette tâche appartient au procès "${caseData.caseNumber}" qui est clos.\n\nLes modifications ne sont plus autorisées sur les procès clos.`
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

  // Get parent info from context
  const linkType = context?.formData?.linkType || context?.data?.linkType;
  const dossierId = context?.formData?.dossierId || context?.data?.dossierId;
  const caseId = context?.formData?.caseId || context?.data?.caseId;

  // Check based on link type
  if (linkType === "dossier" && dossierId) {
    const dossier = mockDossiersExtended[dossierId];
    if (!dossier) {
      return {
        allowed: false,
        blockers: ["Dossier parent introuvable"],
        warnings: [],
      };
    }

    if (dossier.status === "Fermé" || dossier.status === "Archivé") {
      blockers.push(
        `Impossible de créer une séance sous un dossier ${dossier.status.toLowerCase()}`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `Vous devez d'abord rouvrir le dossier pour ajouter des séances`
      );
    }
  } else if (linkType === "case" && caseId) {
    const caseData = mockCasesExtended[caseId];
    if (!caseData) {
      return {
        allowed: false,
        blockers: ["Procès parent introuvable"],
        warnings: [],
      };
    }

    if (caseData.status === "Clos" || caseData.status === "Terminé") {
      blockers.push(
        `Impossible de créer une séance sous un procès ${caseData.status.toLowerCase()}`,
        `Procès: ${caseData.caseNumber} - ${caseData.title}`,
        `Vous devez d'abord rouvrir le procès pour ajouter des séances`
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
 * - Cannot edit if parent Procès is Clos
 * - Cannot edit if parent Dossier is Fermé
 */
function validateSessionEdit(sessionId, context = {}) {
  const blockers = [];
  const warnings = [];

  // ✅ Use provided session data if available, otherwise look it up
  const session = context.data || mockSessions.find((s) => s.id === sessionId);
  if (!session) {
    return { allowed: false, blockers: ["Séance introuvable"], warnings: [] };
  }

  // Check if linked to a Procès
  if (session.caseId) {
    const caseData = mockCasesExtended[session.caseId];
    if (caseData && caseData.status === "Clos") {
      blockers.push(
        `Cette séance appartient au procès "${caseData.caseNumber}" qui est clos.\n\nLes modifications ne sont plus autorisées sur les procès clos.`
      );
    }
  }

  // Check if linked directly to a Dossier
  if (session.dossierId) {
    const dossier = mockDossiersExtended[session.dossierId];
    if (dossier && (dossier.status === "Fermé" || dossier.status === "Clos")) {
      blockers.push(
        `Cette séance appartient au dossier "${
          dossier.caseNumber
        }" qui est ${dossier.status.toLowerCase()}.\n\nLes modifications ne sont plus autorisées sur les dossiers fermés.`
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
        blockers: ["Dossier parent introuvable"],
        warnings: [],
      };
    }

    if (dossier.status === "Fermé" || dossier.status === "Archivé") {
      blockers.push(
        `Impossible de créer une mission sous un dossier ${dossier.status.toLowerCase()}`,
        `Dossier: ${dossier.caseNumber} - ${dossier.title}`,
        `Vous devez d'abord rouvrir le dossier pour créer des missions`
      );
    }
  } else if (entityType === "case" && caseId) {
    const caseData = mockCasesExtended[caseId];
    if (!caseData) {
      return {
        allowed: false,
        blockers: ["Procès parent introuvable"],
        warnings: [],
      };
    }

    if (caseData.status === "Clos" || caseData.status === "Terminé") {
      blockers.push(
        `Impossible de créer une mission sous un procès ${caseData.status.toLowerCase()}`,
        `Procès: ${caseData.caseNumber} - ${caseData.title}`,
        `Vous devez d'abord rouvrir le procès pour créer des missions`
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
 * - Cannot edit if linked Dossier is Fermé
 * - Cannot edit if linked Procès is Clos
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
    return { allowed: false, blockers: ["Mission introuvable"], warnings: [] };
  }

  // Check parent entity based on entityType
  if (mission.entityType === "dossier") {
    // Find dossier by caseNumber (entityReference)
    const dossier = Object.values(mockDossiersExtended).find(
      (d) => d.caseNumber === mission.entityReference
    );

    if (dossier && (dossier.status === "Fermé" || dossier.status === "Clos")) {
      blockers.push(
        `Cette mission est liée au dossier "${
          dossier.caseNumber
        }" qui est ${dossier.status.toLowerCase()}.\n\nLes modifications ne sont plus autorisées sur les dossiers fermés.`
      );
    }
  } else if (mission.entityType === "case") {
    // Find case by caseNumber (entityReference)
    const caseData = Object.values(mockCasesExtended).find(
      (c) => c.caseNumber === mission.entityReference
    );

    if (caseData && caseData.status === "Clos") {
      blockers.push(
        `Cette mission est liée au procès "${caseData.caseNumber}" qui est clos.\n\nLes modifications ne sont plus autorisées sur les procès clos.`
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
 * - Cannot add if related Dossier is Fermé
 * - Cannot add if related Procès is Clos
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
    if (dossier && (dossier.status === "Fermé" || dossier.status === "Clos")) {
      blockers.push(
        `Le dossier "${
          dossier.caseNumber
        }" est ${dossier.status.toLowerCase()}.\n\nAucune nouvelle écriture comptable ne peut être ajoutée aux dossiers fermés.`
      );
    }
  }

  // Check if linked to a closed Procès
  if (data.caseId) {
    const caseData = mockCasesExtended[data.caseId];
    if (caseData && caseData.status === "Clos") {
      blockers.push(
        `Le procès "${caseData.caseNumber}" est clos.\n\nAucune nouvelle écriture comptable ne peut être ajoutée aux procès clos.`
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
function validateFinancialEntryEdit(entryId, context = {}) {
  const blockers = [];
  const warnings = [];

  const entry = financialLedger.find((e) => e.id === entryId);
  if (!entry) {
    return {
      allowed: false,
      blockers: ["Écriture comptable introuvable"],
      warnings: [],
    };
  }

  // Rule 1: Cannot edit paid/validated entries
  if (entry.status === "Payée" || entry.status === "paid") {
    blockers.push(
      "Cette écriture comptable est déjà payée.\n\nLes écritures payées ne peuvent plus être modifiées pour garantir l'intégrité financière."
    );
  }

  // Rule 2: Check parent Dossier
  if (entry.dossierId) {
    const dossier = mockDossiersExtended[entry.dossierId];
    if (dossier && (dossier.status === "Fermé" || dossier.status === "Clos")) {
      blockers.push(
        `Cette écriture est liée au dossier "${
          dossier.caseNumber
        }" qui est ${dossier.status.toLowerCase()}.\n\nLes écritures des dossiers fermés ne peuvent plus être modifiées.`
      );
    }
  }

  // Rule 3: Check parent Procès
  if (entry.caseId) {
    const caseData = mockCasesExtended[entry.caseId];
    if (caseData && caseData.status === "Clos") {
      blockers.push(
        `Cette écriture est liée au procès "${caseData.caseNumber}" qui est clos.\n\nLes écritures des procès clos ne peuvent plus être modifiées.`
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

  const entry = financialLedger.find((e) => e.id === entryId);
  if (!entry) {
    return {
      allowed: false,
      blockers: ["Écriture comptable introuvable"],
      warnings: [],
    };
  }

  // Rule 1: Cannot delete paid entries
  if (entry.status === "Payée" || entry.status === "paid") {
    blockers.push(
      "Cette écriture comptable est payée.\n\nLes écritures payées ne peuvent pas être supprimées. Vous devez créer une écriture de correction."
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

  const entry = financialLedger.find((e) => e.id === entryId);
  if (!entry) {
    return {
      allowed: false,
      blockers: ["Écriture comptable introuvable"],
      warnings: [],
    };
  }

  const { newValue } = context;

  // If trying to change FROM paid status, block it
  if (entry.status === "Payée" || entry.status === "paid") {
    if (newValue !== "Payée" && newValue !== "paid") {
      blockers.push(
        "Cette écriture est déjà marquée comme payée.\n\nLes écritures payées ne peuvent pas être ramenées à un statut antérieur."
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
      `Cet huissier a ${activeMissions.length} mission(s) active(s).\n\nVous devez d'abord terminer ou réassigner ces missions avant de supprimer l'huissier.`
    );
  }

  // Check for financial entries
  const financialEntries = financialLedger.filter(
    (e) => e.officerId === officerId && e.status !== "cancelled"
  );
  if (financialEntries.length > 0) {
    blockers.push(
      `Cet huissier est lié à ${financialEntries.length} écriture(s) comptable(s).\n\nLa suppression d'un huissier avec des écritures existantes compromettrait l'intégrité des données.`
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
 * @returns {object} { totalInvoiced, totalPaid, balance }
 */
function getClientFinancials(clientId) {
  const clientEntries = financialLedger.filter(
    (entry) => entry.clientId === clientId && entry.status !== "cancelled"
  );

  let totalInvoiced = 0;
  let totalPaid = 0;

  clientEntries.forEach((entry) => {
    const amount = entry.amount || 0;

    if (entry.status === "paid") {
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
    "Cette action ne peut pas être effectuée pour les raisons suivantes :\n\n";
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

  const header = "Attention :\n\n";
  const body = warnings.map((warning) => `⚠ ${warning}`).join("\n");

  return header + body;
}

// Export all validators for testing
export const validators = VALIDATORS;
